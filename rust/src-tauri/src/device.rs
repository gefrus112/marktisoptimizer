//! Read-only Windows hardware/storage inventory and an explicit Roblox web-latency probe.
//!
//! Hardware data is queried from local WMI and returned only to the app UI. The
//! startup storage advisory reads fixed-drive capacity/free space only. The
//! latency probe opens a TCP connection to www.roblox.com:443 only when the user
//! presses the probe button; it sends no HTTP/TLS payload and is not game-server
//! ping. Neither command reads Roblox memory or changes system settings.

use serde::Serialize;
use serde_json::{json, Value};
use std::net::{TcpStream, ToSocketAddrs};
use std::time::{Duration, Instant};

const PROBE_HOST: &str = "www.roblox.com";
const PROBE_PORT: u16 = 443;

fn unavailable_device(supported: bool, message: &str) -> Value {
    json!({
        "supported": supported,
        "available": false,
        "message": message,
        "safety": {
            "readOnly": true,
            "networkRequests": false,
            "dataUploaded": false
        }
    })
}

#[tauri::command]
pub fn device_snapshot() -> Value {
    #[cfg(target_os = "windows")]
    {
        return windows_device_snapshot();
    }
    #[cfg(not(target_os = "windows"))]
    {
        unavailable_device(false, "Read-only hardware inventory is available in the Windows desktop app.")
    }
}

fn unavailable_storage(supported: bool, message: &str) -> Value {
    json!({
        "supported": supported,
        "available": false,
        "message": message,
        "volumes": [],
        "safety": {
            "readOnly": true,
            "networkRequests": false,
            "dataUploaded": false
        }
    })
}

/// Return only fixed local drive capacity/free-space details for the startup
/// advisory. No files are scanned, opened, changed, or uploaded.
#[tauri::command]
pub fn storage_snapshot() -> Value {
    #[cfg(target_os = "windows")]
    {
        return windows_storage_snapshot();
    }
    #[cfg(not(target_os = "windows"))]
    {
        unavailable_storage(false, "The local storage check is available in the Windows desktop app.")
    }
}

#[cfg(target_os = "windows")]
fn windows_storage_snapshot() -> Value {
    use std::os::windows::process::CommandExt;
    use std::path::PathBuf;
    use std::process::Command;

    const STORAGE_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8NoBom
$volumes = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType = 3' | Where-Object { $_.Size -gt 0 } | ForEach-Object {
  [pscustomobject]@{
    drive = [string]$_.DeviceID
    label = [string]$_.VolumeName
    sizeBytes = [uint64]$_.Size
    freeBytes = [uint64]$_.FreeSpace
  }
})
[pscustomobject]@{
  systemDrive = [string]$env:SystemDrive
  volumes = $volumes
} | ConvertTo-Json -Depth 4 -Compress
"#;

    let root = std::env::var_os("SystemRoot")
        .or_else(|| std::env::var_os("WINDIR"))
        .map(PathBuf::from);
    let Some(root) = root.filter(|path| path.is_absolute()) else {
        return unavailable_storage(true, "The Windows system directory could not be located.");
    };
    let powershell = root
        .join("System32")
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe");
    if !powershell.is_file() {
        return unavailable_storage(true, "Windows PowerShell is not available for the local storage check.");
    }

    let output = match Command::new(powershell)
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", STORAGE_SCRIPT])
        .creation_flags(0x0800_0000)
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return unavailable_storage(true, "Windows could not complete the local storage check."),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let snapshot: Value = match serde_json::from_str(stdout.trim()) {
        Ok(value) if value.is_object() && value.get("volumes").and_then(Value::as_array).is_some() => value,
        _ => return unavailable_storage(true, "Windows returned unreadable local storage information."),
    };
    json!({
        "supported": true,
        "available": true,
        "systemDrive": snapshot.get("systemDrive").and_then(Value::as_str).unwrap_or("C:"),
        "volumes": snapshot.get("volumes").cloned().unwrap_or_else(|| json!([])),
        "message": "Fixed local drive capacity and free space were read-only; no files were scanned or changed.",
        "safety": {
            "readOnly": true,
            "networkRequests": false,
            "dataUploaded": false
        }
    })
}

