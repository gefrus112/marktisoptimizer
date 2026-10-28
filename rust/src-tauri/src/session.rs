//! Read-only Roblox Player presence detection.
//!
//! This module checks only whether `RobloxPlayerBeta.exe` appears in the
//! operating system's process list. It does not open a process handle, read a
//! command line, inspect game/session data, contact Roblox, or read memory.

use serde::Serialize;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveRobloxStatus {
    pub supported: bool,
    pub available: bool,
    pub running: bool,
    pub checked_at: u64,
    pub message: String,
    pub process_name_only: bool,
    pub command_line_reads: bool,
    pub memory_reads: bool,
    pub network_requests: bool,
}

fn now_secs() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn status(supported: bool, available: bool, running: bool, message: String) -> ActiveRobloxStatus {
    ActiveRobloxStatus {
        supported,
        available,
        running,
        checked_at: now_secs(),
        message,
        process_name_only: true,
        command_line_reads: false,
        memory_reads: false,
        network_requests: false,
    }
}

fn has_player_process_row(output: &str) -> bool {
    output.lines().any(|line| {
        line.trim()
            .split(',')
            .next()
            .map(|field| field.trim().trim_matches('"').eq_ignore_ascii_case("RobloxPlayerBeta.exe"))
            .unwrap_or(false)
    })
}

#[cfg(target_os = "windows")]
fn detect() -> ActiveRobloxStatus {
    use std::path::PathBuf;
    use std::process::Command;

    // Use the Windows inbox process-listing utility with fixed arguments.
    // Inspect only the image-name field; never parse or expose other columns.
    let tasklist = std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .map(|root| root.join("System32").join("tasklist.exe"))
        .filter(|path| path.is_file())
        .unwrap_or_else(|| PathBuf::from("tasklist.exe"));
    let output = match Command::new(tasklist)
        .args(["/FI", "IMAGENAME eq RobloxPlayerBeta.exe", "/FO", "CSV", "/NH"])
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => {
            return status(
                true,
                false,
                false,
                "Roblox Player status is temporarily unavailable.".to_string(),
            );
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let running = has_player_process_row(&stdout);
    let message = if running {
        "Roblox Player is open. Only the process name is checked; an active experience and server are not detected.".to_string()
    } else {
        "Roblox Player is not currently running.".to_string()
    };
    status(true, true, running, message)
}

#[cfg(not(target_os = "windows"))]
fn detect() -> ActiveRobloxStatus {
    status(
        false,
        false,
        false,
        "Live Roblox Player detection is available in the Windows app only.".to_string(),
    )
}

#[tauri::command]
pub fn active_roblox_status() -> ActiveRobloxStatus {
    detect()
}

#[cfg(test)]
mod tests {
    use super::has_player_process_row;

    #[test]
    fn detects_only_exact_roblox_player_image_name() {
        assert!(has_player_process_row("\"RobloxPlayerBeta.exe\",\"1234\",\"Console\",\"1\",\"90,000 K\""));
        assert!(!has_player_process_row("\"RobloxStudioBeta.exe\",\"1234\",\"Console\",\"1\",\"90,000 K\""));
        assert!(!has_player_process_row("INFO: No tasks are running which match the specified criteria."));
    }
}
