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
    print("Built standalone Tauri desktop UI at rust/frontend (website assets are not bundled).")


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
        "renderer preference control": 'id="rendererSelect"',
        "local safety scan": 'id="scanSafety"',
        "embedded canonical allowlist": 'id="fastflagAllowlist"',
    }
    absent = [label for label, marker in expected.items() if marker not in html]
    if absent:
        raise SystemExit("Tauri desktop index is missing: " + ", ".join(absent))
    if PLACEHOLDER in html:
        raise SystemExit("Tauri desktop index still contains the unrendered allowlist placeholder.")
    if any(token in html for token in ("nebula.css", "nebula.js", "desktop.js")):
        raise SystemExit("Tauri frontend must not include or link to the shared website UI.")
    if "@import" in css or "https://" in css or "http://" in css:
        raise SystemExit("Tauri desktop stylesheet must be self-contained and local.")
    if "fetch(" in js or "XMLHttpRequest" in js:
        raise SystemExit("Tauri desktop UI must not make network requests.")
    if any(command not in js for command in ("scan_known_executor_processes", "open_windows_settings")):
        raise SystemExit("Tauri desktop safety scan commands are not wired to the local UI.")
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
    if "ROPTIMER DESKTOP" not in html or "data-icon-style" not in html or "data-accent" not in html:
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
