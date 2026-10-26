#!/usr/bin/env python3
"""Generate web/index.html from the Lumina-style template and feature catalog."""

from __future__ import annotations

import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
TEMPLATE = WEB / "index.template.html"
OUTPUT = WEB / "index.html"
FEATURES = ROOT / "feature-status.json"
DOWNLOADS = WEB / "downloads"

RELEASE_TAG = "v3.0.0-windows"
REPO = "https://github.com/gefrus112/robloxclinetbooster"
RELEASE_PAGE = f"{REPO}/releases/tag/{RELEASE_TAG}"
RELEASE_BASE = f"{REPO}/releases/download/{RELEASE_TAG}"
SOURCE_ZIP = "downloads/Roptimer-DotNet-Source.zip"


def build() -> None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    template = TEMPLATE.read_text(encoding="utf-8")
    catalog = json.loads(FEATURES.read_text(encoding="utf-8"))
    # Escape '<' so an embedded JSON value can never terminate the script tag.
    compact = json.dumps(catalog, ensure_ascii=False, separators=(",", ":"))
    safe_json = compact.replace("<", "\\u003c")
    replacements = {
        "__FEATURE_JSON__": safe_json,
        "__RELEASE_PAGE__": html.escape(RELEASE_PAGE, quote=True),
        "__RELEASE_ZIP__": html.escape(f"{RELEASE_BASE}/Roptimer-Windows-x64.zip", quote=True),
        "__RELEASE_EXE__": html.escape(f"{RELEASE_BASE}/Roptimer.exe", quote=True),
        "__RELEASE_CLI__": html.escape(f"{RELEASE_BASE}/RoptimerBoost.exe", quote=True),
        "__SOURCE_ZIP__": html.escape(SOURCE_ZIP, quote=True),
    }
    for key, value in replacements.items():
        template = template.replace(key, value)
    if "__" in template and any(key in template for key in replacements):
        raise RuntimeError("Website template still contains unresolved placeholders.")
    OUTPUT.write_text(template, encoding="utf-8")
    (DOWNLOADS / "feature-status.json").write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Generated {OUTPUT.relative_to(ROOT)} and downloads/feature-status.json")


if __name__ == "__main__":
    build()
