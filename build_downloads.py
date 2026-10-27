#!/usr/bin/env python3
"""Build the downloadable Roptimer Hub V3.2 packages used by web/index.html.

Outputs:
    index.html
    404.html
    .nojekyll
    web/index.html
    web/404.html
    web/.nojekyll
    web/site.webmanifest
    web/downloads/Roptimer-Pages-Help.md
    web/downloads/Roptimer-FastFlag-Allowlist.md
    web/downloads/fastflags-allowlist.json
    web/downloads/Roptimer-DotNet-Source.zip
    web/downloads/Roptimzier-Windows.zip
    web/downloads/Roptimer-Mac.zip
    web/downloads/Roptimer-Mac-Companion.zip
    web/downloads/*.sha256
    web/downloads/Roptimer-CLI-Docs.md
    web/downloads/Roptimer-How-It-Works.md
    web/downloads/Roptimer-Script-Hub.md
    web/downloads/Roptimer-Mac-README.md
    web/downloads/Roptimer-Pages-Help.md
    web/downloads/feature-status.json
    web/downloads/Roptimzier.py
    web/downloads/roptimer_hud.py
    web/downloads/hud-settings.json
"""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
DOWNLOADS = WEB / "downloads"
ICONS = WEB / "assets" / "icons"
ASSETS = ROOT / "assets"
DOTNET = ROOT / "dotnet"
RUST = ROOT / "rust"
DOCS = ROOT / "docs"
MAC = ROOT / "mac"

APP_SOURCE = ROOT / "roblox_fps_optimizer.py"
HUD_SOURCE = ROOT / "roptimer_hud.py"

DEFAULT_HUD_SETTINGS = {
    "app": "Roptimer HUD V3.2",
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
    "accent": "#9c8cff",
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
    "theme": "Sirius Dark",
    "cacheCleanupDays": 7,
    "privacyMode": True,
    "safety": {
        "injection": False,
        "memoryReads": False,
        "antiCheatBypass": False,
        "automation": False,
        "gameScriptExecution": False,
    },
}

README_TEXT = """ROPTIMER HUB V3.2 — safe Roblox performance settings
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
  fastflags-allowlist.json Canonical 18-flag Geometry / Rendering / UI allowlist
  Roptimer-FastFlag-Allowlist.md  Human-readable allowlist guide
  assets/                  Shield app, HUD, and website icons
  docs/                    CLI, how-it-works, macOS, Pages, allowlist, and Script Hub docs
  index.html               Root GitHub Pages fallback entry
  404.html / .nojekyll     Static Pages support files
  web/                     Primary GitHub Pages artifact with 100x FX
  Run Roptimer.bat         Windows launcher for the WPF app
  RoptimerBoost.bat        Windows launcher for the Boost CLI
  Run Roptimzier.bat       Windows launcher for the legacy Python app
  Run HUD.bat              Windows launcher for the HUD

GITHUB PAGES
  The website is deployed from web/ by .github/workflows/deploy-pages.yml.
  Set Pages source to "GitHub Actions", or keep legacy main / / and use the
  generated root index.html fallback. Run:
    python3 build_website.py
    python3 build_website.py --check
  See docs/PAGES.md for troubleshooting if README.md appears instead.

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
    RoptimerBoost.exe allowlist
    RoptimerBoost.exe cache-clean --days 7 --force
    RoptimerBoost.exe self-test

  macOS / portable Python:
    ./Roptimer\\ Boost.command --preview
    ./Roptimer\\ Boost.command --apply --mode "Reduce building lag" --graphics-tier 21 --texture-tier 0
    ./Roptimer\\ Boost.command --restore
    ./Roptimer\\ Boost.command --allowlist
    python3 roblox_fps_optimizer.py --allowlist
    python3 roblox_fps_optimizer.py --self-test

SAFETY
  Only the canonical 18 allowlisted Geometry, Rendering, and User Interface
  FastFlags are recognized as managed local JSON keys. The legacy FPS flag is
  separate. No DLL injection. No Roblox memory reads/writes. No full bright exploit.
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
"""

