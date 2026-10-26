#!/usr/bin/env python3
"""Build and validate the Roptimer Sirius website for GitHub Pages.

Outputs:
    web/index.html          primary Pages artifact
    web/.nojekyll           disables Jekyll processing
    web/404.html            custom not-found page
    web/site.webmanifest    install metadata
    web/robots.txt          crawler metadata
    web/sitemap.xml         basic sitemap
    web/downloads/fastflags-allowlist.json
    index.html              root fallback for legacy branch-based Pages
    404.html                root not-found fallback
    .nojekyll               root Jekyll bypass
    web/downloads/feature-status.json

Usage:
    python3 build_website.py
    python3 build_website.py --check
"""

from __future__ import annotations

import argparse
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
TEMPLATE = WEB / "index.template.html"
OUTPUT = WEB / "index.html"
FEATURES = ROOT / "feature-status.json"
ALLOWLIST = ROOT / "fastflags-allowlist.json"
DOWNLOADS = WEB / "downloads"

ROOT_INDEX = ROOT / "index.html"
ROOT_404 = ROOT / "404.html"
ROOT_NOJEKYLL = ROOT / ".nojekyll"
WEB_INDEX = WEB / "index.html"
WEB_404 = WEB / "404.html"
WEB_NOJEKYLL = WEB / ".nojekyll"
WEB_MANIFEST = WEB / "site.webmanifest"
WEB_ROBOTS = WEB / "robots.txt"
WEB_SITEMAP = WEB / "sitemap.xml"

REPO = "https://github.com/gefrus112/robloxclinetbooster"
SITE_URL = "https://gefrus112.github.io/robloxclinetbooster/"
RELEASE_TAG_WINDOWS = "v3.0.0-windows"
RELEASE_TAG_MAC = "v3.1.0-mac"
RELEASE_PAGE_WINDOWS = f"{REPO}/releases/tag/{RELEASE_TAG_WINDOWS}"
RELEASE_PAGE_MAC = f"{REPO}/releases/tag/{RELEASE_TAG_MAC}"
RELEASE_BASE_WINDOWS = f"{REPO}/releases/download/{RELEASE_TAG_WINDOWS}"
RELEASE_BASE_MAC = f"{REPO}/releases/download/{RELEASE_TAG_MAC}"
SOURCE_ZIP = "downloads/Roptimer-DotNet-Source.zip"

PLACEHOLDER_RE = re.compile(r"__[A-Z0-9_]+__")
ROOT_PATH_RE = re.compile(
    r'(?P<attr>href|src|data-src)="(?P<path>(?:assets|downloads)/[^"#]+|site\.webmanifest|404\.html)"'
)

MANIFEST = {
    "name": "Roptimer Hub — Serious performance tooling.",
    "short_name": "Roptimer",
    "description": "Safe local Roblox performance settings, downloads, CLI docs, and a local Script Hub preview.",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "background_color": "#040405",
    "theme_color": "#040405",
    "icons": [
        {
            "src": "assets/icons/roptimzier-shield.png",
            "sizes": "1024x1024",
            "type": "image/png",
            "purpose": "any maskable",
        },
        {
            "src": "assets/icons/roptimer-web.png",
            "sizes": "1024x1024",
            "type": "image/png",
            "purpose": "any",
        },
    ],
}

ROBOTS = f"""User-agent: *
Allow: /

Sitemap: {SITE_URL}sitemap.xml
"""

