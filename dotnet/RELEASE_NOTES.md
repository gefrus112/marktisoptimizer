# Roptimer Hub V3.2 — Windows build

This release contains the C#/.NET 8 WPF desktop app, the safe Boost CLI, and the canonical 18-flag FastFlag allowlist.

## Files

- `Roptimer.exe` — WPF desktop app with Bubblestrap-inspired settings layout, blue Lumina theme, and custom shield icon.
- `RoptimerBoost.exe` — safe command-line controller.
- `Roptimer-Windows-x64.zip` — full Windows package with launchers, docs, and runtime installer.
- `Roptimer-DotNet-Source.zip` — full source for the .NET solution, website, workflow, and companion Python tools.
- `SHA256SUMS.txt` — package hashes.

## Quick start

1. Install the .NET 8 Desktop Runtime with `Install-DotNet8-DesktopRuntime.bat` if needed.
2. Run `Roptimer.exe`, or open a terminal and run:

```text
RoptimerBoost.exe open
RoptimerBoost.exe bootstrap --launch
RoptimerBoost.exe preview --mode "Reduce building lag" --tier 21 --texture 0
RoptimerBoost.exe restore
RoptimerBoost.exe allowlist
RoptimerBoost.exe self-test
```

## Safety boundaries

Local reversible `ClientAppSettings.json` writes only. The app and CLI use the canonical 18-flag Geometry, Rendering, and User Interface allowlist. No DLL injection, process hooks, memory reads/writes, Roblox telemetry disabling, Crashpad/Backtrace changes, fullbright, x-ray, building removal, anti-cheat bypass, or automation. `DFIntTaskSchedulerTargetFps` is legacy and may be ignored by current allowlisted clients.
