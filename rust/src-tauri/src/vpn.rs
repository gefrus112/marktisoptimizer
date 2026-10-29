//! User-controlled WireGuard VPN integration for Windows.
//!
//! The app does not provide VPN servers or credentials. It accepts a provider
//! WireGuard profile, protects it with machine-scope DPAPI in the user's local
//! app-data directory, then delegates tunnel/service operations to the official
//! WireGuard for Windows client. The profile is never written as plaintext.

use serde::Serialize;
use std::path::{Path, PathBuf};
#[cfg(not(target_os = "windows"))]
use tauri::Manager;

const CONFIG_FILE_NAME: &str = "MarktisOptimizer.conf.dpapi";
const MAX_CONFIG_BYTES: usize = 64 * 1024;
const DPAPI_PROTECT_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$raw = [Console]::OpenStandardInput()
$memory = New-Object System.IO.MemoryStream
$raw.CopyTo($memory)
$plain = $memory.ToArray()
if ($plain.Length -lt 1) { throw 'The WireGuard profile is empty.' }
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class MarktisOptimizerDpapi {
    [StructLayout(LayoutKind.Sequential)]
    private struct DATA_BLOB { public int cbData; public IntPtr pbData; }
    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CryptProtectData(ref DATA_BLOB input, string description, IntPtr entropy, IntPtr reserved, IntPtr prompt, int flags, out DATA_BLOB output);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr LocalFree(IntPtr memory);
    public static byte[] Protect(byte[] data, string description) {
        DATA_BLOB input = new DATA_BLOB { cbData = data.Length, pbData = Marshal.AllocHGlobal(data.Length) };
        DATA_BLOB output = new DATA_BLOB();
        try {
            Marshal.Copy(data, 0, input.pbData, data.Length);
            if (!CryptProtectData(ref input, description, IntPtr.Zero, IntPtr.Zero, IntPtr.Zero, 0x5, out output))
                throw new Win32Exception(Marshal.GetLastWin32Error());
            byte[] protectedBytes = new byte[output.cbData];
            Marshal.Copy(output.pbData, protectedBytes, 0, output.cbData);
            return protectedBytes;
        } finally {
            if (output.pbData != IntPtr.Zero) LocalFree(output.pbData);
            if (input.pbData != IntPtr.Zero) Marshal.FreeHGlobal(input.pbData);
            Array.Clear(data, 0, data.Length);
        }
    }
}
'@
$protected = [MarktisOptimizerDpapi]::Protect($plain, 'MarktisOptimizer')
$stream = $null
try {
  $stream = [System.IO.File]::Open($env:ROPTIMER_WG_TARGET, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
  $stream.Write($protected, 0, $protected.Length)
} catch {
  if ($null -ne $stream) {
    $stream.Dispose()
    $stream = $null
    [System.IO.File]::Delete($env:ROPTIMER_WG_TARGET)
  }
  throw
} finally {
  if ($null -ne $stream) { $stream.Dispose() }
}
[Array]::Clear($plain, 0, $plain.Length)
$buffer = $memory.GetBuffer()
[Array]::Clear($buffer, 0, $buffer.Length)
$memory.Dispose()
"#;
const SERVICE_QUERY_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$serviceName = 'WireGuardTunnel$MarktisOptimizer'
$service = Get-CimInstance -ClassName Win32_Service -Filter ("Name='" + $serviceName + "'")
if ($null -eq $service) {
  '{"present":false,"running":false,"matchesProfile":false}'
} else {
  $servicePath = [string]$service.PathName
  $expectedExecutable = $env:ROPTIMER_WG_EXE
  $expectedProfile = $env:ROPTIMER_WG_CONFIG
  $matchesProfile = (-not [string]::IsNullOrWhiteSpace($expectedExecutable)) -and (-not [string]::IsNullOrWhiteSpace($expectedProfile)) -and ($servicePath.IndexOf($expectedExecutable, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) -and ($servicePath.IndexOf($expectedProfile, [System.StringComparison]::OrdinalIgnoreCase) -ge 0)
  [pscustomobject]@{ present = $true; running = ($service.State -eq 'Running'); matchesProfile = $matchesProfile } | ConvertTo-Json -Compress
}
"#;
const ELEVATED_OUTER_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$encoded = $env:ROPTIMER_WG_ELEVATED_SCRIPT
$innerArguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ' + $encoded
$child = Start-Process -FilePath $env:ROPTIMER_WG_POWERSHELL -Verb RunAs -ArgumentList $innerArguments -Wait -PassThru -WindowStyle Hidden
exit $child.ExitCode
"#;
const ELEVATED_INNER_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$wireguard = $env:ROPTIMER_WG_EXE
$profilePath = $env:ROPTIMER_WG_CONFIG
$systemRoot = $env:SystemRoot
if ([string]::IsNullOrWhiteSpace($systemRoot)) { $systemRoot = $env:WINDIR }
$sc = Join-Path $systemRoot 'System32\sc.exe'
$action = $env:ROPTIMER_WG_ACTION
switch ($action) {
  'install' {
    $wireguardArgs = '/installtunnelservice "' + $profilePath + '"'
    $result = Start-Process -FilePath $wireguard -ArgumentList $wireguardArgs -Wait -PassThru -WindowStyle Hidden
    if ($result.ExitCode -ne 0) { exit $result.ExitCode }
    $result = Start-Process -FilePath $sc -ArgumentList 'config WireGuardTunnel$MarktisOptimizer start= demand' -Wait -PassThru -WindowStyle Hidden
    exit $result.ExitCode
  }
  'start' {
    $result = Start-Process -FilePath $sc -ArgumentList 'config WireGuardTunnel$MarktisOptimizer start= demand' -Wait -PassThru -WindowStyle Hidden
    if ($result.ExitCode -ne 0) { exit $result.ExitCode }
    $result = Start-Process -FilePath $sc -ArgumentList 'start WireGuardTunnel$MarktisOptimizer' -Wait -PassThru -WindowStyle Hidden
    exit $result.ExitCode
  }
  'stop' {
    $result = Start-Process -FilePath $sc -ArgumentList 'stop WireGuardTunnel$MarktisOptimizer' -Wait -PassThru -WindowStyle Hidden
    exit $result.ExitCode
  }
  'remove' {
    $result = Start-Process -FilePath $wireguard -ArgumentList '/uninstalltunnelservice MarktisOptimizer' -Wait -PassThru -WindowStyle Hidden
    exit $result.ExitCode
  }
  default { throw 'Unsupported WireGuard operation.' }
}
"#;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WireGuardVpnStatus {
    pub supported: bool,
    pub wireguard_installed: bool,
    pub service_query_available: bool,
    pub service_present: bool,
    pub service_running: bool,
    pub service_managed: bool,
    pub profile_file_present: bool,
    pub profile_installed: bool,
    pub message: String,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServiceQuery {
    present: bool,
    running: bool,
    #[serde(default)]
    matches_profile: bool,
}

fn validate_wireguard_config(config: &str) -> Result<(), String> {
    let config = config.strip_prefix('\u{feff}').unwrap_or(config);
    if config.is_empty() || config.len() > MAX_CONFIG_BYTES {
        return Err("Choose a non-empty WireGuard profile no larger than 64 KB.".to_string());
    }
    if config
        .chars()
        .any(|character| character.is_control() && !matches!(character, '\r' | '\n' | '\t'))
    {
        return Err("The WireGuard profile contains unsupported control characters.".to_string());
    }

    let mut section = "";
    let mut interface_sections = 0usize;
    let mut peer_count = 0usize;
    let mut has_private_key = false;
    let mut has_address = false;
    let mut peer_has_public_key = false;
    let mut peer_has_allowed_ips = false;
    let mut peer_has_endpoint = false;

    let finish_peer = |count: usize, has_public_key: bool, has_allowed_ips: bool, has_endpoint: bool| -> Result<(), String> {
        if count > 0 && (!has_public_key || !has_allowed_ips || !has_endpoint) {
            return Err("Every WireGuard peer must include a PublicKey, AllowedIPs, and Endpoint.".to_string());
        }
        Ok(())
    };

    for line in config.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            finish_peer(peer_count, peer_has_public_key, peer_has_allowed_ips, peer_has_endpoint)?;
            let name = line[1..line.len() - 1].trim().to_ascii_lowercase();
            match name.as_str() {
                "interface" => {
                    interface_sections += 1;
                    if interface_sections > 1 || peer_count > 0 {
                        return Err("A profile must have one Interface section before its Peer sections.".to_string());
                    }
                    section = "interface";
                }
                "peer" => {
                    if interface_sections != 1 {
                        return Err("Add one Interface section before the Peer sections.".to_string());
                    }
                    peer_count += 1;
                    if peer_count > 128 {
                        return Err("The WireGuard profile contains too many peers.".to_string());
                    }
                    peer_has_public_key = false;
                    peer_has_allowed_ips = false;
                    peer_has_endpoint = false;
                    section = "peer";
                }
                _ => return Err("Only standard [Interface] and [Peer] sections are accepted.".to_string()),
            }
            continue;
        }

        let Some((key, value)) = line.split_once('=') else {
            return Err("The WireGuard profile has a line that is not a key/value setting.".to_string());
        };
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim();
        if value.is_empty() {
            return Err("The WireGuard profile contains an empty setting value.".to_string());
        }
        match section {
            "interface" => match key.as_str() {
                "privatekey" => has_private_key = true,
                "address" => has_address = true,
                "dns" | "mtu" | "listenport" | "table" => {},
                "preup" | "postup" | "predown" | "postdown" => {
                    return Err("Custom PreUp/PostUp/PreDown/PostDown commands are blocked for safety.".to_string());
                }
                "saveconfig" => return Err("SaveConfig is not accepted; keep the provider profile unchanged.".to_string()),
                _ => return Err(format!("Unsupported WireGuard Interface setting: {key}.")),
            },
            "peer" => match key.as_str() {
                "publickey" => peer_has_public_key = true,
                "allowedips" => peer_has_allowed_ips = true,
                "endpoint" => peer_has_endpoint = true,
                "presharedkey" | "persistentkeepalive" => {},
                _ => return Err(format!("Unsupported WireGuard Peer setting: {key}.")),
            },
            _ => return Err("Add a WireGuard [Interface] section before settings.".to_string()),
        }
    }
    finish_peer(peer_count, peer_has_public_key, peer_has_allowed_ips, peer_has_endpoint)?;
    if interface_sections != 1 || !has_private_key || !has_address || peer_count == 0 {
        return Err("The profile needs an Interface private key/address and at least one Peer with PublicKey, AllowedIPs, and Endpoint.".to_string());
    }
    Ok(())
}

