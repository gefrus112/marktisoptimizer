# Roptimer — Rust + Tauri v2 Windows client

A **single, lightweight Windows 64-bit executable** with a standalone desktop
interface. It detects whether Roblox is installed on first launch, reports
process-name-only Player presence, and manages Roblox-allowlisted, reversible
`ClientAppSettings.json` performance settings.

Built with [Tauri v2](https://tauri.app/) + Rust. The desktop UI is purpose-built
under `desktop-ui/` and is separate from the GitHub Pages website. It has a
Main page plus a grouped Settings area for Rendering, Geometry, Icons, and the
read-only Allowlist. It uses local HTML/CSS/JavaScript assets only—no website
bundle, Three.js, CDN, remote code, or runtime Node/.NET dependency. See
[`../docs/RUST_TAURI.md`](../docs/RUST_TAURI.md) for full details.

## Quick build (Windows)

```powershell
python ../build_tauri_frontend.py
python ../build_tauri_frontend.py --check
cd src-tauri
cargo build --release
# -> src-tauri/target/release/roptimer.exe  (ship as Roptimer-Rust-x64.exe)
```

Or let CI do it: `.github/workflows/build-rust-tauri.yml` builds on
`windows-latest` and publishes the release asset.

## What's here

```
desktop-ui/       standalone desktop HTML/CSS/JS source; not the website UI
src-tauri/
  Cargo.toml, build.rs, tauri.conf.json, capabilities/default.json, icons/
  src/
    main.rs      entry point (windows_subsystem for a GUI-only release exe)
    lib.rs       Tauri app + app_info / get_allowlist / open_external commands
    detect.rs    read-only Roblox installation detection (Windows)
    session.rs   process-name-only Roblox Player status (Windows)
    settings.rs  safe apply/restore with timestamped backups, allowlist only
frontend/        GENERATED from ../desktop-ui; do not edit
```

## Safety

Settings changes are local, reversible JSON writes with timestamped backups;
unrelated keys are preserved and only allowlisted keys are managed. Geometry
controls set allowlisted level-of-detail distances; they do not delete objects or
change collision/gameplay geometry. The Icons page changes only Roptimer's local
interface preferences. The live status check reads only whether
`RobloxPlayerBeta.exe` is present in the Windows process list. It does not
confirm an active experience or read game/server details, command lines,
account data, memory, or process handles. No injection, telemetry disabling,
anti-cheat bypass, or game script execution.
