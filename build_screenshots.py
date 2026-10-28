#!/usr/bin/env python3
"""Generate crisp SVG product screenshots for the Sirius-style Roptimer website.

The SVGs are original design previews. They contain no Roblox game screenshots,
no executable code, and no exploit/script-executor content.
"""

from __future__ import annotations

from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "web" / "assets"

BG = "#050506"
PANEL = "#0a0a0d"
PANEL_2 = "#101014"
BORDER = "#29292f"
TEXT = "#f4f1e9"
MUTED = "#a1a0a6"
DIM = "#6e6d75"
ACCENT = "#9c8cff"
ACCENT_2 = "#72c7ff"
AMBER = "#f2b65d"
RED = "#ff6b6b"
GREEN_OK = "#7cc6ff"  # cool blue, never neon green

STARS = [
    (45, 60, 1.0), (130, 120, .7), (210, 44, .8), (330, 90, .5), (470, 55, .9),
    (610, 130, .6), (720, 45, 1.0), (850, 105, .7), (990, 60, .8), (1130, 140, .6),
    (75, 250, .6), (250, 310, .8), (420, 240, .5), (580, 330, 9), (760, 270, .6),
    (920, 350, .8), (1080, 260, .5), (60, 470, .8), (190, 550, .6), (360, 490, .7),
    (520, 610, .5), (690, 520, .8), (840, 600, .6), (1010, 500, .9), (1160, 620, .5),
    (35, 680, .7), (275, 665, .5), (455, 700, .8), (635, 685, .6), (805, 710, .5),
    (970, 675, .7), (1120, 705, .6), (150, 190, .5), (390, 150, .6), (660, 190, .5),
    (895, 200, .6), (1040, 175, .5), (75, 365, .5), (300, 400, .6), (735, 390, .5),
]


def e(value: str) -> str:
    return escape(value, quote=True)


def rect(x: int, y: int, w: int, h: int, fill: str, rx: int = 0, stroke: str = "", sw: int = 1, opacity: float = 1) -> str:
    border = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"{border} opacity="{opacity}"/>'


def txt(x: int, y: int, value: str, size: int = 16, fill: str = TEXT, weight: int = 400,
        family: str = "Arial, Helvetica, sans-serif", anchor: str = "start", opacity: float = 1,
        letter: float = 0) -> str:
    spacing = f' letter-spacing="{letter}"' if letter else ""
    return (
        f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}" '
        f'font-family="{family}" text-anchor="{anchor}" opacity="{opacity}"{spacing}>{e(value)}</text>'
    )


def line(x1: int, y1: int, x2: int, y2: int, stroke: str = BORDER, sw: int = 1, opacity: float = 1) -> str:
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}" opacity="{opacity}"/>'


def circle(x: int, y: int, r: int, fill: str, opacity: float = 1, stroke: str = "", sw: int = 1) -> str:
    border = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ""
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}" opacity="{opacity}"{border}/>'


def code_lines(x: int, y: int, lines: list[tuple[str, str]], step: int = 24, size: int = 14) -> str:
    out: list[str] = []
    for index, (prefix, value) in enumerate(lines):
        yy = y + index * step
        out.append(txt(x, yy, prefix, size, DIM, 700, "SFMono-Regular, Consolas, monospace"))
        out.append(txt(x + 18, yy, value, size, TEXT, 400, "SFMono-Regular, Consolas, monospace"))
    return "".join(out)


DEFS = f"""<defs>
  <linearGradient id="grad" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="{ACCENT}" stop-opacity=".22"/>
    <stop offset="1" stop-color="{ACCENT_2}" stop-opacity=".05"/>
  </linearGradient>
  <linearGradient id="progress" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="{ACCENT}"/>
    <stop offset="1" stop-color="{ACCENT_2}"/>
  </linearGradient>
  <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="18" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>"""


def stars() -> str:
    return "".join(circle(x, y, 2 if r > .8 else 1, "#ffffff", r) for x, y, r in STARS)


def svg_doc(title: str, body: str) -> str:
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" '
        f'role="img" aria-label="{e(title)}"><title>{e(title)}</title>{DEFS}'
        f'{rect(0, 0, 1200, 720, BG)}{rect(0, 0, 1200, 720, "url(#grad)", opacity=.45)}{stars()}{body}</svg>'
    )