fn status_for_directory(data_dir: &Path) -> WireGuardVpnStatus {
    #[cfg(target_os = "windows")]
    {
        let wireguard_installed = wireguard_executable().is_some();
        let profile_file_present = config_path(data_dir).is_file();
        let service_result = query_service_status(data_dir);
        let service_query_available = service_result.is_ok();
        let service = service_result.unwrap_or(ServiceQuery { present: false, running: false, matches_profile: false });
        let service_managed = service.present && service.matches_profile;
        let profile_installed = profile_file_present && service_managed;
        let message = if !service_query_available {
            "Windows could not confirm tunnel-service state. VPN actions are disabled until status can be checked.".to_string()
        } else if service.present && !service_managed {
            "A WireGuard tunnel uses this reserved name but could not be verified as this app's installed profile; it was left untouched.".to_string()
        } else if !wireguard_installed {
            "Install the official WireGuard for Windows client to use a provider profile.".to_string()
        } else if service_managed && !profile_file_present {
            "The app-managed WireGuard service references a missing encrypted profile. Disconnect or remove the service.".to_string()
        } else if profile_installed && service.running {
            "The WireGuard tunnel service is running. This confirms service state, not provider reachability or a recent handshake.".to_string()
        } else if profile_installed {
            "Your encrypted profile is installed and currently stopped.".to_string()
        } else if profile_file_present {
            "An encrypted profile is saved locally; connect to finish or retry tunnel installation.".to_string()
        } else {
            "No provider profile is installed. Import a WireGuard .conf file from your VPN provider.".to_string()
        };
        WireGuardVpnStatus {
            supported: true,
            wireguard_installed,
            service_query_available,
            service_present: service.present,
            service_running: service.running,
            service_managed,
            profile_file_present,
            profile_installed,
            message,
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = data_dir;
        WireGuardVpnStatus {
            supported: false,
            wireguard_installed: false,
            service_query_available: false,
            service_present: false,
            service_running: false,
            service_managed: false,
            profile_file_present: false,
            profile_installed: false,
            message: "WireGuard VPN integration is available only in the Windows desktop app.".to_string(),
        }
    }
}

#[cfg(target_os = "windows")]
fn wireguard_executable() -> Option<PathBuf> {
    let roots = [
        std::env::var_os("ProgramW6432"),
        std::env::var_os("ProgramFiles"),
        std::env::var_os("ProgramFiles(x86)"),
    ];
    roots
        .into_iter()
        .flatten()
        .map(PathBuf::from)
        .filter(|root| root.is_absolute())
        .map(|root| root.join("WireGuard").join("wireguard.exe"))
        .find(|path| path.is_file())
}

#[cfg(target_os = "windows")]
fn system_powershell() -> Result<PathBuf, String> {
    let root = std::env::var_os("SystemRoot")
        .or_else(|| std::env::var_os("WINDIR"))
        .map(PathBuf::from)
        .ok_or_else(|| "Windows system folder could not be located.".to_string())?;
    if !root.is_absolute() {
        return Err("Windows system folder path is invalid.".to_string());
    }
    let path = root
        .join("System32")
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe");
    if !path.is_file() {
        return Err("Windows PowerShell could not be found in the system folder.".to_string());
    }
    Ok(path)
}

#[cfg(target_os = "windows")]
fn config_path(data_dir: &Path) -> PathBuf {
    data_dir.join("wireguard").join(CONFIG_FILE_NAME)
}

#[cfg(target_os = "windows")]
fn query_service_status(data_dir: &Path) -> Result<ServiceQuery, String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let powershell = system_powershell()?;
    let output = Command::new(powershell)
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", SERVICE_QUERY_SCRIPT])
        .env("ROPTIMER_WG_EXE", wireguard_executable().unwrap_or_default())
        .env("ROPTIMER_WG_CONFIG", config_path(data_dir))
        .creation_flags(0x0800_0000)
        .output()
        .map_err(|_| "Could not query the local WireGuard tunnel service.".to_string())?;
    if !output.status.success() {
        return Err("Could not query the local WireGuard tunnel service.".to_string());
    }
    serde_json::from_slice(&output.stdout)
        .map_err(|_| "Windows returned an unreadable WireGuard service status.".to_string())
}

