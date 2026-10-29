# Marktis Optimizer — Rust + Tauri v2 Windows client (V4)

Marktis Optimizer V4's primary Windows client is built with **Rust + Tauri v2** and is
distributed through a guided x64 NSIS setup wizard. It has a purpose-built
desktop interface, independent from the GitHub Pages website. An optional
Electron setup wizard is also available; see [`electron/README.md`](../electron/README.md).

## Why Rust + Tauri

- **Guided installer.** `Marktis-Optimizer-Rust-Setup-x64.exe` installs the primary
  Tauri app, creates a Start Menu shortcut, offers a Desktop shortcut option on
  the finish page, and registers a Windows uninstaller. The app uses Microsoft
  Edge **WebView2**
  runtime; the setup bootstraps it if it is missing. No Electron/Chromium bundle
  or .NET/Node runtime is required for this build.
- **Standalone UI.** The app has its own compact HTML/CSS/JS interface in
  `rust/desktop-ui/`, separate from `web/`. It bundles no website CSS/JS, CDN
  assets, or remote scripts.
- **Rust backend, safe by design.** Detection and settings are Rust commands
  called over Tauri IPC. There is no eval or remote code. One fixed TCP
  connection-time probe to `www.roblox.com:443` is available only on button
  press; it sends no app-data payload and is not game-server ping.

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

The detection command **never** attaches to a process, reads memory, injects
anything, or launches Roblox. Normal launch dispatches the fixed `roblox://`
protocol through Windows Explorer; Apply & launch asks for confirmation and
runs the launcher only after a successful settings write. A separate manual
server-rejoin action accepts a positive numeric Place ID and UUID Job ID from
the user, then dispatches a standard `roblox://experiences/start` URI. It does
not discover server IDs from a running game, and Roblox may reject a server
that is unavailable, full, private, or closed. On non-Windows builds detection
returns a clear "Windows client" message.

Settings can be written while Roblox is running, but the app never modifies the
live game. The current session may ignore or overwrite local settings; a normal
restart may be required to load them.

The Main page's **F5 Quick Status** refreshes the local install scan, Player
process-name check, Windows-reported hardware inventory, and the on-device
known-process check. It does not read the current experience, thumbnail, game or
server ID, player count, session time, or account data; it cannot automatically
rejoin the current session. For actual FPS and experience ping, read Roblox's own stats with
`Shift+F5` and enter the values manually in the before/after journal. The journal
stores only user-entered FPS/ping values and profile mode in local app storage.

A separate profile shortcut accepts a numeric Roblox User ID and opens the fixed
official `https://www.roblox.com/users/{id}/profile` page in the system browser.
It does not log in, access cookies, fetch, or scrape profile/account details.

```
Roblox detected: 2 version folders found. Marktis Optimizer can manage allowlisted
local settings safely.
```

If Roblox is missing, the app tells the user to install the desktop client from
roblox.com and offers a **Re-scan** button.

## Live Player presence (Windows only)

The Main page also checks whether `RobloxPlayerBeta.exe` is present in the
Windows process list when the app opens, on request, and every ten seconds while
it is open. The Rust command `active_roblox_status` returns only a running/not
running result and a timestamp; this does not confirm that an experience is
  loaded. The Main card also shows an approximate elapsed stopwatch since this
  app first observed the Player process. It resets when the process is no longer
  found, a status check becomes unavailable, or Marktis closes; it is not exact
  process-launch time or game/experience session duration. The app does not open
  a process handle or inspect command-line arguments, game state, game thumbnails,
  server IDs/addresses, account data, or memory. The **Configure this profile**
  button opens local Rendering settings; it does not modify Roblox's in-game menu.

## Device, performance, and network details (Windows only)

