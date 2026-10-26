ROPTIMER HUB V3 — safe Roblox performance settings
====================================================

WHAT IS INCLUDED
  Roptimer.exe             C#/.NET 8 WPF desktop app (GitHub release)
  RoptimerBoost.exe        Safe CLI/bootstrapper (GitHub release)
  Roptimer-DotNet-Source   Full C#/.NET source ZIP (separate download)
  Roptimzier.py            Legacy Python/Tkinter optimizer
  roptimer_hud.py          Optional separate always-on-top HUD
  hud-settings.json        Default HUD preferences
  feature-status.json      Implemented / legacy / rejected feature catalog
  assets/                  Shield app, HUD, and website icons
  Run Roptimer.bat         Windows launcher for the WPF app
  RoptimerBoost.bat        Windows launcher for the Boost CLI
  Run Roptimzier.bat       Windows launcher for the legacy Python app
  Run HUD.bat              Windows launcher for the HUD

REQUIREMENTS
  Windows 10/11
  .NET 8 Desktop Runtime for the C#/.NET EXE files
  Python 3.10+ with Tkinter for the legacy Python app (optional)
  Optional: psutil for CPU/RAM hints and running-client detection

QUICK START — C#/.NET APP
  1. Download Roptimer-Windows-x64.zip from the website/GitHub release.
  2. Extract it and run "Install-DotNet8-DesktopRuntime.bat" if needed.
  3. Double-click "Roptimer.exe", or open a terminal and run:
       RoptimerBoost.exe open
  4. Choose a mode in Boost, preview the JSON, and click Apply.
  5. Use "Save & Launch" to apply local settings and open roblox://.

BOOST CLI COMMANDS
  RoptimerBoost.exe open
  RoptimerBoost.exe bootstrap --launch
  RoptimerBoost.exe preview --mode "Reduce building lag" --tier 21 --texture 0
  RoptimerBoost.exe apply --mode "Better FPS" --fps 144 --all-versions
  RoptimerBoost.exe restore
  RoptimerBoost.exe features
  RoptimerBoost.exe cache-clean --days 7 --force
  RoptimerBoost.exe self-test

SAFETY
  No DLL injection. No Roblox memory reads/writes. No full bright exploit.
  No building removal, no x-ray, no anti-cheat bypass, no gameplay automation.
  No Crashpad/Backtrace/telemetry/screenshot-report disabling. The app sends no
  analytics of its own. It writes reversible local ClientAppSettings.json files,
  keeps backups, and can restore them. For real in-game FPS/ping, use Roblox's
  built-in Performance Stats / Debug Stats overlay.

NOTE
  Current Roblox clients may ignore the legacy DFIntTaskSchedulerTargetFps
  flag because of the local FastFlag allowlist. Use Roblox Settings >
  Maximum Framerate for the supported FPS cap. Extended graphics tiers 0-21
  use the allowlisted DFIntDebugFRMQualityLevelOverride flag; Roblox may change
  or ignore legacy/micro levels above 10.
