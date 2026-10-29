"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const path = require("node:path");
const test = require("node:test");
const {
  allowlistedKeys,
  buildManaged,
  buildExperimentalSettings,
  createBackend,
  loadAllowlist,
  mergeAllowlistedObject,
  parseTasklistImageName,
  restoredObject,
  validateWireGuardConfig,
  COMMUNITY_DISCORD_URL,
  WIREGUARD_DOWNLOAD_URL,
  YOUTUBE_CHANNEL_URL
} = require("../backend.cjs");

const allowlist = loadAllowlist(path.resolve(__dirname, "../../fastflags-allowlist.json"));
const allowed = allowlistedKeys(allowlist);

function profile(renderer, overrides = {}) {
  return {
    mode: "Reduce building lag",
    tier: 21,
    texture: 0,
    renderer,
    geometryDistance: 64,
    vfx: true,
    allVersions: true,
    ...overrides
  };
}

test("managed profile writes only canonical allowlisted keys", () => {
  const managed = buildManaged(profile("Vulkan"), allowlist);
  assert.ok(Object.keys(managed).length > 0);
  assert.ok(Object.keys(managed).every((key) => allowed.has(key)));
  assert.equal("DFIntTaskSchedulerTargetFps" in managed, false);
  assert.equal(managed.FFlagDebugGraphicsPreferVulkan, true);
  assert.equal(managed.FFlagDebugGraphicsPreferD3D11, false);
  assert.equal(managed.FFlagDebugGraphicsPreferOpenGL, false);
  assert.equal(managed.DFIntDebugFRMQualityLevelOverride, 21);
  assert.equal(managed.DFIntTextureQualityOverride, 0);
});

test("legacy FPS request is opt-in, clamped, and kept outside the canonical map", () => {
  assert.deepEqual(buildExperimentalSettings(profile("Auto")), {});
  assert.deepEqual(buildExperimentalSettings(profile("Auto", { legacyFps: false, fps: 500 })), {});
  assert.deepEqual(buildExperimentalSettings(profile("Auto", { legacyFps: true, fps: 144 })), {
    DFIntTaskSchedulerTargetFps: 144
  });
  assert.deepEqual(buildExperimentalSettings(profile("Auto", { legacyFps: true, fps: 5000 })), {
    DFIntTaskSchedulerTargetFps: 1000
  });
  assert.deepEqual(buildExperimentalSettings(profile("Auto", { legacyFps: true, fps: 0 })), {
    DFIntTaskSchedulerTargetFps: 60
  });
});

test("maximum-performance preset lowers the graphics workload", () => {
  const managed = buildManaged(profile("Auto", {
    mode: "Maximum performance",
    tier: 6,
    texture: 0,
    geometryDistance: 64,
    vfx: true
  }), allowlist);
  assert.equal(managed.DFIntTextureQualityOverride, 0);
  assert.equal(managed.DFIntDebugFRMQualityLevelOverride, 6);
  assert.equal(managed.DFIntCSGLevelOfDetailSwitchingDistance, 64);
  assert.equal(managed.FIntFRMMaxGrassDistance, 40);
});

test("high-quality preset applies the high-detail rendering path", () => {
  const managed = buildManaged(profile("Auto", {
    mode: "High quality",
    tier: 21,
    texture: 3,
    geometryDistance: 256,
    vfx: false
  }), allowlist);
  assert.equal(managed.DFIntTextureQualityOverride, 3);
  assert.equal(managed.DFIntDebugFRMQualityLevelOverride, 21);
  assert.equal(managed.DFIntCSGLevelOfDetailSwitchingDistance, 256);
  assert.equal(managed.FIntFRMMaxGrassDistance, 160);
  assert.equal(managed.FIntGrassMovementReducedMotionFactor, 0);
});