SITEMAP = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>{SITE_URL}</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
"""

NOT_FOUND_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#040405" />
  <title>Roptimer — lost in the starfield</title>
  <link rel="icon" href="assets/icons/favicon.ico" sizes="any" />
  <link rel="stylesheet" href="assets/sirius.css" />
  <style>
    body { display:grid; place-items:center; min-height:100vh; padding:24px; text-align:center; }
    .lost { max-width:680px; padding:44px; border:1px solid var(--line); border-radius:22px; background:rgba(8,8,10,.86); box-shadow:var(--shadow); }
    .lost .mark { width:70px; height:70px; margin:0 auto 22px; display:grid; place-items:center; border-radius:20px; background:linear-gradient(135deg,var(--accent),var(--accent-2)); font-family:var(--serif); font-size:36px; font-weight:900; }
    .lost h1 { margin:0 0 10px; font-family:var(--serif); font-size:clamp(38px,7vw,68px); font-weight:400; letter-spacing:-.06em; }
    .lost p { margin:0 auto 24px; max-width:520px; color:var(--muted); line-height:1.75; }
    .lost code { color:var(--accent-2); font-family:var(--mono); }
  </style>
</head>
<body>
  <main class="lost">
    <div class="mark" aria-hidden="true">R</div>
    <h1>Lost in the starfield.</h1>
    <p>That page drifted out of orbit. Jump back to <code>Roptimer Hub</code> and continue with downloads, docs, or the safe Script Hub preview.</p>
    <a class="button primary" href="./index.html">Return to Roptimer</a>
  </main>
</body>
</html>
"""


