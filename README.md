# Roptimer Hub V3.1 — safe Roblox performance tooling

A **safe, performance-only** Roblox settings utility. V3.1 keeps the original Windows **C#/.NET 8 WPF desktop app** and adds a **Sirius-inspired dark website**, a **macOS Python/Tkinter companion**, full CLI/how-it-works docs, and an original **Script Hub** local UI preview.

> **No hacks. No injection. No memory/account reads. No game script execution.** Roptimer writes reversible `ClientAppSettings.json` files, backs them up, and can restore them. It does not inject DLLs, patch executables, hook the renderer, read game memory or account data, disable Roblox telemetry/Crashpad/Backtrace, add fullbright/x-ray, remove buildings, automate gameplay, bypass anti-cheat, or execute scripts inside a Roblox game.

---

## What is included

| Path | Purpose |
| --- | --- |
| `dotnet/Roptimer.sln` | C#/.NET 8 solution for the V3 Windows app |
| `dotnet/src/Roptimer.App` | WPF desktop app — `Roptimer.exe` |
| `dotnet/src/Roptimer.Core` | Shared services, FastFlags, settings, backup/restore, session detection, cache quarantine, feature catalog, CLI runner, self-test |
| `dotnet/src/Roptimer.Cli` | Console Boost CLI — `RoptimerBoost.exe` |
| `dotnet/build-windows.ps1` | Build, self-test, publish, and package on Windows |
| `.github/workflows/build-windows.yml` | GitHub Actions workflow that builds the real Windows EXEs |
| `.github/workflows/build-macos.yml` | GitHub Actions workflow that builds `Roptimer.app` and `roptimer-boost` on macOS |
| `mac/` | macOS `.command` launchers and `.app` bundle metadata |
| `docs/` | CLI reference, how-it-works, macOS guide, Script Hub guide, Mac release notes |
| `feature-status.json` | Shared implemented / legacy / rejected feature catalog |
| `web/index.template.html` | Source template for the Sirius-style dark download portal |
| `web/assets/sirius.css` | Dark website styles |
| `web/assets/sirius.js` | Tabs, command builder, feature cards, Script Hub preview, screenshot lightbox |
| `web/assets/sirius-*.svg` | Original product screenshots |
| `build_screenshots.py` | Generates the SVG screenshots |
| `web/index.html` | Generated static website |
| `web/downloads/` | Generated download files, macOS packages, docs, and Windows support files |
| `roblox_fps_optimizer.py` | Cross-platform Python/Tkinter optimizer with Windows and macOS discovery |
| `roptimer_hud.py` | Optional always-on-top HUD, updated to V3.1 |
| `build_website.py` | Generates `web/index.html` from the template and feature catalog |
| `build_downloads.py` | Regenerates the website and all download packages |

---

## Website

`web/index.html` is now a near-black, starfield site with a Sirius-like top menu, serif hero, amber diamond accents, and no green neon status dots. It has **three main tabs**:

1. **Download** — Windows EXE/app links from the GitHub release, macOS `.app`/companion downloads, source ZIP, CLI docs helper, SHA256 checksum, and safety notes.
2. **Docs & How it works** — how local JSON/backup/restore works, Windows and macOS Boost CLI commands for better performance, a settings/command builder, feature-status matrix, sources, and safety.
3. **Scripts** — the original Roptimer Script Hub with Luau-inspired local UI recipes, a Sirius/Rayfield-like loading GUI preview, copyable code cards, and five SVG screenshots.

The Script Hub is a **local website preview only**. It does not provide a Roblox executor, `loadstring`, game services, remote script fetching, or exploit APIs.

Serve locally:

```bash
python3 -m http.server 8000 --directory web
```

Then open `http://localhost:8000`.

---

## Downloads

### Windows