def window(x: int, y: int, w: int, h: int, title: str) -> str:
    return "".join([
        rect(x, y, w, h, PANEL, 16, BORDER),
        rect(x, y, w, 48, PANEL_2, 16),
        rect(x, y + 40, w, 8, PANEL_2),
        circle(x + 22, y + 24, 6, RED),
        circle(x + 44, y + 24, 6, AMBER),
        circle(x + 66, y + 24, 6, GREEN_OK),
        txt(x + 95, y + 30, title, 13, MUTED, 700),
        line(x, y + 48, x + w, y + 48, BORDER),
    ])


def download_svg() -> str:
    b: list[str] = []
    b.append(rect(0, 0, 1200, 86, "#070708", 0, BORDER))
    b.append(rect(34, 26, 34, 34, ACCENT, 10))
    b.append(txt(51, 50, "R", 21, TEXT, 900, "Georgia, serif", "middle"))
    b.append(txt(82, 50, "Roptimer", 17, TEXT, 700))
    b.append(txt(188, 50, "Download", 13, TEXT, 700))
    b.append(txt(282, 50, "Docs", 13, MUTED, 700))
    b.append(txt(344, 50, "Scripts", 13, MUTED, 700))
    b.append(txt(1000, 50, "GitHub", 13, MUTED, 700))
    b.append(rect(1080, 28, 90, 36, "#141418", 10, BORDER))
    b.append(txt(1125, 51, "Get Roptimer", 11, TEXT, 700, anchor="middle"))
    b.append(txt(70, 180, "ROPTIMER V4 · WINDOWS SETUP WIZARDS", 12, AMBER, 800, letter=2.2))
    b.append(txt(70, 260, "Install once.", 58, TEXT, 400, "Georgia, 'Times New Roman', serif"))
    b.append(txt(70, 326, "Launch without a batch file.", 43, TEXT, 400, "Georgia, 'Times New Roman', serif"))
    b.append(txt(72, 380, "Choose the primary Rust + Tauri app or optional Electron shell.", 16, MUTED))
    b.append(txt(72, 408, "Both installers create shortcuts and keep settings local.", 16, MUTED))
    b.append(rect(70, 440, 190, 46, "#141418", 10, BORDER))
    b.append(txt(165, 469, "Guided setup", 13, TEXT, 700, anchor="middle"))
    b.append(rect(274, 440, 160, 46, BG, 10, BORDER))
    b.append(txt(354, 469, "Read the docs", 13, MUTED, 700, anchor="middle"))
    # Primary Tauri and optional Electron installer cards.
    b.append(rect(650, 175, 230, 310, PANEL, 16, BORDER))
    b.append(rect(910, 175, 230, 310, PANEL, 16, BORDER))
    b.append(txt(675, 215, "PRIMARY · TAURI", 11, ACCENT_2, 800, letter=1.5))
    b.append(txt(675, 265, "Roptimer Setup", 22, TEXT, 700))
    b.append(txt(675, 300, "Rust + Tauri · WebView2", 13, MUTED))
    b.append(rect(675, 330, 180, 1, BORDER))
    for i, label in enumerate(["Guided x64 installer", "Main + grouped Settings", "Local backups & restore", "Shortcuts + uninstall"]):
        b.append(txt(675, 360 + i * 22, "◆  " + label, 12, TEXT))
    b.append(rect(675, 441, 180, 36, ACCENT, 9))
    b.append(txt(765, 464, "Install Roptimer", 12, TEXT, 800, anchor="middle"))
    b.append(txt(935, 215, "OPTIONAL · ELECTRON", 11, AMBER, 800, letter=1.5))
    b.append(txt(935, 265, "Roptimer Electron", 22, TEXT, 700))
    b.append(txt(935, 300, "Electron · Chromium", 13, MUTED))
    b.append(rect(935, 330, 180, 1, BORDER))
    for i, label in enumerate(["Guided x64 installer", "Same desktop interface", "No batch launcher", "Shortcuts + uninstall"]):
        b.append(txt(935, 360 + i * 22, "◆  " + label, 12, TEXT))
    b.append(rect(935, 441, 180, 36, "#17171b", 9, BORDER))
    b.append(txt(1025, 464, "Install Electron", 12, TEXT, 800, anchor="middle"))
    b.append(line(0, 620, 1200, 620, BORDER))
    b.append(txt(70, 665, "2 Windows app shells", 15, TEXT, 700))
    b.append(txt(340, 665, "2 guided setup wizards", 15, TEXT, 700))
    b.append(txt(620, 665, "0 batch launchers", 15, TEXT, 700))
    b.append(txt(890, 665, "Local settings only", 15, TEXT, 700))
    return svg_doc("Roptimer Windows installer choices", "".join(b))