RUN_APP_BAT = """@echo off
title Roptimzier V3.1
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
title Roptimer HUD V3.1
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py -3 roptimer_hud.py --settings hud-settings.json
) else (
  python roptimer_hud.py --settings hud-settings.json
)
if %errorlevel% neq 0 pause
"""

MAC_QUICK_README = """ROPTIMER MAC COMPANION V3.1
===========================

1. Keep this folder together. Do not move individual files.
2. Right-click "Roptimer Mac.app" and choose Open the first time.
3. Or double-click "Roptimer Mac.command" for the optimizer.
4. Use "Roptimer Boost.command" for the safe CLI, for example:
     ./Roptimer\\ Boost.command --preview
     ./Roptimer\\ Boost.command --apply --mode "Reduce building lag" --no-launch
     ./Roptimer\\ Boost.command --restore
5. Read docs/MAC.md, docs/CLI.md, and docs/HOW_IT_WORKS.md for details.

Requires Python 3.10+ with Tkinter. On macOS, the official python.org build
includes Tkinter. This package is unsigned, so macOS Gatekeeper may require
right-click -> Open on first launch.

Roptimer only writes local ClientAppSettings.json files and keeps backups.
No injection, memory edits, telemetry disabling, or game script execution.
"""


def generate_website() -> None:
    subprocess.run([sys.executable, str(ROOT / "build_website.py")], cwd=str(ROOT), check=True)


def generate_tauri_frontend() -> None:
    """Assemble rust/frontend/ (the Tauri app UI) from the generated website."""
    subprocess.run([sys.executable, str(ROOT / "build_tauri_frontend.py")], cwd=str(ROOT), check=True)


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
        ROOT / "fastflags-allowlist.json": DOWNLOADS / "fastflags-allowlist.json",
    }
    for source, destination in mappings.items():
        if source.is_file():
            shutil.copy2(source, destination)


def copy_docs_to_downloads() -> None:
    """Publish markdown docs as direct website downloads."""
    mappings = {
        DOCS / "CLI.md": DOWNLOADS / "Roptimer-CLI-Docs.md",
        DOCS / "HOW_IT_WORKS.md": DOWNLOADS / "Roptimer-How-It-Works.md",
        DOCS / "SCRIPT_HUB.md": DOWNLOADS / "Roptimer-Script-Hub.md",
        DOCS / "MAC.md": DOWNLOADS / "Roptimer-Mac-README.md",
        DOCS / "MAC_RELEASE_NOTES.md": DOWNLOADS / "Roptimer-Mac-Release-Notes.md",
        DOCS / "PAGES.md": DOWNLOADS / "Roptimer-Pages-Help.md",
        DOCS / "FASTFLAG_ALLOWLIST.md": DOWNLOADS / "Roptimer-FastFlag-Allowlist.md",
    }
    for source, destination in mappings.items():
        if source.is_file():
            shutil.copy2(source, destination)


