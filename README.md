# Roblox FPS & Performance Optimizer

A **safe, performance-only** Roblox Windows client settings utility written in one Python file, plus an offline web companion that generates the same JSON profile.

> **No hacks. No injection. No memory edits.** The app writes a reversible `ClientAppSettings.json` file, backs up the previous file, and can restore it. It does not patch executables/DLLs, inject code, hook the renderer, read game memory, automate gameplay, or bypass Roblox anti-cheat.

---

## What is included

| File | Purpose |
| --- | --- |
| `roblox_fps_optimizer.py` | Complete single-file Tkinter desktop app, core logic, CLI, and self-tests |
| `web/index.html` | Offline dark-themed web companion with tabs, FPS slider, toggles, JSON preview, copy/download |
| `requirements.txt` | Runtime dependencies (none required) |
| `requirements-optional.txt` | Optional `psutil` for better running-process detection |

---

## Run the desktop app

Requires **Windows**, **Python 3.10+**, and a Python build that includes **Tkinter**.

```powershell
cd path\to\robloxclinetbooster
python roblox_fps_optimizer.py
```

No third-party package is required. If `psutil` is installed, the app uses it only to identify the currently running Roblox executable:

```powershell
python -m pip install -r requirements-optional.txt
```

### Package as a Windows `.exe`

```powershell
python -m pip install pyinstaller
pyinstaller --noconfirm --onefile --windowed ^
  --name "Roblox FPS Optimizer" roblox_fps_optimizer.py
```

The executable will be in `dist\`. Because the app has no data files, no PyInstaller spec is required.

---

## Desktop app features

- Modern dark gaming UI using the requested `#1e1e24` panel color and neon violet/blue accents.
- Sidebar navigation: **Dashboard, Optimizer, Client Link, JSON Preview, Activity Log, Safe Guide**.
- FPS slider and exact input from **60** to **9999**.
- Quick presets: 60, 120, 144, 165, 240, and 9999/MAX.
- Toggle switches for:
  - **Optimize Rendering Paths**
  - **Lower Hidden Textures**
  - **Reduce Grass Motion**
  - **Write legacy `DFIntTaskSchedulerTargetFps`**
- Graphics dropdowns for renderer, graphics quality, texture quality, anti-aliasing, and grass motion.
- Prominent **Apply Optimizations & Launch** button.
- In-window status log with success, warning and error colors.
- Detects any common Windows Roblox player version:
  - `%LOCALAPPDATA%\Roblox\Versions\version-*`
  - `%ProgramFiles(x86)%\Roblox\Versions`
  - `%ProgramFiles%\Roblox\Versions`
  - Windows Registry `clientExe` path
  - Optional running-process path via `psutil`
  - User-selected custom `version-*` folder
- Can write to the active version, **every detected version**, a custom folder, or the persistent shared `%LOCALAPPDATA%\Roblox\ClientSettings` profile.
- Auto-syncs newly created Roblox version folders.
- Creates `ClientSettings\ClientAppSettings.json` if missing.
- Merges only its own managed keys and preserves unrelated keys.
- Creates timestamped backups before every write.
- One-click **Restore** returns previous managed values and removes optimizer-only files.
- Launches Roblox through the normal `roblox://` protocol, with a safe website fallback.

---

## Important 2026 compatibility note

Roblox introduced a local FastFlag allowlist in September 2025. The legacy flag:

```json
{
  "DFIntTaskSchedulerTargetFps": 144
}
```

is **not on the current allowlist**, so modern clients normally ignore it. Writing an unlisted key is harmless according to Roblox — it is simply ignored — but it should not be presented as a guaranteed FPS unlock. This app still supports the requested legacy flag for older client builds and labels it clearly.

For the supported frame-rate control, use the in-experience menu:

**Esc → Settings → Maximum Framerate**

Roblox’s official supported maximum is **240 FPS**. Values such as `9999` are only a ceiling, not a promise of 9999 real frames per second; extremely high values can cause heat, stutter, or physics instability.