def cli_docs_svg() -> str:
    b: list[str] = [window(50, 50, 1100, 620, "Roptimer — Docs & How it works")]
    # left docs nav
    b.append(rect(50, 98, 250, 572, "#08080a"))
    b.append(line(300, 98, 300, 670, BORDER))
    for i, label in enumerate(["Overview", "How it works", "Boost CLI", "Performance", "macOS", "Safety"]):
        active = i == 2
        if active:
            b.append(rect(68, 128 + i * 48, 214, 36, "#17171c", 8))
        b.append(txt(86, 152 + i * 48, label, 13, TEXT if active else MUTED, 700 if active else 400))
    b.append(txt(340, 140, "Boost CLI", 30, TEXT, 400, "Georgia, serif"))
    b.append(txt(340, 170, "Preview, apply, and restore safe local settings.", 14, MUTED))
    b.append(rect(340, 195, 760, 220, "#070709", 12, BORDER))
    b.append(txt(360, 225, "TERMINAL", 10, DIM, 800, letter=2))
    b.append(code_lines(360, 255, [
        ("$", "RoptimerBoost.exe preview --mode 'Reduce building lag' --tier 21 --texture 0"),
        ("$", "RoptimerBoost.exe apply --mode 'Better FPS' --fps 144 --all-versions"),
        ("$", "RoptimerBoost.exe restore"),
        ("$", "RoptimerBoost.exe features"),
        ("$", "RoptimerBoost.exe self-test"),
    ], step=30, size=13))
    b.append(txt(340, 455, "Performance profile", 19, TEXT, 700))
    bars = [("Before", 560, DIM), ("Balanced", 390, ACCENT), ("Max performance", 250, ACCENT_2)]
    for i, (label, width, color) in enumerate(bars):
        yy = 480 + i * 42
        b.append(txt(340, yy + 18, label, 13, MUTED))
        b.append(rect(500, yy, 520, 18, "#101014", 9))
        b.append(rect(500, yy, width, 18, color, 9))
    b.append(rect(340, 620, 760, 1, BORDER))
    b.append(txt(340, 650, "Legacy FPS flag may be ignored • Use Roblox Settings → Maximum Framerate", 12, MUTED))
    return svg_doc("Roptimer Boost CLI docs screenshot", "".join(b))


