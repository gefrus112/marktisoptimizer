# Roptimer — Rust + Tauri v2 Windows client

A **single, lightweight Windows 64-bit executable** that opens to one **Client**
tab, **detects whether Roblox is installed on first launch**, and manages only
Roblox-allowlisted, reversible `ClientAppSettings.json` performance flags.

Built with [Tauri v2](https://tauri.app/) + Rust. The UI is the same static,
glowing (vendored) Three.js site that powers GitHub Pages — no CDN, no remote
code, no runtime Node/.NET dependency. See [`../docs/RUST_TAURI.md`](../docs/RUST_TAURI.md)
for full details.

## Quick build (Windows)

```powershell
python ../build_website.py
python ../build_tauri_frontend.py
cd src-tauri
cargo build --release
# -> src-tauri/target/release/roptimer.exe  (ship as Roptimer-Rust-x64.exe)
```

Or let CI do it: `.github/workflows/build-rust-tauri.yml` builds on
`windows-latest` and publishes the release asset.

## What's here

```
src-tauri/
  Cargo.toml, build.rs, tauri.conf.json, capabilities/default.json, icons/
  src/
    main.rs      entry point (windows_subsystem for a GUI-only release exe)
    lib.rs       Tauri app + app_info / get_allowlist / open_external commands
    detect.rs    read-only Roblox installation detection (Windows)
    settings.rs  safe apply/restore with timestamped backups, allowlist only
frontend/        GENERATED — do not edit; assembled from ../web by
                 ../build_tauri_frontend.py
```

## Safety

Local reversible JSON writes only, timestamped backups, unrelated keys
preserved, allowlisted keys only. No injection, memory access, telemetry
disabling, anti-cheat bypass, or game script execution.
