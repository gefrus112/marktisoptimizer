#!/usr/bin/env python3
"""Build the downloadable ROPTIMER HUB V3 packages used by web/index.html.

Outputs:
    web/index.html
    web/downloads/Roptimzier.py
    web/downloads/roptimer_hud.py
    web/downloads/hud-settings.json
    web/downloads/Roptimzier-Windows.zip
    web/downloads/Roptimer-DotNet-Source.zip
    web/downloads/feature-status.json
    web/downloads/RoptimerBoost.bat
    web/downloads/Run-Roptimer.bat
    web/downloads/Install-DotNet8-DesktopRuntime.bat
    web/downloads/Roptimer-Boost-Commands.txt
    web/downloads/Roptimer-DotNet-README.md
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
DOWNLOADS = WEB / "downloads"
ICONS = WEB / "assets" / "icons"
ASSETS = ROOT / "assets"
DOTNET = ROOT / "dotnet"

APP_SOURCE = ROOT / "roblox_fps_optimizer.py"
HUD_SOURCE = ROOT / "roptimer_hud.py"

DEFAULT_HUD_SETTINGS = {
    "app": "Roptimer HUD V3",
    "version": 3,
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
    "accent": "#7c5cff",
    "gameProfile": "roleplay",
    "fpsTarget": 144,
    "laptopClass": "auto",
    "tier": "BALANCED",
    "robloxUsername": "",
    "showUsername": True,
    "sessionNotification": True,
    "sessionMode": "safe",
    "optimizationMode": "Better FPS",
    "graphicsTier": 1,
    "textureTier": 1,
    "theme": "Lumina",
    "cacheCleanupDays": 7,
    "privacyMode": True,
    "safety": {
        "injection": False,
        "memoryReads": False,
        "antiCheatBypass": False,
        "automation": False,
    },
}

README_TEXT = """ROPTIMER HUB V3 — safe Roblox performance settings
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
"""

RUN_APP_BAT = """@echo off
title Roptimzier V3
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
title Roptimer HUD V3
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 roptimer_hud.py --settings hud-settings.json
) else (
  python roptimer_hud.py --settings hud-settings.json
)
if %errorlevel% neq 0 pause
"""


def generate_website() -> None:
    subprocess.run([sys.executable, str(ROOT / "build_website.py")], cwd=str(ROOT), check=True)


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
        "roptimzier-shield.ico",
        "roptimzier-shield.png",
    ):
        source = ICONS / name
        if source.is_file():
            shutil.copy2(source, ASSETS / name)


def copy_dotnet_support_files() -> None:
    """Copy source-only launchers/docs so the static website can link to them."""
    mappings = {
        DOTNET / "RoptimerBoost.bat": DOWNLOADS / "RoptimerBoost.bat",
        DOTNET / "Run Roptimer.bat": DOWNLOADS / "Run-Roptimer.bat",
        DOTNET / "Install-DotNet8-DesktopRuntime.bat": DOWNLOADS / "Install-DotNet8-DesktopRuntime.bat",
        DOTNET / "Roptimer Boost Commands.txt": DOWNLOADS / "Roptimer-Boost-Commands.txt",
        DOTNET / "README.md": DOWNLOADS / "Roptimer-DotNet-README.md",
        DOTNET / "LICENSE": DOWNLOADS / "Roptimer-DotNet-LICENSE.txt",
        DOTNET / "THIRD_PARTY_NOTICES.md": DOWNLOADS / "THIRD_PARTY_NOTICES.md",
        ROOT / "feature-status.json": DOWNLOADS / "feature-status.json",
    }
    for source, destination in mappings.items():
        if source.is_file():
            shutil.copy2(source, destination)


def build_dotnet_source_zip() -> Path:
    """Create a source ZIP without build outputs or generated binaries."""
    source_zip = DOWNLOADS / "Roptimer-DotNet-Source.zip"
    if source_zip.exists():
        source_zip.unlink()
    excluded_dirs = {"bin", "obj", "artifacts", ".vs", "__pycache__", ".git", ".tmp_references"}
    excluded_suffixes = {".exe", ".pdb", ".user", ".suo", ".cache"}
    with zipfile.ZipFile(source_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(DOTNET.rglob("*")):
            if not path.is_file():
                continue
            if any(part in excluded_dirs for part in path.parts):
                continue
            if path.suffix.lower() in excluded_suffixes:
                continue
            arcname = Path("Roptimer-DotNet-Source") / "dotnet" / path.relative_to(DOTNET)
            archive.write(path, arcname.as_posix())
        extras = [
            ROOT / "feature-status.json",
            ROOT / "README.md",
            ROOT / "build_downloads.py",
            ROOT / "build_website.py",
            ROOT / "roblox_fps_optimizer.py",
            ROOT / "roptimer_hud.py",
            ROOT / "requirements.txt",
            ROOT / "requirements-optional.txt",
            ROOT / ".github/workflows/build-windows.yml",
            WEB / "index.template.html",
            WEB / "index.html",
            WEB / "assets/lumina-hero.png",
            WEB / "assets/roptimzier-shield-icon.svg",
            ICONS / "roptimzier-shield.png",
            ICONS / "roptimzier-shield.ico",
            ICONS / "favicon.ico",
        ]
        for path in extras:
            if not path.is_file():
                continue
            if path.is_relative_to(WEB):
                rel = path.relative_to(WEB)
                arcname = Path("Roptimer-DotNet-Source") / "web" / rel
            elif path.is_relative_to(ROOT / ".github"):
                arcname = Path("Roptimer-DotNet-Source") / ".github" / path.relative_to(ROOT / ".github")
            else:
                arcname = Path("Roptimer-DotNet-Source") / path.name
            archive.write(path, arcname.as_posix())
    return source_zip


def build() -> None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    generate_website()
    copy_assets_to_root()
    copy_dotnet_support_files()
    source_zip = build_dotnet_source_zip()

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
        "roptimzier-shield.ico",
        "roptimzier-shield.png",
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
        archive.write(ROOT / "feature-status.json", "Roptimzier-Windows/feature-status.json")
        archive.write(DOTNET / "README.md", "Roptimzier-Windows/Roptimer-DotNet-README.md")
        archive.write(source_zip, "Roptimzier-Windows/Roptimer-DotNet-Source.zip")
        archive.write(DOTNET / "RoptimerBoost.bat", "Roptimzier-Windows/RoptimerBoost.bat")
        archive.write(DOTNET / "Roptimer Boost Commands.txt", "Roptimzier-Windows/Roptimer-Boost-Commands.txt")
        for optional_name in ("Roptimer-Windows-x64.zip", "Roptimer.exe", "RoptimerBoost.exe", "SHA256SUMS.txt"):
            optional_path = DOWNLOADS / optional_name
            if optional_path.is_file():
                archive.write(optional_path, f"Roptimzier-Windows/{optional_name}")
        for icon_file in sorted(package_icons.iterdir()):
            archive.write(icon_file, f"Roptimzier-Windows/assets/{icon_file.name}")

    print(f"Built {zip_path} ({zip_path.stat().st_size:,} bytes)")
    print(f"Built {source_zip} ({source_zip.stat().st_size:,} bytes)")
    print("Generated website, source package, support files, and Python copies.")


if __name__ == "__main__":
    build()
