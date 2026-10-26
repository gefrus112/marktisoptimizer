# Roptimer FastFlag allowlist

This is the canonical allowlist used by Roptimer for local `ClientAppSettings.json` management.

Source: <https://devforum.roblox.com/t/allowlist-for-local-client-configuration-via-fast-flags/3966569>

Only these **18** local flags are recognized as allowlisted managed keys. Roptimer may preserve, back up, merge, and restore them. It never injects code, reads game memory, disables Roblox diagnostics, or executes scripts inside a Roblox experience.

---

## Geometry

- `DFIntCSGLevelOfDetailSwitchingDistance`
- `DFIntCSGLevelOfDetailSwitchingDistanceL12`
- `DFIntCSGLevelOfDetailSwitchingDistanceL23`
- `DFIntCSGLevelOfDetailSwitchingDistanceL34`

These control how far detailed CSG geometry is kept before switching to simpler levels. Lower values can reduce GPU/CPU work in complex places. They do **not** remove buildings, change collision, or alter gameplay geometry.

---

## Rendering

- `FFlagHandleAltEnterFullscreenManually`
- `DFFlagTextureQualityOverrideEnabled`
- `DFIntTextureQualityOverride`
- `FIntDebugForceMSAASamples`
- `DFFlagDisableDPIScale`
- `FFlagDebugGraphicsPreferD3D11`
- `FFlagDebugSkyGray`
- `DFFlagDebugPauseVoxelizer`
- `DFIntDebugFRMQualityLevelOverride`
- `FIntFRMMaxGrassDistance`
- `FIntFRMMinGrassDistance`
- `FFlagDebugGraphicsPreferVulkan`
- `FFlagDebugGraphicsPreferOpenGL`

These cover fullscreen behavior, texture quality overrides, anti-aliasing, DPI scaling, renderer preference, sky/voxel debug rendering, FRM quality levels, and grass draw distance.

Roptimer writes only conservative subsets of these flags by default. Renderer preference flags (`FFlagDebugGraphicsPreferD3D11`, `FFlagDebugGraphicsPreferVulkan`, `FFlagDebugGraphicsPreferOpenGL`) are mutually exclusive; the Python optimizer writes at most one when the user selects a renderer.

---

## User Interface

- `FIntGrassMovementReducedMotionFactor`

This controls reduced grass motion. Roptimer uses it as part of the safe VFX / world-detail reduction profile. It is a local UI/motion setting, not a gameplay automation feature.

---

## Legacy flag, not allowlisted

`DFIntTaskSchedulerTargetFps` is tracked separately as a **legacy compatibility flag**. Current allowlisted Roblox clients may silently ignore it. Roptimer labels it clearly and recommends Roblox Settings → Maximum Framerate for supported frame-rate changes.

---

## Rejected categories

Roptimer does **not** add allowlist entries for:

- Roblox telemetry suppression.
- Crashpad or Backtrace disabling.
- Screenshot/report upload disabling.
- Fullbright, x-ray, building removal, or collision edits.
- Anti-cheat bypass.
- DLL injection, process hooks, or memory patching.
- Executor APIs, `loadstring`, remote exploit hubs, or game script execution.

---

## Machine-readable version

The authoritative JSON is [`fastflags-allowlist.json`](../fastflags-allowlist.json). It is copied to:

- `dotnet/src/Roptimer.Core/fastflags-allowlist.json` — embedded in the C# core.
- `web/downloads/fastflags-allowlist.json` — direct website download.
- `web/index.html` — embedded for the website Docs tab.
- Windows/macOS/source packages — included with the documentation.

CLI:

```bash
python3 roblox_fps_optimizer.py --allowlist
RoptimerBoost.exe allowlist
./Roptimer\ Boost.command --allowlist
```
