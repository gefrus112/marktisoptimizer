//! Local, name-only checks for a short list of known Roblox executor processes.
//!
//! This is not antivirus: it checks only exact process image names, never reads
//! paths, command lines, memory, or network data, and never stops or deletes a
//! process. Any match is a prompt for the user to review the app in Windows
//! Settings or Windows Security.

use serde::Serialize;

#[cfg(target_os = "windows")]
const KNOWN_EXECUTORS: &[(&str, &str)] = &[
    ("Xeno", "Xeno.exe"),
    ("Solara", "Solara.exe"),
    ("JJSploit", "JJSploit.exe"),
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownProcessMatch {
    pub product_name: String,
    pub process_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSafetyScan {
    pub supported: bool,
    pub available: bool,
    pub scanned_at: u64,
    pub message: String,
    pub matches: Vec<KnownProcessMatch>,
    pub process_names_only: bool,
    pub command_line_reads: bool,
    pub memory_reads: bool,
    pub network_requests: bool,
    pub automatic_removal: bool,
}

fn now_secs() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn scan_result(
    supported: bool,
    available: bool,
    matches: Vec<KnownProcessMatch>,
    message: String,
) -> LocalSafetyScan {
    LocalSafetyScan {
        supported,
        available,
        scanned_at: now_secs(),
        message,
        matches,
        process_names_only: true,
        command_line_reads: false,
        memory_reads: false,
        network_requests: false,
        automatic_removal: false,
    }
}

#[cfg(any(target_os = "windows", test))]
fn image_name_matches(output: &str, expected: &str) -> bool {
    output.lines().any(|line| {
        line.trim()
            .split(',')
            .next()
            .map(|field| field.trim().trim_matches('"').eq_ignore_ascii_case(expected))
            .unwrap_or(false)
    })
}

#[cfg(target_os = "windows")]
fn tasklist_path() -> Option<std::path::PathBuf> {
    use std::path::PathBuf;
    std::env::var_os("SystemRoot")
        .map(PathBuf::from)
        .map(|root| root.join("System32").join("tasklist.exe"))
        .filter(|path| path.is_absolute() && path.is_file())
}

#[cfg(target_os = "windows")]
fn scan_windows_process_names() -> LocalSafetyScan {
    use std::process::Command;

    let mut matches = Vec::new();
    let tasklist = match tasklist_path() {
        Some(path) => path,
        None => {
            return scan_result(
                true,
                false,
                matches,
                "Windows tasklist could not be found in the system directory. No clean result is claimed.".to_string(),
            );
        }
    };
    for (product_name, process_name) in KNOWN_EXECUTORS {
        let filter = format!("IMAGENAME eq {process_name}");
        let output = match Command::new(&tasklist)
            .args(["/FI", filter.as_str(), "/FO", "CSV", "/NH"])
            .output()
        {
            Ok(output) if output.status.success() => output,
            _ => {
                return scan_result(
                    true,
                    false,
                    matches,
                    "The local process-name check could not complete. No clean result is claimed.".to_string(),
                );
            }
        };

        if image_name_matches(&String::from_utf8_lossy(&output.stdout), process_name) {
            matches.push(KnownProcessMatch {
                product_name: (*product_name).to_string(),
                process_name: (*process_name).to_string(),
            });
        }
    }

    let message = if matches.is_empty() {
        "No exact Xeno.exe, Solara.exe, or JJSploit.exe process name was found. This limited check is not antivirus.".to_string()
    } else {
        "A known executor process name may be running. Review the match; a name match is not proof of malware.".to_string()
    };
    scan_result(true, true, matches, message)
}

#[cfg(not(target_os = "windows"))]
fn scan_windows_process_names() -> LocalSafetyScan {
    scan_result(
        false,
        false,
        Vec::new(),
        "The local process-name check is available only in the Windows desktop app.".to_string(),
    )
}

/// Check exact image names for a small, documented set of executor processes.
#[tauri::command]
pub fn scan_known_executor_processes() -> LocalSafetyScan {
    scan_windows_process_names()
}

fn windows_settings_uri(section: &str) -> Option<&'static str> {
    match section {
        "apps" => Some("ms-settings:appsfeatures"),
        "security" => Some("ms-settings:windowsdefender"),
        _ => None,
    }
}

/// Open one of two fixed Windows review destinations; arbitrary URIs are rejected.
#[tauri::command]
pub fn open_windows_settings(section: String) -> Result<(), String> {
    let uri = windows_settings_uri(&section)
        .ok_or_else(|| "Unsupported Windows Settings destination.".to_string())?;

    #[cfg(target_os = "windows")]
    {
        use std::path::PathBuf;
        use std::process::Command;

        let explorer = std::env::var_os("SystemRoot")
            .map(PathBuf::from)
            .map(|root| root.join("explorer.exe"))
            .filter(|path| path.is_absolute() && path.is_file());
        let Some(explorer) = explorer else {
            return Err("Windows Explorer could not be found in the system directory.".to_string());
        };
        Command::new(explorer)
            .arg(uri)
            .spawn()
            .map(|_| ())
            .map_err(|error| format!("Could not open Windows Settings: {error}"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = uri;
        Err("Windows Settings can be opened only on Windows.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{image_name_matches, windows_settings_uri};

    #[test]
    fn matches_only_the_exact_image_name_field() {
        assert!(image_name_matches(
            "\"Xeno.exe\",\"1234\",\"Console\",\"1\",\"90,000 K\"",
            "Xeno.exe"
        ));
        assert!(image_name_matches("\"sOlArA.ExE\",\"1234\"", "Solara.exe"));
        assert!(!image_name_matches("\"XenoHelper.exe\",\"1234\"", "Xeno.exe"));
        assert!(!image_name_matches(
            "INFO: No tasks are running which match the specified criteria.",
            "JJSploit.exe"
        ));
    }

    #[test]
    fn settings_links_are_fixed_and_allowlisted() {
        assert_eq!(windows_settings_uri("apps"), Some("ms-settings:appsfeatures"));
        assert_eq!(windows_settings_uri("security"), Some("ms-settings:windowsdefender"));
        assert_eq!(windows_settings_uri("https://example.com"), None);
        assert_eq!(windows_settings_uri("file:///C:/"), None);
    }
}
