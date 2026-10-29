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
  restoredObject
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
