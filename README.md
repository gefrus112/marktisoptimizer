# Roblox FPS & Performance Optimizer

A **safe, performance-only** Roblox Windows client settings utility written in one Python file, plus an offline web companion that generates the same JSON profile.

> **No hacks. No injection. No memory edits.** The app writes a reversible `ClientAppSettings.json` file, backs up the previous file, and can restore it. It does not patch executables/DLLs, inject code, hook the renderer, read game memory, automate gameplay, or bypass Roblox anti-cheat.

---

## What is included

| File | Purpose |
| --- | --- |
| `roblox_fps_optimizer.py` | Complete single-file Tkinter desktop app, core logic, CLI, and self-tests |
| `roptimer_hud.py` | Safe separate always-on-top ROPTIMER HUD window (FPS target, ping, CPU/RAM hints, notifications) |
| `web/index.html` | Red-themed offline **ROPTIMER** website: downloads, device lab, profile builder, game lab, HUD settings, safety FAQ |
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

## ROPTIMER website and Roptimer HUD

The website is now a full red/black **ROPTIMER** landing and performance lab for the **Roptimzier** app.

Open `web/index.html` directly in a browser, or serve it locally:

```bash
python -m http.server 8000 --directory web
```

Then visit `http://localhost:8000`.

### Website features

- Animated red grid, particles, glow rings, scanlines, glitch title, parallax monitor, reveal animations, ripple buttons and scroll progress.
- Direct downloads for `roblox_fps_optimizer.py`, `roptimer_hud.py`, generated `ClientAppSettings.json`, `hud-settings.json`, and a game test plan.
- **Device Lab**: reads privacy-safe browser hints such as CPU threads, memory hint, WebGL GPU string, connection info, screen size, battery presence, and an estimated display refresh rate. You can manually choose school laptop, ultrabook, gaming laptop, or desktop.
- **Profile Builder**: FPS slider, graphics/texture dropdowns, rendering toggles and a live JSON preview.
- **Game Lab**: offline test plans for roleplay, combat, shooter, open-world, obby, and simulator-style Roblox experiences. It does not connect to a game or read live game data.
- **HUD Settings**: choose FPS target display, ping, CPU/RAM hints, notifications, low-FPS reminders, ping-spike alerts, corner position, opacity, red accent, and game profile.
- **Safety FAQ**: clearly states that no injector, exploit, memory reader, anti-cheat bypass, stealth, or gameplay automation is included.

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