The active rendering optimizations use keys from Roblox’s published allowlist, such as:

- `DFIntDebugFRMQualityLevelOverride`
- `DFFlagTextureQualityOverrideEnabled`
- `DFIntTextureQualityOverride`
- `FIntDebugForceMSAASamples`
- `DFFlagDebugPauseVoxelizer`
- `DFIntCSGLevelOfDetailSwitchingDistance*`
- `FFlagDebugGraphicsPreferD3D11` / `FFlagDebugGraphicsPreferVulkan` / `FFlagDebugGraphicsPreferOpenGL`
- `FIntGrassMovementReducedMotionFactor`

Roblox can change the allowlist at any time.

---

## Example generated JSON

```json
{
  "DFFlagDebugPauseVoxelizer": "True",
  "DFFlagTextureQualityOverrideEnabled": "True",
  "DFIntCSGLevelOfDetailSwitchingDistance": "100",
  "DFIntCSGLevelOfDetailSwitchingDistanceL12": "75",
  "DFIntCSGLevelOfDetailSwitchingDistanceL23": "100",
  "DFIntCSGLevelOfDetailSwitchingDistanceL34": "150",
  "DFIntDebugFRMQualityLevelOverride": "1",
  "DFIntTaskSchedulerTargetFps": "144",
  "DFIntTextureQualityOverride": "1",
  "FFlagHandleAltEnterFullscreenManually": "True",
  "FIntDebugForceMSAASamples": "1",
  "FIntGrassMovementReducedMotionFactor": "0"
}
```

Target location:

```text
%LOCALAPPDATA%\Roblox\Versions\version-*\ClientSettings\ClientAppSettings.json
```

Some builds also read:

```text
%LOCALAPPDATA%\Roblox\ClientSettings\ClientAppSettings.json
```

Settings are read when Roblox starts. **Close and reopen Roblox after applying.**

---

## Web companion

Open `web/index.html` directly in a browser, or serve it locally:

```bash
python -m http.server 8000 --directory web
```

Then visit `http://localhost:8000`.

The web companion:

- Uses the same dark layout and settings language.
- Generates a live `ClientAppSettings.json` preview.
- Lets you copy or download the JSON.
- Explains the safe manual installation path.
- Does **not** claim to access Roblox files from the browser; the Python desktop app performs the safe file writes.

---

## Console / automation commands

```powershell
# Headless correctness test (works on Linux/macOS too)
python roblox_fps_optimizer.py --self-test

# Preview the generated JSON
python roblox_fps_optimizer.py --preview
python roblox_fps_optimizer.py --preview --fps 240

# Apply saved settings without opening the GUI
python roblox_fps_optimizer.py --apply --fps 144 --all-versions --no-launch

# Restore every location this app changed
python roblox_fps_optimizer.py --restore
```

The self-test creates a fake Roblox `Versions` tree in a temporary directory and verifies discovery, JSON merging, backups, multi-version writes, and restore.

State and target snapshots are stored under:

```text
%APPDATA%\RobloxFpsOptimizer\state.json
```

---

## Official references

- Roblox DevForum — [Allowlist for local client configuration via Fast Flags](https://devforum.roblox.com/t/allowlist-for-local-client-configuration-via-fast-flags/3966569)
- Roblox Support — [Graphics Quality](https://en.help.roblox.com/hc/en-us/articles/203314310-Graphics-Quality)
- Roblox Support — [How to Reduce Lag and Speed Up Play](https://en.help.roblox.com/hc/en-us/articles/203314150-How-to-Reduce-Lag-and-Speed-Up-Play)
- Roblox DevForum — [Introducing the Maximum Framerate setting](https://devforum.roblox.com/t/introducing-the-maximum-framerate-setting/2995965)

---

## Disclaimer

This is an independent performance configuration utility. Roblox, Fast Flags, client paths and allowed settings can change without notice. Use the **Restore** button if a client update behaves unexpectedly. The app intentionally avoids exploit-style features and anything that could be considered a hacking toolbox.