Release: [v3.0.0-windows](https://github.com/gefrus112/robloxclinetbooster/releases/tag/v3.0.0-windows)

Assets include `Roptimer.exe`, `RoptimerBoost.exe`, `Roptimer-Windows-x64.zip`, source ZIP, checksums, and support files. The Windows app requires the .NET 8 Desktop Runtime.

### macOS

Release: [v3.1.0-mac](https://github.com/gefrus112/robloxclinetbooster/releases/tag/v3.1.0-mac)

Assets include `Roptimer-Mac.zip` (packaged macOS app build from GitHub Actions), `Roptimer-Mac-Companion.zip` (portable Python/Tkinter package), SHA256 checksums, and docs. The Mac package is unsigned: right-click → Open on first launch.

The macOS companion targets:

```text
/Applications/Roblox.app/Contents/MacOS/ClientSettings/ClientAppSettings.json
```

Roblox updates may replace this folder; re-run `apply` after an update. See `docs/MAC.md`.

---

## Version 3 desktop app

The WPF app keeps its blue Lumina theme and a Bubblestrap/Bloxstrap-inspired left navigation rail, breadcrumb, card pages, and bottom Save / Save & Launch / Close bar. No Bubblestrap or Bloxstrap source code or assets are copied.

Pages:

- **Dashboard** — quick modes, hardware profile, Roblox version count, feature status.
- **Boost** — optimization mode, FPS target, graphics tier 0–21, texture tier 0–3, VFX reducer, building-lag reducer, generated CLI command, and JSON preview.
- **FastFlags** — exact generated `ClientAppSettings.json`, managed flag matrix, allowlist status.
- **Session** — safe OS-level client detection, locally typed display name, readiness notification.
- **Settings** — theme, delivery options, cache quarantine, feature status matrix, settings file.
- **Safety** — explicit audit of implemented and rejected features.
- **About** — version, commands, sources, and layout attribution.

---

## Safe feature matrix

| Requested idea | Status in V3.1 |
| --- | --- |
| Unlocking FPS / `DFIntTaskSchedulerTargetFps` | **Legacy only.** Written for older clients, clearly labelled as possibly ignored by current allowlisted clients. Use Roblox Settings → Maximum Framerate. |
| Better FPS / optimization modes | **Implemented.** Better FPS, Reduce building lag, Balanced, Maximum performance, Visual quality, and auto-selected mode. |
| Reduce building lag | **Implemented safely.** Lowers geometry LOD distance, grass distance, textures, MSAA, and motion. Does not remove buildings or change collision. |
| Texture and cache alterations | **Implemented safely.** Texture tiers 0–3 through the allowlisted texture override, plus conservative quarantine of old log/temp files. |
| Extended graphic tiers | **Implemented.** `DFIntDebugFRMQualityLevelOverride` values 0–21. Values above 10 are legacy/micro levels. |
| Client detection / username / notification | **Implemented safely.** OS process/window metadata only; display name is typed locally. |
| CLI injector / “boost strap” | **Reinterpreted as a safe CLI controller.** `RoptimerBoost.exe` and `Roptimer Boost.command` never inject a DLL. |
| macOS app/downloads | **Implemented as a companion.** Python/Tkinter app with `.command` launchers, `.app` terminal launcher, Mac path discovery, and a macOS CI build. |
| Sirius-style dark website | **Implemented.** Three tabs, top menu, serif hero, starfield, screenshots, and no green neon dots. |
| Luau / Script Hub / GUI loading scripting | **Implemented safely as local UI previews.** Luau-inspired `Roptimer.UI` recipes run only as hardcoded website animations. No Roblox game execution. |
| Disabling Crashpad / Backtrace / telemetry / screenshot uploads | **Rejected.** Hidden diagnostic flags are not allowlisted and are not written. |
| DLL injection, executor APIs, fullbright, x-ray, building removal, anti-cheat bypass, automation | **Rejected.** |

---

## Build the Windows EXEs

Requirements: Windows 10/11, .NET 8 SDK, and .NET 8 Desktop Runtime to run the framework-dependent single-file EXEs.

```powershell
.\dotnet\build-windows.ps1
```

Outputs in `dotnet/artifacts`:

```text
Roptimer.exe
RoptimerBoost.exe
Roptimer-Windows-x64.zip
Roptimer-DotNet-Source.zip
SHA256SUMS.txt
```

GitHub Actions runs the same build on `windows-latest` when the .NET source or workflow changes.

---

## Build the macOS companion

The macOS workflow runs on `macos-latest`, installs Python/PyInstaller, generates an `.icns` icon, runs the optimizer self-test, builds `Roptimer.app` and `roptimer-boost`, packages a ZIP, and uploads release assets.

To regenerate the portable Python package locally:

```bash
python3 build_downloads.py
```

This also creates `web/downloads/Roptimer-Mac.zip`, `Roptimer-Mac-Companion.zip`, SHA256 checksums, docs, and the updated source ZIP.

---

## Boost CLI commands

### Windows

```powershell
RoptimerBoost.exe open
RoptimerBoost.exe bootstrap --launch
RoptimerBoost.exe preview --mode "Reduce building lag" --tier 21 --texture 0
RoptimerBoost.exe apply --mode "Better FPS" --fps 144 --all-versions
RoptimerBoost.exe restore
RoptimerBoost.exe session
RoptimerBoost.exe features
RoptimerBoost.exe tiers
RoptimerBoost.exe modes
RoptimerBoost.exe cache-report --days 7
RoptimerBoost.exe cache-clean --days 7 --force
RoptimerBoost.exe self-test
RoptimerBoost.exe build-info
```

### macOS / portable Python

```bash
./Roptimer\ Boost.command --preview
./Roptimer\ Boost.command --apply --mode "Reduce building lag" --graphics-tier 21 --texture-tier 0 --all-versions --no-launch
./Roptimer\ Boost.command --restore
./Roptimer\ Boost.command --features
./Roptimer\ Boost.command --self-test

python3 roblox_fps_optimizer.py --preview
python3 roblox_fps_optimizer.py --cache-report --cache-days 7
```

`open` is the Windows command to launch the desktop app. `bootstrap` chooses a recommended mode, applies safe local settings, and opens the desktop app; add `--launch` to also open Roblox through `roblox://`.

Full reference: `docs/CLI.md`.

---

## Cross-platform Python tools

The original single-file Python app remains as a companion/fallback and now supports Windows and macOS discovery, backups, restore, and normal URL/app launching.

```bash
python3 roblox_fps_optimizer.py
python3 roptimer_hud.py --settings hud-settings.json
```

Headless checks:

```bash
python3 roblox_fps_optimizer.py --self-test
python3 roblox_fps_optimizer.py --preview
python3 roblox_fps_optimizer.py --features
python3 roblox_fps_optimizer.py --tiers
python3 roblox_fps_optimizer.py --modes
python3 roblox_fps_optimizer.py --cache-report --cache-days 7
python3 roblox_fps_optimizer.py --build-info
python3 roptimer_hud.py --self-test
python3 build_screenshots.py
python3 build_downloads.py
```

After changing the Python apps, icons, docs, website template, screenshots, or feature catalog, run `python3 build_downloads.py` again.

---

## Safety / compatibility sources

- Roblox FastFlag allowlist announcement — <https://devforum.roblox.com/t/allowlist-for-local-client-configuration-via-fast-flags/3966569>
- Roblox QualityLevel enum (0–21) — <https://create.roblox.com/docs/reference/engine/enums/QualityLevel>
- Allowlisted Roblox FastFlags guide and 0–21 FRM range — <https://github.com/dyokism/sober-fastflags>
- Roblox graphics quality help — <https://en.help.roblox.com/hc/en-us/articles/203314310-Graphics-Quality>
- `ClientAppSettings.json` folder locations, including macOS — <https://devforum.roblox.com/t/fast-flags-clientappsettingsjson-folder-locations-for-most-os-eg-windows-macos-android-and-ios/3180597>
- Roblox built-in performance stats — <https://create.roblox.com/docs/performance-optimization/identify>
- Bubblestrap layout reference — <https://github.com/ItzBloxxy/Bubblestrap>
- Bloxstrap original project — <https://github.com/bloxstraplabs/bloxstrap>

The allowlist can change at any time. Current clients may ignore `DFIntTaskSchedulerTargetFps`; the app labels it as legacy. For real in-game FPS/ping, use Roblox's built-in Performance Stats / Debug Stats overlay.
