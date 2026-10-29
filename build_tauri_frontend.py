#!/usr/bin/env python3
"""Build the standalone Rust + Tauri desktop interface.

The Windows executable has its own compact desktop UI under ``rust/desktop-ui``;
it does not reuse the GitHub Pages frontend, CSS, or JavaScript.
This script injects the canonical allowlist as local JSON and assembles the
small static bundle embedded by Tauri under ``rust/frontend``.

Usage:
    python3 build_tauri_frontend.py
    python3 build_tauri_frontend.py --check
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RUST = ROOT / "rust"
SOURCE = RUST / "desktop-ui"
FRONTEND = RUST / "frontend"
ALLOWLIST = ROOT / "fastflags-allowlist.json"
PLACEHOLDER = "__FASTFLAG_ALLOWLIST_JSON__"


def load_allowlist() -> dict:
    try:
        value = json.loads(ALLOWLIST.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Could not read canonical allowlist: {exc}") from exc
    if not isinstance(value, dict) or not isinstance(value.get("categories"), list):
        raise SystemExit("Canonical allowlist must contain a categories array.")
    return value


def rendered_html() -> str:
    template_path = SOURCE / "index.html"
    if not template_path.is_file():
        raise SystemExit("rust/desktop-ui/index.html is missing.")
    template = template_path.read_text(encoding="utf-8")
    if template.count(PLACEHOLDER) != 1:
        raise SystemExit(f"Desktop HTML must contain exactly one {PLACEHOLDER} marker.")
    # Keep the JSON safe inside an application/json script element.
    data = json.dumps(load_allowlist(), ensure_ascii=False, separators=(",", ":"))
    data = data.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")
    return template.replace(PLACEHOLDER, data)


def build() -> None:
    for relative in (Path("index.html"), Path("assets/app.css"), Path("assets/app.js")):
        if not (SOURCE / relative).is_file():
            raise SystemExit(f"Desktop UI source is missing: {relative}")
    if FRONTEND.exists():
        shutil.rmtree(FRONTEND)
    (FRONTEND / "assets").mkdir(parents=True, exist_ok=True)
    (FRONTEND / "index.html").write_text(rendered_html(), encoding="utf-8")
    for name in ("app.css", "app.js"):
        shutil.copy2(SOURCE / "assets" / name, FRONTEND / "assets" / name)
    theme_source = SOURCE / "assets" / "themes"
    if theme_source.is_dir():
        shutil.copytree(theme_source, FRONTEND / "assets" / "themes")
    print("Built standalone Tauri desktop UI at rust/frontend (local theme assets only; website assets are not bundled).")


def check() -> None:
    required = [FRONTEND / "index.html", FRONTEND / "assets" / "app.css", FRONTEND / "assets" / "app.js"]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.is_file()]
    if missing:
        raise SystemExit("Tauri desktop frontend is missing files: " + ", ".join(missing))
    html = (FRONTEND / "index.html").read_text(encoding="utf-8")
    css = (FRONTEND / "assets" / "app.css").read_text(encoding="utf-8")
    js = (FRONTEND / "assets" / "app.js").read_text(encoding="utf-8")
    expected = {
        "main view": 'id="mainView"',
        "settings view": 'id="settingsView"',
        "Rendering section": 'data-tab="rendering"',
        "Geometry section": 'data-tab="geometry"',
        "Icons section": 'data-tab="icons"',
        "Allowlist section": 'data-tab="allowlist"',
        "Windows Security settings tab": 'data-tab="security"',
        "Defender handoff action": 'id="securityOpenWindowsSecurity"',
        "local process-name rescan in Security": 'id="securityRescanProcesses"',
        "WireGuard VPN settings tab": 'data-tab="vpn"',
        "WireGuard profile import action": 'id="wireguardImportButton"',
        "local WireGuard .conf selector": 'id="wireguardConfigFile"',
        "WireGuard tunnel connection controls": 'id="wireguardConnectButton"',
        "WireGuard disconnect action": 'id="wireguardDisconnectButton"',
        "WireGuard profile removal action": 'id="wireguardRemoveButton"',
        "official WireGuard download shortcut": 'id="wireguardDownloadButton"',
        "local System tab": 'data-tab="system"',
        "local Notifications tab": 'data-tab="notifications"',
        "in-app notification center": 'id="notificationDrawer"',
        "explicit desktop permission control": 'id="requestNotifications"',
        "read-only hardware inventory": 'id="refreshDevice"',
        "on-demand Roblox latency probe": 'id="probeRobloxLatency"',
        "Windows Graphics settings shortcut": 'id="openGraphicsSettings"',
        "safe rendering presets": 'data-preset="quality"',
        "on-device named profile library": 'id="profileLibrarySelect"',
        "save named profile action": 'id="saveNamedProfile"',
        "profile JSON import control": 'id="importSavedProfileFile"',
        "anime theme gallery": 'id="animeThemeGrid"',
        "theme search": 'id="animeThemeSearch"',
        "actual FPS guidance": 'Performance Stats',
        "F5 quick status": 'id="quickRefreshTime"',
        "manual before-and-after journal": 'id="saveBenchmarkAfter"',
        "manual Roblox FPS and ping inputs": 'id="benchmarkBeforeFps"',
        "Roblox public profile shortcut": 'id="openRobloxProfile"',
        "startup storage warning": 'id="storageNoticeOverlay"',
        "renderer preference control": 'id="rendererSelect"',
        "local safety scan": 'id="scanSafety"',
        "Windows Security Defender handoff": 'id="openWindowsSecurity"',
        "local scan limits and Defender guidance": 'id="safetyScanHelp"',
        "Roblox launcher": 'id="launchRoblox"',
        "latest app release link": 'id="openLatestRelease"',
        "manual exact-server rejoin action": 'id="rejoinSameServer"',
        "local Player-process observation timer": 'id="playerRuntimeWatch"',
        "Player timer disclaimer": 'This is not a game-session timer.',
        "apply-and-launch confirmation action": 'id="applyLaunch"',
        "opt-in experimental FPS toggle": 'id="legacyFpsToggle"',
        "experimental FPS slider": 'id="fpsTarget"',
        "embedded canonical allowlist": 'id="fastflagAllowlist"',
    }
    absent = [label for label, marker in expected.items() if marker not in html]
    if absent:
        raise SystemExit("Tauri desktop index is missing: " + ", ".join(absent))
    theme_files = set(re.findall(r'file:\s*"([^"]+\.jpg)"', js))
    source_theme_files = {path.name for path in (SOURCE / "assets" / "themes").glob("*.jpg")}
    output_theme_files = {path.name for path in (FRONTEND / "assets" / "themes").glob("*.jpg")}
    if not theme_files or theme_files != source_theme_files or theme_files != output_theme_files:
        raise SystemExit("Bundled anime theme images must match the local gallery registry and generated frontend assets.")
    if PLACEHOLDER in html:
        raise SystemExit("Tauri desktop index still contains the unrendered allowlist placeholder.")
    if any(token in html for token in ("nebula.css", "nebula.js", "desktop.js")):
        raise SystemExit("Tauri frontend must not include or link to the shared website UI.")
    if "@import" in css or "https://" in css or "http://" in css:
        raise SystemExit("Tauri desktop stylesheet must be self-contained and local.")
    if "fetch(" in js or "XMLHttpRequest" in js:
        raise SystemExit("Tauri desktop UI must not make network requests.")
    required_commands = (
        "scan_known_executor_processes",
        "device_snapshot",
        "storage_snapshot",
        "probe_roblox_latency",
        "open_windows_settings",
        "open_roblox_profile",
        "open_latest_release",
        "exit_app",
        "launch_roblox",
        "rejoin_roblox_server",
        "open_wireguard_download",
        "wireguard_vpn_status",
        "wireguard_vpn_import",
        "wireguard_vpn_connect",
        "wireguard_vpn_disconnect",
        "wireguard_vpn_remove",
        "apply_settings",
        "restore_settings",
    )
    if any(command not in js for command in required_commands):
        raise SystemExit("Tauri desktop local commands are not wired to the UI.")
    tauri_source = (RUST / "src-tauri" / "src" / "lib.rs").read_text(encoding="utf-8")
    if "fn rejoin_roblox_server" not in tauri_source or "            rejoin_roblox_server," not in tauri_source:
        raise SystemExit("The manual server-rejoin command must be registered in the Tauri bridge.")
    vpn_source = (RUST / "src-tauri" / "src" / "vpn.rs").read_text(encoding="utf-8")
    vpn_command_names = (
        "wireguard_vpn_status",
        "wireguard_vpn_import",
        "wireguard_vpn_connect",
        "wireguard_vpn_disconnect",
        "wireguard_vpn_remove",
    )
    if "            open_wireguard_download," not in tauri_source or any(
        f"pub fn {name}" not in vpn_source or f"vpn::{name}," not in tauri_source
        for name in vpn_command_names
    ):
        raise SystemExit("WireGuard VPN commands must be registered in the Tauri bridge.")
    if "legacyFps: false" not in js or "Experimental legacy FPS target" not in html:
        raise SystemExit("The experimental legacy FPS request must remain explicitly opt-in by default.")
    profile_library_markers = (
        "const maxSavedProfiles = 12",
        "const maxProfileImportBytes = 64 * 1024",
        "function isValidImportedProfile(profile)",
        "function loadSelectedProfile()",
        "function exportSelectedProfile()",
        "function deleteSelectedProfile()",
    )
    if any(marker not in js for marker in profile_library_markers):
        raise SystemExit("The local profile library must retain its limits, import validation, and management actions.")
    if "Potential malware/executor warning" not in js or "not a malware verdict" not in js:
        raise SystemExit("Potential malware warnings must stay paired with a clear name-match disclaimer.")
    if any((FRONTEND / "assets" / name).exists() for name in ("nebula.css", "nebula.js", "desktop.js")):
        raise SystemExit("Old website UI assets remain in the generated Tauri bundle.")
    try:
        start = html.index('<script id="fastflagAllowlist" type="application/json">') + len('<script id="fastflagAllowlist" type="application/json">')
        end = html.index("</script>", start)
        embedded = json.loads(html[start:end])
    except (ValueError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Embedded allowlist JSON is invalid: {exc}") from exc
    if embedded != load_allowlist():
        raise SystemExit("Embedded UI allowlist differs from the canonical root allowlist.")
    if "MARKTIS OPTIMIZER DESKTOP" not in html or "data-icon-style" not in html or "data-accent" not in html:
        raise SystemExit("Tauri frontend does not include the desktop appearance controls.")
    print("TAURI DESKTOP FRONTEND CHECK OK: independent UI, local assets, canonical allowlist.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate the assembled desktop frontend")
    args = parser.parse_args()
    if args.check:
        check()
    else:
        build()


if __name__ == "__main__":
    main()
