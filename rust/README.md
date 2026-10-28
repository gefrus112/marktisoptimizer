# Roptimer — Rust + Tauri v2 Windows client

The primary Rust + Tauri Windows client is distributed through a guided x64
setup wizard. The NSIS installer creates a Start Menu shortcut, offers a
Desktop shortcut option on the finish page, and provides a Windows uninstaller.
The app has a standalone desktop interface,
detects whether Roblox is installed on first launch, reports process-name-only
Player presence, and manages reversible `ClientAppSettings.json` settings. The
canonical 18-key allowlist is the default; an experimental legacy FPS request
is available only after explicit opt-in and may be ignored by Roblox. An optional Electron shell is also available;
see [`../electron/README.md`](../electron/README.md).

Built with [Tauri v2](https://tauri.app/) + Rust. The desktop UI is purpose-built
under `desktop-ui/` and is separate from the GitHub Pages website. It has a
Main page plus a grouped Settings area for Rendering, Geometry, Icons, and the
read-only Allowlist. It uses local HTML/CSS/JavaScript assets only—no website
bundle, CDN assets, remote code, or runtime Node/.NET dependency. See
[`../docs/RUST_TAURI.md`](../docs/RUST_TAURI.md) for full details.

## Quick build (Windows)

```powershell
python ../build_tauri_frontend.py
python ../build_tauri_frontend.py --check
cd src-tauri
cargo install tauri-cli --version "^2" --locked
cargo tauri build --bundles nsis
# -> bundle/nsis/Roptimer_4.0.0_x64-setup.exe
```

The Windows CI workflow stages the wizard as `Roptimer-Rust-Setup-x64.exe` and
creates its SHA256 file. The Electron alternative is built separately by
`.github/workflows/build-electron.yml`.

## What's here

```
desktop-ui/       standalone desktop HTML/CSS/JS source; not the website UI
src-tauri/
  Cargo.toml, build.rs, tauri.conf.json, capabilities/default.json, icons/
  src/
    main.rs      entry point (Windows GUI app; distributed through the installer)
    lib.rs       Tauri app + metadata, allowlist, external-link, and Roblox launch commands
    detect.rs    read-only Roblox installation detection (Windows)
    session.rs   process-name-only Roblox Player status (Windows)
    safety.rs    local known-process name scan + fixed Windows Settings links
    settings.rs  safe apply/restore, backups, and separate legacy-FPS opt-in
frontend/        GENERATED from ../desktop-ui; do not edit
```

## Safety

Settings changes are local JSON writes with timestamped backups; unrelated
keys are preserved. Canonical allowlisted keys are managed by default. Rendering
also has an off-by-default experimental `DFIntTaskSchedulerTargetFps` request
(60–1000) outside the allowlist; it is backed up and removed by Restore, but
current Roblox clients may ignore or cap it, so no FPS gain or unlock is
guaranteed. Roblox's in-game Maximum Framerate setting remains the supported
option. The app launches the installed client only through Windows' fixed
`roblox://` protocol; Apply & launch requires confirmation and a successful
settings write. Geometry controls set allowlisted level-of-detail distances;
they do not delete objects or change collision/gameplay geometry. Rendering
offers only the allowlisted System default, Direct3D 11, Vulkan, and OpenGL
preferences; Direct3D 12 is not offered. The Icons page changes only Roptimer's
local interface preferences.

The live Player check reads only whether `RobloxPlayerBeta.exe` is present in
the Windows process list. The separate safety check matches only the exact
`Xeno.exe`, `Solara.exe`, and `JJSploit.exe` image names at startup, every 30
seconds while open, and on request. It is not antivirus and reads no paths,
command lines, memory, or process handles; it sends no network requests. Alerts
stay inside the app; removal is always user-directed through
Windows Settings, never an automatic delete or process termination. No
injection, telemetry disabling, anti-cheat bypass, or game script execution.