The grouped Settings area adds a **System** tab. A user-triggered, read-only
Windows WMI snapshot displays manufacturer/model and device type, CPU/core
counts, installed RAM, graphics adapters, physical drive models, and logical
drive free space. The snapshot stays in memory in the app; no serial numbers are
queried, and the app does not upload or save this inventory. A rough Max
performance / Balanced / High quality suggestion uses reported RAM and GPU model names only;
it is a heuristic, not a benchmark, and only stages local profile values until
the user separately confirms Apply. The System tab can open Windows Advanced
Graphics settings so the user can choose Roblox's preferred GPU. This is only a
navigation shortcut: HAGS, driver settings, and per-app GPU preferences remain
under Windows control.

Actual game FPS and experience/server ping are not read from Roblox memory or
otherwise inferred. Users can see Roblox's own live performance overlay with
`Shift+F5`. The app does not automatically delete caches, logs, or `%TEMP%` files,
write fullscreen/priority registry values, clear standby memory, force restore
points, tune DNS/MTU directly, or invent Roblox server routes. A separate opt-in
WireGuard VPN tab delegates DNS/routes to the official client using a
user-supplied profile; that network change is explained below. Otherwise, the
optimizer sticks to allowlisted local settings and timestamped JSON backups. A separate button can measure one TCP connection to
`www.roblox.com:443`; this is website connection time, not game ping. It sends
no app-data payload, but the website receives the ordinary network connection
and can see its source IP.

On each app launch, a separate lightweight read-only storage check queries only
fixed local drive capacity/free-space metadata from Windows. The branded startup
prompt shows free, used, and total space and flags a drive below 10 GB free or
below 5% free. The user can continue or exit. No file contents or names are
read, and low space never blocks the app or triggers cleanup. F5 refreshes the
storage snapshot along with other local status.

## Local known-process safety check (Windows only)

The Main page runs a lightweight local check at startup, every 30 seconds while
the app is open, and on request for the exact process image names `Xeno.exe`,
`Solara.exe`, `JJSploit.exe`, and `Delta.exe`. The Rust command
`scan_known_executor_processes` uses Windows' built-in `tasklist` filters and
parses only the image-name field. `tasklist` may include a PID in its temporary
CSV output for a matching process, but Marktis Optimizer ignores it: no PID is stored,
logged, or returned. The check does not read paths, command lines, process
handles, or memory, and sends no network requests. A name match appears in the
local in-app notification center when that event type is enabled. An OS desktop
toast is optional and is attempted only after the user explicitly requests
WebView notification permission and enables app notifications. Preferences and
up to 50 history items stay in local app storage; there is no notification
telemetry.

This is a **limited name match, not antivirus or a malware verdict**: names can
be changed, spoofed, or used by unrelated files. A match is a prompt to review
it. Marktis Optimizer never terminates a process or deletes software. The
Security tab and Main safety panel open Windows Security. The user can choose a
Defender Quick scan or select Full/Custom under Scan options, then review
Protection history. Defender controls file scanning and any quarantine or
remediation under Windows settings. The app does not inspect file contents, run
a custom antivirus engine, or automatically remove threats.

## Standalone desktop tabs (Windows only)

The Tauri executable has its own interface and does not load the GitHub Pages
UI or its assets. Navigation remains **Main** plus a grouped **Settings** area
with **Rendering**, **Geometry**, **Icons**, **Allowlist**, **Security**, **VPN**,
**System**, and **Notifications**:

- **Rendering** — choose Max performance, Balanced, or High quality presets; adjust
graphics and texture quality; and select an allowlisted renderer preference
(System default, Direct3D 11, Vulkan, or OpenGL). Direct3D 12 is not offered.
Max performance trades visual detail for lower selected workload and cannot
promise zero lag. Presets only stage values. An experimental legacy FPS target (60–1000) remains
a separate, opt-in request that Roblox may ignore; it is not actual FPS.
- **Geometry** — set level-of-detail distance and optionally reduce approved
  sky/voxelizer effects. Distances affect rendering only; they do not delete
  objects or change collision/gameplay geometry.
