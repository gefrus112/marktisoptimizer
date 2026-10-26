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
    b.append(txt(70, 180, "ROPTIMER HUB V3.1", 12, AMBER, 800, letter=2.5))
    b.append(txt(70, 260, "Serious performance", 58, TEXT, 400, "Georgia, 'Times New Roman', serif"))
    b.append(txt(70, 326, "for every player.", 58, TEXT, 400, "Georgia, 'Times New Roman', serif"))
    b.append(txt(72, 380, "Safe local Roblox settings for Windows and macOS.", 17, MUTED))
    b.append(txt(72, 408, "No executor. No injection. No memory edits.", 17, MUTED))
    b.append(rect(70, 440, 190, 46, "#141418", 10, BORDER))
    b.append(txt(165, 469, "Start with Roptimer", 13, TEXT, 700, anchor="middle"))
    b.append(rect(274, 440, 160, 46, BG, 10, BORDER))
    b.append(txt(354, 469, "Read the docs", 13, MUTED, 700, anchor="middle"))
    # Platform cards
    b.append(rect(650, 175, 230, 310, PANEL, 16, BORDER))
    b.append(rect(910, 175, 230, 310, PANEL, 16, BORDER))
    b.append(txt(675, 215, "WINDOWS", 11, ACCENT_2, 800, letter=2))
    b.append(txt(675, 265, "Roptimer.exe", 24, TEXT, 700))
    b.append(txt(675, 300, ".NET 8 WPF app + Boost CLI", 13, MUTED))
    b.append(rect(675, 330, 180, 1, BORDER))
    for i, label in enumerate(["Allowlisted FastFlags", "Backups & restore", "Graphics tiers 0–21", "GitHub Release EXE"]):
        b.append(txt(675, 362 + i * 28, "◆  " + label, 13, TEXT))
    b.append(rect(675, 430, 180, 38, ACCENT, 9))
    b.append(txt(765, 454, "Download EXE", 12, TEXT, 800, anchor="middle"))
    b.append(txt(935, 215, "MACOS", 11, AMBER, 800, letter=2))
    b.append(txt(935, 265, "Roptimer Mac", 24, TEXT, 700))
    b.append(txt(935, 300, "Python/Tkinter companion", 13, MUTED))
    b.append(rect(935, 330, 180, 1, BORDER))
    for i, label in enumerate(["Unsigned .app launcher", "Boost.command CLI", "Local JSON settings", "Backup / restore"]):
        b.append(txt(935, 362 + i * 28, "◆  " + label, 13, TEXT))
    b.append(rect(935, 430, 180, 38, "#17171b", 9, BORDER))
    b.append(txt(1025, 454, "Download ZIP", 12, TEXT, 800, anchor="middle"))
    b.append(line(0, 620, 1200, 620, BORDER))
    b.append(txt(70, 665, "0 injected DLLs", 15, TEXT, 700))
    b.append(txt(300, 665, "21 graphics tiers", 15, TEXT, 700))
    b.append(txt(560, 665, "2 desktop platforms", 15, TEXT, 700))
    b.append(txt(830, 665, "100% reversible JSON", 15, TEXT, 700))
    return svg_doc("Roptimer Sirius dark Download tab", "".join(b))


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


def build() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    outputs = {
        "sirius-download.svg": download_svg(),
        "sirius-cli-docs.svg": cli_docs_svg(),
        "sirius-script-hub.svg": script_hub_svg(),
        "sirius-loading-gui.svg": loading_gui_svg(),
        "sirius-mac.svg": mac_svg(),
    }
    for name, content in outputs.items():
        (ASSETS / name).write_text(content, encoding="utf-8")
    print(f"Generated {len(outputs)} Sirius SVG screenshots in {ASSETS.relative_to(ROOT)}")


if __name__ == "__main__":
    build()
