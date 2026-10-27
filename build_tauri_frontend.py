#!/usr/bin/env python3
"""Assemble the Rust + Tauri static frontend from the generated website.

The Tauri app ships the SAME UI as the GitHub Pages site (nebula.html layout,
glowing vendored Three.js scene, Windows-only Client tab, allowlist). This
script copies the generated ``web/`` output into ``rust/frontend/`` and strips
things only the website needs (large download zips, hero fallbacks), keeping
the packaged executable small.

Usage:
    python3 build_tauri_frontend.py
    python3 build_tauri_frontend.py --check
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
FRONTEND = ROOT / "rust" / "frontend"

# Assets the app actually references. Kept deliberately small.
ASSET_FILES = [
    "nebula.css",
    "nebula.js",
    "three-scene.js",
    "desktop.js",
]
SVG_ASSETS = [
    "sirius-download.svg",
    "sirius-cli-docs.svg",
    "sirius-allowlist.svg",
    "sirius-starfield.svg",
    "sirius-command-palette.svg",
    "sirius-script-hub.svg",
]
ICON_FILES = [
    "favicon.ico",
    "roptimzier-shield.png",
    "roptimzier-shield.ico",
    "roptimer-web.png",
    "roptimzier-app.png",
]
# Small docs that local doc links point at (kept so `open_external` fallback
# still has something to resolve to; the app otherwise opens the live site).
DOC_FILES = [
    "Roptimer-FastFlag-Allowlist.md",
    "Roptimer-CLI-Docs.md",
    "Roptimer-How-It-Works.md",
    "Roptimer-Mac-README.md",
    "fastflags-allowlist.json",
    "feature-status.json",
]


def build() -> None:
    source_index = WEB / "index.html"
    if not source_index.exists():
        raise SystemExit("web/index.html is missing — run `python3 build_website.py` first.")
    if FRONTEND.exists():
        shutil.rmtree(FRONTEND)
    (FRONTEND / "assets" / "vendor" / "three").mkdir(parents=True, exist_ok=True)
    (FRONTEND / "assets" / "icons").mkdir(parents=True, exist_ok=True)
    (FRONTEND / "downloads").mkdir(parents=True, exist_ok=True)

    shutil.copy2(source_index, FRONTEND / "index.html")
    # Site support files the HTML references (manifest, 404, nojekyll).
    for extra in ["site.webmanifest", "404.html", ".nojekyll"]:
        src = WEB / extra
        if src.exists():
            shutil.copy2(src, FRONTEND / extra)

    for name in ASSET_FILES + SVG_ASSETS:
        src = WEB / "assets" / name
        if src.exists():
            shutil.copy2(src, FRONTEND / "assets" / name)
    for name in ICON_FILES:
        src = WEB / "assets" / "icons" / name
        if src.exists():
            shutil.copy2(src, FRONTEND / "assets" / "icons" / name)

    # Vendored Three.js module graph (self-contained, no CDN).
    vendor_src = WEB / "assets" / "vendor" / "three"
    vendor_dst = FRONTEND / "assets" / "vendor" / "three"
    if vendor_src.exists():
        if vendor_dst.exists():
            shutil.rmtree(vendor_dst)
        shutil.copytree(vendor_src, vendor_dst)

    for name in DOC_FILES:
        src = WEB / "downloads" / name
        if src.exists():
            shutil.copy2(src, FRONTEND / "downloads" / name)

    print(f"Built Tauri frontend at {FRONTEND.relative_to(ROOT)}")


def check() -> None:
    required = [
        FRONTEND / "index.html",
        FRONTEND / "assets" / "nebula.css",
        FRONTEND / "assets" / "nebula.js",
        FRONTEND / "assets" / "three-scene.js",
        FRONTEND / "assets" / "desktop.js",
        FRONTEND / "assets" / "vendor" / "three" / "three.module.min.js",
    ]
    missing = [str(p.relative_to(ROOT)) for p in required if not p.exists()]
    if missing:
        raise SystemExit("Tauri frontend is missing files: " + ", ".join(missing))
    html = (FRONTEND / "index.html").read_text(encoding="utf-8")
    if "three-scene.js" not in html or "detectPanel" not in html or "fastflagAllowlist" not in html:
        raise SystemExit("Tauri frontend index.html does not look like the generated site.")
    print("TAURI FRONTEND CHECK OK")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate the assembled frontend")
    args = parser.parse_args()
    if args.check:
        check()
    else:
        build()


if __name__ == "__main__":
    main()