def replacements(catalog: dict, allowlist: dict) -> dict[str, str]:
    # Escape '<' so an embedded JSON value can never terminate the script tag.
    compact = json.dumps(catalog, ensure_ascii=False, separators=(",", ":"))
    safe_json = compact.replace("<", "\\u003c")
    allowlist_compact = json.dumps(allowlist, ensure_ascii=False, separators=(",", ":"))
    safe_allowlist_json = allowlist_compact.replace("<", "\\u003c")
    return {
        "__FEATURE_JSON__": safe_json,
        "__FASTFLAG_ALLOWLIST_JSON__": safe_allowlist_json,
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


def render(template: str, catalog: dict, allowlist: dict) -> str:
    values = replacements(catalog, allowlist)
    for key, value in values.items():
        template = template.replace(key, value)
    remaining = sorted(set(PLACEHOLDER_RE.findall(template)))
    if remaining:
        raise RuntimeError(f"Website template still contains unresolved placeholders: {remaining}")
    return template


def rewrite_root_paths(document: str) -> str:
    """Rewrite web-relative asset links for a root-level GitHub Pages index."""
    return ROOT_PATH_RE.sub(lambda match: f'{match.group("attr")}="web/{match.group("path")}"', document)


def build() -> None:
    DOWNLOADS.mkdir(parents=True, exist_ok=True)
    template = TEMPLATE.read_text(encoding="utf-8")
    catalog = json.loads(FEATURES.read_text(encoding="utf-8"))
    allowlist = json.loads(ALLOWLIST.read_text(encoding="utf-8"))
    web_html = render(template, catalog, allowlist)

    # Primary Pages artifact.
    WEB_INDEX.write_text(web_html, encoding="utf-8")
    WEB_NOJEKYLL.write_text("", encoding="utf-8")
    WEB_404.write_text(NOT_FOUND_HTML, encoding="utf-8")
    WEB_MANIFEST.write_text(json.dumps(MANIFEST, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    WEB_ROBOTS.write_text(ROBOTS, encoding="utf-8")
    WEB_SITEMAP.write_text(SITEMAP, encoding="utf-8")

    # Legacy branch-based Pages fallback. This is why the README used to appear.
    ROOT_INDEX.write_text(rewrite_root_paths(web_html), encoding="utf-8")
    ROOT_404.write_text(rewrite_root_paths(NOT_FOUND_HTML), encoding="utf-8")
    ROOT_NOJEKYLL.write_text("", encoding="utf-8")

    (DOWNLOADS / "feature-status.json").write_text(
        json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (DOWNLOADS / "fastflags-allowlist.json").write_text(
        json.dumps(allowlist, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(
        "Generated web/index.html, root index.html, .nojekyll, 404.html, "
        "site.webmanifest, robots.txt, sitemap.xml, downloads/feature-status.json, "
        "and downloads/fastflags-allowlist.json"
    )


class ReferenceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.refs: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value for key, value in attrs if value is not None}
        for key in ("href", "src", "data-src"):
            value = values.get(key)
            if value:
                self.refs.append(value)


def local_references(path: Path) -> list[str]:
    parser = ReferenceParser()
    parser.feed(path.read_text(encoding="utf-8"))
    refs: list[str] = []
    for ref in parser.refs:
        if not ref or ref.startswith(("#", "http://", "https://", "mailto:", "data:", "blob:", "//")):
            continue
        clean = urlsplit(ref).path
        if not clean:
            continue
        target = (path.parent / clean).resolve()
        if not target.exists():
            refs.append(f"{path.name}: {ref} -> {target}")
    return refs


def check() -> None:
    required = [
        WEB_INDEX,
        WEB_NOJEKYLL,
        WEB_404,
        WEB_MANIFEST,
        WEB_ROBOTS,
        WEB_SITEMAP,
        ROOT_INDEX,
        ROOT_404,
        ROOT_NOJEKYLL,
        DOWNLOADS / "feature-status.json",
        DOWNLOADS / "fastflags-allowlist.json",
        DOWNLOADS / "Roptimer-FastFlag-Allowlist.md",
    ]
    missing = [str(path.relative_to(ROOT)) for path in required if not path.exists()]
    if missing:
        raise RuntimeError(f"Missing generated website files: {missing}")

    for path in (WEB_INDEX, ROOT_INDEX, WEB_404, ROOT_404):
        text = path.read_text(encoding="utf-8")
        unresolved = sorted(set(PLACEHOLDER_RE.findall(text)))
        if unresolved:
            raise RuntimeError(f"Unresolved placeholders in {path.name}: {unresolved}")
        broken = local_references(path)
        if broken:
            raise RuntimeError("Broken local references:\n" + "\n".join(broken))

    # Validate embedded JSON and standalone metadata.
    web_html = WEB_INDEX.read_text(encoding="utf-8")
    match = re.search(r'<script id="featureCatalog" type="application/json">(.*?)</script>', web_html, re.S)
    if not match:
        raise RuntimeError("featureCatalog script is missing")
    catalog = json.loads(match.group(1))
    if not isinstance(catalog.get("features"), list) or not catalog["features"]:
        raise RuntimeError("featureCatalog has no features")

    allowlist_match = re.search(
        r'<script id="fastflagAllowlist" type="application/json">(.*?)</script>', web_html, re.S
    )
    if not allowlist_match:
        raise RuntimeError("fastflagAllowlist script is missing")
    allowlist = json.loads(allowlist_match.group(1))
    categories = allowlist.get("categories", [])
    flags = [flag for group in categories for flag in group.get("flags", [])]
    if len(categories) != 3 or len(flags) != 18 or "DFIntTaskSchedulerTargetFps" in flags:
        raise RuntimeError("Embedded FastFlag allowlist is invalid")
    json.loads(WEB_MANIFEST.read_text(encoding="utf-8"))

    root_html = ROOT_INDEX.read_text(encoding="utf-8")
    if 'href="web/assets/sirius.css"' not in root_html or 'src="web/assets/sirius.js"' not in root_html:
        raise RuntimeError("Root index does not use web/ prefixed assets")
    if 'id="fastflag-allowlist"' not in web_html or 'id="fastflag-allowlist"' not in root_html:
        raise RuntimeError("FastFlag allowlist Docs section is missing")

    print(
        f"WEBSITE CHECK OK: {len(catalog['features'])} features, "
        f"{len(catalog.get('sources', []))} sources, {len(flags)} allowlisted flags, "
        f"root fallback + Pages artifact valid."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="validate generated website files")
    args = parser.parse_args()
    if args.check:
        check()
    else:
        build()


if __name__ == "__main__":
    main()
