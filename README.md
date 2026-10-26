# Roptimer Hub V3 — safe Roblox performance bootstrapper

A **safe, performance-only** Roblox Windows settings utility. Version 3 adds an original **C#/.NET 8 WPF desktop app** with a Bubblestrap/Bloxstrap-inspired settings layout, a custom shield app icon, a blue Lumina interface, a Settings tab, and a safe `RoptimerBoost.exe` CLI/bootstrapper.

> **No hacks. No injection. No memory/account reads.** The app writes reversible `ClientAppSettings.json` files, backs them up, and can restore them. It does not inject DLLs, patch executables/DLLs, hook the renderer, read game memory or account data, disable Roblox telemetry/Crashpad/Backtrace, add fullbright/x-ray, remove buildings, automate gameplay, or bypass anti-cheat.

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
| `feature-status.json` | Shared implemented / legacy / rejected feature catalog |
| `web/index.template.html` | Source template for the blue Lumina download portal |
| `web/index.html` | Generated static website |
| `web/downloads/` | Generated download files and packages |
| `roblox_fps_optimizer.py` | Legacy single-file Python/Tkinter optimizer, updated to V3 CLI parity |
| `roptimer_hud.py` | Separate always-on-top HUD, updated to V3 |
| `build_website.py` | Generates `web/index.html` from the template and feature catalog |
| `build_downloads.py` | Regenerates the website and all download packages |

---

## Version 3 desktop app

The WPF app uses a left navigation rail, breadcrumb, card-based pages, and a bottom Save / Save & Launch / Close bar, similar to Bubblestrap's settings-window layout. No Bubblestrap or Bloxstrap source code or assets are copied; only the general navigation pattern was used as visual inspiration.

Pages:

- **Dashboard** — quick modes, hardware profile, Roblox version count, feature status.
- **Boost** — optimization mode, FPS target, graphics tier 0–21, texture tier 0–3, VFX reducer, building-lag reducer, generated CLI command, and JSON preview.
- **FastFlags** — exact generated `ClientAppSettings.json`, managed flag matrix, allowlist status.
- **Session** — safe OS-level client detection, locally typed display name, readiness notification.
- **Settings** — theme, delivery options, cache quarantine, feature status matrix, settings file.
- **Safety** — explicit audit of implemented and rejected features.
- **About** — version, commands, sources, and layout attribution.

The blue Lumina theme has no green neon status dots.

---

## Safe feature matrix

| Requested idea | Status in V3 |
| --- | --- |
| Unlocking FPS / `DFIntTaskSchedulerTargetFps` | **Legacy only.** Written for older clients, clearly labelled as possibly ignored by current allowlisted clients. Use Roblox Settings > Maximum Framerate for supported FPS changes. |
| Better FPS / optimization modes | **Implemented.** Better FPS, Reduce building lag, Balanced, Maximum performance, Visual quality, and auto-selected mode. |
| Reduce building lag | **Implemented safely.** Lowers geometry LOD distance, grass distance, textures, MSAA, and motion. Does not remove buildings or change collision. |
| Texture and cache alterations | **Implemented safely.** Texture tiers 0–3 through the allowlisted texture override, plus conservative quarantine of old log/temp files. No aggressive in-memory cache garbage collection. |
| Extended graphic tiers | **Implemented.** `DFIntDebugFRMQualityLevelOverride` values 0–21. Values above 10 are legacy/micro levels and may change or be ignored. |
| Client detection / username / notification | **Implemented safely.** OS process/window metadata only; display name is typed locally. No account data extraction. |
| CLI injector / “boost strap” | **Reinterpreted as a safe CLI controller.** `RoptimerBoost.exe` can open the app, apply settings, restore, preview JSON, inspect session metadata, and quarantine old cache files. It never injects a DLL. |
| Disabling Crashpad / Backtrace / telemetry / screenshot uploads | **Rejected.** Hidden diagnostic flags are not allowlisted and are not written. Roptimer sends no analytics of its own, but leaves Roblox diagnostics untouched. |
| DLL injection, fullbright, x-ray, building removal, anti-cheat bypass, automation | **Rejected.** |

---

## Build the Windows EXEs

Requirements:

- Windows 10/11
- .NET 8 SDK
- .NET 8 Desktop Runtime to run the framework-dependent single-file EXEs

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

GitHub Actions runs the same build on `windows-latest` when the `.NET` source or workflow changes, and uploads the Windows package as an artifact.

Release binaries are hosted on the [v3.0.0-windows release](https://github.com/gefrus112/robloxclinetbooster/releases/tag/v3.0.0-windows); the website links directly to `Roptimer.exe`, `RoptimerBoost.exe`, and `Roptimer-Windows-x64.zip`.

---

## Boost CLI commands

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

`RoptimerBoost.exe open` is the Windows command to launch the desktop app. `bootstrap` chooses a recommended mode, applies safe local settings, and opens the desktop app; add `--launch` to also open Roblox through `roblox://`.

---

## Legacy Python tools

The original single-file Python app remains as a companion/fallback. It writes the same kind of reversible local JSON settings.

```powershell
py -3 roblox_fps_optimizer.py
py -3 roptimer_hud.py --settings hud-settings.json
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
```

After changing the Python apps, icons, website template, or feature catalog:

```bash
python3 build_downloads.py
```

This regenerates `web/index.html`, `web/downloads/feature-status.json`, `Roptimer-DotNet-Source.zip`, `Roptimzier-Windows.zip`, and all support files.

---

## Website

`web/index.html` is a static blue/purple Lumina-style download portal with six tabs:

1. Download
2. Features
3. Settings
4. Screenshots
5. Boost CLI
6. Safety

The Settings tab builds a local profile, generates the matching `RoptimerBoost.exe` command, and can download `roptimer-settings.json`.

Serve locally:

```bash
python3 -m http.server 8000 --directory web
```

Then open `http://localhost:8000`.

---

## Safety / compatibility sources

- Roblox FastFlag allowlist announcement — <https://devforum.roblox.com/t/allowlist-for-local-client-configuration-via-fast-flags/3966569>
- Roblox QualityLevel enum (0–21) — <https://create.roblox.com/docs/reference/engine/enums/QualityLevel>
- Allowlisted Roblox FastFlags guide and 0–21 FRM range — <https://github.com/dyokism/sober-fastflags>
- Roblox graphics quality help — <https://en.help.roblox.com/hc/en-us/articles/203314310-Graphics-Quality>
- Roblox built-in performance stats — <https://create.roblox.com/docs/performance-optimization/identify>
- Bubblestrap layout reference — <https://github.com/ItzBloxxy/Bubblestrap>
- Bloxstrap original project — <https://github.com/bloxstraplabs/bloxstrap>

The allowlist can change at any time. Current clients may ignore `DFIntTaskSchedulerTargetFps`; the app labels it as legacy. For real in-game FPS/ping, use Roblox's built-in Performance Stats / Debug Stats overlay.
