# Roptimer — Rust + Tauri v2 Windows client (V4)

Roptimer V4's primary Windows client is built with **Rust + Tauri v2** and is
distributed through a guided x64 NSIS setup wizard. It has a purpose-built
desktop interface, independent from the GitHub Pages website. An optional
Electron setup wizard is also available; see [`electron/README.md`](../electron/README.md).

## Why Rust + Tauri

- **Guided installer.** `Roptimer-Rust-Setup-x64.exe` installs the primary
  Tauri app, creates Start Menu/Desktop shortcuts, and registers a Windows
  uninstaller. The app uses the Microsoft Edge **WebView2**
  runtime; the setup bootstraps it if it is missing. No Electron/Chromium bundle
  or .NET/Node runtime is required for this build.
- **Standalone UI, offline.** The app has its own compact HTML/CSS/JS interface
  in `rust/desktop-ui/`, separate from `web/`. It bundles no website CSS/JS,
  CDN assets, or remote scripts.
- **Rust backend, safe by design.** Detection and settings are Rust commands
  called over Tauri IPC. No eval, remote code, or network calls are used for
  core features.

The website remains a separate GitHub Pages project. Both frontends consume the
canonical root allowlist, but the packaged Windows executable does not load the
website UI.

## First thing the app does: detect Roblox

On first launch, the app calls the Rust command `detect_roblox` and shows the
result on the standalone **Main** page. Detection is **read-only, OS/filesystem
level**:

- Scans standard Windows Roblox locations:
  `%LOCALAPPDATA%\Roblox\Versions\version-*`, `%LOCALAPPDATA%\Roblox`, and the
  `Roblox\Versions` folders under `ProgramFiles` / `ProgramFiles(x86)`.
- Reports each version folder that contains `RobloxPlayerBeta.exe` /
  `RobloxStudioBeta.exe` and any `ClientSettings\ClientAppSettings.json` files.
- Returns `installed`, the version list, settings paths, and a human message.

It **never** attaches to a process, reads memory, injects anything, or launches
Roblox. On non-Windows builds it returns a clear "Windows client" message.

```
Roblox detected: 2 version folders found. Roptimer can manage allowlisted
local settings safely.
```

If Roblox is missing, the app tells the user to install the desktop client from
roblox.com and offers a **Re-scan** button.

## Live Player presence (Windows only)

The Main page also checks whether `RobloxPlayerBeta.exe` is present in the
Windows process list when the app opens, on request, and every ten seconds while
it is open. The Rust command `active_roblox_status` returns only a running/not
running result and a timestamp; this does not confirm that an experience is
loaded. It does not open a process handle or inspect command-line arguments,
game state, game thumbnails, server IDs/addresses, account data, or memory. The **Open optimizations** button jumps to the local
profile builder; it does not modify Roblox's in-game menu.

## Local known-process safety check (Windows only)

The Main page runs a lightweight local check at startup, every 30 seconds while
the app is open, and on request for the exact process image names `Xeno.exe`,
`Solara.exe`, and `JJSploit.exe`. The Rust command
`scan_known_executor_processes` uses Windows' built-in `tasklist` filters and
parses only the image-name field. `tasklist` may include a PID in its temporary
CSV output for a matching process, but Roptimer ignores it: no PID is stored,
logged, or returned. The check does not read paths, command lines, process
handles, or memory, and sends no network requests. Any alert is displayed inside
the app only.

This is a **limited name match, not antivirus or a malware verdict**: names can
be changed, spoofed, or used by unrelated files. A match is a prompt to review
it. Roptimer never terminates a process or deletes software; buttons open the
fixed Windows Installed Apps and Windows Security pages so the user can review
or uninstall manually.

## Standalone desktop tabs (Windows only)

The Tauri executable has its own interface and does not load the GitHub Pages
UI or its assets. Navigation is **Main** plus a grouped **Settings**
area with four sections:

- **Rendering** — choose Performance/Balanced, graphics quality, texture
  quality, and a renderer preference from the allowlisted System default,
  Direct3D 11, Vulkan, or OpenGL options. Direct3D 12 and unsupported target-FPS
  flags are not written.
- **Geometry** — set level-of-detail distance and optionally reduce approved
  sky/voxelizer effects. Distances affect rendering only; they do not delete
  objects or change collision/gameplay geometry.
- **Icons** — choose Roptimer UI icon weight and accent color. These preferences
  stay in local app storage and do not modify Roblox icons or game assets.
