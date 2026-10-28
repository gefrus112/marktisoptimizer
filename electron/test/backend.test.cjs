"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  allowlistedKeys,
  buildManaged,
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

test("Electron command bridge rejects unknown commands and reports its shell", async () => {
  const backend = createBackend({ platform: "linux", allowlist });
  await assert.rejects(() => backend.invoke("run_shell", { command: "anything" }), /Unsupported local desktop command/);
  const info = backend.appInfo();
  assert.equal(info.framework, "Electron");
  assert.equal(info.safety.networkRequests, false);
  assert.equal(info.allowlistFlags, allowed.size);
});