#[cfg(target_os = "windows")]
fn protect_profile(config: &str, target: &Path) -> Result<(), String> {
    use std::io::Write;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};

    let powershell = system_powershell()?;
    let mut child = Command::new(powershell)
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", DPAPI_PROTECT_SCRIPT])
        .env("ROPTIMER_WG_TARGET", target)
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .creation_flags(0x0800_0000)
        .spawn()
        .map_err(|_| "Could not start Windows DPAPI to protect the VPN profile.".to_string())?;
    let input_result = child.stdin.take().map(|mut stdin| stdin.write_all(config.as_bytes()));
    if !matches!(input_result, Some(Ok(()))) {
        let _ = child.kill();
        let _ = child.wait();
        return Err("Could not pass the WireGuard profile to Windows DPAPI.".to_string());
    }
    let output = child
        .wait_with_output()
        .map_err(|_| "Windows DPAPI did not complete the VPN profile protection.".to_string())?;
    if !output.status.success() || !target.is_file() {
        return Err("Windows DPAPI could not protect the WireGuard profile. No plaintext profile was saved.".to_string());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let a = chunk[0] as u32;
        let b = chunk.get(1).copied().unwrap_or(0) as u32;
        let c = chunk.get(2).copied().unwrap_or(0) as u32;
        let value = (a << 16) | (b << 8) | c;
        output.push(TABLE[((value >> 18) & 0x3f) as usize] as char);
        output.push(TABLE[((value >> 12) & 0x3f) as usize] as char);
        output.push(if chunk.len() > 1 { TABLE[((value >> 6) & 0x3f) as usize] as char } else { '=' });
        output.push(if chunk.len() > 2 { TABLE[(value & 0x3f) as usize] as char } else { '=' });
    }
    output
}