#[cfg(target_os = "windows")]
fn windows_device_snapshot() -> Value {
    use std::path::PathBuf;
    use std::process::Command;
    use std::os::windows::process::CommandExt;

    const INVENTORY_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8NoBom
$system = Get-CimInstance -ClassName Win32_ComputerSystem
$os = Get-CimInstance -ClassName Win32_OperatingSystem
$processors = @(Get-CimInstance -ClassName Win32_Processor | ForEach-Object {
  [pscustomobject]@{
    name = [string]$_.Name
    cores = [int]$_.NumberOfCores
    logicalProcessors = [int]$_.NumberOfLogicalProcessors
  }
})
$graphicsAdapters = @(Get-CimInstance -ClassName Win32_VideoController | ForEach-Object {
  [pscustomobject]@{
    name = [string]$_.Name
    adapterRamBytes = [uint64]$_.AdapterRAM
    driverVersion = [string]$_.DriverVersion
  }
})
$physicalDrives = @(Get-CimInstance -ClassName Win32_DiskDrive | ForEach-Object {
  [pscustomobject]@{
    model = [string]$_.Model
    interfaceType = [string]$_.InterfaceType
    mediaType = [string]$_.MediaType
    sizeBytes = [uint64]$_.Size
  }
})
$volumes = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType = 3' | ForEach-Object {
  [pscustomobject]@{
    drive = [string]$_.DeviceID
    label = [string]$_.VolumeName
    fileSystem = [string]$_.FileSystem
    sizeBytes = [uint64]$_.Size
    freeBytes = [uint64]$_.FreeSpace
  }
})
[pscustomobject]@{
  manufacturer = [string]$system.Manufacturer
  model = [string]$system.Model
  pcSystemType = [int]$system.PCSystemType
  memoryBytes = [uint64]$system.TotalPhysicalMemory
  processors = $processors
  graphicsAdapters = $graphicsAdapters
  physicalDrives = $physicalDrives
  volumes = $volumes
  operatingSystem = [pscustomobject]@{
    name = [string]$os.Caption
    version = [string]$os.Version
    architecture = [string]$os.OSArchitecture
  }
} | ConvertTo-Json -Depth 6 -Compress
"#;

    let root = std::env::var_os("SystemRoot")
        .or_else(|| std::env::var_os("WINDIR"))
        .map(PathBuf::from);
    let Some(root) = root.filter(|path| path.is_absolute()) else {
        return unavailable_device(true, "The Windows system directory could not be located.");
    };
    let powershell = root
        .join("System32")
        .join("WindowsPowerShell")
        .join("v1.0")
        .join("powershell.exe");
    if !powershell.is_file() {
        return unavailable_device(true, "Windows PowerShell is not available for the local read-only inventory.");
    }

    let output = match Command::new(powershell)
        .args(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", INVENTORY_SCRIPT])
        .creation_flags(0x0800_0000)
        .output()
    {
        Ok(output) if output.status.success() => output,
        _ => return unavailable_device(true, "Windows could not complete the local read-only hardware inventory."),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut inventory: Value = match serde_json::from_str::<Value>(stdout.trim()) {
        Ok(value) if value.is_object() => value,
        _ => return unavailable_device(true, "Windows returned an unreadable hardware inventory."),
    };
    inventory["supported"] = Value::Bool(true);
    inventory["available"] = Value::Bool(true);
    inventory["message"] = Value::String("Read-only hardware details were collected locally; they are not uploaded or saved by the app.".to_string());
    inventory["safety"] = json!({
        "readOnly": true,
        "networkRequests": false,
        "dataUploaded": false,
        "serialNumbersCollected": false
    });
    inventory
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LatencyProbe {
    pub supported: bool,
    pub available: bool,
    pub latency_ms: Option<f64>,
    pub endpoint: &'static str,
    pub measurement: &'static str,
    pub game_ping: bool,
    pub payload_sent: bool,
    pub message: String,
}

fn unavailable_probe(supported: bool, message: &str) -> LatencyProbe {
    LatencyProbe {
        supported,
        available: false,
        latency_ms: None,
        endpoint: "www.roblox.com:443",
        measurement: "TCP connect time, not game-server ping",
        game_ping: false,
        payload_sent: false,
        message: message.to_string(),
    }
}

#[tauri::command]
pub fn probe_roblox_latency() -> LatencyProbe {
    #[cfg(target_os = "windows")]
    {
        let addresses = match (PROBE_HOST, PROBE_PORT).to_socket_addrs() {
            Ok(addresses) => addresses,
            Err(_) => return unavailable_probe(true, "Could not resolve the Roblox web endpoint. Check your connection and try again."),
        };
        let address = match addresses.into_iter().next() {
            Some(address) => address,
            None => return unavailable_probe(true, "The Roblox web endpoint did not resolve to an address."),
        };
        let started = Instant::now();
        match TcpStream::connect_timeout(&address, Duration::from_secs(3)) {
            Ok(stream) => {
                let latency_ms = started.elapsed().as_secs_f64() * 1000.0;
                drop(stream);
                LatencyProbe {
                    supported: true,
                    available: true,
                    latency_ms: Some(latency_ms),
                    endpoint: "www.roblox.com:443",
                    measurement: "TCP connect time, not game-server ping",
                    game_ping: false,
                    payload_sent: false,
                    message: "This is a one-time connection-time estimate to the Roblox website, not ping to your game server.".to_string(),
                }
            }
            Err(_) => unavailable_probe(true, "The Roblox web endpoint did not respond to the TCP probe. This is not a game-server ping."),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        unavailable_probe(false, "The optional Roblox web-latency probe is available in the Windows desktop app.")
    }
}

#[cfg(test)]
mod tests {
    use super::unavailable_probe;

    #[test]
    fn latency_probe_is_explicitly_not_game_ping_and_sends_no_payload() {
        let probe = unavailable_probe(true, "test");
        assert!(!probe.available);
        assert!(!probe.game_ping);
        assert!(!probe.payload_sent);
        assert_eq!(probe.endpoint, "www.roblox.com:443");
    }
}
