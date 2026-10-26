# Roptimer Hub V3.2 — C#/.NET 8

A safe Roblox performance bootstrapper built with WPF and .NET 8. It uses a Bubblestrap/Bloxstrap-like settings layout with a custom shield icon and blue Lumina theme.

## Projects

- `Roptimer.Core` — settings, Roblox version discovery, canonical FastFlag allowlist, backups/restores, session detection, cache quarantine, feature catalog, CLI runner, self-test.
- `Roptimer.App` — WPF desktop app (`Roptimer.exe`) with Dashboard, Boost, FastFlags, Allowlist, Session, Settings, Safety, and About pages.
- `Roptimer.Cli` — console Boost CLI/bootstrapper (`RoptimerBoost.exe`).

## Build on Windows

Requirements: Windows 10/11, .NET 8 SDK, and .NET 8 Desktop Runtime for the framework-dependent build.

```powershell
.\dotnet\build-windows.ps1
```

Outputs in `dotnet/artifacts`:

- `Roptimer.exe`
- `RoptimerBoost.exe`
- `Roptimer-Windows-x64.zip`
- `Roptimer-DotNet-Source.zip`
- `SHA256SUMS.txt`

## Commands

```powershell
RoptimerBoost.exe open
RoptimerBoost.exe bootstrap --launch
RoptimerBoost.exe preview --mode "Reduce building lag" --tier 21 --texture 0
RoptimerBoost.exe apply --mode "Better FPS" --fps 144 --all-versions
RoptimerBoost.exe restore
RoptimerBoost.exe features
RoptimerBoost.exe allowlist
RoptimerBoost.exe cache-clean --days 7 --force
RoptimerBoost.exe self-test
```

## FastFlag allowlist

The canonical allowlist is `fastflags-allowlist.json` at the repository root. It is embedded in `Roptimer.Core` and exposed through:

- `RoptimerBoost.exe allowlist`
- The WPF **Allowlist** page
- The website Docs tab
- `docs/FASTFLAG_ALLOWLIST.md`

It contains 18 flags in three categories: Geometry, Rendering, and User Interface. `DFIntTaskSchedulerTargetFps` remains a separate legacy compatibility flag and is not allowlisted.

## Safety

Local reversible `ClientAppSettings.json` writes only. No DLL injection, process hooks, memory reads/writes, Roblox telemetry disabling, Crashpad/Backtrace changes, fullbright, x-ray, building removal, anti-cheat bypass, or gameplay automation.

`DFIntTaskSchedulerTargetFps` is included only as a legacy compatibility flag; current allowlisted Roblox clients may ignore it. Use Roblox Settings > Maximum Framerate for the supported FPS cap. Extended graphics tiers 0–21 use the allowlisted `DFIntDebugFRMQualityLevelOverride` flag and may change as Roblox updates the client.

## Release binaries

The Windows EXEs are published on the [v3.0.0-windows release](https://github.com/gefrus112/robloxclinetbooster/releases/tag/v3.0.0-windows).

## Website and macOS companion

This WPF app is Windows-only. The repository root also contains the V3.2 Sirius-style dark static website at `web/index.html` with Download, Docs, and Scripts tabs, the FastFlag allowlist Docs section, GitHub Pages deployment, a command palette, animated starfield, and a Python/Tkinter macOS companion.

The macOS companion is packaged by `build_downloads.py` and by `.github/workflows/build-macos.yml`. It writes the same reversible local `ClientAppSettings.json` settings and never injects code into Roblox. See `docs/MAC.md`, `docs/CLI.md`, and `docs/SCRIPT_HUB.md` in the repository root.

The website Script Hub is a local UI preview only; it is not a Roblox script executor.