test("renderer choices remain mutually exclusive and values are clamped", () => {
  for (const [renderer, enabled] of [
    ["Auto", []],
    ["Direct3D 11", ["FFlagDebugGraphicsPreferD3D11"]],
    ["Vulkan", ["FFlagDebugGraphicsPreferVulkan"]],
    ["OpenGL", ["FFlagDebugGraphicsPreferOpenGL"]],
    ["Direct3D 12", []]
  ]) {
    const managed = buildManaged(profile(renderer, { tier: 99, texture: -8 }), allowlist);
    const rendererKeys = [
      "FFlagDebugGraphicsPreferD3D11",
      "FFlagDebugGraphicsPreferVulkan",
      "FFlagDebugGraphicsPreferOpenGL"
    ];
    const actual = rendererKeys.filter((key) => managed[key] === true);
    assert.deepEqual(actual, enabled);
    assert.equal(managed.DFIntDebugFRMQualityLevelOverride, 21);
    assert.equal(managed.DFIntTextureQualityOverride, 0);
  }
});

test("tasklist parser examines only an exact image-name field", () => {
  assert.equal(parseTasklistImageName('"Xeno.exe","1234","Console","1","90,000 K"', "Xeno.exe"), true);
  assert.equal(parseTasklistImageName('"sOlArA.ExE","1234"', "Solara.exe"), true);
  assert.equal(parseTasklistImageName('"XenoHelper.exe","1234"', "Xeno.exe"), false);
  assert.equal(parseTasklistImageName("INFO: No tasks are running.", "JJSploit.exe"), false);
});

test("merge and restore preserve unrelated JSON keys", () => {
  const original = { CustomFlag: true, DFIntTextureQualityOverride: 3, DFIntTaskSchedulerTargetFps: 240 };
  const managed = { DFIntTextureQualityOverride: 1, NotAllowlisted: "ignored" };
  const merged = mergeAllowlistedObject(original, managed, allowed);
  assert.deepEqual(merged, { CustomFlag: true, DFIntTextureQualityOverride: 1, DFIntTaskSchedulerTargetFps: 240 });
  const restored = restoredObject(merged, allowed);
  assert.deepEqual(restored, { CustomFlag: true });
});

test("opted-in FPS writes are backed up and removed by Restore", async () => {
  const localAppData = "C:\\Users\\Tester\\AppData\\Local";
  const versionsRoot = path.win32.join(localAppData, "Roblox", "Versions");
  const versionPath = path.win32.join(versionsRoot, "version-test");
  const playerPath = path.win32.join(versionPath, "RobloxPlayerBeta.exe");
  const settingsPath = path.win32.join(versionPath, "ClientSettings", "ClientAppSettings.json");
  const originalText = JSON.stringify({ UserOwnedSetting: "keep", DFIntTaskSchedulerTargetFps: 333 });
  const files = new Map([[playerPath, ""], [settingsPath, originalText]]);
  const memoryFs = {
    constants: { X_OK: 1 },
    readdirSync(root) {
      if (root.toLowerCase() === versionsRoot.toLowerCase()) {
        return [{ name: "version-test", isDirectory: () => true }];
      }
      throw new Error("directory not found");
    },
    existsSync(filePath) { return files.has(filePath); },
    readFileSync(filePath) {
      if (!files.has(filePath)) throw new Error("file not found");
      return files.get(filePath);
    },
    writeFileSync(filePath, contents, options = {}) {
      if (options.flag === "wx" && files.has(filePath)) throw new Error("file exists");
      files.set(filePath, String(contents));
    },
    renameSync(from, to) {
      if (!files.has(from)) throw new Error("temporary file not found");
      files.set(to, files.get(from));
      files.delete(from);
    },
    rmSync(filePath) { files.delete(filePath); },
    mkdirSync() {}
  };
  const backend = createBackend({
    platform: "win32",
    env: { LOCALAPPDATA: localAppData },
    allowlist,
    fs: memoryFs
  });

  const applied = await backend.invoke("apply_settings", {
    profile: profile("Auto", { legacyFps: true, fps: 360, vfx: false })
  });
  assert.equal(applied.applied, true);
  assert.equal(applied.safety.backupCreated, true);
  assert.equal(applied.safety.allowlistOnly, false);
  assert.equal(applied.safety.experimentalLegacyFps, true);
  assert.equal(files.get(applied.backups[0]), originalText);
  assert.equal(JSON.parse(files.get(settingsPath)).DFIntTaskSchedulerTargetFps, 360);
  assert.equal(JSON.parse(files.get(settingsPath)).UserOwnedSetting, "keep");
  assert.ok(applied.managedKeys.includes("DFIntTaskSchedulerTargetFps"));

  const restored = await backend.invoke("restore_settings");
  assert.equal(restored.applied, true);
  assert.ok(restored.managedKeys.includes("DFIntTaskSchedulerTargetFps"));
  assert.equal("DFIntTaskSchedulerTargetFps" in JSON.parse(files.get(settingsPath)), false);
  assert.equal(JSON.parse(files.get(settingsPath)).UserOwnedSetting, "keep");
});

