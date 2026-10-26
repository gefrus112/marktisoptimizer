ROPTIMZIER — safe Roblox performance settings
=============================================

WHAT IS INCLUDED
  Roptimzier.py        Main Python/Tkinter optimizer
  roptimer_hud.py      Optional separate always-on-top HUD
  hud-settings.json    Default HUD preferences
  assets/              App, HUD and website icons
  Run Roptimzier.bat   Windows launcher for the optimizer
  Run HUD.bat          Windows launcher for the HUD

REQUIREMENTS
  Windows 10/11
  Python 3.10 or newer with Tkinter
  Optional: psutil for CPU/RAM hints and running-client detection

QUICK START
  1. Install Python from python.org and make sure Tkinter is included.
  2. Double-click "Run Roptimzier.bat", or run: py -3 Roptimzier.py
  3. Pick a preset. "Lag Rescue" uses the lowest safe graphics settings.
  4. Click "Apply Optimizations & Launch".
  5. Restart Roblox if it was already open.
  6. Optional: run "Run HUD.bat" for the separate HUD window.

SAFETY
  No DLL injection. No Roblox memory reads/writes. No full bright exploit.
  No building removal, no x-ray, no anti-cheat bypass, no gameplay automation.
  The optimizer writes local ClientAppSettings.json files, keeps backups, and
  can restore them. For real in-game FPS/ping, use Roblox's built-in
  Performance Stats / Debug Stats overlay.

NOTE
  Current Roblox clients may ignore the legacy DFIntTaskSchedulerTargetFps
  flag because of the local FastFlag allowlist. Use Roblox Settings >
  Maximum Framerate for the supported FPS cap.