#[cfg(target_os = "windows")]
fn encoded_powershell(script: &str) -> String {
    let utf16le: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
    base64_encode(&utf16le)
}

#[cfg(target_os = "windows")]
fn run_elevated(operation: &str, wireguard: &Path, profile: &Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let powershell = system_powershell()?;
    let encoded = encoded_powershell(ELEVATED_INNER_SCRIPT);
    let output = Command::new(powershell)
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", ELEVATED_OUTER_SCRIPT])
        .env("ROPTIMER_WG_ELEVATED_SCRIPT", encoded)
        .env("ROPTIMER_WG_POWERSHELL", system_powershell()?)
        .env("ROPTIMER_WG_EXE", wireguard)
        .env("ROPTIMER_WG_CONFIG", profile)
        .env("ROPTIMER_WG_ACTION", operation)
        .creation_flags(0x0800_0000)
        .output()
        .map_err(|_| "Could not request Windows administrator permission for WireGuard.".to_string())?;
    if output.status.success() {
        return Ok(());
    }
    let detail = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
    if detail.contains("cancel") || detail.contains("1223") {
        return Err("WireGuard was not changed because the administrator prompt was cancelled.".to_string());
    }
    Err(format!(
        "WireGuard could not complete the requested action (exit code {}). Check its Windows error dialog and try again.",
        output.status.code().unwrap_or(-1)
    ))
}

