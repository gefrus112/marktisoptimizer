//! Marktis Optimizer — Rust + Tauri v2 Windows client.
//!
//! The primary Tauri desktop client has its own standalone UI. It detects
//! whether Roblox is installed on first launch, reports process-name-only
//! Player presence, checks a short list of executor process names locally,
//! and manages allowlisted FastFlags via reversible ClientAppSettings.json writes.
//!
//! No injection, memory access, telemetry disabling, anti-cheat bypass, automatic
//! process termination, file deletion, or game script execution. See safety.rs,
//! settings.rs, and detect.rs for the safety boundaries.

mod detect;
mod device;
mod safety;
mod session;
mod settings;

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub product: &'static str,
    pub version: &'static str,
    pub edition: &'static str,
    pub framework: &'static str,
    pub webview: &'static str,
    pub platform: &'static str,
    pub targets: &'static str,
    pub detects_roblox_on_launch: bool,
    pub allowlist_flags: usize,
    pub safety: AppSafety,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSafety {
    pub local_json_only: bool,
    pub process_names_only_scan: bool,
    pub network_requests: bool,
    pub network_probe_on_demand: bool,
    pub network_probe_endpoint: &'static str,
    pub probe_sends_payload: bool,
    pub full_antivirus: bool,
    pub automatic_process_termination: bool,
    pub automatic_software_removal: bool,
    pub injection: bool,
    pub memory_reads: bool,
    pub telemetry_disable: bool,
    pub anti_cheat_bypass: bool,
    pub game_script_execution: bool,
}

const ALLOWLIST_JSON: &str = include_str!(concat!(env!("OUT_DIR"), "/fastflags-allowlist.json"));
const LATEST_RELEASE_URL: &str = "https://github.com/gefrus112/marktisoptimizer/releases/latest";

fn flag_count() -> usize {
    serde_json::from_str::<serde_json::Value>(ALLOWLIST_JSON)
        .ok()
        .and_then(|v| v.get("categories").and_then(|c| c.as_array()).cloned())
        .map(|cats| {
            cats.iter()
                .filter_map(|c| c.get("flags").and_then(|f| f.as_array()))
                .map(|f| f.len())
                .sum()
        })
        .unwrap_or(0)
}

#[tauri::command]
fn app_info() -> AppInfo {
    AppInfo {
        product: "Marktis Optimizer",
        version: env!("CARGO_PKG_VERSION"),
        edition: "Windows Client",
        framework: "Rust + Tauri v2",
        webview: "Microsoft Edge WebView2",
        platform: "windows",
        targets: "ClientAppSettings.json (local, reversible)",
        detects_roblox_on_launch: true,
        allowlist_flags: flag_count(),
        safety: AppSafety {
            local_json_only: true,
            process_names_only_scan: true,
            network_requests: true,
            network_probe_on_demand: true,
            network_probe_endpoint: "www.roblox.com:443",
            probe_sends_payload: false,
            full_antivirus: false,
            automatic_process_termination: false,
            automatic_software_removal: false,
            injection: false,
            memory_reads: false,
            telemetry_disable: false,
            anti_cheat_bypass: false,
            game_script_execution: false,
        },
    }
}

#[tauri::command]
fn get_allowlist() -> serde_json::Value {
    serde_json::from_str(ALLOWLIST_JSON).unwrap_or(serde_json::json!({ "categories": [] }))
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// Open an external link in the system browser. Only http(s) URLs are allowed;
/// this never executes arbitrary commands or local paths.
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("http://") || trimmed.starts_with("https://")) {
        return Err("Only http(s) links can be opened.".to_string());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32")
            .args(["url.dll,FileProtocolHandler", trimmed])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let program = if cfg!(target_os = "macos") { "open" } else { "xdg-open" };
        std::process::Command::new(program)
            .arg(trimmed)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Open the fixed latest release page in the system browser. Updates are
/// downloaded and installed manually; the desktop app does not self-update.
#[tauri::command]
fn open_latest_release() -> Result<(), String> {
    open_external(LATEST_RELEASE_URL.to_string())
}

fn roblox_profile_url(user_id: &str) -> Result<String, String> {
    let id = user_id
        .trim()
        .parse::<u64>()
        .map_err(|_| "Enter a valid numeric Roblox User ID.".to_string())?;
    if id == 0 {
        return Err("Enter a positive numeric Roblox User ID.".to_string());
    }
    Ok(format!("https://www.roblox.com/users/{id}/profile"))
}

/// Open the official public Roblox profile for a user-supplied numeric ID in
/// the system browser. The app does not sign in, fetch, or scrape profile data.
#[tauri::command(rename_all = "camelCase")]
fn open_roblox_profile(user_id: String) -> Result<(), String> {
    open_external(roblox_profile_url(&user_id)?)
}

/// Ask Windows Explorer to dispatch the fixed Roblox protocol URI to its
/// registered handler. No user-supplied URL, shell command, or launch flags.
#[tauri::command]
fn launch_roblox() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let root = std::env::var_os("SystemRoot")
            .or_else(|| std::env::var_os("WINDIR"))
            .ok_or_else(|| "Windows system folder could not be located.".to_string())?;
        let root = std::path::PathBuf::from(root);
        if !root.is_absolute() {
            return Err("Windows system folder path is invalid.".to_string());
        }
        let explorer = root.join("explorer.exe");
        if !explorer.is_file() {
            return Err("Windows Explorer could not be found in the system folder.".to_string());
        }
        std::process::Command::new(explorer)
            .arg("roblox://")
            .spawn()
            .map_err(|error| format!("Could not request Roblox launch: {error}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Roblox launch is available in the Windows desktop app only.".to_string())
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_info,
            get_allowlist,
            exit_app,
            open_external,
            open_latest_release,
            open_roblox_profile,
            launch_roblox,
            detect::detect_roblox,
            device::device_snapshot,
            device::storage_snapshot,
            device::probe_roblox_latency,
            safety::scan_known_executor_processes,
            safety::open_windows_settings,
            session::active_roblox_status,
            settings::apply_settings,
            settings::restore_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Marktis Optimizer application");
}

#[cfg(test)]
mod profile_link_tests {
    use super::roblox_profile_url;

    #[test]
    fn profile_link_is_built_from_a_positive_numeric_id_only() {
        assert_eq!(
            roblox_profile_url("123456789").unwrap(),
            "https://www.roblox.com/users/123456789/profile"
        );
        assert_eq!(
            roblox_profile_url(" 00042 ").unwrap(),
            "https://www.roblox.com/users/42/profile"
        );
        assert!(roblox_profile_url("0").is_err());
        assert!(roblox_profile_url("123/../settings").is_err());
        assert!(roblox_profile_url("18446744073709551616").is_err());
    }
}