test("quick action opens only the detected Roblox settings directory through Explorer", async () => {
  const localAppData = String.raw`C:\Users\Tester\AppData\Local`;
  const versionsRoot = path.win32.join(localAppData, "Roblox", "Versions");
  const versionPath = path.win32.join(versionsRoot, "version-local-test");
  const settingsDir = path.win32.join(versionPath, "ClientSettings");
  const settingsPath = path.win32.join(settingsDir, "ClientAppSettings.json");
  const playerPath = path.win32.join(versionPath, "RobloxPlayerBeta.exe");
  const existing = new Set([settingsDir, settingsPath, playerPath]);
  const memoryFs = {
    constants: { X_OK: 1 },
    readdirSync(root) {
      if (root.toLowerCase() === versionsRoot.toLowerCase()) return [{ name: "version-local-test", isDirectory: () => true }];
      return [];
    },
    existsSync(filePath) { return existing.has(filePath); },
    statSync(filePath) {
      assert.equal(filePath, String.raw`C:\Windows\explorer.exe`);
      return { isFile: () => true };
    }
  };
  const spawnCalls = [];
  const child = new EventEmitter();
  child.unref = () => { child.wasUnrefed = true; };
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: String.raw`C:\Windows`, LOCALAPPDATA: localAppData },
    allowlist,
    fs: memoryFs,
    spawn(executable, args, options) {
      spawnCalls.push({ executable, args, options });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  });

  const openedPath = await backend.invoke("open_settings_folder");
  assert.equal(openedPath, settingsDir);
  assert.equal(spawnCalls[0].executable, String.raw`C:\Windows\explorer.exe`);
  assert.deepEqual(spawnCalls[0].args, [settingsDir]);
  assert.equal(spawnCalls[0].options.shell, false);
  assert.equal(child.wasUnrefed, true);

  const unsupported = createBackend({ platform: "linux", allowlist });
  await assert.rejects(() => unsupported.invoke("open_settings_folder"), /only on Windows/);
});

test("Roblox launch dispatches a fixed roblox:// URI through system Explorer", async () => {
  const spawnCalls = [];
  const child = new EventEmitter();
  child.unref = () => { child.wasUnrefed = true; };
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows" },
    allowlist,
    fs: {
      statSync(filePath) {
        assert.equal(filePath, "C:\\Windows\\explorer.exe");
        return { isFile: () => true };
      }
    },
    spawn(executable, args, options) {
      spawnCalls.push({ executable, args, options });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  });

  await backend.invoke("launch_roblox", { uri: "file:///not-accepted" });
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].executable, "C:\\Windows\\explorer.exe");
  assert.deepEqual(spawnCalls[0].args, ["roblox://"]);
  assert.equal(spawnCalls[0].options.shell, false);
  assert.equal(child.wasUnrefed, true);

  const unsupported = createBackend({ platform: "linux", allowlist });
  await assert.rejects(() => unsupported.invoke("launch_roblox"), /Windows desktop app\./);
});

test("server rejoin dispatches only a validated Place ID and UUID through Roblox", async () => {
  const spawnCalls = [];
  const child = new EventEmitter();
  child.unref = () => { child.wasUnrefed = true; };
  const windowsRoot = String.raw`C:\Windows`;
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: windowsRoot },
    allowlist,
    fs: { statSync: () => ({ isFile: () => true }) },
    spawn(executable, args, options) {
      spawnCalls.push({ executable, args, options });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  });

  const gameInstanceId = "d37c0e7b-4233-4b6f-8e3b-a53d8b64f60b";
  await backend.invoke("rejoin_roblox_server", { placeId: "0001818", gameInstanceId: gameInstanceId.toUpperCase() });
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].executable, path.win32.join(windowsRoot, "explorer.exe"));
  assert.deepEqual(spawnCalls[0].args, ["roblox://experiences/start?placeId=1818&gameInstanceId=" + gameInstanceId]);
  assert.equal(spawnCalls[0].options.shell, false);
  assert.equal(child.wasUnrefed, true);
  await assert.rejects(() => backend.invoke("rejoin_roblox_server", { placeId: "1818&bad=1", gameInstanceId }), /valid positive numeric Roblox Place ID/);
  await assert.rejects(() => backend.invoke("rejoin_roblox_server", { placeId: "1818", gameInstanceId: gameInstanceId + "&bad=1" }), /Job ID as a UUID/);
  await assert.rejects(() => backend.invoke("rejoin_roblox_server", { placeId: "18446744073709551616", gameInstanceId }), /outside the supported numeric range/);
  assert.equal(spawnCalls.length, 1);

  const unsupported = createBackend({ platform: "linux", allowlist });
  await assert.rejects(() => unsupported.invoke("rejoin_roblox_server", { placeId: "1818", gameInstanceId }), /only in the Windows desktop app/);
});

