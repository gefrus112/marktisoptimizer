#!/usr/bin/env python3
"""Generate web/index.html from the Sirius-style template and feature catalog."""

from __future__ import annotations

import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
TEMPLATE = WEB / "index.template.html"
OUTPUT = WEB / "index.html"
FEATURES = ROOT / "feature-status.json"
DOWNLOADS = WEB / "downloads"

REPO = "https://github.com/gefrus112/robloxclinetbooster"
RELEASE_TAG_WINDOWS = "v3.0.0-windows"
RELEASE_TAG_MAC = "v3.1.0-mac"
RELEASE_PAGE_WINDOWS = f"{REPO}/releases/tag/{RELEASE_TAG_WINDOWS}"
RELEASE_PAGE_MAC = f"{REPO}/releases/tag/{RELEASE_TAG_MAC}"
RELEASE_BASE_WINDOWS = f"{REPO}/releases/download/{RELEASE_TAG_WINDOWS}"
RELEASE_BASE_MAC = f"{REPO}/releases/download/{RELEASE_TAG_MAC}"
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
        "__REPO__": html.escape(REPO, quote=True),
        "__RELEASE_PAGE_WINDOWS__": html.escape(RELEASE_PAGE_WINDOWS, quote=True),
        "__RELEASE_PAGE_MAC__": html.escape(RELEASE_PAGE_MAC, quote=True),
        "__RELEASE_ZIP__": html.escape(f"{RELEASE_BASE_WINDOWS}/Roptimer-Windows-x64.zip", quote=True),
        "__RELEASE_EXE__": html.escape(f"{RELEASE_BASE_WINDOWS}/Roptimer.exe", quote=True),
        "__RELEASE_CLI__": html.escape(f"{RELEASE_BASE_WINDOWS}/RoptimerBoost.exe", quote=True),
        "__RELEASE_MAC_ZIP__": html.escape(f"{RELEASE_BASE_MAC}/Roptimer-Mac.zip", quote=True),
        "__RELEASE_MAC_COMPANION_ZIP__": html.escape(f"{RELEASE_BASE_MAC}/Roptimer-Mac-Companion.zip", quote=True),
        "__RELEASE_MAC_SHA__": html.escape(f"{RELEASE_BASE_MAC}/Roptimer-Mac.zip.sha256", quote=True),
        "__SOURCE_ZIP__": html.escape(SOURCE_ZIP, quote=True),
    }
    for key, value in replacements.items():
        template = template.replace(key, value)
    remaining = sorted(set(re.findall(r"__[A-Z0-9_]+__", template)))
    if remaining:
        raise RuntimeError(f"Website template still contains unresolved placeholders: {remaining}")
    OUTPUT.write_text(template, encoding="utf-8")
    (DOWNLOADS / "feature-status.json").write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Generated {OUTPUT.relative_to(ROOT)} and downloads/feature-status.json")


if __name__ == "__main__":
    build()
