//! Roblox installation detection — read-only, OS/filesystem level only.
//!
//! SAFETY: this module never attaches to a process, reads memory, injects
//! anything, or launches Roblox. It only lists directories and checks whether
//! well-known Roblox files exist. That is exactly what "detect if Roblox is
//! installed" means here, and it is safe by construction.

use serde::Serialize;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RobloxVersion {
    pub name: String,
    pub path: String,
    pub has_player: bool,
    pub has_studio: bool,
    pub has_settings: bool,
    pub settings_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Detection {
    pub installed: bool,
    pub platform: &'static str,
    pub message: String,
    pub versions: Vec<RobloxVersion>,
    pub client_settings_paths: Vec<String>,
    pub roots_scanned: Vec<String>,
    pub scanned_at: u64,
    pub safety: DetectionSafety,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectionSafety {
    pub read_only: bool,
    pub process_attach: bool,
    pub memory_reads: bool,
    pub launches_roblox: bool,
}

fn now_secs() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn safe_safety() -> DetectionSafety {
    DetectionSafety {
        read_only: true,
        process_attach: false,
        memory_reads: false,
        launches_roblox: false,
    }
}

/// Candidate Roblox "Versions" roots on Windows.
fn windows_roots() -> Vec<String> {
    let mut roots = Vec::new();
    let local = std::env::var("LOCALAPPDATA").unwrap_or_default();
    if !local.is_empty() {
        roots.push(format!("{}\\Roblox\\Versions", local));
        // Legacy/per-user installs sometimes live directly under Roblox.
        roots.push(format!("{}\\Roblox", local));
    }
    for key in ["ProgramFiles", "ProgramFiles(x86)", "PROGRAMW6432"] {
        if let Ok(base) = std::env::var(key) {
            if !base.is_empty() {
                roots.push(format!("{}\\Roblox\\Versions", base));
            }
        }
    }
    // De-duplicate while preserving order.
    let mut seen = std::collections::HashSet::new();
    roots.retain(|r| seen.insert(r.clone()));
    roots
}

#[cfg(target_os = "windows")]
pub fn detect() -> Detection {
    use std::path::Path;

    let roots = windows_roots();
    let mut versions: Vec<RobloxVersion> = Vec::new();
    let mut settings_paths: Vec<String> = Vec::new();

    for root in &roots {
        let root_path = Path::new(root);
        if !root_path.is_dir() {
            continue;
        }
        let entries = match std::fs::read_dir(root_path) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            // Version folders are conventionally named "version-<hash>", but
            // accept any folder that actually contains the player binary.
            let player = path.join("RobloxPlayerBeta.exe");
            let studio = path.join("RobloxStudioBeta.exe");
            let has_player = player.exists();
            let has_studio = studio.exists();
            let settings_path = path.join("ClientSettings").join("ClientAppSettings.json");
            let has_settings = settings_path.exists();
            let name = entry.file_name().to_string_lossy().to_string();

            if !has_player && !has_studio && !name.to_lowercase().starts_with("version-") && !has_settings {
                continue;
            }
            if has_settings {
                settings_paths.push(settings_path.to_string_lossy().to_string());
            }
            // Avoid duplicate version folders across roots.
            let key = path.to_string_lossy().to_string();
            if versions.iter().any(|v| v.path == key) {
                continue;
            }
            versions.push(RobloxVersion {
                name,
                path: key,
                has_player,
                has_studio,
                has_settings,
                settings_path: Some(settings_path.to_string_lossy().to_string()),
            });
        }
    }

    versions.sort_by(|a, b| a.name.cmp(&b.name));
    let installed = versions.iter().any(|v| v.has_player || v.has_studio) || !settings_paths.is_empty();
    let count = versions.len();
    let message = if installed {
        format!(
            "Roblox detected: {} version folder{} found. Marktis Optimizer can manage allowlisted local settings safely.",
            count,
            if count == 1 { "" } else { "s" }
        )
    } else {
        "Roblox was not found in the usual Windows locations. Install the Roblox desktop client from roblox.com, then re-scan.".to_string()
    };

    Detection {
        installed,
        platform: "windows",
        message,
        versions,
        client_settings_paths: settings_paths,
        roots_scanned: roots,
        scanned_at: now_secs(),
        safety: safe_safety(),
    }
}

#[cfg(not(target_os = "windows"))]
pub fn detect() -> Detection {
    Detection {
        installed: false,
        platform: std::env::consts::OS,
        message: "Roblox detection targets the Windows client. Run the Windows build to scan Roblox version folders.".to_string(),
        versions: Vec::new(),
        client_settings_paths: Vec::new(),
        roots_scanned: Vec::new(),
        scanned_at: now_secs(),
        safety: safe_safety(),
    }
}

#[tauri::command]
pub fn detect_roblox() -> Detection {
    detect()
}