test("Roblox profile shortcut opens only a validated numeric ID in the system browser", async () => {
  const spawnCalls = [];
  const child = new EventEmitter();
  child.unref = () => { child.wasUnrefed = true; };
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows" },
    allowlist,
    fs: { statSync: () => ({ isFile: () => true }) },
    spawn(executable, args, options) {
      spawnCalls.push({ executable, args, options });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  });

  await backend.invoke("open_roblox_profile", { userId: "000123456" });
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].executable, "C:\\Windows\\explorer.exe");
  assert.deepEqual(spawnCalls[0].args, ["https://www.roblox.com/users/123456/profile"]);
  assert.equal(spawnCalls[0].options.shell, false);
  assert.equal(child.wasUnrefed, true);
  await assert.rejects(() => backend.invoke("open_roblox_profile", { userId: "123/../settings" }), /valid positive numeric Roblox User ID/);
  await assert.rejects(() => backend.invoke("open_roblox_profile", { userId: "18446744073709551616" }), /outside the supported numeric range/);
  assert.equal(spawnCalls.length, 1);

  const unsupported = createBackend({ platform: "linux", allowlist });
  await assert.rejects(() => unsupported.invoke("open_roblox_profile", { userId: "123456" }), /only in the Windows desktop app/);
});

test("latest release shortcut opens only the fixed GitHub releases page", async () => {
  const spawnCalls = [];
  const child = new EventEmitter();
  child.unref = () => { child.wasUnrefed = true; };
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows" },
    allowlist,
    fs: { statSync: () => ({ isFile: () => true }) },
    spawn(executable, args, options) {
      spawnCalls.push({ executable, args, options });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  });

  await backend.invoke("open_latest_release", { url: "https://example.com/" });
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].executable, "C:\\Windows\\explorer.exe");
  assert.deepEqual(spawnCalls[0].args, ["https://github.com/gefrus112/marktisoptimizer/releases/latest"]);
  assert.equal(spawnCalls[0].options.shell, false);
  assert.equal(child.wasUnrefed, true);

  const unsupported = createBackend({ platform: "linux", allowlist });
  await assert.rejects(() => unsupported.invoke("open_latest_release"), /only in the Windows app/);
});

test("Windows Graphics settings shortcut opens a fixed allowlisted Settings URI", async () => {
  const spawnCalls = [];
  const child = new EventEmitter();
  child.unref = () => { child.wasUnrefed = true; };
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows" },
    allowlist,
    fs: { statSync: () => ({ isFile: () => true }) },
    spawn(executable, args, options) {
      spawnCalls.push({ executable, args, options });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  });
  await backend.invoke("open_windows_settings", { section: "graphics" });
  assert.equal(spawnCalls[0].executable, "C:\\Windows\\explorer.exe");
  assert.deepEqual(spawnCalls[0].args, ["ms-settings:display-advancedgraphics"]);
  assert.equal(spawnCalls[0].options.shell, false);
  await assert.rejects(() => backend.invoke("open_windows_settings", { section: "https://example.com" }), /Unsupported Windows Settings destination/);

  const unsupported = createBackend({ platform: "linux", allowlist });
  await assert.rejects(() => unsupported.invoke("open_windows_settings", { section: "graphics" }), /only on Windows/);
});