fn local_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let _ = app;
        let local_app_data = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .filter(|path| path.is_absolute())
            .or_else(|| {
                std::env::var_os("USERPROFILE")
                    .map(PathBuf::from)
                    .filter(|path| path.is_absolute())
                    .map(|path| path.join("AppData").join("Local"))
            })
            .ok_or_else(|| "The Windows local app-data directory could not be located.".to_string())?;
        Ok(local_app_data.join("MarktisOptimizer"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        app.path()
            .app_local_data_dir()
            .map_err(|_| "The local VPN data directory could not be located.".to_string())
    }
}

#[tauri::command]
pub fn wireguard_vpn_status(app: tauri::AppHandle) -> WireGuardVpnStatus {
    match local_data_dir(&app) {
        Ok(directory) => status_for_directory(&directory),
        Err(message) => WireGuardVpnStatus {
            supported: cfg!(target_os = "windows"),
            wireguard_installed: false,
            service_query_available: false,
            service_present: false,
            service_running: false,
            service_managed: false,
            profile_file_present: false,
            profile_installed: false,
            message,
        },
    }
}

#[tauri::command]
pub fn wireguard_vpn_import(app: tauri::AppHandle, config: String) -> Result<WireGuardVpnStatus, String> {
    validate_wireguard_config(&config)?;
    #[cfg(target_os = "windows")]
    {
        let directory = local_data_dir(&app)?;
        let status = status_for_directory(&directory);
        if !status.wireguard_installed {
            return Err("Install the official WireGuard for Windows client first.".to_string());
        }
        if !status.service_query_available {
            return Err("Windows could not confirm tunnel-service state; no VPN changes were made.".to_string());
        }
        if status.profile_file_present || status.service_present {
            return Err("A WireGuard profile is already stored or a tunnel uses the reserved name. Remove the managed profile before importing another.".to_string());
        }
        let executable = wireguard_executable().ok_or_else(|| "WireGuard for Windows was not found.".to_string())?;
        let config = config.strip_prefix('\u{feff}').unwrap_or(&config);
        let target = config_path(&directory);
        let parent = target.parent().ok_or_else(|| "The local VPN data path is invalid.".to_string())?;
        std::fs::create_dir_all(parent).map_err(|_| "Could not create the private local VPN data directory.".to_string())?;
        protect_profile(config, &target)?;
        if let Err(error) = run_elevated("install", &executable, &target) {
            let service_is_absent = query_service_status(&directory)
                .map(|service| !service.present)
                .unwrap_or(false);
            if service_is_absent {
                let _ = std::fs::remove_file(&target);
            }
            return Err(error);
        }
        Ok(status_for_directory(&directory))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("WireGuard VPN integration is available only in the Windows desktop app.".to_string())
    }
}

#[tauri::command]
pub fn wireguard_vpn_connect(app: tauri::AppHandle) -> Result<WireGuardVpnStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let directory = local_data_dir(&app)?;
        let status = status_for_directory(&directory);
        if !status.wireguard_installed {
            return Err("Install the official WireGuard for Windows client first.".to_string());
        }
        if !status.service_query_available {
            return Err("Windows could not confirm tunnel-service state; no VPN changes were made.".to_string());
        }
        if status.service_present && !status.service_managed {
            return Err("The reserved WireGuard service could not be verified as this app's profile; it was left untouched.".to_string());
        }
        if !status.profile_file_present {
            return Err("Import a provider WireGuard profile before connecting.".to_string());
        }
        let executable = wireguard_executable().ok_or_else(|| "WireGuard for Windows was not found.".to_string())?;
        let target = config_path(&directory);
        if status.service_present {
            run_elevated("start", &executable, &target)?;
        } else {
            run_elevated("install", &executable, &target)?;
        }
        Ok(status_for_directory(&directory))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("WireGuard VPN integration is available only in the Windows desktop app.".to_string())
    }
}