- **Icons** — choose the UI icon weight, one of nine accent colors, and a
  bundled anime background. Ten original theme images are included so far; the
  remaining thirty requested images are pending generation. These local
  preferences do not modify Roblox icons or game assets.
- **Allowlist** — search/filter the canonical **18 allowed flags**, read-only,
  grouped into Geometry, Rendering, and User Interface. See
  [`FASTFLAG_ALLOWLIST.md`](FASTFLAG_ALLOWLIST.md) for the full table.
- **Security** — show the on-device exact process-name watchlist and open
  Windows Security for user-selected Defender Quick, Full, or Custom scans and
  Protection history. Windows controls scanning and remediation; this app does
  not inspect file contents, quarantine/delete threats, or implement real-time
  antivirus. Defender, firewall, web/phishing protection (SmartScreen),
  ransomware controls, and updates remain Windows-managed.
- **VPN** — use the official WireGuard for Windows client with a profile supplied
  by the user's VPN provider. The app accepts a `.conf` file without saving its
  plaintext, validates/blocks custom command hooks, protects the profile with
  machine-scope DPAPI in local app data, and uses an app-reserved tunnel service
  name. Import/connect/disconnect/remove require confirmation and the Windows
  administrator prompt. It confirms Windows service state only, not provider
  reachability or a WireGuard handshake. The app provides no VPN server,
  subscription, account, or credentials. Provider `AllowedIPs` and DNS define
  routing; a default route can carry all internet traffic and invoke WireGuard's
  firewall/kill-switch behavior. The tunnel is set not to auto-start after
  Windows restarts, and can remain active after Marktis closes or is uninstalled.
  Disconnect and remove the tunnel/profile before uninstalling Marktis. Do not
  import a profile unless you trust its provider and routes.
- **System** — view local hardware, Roblox Player/Studio version folders,
  process-name scan status, and the optional website TCP connection-time probe.
  A fixed shortcut opens Windows Advanced Graphics settings; it does not change
  GPU preference or HAGS itself. Actual in-game FPS and game-server ping are
  not read; use `Shift+F5` in Roblox.
- **Notifications** — choose per-event local alerts for Player process changes,
  known process-name matches, settings apply/restore, and low storage. App
  notifications default off. The bell menu, preferences, and up to 50 history
  entries stay on-device. Optional desktop toasts use Web Notifications only
  after the user requests permission; in-app alerts still work when native
  notifications are unsupported or denied. No event data is uploaded.

The Windows settings manager is not included in the separate legacy
Python/Tkinter macOS companion.

## Safe settings (apply / restore)

`apply_settings` writes canonical allowlisted keys to
`ClientAppSettings.json` by default. If the user explicitly enables
**Experimental legacy FPS target**, it also writes only
`DFIntTaskSchedulerTargetFps` with the requested value clamped to 60–1000. That
legacy key remains outside the canonical 18-key allowlist; current Roblox
clients may ignore or cap it, so no FPS gain or unlock is guaranteed.

- Timestamped backups are created before every write.
- Unrelated keys are always preserved.
- Restore removes only Marktis Optimizer-managed canonical keys plus the separate legacy
  FPS key; the timestamped backup is kept for manual recovery.
- Roblox's in-game Maximum Framerate setting remains the supported option.
- "Reduce building lag" = safe LOD / texture / grass / graphics reduction — it
  never deletes buildings or changes collision/gameplay geometry.

**Never**: DLL injection, process hooks, memory reads/writes, executable
patching, account-data extraction, telemetry/Crashpad/Backtrace disabling,
anti-cheat bypass, gameplay automation, executor APIs, `loadstring`, game script
execution, or automatic process termination/software deletion.