def sync_feature_catalog() -> None:
    """Keep the C# core, website, and Tauri frontend copies in sync with the root catalog."""
    source = ROOT / "feature-status.json"
    targets = [
        DOTNET / "src" / "Roptimer.Core" / "feature-status.json",
        DOWNLOADS / "feature-status.json",
        RUST / "frontend" / "downloads" / "feature-status.json",
    ]
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def sync_fastflag_allowlist() -> None:
    """Keep the C# core, website, downloads, and Tauri frontend in sync with the root allowlist."""
    source = ROOT / "fastflags-allowlist.json"
    targets = [
        DOTNET / "src" / "Roptimer.Core" / "fastflags-allowlist.json",
        DOWNLOADS / "fastflags-allowlist.json",
        RUST / "frontend" / "downloads" / "fastflags-allowlist.json",
    ]
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def build_dotnet_source_zip() -> Path:
    """Create a source ZIP without build outputs or generated binaries."""
    source_zip = DOWNLOADS / "Roptimer-DotNet-Source.zip"
    if source_zip.exists():
        source_zip.unlink()
    excluded_dirs = {"bin", "obj", "artifacts", ".vs", "__pycache__", ".git", ".tmp_references"}
    excluded_suffixes = {".exe", ".pdb", ".user", ".suo", ".cache", ".zip", ".sha256", ".icns", ".dmg"}
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
            ROOT / "fastflags-allowlist.json",
            ROOT / "README.md",
            ROOT / "THIRD_PARTY_NOTICES.md",
            ROOT / "build_downloads.py",
            ROOT / "build_website.py",
            ROOT / "build_screenshots.py",
            ROOT / "build_tauri_frontend.py",
            WEB / "index.template.html",
            WEB / "assets/nebula.css",
            WEB / "assets/nebula.js",
            WEB / "assets/three-scene.js",
            WEB / "assets/desktop.js",
            RUST / "src-tauri/Cargo.toml",
            RUST / "src-tauri/build.rs",
            RUST / "src-tauri/tauri.conf.json",
            RUST / "src-tauri/capabilities/default.json",
            RUST / "src-tauri/src/lib.rs",
            RUST / "src-tauri/src/main.rs",
            RUST / "src-tauri/src/detect.rs",
            RUST / "src-tauri/src/settings.rs",
            RUST / "README.md",
            ROOT / "roblox_fps_optimizer.py",
            ROOT / "roptimer_hud.py",
            ROOT / "requirements.txt",
            ROOT / "requirements-optional.txt",
            ROOT / ".github/workflows/build-windows.yml",
            ROOT / ".github/workflows/build-macos.yml",
            ROOT / ".github/workflows/build-rust-tauri.yml",
            ROOT / ".github/workflows/deploy-pages.yml",
            ROOT / "index.html",
            ROOT / "404.html",
            ROOT / ".nojekyll",
            WEB / ".nojekyll",
            WEB / "404.html",
            WEB / "site.webmanifest",
            WEB / "robots.txt",
            WEB / "sitemap.xml",
            WEB / "index.html",
            WEB / "assets/sirius.css",
            WEB / "assets/sirius.js",
            WEB / "assets/sirius-hero.png",
            WEB / "assets/roptimzier-shield-icon.svg",
            WEB / "downloads/fastflags-allowlist.json",
            WEB / "downloads/Roptimer-FastFlag-Allowlist.md",
            ICONS / "roptimzier-shield.png",
            ICONS / "roptimzier-shield.ico",
            ICONS / "favicon.ico",
            *sorted(WEB.glob("assets/sirius-*.svg")),
            *sorted((WEB / "assets" / "vendor" / "three").rglob("*.js")),
            WEB / "assets" / "vendor" / "three" / "LICENSE.txt",
            WEB / "assets" / "vendor" / "three" / "VERSION.txt",
            *sorted((RUST / "src-tauri" / "icons").glob("*")),
            *sorted(DOCS.glob("*.md")),
            *sorted(MAC.iterdir()),
        ]
        for path in extras:
            if not path.is_file():
                continue
            if path.is_relative_to(WEB):
                arcname = Path("Roptimer-DotNet-Source") / "web" / path.relative_to(WEB)
            elif path.is_relative_to(ROOT / ".github"):
                arcname = Path("Roptimer-DotNet-Source") / ".github" / path.relative_to(ROOT / ".github")
            else:
                arcname = Path("Roptimer-DotNet-Source") / path.relative_to(ROOT)
            archive.write(path, arcname.as_posix())
    return source_zip


def add_zip_bytes(archive: zipfile.ZipFile, arcname: str, data: bytes, executable: bool = False) -> None:
    info = zipfile.ZipInfo(arcname, date_time=time.localtime()[:6])
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = (0o755 if executable else 0o644) << 16
    archive.writestr(info, data)


def add_zip_file(archive: zipfile.ZipFile, source: Path, arcname: str, executable: bool = False) -> None:
    info = zipfile.ZipInfo(arcname, date_time=time.localtime(source.stat().st_mtime)[:6])
    info.compress_type = zipfile.ZIP_DEFLATED
    info.create_system = 3
    info.external_attr = (0o755 if executable else 0o644) << 16
    archive.writestr(info, source.read_bytes())


def write_sha256(path: Path) -> Path:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    checksum = path.with_name(path.name + ".sha256")
    checksum.write_text(f"{digest}  {path.name}\n", encoding="utf-8")
    return checksum


