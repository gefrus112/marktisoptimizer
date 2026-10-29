"use strict";

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { performance } = require("node:perf_hooks");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const LEGACY_FPS_FLAG = "DFIntTaskSchedulerTargetFps";
const ROBLOX_URI = "roblox://";
const LATEST_RELEASE_URL = "https://github.com/gefrus112/marktisoptimizer/releases/latest";
const WIREGUARD_DOWNLOAD_URL = "https://www.wireguard.com/install/";
const WIREGUARD_CONFIG_FILE = "MarktisOptimizer.conf.dpapi";
const MAX_WIREGUARD_CONFIG_BYTES = 64 * 1024;
const ROBLOX_PROFILE_HOST = "https://www.roblox.com/users/";
const ROBLOX_PROBE_HOST = "www.roblox.com";
const ROBLOX_PROBE_PORT = 443;
const KNOWN_EXECUTORS = [
  ["Xeno", "Xeno.exe"],
  ["Solara", "Solara.exe"],
  ["JJSploit", "JJSploit.exe"],
  ["Delta", "Delta.exe"]
];
const SYSTEM_INFO_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $Utf8NoBom
$system = Get-CimInstance -ClassName Win32_ComputerSystem
$os = Get-CimInstance -ClassName Win32_OperatingSystem
$processors = @(Get-CimInstance -ClassName Win32_Processor | ForEach-Object {
  [pscustomobject]@{ name = [string]$_.Name; cores = [int]$_.NumberOfCores; logicalProcessors = [int]$_.NumberOfLogicalProcessors }
})
$graphicsAdapters = @(Get-CimInstance -ClassName Win32_VideoController | ForEach-Object {
  [pscustomobject]@{ name = [string]$_.Name; adapterRamBytes = [uint64]$_.AdapterRAM; driverVersion = [string]$_.DriverVersion }
})
$physicalDrives = @(Get-CimInstance -ClassName Win32_DiskDrive | ForEach-Object {
  [pscustomobject]@{ model = [string]$_.Model; interfaceType = [string]$_.InterfaceType; mediaType = [string]$_.MediaType; sizeBytes = [uint64]$_.Size }
})
$volumes = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter 'DriveType = 3' | ForEach-Object {
  [pscustomobject]@{ drive = [string]$_.DeviceID; label = [string]$_.VolumeName; fileSystem = [string]$_.FileSystem; sizeBytes = [uint64]$_.Size; freeBytes = [uint64]$_.FreeSpace }
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
  operatingSystem = [pscustomobject]@{ name = [string]$os.Caption; version = [string]$os.Version; architecture = [string]$os.OSArchitecture }
} | ConvertTo-Json -Depth 6 -Compress
`;
const STORAGE_INFO_SCRIPT = String.raw`
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
`;
const WIREGUARD_DPAPI_SCRIPT = String.raw`
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
`;
const WIREGUARD_STATUS_SCRIPT = String.raw`
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
`;
const WIREGUARD_ELEVATED_OUTER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$innerArguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ' + $env:ROPTIMER_WG_ELEVATED_SCRIPT
$child = Start-Process -FilePath $env:ROPTIMER_WG_POWERSHELL -Verb RunAs -ArgumentList $innerArguments -Wait -PassThru -WindowStyle Hidden
exit $child.ExitCode
`;
const WIREGUARD_ELEVATED_INNER_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
$wireguard = $env:ROPTIMER_WG_EXE
$profilePath = $env:ROPTIMER_WG_CONFIG
$systemRoot = $env:SystemRoot
if ([string]::IsNullOrWhiteSpace($systemRoot)) { $systemRoot = $env:WINDIR }
$sc = Join-Path $systemRoot 'System32\sc.exe'
switch ($env:ROPTIMER_WG_ACTION) {
  'install' {
    $result = Start-Process -FilePath $wireguard -ArgumentList ('/installtunnelservice "' + $profilePath + '"') -Wait -PassThru -WindowStyle Hidden
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
`;
const SETTINGS_URIS = Object.freeze({
  apps: "ms-settings:appsfeatures",
  security: "ms-settings:windowsdefender",
  graphics: "ms-settings:display-advancedgraphics"
});
const ALLOWED_COMMANDS = new Set([
  "app_info",
  "device_snapshot",
  "storage_snapshot",
  "probe_roblox_latency",
  "get_allowlist",
  "detect_roblox",
  "active_roblox_status",
  "scan_known_executor_processes",
  "open_windows_settings",
  "open_roblox_profile",
  "open_latest_release",
  "exit_app",
  "launch_roblox",
  "rejoin_roblox_server",
  "open_wireguard_download",
  "wireguard_vpn_status",
  "wireguard_vpn_import",
  "wireguard_vpn_connect",
  "wireguard_vpn_disconnect",
  "wireguard_vpn_remove",
  "apply_settings",
  "restore_settings"
]);

function safeSafety() {
  return {
    localJsonOnly: true,
    processNamesOnlyScan: true,
    networkRequests: true,
    networkProbeOnDemand: true,
    networkProbeEndpoint: `${ROBLOX_PROBE_HOST}:${ROBLOX_PROBE_PORT}`,
    probeSendsPayload: false,
    fullAntivirus: false,
    automaticProcessTermination: false,
    automaticSoftwareRemoval: false,
    injection: false,
    memoryReads: false,
    telemetryDisable: false,
    antiCheatBypass: false,
    gameScriptExecution: false
  };
}

function allowlistedKeys(allowlist) {
  const keys = new Set();
  for (const category of (allowlist && Array.isArray(allowlist.categories) ? allowlist.categories : [])) {
    for (const key of (category && Array.isArray(category.flags) ? category.flags : [])) {
      if (typeof key === "string" && key.length > 0) keys.add(key);
    }
  }
  return keys;
}

function clampInteger(value, minimum, maximum, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(number)));
}

function validateWireGuardConfig(input) {
  if (typeof input !== "string") throw new Error("Choose a WireGuard profile file.");
  const config = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (!config || Buffer.byteLength(config, "utf8") > MAX_WIREGUARD_CONFIG_BYTES) {
    throw new Error("Choose a non-empty WireGuard profile no larger than 64 KB.");
  }
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(config)) {
    throw new Error("The WireGuard profile contains unsupported control characters.");
  }

  let section = "";
  let interfaceSections = 0;
  let peerCount = 0;
  let hasPrivateKey = false;
  let hasAddress = false;
  let fullTunnel = false;
  let peer = { publicKey: false, allowedIps: false, endpoint: false };
  const finishPeer = () => {
    if (peerCount > 0 && (!peer.publicKey || !peer.allowedIps || !peer.endpoint)) {
      throw new Error("Every WireGuard peer must include a PublicKey, AllowedIPs, and Endpoint.");
    }
  };

  for (const sourceLine of config.split(/\r?\n/)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    if (line.startsWith("[") && line.endsWith("]")) {
      finishPeer();
      const name = line.slice(1, -1).trim().toLowerCase();
      if (name === "interface") {
        interfaceSections += 1;
        if (interfaceSections > 1 || peerCount > 0) {
          throw new Error("A profile must have one Interface section before its Peer sections.");
        }
        section = "interface";
      } else if (name === "peer") {
        if (interfaceSections !== 1) throw new Error("Add one Interface section before the Peer sections.");
        peerCount += 1;
        if (peerCount > 128) throw new Error("The WireGuard profile contains too many peers.");
        peer = { publicKey: false, allowedIps: false, endpoint: false };
        section = "peer";
      } else {
        throw new Error("Only standard [Interface] and [Peer] sections are accepted.");
      }
      continue;
    }

    const separator = line.indexOf("=");
    if (separator < 0) throw new Error("The WireGuard profile has a line that is not a key/value setting.");
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!value) throw new Error("The WireGuard profile contains an empty setting value.");
    if (section === "interface") {
      if (key === "privatekey") hasPrivateKey = true;
      else if (key === "address") hasAddress = true;
      else if (["dns", "mtu", "listenport", "table"].includes(key)) { /* Supported standard interface option. */ }
      else if (["preup", "postup", "predown", "postdown"].includes(key)) {
        throw new Error("Custom PreUp/PostUp/PreDown/PostDown commands are blocked for safety.");
      } else if (key === "saveconfig") {
        throw new Error("SaveConfig is not accepted; keep the provider profile unchanged.");
      } else {
        throw new Error(`Unsupported WireGuard Interface setting: ${key}.`);
      }
    } else if (section === "peer") {
      if (key === "publickey") peer.publicKey = true;
      else if (key === "allowedips") {
        peer.allowedIps = true;
        fullTunnel ||= value.split(",").some((route) => ["0.0.0.0/0", "::/0"].includes(route.trim().toLowerCase()));
      } else if (key === "endpoint") peer.endpoint = true;
      else if (["presharedkey", "persistentkeepalive"].includes(key)) { /* Supported standard peer option. */ }
      else throw new Error(`Unsupported WireGuard Peer setting: ${key}.`);
    } else {
      throw new Error("Add a WireGuard [Interface] section before settings.");
    }
  }
  finishPeer();
  if (interfaceSections !== 1 || !hasPrivateKey || !hasAddress || peerCount === 0) {
    throw new Error("The profile needs one Interface private key/address and at least one complete Peer section.");
  }
  return { peerCount, fullTunnel };
}

function buildManaged(profileInput, allowlist) {
  const profile = profileInput && typeof profileInput === "object" ? profileInput : {};
  const allowed = allowlistedKeys(allowlist);
  const managed = {};
  const set = (key, value) => {
    if (allowed.has(key)) managed[key] = value;
  };
  const mode = typeof profile.mode === "string" ? profile.mode : "Reduce building lag";
  const modeLower = mode.toLowerCase();
  const lag = modeLower.includes("building") || modeLower.includes("maximum") || modeLower.includes("performance");
  const balanced = modeLower.includes("balanced");
  const highQuality = modeLower.includes("high quality");
  const tier = clampInteger(profile.tier, 0, 21, 21);
  const texture = clampInteger(profile.texture, 0, 3, 0);
  const geometryDefault = lag ? 64 : (highQuality ? 256 : 128);
  const geometryDistance = profile.geometryDistance == null
    ? geometryDefault
    : clampInteger(profile.geometryDistance, 32, 256, geometryDefault);
  const vfx = Boolean(profile.vfx);

  set("DFFlagTextureQualityOverrideEnabled", true);
  set("DFIntTextureQualityOverride", texture);
  set("DFIntDebugFRMQualityLevelOverride", tier);
  set("FIntDebugForceMSAASamples", lag ? 1 : 2);
  set("DFFlagDisableDPIScale", true);

  const renderer = typeof profile.renderer === "string" ? profile.renderer.toLowerCase() : "auto";
  set("FFlagDebugGraphicsPreferD3D11", renderer === "direct3d 11" || renderer === "d3d11");
  set("FFlagDebugGraphicsPreferVulkan", renderer === "vulkan");
  set("FFlagDebugGraphicsPreferOpenGL", renderer === "opengl");

  if (lag || balanced || highQuality || vfx) {
    set("DFIntCSGLevelOfDetailSwitchingDistance", geometryDistance);
    set("DFIntCSGLevelOfDetailSwitchingDistanceL12", geometryDistance);
    set("DFIntCSGLevelOfDetailSwitchingDistanceL23", Math.floor(geometryDistance / 2));
    set("DFIntCSGLevelOfDetailSwitchingDistanceL34", Math.floor(geometryDistance / 4));
    set("FIntFRMMaxGrassDistance", lag ? 40 : (highQuality ? 160 : 80));
    set("FIntFRMMinGrassDistance", lag ? 10 : (highQuality ? 40 : 20));
    set("FIntGrassMovementReducedMotionFactor", highQuality ? 0 : 100);
  }

  if (vfx) {
    set("FFlagDebugSkyGray", true);
    set("DFFlagDebugPauseVoxelizer", true);
  }

  // Keep this map restricted to the canonical allowlist. The legacy FPS request
  // is built separately and is only merged into a write when explicitly opted in.
  delete managed[LEGACY_FPS_FLAG];
  return managed;
}

function buildExperimentalSettings(profileInput) {
  const profile = profileInput && typeof profileInput === "object" ? profileInput : {};
  if (profile.legacyFps !== true) return {};
  return {
    [LEGACY_FPS_FLAG]: clampInteger(profile.fps, 60, 1000, 240)
  };
}

function parseTasklistImageName(output, expected) {
  if (typeof output !== "string") return false;
  const wanted = String(expected).toLowerCase();
  return output.split(/\r?\n/).some((line) => {
    const firstField = line.trim().split(",", 1)[0];
    return firstField.replace(/^"|"$/g, "").trim().toLowerCase() === wanted;
  });
}

function mergeAllowlistedObject(original, managed, allowed) {
  const merged = original && typeof original === "object" && !Array.isArray(original)
    ? { ...original }
    : {};
  for (const [key, value] of Object.entries(managed)) {
    if (allowed.has(key)) merged[key] = value;
  }
  return merged;
}

function restoredObject(original, allowed) {
  const restored = original && typeof original === "object" && !Array.isArray(original)
    ? { ...original }
    : {};
  for (const key of allowed) delete restored[key];
  delete restored[LEGACY_FPS_FLAG];
  return restored;
}

function makeBackupPath(filePath, fileSystem = fs) {
  const base = `${filePath}.bak-${Date.now()}`;
  let candidate = base;
  let suffix = 1;
  while (fileSystem.existsSync(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

function writeBackup(filePath, content, fileSystem = fs) {
  const backupPath = makeBackupPath(filePath, fileSystem);
  fileSystem.writeFileSync(backupPath, content == null ? "{}" : content, { flag: "wx" });
  return backupPath;
}

function writeJsonAtomically(filePath, value, fileSystem = fs) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fileSystem.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
    fileSystem.renameSync(temporaryPath, filePath);
  } catch (error) {
    try { fileSystem.rmSync(temporaryPath, { force: true }); } catch (_cleanupError) { /* best effort */ }
    throw error;
  }
}

function measureRobloxWebLatency() {
  return new Promise((resolve) => {
    const started = performance.now();
    let settled = false;
    let socket;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (socket) socket.destroy();
      resolve(result);
    };
    try {
      socket = net.connect({ host: ROBLOX_PROBE_HOST, port: ROBLOX_PROBE_PORT });
      socket.setTimeout(3500, () => finish({ available: false, latencyMs: null, message: "The Roblox web endpoint did not respond to the TCP probe." }));
      socket.once("connect", () => finish({
        available: true,
        latencyMs: Math.max(0, Math.round((performance.now() - started) * 100) / 100),
        message: "One-time TCP connection time to the Roblox website; not ping to a game server."
      }));
      socket.once("error", () => finish({ available: false, latencyMs: null, message: "Could not connect to the Roblox web endpoint." }));
    } catch (_error) {
      finish({ available: false, latencyMs: null, message: "Could not start the Roblox web-latency probe." });
    }
  });
}

function createBackend(options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const allowlistPath = options.allowlistPath || path.resolve(__dirname, "..", "fastflags-allowlist.json");
  const allowlist = options.allowlist || loadAllowlist(allowlistPath);
  const execFileImpl = options.execFile || execFileAsync;
  const spawnImpl = options.spawn || require("node:child_process").spawn;
  const fileSystem = options.fs || fs;
  const probeRobloxLatencyImpl = options.probeRobloxLatency || measureRobloxWebLatency;
  const exitAppImpl = typeof options.exitApp === "function" ? options.exitApp : () => undefined;
  const userProfileRoot = env.USERPROFILE && path.win32.isAbsolute(env.USERPROFILE) ? env.USERPROFILE : "C:\\Users\\Default";
  const localAppDataRoot = env.LOCALAPPDATA && path.win32.isAbsolute(env.LOCALAPPDATA)
    ? env.LOCALAPPDATA
    : path.win32.join(userProfileRoot, "AppData", "Local");
  const vpnDataDir = options.vpnDataDir || path.win32.join(localAppDataRoot, "MarktisOptimizer");

  function isWindows() {
    return platform === "win32";
  }

  function systemPath(name) {
    const root = env.SystemRoot || env.SYSTEMROOT || env.windir || env.WINDIR;
    if (!root || !path.win32.isAbsolute(root)) return null;
    const fullPath = path.win32.resolve(root, "System32", name);
    const rootPrefix = path.win32.resolve(root) + path.win32.sep;
    if (!fullPath.toLowerCase().startsWith(rootPrefix.toLowerCase())) return null;
    try { return fileSystem.statSync(fullPath).isFile() ? fullPath : null; } catch (_error) { return null; }
  }

  function windowsPowerShellPath() {
    const root = env.SystemRoot || env.SYSTEMROOT || env.windir || env.WINDIR;
    if (!root || !path.win32.isAbsolute(root)) return null;
    const executable = path.win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    try { return fileSystem.statSync(executable).isFile() ? executable : null; } catch (_error) { return null; }
  }

  function findWireGuardExecutable() {
    const roots = [env.ProgramW6432, env.ProgramFiles, env["ProgramFiles(x86)"]].filter(Boolean);
    for (const root of roots) {
      if (!path.win32.isAbsolute(root)) continue;
      const executable = path.win32.join(root, "WireGuard", "wireguard.exe");
      try { if (fileSystem.statSync(executable).isFile()) return executable; } catch (_error) { /* Try the next standard install path. */ }
    }
    return null;
  }

  function wireGuardProfilePath() {
    return path.win32.join(vpnDataDir, "wireguard", WIREGUARD_CONFIG_FILE);
  }

  function windowsRoots() {
    const roots = [];
    const local = env.LOCALAPPDATA;
    if (local) {
      roots.push(path.win32.join(local, "Roblox", "Versions"));
      roots.push(path.win32.join(local, "Roblox"));
    }
    for (const key of ["ProgramFiles", "ProgramFiles(x86)", "PROGRAMW6432"]) {
      const base = env[key];
      if (base) roots.push(path.win32.join(base, "Roblox", "Versions"));
    }
    const seen = new Set();
    return roots.filter((root) => {
      const key = root.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function detectRoblox() {
    if (!isWindows()) {
      return {
        installed: false,
        platform,
        message: "Roblox detection targets the Windows client. Run the Windows build to scan Roblox version folders.",
        versions: [],
        clientSettingsPaths: [],
        rootsScanned: [],
        scannedAt: Math.floor(Date.now() / 1000),
        safety: { readOnly: true, processAttach: false, memoryReads: false, launchesRoblox: false }
      };
    }

    const roots = windowsRoots();
    const versions = [];
    const clientSettingsPaths = [];
    const seenVersions = new Set();
    const seenSettings = new Set();

    for (const root of roots) {
      let entries;
      try { entries = fileSystem.readdirSync(root, { withFileTypes: true }); } catch (_error) { continue; }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const versionPath = path.win32.join(root, entry.name);
        const lowerPath = versionPath.toLowerCase();
        if (seenVersions.has(lowerPath)) continue;
        const hasPlayer = fileSystem.existsSync(path.win32.join(versionPath, "RobloxPlayerBeta.exe"));
        const hasStudio = fileSystem.existsSync(path.win32.join(versionPath, "RobloxStudioBeta.exe"));
        const settingsPath = path.win32.join(versionPath, "ClientSettings", "ClientAppSettings.json");
        const hasSettings = fileSystem.existsSync(settingsPath);
        if (!hasPlayer && !hasStudio && !entry.name.toLowerCase().startsWith("version-") && !hasSettings) continue;
        seenVersions.add(lowerPath);
        if (hasSettings && !seenSettings.has(settingsPath.toLowerCase())) {
          clientSettingsPaths.push(settingsPath);
          seenSettings.add(settingsPath.toLowerCase());
        }
        versions.push({
          name: entry.name,
          path: versionPath,
          hasPlayer,
          hasStudio,
          hasSettings,
          settingsPath
        });
      }
    }

    versions.sort((left, right) => left.name.localeCompare(right.name));
    const installed = versions.some((version) => version.hasPlayer || version.hasStudio) || clientSettingsPaths.length > 0;
    const message = installed
      ? `Roblox detected: ${versions.length} version folder${versions.length === 1 ? "" : "s"} found. Marktis Optimizer can manage allowlisted local settings safely.`
      : "Roblox was not found in the usual Windows locations. Install the Roblox desktop client from roblox.com, then re-scan.";
    return {
      installed,
      platform: "windows",
      message,
      versions,
      clientSettingsPaths,
      rootsScanned: roots,
      scannedAt: Math.floor(Date.now() / 1000),
      safety: { readOnly: true, processAttach: false, memoryReads: false, launchesRoblox: false }
    };
  }

  function targetPaths(detection, allVersions) {
    const paths = (detection && Array.isArray(detection.versions) ? detection.versions : [])
      .map((version) => version && version.settingsPath)
      .filter((settingsPath) => typeof settingsPath === "string" && settingsPath.length > 0);
    return allVersions || paths.length <= 1 ? paths : paths.slice(0, 1);
  }

  async function readTasklist(filter) {
    const executable = systemPath("tasklist.exe");
    if (!executable) throw new Error("Windows tasklist could not be found in the system directory.");
    const args = ["/FI", filter, "/FO", "CSV", "/NH"];
    const result = await execFileImpl(executable, args, {
      windowsHide: true,
      timeout: 10000,
      maxBuffer: 64 * 1024,
      encoding: "utf8",
      shell: false
    });
    return typeof result.stdout === "string" ? result.stdout : String(result.stdout || "");
  }

  async function activeRobloxStatus() {
    if (!isWindows()) {
      return {
        supported: false,
        available: false,
        running: false,
        checkedAt: Math.floor(Date.now() / 1000),
        message: "Live Roblox Player detection is available in the Windows app only.",
        processNameOnly: true,
        commandLineReads: false,
        memoryReads: false,
        networkRequests: false
      };
    }
    try {
      const output = await readTasklist("IMAGENAME eq RobloxPlayerBeta.exe");
      const running = parseTasklistImageName(output, "RobloxPlayerBeta.exe");
      return {
        supported: true,
        available: true,
        running,
        checkedAt: Math.floor(Date.now() / 1000),
        message: running
          ? "Roblox Player is open. Only the process name is checked; an active experience and server are not detected."
          : "Roblox Player is not currently running.",
        processNameOnly: true,
        commandLineReads: false,
        memoryReads: false,
        networkRequests: false
      };
    } catch (_error) {
      return {
        supported: true,
        available: false,
        running: false,
        checkedAt: Math.floor(Date.now() / 1000),
        message: "Roblox Player status is temporarily unavailable.",
        processNameOnly: true,
        commandLineReads: false,
        memoryReads: false,
        networkRequests: false
      };
    }
  }

  async function scanKnownExecutorProcesses() {
    if (!isWindows()) {
      return {
        supported: false,
        available: false,
        scannedAt: Math.floor(Date.now() / 1000),
        message: "The local process-name check is available only in the Windows desktop app.",
        matches: [],
        processNamesOnly: true,
        commandLineReads: false,
        memoryReads: false,
        networkRequests: false,
        automaticRemoval: false
      };
    }

    const matches = [];
    try {
      for (const [productName, processName] of KNOWN_EXECUTORS) {
        const output = await readTasklist(`IMAGENAME eq ${processName}`);
        if (parseTasklistImageName(output, processName)) matches.push({ productName, processName });
      }
    } catch (_error) {
      return {
        supported: true,
        available: false,
        scannedAt: Math.floor(Date.now() / 1000),
        message: "The local process-name check could not complete. No clean result is claimed.",
        matches,
        processNamesOnly: true,
        commandLineReads: false,
        memoryReads: false,
        networkRequests: false,
        automaticRemoval: false
      };
    }

    return {
      supported: true,
      available: true,
      scannedAt: Math.floor(Date.now() / 1000),
      message: matches.length === 0
        ? "No exact Xeno.exe, Solara.exe, JJSploit.exe, or Delta.exe process name was found. This limited check is not antivirus."
        : "A known executor process name may be running. Review the match; a name match is not proof of malware.",
      matches,
      processNamesOnly: true,
      commandLineReads: false,
      memoryReads: false,
      networkRequests: false,
      automaticRemoval: false
    };
  }

  async function openWindowsSettings(args) {
    const section = args && typeof args.section === "string" ? args.section : "";
    const uri = SETTINGS_URIS[section];
    if (!uri) throw new Error("Unsupported Windows Settings destination.");
    if (!isWindows()) throw new Error("Windows Settings can be opened only on Windows.");
    const root = env.SystemRoot || env.SYSTEMROOT || env.windir || env.WINDIR;
    if (!root || !path.win32.isAbsolute(root)) throw new Error("Windows Explorer could not be found in the system directory.");
    const explorer = path.win32.join(root, "explorer.exe");
    try { fileSystem.accessSync(explorer, fileSystem.constants.X_OK); } catch (_error) {
      try { fileSystem.statSync(explorer); } catch (_notFound) { throw new Error("Windows Explorer could not be found in the system directory."); }
    }
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawnImpl(explorer, [uri], { detached: true, windowsHide: true, stdio: "ignore", shell: false });
      } catch (error) {
        reject(new Error(`Could not open Windows Settings: ${error.message}`));
        return;
      }
      child.once("error", (error) => reject(new Error(`Could not open Windows Settings: ${error.message}`)));
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  }

  async function openRobloxProfile(args) {
    const rawUserId = args && typeof args.userId === "string" ? args.userId.trim() : "";
    if (!/^\d{1,20}$/.test(rawUserId) || /^0+$/.test(rawUserId)) {
      throw new Error("Enter a valid positive numeric Roblox User ID.");
    }
    const userId = rawUserId.replace(/^0+(?=\d)/, "");
    if (userId.length === 20 && userId > "18446744073709551615") {
      throw new Error("The Roblox User ID is outside the supported numeric range.");
    }
    if (!isWindows()) throw new Error("Opening a Roblox profile is available only in the Windows desktop app.");
    const root = env.SystemRoot || env.SYSTEMROOT || env.windir || env.WINDIR;
    if (!root || !path.win32.isAbsolute(root)) throw new Error("Windows Explorer could not be found in the system directory.");
    const explorer = path.win32.join(root, "explorer.exe");
    try {
      if (!fileSystem.statSync(explorer).isFile()) throw new Error("not a file");
    } catch (_error) {
      throw new Error("Windows Explorer could not be found in the system directory.");
    }
    const url = ROBLOX_PROFILE_HOST + userId + "/profile";
    return new Promise((resolve, reject) => {
      let child;
      try {
        // The hostname and path are fixed; only a validated numeric ID is interpolated.
        child = spawnImpl(explorer, [url], { detached: true, windowsHide: true, stdio: "ignore", shell: false });
      } catch (error) {
        reject(new Error(`Could not open Roblox profile: ${error.message}`));
        return;
      }
      child.once("error", (error) => reject(new Error(`Could not open Roblox profile: ${error.message}`)));
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  }

  async function openLatestRelease() {
    if (!isWindows()) throw new Error("The Windows desktop release page can be opened only in the Windows app.");
    const root = env.SystemRoot || env.SYSTEMROOT || env.windir || env.WINDIR;
    if (!root || !path.win32.isAbsolute(root)) throw new Error("Windows Explorer could not be found in the system directory.");
    const explorer = path.win32.join(root, "explorer.exe");
    try {
      if (!fileSystem.statSync(explorer).isFile()) throw new Error("not a file");
    } catch (_error) {
      throw new Error("Windows Explorer could not be found in the system directory.");
    }
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawnImpl(explorer, [LATEST_RELEASE_URL], { detached: true, windowsHide: true, stdio: "ignore", shell: false });
      } catch (error) {
        reject(new Error(`Could not open the latest release page: ${error.message}`));
        return;
      }
      child.once("error", (error) => reject(new Error(`Could not open the latest release page: ${error.message}`)));
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  }

  function runPowerShellWithInput(args, input, extraEnv) {
    const executable = windowsPowerShellPath();
    if (!executable) return Promise.reject(new Error("Windows PowerShell could not be found in the system folder."));
    return new Promise((resolve, reject) => {
      let child;
      let stdout = "";
      let stderr = "";
      try {
        child = spawnImpl(executable, args, {
          windowsHide: true,
          shell: false,
          stdio: ["pipe", "pipe", "pipe"],
          env: { ...process.env, ...env, ...(extraEnv || {}) }
        });
      } catch (_error) {
        reject(new Error("Could not start Windows DPAPI to protect the VPN profile."));
        return;
      }
      if (child.stdout) child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      if (child.stderr) child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.once("error", () => reject(new Error("Could not start Windows DPAPI to protect the VPN profile.")));
      child.once("close", (code) => {
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error("Windows DPAPI could not protect the WireGuard profile. No plaintext profile was saved."));
      });
      if (!child.stdin) {
        child.kill();
        reject(new Error("Windows DPAPI input could not be opened."));
        return;
      }
      child.stdin.on("error", () => { /* The close event reports process failure. */ });
      child.stdin.end(input, "utf8");
    });
  }

  async function queryWireGuardService() {
    const executable = windowsPowerShellPath();
    if (!executable) throw new Error("Windows PowerShell could not be found in the system folder.");
    const result = await execFileImpl(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", WIREGUARD_STATUS_SCRIPT], {
      windowsHide: true,
      shell: false,
      timeout: 15000,
      maxBuffer: 32 * 1024,
      env: {
        ...process.env,
        ...env,
        ROPTIMER_WG_EXE: findWireGuardExecutable() || "",
        ROPTIMER_WG_CONFIG: wireGuardProfilePath()
      }
    });
    const parsed = JSON.parse(String(result.stdout || "").trim());
    if (typeof parsed.present !== "boolean" || typeof parsed.running !== "boolean" || typeof parsed.matchesProfile !== "boolean") {
      throw new Error("Windows returned an unreadable WireGuard service status.");
    }
    return parsed;
  }

  async function wireGuardStatus() {
    if (!isWindows()) {
      return {
        supported: false,
        wireguardInstalled: false,
        serviceQueryAvailable: false,
        servicePresent: false,
        serviceRunning: false,
        serviceManaged: false,
        profileFilePresent: false,
        profileInstalled: false,
        message: "WireGuard VPN integration is available only in the Windows desktop app."
      };
    }
    const wireguardExecutable = findWireGuardExecutable();
    const wireguardInstalled = Boolean(wireguardExecutable);
    const profilePath = wireGuardProfilePath();
    let profileFilePresent = false;
    try { profileFilePresent = fileSystem.statSync(profilePath).isFile(); } catch (_error) { profileFilePresent = false; }
    let service = { present: false, running: false, matchesProfile: false };
    let serviceQueryAvailable = false;
    try {
      service = await queryWireGuardService();
      serviceQueryAvailable = true;
    } catch (_error) { /* Disable all tunnel changes when status cannot be verified. */ }
    const serviceManaged = service.present && service.matchesProfile;
    const profileInstalled = profileFilePresent && serviceManaged;
    let message;
    if (!serviceQueryAvailable) message = "Windows could not confirm tunnel-service state. VPN actions are disabled until status can be checked.";
    else if (service.present && !serviceManaged) message = "A WireGuard tunnel uses this reserved name but could not be verified as this app's installed profile; it was left untouched.";
    else if (!wireguardInstalled) message = "Install the official WireGuard for Windows client to use a provider profile.";
    else if (serviceManaged && !profileFilePresent) message = "The app-managed WireGuard service references a missing encrypted profile. Disconnect or remove the service.";
    else if (profileInstalled && service.running) message = "The WireGuard tunnel service is running. This confirms service state, not provider reachability or a recent handshake.";
    else if (profileInstalled) message = "Your encrypted profile is installed and currently stopped.";
    else if (profileFilePresent) message = "An encrypted profile is saved locally; connect to finish or retry tunnel installation.";
    else message = "No provider profile is installed. Import a WireGuard .conf file from your VPN provider.";
    return {
      supported: true,
      wireguardInstalled,
      serviceQueryAvailable,
      servicePresent: service.present,
      serviceRunning: service.running,
      serviceManaged,
      profileFilePresent,
      profileInstalled,
      message
    };
  }

  async function runWireGuardElevated(action, profilePath) {
    const powershell = windowsPowerShellPath();
    const wireguard = findWireGuardExecutable();
    if (!powershell) throw new Error("Windows PowerShell could not be found in the system folder.");
    if (!wireguard && action !== "start" && action !== "stop") throw new Error("WireGuard for Windows was not found.");
    const elevatedScript = Buffer.from(WIREGUARD_ELEVATED_INNER_SCRIPT, "utf16le").toString("base64");
    try {
      await execFileImpl(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", WIREGUARD_ELEVATED_OUTER_SCRIPT], {
        windowsHide: true,
        shell: false,
        maxBuffer: 32 * 1024,
        env: {
          ...process.env,
          ...env,
          ROPTIMER_WG_ELEVATED_SCRIPT: elevatedScript,
          ROPTIMER_WG_POWERSHELL: powershell,
          ROPTIMER_WG_EXE: wireguard || "",
          ROPTIMER_WG_CONFIG: profilePath,
          ROPTIMER_WG_ACTION: action
        }
      });
    } catch (error) {
      const detail = String(error && (error.stderr || error.message) || "").toLowerCase();
      if (detail.includes("cancel") || detail.includes("1223")) {
        throw new Error("WireGuard was not changed because the administrator prompt was cancelled.");
      }
      throw new Error("WireGuard could not complete the requested action. Check its Windows error dialog and try again.");
    }
  }

  async function importWireGuardProfile(args) {
    if (!isWindows()) throw new Error("WireGuard VPN integration is available only in the Windows desktop app.");
    const config = args && typeof args.config === "string" ? args.config : "";
    validateWireGuardConfig(config);
    const status = await wireGuardStatus();
    if (!status.wireguardInstalled) throw new Error("Install the official WireGuard for Windows client first.");
    if (!status.serviceQueryAvailable) throw new Error("Windows could not confirm tunnel-service state; no VPN changes were made.");
    if (status.profileFilePresent || status.servicePresent) {
      throw new Error("A WireGuard profile is already stored or a tunnel uses the reserved name. Remove the managed profile before importing another.");
    }
    const wireguard = findWireGuardExecutable();
    if (!wireguard) throw new Error("WireGuard for Windows was not found.");
    const profilePath = wireGuardProfilePath();
    fileSystem.mkdirSync(path.win32.dirname(profilePath), { recursive: true });
    await runPowerShellWithInput(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", WIREGUARD_DPAPI_SCRIPT], config, {
      ROPTIMER_WG_TARGET: profilePath
    });
    try {
      await runWireGuardElevated("install", profilePath);
    } catch (error) {
      let servicePresent = true;
      try { servicePresent = (await queryWireGuardService()).present; } catch (_queryError) { /* Keep the encrypted file if state is uncertain. */ }
      if (!servicePresent) {
        try { fileSystem.unlinkSync(profilePath); } catch (_removeError) { /* The user can remove an orphaned encrypted profile later. */ }
      }
      throw error;
    }
    return wireGuardStatus();
  }

  async function connectWireGuard() {
    if (!isWindows()) throw new Error("WireGuard VPN integration is available only in the Windows desktop app.");
    const status = await wireGuardStatus();
    if (!status.serviceQueryAvailable) throw new Error("Windows could not confirm tunnel-service state; no VPN changes were made.");
    if (status.servicePresent && !status.serviceManaged) throw new Error("The reserved WireGuard service could not be verified as this app's profile; it was left untouched.");
    if (!status.profileFilePresent) throw new Error("Import a provider WireGuard profile before connecting.");
    if (status.serviceRunning) return status;
    await runWireGuardElevated(status.servicePresent ? "start" : "install", wireGuardProfilePath());
    return wireGuardStatus();
  }

  async function disconnectWireGuard() {
    if (!isWindows()) throw new Error("WireGuard VPN integration is available only in the Windows desktop app.");
    const status = await wireGuardStatus();
    if (!status.serviceQueryAvailable) throw new Error("Windows could not confirm tunnel-service state; no VPN changes were made.");
    if (!status.serviceManaged) throw new Error("No verified app-managed WireGuard tunnel service is installed.");
    if (!status.serviceRunning) return status;
    await runWireGuardElevated("stop", wireGuardProfilePath());
    return wireGuardStatus();
  }

  async function removeWireGuardProfile() {
    if (!isWindows()) throw new Error("WireGuard VPN integration is available only in the Windows desktop app.");
    const status = await wireGuardStatus();
    if (!status.serviceQueryAvailable) throw new Error("Windows could not confirm tunnel-service state; no VPN changes were made.");
    if (status.servicePresent && !status.serviceManaged) throw new Error("The reserved WireGuard service could not be verified as this app's profile and was left untouched.");
    if (!status.profileFilePresent && !status.serviceManaged) throw new Error("No app-managed WireGuard profile or tunnel service is stored.");
    if (status.serviceManaged) {
      if (!findWireGuardExecutable()) throw new Error("WireGuard for Windows is required to remove the installed tunnel service.");
      await runWireGuardElevated("remove", wireGuardProfilePath());
    }
    if (status.profileFilePresent) fileSystem.unlinkSync(wireGuardProfilePath());
    return wireGuardStatus();
  }

  async function openWireGuardDownload() {
    if (!isWindows()) throw new Error("The official WireGuard download page is available only in the Windows desktop app.");
    const root = env.SystemRoot || env.SYSTEMROOT || env.windir || env.WINDIR;
    if (!root || !path.win32.isAbsolute(root)) throw new Error("Windows Explorer could not be found in the system directory.");
    const explorer = path.win32.join(root, "explorer.exe");
    try { if (!fileSystem.statSync(explorer).isFile()) throw new Error("not a file"); } catch (_error) {
      throw new Error("Windows Explorer could not be found in the system directory.");
    }
    return new Promise((resolve, reject) => {
      let child;
      try {
        child = spawnImpl(explorer, [WIREGUARD_DOWNLOAD_URL], { detached: true, windowsHide: true, stdio: "ignore", shell: false });
      } catch (error) {
        reject(new Error(`Could not open the WireGuard download page: ${error.message}`));
        return;
      }
      child.once("error", (error) => reject(new Error(`Could not open the WireGuard download page: ${error.message}`)));
      child.once("spawn", () => { child.unref(); resolve(); });
    });
  }

  async function launchRoblox() {
    if (!isWindows()) throw new Error("Roblox launch is available only in the Windows desktop app.");
    const root = env.SystemRoot || env.SYSTEMROOT || env.windir || env.WINDIR;
    if (!root || !path.win32.isAbsolute(root)) throw new Error("Windows Explorer could not be found in the system directory.");
    const explorer = path.win32.join(root, "explorer.exe");
    try {
      if (!fileSystem.statSync(explorer).isFile()) throw new Error("not a file");
    } catch (_error) {
      throw new Error("Windows Explorer could not be found in the system directory.");
    }
    return new Promise((resolve, reject) => {
      let child;
      try {
        // The protocol URI is a constant; shell execution and user-supplied URLs are forbidden.
        child = spawnImpl(explorer, [ROBLOX_URI], { detached: true, windowsHide: true, stdio: "ignore", shell: false });
      } catch (error) {
        reject(new Error(`Could not request Roblox launch: ${error.message}`));
        return;
      }
      child.once("error", (error) => reject(new Error(`Could not request Roblox launch: ${error.message}`)));
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  }

  async function rejoinRobloxServer(args) {
    const rawPlaceId = args && typeof args.placeId === "string" ? args.placeId.trim() : "";
    if (!/^[0-9]{1,20}$/.test(rawPlaceId) || /^0+$/.test(rawPlaceId)) {
      throw new Error("Enter a valid positive numeric Roblox Place ID.");
    }
    const placeId = rawPlaceId.replace(/^0+(?=[0-9])/, "");
    if (placeId.length === 20 && placeId > "18446744073709551615") {
      throw new Error("The Roblox Place ID is outside the supported numeric range.");
    }
    const rawGameInstanceId = args && typeof args.gameInstanceId === "string" ? args.gameInstanceId.trim() : "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawGameInstanceId)) {
      throw new Error("Enter the exact server Job ID as a UUID.");
    }
    if (!isWindows()) throw new Error("Server rejoin is available only in the Windows desktop app.");
    const root = env.SystemRoot || env.SYSTEMROOT || env.windir || env.WINDIR;
    if (!root || !path.win32.isAbsolute(root)) throw new Error("Windows Explorer could not be found in the system directory.");
    const explorer = path.win32.join(root, "explorer.exe");
    try {
      if (!fileSystem.statSync(explorer).isFile()) throw new Error("not a file");
    } catch (_error) {
      throw new Error("Windows Explorer could not be found in the system directory.");
    }
    const uri = `roblox://experiences/start?placeId=${placeId}&gameInstanceId=${rawGameInstanceId.toLowerCase()}`;
    return new Promise((resolve, reject) => {
      let child;
      try {
        // Only validated IDs are added to the fixed Roblox URI; no shell or arbitrary URL is used.
        child = spawnImpl(explorer, [uri], { detached: true, windowsHide: true, stdio: "ignore", shell: false });
      } catch (error) {
        reject(new Error(`Could not request a server rejoin: ${error.message}`));
        return;
      }
      child.once("error", (error) => reject(new Error(`Could not request a server rejoin: ${error.message}`)));
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
  }

  async function deviceSnapshot() {
    if (!isWindows()) {
      return {
        supported: false,
        available: false,
        message: "Read-only hardware inventory is available in the Windows desktop app.",
        safety: { readOnly: true, networkRequests: false, dataUploaded: false }
      };
    }
    const executable = systemPath("WindowsPowerShell\\v1.0\\powershell.exe");
    if (!executable) {
      return {
        supported: true,
        available: false,
        message: "Windows PowerShell is not available for the local read-only inventory.",
        safety: { readOnly: true, networkRequests: false, dataUploaded: false }
      };
    }
    try {
      const result = await execFileImpl(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", SYSTEM_INFO_SCRIPT], {
        windowsHide: true,
        timeout: 12000,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
        shell: false
      });
      const raw = typeof result.stdout === "string" ? result.stdout.trim() : String(result.stdout || "").trim();
      const snapshot = JSON.parse(raw);
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new Error("invalid inventory");
      return {
        ...snapshot,
        supported: true,
        available: true,
        message: "Read-only hardware details were collected locally; they are not uploaded or saved by the app.",
        safety: { readOnly: true, networkRequests: false, dataUploaded: false, serialNumbersCollected: false }
      };
    } catch (_error) {
      return {
        supported: true,
        available: false,
        message: "Windows could not complete the local read-only hardware inventory.",
        safety: { readOnly: true, networkRequests: false, dataUploaded: false }
      };
    }
  }

  async function storageSnapshot() {
    if (!isWindows()) {
      return {
        supported: false,
        available: false,
        systemDrive: "",
        volumes: [],
        message: "The local storage check is available in the Windows desktop app.",
        safety: { readOnly: true, networkRequests: false, dataUploaded: false }
      };
    }
    const executable = systemPath("WindowsPowerShell\\v1.0\\powershell.exe");
    if (!executable) {
      return {
        supported: true,
        available: false,
        systemDrive: env.SystemDrive || "C:",
        volumes: [],
        message: "Windows PowerShell is not available for the local storage check.",
        safety: { readOnly: true, networkRequests: false, dataUploaded: false }
      };
    }
    try {
      const result = await execFileImpl(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", STORAGE_INFO_SCRIPT], {
        windowsHide: true,
        timeout: 8000,
        maxBuffer: 256 * 1024,
        encoding: "utf8",
        shell: false
      });
      const raw = typeof result.stdout === "string" ? result.stdout.trim() : String(result.stdout || "").trim();
      const snapshot = JSON.parse(raw);
      if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !Array.isArray(snapshot.volumes)) {
        throw new Error("invalid storage information");
      }
      return {
        supported: true,
        available: true,
        systemDrive: typeof snapshot.systemDrive === "string" ? snapshot.systemDrive : (env.SystemDrive || "C:"),
        volumes: snapshot.volumes,
        message: "Fixed local drive capacity and free space were read-only; no files were scanned or changed.",
        safety: { readOnly: true, networkRequests: false, dataUploaded: false }
      };
    } catch (_error) {
      return {
        supported: true,
        available: false,
        systemDrive: env.SystemDrive || "C:",
        volumes: [],
        message: "Windows could not complete the local storage check.",
        safety: { readOnly: true, networkRequests: false, dataUploaded: false }
      };
    }
  }

  async function probeRobloxLatency() {
    if (!isWindows()) {
      return {
        supported: false,
        available: false,
        latencyMs: null,
        endpoint: `${ROBLOX_PROBE_HOST}:${ROBLOX_PROBE_PORT}`,
        measurement: "TCP connect time, not game-server ping",
        gamePing: false,
        payloadSent: false,
        message: "The optional Roblox web-latency probe is available in the Windows desktop app."
      };
    }
    try {
      const result = await probeRobloxLatencyImpl();
      return {
        supported: true,
        available: Boolean(result && result.available),
        latencyMs: result && Number.isFinite(Number(result.latencyMs)) ? Number(result.latencyMs) : null,
        endpoint: `${ROBLOX_PROBE_HOST}:${ROBLOX_PROBE_PORT}`,
        measurement: "TCP connect time, not game-server ping",
        gamePing: false,
        payloadSent: false,
        message: result && typeof result.message === "string"
          ? result.message
          : "This is a one-time connection-time estimate to the Roblox website, not ping to your game server."
      };
    } catch (_error) {
      return {
        supported: true,
        available: false,
        latencyMs: null,
        endpoint: `${ROBLOX_PROBE_HOST}:${ROBLOX_PROBE_PORT}`,
        measurement: "TCP connect time, not game-server ping",
        gamePing: false,
        payloadSent: false,
        message: "The Roblox web-latency probe could not complete. This is not a game-server ping."
      };
    }
  }

  function appInfo() {
    return {
      product: "Marktis Optimizer",
      version: "4.0.0",
      edition: "Electron Windows Client",
      framework: "Electron",
      webview: "Chromium",
      platform: isWindows() ? "windows" : platform,
      targets: "ClientAppSettings.json (local, reversible)",
      detectsRobloxOnLaunch: true,
      allowlistFlags: allowlistedKeys(allowlist).size,
      safety: safeSafety()
    };
  }

  function readJsonObject(filePath) {
    try {
      const value = JSON.parse(fileSystem.readFileSync(filePath, "utf8"));
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch (_error) {
      return null;
    }
  }

  function applySettings(args) {
    if (!isWindows()) throw new Error("Applying Roblox settings is available only on Windows.");
    const profile = args && args.profile && typeof args.profile === "object" ? args.profile : {};
    const canonicalManaged = buildManaged(profile, allowlist);
    const experimentalManaged = buildExperimentalSettings(profile);
    const managed = { ...canonicalManaged, ...experimentalManaged };
    const managedKeys = Object.keys(managed).sort();
    const detection = detectRoblox();
    const paths = targetPaths(detection, profile.allVersions !== false);
    const writtenPaths = [];
    const backups = [];

    for (const filePath of paths) {
      try {
        const parent = path.win32.dirname(filePath);
        fileSystem.mkdirSync(parent, { recursive: true });
        const original = fileSystem.existsSync(filePath) ? fileSystem.readFileSync(filePath, "utf8") : null;
        const document = original == null ? {} : readJsonObject(filePath);
        if (!document) continue;
        const backup = writeBackup(filePath, original, fileSystem);
        const merged = mergeAllowlistedObject(document, canonicalManaged, allowlistedKeys(allowlist));
        if (profile.legacyFps === true && Object.hasOwn(experimentalManaged, LEGACY_FPS_FLAG)) {
          merged[LEGACY_FPS_FLAG] = experimentalManaged[LEGACY_FPS_FLAG];
        }
        writeJsonAtomically(filePath, merged, fileSystem);
        backups.push(backup);
        writtenPaths.push(filePath);
      } catch (_error) {
        // Continue to other version folders; never report a failed file as applied.
      }
    }

    const applied = writtenPaths.length > 0;
    return {
      applied,
      message: applied
        ? (profile.legacyFps === true
          ? `Applied ${Object.keys(canonicalManaged).length} canonical allowlisted settings and experimental legacy FPS target ${experimentalManaged[LEGACY_FPS_FLAG]} to ${writtenPaths.length} file(s). Backups created; use Restore to remove managed keys.`
          : `Applied ${Object.keys(canonicalManaged).length} allowlisted settings to ${writtenPaths.length} file(s). Backups created; use Restore to remove managed keys.`)
        : "No usable Roblox ClientSettings files were found. Check the local JSON format, install/launch Roblox once, then try again.",
      writtenPaths,
      backups,
      managedKeys,
      safety: {
        localJsonOnly: true,
        backupCreated: backups.length === writtenPaths.length && applied,
        unrelatedKeysPreserved: true,
        allowlistOnly: profile.legacyFps !== true,
        experimentalLegacyFps: profile.legacyFps === true,
        injection: false,
        memoryWrites: false,
        gameScriptExecution: false
      }
    };
  }

  function restoreSettings() {
    if (!isWindows()) throw new Error("Restoring Roblox settings is available only on Windows.");
    const allowed = allowlistedKeys(allowlist);
    const managedKeys = Array.from(allowed).sort();
    managedKeys.push(LEGACY_FPS_FLAG);
    const detection = detectRoblox();
    const paths = targetPaths(detection, true);
    const writtenPaths = [];
    const backups = [];

    for (const filePath of paths) {
      try {
        if (!fileSystem.existsSync(filePath)) continue;
        const original = fileSystem.readFileSync(filePath, "utf8");
        const document = readJsonObject(filePath);
        if (!document) continue;
        const backup = writeBackup(filePath, original, fileSystem);
        const restored = restoredObject(document, allowed);
        writeJsonAtomically(filePath, restored, fileSystem);
        backups.push(backup);
        writtenPaths.push(filePath);
      } catch (_error) {
        // Keep scanning other discovered folders without widening the target.
      }
    }

    const applied = writtenPaths.length > 0;
    return {
      applied,
      message: applied
        ? `Restored managed settings in ${writtenPaths.length} file(s). Backups kept.`
        : "No valid Roblox ClientSettings files were found to restore.",
      writtenPaths,
      backups,
      managedKeys,
      safety: {
        localJsonOnly: true,
        backupCreated: backups.length === writtenPaths.length && applied,
        unrelatedKeysPreserved: true,
        allowlistOnly: false,
        experimentalLegacyFps: true,
        injection: false,
        memoryWrites: false,
        gameScriptExecution: false
      }
    };
  }

  async function invoke(command, args = {}) {
    if (!ALLOWED_COMMANDS.has(command)) throw new Error("Unsupported local desktop command.");
    switch (command) {
      case "app_info": return appInfo();
      case "device_snapshot": return deviceSnapshot();
      case "storage_snapshot": return storageSnapshot();
      case "probe_roblox_latency": return probeRobloxLatency();
      case "get_allowlist": return JSON.parse(JSON.stringify(allowlist));
      case "detect_roblox": return detectRoblox();
      case "active_roblox_status": return activeRobloxStatus();
      case "scan_known_executor_processes": return scanKnownExecutorProcesses();
      case "open_windows_settings": return openWindowsSettings(args);
      case "open_roblox_profile": return openRobloxProfile(args);
      case "open_latest_release": return openLatestRelease();
      case "open_wireguard_download": return openWireGuardDownload();
      case "wireguard_vpn_status": return wireGuardStatus();
      case "wireguard_vpn_import": return importWireGuardProfile(args);
      case "wireguard_vpn_connect": return connectWireGuard();
      case "wireguard_vpn_disconnect": return disconnectWireGuard();
      case "wireguard_vpn_remove": return removeWireGuardProfile();
      case "exit_app": return exitAppImpl();
      case "launch_roblox": return launchRoblox();
      case "rejoin_roblox_server": return rejoinRobloxServer(args);
      case "apply_settings": return applySettings(args);
      case "restore_settings": return restoreSettings();
      default: throw new Error("Unsupported local desktop command.");
    }
  }

  return { invoke, appInfo, deviceSnapshot, storageSnapshot, probeRobloxLatency, detectRoblox, activeRobloxStatus, scanKnownExecutorProcesses, wireGuardStatus, buildManaged };
}

function loadAllowlist(filePath) {
  let value;
  try { value = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch (_error) {
    throw new Error(`Could not load canonical FastFlag allowlist: ${filePath}`);
  }
  if (!value || !Array.isArray(value.categories)) throw new Error("The canonical FastFlag allowlist is invalid.");
  return value;
}

module.exports = {
  ALLOWED_COMMANDS,
  KNOWN_EXECUTORS,
  SETTINGS_URIS,
  WIREGUARD_DOWNLOAD_URL,
  validateWireGuardConfig,
  allowlistedKeys,
  buildManaged,
  buildExperimentalSettings,
  createBackend,
  loadAllowlist,
  mergeAllowlistedObject,
  parseTasklistImageName,
  restoredObject
};