test("device snapshot returns read-only local hardware details", async () => {
  const expected = {
    manufacturer: "Example OEM",
    model: "Example Laptop",
    pcSystemType: 2,
    memoryBytes: 17179869184,
    processors: [{ name: "Example CPU", cores: 8, logicalProcessors: 16 }],
    graphicsAdapters: [{ name: "Example GPU", adapterRamBytes: 4294967296, driverVersion: "1.2.3" }],
    physicalDrives: [{ model: "Example SSD", sizeBytes: 512000000000 }],
    volumes: [{ drive: "C:", sizeBytes: 512000000000, freeBytes: 250000000000 }],
    operatingSystem: { name: "Windows", version: "10.0", architecture: "64-bit" }
  };
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows" },
    allowlist,
    fs: { statSync: () => ({ isFile: () => true }) },
    execFile: async (executable, args, options) => {
      assert.equal(executable, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
      assert.equal(args[0], "-NoLogo");
      assert.equal(options.shell, false);
      return { stdout: JSON.stringify(expected), stderr: "" };
    }
  });
  const result = await backend.invoke("device_snapshot");
  assert.equal(result.available, true);
  assert.equal(result.model, "Example Laptop");
  assert.equal(result.graphicsAdapters[0].name, "Example GPU");
  assert.equal(result.volumes[0].drive, "C:");
  assert.equal(result.safety.networkRequests, false);
  assert.equal(result.safety.dataUploaded, false);
});

test("startup storage snapshot reports fixed local drive capacity and free space only", async () => {
  const expected = {
    systemDrive: "C:",
    volumes: [
      { drive: "C:", label: "System", sizeBytes: 256000000000, freeBytes: 42000000000 },
      { drive: "D:", label: "Data", sizeBytes: 1000000000000, freeBytes: 500000000000 }
    ]
  };
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows", SystemDrive: "C:" },
    allowlist,
    fs: { statSync: () => ({ isFile: () => true }) },
    execFile: async (executable, args, options) => {
      assert.equal(executable, "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
      assert.equal(args[0], "-NoLogo");
      assert.match(args[4], /Win32_LogicalDisk/);
      assert.equal(options.shell, false);
      return { stdout: JSON.stringify(expected), stderr: "" };
    }
  });
  const result = await backend.invoke("storage_snapshot");
  assert.equal(result.available, true);
  assert.equal(result.systemDrive, "C:");
  assert.equal(result.volumes[0].freeBytes, 42000000000);
  assert.equal(result.safety.readOnly, true);
  assert.equal(result.safety.networkRequests, false);
  assert.equal(result.safety.dataUploaded, false);
});

test("exit-app command delegates to the native shell", async () => {
  let exitCount = 0;
  const backend = createBackend({ platform: "win32", allowlist, exitApp: () => { exitCount += 1; } });
  await backend.invoke("exit_app");
  assert.equal(exitCount, 1);
});

test("on-demand Roblox web probe is labeled as non-game ping and sends no payload", async () => {
  let called = 0;
  const backend = createBackend({
    platform: "win32",
    allowlist,
    probeRobloxLatency: async () => {
      called += 1;
      return { available: true, latencyMs: 42.5, message: "test TCP connect" };
    }
  });
  const result = await backend.invoke("probe_roblox_latency");
  assert.equal(called, 1);
  assert.equal(result.available, true);
  assert.equal(result.latencyMs, 42.5);
  assert.equal(result.endpoint, "www.roblox.com:443");
  assert.equal(result.gamePing, false);
  assert.equal(result.payloadSent, false);
});

test("Delta process scan uses an exact local image-name match", async () => {
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows" },
    allowlist,
    fs: { statSync: () => ({ isFile: () => true }) },
    execFile: async (_executable, args) => ({
      stdout: args[1] === "IMAGENAME eq Delta.exe" ? '"Delta.exe","1234","Console","1","90,000 K"' : "INFO: No tasks are running.",
      stderr: ""
    })
  });
  const result = await backend.invoke("scan_known_executor_processes");
  assert.equal(result.available, true);
  assert.deepEqual(result.matches, [{ productName: "Delta", processName: "Delta.exe" }]);
  assert.equal(result.networkRequests, false);
  assert.equal(result.automaticRemoval, false);
});