def build_mac_zip(zip_path: Path, root_name: str, settings_copy: Path) -> Path:
    """Build an unsigned macOS companion package with a .app terminal launcher."""
    if zip_path.exists():
        zip_path.unlink()
    prefix = f"{root_name}/"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        add_zip_bytes(archive, prefix + "README.txt", MAC_QUICK_README.encode("utf-8"))
        add_zip_file(archive, APP_SOURCE, prefix + "roblox_fps_optimizer.py")
        add_zip_file(archive, HUD_SOURCE, prefix + "roptimer_hud.py")
        add_zip_file(archive, settings_copy, prefix + "hud-settings.json")
        add_zip_file(archive, ROOT / "feature-status.json", prefix + "feature-status.json")
        add_zip_file(archive, ROOT / "fastflags-allowlist.json", prefix + "fastflags-allowlist.json")

        launchers = {
            MAC / "Roptimer Mac.command": "Roptimer Mac.command",
            MAC / "Roptimer HUD.command": "Roptimer HUD.command",
            MAC / "Roptimer Boost.command": "Roptimer Boost.command",
        }
        for source, name in launchers.items():
            if source.is_file():
                add_zip_file(archive, source, prefix + name, executable=True)

        # Minimal .app bundle that opens the .command launcher in Terminal.
        add_zip_file(archive, MAC / "Info.plist", prefix + "Roptimer Mac.app/Contents/Info.plist")
        add_zip_bytes(archive, prefix + "Roptimer Mac.app/Contents/PkgInfo", b"APPL????")
        add_zip_file(
            archive,
            MAC / "app-launcher.sh",
            prefix + "Roptimer Mac.app/Contents/MacOS/Roptimer",
            executable=True,
        )

        doc_names = {
            DOCS / "CLI.md": "Roptimer-CLI-Docs.md",
            DOCS / "HOW_IT_WORKS.md": "Roptimer-How-It-Works.md",
            DOCS / "SCRIPT_HUB.md": "Roptimer-Script-Hub.md",
            DOCS / "MAC.md": "Roptimer-Mac-README.md",
            DOCS / "PAGES.md": "Roptimer-Pages-Help.md",
            DOCS / "FASTFLAG_ALLOWLIST.md": "Roptimer-FastFlag-Allowlist.md",
        }
        for source, name in doc_names.items():
            if source.is_file():
                add_zip_file(archive, source, prefix + "docs/" + name)

        for icon_name in ("roptimzier-shield.png", "roptimzier-shield.ico", "favicon.ico"):
            icon = ICONS / icon_name
            if icon.is_file():
                add_zip_file(archive, icon, prefix + "assets/" + icon_name)
    return zip_path


def build_mac_packages(settings_copy: Path) -> list[Path]:
    mac_zip = build_mac_zip(DOWNLOADS / "Roptimer-Mac.zip", "Roptimer-Mac", settings_copy)
    companion_zip = build_mac_zip(
        DOWNLOADS / "Roptimer-Mac-Companion.zip",
        "Roptimer-Mac-Companion",
        settings_copy,
    )
    outputs = [mac_zip, companion_zip]
    for path in outputs[:]:
        outputs.append(write_sha256(path))
    return outputs


def build() -> None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    generate_website()
    generate_tauri_frontend()
    copy_assets_to_root()
    copy_dotnet_support_files()
    copy_docs_to_downloads()
    sync_feature_catalog()
    sync_fastflag_allowlist()
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

    mac_outputs = build_mac_packages(settings_copy)

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
        archive.write(ROOT / "fastflags-allowlist.json", "Roptimzier-Windows/fastflags-allowlist.json")
        archive.write(DOTNET / "README.md", "Roptimzier-Windows/Roptimer-DotNet-README.md")
        archive.write(DOCS / "PAGES.md", "Roptimzier-Windows/Roptimer-Pages-Help.md")
        archive.write(DOCS / "FASTFLAG_ALLOWLIST.md", "Roptimzier-Windows/Roptimer-FastFlag-Allowlist.md")
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
    for path in mac_outputs[:2]:
        print(f"Built {path} ({path.stat().st_size:,} bytes)")
    print("Generated website, root Pages fallback, allowlist files, source package, macOS packages, docs, and Python copies.")


if __name__ == "__main__":
    build()