def script_hub_svg() -> str:
    b: list[str] = [window(60, 55, 1080, 610, "Roptimer Script Hub — local UI preview only")]
    b.append(rect(60, 103, 220, 562, "#08080a"))
    b.append(line(280, 103, 280, 665, BORDER))
    b.append(txt(84, 140, "ROPTIMER UI", 11, AMBER, 800, letter=2))
    for i, label in enumerate(["Script Hub", "Loading GUI", "Performance", "Session Toast", "Backups", "Safety"]):
        active = i == 0
        if active:
            b.append(rect(76, 160 + i * 48, 184, 34, "#17171c", 8))
        b.append(txt(92, 182 + i * 48, label, 13, TEXT if active else MUTED, 700 if active else 400))
    b.append(txt(310, 140, "Script Hub", 28, TEXT, 400, "Georgia, serif"))
    b.append(txt(310, 166, "Original local UI recipes · no game execution · no executor APIs", 12, MUTED))
    cards = [("Sirius Loading GUI", "Loader + steps"), ("Performance Preset", "Mode card"),
             ("Session Ready Toast", "Notification"), ("Backup Status", "Local log")]
    for i, (name, detail) in enumerate(cards):
        x = 310 + (i % 2) * 240
        y = 190 + (i // 2) * 96
        b.append(rect(x, y, 220, 78, PANEL_2, 10, BORDER))
        b.append(txt(x + 16, y + 32, name, 14, TEXT, 700))
        b.append(txt(x + 16, y + 56, detail, 12, MUTED))
        b.append(txt(x + 196, y + 32, "◆", 12, AMBER, 700, anchor="middle"))
    # code editor
    b.append(rect(310, 390, 370, 230, "#070709", 12, BORDER))
    b.append(txt(330, 420, "loading-gui.luau", 12, ACCENT_2, 700, "SFMono-Regular, Consolas, monospace"))
    b.append(code_lines(330, 450, [
        ("local", "ui = Roptimer.UI.new({"),
        ("", "  theme = 'Sirius Dark'"),
        ("", "})"),
        ("", "ui:Loader({ steps = {"),
        ("", "  'Back up JSON', 'Preview flags'"),
        ("", "} })"),
        ("", "ui:Show()"),
    ], step=23, size=12))
    # preview window
    b.append(rect(710, 390, 400, 230, PANEL_2, 12, BORDER))
    b.append(txt(730, 420, "LOCAL PREVIEW", 10, DIM, 800, letter=2))
    b.append(rect(730, 440, 360, 1, BORDER))
    b.append(circle(910, 485, 26, "url(#grad)", 1, ACCENT, 2))
    b.append(txt(910, 492, "R", 22, TEXT, 900, "Georgia, serif", "middle"))
    b.append(txt(910, 532, "Preparing safe profile", 13, TEXT, 700, anchor="middle"))
    b.append(rect(760, 550, 300, 10, "#101014", 5))
    b.append(rect(760, 550, 216, 10, "url(#progress)", 5))
    b.append(txt(910, 590, "Not sent to Roblox · local animation only", 11, MUTED, anchor="middle"))
    return svg_doc("Roptimer Script Hub screenshot", "".join(b))


def loading_gui_svg() -> str:
    b: list[str] = [circle(600, 360, 300, "url(#grad)", .5)]
    b.append(rect(260, 140, 680, 440, PANEL, 22, BORDER))
    b.append(rect(260, 140, 680, 56, PANEL_2, 22))
    b.append(rect(260, 184, 680, 12, PANEL_2))
    b.append(circle(290, 168, 6, RED))
    b.append(circle(312, 168, 6, AMBER))
    b.append(circle(334, 168, 6, GREEN_OK))
    b.append(txt(380, 174, "Roptimer UI · Loading GUI", 13, MUTED, 700))
    b.append(txt(600, 250, "Optimizing your local settings", 28, TEXT, 400, "Georgia, serif", "middle"))
    b.append(txt(600, 282, "This preview runs in the website only.", 14, MUTED, anchor="middle"))
    b.append(circle(600, 340, 48, "url(#grad)", 1, ACCENT, 2))
    b.append(txt(600, 352, "R", 36, TEXT, 900, "Georgia, serif", "middle"))
    b.append(rect(360, 420, 480, 14, "#101014", 7))
    b.append(rect(360, 420, 360, 14, "url(#progress)", 7))
    steps = ["Scan local settings", "Back up JSON", "Preview flags", "Apply safe profile"]
    for i, label in enumerate(steps):
        x = 360 + i * 120
        done = i < 3
        b.append(circle(x + 10, 470, 8, ACCENT if done else "#1b1b21", 1, ACCENT if done else BORDER))
        b.append(txt(x + 26, 475, label, 12, TEXT if done else MUTED, 700 if done else 400))
    b.append(rect(470, 515, 260, 42, ACCENT, 10))
    b.append(txt(600, 541, "Open preview", 13, TEXT, 800, anchor="middle"))
    b.append(txt(600, 600, "No loadstring · no executor · no Roblox process attachment", 12, MUTED, anchor="middle"))
    return svg_doc("Roptimer loading GUI preview screenshot", "".join(b))


def mac_svg() -> str:
    b: list[str] = [window(80, 80, 1040, 560, "Roptimer Mac — safe local companion")]
    b.append(rect(80, 128, 1040, 1, BORDER))
    # app icon
    b.append(rect(130, 180, 160, 160, "url(#grad)", 36, BORDER))
    b.append(txt(210, 278, "R", 78, TEXT, 900, "Georgia, serif", "middle"))
    b.append(txt(130, 380, "Roptimer Mac.app", 22, TEXT, 700))
    b.append(txt(130, 410, "Unsigned Python/Tkinter companion", 14, MUTED))
    b.append(txt(130, 438, "macOS 11+ · Python 3.10+", 13, DIM))
    b.append(rect(130, 470, 160, 40, ACCENT, 10))
    b.append(txt(210, 495, "Right-click → Open", 12, TEXT, 800, anchor="middle"))
    # terminal
    b.append(rect(350, 170, 720, 380, "#070709", 14, BORDER))
    b.append(rect(350, 170, 720, 42, PANEL_2, 14))
    b.append(rect(350, 200, 720, 12, PANEL_2))
    b.append(txt(370, 197, "Terminal — Roptimer Boost.command", 12, MUTED, 700))
    b.append(code_lines(375, 245, [
        ("$", "./Roptimer\\ Boost.command --preview"),
        ("{", '"DFIntDebugFRMQualityLevelOverride": "21",'),
        ("", ' "DFIntTextureQualityOverride": "0",'),
        ("", ' "FIntDebugForceMSAASamples": "1"'),
        ("}", ")"),
        ("$", "./Roptimer\\ Boost.command --apply --mode 'Reduce building lag'"),
        ("✓", "Backed up existing ClientAppSettings.json"),
        ("✓", "Wrote 14 managed flags to /Applications/Roblox.app/..."),
    ], step=34, size=13))
    b.append(rect(375, 510, 250, 1, BORDER))
    b.append(txt(375, 535, "Only local JSON is changed. No injection, memory edits, or game scripts.", 12, MUTED))
    return svg_doc("Roptimer macOS companion screenshot", "".join(b))



def command_palette_svg() -> str:
    b: list[str] = []
    # Dimmed website behind the palette.
    b.append(rect(0, 0, 1200, 86, "#070708", 0, BORDER))
    b.append(rect(34, 26, 34, 34, ACCENT, 10))
    b.append(txt(51, 50, "R", 21, TEXT, 900, "Georgia, serif", "middle"))
    b.append(txt(82, 50, "Roptimer", 17, TEXT, 700))
    b.append(txt(190, 50, "Download", 13, TEXT, 700))
    b.append(txt(280, 50, "Docs", 13, MUTED, 700))
    b.append(txt(340, 50, "Scripts", 13, MUTED, 700))
    b.append(rect(1020, 28, 140, 36, "#141418", 10, BORDER))
    b.append(txt(1090, 51, "Ctrl K  ◆", 11, TEXT, 700, anchor="middle"))
    b.append(txt(70, 190, "ROPTIMER HUB V3.2 · 100× COOLER SITE ENGINE", 12, AMBER, 800, letter=2.2))
    b.append(txt(70, 270, "Serious performance", 58, TEXT, 400, "Georgia, serif"))
    b.append(txt(70, 336, "for every player.", 58, TEXT, 400, "Georgia, serif"))
    b.append(txt(72, 390, "Search downloads, docs, scripts, and CLI commands from anywhere.", 17, MUTED))
    b.append(rect(70, 430, 190, 46, "#141418", 10, BORDER))
    b.append(txt(165, 459, "Start with Roptimer", 13, TEXT, 700, anchor="middle"))
    b.append(rect(70, 500, 230, 30, "#101014", 999))
    b.append(txt(185, 520, "100× cooler  ·  Pages ready", 11, MUTED, 700, anchor="middle"))
    # Overlay.
    b.append(rect(0, 86, 1200, 634, "#020203", opacity=.68))
    b.append(rect(245, 145, 710, 430, PANEL, 18, BORDER))
    b.append(rect(245, 145, 710, 58, PANEL_2, 18))
    b.append(rect(245, 195, 710, 8, PANEL_2))
    b.append(txt(272, 181, "◆", 15, AMBER, 800))
    b.append(rect(302, 160, 540, 30, "#070709", 8, BORDER))
    b.append(txt(318, 180, "Type a command, tab, download, or docs topic...", 13, MUTED))
    b.append(rect(875, 160, 56, 30, "#111116", 8, BORDER))
    b.append(txt(903, 180, "Esc", 10, DIM, 700, anchor="middle"))
    rows = [
        ("01", "Go to Download", "Windows setup wizards, macOS companion, source ZIP, and checksums"),
        ("02", "Go to Docs & How it works", "Local JSON, backups, CLI, settings builder, and safety"),
        (">_", "Copy Windows Boost command", "Copy the generated RoptimerBoost.exe apply command"),
        ("03", "Go to Scripts", "Script Hub, loading GUI preview, and screenshots"),
        ("◐", "Toggle focus mode", "Hide the animated starfield and cursor spotlight"),
    ]
    for i, (icon, title, hint) in enumerate(rows):
        y = 218 + i * 62
        if i == 0:
            b.append(rect(260, y, 680, 54, "#17171d", 10, BORDER))
        b.append(rect(272, y + 10, 34, 34, "#0a0a0d", 8, BORDER))
        b.append(txt(289, y + 33, icon, 11, ACCENT_2, 800, "SFMono-Regular, monospace", "middle"))
        b.append(txt(320, y + 25, title, 13, TEXT, 700))
        b.append(txt(320, y + 43, hint, 11, MUTED))
        b.append(txt(920, y + 33, "↵", 12, DIM, 700, anchor="middle"))
    b.append(rect(245, 528, 710, 47, "#08080a", 0, BORDER))
    b.append(txt(270, 557, "↑ ↓ navigate     ↵ run     / or Ctrl+K open", 11, DIM, 700))
    b.append(txt(935, 557, "13 commands", 10, AMBER, 700, anchor="end"))
    return svg_doc("Roptimer command palette screenshot", "".join(b))


def starfield_svg() -> str:
    b: list[str] = []
    b.append(rect(0, 0, 1200, 86, "#070708", 0, BORDER))
    b.append(rect(34, 26, 34, 34, ACCENT, 10))
    b.append(txt(51, 50, "R", 21, TEXT, 900, "Georgia, serif", "middle"))
    b.append(txt(82, 50, "Roptimer", 17, TEXT, 700))
    b.append(txt(190, 50, "Download", 13, TEXT, 700))
    b.append(txt(280, 50, "Docs", 13, MUTED, 700))
    b.append(txt(340, 50, "Scripts", 13, MUTED, 700))
    b.append(rect(1040, 28, 120, 36, "#141418", 10, BORDER))
    b.append(txt(1100, 51, "CSS-only", 10, TEXT, 700, anchor="middle"))
    # Static CSS backdrop preview: no canvas, WebGL, or 3D render loop.
    b.append(rect(735, 150, 390, 410, PANEL, 18, BORDER))
    b.append(circle(930, 330, 170, "url(#grad)", .5))
    b.append(circle(930, 330, 97, "#111116", .95, BORDER, 1))
    b.append(txt(930, 340, "CSS", 36, TEXT, 800, "Georgia, serif", "middle"))
    b.append(txt(930, 375, "STATIC BACKDROP", 9, ACCENT_2, 800, anchor="middle", letter=1.4))
    b.append(txt(70, 180, "V4 · LIGHTWEIGHT WEBSITE", 12, AMBER, 800, letter=2.4))
    b.append(txt(70, 260, "Serious", 72, TEXT, 400, "Georgia, serif"))
    b.append(txt(70, 338, "performance.", 72, TEXT, 400, "Georgia, serif"))
    b.append(txt(72, 390, "Static CSS gradients and a subtle star field.", 17, MUTED))
    b.append(txt(72, 420, "No Three.js, WebGL renderer, or animated 3D scene.", 15, MUTED))
    b.append(rect(70, 460, 190, 46, ACCENT, 10))
    b.append(txt(165, 489, "Open command palette", 12, TEXT, 800, anchor="middle"))
    b.append(rect(274, 460, 140, 46, "#141418", 10, BORDER))
    b.append(txt(344, 489, "Read the docs", 12, TEXT, 700, anchor="middle"))
    b.append(rect(70, 540, 150, 32, "#101014", 999))
    b.append(txt(145, 561, "◆ 13 commands", 11, TEXT, 800, anchor="middle"))
    b.append(rect(232, 540, 210, 32, "#101014", 999))
    b.append(txt(337, 561, "● GitHub Pages ready", 11, TEXT, 800, anchor="middle"))
    b.append(line(0, 620, 1200, 620, BORDER))
    stats = [("3", "main tabs"), ("18", "allowlisted flags"), ("0", "game scripts run"), ("CSS", "only backdrop")]
    for i, (value, label) in enumerate(stats):
        x = 70 + i * 285
        b.append(txt(x, 665, value, 34, TEXT, 400, "Georgia, serif"))
        b.append(txt(x, 690, label, 10, MUTED, 800, letter=1.4))
    return svg_doc("Roptimer lightweight CSS-only website screenshot", "".join(b))


def allowlist_svg() -> str:
    b: list[str] = [window(40, 40, 1120, 640, "Roptimer — FastFlag allowlist")]
    b.append(rect(40, 88, 220, 592, "#08080a"))
    b.append(line(260, 88, 260, 680, BORDER))
    nav = ["Overview", "How it works", "Boost CLI", "Allowlist", "Settings", "Safety"]
    for i, label in enumerate(nav):
        y = 112 + i * 44
        if label == "Allowlist":
            b.append(rect(56, y, 188, 34, "#17171d", 8))
        b.append(txt(70, y + 22, label, 12, TEXT if label == "Allowlist" else MUTED, 700 if label == "Allowlist" else 400))
    b.append(txt(290, 132, "FastFlag allowlist", 30, TEXT, 400, "Georgia, serif"))
    b.append(txt(290, 160, "18 local ClientAppSettings.json keys · 3 categories · official allowlist", 13, MUTED))
    b.append(rect(1030, 118, 100, 30, "#101014", 999))
    b.append(txt(1080, 138, "18 FLAGS", 10, AMBER, 800, anchor="middle"))
    cards = [
        ("GEOMETRY", ACCENT_2, 290, [
            "DFIntCSGLevelOfDetailSwitchingDistance",
            "DFIntCSGLevelOfDetailSwitchingDistanceL12",
            "DFIntCSGLevelOfDetailSwitchingDistanceL23",
            "DFIntCSGLevelOfDetailSwitchingDistanceL34",
        ]),
        ("RENDERING", ACCENT, 650, [
            "FFlagHandleAltEnterFullscreenManually",
            "DFFlagTextureQualityOverrideEnabled",
            "DFIntTextureQualityOverride",
            "FIntDebugForceMSAASamples",
            "DFFlagDisableDPIScale",
            "FFlagDebugGraphicsPreferD3D11",
            "FFlagDebugSkyGray",
            "DFFlagDebugPauseVoxelizer",
            "DFIntDebugFRMQualityLevelOverride",
            "FIntFRMMaxGrassDistance",
            "FIntFRMMinGrassDistance",
            "FFlagDebugGraphicsPreferVulkan",
            "FFlagDebugGraphicsPreferOpenGL",
        ]),
        ("USER INTERFACE", AMBER, 1010, [
            "FIntGrassMovementReducedMotionFactor",
        ]),
    ]
    # Two-column layout: geometry+UI left, rendering right.
    b.append(rect(290, 190, 360, 250, PANEL, 14, BORDER))
    b.append(txt(310, 220, "GEOMETRY", 11, ACCENT_2, 800, letter=1.6))
    for i, flag in enumerate(cards[0][3]):
        b.append(rect(310, 236 + i * 45, 320, 34, "#070709", 8, BORDER))
        b.append(txt(320, 258 + i * 45, flag, 10.5, TEXT, 400, "SFMono-Regular, Consolas, monospace"))
    b.append(rect(290, 455, 360, 110, PANEL, 14, BORDER))
    b.append(txt(310, 485, "USER INTERFACE", 11, AMBER, 800, letter=1.6))
    b.append(rect(310, 500, 320, 34, "#070709", 8, BORDER))
    b.append(txt(320, 522, "FIntGrassMovementReducedMotionFactor", 10.5, TEXT, 400, "SFMono-Regular, Consolas, monospace"))
    b.append(rect(670, 190, 460, 375, PANEL, 14, BORDER))
    b.append(txt(690, 220, "RENDERING", 11, ACCENT, 800, letter=1.6))
    for i, flag in enumerate(cards[1][3]):
        b.append(rect(690, 236 + i * 24, 420, 19, "#070709", 5, BORDER))
        b.append(txt(698, 250 + i * 24, flag, 9.6, TEXT, 400, "SFMono-Regular, Consolas, monospace"))
    b.append(rect(290, 580, 840, 60, "#070709", 12, BORDER))
    b.append(txt(310, 605, "Legacy FPS target is a separate opt-in and may be ignored by Roblox", 12, MUTED, 700))
    b.append(txt(310, 625, "No telemetry, Crashpad/Backtrace, fullbright, x-ray, building removal, anti-cheat bypass, or game script execution flags.", 10, DIM))
    return svg_doc("Roptimer FastFlag allowlist screenshot", "".join(b))


def build() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    outputs = {
        "sirius-download.svg": download_svg(),
        "sirius-cli-docs.svg": cli_docs_svg(),
        "sirius-script-hub.svg": script_hub_svg(),
        "sirius-loading-gui.svg": loading_gui_svg(),
        "sirius-mac.svg": mac_svg(),
        "sirius-command-palette.svg": command_palette_svg(),
        "sirius-starfield.svg": starfield_svg(),
        "sirius-allowlist.svg": allowlist_svg(),
    }
    for name, content in outputs.items():
        (ASSETS / name).write_text(content, encoding="utf-8")
    print(f"Generated {len(outputs)} Sirius SVG screenshots in {ASSETS.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