- **Allowlist** — search/filter the canonical **18 allowed flags**, read-only,
  grouped into Geometry, Rendering, and User Interface. See
  [`FASTFLAG_ALLOWLIST.md`](FASTFLAG_ALLOWLIST.md) for the full table.

The Windows settings manager is not included in the separate legacy
Python/Tkinter macOS companion.

## Safe settings (apply / restore)

`apply_settings` / `restore_settings` write **only** canonical allowlisted keys
to `ClientAppSettings.json`:

- Timestamped backups are created before every write.
- Unrelated keys are always preserved.
- Restore removes only the keys Roptimer managed.
- The legacy `DFIntTaskSchedulerTargetFps` flag is **not** written (it is not on
  Roblox's current local allowlist and may be ignored).
- "Reduce building lag" = safe LOD / texture / grass / graphics reduction — it
  never deletes buildings or changes collision/gameplay geometry.

**Never**: DLL injection, process hooks, memory reads/writes, executable
patching, account-data extraction, telemetry/Crashpad/Backtrace disabling,
anti-cheat bypass, gameplay automation, executor APIs, `loadstring`, game script
execution, or automatic process termination/software deletion.

Profiles are static local settings, not dynamic hardware control. The app does
not monitor in-game FPS/GPU utilization, alter Roblox's internal resolution,
change process CPU affinity, or reroute game traffic through a VPN/relay. Use
Roblox's own graphics controls and Windows' normal scheduler/network settings.

## Rust commands (IPC)

| Command | Purpose | Side effects |
| --- | --- | --- |
| `app_info` | Product/version/framework/safety info | none |
| `detect_roblox` | Detect Roblox installation | read-only filesystem scan |
| `active_roblox_status` | Check whether the Roblox Player process name is present | read-only process-name check |
| `scan_known_executor_processes` | Match exact Xeno, Solara, and JJSploit process names | local name-only check; no paths or command lines |
| `open_windows_settings` | Open fixed Installed Apps or Windows Security page | launches Windows Settings |
| `get_allowlist` | Return the canonical allowlist JSON | none |
| `apply_settings` | Apply allowlisted settings | local JSON write + backup |
| `restore_settings` | Restore managed keys | local JSON write + backup |
| `open_external` | Open an http(s) link in the browser | opens external browser |

## Build it yourself

Prerequisites: Rust (stable) and Python 3 to assemble the desktop frontend.
For users, the setup wizard installs the WebView2 runtime bootstrapper if it is
not already present.

```powershell
# From the repo root (Windows PowerShell):
python build_tauri_frontend.py   # assembles rust/frontend/ from rust/desktop-ui/
python build_tauri_frontend.py --check
cd rust/src-tauri
cargo install tauri-cli --version "^2" --locked
cargo tauri build --bundles nsis
```

The build produces a guided NSIS setup wizard, staged in CI as
`Roptimer-Rust-Setup-x64.exe`. The installer creates shortcuts and installs the
Tauri app; users do not need a batch launcher. `build.rs` embeds the repo-root
`fastflags-allowlist.json` in Rust, and the frontend build embeds that same
canonical list in the local UI.

### CI

`.github/workflows/build-rust-tauri.yml` builds on `windows-latest`, validates
the website and standalone desktop frontend, packages the NSIS installer, and
stages `Roptimer-Rust-Setup-x64.exe` plus its SHA256 file. A release upload is
limited to `main` and still respects `release-upload-rust.flag`.

A direct `cargo build --release` remains available for development, but the
published Tauri distribution is the setup wizard.

## Project layout

```
rust/
  desktop-ui/               standalone desktop HTML/CSS/JS source
    index.html
    assets/app.css
    assets/app.js
  src-tauri/
    Cargo.toml              Rust crate (tauri, serde, serde_json)
    build.rs                embeds fastflags-allowlist.json
    tauri.conf.json         window + bundle + security config
    capabilities/default.json
    icons/                  window/app icons
    src/
      main.rs               windows_subsystem + entry point
      lib.rs                app_info, get_allowlist, open_external, run()
      detect.rs             read-only Roblox installation detection
      session.rs            process-name-only Roblox Player status
      settings.rs           safe apply/restore with backups
  frontend/                 GENERATED from desktop-ui; embeds allowlist JSON
  README.md
build_tauri_frontend.py      assembles rust/frontend/ from rust/desktop-ui/
```
