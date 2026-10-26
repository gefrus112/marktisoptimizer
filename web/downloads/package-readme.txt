ROPTIMER HUB V3.1 — safe Roblox performance settings
=====================================================

WHAT IS INCLUDED
  Roptimer.exe             C#/.NET 8 WPF desktop app (Windows GitHub release)
  RoptimerBoost.exe        Safe Windows CLI/bootstrapper (GitHub release)
  Roptimer-Mac.zip         macOS .app launcher / Python companion (GitHub release)
  Roptimer-Mac-Companion.zip  Portable macOS Python package
  Roptimer-DotNet-Source   Full C#/.NET source ZIP (separate download)
  Roptimzier.py            Cross-platform Python/Tkinter optimizer
  roptimer_hud.py          Optional separate always-on-top HUD
  hud-settings.json        Default HUD preferences
  feature-status.json      Implemented / legacy / rejected feature catalog
  assets/                  Shield app, HUD, and website icons
  docs/                    CLI, how-it-works, macOS, and Script Hub docs
  Run Roptimer.bat         Windows launcher for the WPF app
  RoptimerBoost.bat        Windows launcher for the Boost CLI
  Run Roptimzier.bat       Windows launcher for the legacy Python app
  Run HUD.bat              Windows launcher for the HUD

REQUIREMENTS
  Windows 10/11 + .NET 8 Desktop Runtime for the C#/.NET EXE files
  macOS 11+ + Python 3.10/Tkinter for the Mac companion
  Optional: psutil for CPU/RAM hints and running-client detection

QUICK START — WINDOWS
  1. Download Roptimer-Windows-x64.zip from the website/GitHub release.
  2. Extract it and run "Install-DotNet8-DesktopRuntime.bat" if needed.
  3. Double-click "Roptimer.exe", or open a terminal and run:
       RoptimerBoost.exe open
  4. Choose a mode in Boost, preview the JSON, and click Apply.
  5. Use "Save & Launch" to apply local settings and open roblox://.

QUICK START — MACOS
  1. Download Roptimer-Mac.zip from the macOS GitHub release.
  2. Extract it, right-click "Roptimer Mac.app" and choose Open.
  3. Or run "Roptimer Boost.command" for the safe CLI.
  4. The macOS settings target is:
       /Applications/Roblox.app/Contents/MacOS/ClientSettings/ClientAppSettings.json
  5. Roblox updates may replace that folder; re-run apply after an update.

BOOST CLI COMMANDS
  Windows:
    RoptimerBoost.exe open
    RoptimerBoost.exe bootstrap --launch
    RoptimerBoost.exe preview --mode "Reduce building lag" --tier 21 --texture 0
    RoptimerBoost.exe apply --mode "Better FPS" --fps 144 --all-versions
    RoptimerBoost.exe restore
    RoptimerBoost.exe features
    RoptimerBoost.exe cache-clean --days 7 --force
    RoptimerBoost.exe self-test

  macOS / portable Python:
    ./Roptimer\ Boost.command --preview
    ./Roptimer\ Boost.command --apply --mode "Reduce building lag" --graphics-tier 21 --texture-tier 0
    ./Roptimer\ Boost.command --restore
    python3 roblox_fps_optimizer.py --self-test

SAFETY
  No DLL injection. No Roblox memory reads/writes. No full bright exploit.
  No building removal, no x-ray, no anti-cheat bypass, no gameplay automation.
  No Crashpad/Backtrace/telemetry/screenshot-report disabling. The app sends no
  analytics of its own. It writes reversible local ClientAppSettings.json files,
  keeps backups, and can restore them. The Script Hub is a local UI preview only;
  it never executes code inside a Roblox game. For real in-game FPS/ping, use
  Roblox's built-in Performance Stats / Debug Stats overlay.

NOTE
  Current Roblox clients may ignore the legacy DFIntTaskSchedulerTargetFps
  flag because of the local FastFlag allowlist. Use Roblox Settings >
  Maximum Framerate for the supported FPS cap. Extended graphics tiers 0-21
  use the allowlisted DFIntDebugFRMQualityLevelOverride flag; Roblox may change
  or ignore legacy/micro levels above 10.
