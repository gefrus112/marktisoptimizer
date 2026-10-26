# How Roptimer works

Roptimer is a **local settings optimizer**, not a Roblox exploit, executor, or memory editor. It changes a small JSON file that Roblox reads when the desktop client starts, then keeps a backup so you can undo the change.

---

## 1. Discover the client

### Windows

Roptimer looks for Roblox Player version folders in locations such as:

```text
%LOCALAPPDATA%\Roblox\Versions\version-*\ClientSettings\ClientAppSettings.json
%LOCALAPPDATA%\Roblox\ClientSettings\ClientAppSettings.json
```

It also checks common Program Files installs, the registered Roblox client path, optional running-process paths, and a user-selected custom folder.

### macOS

Roptimer checks the standard app-bundle settings path:

```text
/Applications/Roblox.app/Contents/MacOS/ClientSettings/ClientAppSettings.json
```

It also accepts a user-selected custom folder. macOS updates can replace this folder, so re-run `apply` after a Roblox update.

---

## 2. Generate a safe profile

Roptimer only writes keys from the canonical [`fastflags-allowlist.json`](../fastflags-allowlist.json). The full allowlist has **18** flags in three categories:

| Category | Flags |
| --- | --- |
| Geometry | `DFIntCSGLevelOfDetailSwitchingDistance`, `DFIntCSGLevelOfDetailSwitchingDistanceL12`, `DFIntCSGLevelOfDetailSwitchingDistanceL23`, `DFIntCSGLevelOfDetailSwitchingDistanceL34` |
| Rendering | `FFlagHandleAltEnterFullscreenManually`, `DFFlagTextureQualityOverrideEnabled`, `DFIntTextureQualityOverride`, `FIntDebugForceMSAASamples`, `DFFlagDisableDPIScale`, `FFlagDebugGraphicsPreferD3D11`, `FFlagDebugSkyGray`, `DFFlagDebugPauseVoxelizer`, `DFIntDebugFRMQualityLevelOverride`, `FIntFRMMaxGrassDistance`, `FIntFRMMinGrassDistance`, `FFlagDebugGraphicsPreferVulkan`, `FFlagDebugGraphicsPreferOpenGL` |
| User Interface | `FIntGrassMovementReducedMotionFactor` |

`DFIntTaskSchedulerTargetFps` is tracked separately as a legacy compatibility flag and is **not** part of this allowlist.

Examples of flags Roptimer writes by default:

| Setting | Flag | Effect |
| --- | --- | --- |
| Geometry LOD | `DFIntCSGLevelOfDetailSwitchingDistance*` | Reduces how far detailed geometry is kept. |
| Graphics tier | `DFIntDebugFRMQualityLevelOverride` | Exposes quality values 0–21. |
| Texture tier | `DFIntTextureQualityOverride` | Reduces texture work. |
| MSAA | `FIntDebugForceMSAASamples` | Lowers anti-aliasing cost. |
| Grass | `FIntFRMMaxGrassDistance`, `FIntFRMMinGrassDistance` | Reduces grass rendering distance. |
| Legacy FPS | `DFIntTaskSchedulerTargetFps` | Compatibility only; current clients may ignore it. |

Roblox’s local FastFlag allowlist can change. Unlisted keys are ignored by the client, so Roptimer labels outdated keys as legacy instead of promising an FPS unlock.

---

## 3. Back up, merge, write

Before writing, Roptimer:

1. Reads the existing `ClientAppSettings.json`.
2. Removes only keys that Roptimer manages.
3. Preserves every unrelated key.
4. Creates a timestamped backup.
5. Writes the new values atomically.

This means your unrelated local settings are not discarded.

---

## 4. Restore

`restore` uses the recorded pre-apply state to put managed keys back. If the file contained only Roptimer-managed keys, the file is removed. A backup of the optimized file is kept before restoring.

---

## 5. Verify performance

Roptimer cannot read in-game FPS or ping from Roblox memory. Use Roblox’s built-in Performance Stats / Debug Stats instead:

- Press `Shift + F5` in an experience for debug stats.
- Open the Roblox menu and enable Performance Stats.
- Compare before/after results with the same experience, same graphics mode, and same server type.

Lowering graphics can improve frame time, but it cannot fix server lag, network latency, or a CPU/GPU bottleneck. Start with `Balanced` before using `Maximum performance`.

---

## What Roptimer never does

- No DLL injection, process hooks, or renderer hooks.
- No executable/DLL patching.
- No process memory reads/writes.
- No Roblox account, chat, player-list, or game-state extraction.
- No Crashpad, Backtrace, telemetry, or screenshot-report disabling.
- No fullbright, x-ray, building removal, collision edits, or anti-cheat bypass.
- No gameplay automation.

The website’s Script Hub is a local UI/scripting preview only; it does not send code into Roblox. See `FASTFLAG_ALLOWLIST.md` for the complete canonical list and safety boundaries.
