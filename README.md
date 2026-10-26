# Roblox FPS & Performance Optimizer

A **safe, performance-only** Roblox Windows client settings utility written in one Python file, plus an offline web companion that generates the same JSON profile.

> **No hacks. No injection. No memory edits.** The app writes a reversible `ClientAppSettings.json` file, backs up the previous file, and can restore it. It does not patch executables/DLLs, inject code, hook the renderer, read game memory, automate gameplay, or bypass Roblox anti-cheat.

---

## What is included

| File | Purpose |
| --- | --- |
| `roblox_fps_optimizer.py` | Complete single-file Tkinter desktop app, core logic, CLI, and self-tests |
| `roptimer_hud.py` | Safe separate always-on-top ROPTIMER HUD window (FPS target, ping, CPU/RAM hints, notifications) |
| `web/index.html` | Red-themed offline **ROPTIMER** download portal with Download / Features / Screenshots / Safety tabs |
| `web/assets/` | SVG screenshots, favicon, website icon, Python-app icon, HUD icon, PNG and ICO exports |
| `web/downloads/` | Downloadable `Roptimzier.py`, `roptimer_hud.py`, `hud-settings.json`, and `Roptimzier-Windows.zip` |
| `assets/` | Icon copies used by the source Python apps at runtime |
| `build_downloads.py` | Regenerates `web/downloads/` and the Windows ZIP package after code or icon changes |
| `requirements.txt` | Runtime dependencies (none required) |
| `requirements-optional.txt` | Optional `psutil` for process detection and HUD CPU/RAM hints |

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
  --name "Roptimzier" ^
  --icon assets\roptimzier-app.ico ^
  --add-data "assets\roptimzier-app.ico;assets" ^
  roblox_fps_optimizer.py
```

The executable will be in `dist\`. The `--add-data` option embeds the custom app icon so the window title bar uses it. For the HUD, use `--icon assets\roptimer-hud.ico` and add `assets\roptimer-hud.ico;assets`.

---

## Desktop app features

- Modern dark gaming UI using the requested `#1e1e24` panel color and neon accents, now with custom red app icons.
- Sidebar navigation: **Dashboard, Quick Setup, Optimizer, Client Link, JSON Preview, Activity Log, Safe Guide**.
- **Quick Setup** page with big switches for FPS target, Performance Boost, Lag Rescue, VFX / world detail reducer, notifications, Bright UI and client sync.
- **Lag Rescue** preset: one click for the lowest safe graphics settings when a game stutters.
- **VFX reducer**: lowers safe graphics load with allowlisted quality/texture/MSAA/motion flags. It does not remove buildings, add full bright, or create x-ray vision.
- **Bright UI**: high-contrast app theme only; it never changes Roblox world lighting.
- **Notifications**: in-app toast messages for apply, restore, sync and auto-sync events.
- FPS slider and exact input from **60** to **9999**.
- Quick presets: 60, 120, 144, 165, 240, 9999/MAX, plus **Lag Rescue**.
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

## ROPTIMER website and Roptimer HUD

The website is now a **download portal**, not a web app. It uses a red/black ROPTIMER theme and focuses on one job: helping you download Roptimzier.

Open `web/index.html` directly in a browser, or serve it locally:

```bash
python -m http.server 8000 --directory web
```

Then visit `http://localhost:8000`.

### Website features

- Four tabs: **Download, Features, Screenshots, Safety**.
- Animated red grid, particles, glow rings, scanlines, glitch title, parallax app card, reveal animations, ripple buttons, ticker and scroll progress.
- Real icon assets: website favicon, website icon, Python-app icon and HUD icon (SVG, PNG and ICO).
- Three SVG screenshot-style UI previews: Dashboard, Quick Setup and Roptimer HUD.
- Download buttons for the complete Windows ZIP, `Roptimzier.py`, `roptimer_hud.py`, and `hud-settings.json`.
- Feature cards for FPS target, Performance Boost, Lag Rescue, VFX reducer, notifications, Bright UI, separate HUD, client sync, and one-click restore.
- Safety FAQ that clearly states: no injector, no full bright exploit, no building removal, no x-ray, no memory edits, no anti-cheat bypass, and no gameplay automation.

Regenerate the download package after changing the Python apps or icons:

```bash
python build_downloads.py
```

### Roptimer HUD

`roptimer_hud.py` is a separate always-on-top Python window. It can show:

- your configured **FPS target**;
- real TCP latency to `www.roblox.com:443` (“ping to Roblox”, not server/game ping);
- optional CPU/RAM system hints via `psutil`;
- HUD refresh rate, game profile and notification messages.

It does **not** show a memory-read in-game FPS value. Roblox already documents built-in Performance Stats / Debug Stats for real in-game FPS and ping [1](https://create.roblox.com/docs/performance-optimization/identify). The HUD can open that official guide.

Run it:

```powershell
python roptimer_hud.py --settings hud-settings.json
```

Download `hud-settings.json` from the website’s HUD Settings section and place it next to `roptimer_hud.py`, or pass its path with `--settings`.

```powershell
python roptimer_hud.py --self-test
python roptimer_hud.py --print-defaults
python roptimer_hud.py --no-gui
```

> **No ban-evasion promise:** no third-party tool can guarantee how Roblox will treat it. This project avoids exploit-style behavior by design: no injection, no memory reads, no anti-cheat bypass, no gameplay automation, and no hidden files. It writes local settings and runs a separate window.

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
- Roblox Creator Docs — [Identify performance issues / built-in Performance Stats](https://create.roblox.com/docs/performance-optimization/identify)
- Roblox Support — [Graphics Quality](https://en.help.roblox.com/hc/en-us/articles/203314310-Graphics-Quality)
- Roblox Support — [How to Reduce Lag and Speed Up Play](https://en.help.roblox.com/hc/en-us/articles/203314150-How-to-Reduce-Lag-and-Speed-Up-Play)
- Roblox DevForum — [Introducing the Maximum Framerate setting](https://devforum.roblox.com/t/introducing-the-maximum-framerate-setting/2995965)

---

## Disclaimer

This is an independent performance configuration utility. Roblox, Fast Flags, client paths and allowed settings can change without notice. Use the **Restore** button if a client update behaves unexpectedly. The app intentionally avoids exploit-style features and anything that could be considered a hacking toolbox.
