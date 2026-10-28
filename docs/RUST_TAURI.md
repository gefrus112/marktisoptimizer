# Roptimer — Rust + Tauri v2 Windows client (V4)

Roptimer V4 is a **single, lightweight Windows 64-bit executable** built with
**Rust + Tauri v2**. It has a purpose-built desktop interface, independent from
the GitHub Pages website, while keeping the deployment simplicity of one `.exe`.

## Why Rust + Tauri

- **One small file.** `Roptimer-Rust-x64.exe` embeds the whole UI. It uses the
  Microsoft Edge **WebView2** runtime already present on Windows 10/11 — no
  Electron/Chromium bundle, no .NET runtime to install, no Node at runtime.
- **Standalone UI, offline.** The app has its own compact HTML/CSS/JS interface
  in `rust/desktop-ui/`, separate from `web/`. It bundles no website CSS/JS,
  Three.js, CDN assets, or remote scripts.
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

## Standalone desktop tabs (Windows only)

The Tauri executable has its own interface and does not load the GitHub Pages
UI or any Three.js assets. Navigation is **Main** plus a grouped **Settings**
area with four sections:

- **Rendering** — choose Performance/Balanced, graphics quality, and texture
  quality. Unsupported target-FPS flags are not written.
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
anti-cheat bypass, gameplay automation, executor APIs, `loadstring`, or game
script execution.

## Rust commands (IPC)

| Command | Purpose | Side effects |
| --- | --- | --- |
| `app_info` | Product/version/framework/safety info | none |
| `detect_roblox` | Detect Roblox installation | read-only filesystem scan |
| `active_roblox_status` | Check whether the Roblox Player process name is present | read-only process-name check |
| `get_allowlist` | Return the canonical allowlist JSON | none |
| `apply_settings` | Apply allowlisted settings | local JSON write + backup |
| `restore_settings` | Restore managed keys | local JSON write + backup |
| `open_external` | Open an http(s) link in the browser | opens external browser |

## Build it yourself

Prerequisites: Rust (stable), the WebView2 runtime (bundled with Windows), and
Python 3 to assemble the desktop frontend.

```powershell
# From the repo root (Windows PowerShell):
python build_tauri_frontend.py   # assembles rust/frontend/ from rust/desktop-ui/
python build_tauri_frontend.py --check
cd rust/src-tauri
cargo build --release            # -> target/release/roptimer.exe
```

Rename `target/release/roptimer.exe` to `Roptimer-Rust-x64.exe` and ship it as a
single file. `build.rs` embeds the repo-root `fastflags-allowlist.json` in Rust,
and the frontend build embeds that same canonical list in the local UI.

### CI

`.github/workflows/build-rust-tauri.yml` builds on `windows-latest`, runs
`build_website.py --check` and `build_tauri_frontend.py --check`, compiles the
release exe, stages `Roptimer-Rust-x64.exe` + SHA256, and (when the
`release-upload-rust.flag` is present) publishes the release assets.

To also produce NSIS/MSI installers, install the Tauri CLI and run
`cargo tauri build` — `tauri.conf.json` already declares the bundle targets and
icons. The single-exe path above needs no Node/npm.

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
