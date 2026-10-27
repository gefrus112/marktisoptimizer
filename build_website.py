#!/usr/bin/env python3
"""Build and validate the Roptimer V4 website for GitHub Pages.

Outputs:
    web/index.html          primary Pages artifact (also the Tauri frontend source)
    web/.nojekyll           disables Jekyll processing
    web/404.html            custom not-found page
    web/site.webmanifest    install metadata
    web/robots.txt          crawler metadata
    web/sitemap.xml         basic sitemap
    web/downloads/fastflags-allowlist.json
    web/downloads/feature-status.json
    index.html              root fallback for legacy branch-based Pages (main /)
    404.html                root not-found fallback
    .nojekyll               root Jekyll bypass

The site is a glowing, vendored-Three.js layout whose MAIN tab is the Windows
"Client". The Rust + Tauri Windows client ships the same UI. On the website the
FastFlag allowlist (Geometry / Rendering / User Interface) is server-rendered
into the HTML so it is visible even if JavaScript fails.

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
VERSION = "4.0.0"
RELEASE_TAG_WINDOWS = "v3.0.0-windows"
RELEASE_TAG_MAC = "v3.1.0-mac"
RELEASE_TAG_RUST = "v4.0.0-windows-rust"
RELEASE_PAGE_WINDOWS = f"{REPO}/releases/tag/{RELEASE_TAG_WINDOWS}"
RELEASE_PAGE_MAC = f"{REPO}/releases/tag/{RELEASE_TAG_MAC}"
RELEASE_PAGE_RUST = f"{REPO}/releases/tag/{RELEASE_TAG_RUST}"
RELEASE_BASE_WINDOWS = f"{REPO}/releases/download/{RELEASE_TAG_WINDOWS}"
RELEASE_BASE_MAC = f"{REPO}/releases/download/{RELEASE_TAG_MAC}"
RELEASE_BASE_RUST = f"{REPO}/releases/download/{RELEASE_TAG_RUST}"
RUST_EXE = "Roptimer-Rust-x64.exe"
SOURCE_ZIP = "downloads/Roptimer-DotNet-Source.zip"

PLACEHOLDER_RE = re.compile(r"__[A-Z0-9_]+__")
ROOT_PATH_RE = re.compile(
    r'(?P<attr>href|src|data-src)="(?P<path>(?:assets|downloads)/[^"#]+|site\.webmanifest|404\.html)"'

)

MANIFEST = {
    "name": "Roptimer — Windows client for safe Roblox performance",
    "short_name": "Roptimer",
    "description": "Rust + Tauri Windows client, Windows-only Client tab, and the 18 Roblox-allowlisted FastFlags with what each improves.",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "background_color": "#030307",
    "theme_color": "#030307",
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
  <meta name="theme-color" content="#030307" />
  <title>Roptimer — lost in the starfield</title>
  <link rel="icon" href="assets/icons/favicon.ico" sizes="any" />
  <link rel="stylesheet" href="assets/nebula.css" />
  <style>
    body { display:grid; place-items:center; min-height:100vh; padding:24px; text-align:center; }
    .lost { max-width:680px; padding:44px; border:1px solid var(--line); border-radius:22px; background:rgba(8,8,16,.86); box-shadow:var(--shadow); }
    .lost .mark { width:70px; height:70px; margin:0 auto 22px; display:grid; place-items:center; border-radius:20px; background:linear-gradient(135deg,#9c8cff,#6fcfff); font-family:var(--serif); font-size:36px; font-weight:900; color:#fff; }
    .lost h1 { margin:0 0 10px; font-family:var(--serif); font-size:clamp(38px,7vw,68px); font-weight:400; letter-spacing:-.06em; }
    .lost p { margin:0 auto 24px; max-width:520px; color:var(--muted); line-height:1.75; }
    .lost code { color:var(--blue); font-family:var(--mono); }
  </style>
</head>
<body>
  <main class="lost">
    <div class="mark" aria-hidden="true">R</div>
    <h1>Lost in the starfield.</h1>
    <p>That page drifted out of orbit. Jump back to <code>Roptimer</code> for the Windows client, the allowlist, docs, and downloads.</p>
    <a class="button primary" href="./index.html">Return to Roptimer</a>
  </main>
</body>
</html>
"""


