# Roptimer FastFlag allowlist — Geometry, Rendering, User Interface

This is the canonical allowlist used by Roptimer for local
`ClientAppSettings.json` management. It is a **Windows-only client feature**:
the allowlist manager lives in the Rust + Tauri Windows client (and the website
Client tab). The macOS companion is a separate, legacy tool.

Source: <https://devforum.roblox.com/t/allowlist-for-local-client-configuration-via-fast-flags/3966569>

Only these **18** local flags are recognized as allowlisted managed keys.
Roptimer may preserve, back up, merge, and restore them. It never injects code,
reads game memory, disables Roblox diagnostics, or executes scripts inside a
Roblox experience.

The machine-readable [`fastflags-allowlist.json`](../fastflags-allowlist.json)
now ships `categoryDescriptions` and a `flagFeatures` entry for each flag with
a short feature name, a value hint, and **what it improves**. The website Client
and Allowlist tabs render these details; the Rust client embeds the same JSON.

---

## Geometry — 4 flags

*Improves:* how far detailed geometry is kept before the client swaps in cheaper
meshes. Cuts GPU/CPU work in complex places and is the **safe** way to reduce
"building lag" — it never deletes buildings, changes collisions, or edits
gameplay geometry.

| Flag | Feature | What it improves | Value hint |
| --- | --- | --- | --- |
| `DFIntCSGLevelOfDetailSwitchingDistance` | Base LOD distance | Base distance where detailed CSG geometry switches to a cheaper mesh | Distance in studs; lower = switch sooner |
| `DFIntCSGLevelOfDetailSwitchingDistanceL12` | LOD tier 1→2 distance | First downgrade so mid-range parts simplify sooner | Distance in studs |
| `DFIntCSGLevelOfDetailSwitchingDistanceL23` | LOD tier 2→3 distance | Second downgrade for far geometry detail | Distance in studs |
| `DFIntCSGLevelOfDetailSwitchingDistanceL34` | LOD tier 3→4 distance | Final downgrade so distant geometry costs less | Distance in studs |

---

## Rendering — 13 flags

*Improves:* the biggest FPS levers — textures, anti-aliasing, DPI scaling, sky,
voxel lighting, FRM quality level, grass distance, and the Direct3D / Vulkan /
OpenGL renderer choice. All are local, reversible rendering settings.

| Flag | Feature | What it improves | Value hint |
| --- | --- | --- | --- |
| `FFlagHandleAltEnterFullscreenManually` | Manual Alt+Enter fullscreen | Client handles Alt+Enter itself, avoiding a display mode reset | true / false |
| `DFFlagTextureQualityOverrideEnabled` | Texture override switch | Fixed texture-quality tier stops auto-raising detail | true / false |
| `DFIntTextureQualityOverride` | Texture quality tier | Lower resolution uses less VRAM/bandwidth | 0-3 |
| `FIntDebugForceMSAASamples` | Force MSAA sample count | Caps anti-aliasing samples to cut per-frame GPU cost | 1, 2, 4 |
| `DFFlagDisableDPIScale` | Disable DPI scaling | Native-pixel rendering, less blur and overhead | true / false |
| `FFlagDebugGraphicsPreferD3D11` | Prefer Direct3D 11 | Stable renderer on older GPUs | true / false (exclusive) |
| `FFlagDebugSkyGray` | Neutral gray sky | Flat sky saves fill-rate | true / false |
| `DFFlagDebugPauseVoxelizer` | Pause voxelizer | Stops lighting/voxel rebuild to reduce CPU spikes | true / false |
| `DFIntDebugFRMQualityLevelOverride` | FRM quality level | Lower overall graphics detail (shadows/effects) | 0-21 (above 10 = legacy/micro) |
| `FIntFRMMaxGrassDistance` | Max grass draw distance | Distant grass stops costing GPU time | Distance in studs |
| `FIntFRMMinGrassDistance` | Min grass detail distance | How close grass must be for full detail | Distance in studs |
| `FFlagDebugGraphicsPreferVulkan` | Prefer Vulkan | Lower-overhead graphics path where supported | true / false (exclusive) |
| `FFlagDebugGraphicsPreferOpenGL` | Prefer OpenGL | Renderer for legacy GPUs | true / false (exclusive) |

Renderer preference flags (`FFlagDebugGraphicsPreferD3D11`,
`FFlagDebugGraphicsPreferVulkan`, `FFlagDebugGraphicsPreferOpenGL`) are mutually
exclusive; the optimizer writes at most one when a renderer is selected.

---

## User Interface — 1 flag

*Improves:* animated environmental detail for a calmer, cheaper, reduced-motion
scene. A local UI/motion setting, not gameplay automation.

| Flag | Feature | What it improves | Value hint |
| --- | --- | --- | --- |
| `FIntGrassMovementReducedMotionFactor` | Reduced grass motion | Less animated grass sway/movement | 0-100 (higher = less movement) |

---

## Legacy flag, not allowlisted

`DFIntTaskSchedulerTargetFps` is tracked separately as a **legacy compatibility
flag**. Current allowlisted Roblox clients may silently ignore it, so Roptimer
does **not** write it during apply. Roptimer recommends Roblox Settings →
Maximum Framerate for supported frame-rate changes.

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

The authoritative JSON is [`fastflags-allowlist.json`](../fastflags-allowlist.json).
`build_downloads.py` keeps it in sync with:

- `dotnet/src/Roptimer.Core/fastflags-allowlist.json` — legacy C# core (embedded).
- `web/downloads/fastflags-allowlist.json` — direct website download.
- `web/index.html` — embedded for the website Client/Allowlist tabs.
- `rust/frontend/downloads/fastflags-allowlist.json` — Tauri app copy.
- `rust/src-tauri` — embedded at compile time by `build.rs`.
- Windows/macOS/source packages — included with the documentation.

CLI:

```bash
python3 roblox_fps_optimizer.py --allowlist
RoptimerBoost.exe allowlist
./Roptimer\ Boost.command --allowlist
```
