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
mod vpn;
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
const WIREGUARD_DOWNLOAD_URL: &str = "https://www.wireguard.com/install/";
const COMMUNITY_DISCORD_URL: &str = "https://discord.gg/R3VC6E229";
const YOUTUBE_CHANNEL_URL: &str = "https://www.youtube.com/@butterguff";

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

/// Open the official WireGuard for Windows install page; the app does not ship
/// a provider account, VPN server, or bundled client binaries.
#[tauri::command]
fn open_wireguard_download() -> Result<(), String> {
    open_external(WIREGUARD_DOWNLOAD_URL.to_string())
}

/// Open the fixed project Discord invite in the system browser.
#[tauri::command]
fn open_community_discord() -> Result<(), String> {
    open_external(COMMUNITY_DISCORD_URL.to_string())
}

/// Open the fixed project YouTube channel in the system browser.
#[tauri::command]
fn open_youtube_channel() -> Result<(), String> {
    open_external(YOUTUBE_CHANNEL_URL.to_string())
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

fn roblox_server_uri(place_id: &str, game_instance_id: &str) -> Result<String, String> {
    let place_id = place_id
        .trim()
        .parse::<u64>()
        .map_err(|_| "Enter a valid numeric Roblox Place ID.".to_string())?;
    if place_id == 0 {
        return Err("Enter a positive numeric Roblox Place ID.".to_string());
    }
    let game_instance_id = game_instance_id.trim();
    let bytes = game_instance_id.as_bytes();
    let valid_uuid = bytes.len() == 36
        && bytes.iter().enumerate().all(|(index, byte)| {
            if [8, 13, 18, 23].contains(&index) {
                *byte == b'-'
            } else {
                byte.is_ascii_hexdigit()
            }
        });
    if !valid_uuid {
        return Err("Enter the exact server Job ID as a UUID.".to_string());
    }
    Ok(format!(
        "roblox://experiences/start?placeId={place_id}&gameInstanceId={game_instance_id}"
    ))
}

/// Dispatch only a fixed Roblox URI or a URI assembled from validated numeric
/// Place ID and UUID Job ID values. This never invokes a shell.
fn dispatch_roblox_uri(uri: &str) -> Result<(), String> {
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
            .arg(uri)
            .spawn()
            .map_err(|error| format!("Could not request Roblox launch: {error}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = uri;
        Err("Roblox launch is available in the Windows desktop app only.".to_string())
    }
}

/// Ask Windows Explorer to dispatch the standard Roblox protocol for a normal launch.
#[tauri::command]
fn launch_roblox() -> Result<(), String> {
    dispatch_roblox_uri("roblox://")
}

/// Rejoin only a user-supplied Place ID and server Job ID. The app never reads
/// the running game's session or server identifier.
#[tauri::command(rename_all = "camelCase")]
fn rejoin_roblox_server(place_id: String, game_instance_id: String) -> Result<(), String> {
    let uri = roblox_server_uri(&place_id, &game_instance_id)?;
    dispatch_roblox_uri(&uri)
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_info,
            get_allowlist,
            exit_app,
            open_external,
            open_latest_release,
            open_wireguard_download,
            open_community_discord,
            open_youtube_channel,
            open_roblox_profile,
            launch_roblox,
            rejoin_roblox_server,
            detect::detect_roblox,
            device::device_snapshot,
            device::storage_snapshot,
            device::probe_roblox_latency,
            safety::scan_known_executor_processes,
            safety::open_windows_settings,
            vpn::wireguard_vpn_status,
            vpn::wireguard_vpn_import,
            vpn::wireguard_vpn_connect,
            vpn::wireguard_vpn_disconnect,
            vpn::wireguard_vpn_remove,
            session::active_roblox_status,
            settings::apply_settings,
            settings::restore_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Marktis Optimizer application");
}

#[cfg(test)]
mod launcher_link_tests {
    use super::{roblox_profile_url, roblox_server_uri};

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

    #[test]
    fn server_rejoin_uri_accepts_only_a_place_id_and_uuid_job_id() {
        let job_id = "d37c0e7b-4233-4b6f-8e3b-a53d8b64f60b";
        assert_eq!(
            roblox_server_uri(" 0001818 ", job_id).unwrap(),
            format!("roblox://experiences/start?placeId=1818&gameInstanceId={job_id}")
        );
        assert!(roblox_server_uri("0", job_id).is_err());
        assert!(roblox_server_uri("not-a-place-id", job_id).is_err());
        assert!(roblox_server_uri("1818", "abc&launch=anything").is_err());
        assert!(roblox_server_uri("1818", "00000000-0000-0000-0000-000000000000").is_ok());
    }
}