def esc(value) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def render_allowlist_cards(allowlist: dict) -> str:
    """Server-render the enriched allowlist cards (progressive enhancement)."""
    cat_desc = allowlist.get("categoryDescriptions", {}) or {}
    features = allowlist.get("flagFeatures", {}) or {}
    parts = []
    for group in allowlist.get("categories", []):
        name = group.get("name", "Category")
        flags = group.get("flags", [])
        desc = cat_desc.get(name, {}) or {}
        head = (
            '<div class="allowlist-head">'
            f'<span class="allowlist-count">{len(flags)} {"flag" if len(flags) == 1 else "flags"}</span>'
            f'<h4>{esc(name)}<span class="al-badge">{esc(desc.get("accent", "group"))}</span></h4>'
            + (f'<p class="allowlist-summary">{esc(desc.get("summary"))}</p>' if desc.get("summary") else "")
            + "</div>"
        )
        improves = (
            f'<div class="allowlist-improves"><span class="imp-label">Improves</span>{esc(desc.get("improves"))}</div>'
            if desc.get("improves") else ""
        )
        rows = []
        for flag in flags:
            info = features.get(flag, {}) or {}
            feature = (
                '<div class="al-feature">'
                + (f'<span class="al-f-name">{esc(info.get("feature"))}</span>' if info.get("feature") else "")
                + (f'<span class="al-f-hint">{esc(info.get("valueHint"))}</span>' if info.get("valueHint") else "")
                + "</div>"
            )
            imp = f'<p class="al-improves">{esc(info.get("improves"))}</p>' if info.get("improves") else ""
            rows.append(
                f'<div class="allowlist-flag"><code>{esc(flag)}</code>{feature}{imp}</div>'
            )
        body = '<div class="allowlist-flags">' + "".join(rows) + "</div>"
        parts.append(
            f'<article class="allowlist-card" data-category="{esc(name)}">{head}{improves}{body}</article>'
        )
    return "".join(parts)


def feature_state(status: str) -> str:
    s = (status or "").lower()
    if "reject" in s:
        return "rejected"
    if "legacy" in s:
        return "legacy"
    return "implemented"


def render_feature_cards(catalog: dict) -> str:
    parts = []
    for feature in catalog.get("features", []):
        parts.append(
            f'<article class="feature-card" data-state="{feature_state(feature.get("status"))}">'
            f'<span class="status">{esc(feature.get("status", "Unknown"))}</span>'
            f'<h4>{esc(feature.get("name") or feature.get("id") or "Feature")}</h4>'
            f'<p>{esc(feature.get("details", ""))}</p></article>'
        )
    return "".join(parts)


def render_source_links(catalog: dict) -> str:
    parts = []
    for source in catalog.get("sources", []):
        parts.append(
            f'<a href="{esc(source.get("url", "#"))}" target="_blank" rel="noopener noreferrer">'
            f'{esc(source.get("title") or source.get("url") or "Source")}</a>'
        )
    return "".join(parts)


