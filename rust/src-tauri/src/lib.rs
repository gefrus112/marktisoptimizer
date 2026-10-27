//! Roptimer — Rust + Tauri v2 Windows client.
//!
//! A single, lightweight executable that opens to one "Client" tab, detects
//! whether Roblox is installed on first launch, and manages only Roblox-
//! allowlisted FastFlags via local, reversible ClientAppSettings.json writes.
//!
//! No injection, memory access, telemetry disabling, anti-cheat bypass, or
//! game script execution. See settings.rs and detect.rs for the safety boundary.

mod detect;
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
    pub injection: bool,
    pub memory_reads: bool,
    pub telemetry_disable: bool,
    pub anti_cheat_bypass: bool,
    pub game_script_execution: bool,
}

const ALLOWLIST_JSON: &str = include_str!(concat!(env!("OUT_DIR"), "/fastflags-allowlist.json"));

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
        product: "Roptimer",
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

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            app_info,
            get_allowlist,
            open_external,
            detect::detect_roblox,
            settings::apply_settings,
            settings::restore_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Roptimer application");
}
