# Marktis Optimizer — Rust + Tauri v2 Windows client

The primary Rust + Tauri Windows client is distributed through a guided x64
setup wizard. The NSIS installer creates a Start Menu shortcut, offers a
Desktop shortcut option on the finish page, and provides a Windows uninstaller.
The standalone interface detects official Roblox Player/Studio version folders,
shows read-only local CPU, RAM, GPU, device-model, and drive details, and manages
reversible `ClientAppSettings.json` settings. The canonical 18-key allowlist is
the default; rendering presets stage safe values for review. Max performance
trades visual detail for a lower selected workload and cannot guarantee lag-free
play. An experimental
legacy FPS request is still opt-in and may be ignored by Roblox. An optional
Electron shell is also available; see [`../electron/README.md`](../electron/README.md).

Built with [Tauri v2](https://tauri.app/) + Rust. The desktop UI is purpose-built
under `desktop-ui/` and is separate from the GitHub Pages website. It has a
Main page plus a grouped Settings area for Rendering, Geometry, Icons,
Allowlist, and System. It uses local HTML/CSS/JavaScript assets only—no website
bundle, CDN assets, remote code, or runtime Node/.NET dependency. The Icons tab
includes local anime backgrounds; ten of the requested forty images are currently
bundled. The System tab uses local read-only Windows inventory; a TCP check to
`www.roblox.com:443` runs only when requested and is explicitly not game-server
ping. See
[`../docs/RUST_TAURI.md`](../docs/RUST_TAURI.md) for full details.

## Quick build (Windows)

```powershell
python ../build_tauri_frontend.py
python ../build_tauri_frontend.py --check
cd src-tauri
cargo install tauri-cli --version "^2" --locked
cargo tauri build --bundles nsis
# -> bundle/nsis/<product>_4.0.0_x64-setup.exe
```

The Windows CI workflow stages the wizard as `Marktis-Optimizer-Rust-Setup-x64.exe` and
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
    detect.rs    read-only Roblox Player/Studio installation detection (Windows)
    device.rs    read-only local hardware inventory + opt-in Roblox website TCP probe
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
guaranteed. The request is not an FPS measurement. Use Roblox Performance Stats
(`Shift+F5`) for actual in-game FPS and server ping. The app launches the
installed client only through Windows' fixed `roblox://` protocol; Apply &
launch requires confirmation and a successful settings write. Geometry controls
set allowlisted level-of-detail distances; they do not delete objects or change
collision/gameplay geometry. Rendering offers only the allowlisted System
default, Direct3D 11, Vulkan, and OpenGL preferences; Direct3D 12 is not offered.
The Icons page changes only Marktis Optimizer's local interface preferences.

The live Player check reads only whether `RobloxPlayerBeta.exe` is present in
the Windows process list. The separate on-device safety check matches only the
exact `Xeno.exe`, `Solara.exe`, `JJSploit.exe`, and `Delta.exe` image names at
startup, every 30 seconds while open, and on request. It is not antivirus and
reads no paths, command lines, memory, or process handles. The hardware snapshot
is local and read-only. The optional website-latency button makes one fixed TCP
handshake to `www.roblox.com:443`, sends no app-data payload, and does not reach
the active game server; the endpoint can see the network connection. Alerts stay
inside the app; removal is always user-directed through Windows Settings, never
an automatic delete or process termination. No injection, telemetry disabling,
anti-cheat bypass, or game script execution.