#[tauri::command]
pub fn wireguard_vpn_disconnect(app: tauri::AppHandle) -> Result<WireGuardVpnStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let directory = local_data_dir(&app)?;
        let status = status_for_directory(&directory);
        if !status.service_query_available {
            return Err("Windows could not confirm tunnel-service state; no VPN changes were made.".to_string());
        }
        if !status.service_managed {
            return Err("No verified app-managed WireGuard tunnel service is installed.".to_string());
        }
        if status.service_running {
            let executable = wireguard_executable().ok_or_else(|| "WireGuard for Windows was not found.".to_string())?;
            run_elevated("stop", &executable, &config_path(&directory))?;
        }
        Ok(status_for_directory(&directory))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("WireGuard VPN integration is available only in the Windows desktop app.".to_string())
    }
}

#[tauri::command]
pub fn wireguard_vpn_remove(app: tauri::AppHandle) -> Result<WireGuardVpnStatus, String> {
    #[cfg(target_os = "windows")]
    {
        let directory = local_data_dir(&app)?;
        let status = status_for_directory(&directory);
        if !status.service_query_available {
            return Err("Windows could not confirm tunnel-service state; no VPN changes were made.".to_string());
        }
        if status.service_present && !status.service_managed {
            return Err("The reserved WireGuard service could not be verified as this app's profile and was left untouched.".to_string());
        }
        if !status.service_managed && !status.profile_file_present {
            return Err("No app-managed WireGuard profile or tunnel service is stored.".to_string());
        }
        if status.service_managed {
            let executable = wireguard_executable().ok_or_else(|| "WireGuard for Windows was not found.".to_string())?;
            run_elevated("remove", &executable, &config_path(&directory))?;
        }
        if status.profile_file_present {
            std::fs::remove_file(config_path(&directory))
                .map_err(|_| "The WireGuard service was removed, but its encrypted local profile could not be deleted.".to_string())?;
        }
        Ok(status_for_directory(&directory))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("WireGuard VPN integration is available only in the Windows desktop app.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::{validate_wireguard_config, MAX_CONFIG_BYTES};

    const VALID_PROFILE: &str = r#"[Interface]
PrivateKey = 0123456789012345678901234567890123456789012=
Address = 10.0.0.2/32
DNS = 1.1.1.1

[Peer]
PublicKey = 0123456789012345678901234567890123456789012=
AllowedIPs = 0.0.0.0/0, ::/0
Endpoint = vpn.example.test:51820
PersistentKeepalive = 25
"#;

    #[test]
    fn accepts_a_provider_wireguard_profile() {
        assert!(validate_wireguard_config(VALID_PROFILE).is_ok());
    }

    #[test]
    fn rejects_custom_shell_hooks_and_saveconfig() {
        let with_hook = VALID_PROFILE.replace("\n\n[Peer]", "\nPostUp = powershell.exe\n\n[Peer]");
        assert!(validate_wireguard_config(&with_hook)
            .unwrap_err()
            .contains("blocked for safety"));
        let with_save_config = VALID_PROFILE.replace("\n\n[Peer]", "\nSaveConfig = true\n\n[Peer]");
        assert!(validate_wireguard_config(&with_save_config).is_err());
    }

    #[test]
    fn rejects_profiles_without_a_real_endpoint_or_routes() {
        let no_endpoint = VALID_PROFILE.replace("Endpoint = vpn.example.test:51820\n", "");
        assert!(validate_wireguard_config(&no_endpoint).is_err());
        let no_routes = VALID_PROFILE.replace("AllowedIPs = 0.0.0.0/0, ::/0\n", "");
        assert!(validate_wireguard_config(&no_routes).is_err());
    }

    #[test]
    fn enforces_the_profile_size_limit() {
        assert!(validate_wireguard_config(&"x".repeat(MAX_CONFIG_BYTES + 1)).is_err());
    }
}
