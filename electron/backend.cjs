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
const SETTINGS_URIS = Object.freeze({
  apps: "ms-settings:appsfeatures",
  security: "ms-settings:windowsdefender",
  graphics: "ms-settings:display-advancedgraphics"
});
const ALLOWED_COMMANDS = new Set([
  "app_info",
  "device_snapshot",
  "probe_roblox_latency",
  "get_allowlist",
  "detect_roblox",
  "active_roblox_status",
  "scan_known_executor_processes",
  "open_windows_settings",
  "launch_roblox",
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
      case "probe_roblox_latency": return probeRobloxLatency();
      case "get_allowlist": return JSON.parse(JSON.stringify(allowlist));
      case "detect_roblox": return detectRoblox();
      case "active_roblox_status": return activeRobloxStatus();
      case "scan_known_executor_processes": return scanKnownExecutorProcesses();
      case "open_windows_settings": return openWindowsSettings(args);
      case "launch_roblox": return launchRoblox();
      case "apply_settings": return applySettings(args);
      case "restore_settings": return restoreSettings();
      default: throw new Error("Unsupported local desktop command.");
    }
  }

  return { invoke, appInfo, deviceSnapshot, probeRobloxLatency, detectRoblox, activeRobloxStatus, scanKnownExecutorProcesses, buildManaged };
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
  allowlistedKeys,
  buildManaged,
  buildExperimentalSettings,
  createBackend,
  loadAllowlist,
  mergeAllowlistedObject,
  parseTasklistImageName,
  restoredObject
};