def replacements(catalog: dict, allowlist: dict) -> dict[str, str]:
    compact = json.dumps(catalog, ensure_ascii=False, separators=(",", ":"))
    safe_json = compact.replace("<", "\\u003c")
    allowlist_compact = json.dumps(allowlist, ensure_ascii=False, separators=(",", ":"))
    safe_allowlist_json = allowlist_compact.replace("<", "\\u003c")
    flags = [f for g in allowlist.get("categories", []) for f in g.get("flags", [])]
    return {
        "__FEATURE_JSON__": safe_json,
        "__FASTFLAG_ALLOWLIST_JSON__": safe_allowlist_json,
        "__ALLOWLIST_CARDS__": render_allowlist_cards(allowlist),
        "__FEATURE_CARDS__": render_feature_cards(catalog),
        "__SOURCE_LINKS__": render_source_links(catalog),
        "__FLAG_COUNT__": str(len(flags)),
        "__CATEGORY_COUNT__": str(len(allowlist.get("categories", []))),
        "__FEATURE_COUNT__": str(len(catalog.get("features", []))),
        "__VERSION__": VERSION,
        "__REPO__": html.escape(REPO, quote=True),
        "__RELEASE_PAGE_WINDOWS__": html.escape(RELEASE_PAGE_WINDOWS, quote=True),
        "__RELEASE_PAGE_MAC__": html.escape(RELEASE_PAGE_MAC, quote=True),
        "__RELEASE_PAGE_RUST__": html.escape(RELEASE_PAGE_RUST, quote=True),
        "__RELEASE_RUST_EXE__": html.escape(f"{RELEASE_BASE_RUST}/{RUST_EXE}", quote=True),
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

    WEB_INDEX.write_text(web_html, encoding="utf-8")
    WEB_NOJEKYLL.write_text("", encoding="utf-8")
    WEB_404.write_text(NOT_FOUND_HTML, encoding="utf-8")
    WEB_MANIFEST.write_text(json.dumps(MANIFEST, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    WEB_ROBOTS.write_text(ROBOTS, encoding="utf-8")
    WEB_SITEMAP.write_text(SITEMAP, encoding="utf-8")

    # Legacy branch-based Pages fallback (main /). This is what the live site uses.
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
        "Generated web/index.html, root index.html (Pages fallback), .nojekyll, "
        "404.html, site.webmanifest, robots.txt, sitemap.xml, and downloads/*.json"
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
        if not ref or ref.startswith(("#", "http://", "https://", "mailto:", "data:", "blob:", "//", "tauri:", "asset:")):
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
        WEB_INDEX, WEB_NOJEKYLL, WEB_404, WEB_MANIFEST, WEB_ROBOTS, WEB_SITEMAP,
        ROOT_INDEX, ROOT_404, ROOT_NOJEKYLL,
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
    # New: enriched features must cover all 18 flags and all categories.
    features = allowlist.get("flagFeatures", {})
    if len(features) != 18 or any(f not in features for f in flags):
        raise RuntimeError("Embedded allowlist flagFeatures are incomplete")
    desc = allowlist.get("categoryDescriptions", {})
    if any(c.get("name") not in desc for c in categories):
        raise RuntimeError("Embedded allowlist categoryDescriptions are incomplete")
    json.loads(WEB_MANIFEST.read_text(encoding="utf-8"))

    root_html = ROOT_INDEX.read_text(encoding="utf-8")
    # V4 asset checks: root fallback uses web/-prefixed assets.
    for asset in ("web/assets/nebula.css", "web/assets/nebula.js", "web/assets/three-scene.js", "web/assets/desktop.js"):
        if asset not in root_html:
            raise RuntimeError(f"Root index does not reference {asset}")
    if 'href="assets/nebula.css"' not in web_html or 'src="assets/nebula.js"' not in web_html:
        raise RuntimeError("web/index.html does not use the V4 nebula assets")
    for token in ("id=\"fastflag-allowlist\"", "detectPanel", "allowlist-card", "al-improves", "Windows"):
        if token not in web_html or token not in root_html:
            raise RuntimeError(f"Generated site is missing expected content: {token}")
    if allowlist.get("windowsOnly") is not True or allowlist.get("platform") != "windows":
        raise RuntimeError("Allowlist must be explicitly marked Windows-only")

    # Vendored Three.js module graph must be self-contained (no bare 'three').
    vendor = WEB / "assets" / "vendor" / "three"
    core = vendor / "three.module.min.js"
    if not core.exists():
        raise RuntimeError("Vendored three.module.min.js is missing")
    for js in [WEB / "assets" / "three-scene.js", *sorted((vendor / "addons").rglob("*.js"))]:
        txt = js.read_text(encoding="utf-8")
        for spec in re.findall(r"""(?:from\s*|import\s*)['"]([^'"]+)['"]""", txt):
            if spec == "three":
                raise RuntimeError(f"Bare 'three' specifier in {js.relative_to(WEB)} (would break without an import map)")
            if spec.startswith(".") and not (js.parent / spec).resolve().exists():
                raise RuntimeError(f"Unresolved module specifier {spec} in {js.relative_to(WEB)}")

    print(
        f"WEBSITE CHECK OK: {len(catalog['features'])} features, "
        f"{len(catalog.get('sources', []))} sources, {len(flags)} allowlisted flags "
        f"({len(features)} with improvements), vendored Three.js self-contained, "
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