const providerWireGuardProfile = `[Interface]\nPrivateKey = AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\nAddress = 10.64.0.2/32\nDNS = 10.64.0.1\n\n[Peer]\nPublicKey = BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=\nAllowedIPs = 0.0.0.0/0, ::/0\nEndpoint = vpn.example.test:51820\nPersistentKeepalive = 25\n`;

test("WireGuard profile validator accepts provider configs and identifies full-tunnel routes", () => {
  assert.deepEqual(validateWireGuardConfig(providerWireGuardProfile), { peerCount: 1, fullTunnel: true });
  const splitTunnel = providerWireGuardProfile.replace("AllowedIPs = 0.0.0.0/0, ::/0", "AllowedIPs = 10.64.0.0/10");
  assert.deepEqual(validateWireGuardConfig(splitTunnel), { peerCount: 1, fullTunnel: false });
});

test("WireGuard profile validator rejects custom commands and incomplete peers", () => {
  const hook = providerWireGuardProfile.replace("DNS = 10.64.0.1", "DNS = 10.64.0.1\nPostUp = powershell.exe");
  assert.throws(() => validateWireGuardConfig(hook), /blocked for safety/);
  assert.throws(() => validateWireGuardConfig(providerWireGuardProfile.replace("Endpoint = vpn.example.test:51820\n", "")), /Endpoint/);
  assert.throws(() => validateWireGuardConfig("x".repeat(64 * 1024 + 1)), /64 KB/);
});

test("WireGuard integration is Windows-only and refuses to invent a provider", async () => {
  const backend = createBackend({ platform: "linux", allowlist });
  const status = await backend.invoke("wireguard_vpn_status");
  assert.equal(status.supported, false);
  assert.equal(status.serviceManaged, false);
  assert.equal(status.wireguardInstalled, false);
  await assert.rejects(() => backend.invoke("wireguard_vpn_import", { config: providerWireGuardProfile }), /only in the Windows desktop app/);
});

test("WireGuard refuses to treat a same-name foreign service as app-managed", async () => {
  const dataDir = "C:\\Users\\Tester\\AppData\\Local\\MarktisOptimizer";
  const profilePath = path.win32.join(dataDir, "wireguard", "MarktisOptimizer.conf.dpapi");
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows", ProgramFiles: "C:\\Program Files" },
    vpnDataDir: dataDir,
    allowlist,
    fs: { statSync: () => ({ isFile: () => true }) },
    execFile: async () => ({
      stdout: JSON.stringify({ present: true, running: true, matchesProfile: false }),
      stderr: ""
    })
  });
  const status = await backend.invoke("wireguard_vpn_status");
  assert.equal(status.servicePresent, true);
  assert.equal(status.serviceManaged, false);
  assert.equal(status.profileFilePresent, true);
  assert.equal(status.profileInstalled, false);
  assert.match(status.message, /could not be verified as this app's installed profile/);
  await assert.rejects(() => backend.invoke("wireguard_vpn_connect"), /could not be verified as this app's profile/);
  await assert.rejects(() => backend.invoke("wireguard_vpn_remove"), /could not be verified as this app's profile/);
  assert.ok(profilePath.endsWith("MarktisOptimizer.conf.dpapi"));
});

test("WireGuard recognizes only a service matched to the shared encrypted profile path", async () => {
  const dataDir = "C:\\Users\\Tester\\AppData\\Local\\MarktisOptimizer";
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows", ProgramFiles: "C:\\Program Files" },
    vpnDataDir: dataDir,
    allowlist,
    fs: { statSync: () => ({ isFile: () => true }) },
    execFile: async (_executable, _args, options) => {
      assert.equal(options.env.ROPTIMER_WG_EXE, "C:\\Program Files\\WireGuard\\wireguard.exe");
      assert.equal(options.env.ROPTIMER_WG_CONFIG, path.win32.join(dataDir, "wireguard", "MarktisOptimizer.conf.dpapi"));
      return { stdout: JSON.stringify({ present: true, running: true, matchesProfile: true }), stderr: "" };
    }
  });
  const status = await backend.invoke("wireguard_vpn_status");
  assert.equal(status.wireguardInstalled, true);
  assert.equal(status.serviceQueryAvailable, true);
  assert.equal(status.serviceManaged, true);
  assert.equal(status.profileFilePresent, true);
  assert.equal(status.profileInstalled, true);
  assert.equal(status.serviceRunning, true);
});

