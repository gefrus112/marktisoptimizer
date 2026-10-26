#!/usr/bin/env python3
"""Build the downloadable ROPTIMZIER package used by web/index.html.

Run after changing the Python apps or icon assets:

    python build_downloads.py

Outputs:
    web/downloads/Roptimzier.py
    web/downloads/roptimer_hud.py
    web/downloads/hud-settings.json
    web/downloads/Roptimzier-Windows.zip
"""

from __future__ import annotations

import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
DOWNLOADS = WEB / "downloads"
ICONS = WEB / "assets" / "icons"
ASSETS = ROOT / "assets"

APP_SOURCE = ROOT / "roblox_fps_optimizer.py"
HUD_SOURCE = ROOT / "roptimer_hud.py"

DEFAULT_HUD_SETTINGS = {
    "app": "Roptimer HUD",
    "version": 1,
    "showFps": True,
    "showPing": True,
    "showCpu": True,
    "showRam": True,
    "notifications": True,
    "lowFpsAlert": True,
    "pingAlert": True,
    "autoProfile": True,
    "position": "tl",
    "opacity": 0.94,
    "accent": "#ff2d3f",
    "gameProfile": "roleplay",
    "fpsTarget": 144,
    "laptopClass": "auto",
    "tier": "BALANCED",
    "safety": {
        "injection": False,
        "memoryReads": False,
        "antiCheatBypass": False,
        "automation": False,
    },
}

README_TEXT = """ROPTIMZIER — safe Roblox performance settings
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
"""

RUN_APP_BAT = """@echo off
title Roptimzier
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 Roptimzier.py
) else (
  python Roptimzier.py
)
if %errorlevel% neq 0 pause
"""

RUN_HUD_BAT = """@echo off
title Roptimer HUD
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 roptimer_hud.py --settings hud-settings.json
) else (
  python roptimer_hud.py --settings hud-settings.json
)
if %errorlevel% neq 0 pause
"""


def copy_assets_to_root() -> None:
    """Keep a root assets/ folder so the source apps can load icons directly."""
    ASSETS.mkdir(exist_ok=True)
    for name in (
        "roptimzier-app.ico",
        "roptimzier-app.png",
        "roptimer-hud.ico",
        "roptimer-hud.png",
        "favicon.ico",
        "roptimer-web.png",
    ):
        source = ICONS / name
        if source.is_file():
            shutil.copy2(source, ASSETS / name)


def build() -> None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    copy_assets_to_root()

    app_copy = DOWNLOADS / "Roptimzier.py"
    hud_copy = DOWNLOADS / "roptimer_hud.py"
    settings_copy = DOWNLOADS / "hud-settings.json"
    shutil.copy2(APP_SOURCE, app_copy)
    shutil.copy2(HUD_SOURCE, hud_copy)
    settings_copy.write_text(
        json.dumps(DEFAULT_HUD_SETTINGS, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    package_icons = DOWNLOADS / "assets"
    package_icons.mkdir(exist_ok=True)
    for name in (
        "roptimzier-app.ico",
        "roptimzier-app.png",
        "roptimer-hud.ico",
        "roptimer-hud.png",
        "favicon.ico",
        "roptimer-web.png",
    ):
        source = ICONS / name
        if source.is_file():
            shutil.copy2(source, package_icons / name)

    readme = DOWNLOADS / "package-readme.txt"
    readme.write_text(README_TEXT, encoding="utf-8")
    app_bat = DOWNLOADS / "package-run-app.bat"
    app_bat.write_text(RUN_APP_BAT, encoding="utf-8")
    hud_bat = DOWNLOADS / "package-run-hud.bat"
    hud_bat.write_text(RUN_HUD_BAT, encoding="utf-8")

    zip_path = DOWNLOADS / "Roptimzier-Windows.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.write(app_copy, "Roptimzier-Windows/Roptimzier.py")
        archive.write(hud_copy, "Roptimzier-Windows/roptimer_hud.py")
        archive.write(settings_copy, "Roptimzier-Windows/hud-settings.json")
        archive.write(readme, "Roptimzier-Windows/README.txt")
        archive.write(app_bat, "Roptimzier-Windows/Run Roptimzier.bat")
        archive.write(hud_bat, "Roptimzier-Windows/Run HUD.bat")
        for icon_file in sorted(package_icons.iterdir()):
            archive.write(icon_file, f"Roptimzier-Windows/assets/{icon_file.name}")

    print(f"Built {zip_path} ({zip_path.stat().st_size:,} bytes)")
    print(f"Copied {app_copy.name}, {hud_copy.name}, {settings_copy.name} into {DOWNLOADS}")


if __name__ == "__main__":
    build()