Profiles are static local settings, not dynamic hardware control. The app does
not measure in-game FPS or game-server ping, monitor live GPU utilization,
alter Roblox's internal resolution, change process CPU affinity, or optimize
Roblox routes through a relay. The separate WireGuard tab can start a
user-configured VPN; its provider profile determines routes, and no reduction in
ping is promised. Use Roblox's own Performance Stats (`Shift+F5`) for live
experience FPS/ping; the optional website probe is not a substitute.

## Rust commands (IPC)

| Command | Purpose | Side effects |
| --- | --- | --- |
| `app_info` | Product/version/framework/safety info | none |
| `detect_roblox` | Detect official Roblox Player/Studio folders | read-only filesystem scan |
| `active_roblox_status` | Check whether the Roblox Player process name is present | read-only process-name check |
| `device_snapshot` | Read local device/CPU/RAM/GPU/drive details | read-only WMI query; no serial numbers or upload |
| `storage_snapshot` | Report fixed-drive capacity/free space for the startup advisory | read-only local WMI query; no file names/content or upload |
| `probe_roblox_latency` | Measure a fixed TCP connection to `www.roblox.com:443` | one user-triggered TCP handshake; no app-data payload; not game ping |
| `scan_known_executor_processes` | Match exact Xeno, Solara, JJSploit, and Delta process names | local name-only check; no paths or command lines |
| `open_windows_settings` | Open a fixed Installed Apps, Windows Security, or Advanced Graphics page | launches Windows Settings; no system values are changed |
| `open_wireguard_download` | Open WireGuard's official Windows download page | opens a fixed upstream page in the system browser |
| `wireguard_vpn_status` | Inspect WireGuard installation, the app's encrypted profile, and its reserved service path/state | read-only local file/service query |
| `wireguard_vpn_import` | Validate, protect, install, and start a provider `.conf` tunnel | stores only machine-DPAPI-protected profile data; asks for administrator approval |
| `wireguard_vpn_connect` | Start or reinstall the app-managed WireGuard service | changes network routes according to the provider profile; asks for administrator approval |
| `wireguard_vpn_disconnect` | Stop the app-managed WireGuard service | restores normal Windows routes; asks for administrator approval |
| `wireguard_vpn_remove` | Uninstall the matching app-managed service and delete its encrypted profile | removes only a service whose image path matches the app's profile; administrator approval |
| `open_roblox_profile` | Open the official profile for a validated numeric User ID | opens a fixed Roblox URL in the system browser; no account data is read |
| `exit_app` | Exit after the startup storage prompt | closes the desktop app |
| `launch_roblox` | Dispatch fixed `roblox://` URI through Windows Explorer | requests normal Roblox protocol launch |
| `get_allowlist` | Return the canonical allowlist JSON | none |
| `apply_settings` | Apply allowlisted settings | local JSON write + backup |
| `restore_settings` | Restore managed keys | local JSON write + backup |
| `open_external` | Open an http(s) link in the browser | opens external browser |
| `open_latest_release` | Open the fixed latest Marktis Optimizer GitHub release page | opens external browser; updates are installed manually |

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
`Marktis-Optimizer-Rust-Setup-x64.exe`. The installer creates shortcuts and installs the
Tauri app; users do not need a batch launcher. `build.rs` embeds the repo-root
`fastflags-allowlist.json` in Rust, and the frontend build embeds that same
canonical list in the local UI.

### CI

`.github/workflows/build-rust-tauri.yml` builds on `windows-latest`, validates
the website and standalone desktop frontend, packages the NSIS installer, and
stages `Marktis-Optimizer-Rust-Setup-x64.exe` plus its SHA256 file. A release upload is
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
      lib.rs                app_info, command registration, and app setup
      detect.rs             read-only Roblox Player/Studio installation detection
      device.rs             read-only hardware inventory + explicit TCP probe
      session.rs            process-name-only Roblox Player status
      settings.rs           safe apply/restore with backups
  frontend/                 GENERATED from desktop-ui; embeds allowlist JSON
  README.md
build_tauri_frontend.py      assembles rust/frontend/ from rust/desktop-ui/
```