test("WireGuard can stop its verified service even if the encrypted profile file is missing", async () => {
  const dataDir = "C:\\Users\\Tester\\AppData\\Local\\MarktisOptimizer";
  const profilePath = path.win32.join(dataDir, "wireguard", "MarktisOptimizer.conf.dpapi");
  const actions = [];
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows", ProgramFiles: "C:\\Program Files" },
    vpnDataDir: dataDir,
    allowlist,
    fs: {
      statSync(file) {
        if (path.win32.normalize(file).toLowerCase() === path.win32.normalize(profilePath).toLowerCase()) throw new Error("missing profile");
        return { isFile: () => true };
      }
    },
    execFile: async (_executable, _args, options) => {
      if (options.env.ROPTIMER_WG_ACTION) {
        actions.push(options.env.ROPTIMER_WG_ACTION);
        return { stdout: "", stderr: "" };
      }
      return { stdout: JSON.stringify({ present: true, running: true, matchesProfile: true }), stderr: "" };
    }
  });
  const status = await backend.invoke("wireguard_vpn_disconnect");
  assert.deepEqual(actions, ["stop"]);
  assert.equal(status.serviceManaged, true);
  assert.equal(status.profileFilePresent, false);
});

test("WireGuard download shortcut opens only the official installer page", async () => {
  const spawnCalls = [];
  const child = new EventEmitter();
  child.unref = () => { child.wasUnrefed = true; };
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows" },
    allowlist,
    fs: { statSync: () => ({ isFile: () => true }) },
    spawn(executable, args, options) {
      spawnCalls.push({ executable, args, options });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  });
  await backend.invoke("open_wireguard_download", { url: "https://example.com/" });
  assert.equal(spawnCalls[0].executable, "C:\\Windows\\explorer.exe");
  assert.deepEqual(spawnCalls[0].args, [WIREGUARD_DOWNLOAD_URL]);
  assert.equal(spawnCalls[0].options.shell, false);
  assert.equal(child.wasUnrefed, true);
});

test("Discord community shortcut opens only the fixed invite in the system browser", async () => {
  const spawnCalls = [];
  const child = new EventEmitter();
  child.unref = () => { child.wasUnrefed = true; };
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows" },
    allowlist,
    fs: { statSync: () => ({ isFile: () => true }) },
    spawn(executable, args, options) {
      spawnCalls.push({ executable, args, options });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  });
  await backend.invoke("open_community_discord", { url: "https://example.com/" });
  assert.equal(spawnCalls[0].executable, "C:\\Windows\\explorer.exe");
  assert.deepEqual(spawnCalls[0].args, [COMMUNITY_DISCORD_URL]);
  assert.equal(spawnCalls[0].options.shell, false);
  assert.equal(child.wasUnrefed, true);
});

test("YouTube channel shortcut opens only the fixed channel URL in the system browser", async () => {
  const spawnCalls = [];
  const child = new EventEmitter();
  child.unref = () => { child.wasUnrefed = true; };
  const backend = createBackend({
    platform: "win32",
    env: { SystemRoot: "C:\\Windows" },
    allowlist,
    fs: { statSync: () => ({ isFile: () => true }) },
    spawn(executable, args, options) {
      spawnCalls.push({ executable, args, options });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  });
  await backend.invoke("open_youtube_channel", { url: "https://example.com/" });
  assert.equal(spawnCalls[0].executable, "C:\\Windows\\explorer.exe");
  assert.deepEqual(spawnCalls[0].args, [YOUTUBE_CHANNEL_URL]);
  assert.equal(spawnCalls[0].options.shell, false);
  assert.equal(child.wasUnrefed, true);
});

test("Electron command bridge rejects unknown commands and reports its shell", async () => {
  const backend = createBackend({ platform: "linux", allowlist });
  await assert.rejects(() => backend.invoke("run_shell", { command: "anything" }), /Unsupported local desktop command/);
  const info = backend.appInfo();
  assert.equal(info.product, "Marktis Optimizer");
  assert.equal(info.framework, "Electron");
  assert.equal(info.safety.networkRequests, true);
  assert.equal(info.safety.networkProbeOnDemand, true);
  assert.equal(info.allowlistFlags, allowed.size);
});
