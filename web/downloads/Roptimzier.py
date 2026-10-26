#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Roptimer Hub V3.1 — Roblox FPS & Performance Optimizer
==================================================

A single-file, dependency-free Python/Tkinter desktop utility that writes a
SAFE, reversible ``ClientAppSettings.json`` performance profile to Roblox
Windows installations and macOS app bundles.

Version 2 adds a safe Session panel: it detects a running Roblox client through
normal OS process/window metadata, shows a locally entered username, and sends
an in-app readiness notification. It does NOT inject into the client, read game
memory, extract account data, or add fullbright/exploit visuals.

Version 2.1 adds a Safe Optimization Engine with Better FPS, Reduce building lag,
and auto-selected performance modes. It still writes only local JSON settings:
there is no DLL injector, even for optimization.

What this app DOES:
  * Finds Windows ``%LOCALAPPDATA%\\Roblox\\Versions\\version-*`` folders.
  * Finds the macOS ``/Applications/Roblox.app/Contents/MacOS`` settings folder.
  * Finds common Program Files installations and the registered client path.
  * Creates ``ClientSettings`` and writes ``ClientAppSettings.json``.
  * Uses current Roblox-allowlisted rendering flags where possible.
  * Optionally writes the legacy ``DFIntTaskSchedulerTargetFps`` flag.
  * Backs up existing JSON files and can restore the previous state.
  * Can mirror the profile to every detected Windows or macOS client location.
  * Launches Roblox through its normal ``roblox://`` protocol.

What this app DOES NOT DO:
  * No DLL injection, process hooking, memory patching or executable edits.
  * No automation, exploits, account actions, or gameplay advantages.
  * No attempt to bypass Roblox's FastFlag allowlist or anti-cheat.

Compatibility note (important in 2026):
  Roblox introduced a local FastFlag allowlist in September 2025. The legacy
  ``DFIntTaskSchedulerTargetFps`` flag is NOT on that list, so current clients
  normally ignore it. The app labels it as "legacy" and recommends the supported
  in-experience Settings > Maximum Framerate control for frame-rate changes.
  The rendering flags used by this app are selected from the published
  allowlist. Roblox may change that list at any time.

Run:
    python roblox_fps_optimizer.py

Headless checks:
    python roblox_fps_optimizer.py --self-test
    python roblox_fps_optimizer.py --preview

Package for Windows:
    python -m pip install pyinstaller
    pyinstaller --noconfirm --onefile --windowed ^
        --name "Roblox FPS Optimizer" roblox_fps_optimizer.py

Author: Arena.ai Agent Mode
"""

from __future__ import annotations

import argparse
import ctypes
import dataclasses
import datetime as dt
import getpass
import json
import os
import platform
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import webbrowser
from pathlib import Path
from typing import Any, Callable, Iterable

# Windows registry is optional so the core/self-test can run on other systems.
try:
    import winreg  # type: ignore
except ImportError:  # pragma: no cover - non-Windows
    winreg = None  # type: ignore

# Tkinter is imported lazily/guarded so --self-test works on headless systems.
try:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
    from tkinter.scrolledtext import ScrolledText

    HAS_TK = True
    TK_IMPORT_ERROR: Exception | None = None
except Exception as exc:  # pragma: no cover - headless systems
    tk = None  # type: ignore
    filedialog = None  # type: ignore
    messagebox = None  # type: ignore
    ttk = None  # type: ignore
    ScrolledText = None  # type: ignore
    HAS_TK = False
    TK_IMPORT_ERROR = exc


# ---------------------------------------------------------------------------
# App constants and visual language
# ---------------------------------------------------------------------------

APP_TITLE = "Roptimer Hub V3.1 — Sirius Roblox Performance Hub"
APP_VERSION = "3.1.0"
APP_SLUG = "RobloxFpsOptimizer"
BRAND_NAME = "ROPTIMER HUB V3.1"


def app_resource_path(relative: str) -> Path:
    """Resolve assets next to the script or inside a PyInstaller bundle."""
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(str(getattr(sys, "_MEIPASS"))) / relative
    return Path(__file__).resolve().parent / relative


APP_ICON_PATH = app_resource_path("assets/roptimzier-shield.ico")
CLIENT_SETTINGS_FILE = "ClientAppSettings.json"
LEGACY_FPS_FLAG = "DFIntTaskSchedulerTargetFps"
MAX_NATIVE_FPS = 240
FPS_MIN = 60
FPS_MAX = 9999

OFFICIAL_ALLOWLIST_URL = (
    "https://devforum.roblox.com/t/"
    "allowlist-for-local-client-configuration-via-fast-flags/3966569"
)
OFFICIAL_GRAPHICS_URL = (
    "https://en.help.roblox.com/hc/en-us/articles/203314310-Graphics-Quality"
)
OFFICIAL_LAG_URL = (
    "https://en.help.roblox.com/hc/en-us/articles/"
    "203314150-How-to-Reduce-Lag-and-Speed-Up-Play"
)
ROBLOX_HOME_URL = "https://www.roblox.com/home"

# Dark gaming palette requested by the user, with a neon violet/blue accent.
BG = "#070a14"
HEADER = "#0b1020"
SIDEBAR = "#080c18"
PANEL = "#111729"  # Requested primary panel color.
CARD = "#151c31"
CARD_2 = "#1b2340"
FIELD = "#0a0f1e"
BORDER = "#2a3358"
TEXT = "#f3f6ff"
MUTED = "#a7b0d0"
ACCENT = "#7c5cff"
ACCENT_2 = "#22d3ee"
ACCENT_HOVER = "#a78bfa"
SUCCESS = "#38bdf8"
WARNING = "#fbbf24"
ERROR = "#fb7185"

FONT_UI = "Segoe UI"
FONT_MONO = "Cascadia Mono"
if platform.system() != "Windows":
    FONT_UI = "DejaVu Sans"
    FONT_MONO = "DejaVu Sans Mono"

# Every flag this application may write. Only keys in this set are ever
# removed/overwritten, so unrelated user flags in an existing JSON are kept.
ALLOWLISTED_MANAGED_FLAGS: frozenset[str] = frozenset(
    {
        # Geometry
        "DFIntCSGLevelOfDetailSwitchingDistance",
        "DFIntCSGLevelOfDetailSwitchingDistanceL12",
        "DFIntCSGLevelOfDetailSwitchingDistanceL23",
        "DFIntCSGLevelOfDetailSwitchingDistanceL34",
        # Rendering
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
        # UI / motion
        "FIntGrassMovementReducedMotionFactor",
    }
)
MANAGED_FLAGS: frozenset[str] = ALLOWLISTED_MANAGED_FLAGS | {LEGACY_FPS_FLAG}

MACOS_CLIENT_ROOTS = (
    Path("/Applications/Roblox.app/Contents/MacOS"),
    Path.home() / "Applications" / "Roblox.app" / "Contents" / "MacOS",
)
MACOS_PLAYER_EXECUTABLES = ("RobloxPlayer", "RobloxPlayerBeta")
PLAYER_EXECUTABLES = (
    "RobloxPlayerBeta.exe",
    "RobloxPlayer.exe",
    "RobloxPlayerLauncher.exe",
) + MACOS_PLAYER_EXECUTABLES

TARGET_SCOPES = (
    "Active version + shared profile",
    "All detected versions + shared profile",
    "Shared profile only",
    "Custom version folder",
)

RENDERER_FLAGS = {
    "Automatic (recommended)": None,
    "Direct3D 11 (stable)": "FFlagDebugGraphicsPreferD3D11",
    "Vulkan (modern GPU)": "FFlagDebugGraphicsPreferVulkan",
    "OpenGL (legacy)": "FFlagDebugGraphicsPreferOpenGL",
}
RENDERER_FLAG_KEYS = tuple(v for v in RENDERER_FLAGS.values() if v)

GRAPHICS_QUALITY = {
    "Automatic": None,
    "Ultra low": "1",
    "Low": "2",
    "Medium": "3",
    "High": "6",
    "Ultra": "10",
}
TEXTURE_QUALITY = {
    "Automatic": None,
    "Low (best performance)": "1",
    "Medium": "2",
    "High": "3",
}
MSAA_SAMPLES = {
    "Default": None,
    "1x / off": "1",
    "2x": "2",
    "4x": "4",
    "8x": "8",
}
GRASS_MOTION = {
    "Default": None,
    "Reduced": "50",
    "Still": "0",
}

GRAPHICS_TIER_MIN = 0
GRAPHICS_TIER_MAX = 21
TEXTURE_TIER_MIN = 0
TEXTURE_TIER_MAX = 3
FEATURE_STATUS_PATH = Path(__file__).with_name("feature-status.json")
SAFE_CACHE_EXTENSIONS = frozenset({".log", ".txt", ".tmp", ".old"})


def graphics_tier_label(level: int) -> str:
    level = max(GRAPHICS_TIER_MIN, min(GRAPHICS_TIER_MAX, int(level)))
    if level == 0:
        return "Tier 0 (automatic)"
    return f"Tier {level} (micro)" if level > 10 else f"Tier {level}"


def texture_tier_label(level: int) -> str:
    level = max(TEXTURE_TIER_MIN, min(TEXTURE_TIER_MAX, int(level)))
    return f"Texture tier {level}"


for _tier in range(GRAPHICS_TIER_MIN, GRAPHICS_TIER_MAX + 1):
    GRAPHICS_QUALITY[graphics_tier_label(_tier)] = str(_tier)
for _tier in range(TEXTURE_TIER_MIN, TEXTURE_TIER_MAX + 1):
    TEXTURE_QUALITY[texture_tier_label(_tier)] = str(_tier)


def load_feature_status() -> dict[str, Any]:
    """Return the shared safety/feature catalog used by the website and .NET app."""
    try:
        return json.loads(FEATURE_STATUS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"product": "Roptimer Hub V3", "version": APP_VERSION, "features": [], "sources": []}

# Geometry LOD distances based on conservative community presets for the
# allowlisted CSG flags. Lower numbers switch to simpler geometry sooner.
GEOMETRY_PRESETS = {
    "Performance": ("100", "75", "100", "150"),
    "Balanced": ("2000", "1000", "1500", "2500"),
    "Visual": ("10000", "10000", "10000", "10000"),
    "Lag Rescue": ("50", "30", "40", "60"),
    "Building Lag": ("25", "15", "20", "30"),
    "Maximum performance": ("50", "30", "40", "60"),
    "Custom": ("1000", "600", "800", "1200"),
}

PRESET_VALUES: dict[str, dict[str, Any]] = {
    "Lag Rescue": {
        "fps_target": 60,
        "optimize_rendering": True,
        "lower_textures": True,
        "reduce_grass_motion": True,
        "renderer": "Automatic (recommended)",
        "graphics_quality": "Ultra low",
        "texture_quality": "Low (best performance)",
        "msaa": "1x / off",
        "grass_motion": "Still",
        "vfx_reducer": True,
        "building_lag_reducer": True,
        "notifications": True,
        "bright_ui": False,
        "optimization_mode": "Reduce building lag",
    },
    "Building Lag": {
        "fps_target": 120,
        "optimize_rendering": True,
        "lower_textures": True,
        "reduce_grass_motion": True,
        "renderer": "Automatic (recommended)",
        "graphics_quality": "Ultra low",
        "texture_quality": "Low (best performance)",
        "msaa": "1x / off",
        "grass_motion": "Still",
        "vfx_reducer": True,
        "building_lag_reducer": True,
        "notifications": True,
        "bright_ui": False,
        "optimization_mode": "Reduce building lag",
    },
    "Performance": {
        "fps_target": 144,
        "optimize_rendering": True,
        "lower_textures": True,
        "reduce_grass_motion": True,
        "renderer": "Automatic (recommended)",
        "graphics_quality": "Ultra low",
        "texture_quality": "Low (best performance)",
        "msaa": "1x / off",
        "grass_motion": "Still",
        "vfx_reducer": True,
        "building_lag_reducer": False,
        "notifications": True,
        "bright_ui": False,
        "optimization_mode": "Better FPS",
    },
    "Balanced": {
        "fps_target": 144,
        "optimize_rendering": True,
        "lower_textures": True,
        "reduce_grass_motion": True,
        "renderer": "Automatic (recommended)",
        "graphics_quality": "Low",
        "texture_quality": "Medium",
        "msaa": "2x",
        "grass_motion": "Reduced",
        "vfx_reducer": False,
        "building_lag_reducer": False,
        "notifications": True,
        "bright_ui": False,
        "optimization_mode": "Balanced",
    },
    "Maximum performance": {
        "fps_target": 240,
        "optimize_rendering": True,
        "lower_textures": True,
        "reduce_grass_motion": True,
        "renderer": "Automatic (recommended)",
        "graphics_quality": "Ultra low",
        "texture_quality": "Low (best performance)",
        "msaa": "1x / off",
        "grass_motion": "Still",
        "vfx_reducer": True,
        "building_lag_reducer": True,
        "notifications": True,
        "bright_ui": False,
        "optimization_mode": "Maximum performance",
    },
    "Visual": {
        "fps_target": 240,
        "optimize_rendering": False,
        "lower_textures": False,
        "reduce_grass_motion": False,
        "renderer": "Automatic (recommended)",
        "graphics_quality": "High",
        "texture_quality": "High",
        "msaa": "4x",
        "grass_motion": "Default",
        "vfx_reducer": False,
        "building_lag_reducer": False,
        "notifications": True,
        "bright_ui": False,
        "optimization_mode": "Visual quality",
    },
}

# Safe, non-injecting optimization modes. These only change local JSON settings.
# There is intentionally NO DLL injector: process injection is not safe for a
# Roblox performance tool, even when the stated goal is optimization.
AUTO_MODE_LABEL = "Choose better performance"
OPTIMIZATION_MODES: dict[str, dict[str, Any]] = {
    "Better FPS": {
        "icon": "F",
        "description": "Stable 144 FPS target with low graphics overhead for smoother gameplay.",
        "values": {
            "preset": "Performance",
            "fps_target": 144,
            "legacy_fps_flag": True,
            "optimize_rendering": True,
            "lower_textures": True,
            "reduce_grass_motion": True,
            "vfx_reducer": True,
            "building_lag_reducer": False,
            "graphics_quality": "Ultra low",
            "texture_quality": "Low (best performance)",
            "msaa": "1x / off",
            "grass_motion": "Still",
        },
    },
    "Reduce building lag": {
        "icon": "B",
        "description": "Aggressive but safe geometry LOD, grass distance and texture reduction. Does not remove buildings.",
        "values": {
            "preset": "Building Lag",
            "fps_target": 120,
            "legacy_fps_flag": True,
            "optimize_rendering": True,
            "lower_textures": True,
            "reduce_grass_motion": True,
            "vfx_reducer": True,
            "building_lag_reducer": True,
            "graphics_quality": "Ultra low",
            "texture_quality": "Low (best performance)",
            "msaa": "1x / off",
            "grass_motion": "Still",
        },
    },
    "Balanced": {
        "icon": "=",
        "description": "A middle-ground profile for mixed performance and image quality.",
        "values": {
            "preset": "Balanced",
            "fps_target": 144,
            "legacy_fps_flag": True,
            "optimize_rendering": True,
            "lower_textures": True,
            "reduce_grass_motion": True,
            "vfx_reducer": False,
            "building_lag_reducer": False,
            "graphics_quality": "Low",
            "texture_quality": "Medium",
            "msaa": "2x",
            "grass_motion": "Reduced",
        },
    },
    "Maximum performance": {
        "icon": "M",
        "description": "Highest safe local detail reduction with a 240 FPS target. Still allowlist-based.",
        "values": {
            "preset": "Maximum performance",
            "fps_target": 240,
            "legacy_fps_flag": True,
            "optimize_rendering": True,
            "lower_textures": True,
            "reduce_grass_motion": True,
            "vfx_reducer": True,
            "building_lag_reducer": True,
            "graphics_quality": "Ultra low",
            "texture_quality": "Low (best performance)",
            "msaa": "1x / off",
            "grass_motion": "Still",
        },
    },
    "Visual quality": {
        "icon": "V",
        "description": "Keeps more detail while retaining a higher frame target.",
        "values": {
            "preset": "Visual",
            "fps_target": 240,
            "legacy_fps_flag": True,
            "optimize_rendering": False,
            "lower_textures": False,
            "reduce_grass_motion": False,
            "vfx_reducer": False,
            "building_lag_reducer": False,
            "graphics_quality": "High",
            "texture_quality": "High",
            "msaa": "4x",
            "grass_motion": "Default",
        },
    },
    "Custom": {
        "icon": "C",
        "description": "Manual settings. Choose individual toggles in the Optimizer page.",
        "values": {},
    },
}


class OptimizerError(RuntimeError):
    """A user-facing error that is safe to show in the UI."""


LogCallback = Callable[[str, str], None]


def default_logger(level: str, message: str) -> None:
    """Simple console logger used by CLI/self-test modes."""
    prefix = {
        "info": "[i]",
        "success": "[+]",
        "warning": "[!]",
        "error": "[x]",
    }.get(level, "[?]")
    print(f"{prefix} {message}", file=sys.stderr if level == "error" else sys.stdout)


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclasses.dataclass
class RobloxVersion:
    """A detected Windows or macOS Roblox player installation."""

    path: Path
    executable: Path
    modified: float
    source: str

    @property
    def name(self) -> str:
        return self.path.name

    @property
    def profile_path(self) -> Path:
        return self.path / "ClientSettings" / CLIENT_SETTINGS_FILE

    def as_dict(self) -> dict[str, Any]:
        return {
            "path": str(self.path),
            "executable": str(self.executable),
            "modified": self.modified,
            "source": self.source,
        }


@dataclasses.dataclass
class SessionSnapshot:
    """Safe, OS-level view of a Roblox session.

    This contains only process paths, an OS window title, and locally supplied
    usernames. It never contains account tokens, player-list data, chat, game
    state, memory contents, or anything read from inside the Roblox process.
    """

    running: bool = False
    running_paths: list[str] = dataclasses.field(default_factory=list)
    active_window_title: str = ""
    local_username: str = ""
    roblox_username: str = ""
    version_hint: str = "Not detected"
    installed_versions: int = 0
    notification: str = ""

    @property
    def display_username(self) -> str:
        return self.roblox_username.strip() or self.local_username.strip() or "Guest"

    def rows(self) -> list[tuple[str, str]]:
        title = self.active_window_title or "Not exposed by Windows"
        return [
            ("Session state", "Roblox client running" if self.running else "Waiting for Roblox"),
            ("Local user", self.local_username or "Unknown"),
            ("Display name", self.display_username),
            ("Roblox version", self.version_hint),
            ("Installed versions", str(self.installed_versions)),
            ("Active window title", title[:90]),
            ("Client paths", "\n".join(self.running_paths[:3]) if self.running_paths else "None"),
        ]


class SessionDetector:
    """Detect a Roblox client using normal OS metadata only.

    No ``OpenProcess`` with memory permissions, no ``ReadProcessMemory``, no
    DLL injection, no hooks, and no game/experience data extraction.
    """

    def __init__(self, system_name: str | None = None) -> None:
        self.system_name = system_name or platform.system()

    @staticmethod
    def active_window_title() -> str:
        """Return the foreground window title on Windows (OS metadata only)."""
        if platform.system() != "Windows":
            return ""
        try:
            user32 = ctypes.windll.user32
            hwnd = user32.GetForegroundWindow()
            if not hwnd:
                return ""
            length = user32.GetWindowTextLengthW(hwnd)
            if length <= 0:
                return ""
            buffer = ctypes.create_unicode_buffer(length + 1)
            user32.GetWindowTextW(hwnd, buffer, length + 1)
            return buffer.value.strip()
        except Exception:
            return ""

    @staticmethod
    def local_username() -> str:
        try:
            return getpass.getuser()
        except Exception:
            return os.environ.get("USER") or os.environ.get("USERNAME") or "Unknown"

    def snapshot(
        self,
        roblox_username: str = "",
        installed_versions: int = 0,
        running_paths: list[Path] | None = None,
        window_title: str | None = None,
    ) -> SessionSnapshot:
        paths = [Path(p) for p in (running_paths or [])]
        title = self.active_window_title() if window_title is None else window_title
        version_hint = "Not detected"
        if paths:
            parent = paths[0].parent
            version_hint = parent.name if parent.name else str(parent)
        name = "".join(ch for ch in str(roblox_username or "") if ch.isprintable()).strip()[:32]
        local = self.local_username()
        display = name or local or "your"
        if paths:
            notification = (
                f"Roptimer V3.1 is ready for {display}'s Roblox session — "
                "local settings only, no client injection."
            )
        else:
            notification = (
                "Roptimer V3.1 is ready. Launch Roblox to use your local performance profile."
            )
        return SessionSnapshot(
            running=bool(paths),
            running_paths=[str(p) for p in paths],
            active_window_title=title or "",
            local_username=local,
            roblox_username=name,
            version_hint=version_hint,
            installed_versions=max(0, int(installed_versions)),
            notification=notification,
        )


@dataclasses.dataclass
class OptimizerSettings:
    """All user-selectable optimization settings."""

    fps_target: int = 144
    legacy_fps_flag: bool = True
    optimize_rendering: bool = True
    lower_textures: bool = True
    reduce_grass_motion: bool = True
    vfx_reducer: bool = True
    building_lag_reducer: bool = True
    notifications: bool = True
    bright_ui: bool = False
    roblox_username: str = ""
    optimization_mode: str = "Better FPS"
    preset: str = "Performance"
    renderer: str = "Automatic (recommended)"
    graphics_quality: str = "Ultra low"
    texture_quality: str = "Low (best performance)"
    graphics_tier: int = 1
    texture_tier: int = 1
    cache_cleanup_days: int = 7
    msaa: str = "1x / off"
    grass_motion: str = "Still"
    target_scope: str = "Active version + shared profile"
    shared_profile: bool = True
    watch_versions: bool = True
    launch_after_apply: bool = True
    custom_root: str = ""

    @classmethod
    def from_dict(cls, raw: dict[str, Any] | None) -> "OptimizerSettings":
        """Load known fields from JSON while ignoring unknown/old fields."""
        raw = raw or {}
        known = {f.name for f in dataclasses.fields(cls)}
        values = {k: v for k, v in raw.items() if k in known}
        settings = cls(**values)
        settings.normalize_in_place()
        return settings

    def normalize_in_place(self) -> None:
        """Clamp values so corrupted state can never write bad JSON."""
        try:
            self.fps_target = int(self.fps_target)
        except (TypeError, ValueError):
            self.fps_target = 144
        self.fps_target = max(FPS_MIN, min(FPS_MAX, self.fps_target))

        if self.preset not in (*PRESET_VALUES, "Custom"):
            self.preset = "Custom"
        if self.optimization_mode not in OPTIMIZATION_MODES:
            self.optimization_mode = "Better FPS"
        if self.renderer not in RENDERER_FLAGS:
            self.renderer = "Automatic (recommended)"
        if self.graphics_quality not in GRAPHICS_QUALITY:
            self.graphics_quality = "Automatic"
        if self.texture_quality not in TEXTURE_QUALITY:
            self.texture_quality = "Automatic"
        if self.msaa not in MSAA_SAMPLES:
            self.msaa = "Default"
        if self.grass_motion not in GRASS_MOTION:
            self.grass_motion = "Default"
        try:
            self.graphics_tier = max(GRAPHICS_TIER_MIN, min(GRAPHICS_TIER_MAX, int(self.graphics_tier)))
        except (TypeError, ValueError):
            self.graphics_tier = 1
        try:
            self.texture_tier = max(TEXTURE_TIER_MIN, min(TEXTURE_TIER_MAX, int(self.texture_tier)))
        except (TypeError, ValueError):
            self.texture_tier = 1
        try:
            self.cache_cleanup_days = max(1, min(90, int(self.cache_cleanup_days)))
        except (TypeError, ValueError):
            self.cache_cleanup_days = 7
        if self.target_scope not in TARGET_SCOPES:
            self.target_scope = TARGET_SCOPES[0]
        for name in (
            "legacy_fps_flag",
            "optimize_rendering",
            "lower_textures",
            "reduce_grass_motion",
            "vfx_reducer",
            "building_lag_reducer",
            "notifications",
            "bright_ui",
            "shared_profile",
            "watch_versions",
            "launch_after_apply",
        ):
            setattr(self, name, bool(getattr(self, name)))
        self.custom_root = str(self.custom_root or "")
        # Locally entered display name only. Never read from a Roblox process.
        cleaned = "".join(ch for ch in str(self.roblox_username or "") if ch.isprintable())
        self.roblox_username = cleaned.strip()[:32]


@dataclasses.dataclass
class SystemProfile:
    """Privacy-safe local hardware hints used to choose an optimization mode."""

    cpu_cores: int = 0
    memory_gb: float = 0.0
    psutil_available: bool = False
    source: str = "os.cpu_count"

    @classmethod
    def detect(cls) -> "SystemProfile":
        cores = os.cpu_count() or 0
        memory_gb = 0.0
        available = False
        try:
            import psutil  # type: ignore

            available = True
            cores = int(psutil.cpu_count(logical=True) or cores)
            memory_gb = float(psutil.virtual_memory().total) / (1024 ** 3)
        except Exception:
            # psutil is optional; os.cpu_count is enough for a safe fallback.
            pass
        return cls(
            cpu_cores=cores,
            memory_gb=round(memory_gb, 1),
            psutil_available=available,
            source="psutil" if available else "os.cpu_count",
        )

    @property
    def tier(self) -> str:
        if self.cpu_cores <= 4 or (0 < self.memory_gb <= 4):
            return "low"
        if self.cpu_cores <= 8 or (0 < self.memory_gb <= 8):
            return "medium"
        if self.cpu_cores >= 12 or self.memory_gb >= 16:
            return "high"
        return "balanced"


class SafeOptimizationEngine:
    """Choose safe local JSON settings. Never injects a DLL into Roblox."""

    @staticmethod
    def detect_profile() -> SystemProfile:
        return SystemProfile.detect()

    @classmethod
    def choose_mode(cls, profile: SystemProfile | None = None) -> str:
        detected = profile or cls.detect_profile()
        tier = detected.tier
        if tier == "low":
            return "Reduce building lag"
        if tier == "medium":
            return "Better FPS"
        if tier == "high":
            return "Maximum performance"
        return "Balanced"

    @classmethod
    def apply_mode(
        cls,
        settings: OptimizerSettings,
        mode: str,
        profile: SystemProfile | None = None,
    ) -> OptimizerSettings:
        if mode == AUTO_MODE_LABEL or mode not in OPTIMIZATION_MODES:
            mode = cls.choose_mode(profile)
        values = OPTIMIZATION_MODES[mode]["values"]
        for key, value in values.items():
            if hasattr(settings, key):
                setattr(settings, key, value)
        settings.optimization_mode = mode
        settings.normalize_in_place()
        return settings


@dataclasses.dataclass
class ApplyResult:
    """Result of one apply operation."""

    flags: dict[str, str]
    profile_paths: list[Path]
    warnings: list[str]

    def as_dict(self) -> dict[str, Any]:
        return {
            "flags": self.flags,
            "profile_paths": [str(p) for p in self.profile_paths],
            "warnings": self.warnings,
        }


# ---------------------------------------------------------------------------
# Filesystem helpers
# ---------------------------------------------------------------------------


def is_windows() -> bool:
    return os.name == "nt" or platform.system().lower() == "windows"


def is_macos() -> bool:
    return sys.platform == "darwin" or platform.system().lower() == "darwin"


def get_local_appdata() -> Path:
    """Return the Roblox-local AppData root. Env var is for self-tests."""
    override = os.getenv("RFO_LOCALAPPDATA")
    if override:
        return Path(override).expanduser()
    if is_macos():
        return Path.home() / "Library" / "Application Support"
    local = os.getenv("LOCALAPPDATA")
    if local:
        return Path(local).expanduser()
    return Path.home() / ".local" / "share"


def get_appdata_dir() -> Path:
    """Return the directory used to store this app's state/backups list."""
    override = os.getenv("RFO_APPDATA")
    if override:
        base = Path(override).expanduser()
    elif is_macos():
        base = Path.home() / "Library" / "Application Support"
    else:
        roaming = os.getenv("APPDATA")
        base = Path(roaming).expanduser() if roaming else Path.home() / ".config"
    return base / APP_SLUG


def norm_path(path: Path | str) -> str:
    """Normalize a path for comparisons on Windows and POSIX."""
    return os.path.normcase(os.path.abspath(os.path.expandvars(str(path))))


def atomic_write_json(path: Path, data: dict[str, Any]) -> None:
    """Write JSON atomically so a failed write cannot corrupt the profile."""
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(
        prefix=".rfo-", suffix=".tmp", dir=str(path.parent), text=True
    )
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(data, handle, indent=2, ensure_ascii=False, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except Exception:
        try:
            tmp.unlink()
        except OSError:
            pass
        raise


def read_json_object(path: Path) -> tuple[dict[str, Any], str | None]:
    """Read a JSON object. Return ({}, error) for missing/invalid files."""
    if not path.is_file():
        return {}, None
    try:
        raw = path.read_text(encoding="utf-8-sig")
        parsed = json.loads(raw) if raw.strip() else {}
        if not isinstance(parsed, dict):
            return {}, "JSON root was not an object"
        return parsed, None
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        return {}, str(exc)


def timestamp_slug() -> str:
    return dt.datetime.now().strftime("%Y%m%d-%H%M%S-%f")


def backup_existing_file(path: Path) -> Path | None:
    """Back up an existing profile and keep the ten newest backups."""
    if not path.is_file():
        return None
    backup = path.with_name(f"{path.name}.bak-{timestamp_slug()}")
    shutil.copy2(path, backup)
    backups = sorted(
        path.parent.glob(f"{path.name}.bak-*"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for old in backups[10:]:
        try:
            old.unlink()
        except OSError:
            pass
    return backup


# ---------------------------------------------------------------------------
# Core optimizer logic (GUI-independent and unit-testable)
# ---------------------------------------------------------------------------


class SafeCacheCleaner:
    """Conservative quarantine for old log/temp files; never touches settings or assets."""

    def __init__(self) -> None:
        override = os.getenv("RFO_LOCALAPPDATA")
        self.local_appdata = Path(override).expanduser() if override else Path(
            os.getenv("LOCALAPPDATA") or (Path.home() / "AppData" / "Local")
        )
        override_appdata = os.getenv("RFO_APPDATA")
        self.appdata = Path(override_appdata).expanduser() if override_appdata else Path(
            os.getenv("APPDATA") or (Path.home() / "AppData" / "Roaming")
        )
        self.state_root = self.appdata / APP_SLUG

    def roots(self) -> list[Path]:
        roots = [
            self.local_appdata / "Roblox" / "logs",
            self.local_appdata / "Roblox" / "ClientSettings" / "logs",
            self.state_root / "logs",
            Path(tempfile.gettempdir()) / "Roblox",
        ]
        if is_macos():
            roots.extend([
                Path.home() / "Library" / "Logs" / "Roblox",
                Path.home() / "Library" / "Application Support" / "Roblox" / "logs",
                MACOS_CLIENT_ROOTS[0] / "logs",
            ])
        versions = self.local_appdata / "Roblox" / "Versions"
        if versions.is_dir():
            roots.extend(folder / "logs" for folder in versions.glob("version-*"))
        seen: set[str] = set()
        result: list[Path] = []
        for root in roots:
            key = norm_path(root)
            if key not in seen:
                seen.add(key)
                result.append(root)
        return result

    @staticmethod
    def _is_safe_file(path: Path, root: Path) -> bool:
        try:
            resolved = path.resolve()
            root_resolved = root.resolve()
            resolved.relative_to(root_resolved)
        except (OSError, ValueError):
            return False
        if path.suffix.lower() not in SAFE_CACHE_EXTENSIONS:
            return False
        if "ClientAppSettings" in path.name:
            return False
        if path.is_symlink():
            return False
        return True

    def report(self, older_than_days: int = 7) -> dict[str, Any]:
        older_than_days = max(1, min(90, int(older_than_days)))
        cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=older_than_days)
        items: list[dict[str, Any]] = []
        errors: list[str] = []
        for root in self.roots():
            if not root.is_dir():
                continue
            for path in root.rglob("*"):
                try:
                    if not path.is_file() or not self._is_safe_file(path, root):
                        continue
                    stat = path.stat()
                    modified = dt.datetime.fromtimestamp(stat.st_mtime, dt.timezone.utc)
                    if modified > cutoff:
                        continue
                    items.append({
                        "path": str(path.resolve()),
                        "root": str(root.resolve()),
                        "bytes": stat.st_size,
                        "modifiedUtc": modified.isoformat(),
                        "ageDays": (dt.datetime.now(dt.timezone.utc) - modified).days,
                    })
                except OSError as exc:
                    errors.append(str(exc))
        return {
            "olderThanDays": older_than_days,
            "items": sorted(items, key=lambda item: item["path"]),
            "totalBytes": sum(item["bytes"] for item in items),
            "errors": errors[:20],
            "safety": "Only old log/temp files are reported. No ClientAppSettings, executables, or game assets are included.",
        }

    def clean(self, older_than_days: int = 7, force: bool = False) -> dict[str, Any]:
        report = self.report(older_than_days)
        quarantine = self.state_root / "quarantine" / dt.datetime.now(dt.timezone.utc).strftime("%Y%m%d-%H%M%S")
        if not force:
            return {"dryRun": True, "movedFiles": 0, "movedBytes": 0, "quarantine": str(quarantine), "report": report}
        quarantine.mkdir(parents=True, exist_ok=True)
        moved = 0
        moved_bytes = 0
        for item in report["items"]:
            source = Path(item["path"])
            try:
                relative = source.relative_to(Path(item["root"]))
                destination = quarantine / Path(item["root"]).name / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                if destination.exists():
                    destination = destination.with_name(destination.name + "-" + os.urandom(3).hex())
                shutil.move(str(source), str(destination))
                moved += 1
                moved_bytes += int(item["bytes"])
            except OSError:
                continue
        return {"dryRun": False, "movedFiles": moved, "movedBytes": moved_bytes, "quarantine": str(quarantine), "report": report}


class OptimizerCore:
    """Detects Roblox versions and safely writes/restores JSON profiles."""

    def __init__(self, logger: LogCallback | None = None) -> None:
        self.logger: LogCallback = logger or default_logger
        self.local_appdata = get_local_appdata()
        self.appdata_dir = get_appdata_dir()
        self.state_path = self.appdata_dir / "state.json"
        self._lock = threading.RLock()
        self.state = self._load_state()

    # -- state -------------------------------------------------------------

    def _default_state(self) -> dict[str, Any]:
        return {
            "app_version": APP_VERSION,
            "settings": dataclasses.asdict(OptimizerSettings()),
            "targets": {},
            "synced_versions": [],
            "custom_root": "",
        }

    def _load_state(self) -> dict[str, Any]:
        try:
            raw = json.loads(self.state_path.read_text(encoding="utf-8"))
            if not isinstance(raw, dict):
                raise ValueError("state root is not an object")
        except (OSError, ValueError, json.JSONDecodeError):
            return self._default_state()
        base = self._default_state()
        base.update(raw)
        base["settings"] = dataclasses.asdict(
            OptimizerSettings.from_dict(raw.get("settings"))
        )
        base["targets"] = raw.get("targets") if isinstance(raw.get("targets"), dict) else {}
        base["synced_versions"] = [
            str(x) for x in (raw.get("synced_versions") or []) if isinstance(x, (str, Path))
        ]
        base["custom_root"] = str(raw.get("custom_root") or "")
        return base

    def _write_state(self) -> None:
        self.appdata_dir.mkdir(parents=True, exist_ok=True)
        atomic_write_json(self.state_path, self.state)

    @property
    def settings(self) -> OptimizerSettings:
        return OptimizerSettings.from_dict(self.state.get("settings"))

    def save_settings(self, settings: OptimizerSettings) -> None:
        settings.normalize_in_place()
        with self._lock:
            self.state["settings"] = dataclasses.asdict(settings)
            self.state["custom_root"] = settings.custom_root
            self._write_state()

    def get_custom_root(self) -> Path | None:
        value = str(self.state.get("custom_root") or "").strip()
        return Path(value).expanduser() if value else None

    def set_custom_root(self, path: str) -> None:
        with self._lock:
            self.state["custom_root"] = path
            self._write_state()

    def get_synced_versions(self) -> set[str]:
        return {str(x) for x in self.state.get("synced_versions", [])}

    def update_synced_versions(self, versions: Iterable[RobloxVersion]) -> None:
        with self._lock:
            self.state["synced_versions"] = sorted({str(v.path) for v in versions})
            self._write_state()

    # -- discovery ---------------------------------------------------------

    def roblox_root(self) -> Path:
        """Return the platform-specific Roblox client settings root."""
        if is_macos():
            for root in MACOS_CLIENT_ROOTS:
                if root.is_dir():
                    return root
            return MACOS_CLIENT_ROOTS[0]
        return self.local_appdata / "Roblox"

    def shared_profile_path(self) -> Path:
        """Persistent Roblox ClientSettings path, when supported by the client."""
        return self.roblox_root() / "ClientSettings" / CLIENT_SETTINGS_FILE

    def version_roots(self) -> list[Path]:
        """Return trusted roots containing version-* folders."""
        candidates: list[Path] = [self.roblox_root() / "Versions"]
        if is_macos():
            candidates.extend(MACOS_CLIENT_ROOTS)
        for env_name in ("ProgramFiles(x86)", "ProgramFiles", "PROGRAMFILES"):
            value = os.getenv(env_name)
            if value:
                candidates.append(Path(value) / "Roblox" / "Versions")

        for registered in self._registry_version_roots():
            candidates.append(registered)

        custom = self.get_custom_root()
        if custom:
            # Accept either a Versions directory or one direct version folder.
            candidates.append(custom)
            candidates.append(custom.parent)

        roots: list[Path] = []
        seen: set[str] = set()
        for candidate in candidates:
            try:
                candidate = Path(candidate).expanduser()
                key = norm_path(candidate)
                if key not in seen and candidate.is_dir():
                    seen.add(key)
                    roots.append(candidate)
            except OSError:
                continue
        return roots

    def _registry_version_roots(self) -> list[Path]:
        """Read-only registry lookup for custom Roblox installs."""
        if winreg is None or not is_windows():
            return []
        roots: list[Path] = []
        key_paths = (
            r"Software\ROBLOX Corporation\Environments\roblox-player",
            r"Software\ROBLOX Corporation\Environments\RobloxPlayer",
        )
        value_names = ("clientExe", "ClientExe", "PlayerPath", "InstallPath", "")
        for key_path in key_paths:
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path) as key:
                    for value_name in value_names:
                        try:
                            value, _ = winreg.QueryValueEx(key, value_name)
                        except (OSError, TypeError):
                            continue
                        if not isinstance(value, str) or not value.strip():
                            continue
                        candidate = Path(value.strip().strip('"'))
                        if candidate.suffix.lower() == ".exe":
                            candidate = candidate.parent
                        if candidate.is_dir():
                            roots.append(candidate)
                            if candidate.parent.is_dir():
                                roots.append(candidate.parent)
            except OSError:
                continue
        return roots

    def discover_versions(self) -> list[RobloxVersion]:
        """Find every plausible Windows or macOS Roblox Player settings directory."""
        folders: list[Path] = []
        seen: set[str] = set()
        for root in self.version_roots():
            # A registry/custom path may itself be a version folder.
            possible = [root] if self._looks_like_version_folder(root) else []
            try:
                possible.extend(
                    p for p in root.glob("version-*") if self._looks_like_version_folder(p)
                )
            except OSError:
                pass
            for folder in possible:
                key = norm_path(folder)
                if key not in seen:
                    seen.add(key)
                    folders.append(folder)

        versions: list[RobloxVersion] = []
        for folder in folders:
            executable = self._find_player_executable(folder)
            if executable is None:
                continue
            try:
                modified = max(
                    executable.stat().st_mtime,
                    folder.stat().st_mtime,
                )
            except OSError:
                modified = 0.0
            source = "Registry/custom" if folder.name.startswith("version-") is False else "Versions"
            versions.append(
                RobloxVersion(
                    path=folder,
                    executable=executable,
                    modified=modified,
                    source=source,
                )
            )
        versions.sort(key=lambda v: v.modified, reverse=True)
        return versions

    def _looks_like_version_folder(self, path: Path) -> bool:
        try:
            return path.is_dir() and self._find_player_executable(path) is not None
        except OSError:
            return False

    def _find_player_executable(self, folder: Path) -> Path | None:
        for name in PLAYER_EXECUTABLES:
            candidate = folder / name
            if candidate.is_file():
                return candidate
        for pattern in ("RobloxPlayer*.exe", "RobloxPlayer*"):
            try:
                matches = sorted(p for p in folder.glob(pattern) if p.is_file())
                if matches:
                    return matches[0]
            except OSError:
                continue
        return None

    def running_player_paths(self) -> list[Path]:
        """Optional psutil-based running-process lookup (psutil not required)."""
        try:
            import psutil  # type: ignore
        except ImportError:
            return []
        paths: list[Path] = []
        try:
            for proc in psutil.process_iter(["name", "exe"]):
                name = str(proc.info.get("name") or "").lower()
                exe = proc.info.get("exe")
                if exe and any(name == p.lower() for p in PLAYER_EXECUTABLES):
                    paths.append(Path(str(exe)))
        except Exception:
            return []
        return paths

    def is_roblox_running(self) -> bool:
        return bool(self.running_player_paths())

    def active_version(self, versions: list[RobloxVersion] | None = None) -> RobloxVersion | None:
        """Pick the running/registered/newest version as the active one."""
        versions = versions if versions is not None else self.discover_versions()
        if not versions:
            return None

        running = self.running_player_paths()
        for exe in running:
            parent = exe.parent
            for version in versions:
                if norm_path(parent) == norm_path(version.path):
                    return version

        registered = self._registry_client_exe()
        if registered is not None:
            parent = registered.parent if registered.suffix else registered
            for version in versions:
                if norm_path(parent) == norm_path(version.path):
                    return version

        return versions[0]

    def _registry_client_exe(self) -> Path | None:
        if winreg is None or not is_windows():
            return None
        key_paths = (
            r"Software\ROBLOX Corporation\Environments\roblox-player",
            r"Software\ROBLOX Corporation\Environments\RobloxPlayer",
        )
        for key_path in key_paths:
            try:
                with winreg.OpenKey(winreg.HKEY_CURRENT_USER, key_path) as key:
                    for value_name in ("clientExe", "ClientExe"):
                        try:
                            value, _ = winreg.QueryValueEx(key, value_name)
                        except OSError:
                            continue
                        if isinstance(value, str) and value.strip():
                            return Path(value.strip().strip('"'))
            except OSError:
                continue
        return None

    # -- flags --------------------------------------------------------------

    def build_flags(self, settings: OptimizerSettings) -> dict[str, str]:
        """Build the exact FastFlag dictionary that will be written."""
        settings.normalize_in_place()
        flags: dict[str, str] = {}

        # Requested legacy flag. Roblox's current allowlist normally ignores it,
        # but writing it is harmless and useful for older client builds.
        if settings.legacy_fps_flag:
            flags[LEGACY_FPS_FLAG] = str(settings.fps_target)

        # Rendering-path optimization uses allowlisted geometry/render flags.
        if settings.optimize_rendering:
            lod = GEOMETRY_PRESETS.get(settings.preset, GEOMETRY_PRESETS["Custom"])
            flags["DFIntCSGLevelOfDetailSwitchingDistance"] = lod[0]
            flags["DFIntCSGLevelOfDetailSwitchingDistanceL12"] = lod[1]
            flags["DFIntCSGLevelOfDetailSwitchingDistanceL23"] = lod[2]
            flags["DFIntCSGLevelOfDetailSwitchingDistanceL34"] = lod[3]
            flags["DFFlagDebugPauseVoxelizer"] = "True"
            flags["FFlagHandleAltEnterFullscreenManually"] = "True"

        # Graphics quality (allowlisted FRM override).
        # V3 extended graphics tiers 0-21. 0 is automatic; 1-6 are low;
        # 7-21 are high/micro levels from the legacy 21-level slider.
        quality = str(settings.graphics_tier)
        flags["DFIntDebugFRMQualityLevelOverride"] = quality

        # Texture tiers 0-3 / "lower hidden textures".
        texture = str(settings.texture_tier)
        flags["DFFlagTextureQualityOverrideEnabled"] = "True"
        flags["DFIntTextureQualityOverride"] = texture

        # Anti-aliasing.
        msaa = MSAA_SAMPLES.get(settings.msaa)
        if msaa is not None:
            flags["FIntDebugForceMSAASamples"] = msaa

        # Prefer one renderer at most; conflicting renderer flags are removed.
        renderer = RENDERER_FLAGS.get(settings.renderer)
        if renderer is not None:
            for key in RENDERER_FLAG_KEYS:
                flags.pop(key, None)
            flags[renderer] = "True"

        # Grass motion reduction (user-interface allowlist category).
        grass = GRASS_MOTION.get(settings.grass_motion)
        if settings.reduce_grass_motion and grass is None:
            grass = "0"
        if grass is not None:
            flags["FIntGrassMovementReducedMotionFactor"] = grass

        # "VFX / world detail reducer": a safe graphics-load reduction. It uses
        # allowlisted quality/texture/anti-aliasing/motion keys. It does NOT
        # remove buildings, change game lighting, create x-ray/fullbright, or
        # alter gameplay geometry.
        if settings.vfx_reducer:
            flags["DFFlagTextureQualityOverrideEnabled"] = "True"
            flags["DFIntTextureQualityOverride"] = str(min(settings.texture_tier, 1))
            flags["FIntDebugForceMSAASamples"] = "1"
            flags["FIntGrassMovementReducedMotionFactor"] = "0"

        # "Reduce building/geometry lag": the strongest SAFE local detail
        # reduction. It lowers draw/LOD distances and grass rendering; it does
        # not delete buildings, alter collision, create x-ray, or change game
        # lighting. All keys are in the published local allowlist set above.
        if settings.building_lag_reducer:
            building_lod = GEOMETRY_PRESETS["Building Lag"]
            flags["DFIntCSGLevelOfDetailSwitchingDistance"] = building_lod[0]
            flags["DFIntCSGLevelOfDetailSwitchingDistanceL12"] = building_lod[1]
            flags["DFIntCSGLevelOfDetailSwitchingDistanceL23"] = building_lod[2]
            flags["DFIntCSGLevelOfDetailSwitchingDistanceL34"] = building_lod[3]
            flags["FIntFRMMaxGrassDistance"] = "0"
            flags["FIntFRMMinGrassDistance"] = "0"
            flags["DFFlagDebugPauseVoxelizer"] = "True"
            flags["DFFlagTextureQualityOverrideEnabled"] = "True"
            flags["DFIntTextureQualityOverride"] = str(min(settings.texture_tier, 1))
            flags["FIntDebugForceMSAASamples"] = "1"
            flags["FIntGrassMovementReducedMotionFactor"] = "0"

        unknown = set(flags) - MANAGED_FLAGS
        if unknown:
            raise OptimizerError(f"Refusing to write unmanaged flags: {sorted(unknown)}")
        return dict(sorted(flags.items()))

    def preview(self, settings: OptimizerSettings) -> str:
        """Return pretty JSON containing only keys this app manages."""
        return json.dumps(self.build_flags(settings), indent=2, ensure_ascii=False) + "\n"

    def compatibility_notes(self, settings: OptimizerSettings) -> list[str]:
        notes: list[str] = []
        if settings.legacy_fps_flag:
            notes.append(
                "Legacy FPS flag is not on Roblox's current local allowlist and "
                "may be ignored. Use in-game Settings > Maximum Framerate."
            )
        if settings.fps_target > MAX_NATIVE_FPS:
            notes.append(
                f"{settings.fps_target} is a ceiling, not a guaranteed frame rate. "
                f"Roblox's supported Maximum Framerate setting tops out at {MAX_NATIVE_FPS} FPS."
            )
        if settings.renderer == "Vulkan (modern GPU)":
            notes.append("Vulkan is experimental on some GPUs; switch to Automatic if Roblox crashes.")
        if settings.bright_ui:
            notes.append(
                "Bright UI changes this app's contrast only. It does not add full bright, "
                "x-ray, building removal, or game-lighting changes."
            )
        if settings.building_lag_reducer:
            notes.append(
                "Building-lag mode reduces geometry LOD and grass distance through local JSON. "
                "It does not remove buildings or change collision."
            )
        return notes

    # -- target resolution -------------------------------------------------

    def _safe_profile_path(self, candidate: Path) -> Path:
        """Validate that a profile path is inside a ClientSettings folder."""
        path = Path(candidate).expanduser()
        if path.name != CLIENT_SETTINGS_FILE:
            path = path / CLIENT_SETTINGS_FILE
        if path.parent.name != "ClientSettings":
            path = path.parent / "ClientSettings" / CLIENT_SETTINGS_FILE
        try:
            resolved = path.resolve()
        except OSError:
            resolved = path
        # Only allow writing under AppData/Program Files/registry/custom Roblox roots.
        allowed_parents: list[Path] = [self.roblox_root(), self.local_appdata]
        if is_macos():
            allowed_parents.extend(MACOS_CLIENT_ROOTS)
            allowed_parents.append(Path("/Applications/Roblox.app/Contents"))
        for env_name in ("ProgramFiles(x86)", "ProgramFiles"):
            if os.getenv(env_name):
                allowed_parents.append(Path(str(os.getenv(env_name))))
        for root in self.version_roots():
            allowed_parents.extend((root, root.parent))
        custom = self.get_custom_root()
        if custom:
            allowed_parents.extend((custom, custom.parent))
        for parent in allowed_parents:
            try:
                resolved.relative_to(Path(parent).resolve())
                break
            except (ValueError, OSError):
                continue
        else:
            raise OptimizerError(f"Refusing to write outside known Roblox locations: {path}")
        return path

    def resolve_profile_paths(
        self,
        settings: OptimizerSettings,
        versions: list[RobloxVersion] | None = None,
    ) -> list[Path]:
        versions = versions if versions is not None else self.discover_versions()
        paths: list[Path] = []
        scope = settings.target_scope

        if scope == "Active version + shared profile":
            active = self.active_version(versions)
            if active:
                paths.append(active.profile_path)
            elif versions:
                paths.append(versions[0].profile_path)
        elif scope == "All detected versions + shared profile":
            paths.extend(v.profile_path for v in versions)
        elif scope == "Custom version folder":
            custom = settings.custom_root.strip() or str(self.get_custom_root() or "")
            if not custom:
                raise OptimizerError("Select a custom Roblox version folder first.")
            custom_path = Path(custom).expanduser()
            if not custom_path.is_dir():
                raise OptimizerError(f"Custom folder does not exist: {custom_path}")
            if (custom_path / "ClientSettings").is_dir():
                paths.append(custom_path / "ClientSettings" / CLIENT_SETTINGS_FILE)
            else:
                paths.append(custom_path / "ClientSettings" / CLIENT_SETTINGS_FILE)

        if scope != "Shared profile only" and settings.shared_profile:
            paths.append(self.shared_profile_path())
        elif scope == "Shared profile only":
            paths.append(self.shared_profile_path())

        safe: list[Path] = []
        seen: set[str] = set()
        for path in paths:
            validated = self._safe_profile_path(path)
            key = norm_path(validated)
            if key not in seen:
                seen.add(key)
                safe.append(validated)
        return safe

    # -- apply / restore ---------------------------------------------------

    def apply(
        self,
        settings: OptimizerSettings,
        *,
        launch: bool = False,
        profile_paths: list[Path] | None = None,
        update_settings: bool = True,
    ) -> ApplyResult:
        """Write the optimized profile to one or more Roblox installations."""
        settings.normalize_in_place()
        flags = self.build_flags(settings)
        if not flags:
            raise OptimizerError("No optimization flags are selected.")

        warnings = self.compatibility_notes(settings)
        with self._lock:
            versions = self.discover_versions()
            paths = profile_paths or self.resolve_profile_paths(settings, versions)
            paths = [self._safe_profile_path(p) for p in paths]
            if not paths:
                raise OptimizerError(
                    "No Roblox player version was found. Install Roblox, start it once, "
                    "or choose a custom version folder."
                )

            for note in warnings:
                self.logger("warning", note)
            if self.is_roblox_running():
                self.logger(
                    "warning",
                    "Roblox is already running. Settings are read at launch; restart Roblox to apply them.",
                )

            for profile in paths:
                self._write_profile(profile, flags)
                self.logger("success", f"Wrote {len(flags)} managed flags to {profile}")

            if update_settings:
                self.state["settings"] = dataclasses.asdict(settings)
                self.state["custom_root"] = settings.custom_root
            self.state["synced_versions"] = sorted({str(v.path) for v in versions})
            self._write_state()

        if launch:
            self.launch_roblox(versions)
        return ApplyResult(flags=flags, profile_paths=paths, warnings=warnings)

    def _write_profile(self, profile: Path, flags: dict[str, str]) -> None:
        """Merge managed flags into an existing profile and record a snapshot."""
        profile.parent.mkdir(parents=True, exist_ok=True)
        existing, error = read_json_object(profile)
        if error:
            self.logger("warning", f"Existing {profile.name} was invalid ({error}); it will be backed up.")
            existing = {}

        original = {k: existing[k] for k in MANAGED_FLAGS if k in existing}
        backup = backup_existing_file(profile)

        merged = {k: v for k, v in existing.items() if k not in MANAGED_FLAGS}
        merged.update(flags)
        atomic_write_json(profile, merged)

        with self._lock:
            targets = self.state.setdefault("targets", {})
            targets[str(profile)] = {
                "original_managed_flags": original,
                "backup": str(backup) if backup else None,
                "applied_at": dt.datetime.now().isoformat(timespec="seconds"),
                "managed_flag_count": len(flags),
            }

    def restore(self) -> int:
        """Restore original managed values for every location this app changed."""
        restored = 0
        with self._lock:
            targets = dict(self.state.get("targets", {}))
            for key, record in targets.items():
                raw_profile = Path(key).expanduser()
                if not raw_profile.is_file():
                    self.logger("warning", f"Profile no longer exists; skipping {raw_profile}")
                    continue
                profile = self._safe_profile_path(raw_profile)
                current, error = read_json_object(profile)
                if error:
                    self.logger("warning", f"Could not parse {profile}; leaving it untouched.")
                    continue
                original = record.get("original_managed_flags", {})
                if not isinstance(original, dict):
                    original = {}
                backup_existing_file(profile)

                restored_data = {k: v for k, v in current.items() if k not in MANAGED_FLAGS}
                restored_data.update({k: v for k, v in original.items() if k in MANAGED_FLAGS})
                if restored_data:
                    atomic_write_json(profile, restored_data)
                    self.logger("success", f"Restored {profile}")
                else:
                    profile.unlink()
                    self.logger("success", f"Removed optimizer-only profile {profile}")
                    try:
                        profile.parent.rmdir()  # Only succeeds when empty.
                    except OSError:
                        pass
                restored += 1

            self.state["targets"] = {}
            self._write_state()
        return restored

    def profile_summary(self, profile: Path) -> str:
        """Return a short status string for the versions table."""
        data, error = read_json_object(profile)
        if error:
            return "Invalid JSON"
        if not profile.is_file():
            return "Stock"
        managed = [k for k in data if k in MANAGED_FLAGS]
        if not managed:
            return "Custom / stock"
        if LEGACY_FPS_FLAG in managed:
            return f"Optimized ({len(managed)} flags)"
        return f"Allowlisted ({len(managed)} flags)"

    # -- launching ---------------------------------------------------------

    def _launch_roblox_macos(self) -> None:
        """Launch Roblox on macOS through public URL/app commands only."""
        commands = [["open", "roblox://"], ["open", "-a", "Roblox"]]
        for command in commands:
            try:
                completed = subprocess.run(
                    command,
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    timeout=8,
                )
                if completed.returncode == 0:
                    self.logger("success", f"Roblox launch requested through: {' '.join(command)}")
                    return
            except (OSError, subprocess.SubprocessError) as exc:
                self.logger("warning", f"macOS launch unavailable ({exc}); trying the next method.")
        webbrowser.open(ROBLOX_HOME_URL)
        self.logger("info", "Opened the Roblox website. Choose an experience to launch the client.")

    def launch_roblox(self, versions: list[RobloxVersion] | None = None) -> None:
        """Launch Roblox using its registered protocol; never injects code."""
        if is_macos():
            self._launch_roblox_macos()
            return
        if not is_windows():
            raise OptimizerError("Roblox launching is only available on Windows or macOS.")
        try:
            os.startfile("roblox://")  # type: ignore[attr-defined]
            self.logger("success", "Roblox launch requested through the roblox:// protocol.")
            return
        except Exception as exc:
            self.logger("warning", f"Protocol launch unavailable ({exc}); trying the website.")

        versions = versions if versions is not None else self.discover_versions()
        active = self.active_version(versions)
        if active and active.executable.is_file():
            try:
                os.startfile(str(active.executable))  # type: ignore[attr-defined]
                self.logger("success", f"Started {active.executable.name}.")
                return
            except Exception as exc:
                self.logger("warning", f"Could not start the executable ({exc}).")

        webbrowser.open(ROBLOX_HOME_URL)
        self.logger("info", "Opened the Roblox website. Choose an experience to launch the client.")


# ---------------------------------------------------------------------------
# Self-test (runs without Tkinter or a real Roblox installation)
# ---------------------------------------------------------------------------


def run_self_test() -> int:
    """Exercise discovery, merging, backup, apply and restore in a temp tree."""
    with tempfile.TemporaryDirectory(prefix="rfo-selftest-") as tmp:
        root = Path(tmp)
        local_appdata = root / "LocalAppData"
        appdata = root / "Roaming"
        versions_root = local_appdata / "Roblox" / "Versions"
        version_a = versions_root / "version-aaaaaaaaaaaaaaaa"
        version_b = versions_root / "version-bbbbbbbbbbbbbbbb"
        for folder in (version_a, version_b):
            folder.mkdir(parents=True)
            (folder / "RobloxPlayerBeta.exe").write_bytes(b"fake executable for test")
        os.environ["RFO_LOCALAPPDATA"] = str(local_appdata)
        os.environ["RFO_APPDATA"] = str(appdata)

        core = OptimizerCore(logger=default_logger)
        versions = core.discover_versions()
        assert len(versions) == 2, f"expected 2 versions, found {len(versions)}"

        settings = OptimizerSettings(
            fps_target=144,
            target_scope="All detected versions + shared profile",
            launch_after_apply=False,
        )
        flags = core.build_flags(settings)
        assert flags[LEGACY_FPS_FLAG] == "144"
        assert "DFIntDebugFRMQualityLevelOverride" in flags
        assert set(flags).issubset(MANAGED_FLAGS)

        # Preserve an unrelated pre-existing key and back up the old file.
        existing_profile = version_a / "ClientSettings" / CLIENT_SETTINGS_FILE
        existing_profile.parent.mkdir(parents=True, exist_ok=True)
        existing_profile.write_text('{"UserCustomFlag": "keep me"}\n', encoding="utf-8")

        result = core.apply(settings, launch=False)
        assert len(result.profile_paths) == 3, result.as_dict()
        for profile in result.profile_paths:
            assert profile.is_file(), profile
            data, error = read_json_object(profile)
            assert error is None
            assert data[LEGACY_FPS_FLAG] == "144"
        first_data, _ = read_json_object(existing_profile)
        assert first_data["UserCustomFlag"] == "keep me"
        assert any(p.name.startswith(CLIENT_SETTINGS_FILE + ".bak-") for p in existing_profile.parent.iterdir())

        restored = core.restore()
        assert restored == len(result.profile_paths), restored
        for profile in result.profile_paths:
            if profile.is_file():
                data, error = read_json_object(profile)
                assert error is None
                assert LEGACY_FPS_FLAG not in data
                assert not (set(data) & MANAGED_FLAGS)
        final_existing, _ = read_json_object(existing_profile)
        assert final_existing == {"UserCustomFlag": "keep me"}

        # V2 safe session detection: process paths + OS window title only.
        detector = SessionDetector(system_name="Linux")
        snapshot = detector.snapshot(
            roblox_username="ROPTIMER_TEST_USER",
            installed_versions=len(versions),
            running_paths=[version_a / "RobloxPlayerBeta.exe"],
            window_title="Roblox — Performance Test",
        )
        assert snapshot.running is True
        assert snapshot.display_username == "ROPTIMER_TEST_USER"
        assert snapshot.version_hint == "version-aaaaaaaaaaaaaaaa"
        assert "no client injection" in snapshot.notification.lower()
        assert snapshot.rows()[0] == ("Session state", "Roblox client running")

        # V3.1 extended tiers, optimization modes, feature catalog, cache quarantine, macOS roots.
        tier_settings = OptimizerSettings(
            fps_target=144,
            graphics_tier=21,
            texture_tier=0,
            legacy_fps_flag=True,
            building_lag_reducer=True,
        )
        tier_flags = core.build_flags(tier_settings)
        assert tier_flags["DFIntDebugFRMQualityLevelOverride"] == "21"
        assert tier_flags["DFIntTextureQualityOverride"] == "0"
        assert tier_flags[LEGACY_FPS_FLAG] == "144"
        assert set(tier_flags).issubset(MANAGED_FLAGS)
        mode_settings = SafeOptimizationEngine.apply_mode(OptimizerSettings(), "Reduce building lag")
        assert mode_settings.optimization_mode == "Reduce building lag"
        assert mode_settings.building_lag_reducer is True
        catalog = load_feature_status()
        assert any(f["id"] == "dll-injector" and not f["implemented"] for f in catalog["features"])
        assert any(f["id"] == "telemetry-disable" and not f["implemented"] for f in catalog["features"])
        cache = SafeCacheCleaner()
        cache_report = cache.report(7)
        assert cache_report["olderThanDays"] == 7
        assert "ClientAppSettings" in cache_report["safety"]
        assert MACOS_CLIENT_ROOTS[0].as_posix().endswith("Roblox.app/Contents/MacOS")
        assert "RobloxPlayer" in PLAYER_EXECUTABLES

        print(
            f"SELF-TEST OK: {len(versions)} versions, {len(result.profile_paths)} profiles, "
            f"{len(flags)} flags, V3.1 session=safe, V3.1 tiers/modes/catalog/cache/mac=safe."
        )
        return 0


# ---------------------------------------------------------------------------
# Tkinter GUI
# ---------------------------------------------------------------------------

if HAS_TK:

    def configure_styles(root: "tk.Tk") -> None:
        """Apply a consistent dark theme to ttk widgets."""
        style = ttk.Style(root)
        try:
            style.theme_use("clam")
        except tk.TclError:
            pass

        style.configure(".", background=BG, foreground=TEXT, font=(FONT_UI, 10))
        style.configure("TFrame", background=BG)
        style.configure("Panel.TFrame", background=PANEL)
        style.configure("Card.TFrame", background=CARD)
        style.configure(
            "TLabel",
            background=BG,
            foreground=TEXT,
            font=(FONT_UI, 10),
        )
        style.configure("Muted.TLabel", background=BG, foreground=MUTED)
        style.configure("CardMuted.TLabel", background=CARD, foreground=MUTED)
        style.configure("Card.TLabel", background=CARD, foreground=TEXT)
        style.configure(
            "Title.TLabel",
            background=HEADER,
            foreground=TEXT,
            font=(FONT_UI, 17, "bold"),
        )
        style.configure(
            "Section.TLabel",
            background=CARD,
            foreground=TEXT,
            font=(FONT_UI, 12, "bold"),
        )
        style.configure(
            "Accent.TButton",
            background=ACCENT,
            foreground="#0b0913",
            borderwidth=0,
            focusthickness=0,
            font=(FONT_UI, 10, "bold"),
            padding=(18, 10),
        )
        style.map(
            "Accent.TButton",
            background=[("active", ACCENT_HOVER), ("disabled", "#56506b")],
            foreground=[("disabled", "#d0cbe0")],
        )
        style.configure(
            "Ghost.TButton",
            background=CARD_2,
            foreground=TEXT,
            borderwidth=1,
            focusthickness=0,
            font=(FONT_UI, 9, "bold"),
            padding=(12, 7),
        )
        style.map("Ghost.TButton", background=[("active", BORDER)])
        style.configure(
            "Danger.TButton",
            background="#3a1f2c",
            foreground="#ffc2cf",
            borderwidth=1,
            focusthickness=0,
            font=(FONT_UI, 9, "bold"),
            padding=(12, 7),
        )
        style.map("Danger.TButton", background=[("active", "#562a3d")])
        style.configure(
            "TCombobox",
            fieldbackground=FIELD,
            background=FIELD,
            foreground=TEXT,
            arrowcolor=ACCENT_2,
            bordercolor=BORDER,
            lightcolor=BORDER,
            darkcolor=BORDER,
            padding=6,
        )
        style.map(
            "TCombobox",
            fieldbackground=[("readonly", FIELD)],
            foreground=[("readonly", TEXT)],
        )
        style.configure(
            "TSpinbox",
            fieldbackground=FIELD,
            background=FIELD,
            foreground=TEXT,
            arrowcolor=ACCENT_2,
            bordercolor=BORDER,
            padding=5,
        )
        style.configure(
            "Neon.Horizontal.TScale",
            background=PANEL,
            troughcolor=FIELD,
            bordercolor=BORDER,
            lightcolor=ACCENT,
            darkcolor=ACCENT,
        )
        style.configure(
            "Treeview",
            background=CARD,
            fieldbackground=CARD,
            foreground=TEXT,
            bordercolor=BORDER,
            rowheight=28,
            font=(FONT_UI, 9),
        )
        style.configure(
            "Treeview.Heading",
            background=FIELD,
            foreground=ACCENT_2,
            font=(FONT_UI, 9, "bold"),
            relief="flat",
        )
        style.map("Treeview", background=[("selected", ACCENT)], foreground=[("selected", TEXT)])
        style.configure(
            "TProgressbar",
            troughcolor=FIELD,
            background=ACCENT,
            bordercolor=FIELD,
            lightcolor=ACCENT,
            darkcolor=ACCENT,
        )

    def rounded_rect(canvas: "tk.Canvas", x1: int, y1: int, x2: int, y2: int, radius: int, **kwargs: Any) -> int:
        """Draw a rounded rectangle on a Tk Canvas."""
        points = [
            x1 + radius, y1,
            x2 - radius, y1,
            x2, y1,
            x2, y1 + radius,
            x2, y2 - radius,
            x2, y2,
            x2 - radius, y2,
            x1 + radius, y2,
            x1, y2,
            x1, y2 - radius,
            x1, y1 + radius,
            x1, y1,
        ]
        return canvas.create_polygon(points, smooth=True, **kwargs)

    class ToggleSwitch(tk.Canvas):
        """A compact custom dark/neon toggle switch."""

        def __init__(
            self,
            master: Any,
            variable: "tk.BooleanVar | None" = None,
            command: Callable[[], None] | None = None,
            width: int = 50,
            height: int = 27,
            **kwargs: Any,
        ) -> None:
            bg = kwargs.pop("bg", CARD)
            super().__init__(
                master,
                width=width,
                height=height,
                bg=bg,
                bd=0,
                highlightthickness=0,
                takefocus=1,
                **kwargs,
            )
            self.variable = variable or tk.BooleanVar(value=False)
            self.command = command
            self.disabled = False
            self.bind("<Button-1>", self._on_click)
            self.bind("<space>", self._on_key)
            self.bind("<Return>", self._on_key)
            self._draw()

        def get(self) -> bool:
            return bool(self.variable.get())

        def set(self, value: bool) -> None:
            self.variable.set(bool(value))
            self._draw()

        def _on_click(self, _event: Any) -> None:
            self.toggle()

        def _on_key(self, _event: Any) -> None:
            self.toggle()

        def toggle(self) -> None:
            if self.disabled:
                return
            self.variable.set(not self.get())
            self._draw()
            if self.command:
                self.command()

        def _draw(self) -> None:
            self.delete("all")
            w = int(self.cget("width"))
            h = int(self.cget("height"))
            radius = h // 2
            on = self.get()
            color = ACCENT if on else "#454557"
            knob_color = "#ffffff" if on else "#c9cbe0"
            rounded_rect(self, 1, 1, w - 1, h - 1, radius, fill=color, outline="")
            knob_x = w - h + 2 if on else 2
            self.create_oval(
                knob_x,
                3,
                knob_x + h - 6,
                h - 3,
                fill=knob_color,
                outline="",
            )

    class OptimizerApp(tk.Tk):
        """Main desktop application."""

        NAV_ITEMS = (
            ("Dashboard", "◆"),
            ("Session", "◉"),
            ("Quick Setup", "⚡"),
            ("Optimizer", "⚙"),
            ("Client Link", "⇄"),
            ("JSON Preview", "{ }"),
            ("Activity Log", "≡"),
            ("Safe Guide", "?"),
        )

        def __init__(self, core: OptimizerCore, settings: OptimizerSettings) -> None:
            super().__init__()
            self.core = core
            self.settings = settings
            self.versions: list[RobloxVersion] = []
            self.known_version_paths = core.get_synced_versions()
            self.log_queue: queue.Queue[tuple[str, str]] = queue.Queue()
            self.task_queue: queue.Queue[str] = queue.Queue()
            # Worker threads never call Tk directly: they place UI callbacks here.
            self.ui_queue: queue.Queue[Callable[[], None]] = queue.Queue()
            self.log_widgets: list[ScrolledText] = []
            self.nav_buttons: dict[str, tk.Button] = {}
            self.stat_labels: dict[str, tk.Label] = {}
            self.pages: dict[str, tk.Frame] = {}
            self.current_page = "Dashboard"
            self.busy = False
            self._setting_preset = False
            self._setting_mode = False
            self._syncing_fps = False
            self._preview_job: str | None = None
            self.session_detector = SessionDetector()
            self.session_snapshot: SessionSnapshot | None = None
            self._last_session_running = False
            self.session_labels: dict[str, tk.Label] = {}

            self.core.logger = self.emit_log
            self.title(f"{APP_TITLE}  •  v{APP_VERSION}")
            self.geometry("1120x760")
            self.minsize(980, 680)
            self.configure(bg=BG)
            configure_styles(self)
            try:
                if APP_ICON_PATH.is_file():
                    self.iconbitmap(default=str(APP_ICON_PATH))
            except (tk.TclError, OSError):
                pass
            self._center_window()
            self._init_variables(settings)
            self._build_ui()
            self._attach_traces()
            self.after(50, self._apply_bright_ui)
            self.protocol("WM_DELETE_WINDOW", self._on_close)
            self.after(100, self._drain_queues)
            self.after(250, self._initial_scan)
            self.after(900, self._refresh_session)
            self.after(6000, self._watch_versions)

        # -- construction --------------------------------------------------

        def _center_window(self) -> None:
            self.update_idletasks()
            width, height = 1120, 760
            x = max(0, (self.winfo_screenwidth() - width) // 2)
            y = max(0, (self.winfo_screenheight() - height) // 2)
            self.geometry(f"{width}x{height}+{x}+{y}")

        def _init_variables(self, settings: OptimizerSettings) -> None:
            settings.normalize_in_place()
            self.fps_var = tk.IntVar(value=settings.fps_target)
            self.fps_entry_var = tk.StringVar(value=str(settings.fps_target))
            self.legacy_var = tk.BooleanVar(value=settings.legacy_fps_flag)
            self.render_paths_var = tk.BooleanVar(value=settings.optimize_rendering)
            self.hidden_textures_var = tk.BooleanVar(value=settings.lower_textures)
            self.grass_var = tk.BooleanVar(value=settings.reduce_grass_motion)
            self.vfx_var = tk.BooleanVar(value=settings.vfx_reducer)
            self.building_lag_reducer_var = tk.BooleanVar(value=settings.building_lag_reducer)
            self.notifications_var = tk.BooleanVar(value=settings.notifications)
            self.bright_ui_var = tk.BooleanVar(value=settings.bright_ui)
            self.roblox_username_var = tk.StringVar(value=settings.roblox_username)
            self.optimization_mode_var = tk.StringVar(value=settings.optimization_mode)
            self.preset_var = tk.StringVar(value=settings.preset)
            self.renderer_var = tk.StringVar(value=settings.renderer)
            self.graphics_quality_var = tk.StringVar(value=settings.graphics_quality)
            self.texture_quality_var = tk.StringVar(value=settings.texture_quality)
            self.msaa_var = tk.StringVar(value=settings.msaa)
            self.grass_motion_var = tk.StringVar(value=settings.grass_motion)
            self.scope_var = tk.StringVar(value=settings.target_scope)
            self.shared_profile_var = tk.BooleanVar(value=settings.shared_profile)
            self.watch_var = tk.BooleanVar(value=settings.watch_versions)
            self.launch_var = tk.BooleanVar(value=settings.launch_after_apply)
            self.custom_root_var = tk.StringVar(value=settings.custom_root or str(self.core.get_custom_root() or ""))
            self.status_var = tk.StringVar(value="Ready")
            self.version_count_var = tk.StringVar(value="Scanning…")
            self.active_version_var = tk.StringVar(value="Not detected")
            self.flag_count_var = tk.StringVar(value="0 managed flags")

        def _build_ui(self) -> None:
            root_frame = tk.Frame(self, bg=BG)
            root_frame.pack(fill="both", expand=True)
            self._build_sidebar(root_frame)

            right = tk.Frame(root_frame, bg=BG)
            right.pack(side="left", fill="both", expand=True)
            self._build_header(right)

            self.content = tk.Frame(right, bg=BG)
            self.content.pack(fill="both", expand=True, padx=24, pady=(14, 8))
            self.content.grid_rowconfigure(0, weight=1)
            self.content.grid_columnconfigure(0, weight=1)

            for name, _icon in self.NAV_ITEMS:
                page = tk.Frame(self.content, bg=BG)
                page.grid(row=0, column=0, sticky="nsew")
                self.pages[name] = page

            self._build_dashboard(self.pages["Dashboard"])
            self._build_session(self.pages["Session"])
            self._build_quick_setup(self.pages["Quick Setup"])
            self._build_optimizer(self.pages["Optimizer"])
            self._build_client_link(self.pages["Client Link"])
            self._build_json_preview(self.pages["JSON Preview"])
            self._build_activity_log(self.pages["Activity Log"])
            self._build_guide(self.pages["Safe Guide"])
            self._build_footer(right)
            self.show_page("Dashboard")
            self._set_fps(self.fps_var.get())

        def _build_header(self, parent: tk.Frame) -> None:
            header = tk.Frame(parent, bg=HEADER, height=78)
            header.pack(fill="x", side="top")
            header.pack_propagate(False)

            left = tk.Frame(header, bg=HEADER)
            left.pack(side="left", fill="y", padx=(26, 10))
            tk.Label(
                left,
                text=APP_TITLE,
                bg=HEADER,
                fg=TEXT,
                font=(FONT_UI, 17, "bold"),
            ).pack(anchor="w", pady=(14, 0))
            tk.Label(
                left,
                text="Safe local rendering profiles • no injection • no memory edits",
                bg=HEADER,
                fg=MUTED,
                font=(FONT_UI, 9),
            ).pack(anchor="w", pady=(1, 0))

            badges = tk.Frame(header, bg=HEADER)
            badges.pack(side="right", padx=20)
            self._badge(badges, "ALLOWLIST AWARE", ACCENT_2).pack(side="left", padx=5)
            self.platform_badge = self._badge(
                badges,
                "WINDOWS" if is_windows() else ("MACOS / COMPANION" if is_macos() else f"{platform.system().upper()} / PREVIEW"),
                SUCCESS if (is_windows() or is_macos()) else WARNING,
            )
            self.platform_badge.pack(side="left", padx=5)

        @staticmethod
        def _badge(parent: tk.Frame, text: str, color: str) -> tk.Label:
            return tk.Label(
                parent,
                text=f"  {text}  ",
                bg=FIELD,
                fg=color,
                font=(FONT_UI, 8, "bold"),
                padx=8,
                pady=5,
            )

        def _build_sidebar(self, parent: tk.Frame) -> None:
            sidebar = tk.Frame(parent, bg=SIDEBAR, width=214)
            sidebar.pack(side="left", fill="y")
            sidebar.pack_propagate(False)

            brand = tk.Frame(sidebar, bg=SIDEBAR)
            brand.pack(fill="x", pady=(24, 22), padx=20)
            logo = tk.Canvas(brand, width=46, height=46, bg=SIDEBAR, highlightthickness=0)
            logo.pack(side="left")
            rounded_rect(logo, 2, 2, 44, 44, 12, fill=ACCENT, outline="")
            logo.create_text(23, 23, text="R", fill="white", font=(FONT_UI, 18, "bold"))
            info = tk.Frame(brand, bg=SIDEBAR)
            info.pack(side="left", padx=(10, 0))
            tk.Label(info, text="RFO", bg=SIDEBAR, fg=TEXT, font=(FONT_UI, 14, "bold")).pack(anchor="w")
            tk.Label(info, text=f"v{APP_VERSION}", bg=SIDEBAR, fg=MUTED, font=(FONT_UI, 8)).pack(anchor="w")

            tk.Label(
                sidebar,
                text="WORKSPACE",
                bg=SIDEBAR,
                fg="#646a82",
                font=(FONT_UI, 8, "bold"),
            ).pack(anchor="w", padx=24, pady=(0, 8))

            for name, icon in self.NAV_ITEMS:
                button = tk.Button(
                    sidebar,
                    text=f"   {icon}    {name}",
                    anchor="w",
                    bg=SIDEBAR,
                    fg=MUTED,
                    activebackground=CARD,
                    activeforeground=TEXT,
                    bd=0,
                    relief="flat",
                    font=(FONT_UI, 10, "bold"),
                    cursor="hand2",
                    command=lambda n=name: self.show_page(n),
                )
                button.pack(fill="x", padx=12, pady=2, ipady=10)
                self.nav_buttons[name] = button

            bottom = tk.Frame(sidebar, bg=FIELD)
            bottom.pack(side="bottom", fill="x", padx=14, pady=16)
            tk.Label(
                bottom,
                text="SAFE MODE",
                bg=FIELD,
                fg=SUCCESS,
                font=(FONT_UI, 9, "bold"),
            ).pack(anchor="w", padx=12, pady=(12, 2))
            tk.Label(
                bottom,
                text="Settings files only.\nNo process injection.",
                bg=FIELD,
                fg=MUTED,
                font=(FONT_UI, 8),
                justify="left",
            ).pack(anchor="w", padx=12, pady=(0, 12))

        @staticmethod
        def _card(parent: tk.Frame, title: str | None = None, padding: int = 18) -> tuple[tk.Frame, tk.Frame]:
            """Create a card with a 1px border and return (outer, body)."""
            outer = tk.Frame(parent, bg=BORDER)
            body = tk.Frame(outer, bg=CARD)
            body.pack(fill="both", expand=True, padx=1, pady=1)
            if title:
                tk.Label(
                    body,
                    text=title,
                    bg=CARD,
                    fg=TEXT,
                    font=(FONT_UI, 11, "bold"),
                ).pack(anchor="w", padx=padding, pady=(padding, 2))
            return outer, body

        def _scrollable(self, parent: tk.Frame) -> tk.Frame:
            canvas = tk.Canvas(parent, bg=BG, highlightthickness=0, bd=0)
            scrollbar = ttk.Scrollbar(parent, orient="vertical", command=canvas.yview)
            canvas.pack(side="left", fill="both", expand=True)
            scrollbar.pack(side="right", fill="y")
            canvas.configure(yscrollcommand=scrollbar.set)
            inner = tk.Frame(canvas, bg=BG)
            window_id = canvas.create_window((0, 0), window=inner, anchor="nw")
            inner.bind(
                "<Configure>",
                lambda _e: canvas.configure(scrollregion=canvas.bbox("all")),
            )
            canvas.bind(
                "<Configure>",
                lambda e: canvas.itemconfigure(window_id, width=e.width),
            )

            def bind_wheel(_event: Any, target: tk.Canvas = canvas) -> None:
                # Bind only while the pointer is over this page's canvas.
                target.bind_all(
                    "<MouseWheel>",
                    lambda e, c=target: c.yview_scroll(int(-1 * (e.delta / 120)), "units"),
                )

            def unbind_wheel(_event: Any) -> None:
                canvas.unbind_all("<MouseWheel>")

            canvas.bind("<Enter>", bind_wheel)
            canvas.bind("<Leave>", unbind_wheel)
            inner.bind("<Enter>", bind_wheel)
            inner.bind("<Leave>", unbind_wheel)
            return inner

        def _section_title(self, parent: tk.Frame, title: str, subtitle: str) -> None:
            tk.Label(
                parent,
                text=title,
                bg=BG,
                fg=TEXT,
                font=(FONT_UI, 19, "bold"),
            ).pack(anchor="w", pady=(2, 0))
            tk.Label(
                parent,
                text=subtitle,
                bg=BG,
                fg=MUTED,
                font=(FONT_UI, 9),
            ).pack(anchor="w", pady=(2, 14))

        # -- pages ---------------------------------------------------------

        def _build_dashboard(self, page: tk.Frame) -> None:
            inner = self._scrollable(page)
            self._section_title(
                inner,
                "Dashboard",
                "A clean performance profile for Roblox — without cheats or unsafe client code.",
            )

            hero, body = self._card(inner, padding=22)
            hero.pack(fill="x", pady=(0, 16))
            tk.Label(
                body,
                text="PERFORMANCE, NOT CHEATS",
                bg=CARD,
                fg=ACCENT_2,
                font=(FONT_UI, 9, "bold"),
            ).pack(anchor="w", padx=22, pady=(20, 4))
            tk.Label(
                body,
                text="Tune rendering, textures and frame pacing through local settings.",
                bg=CARD,
                fg=TEXT,
                font=(FONT_UI, 16, "bold"),
            ).pack(anchor="w", padx=22, pady=(0, 6))
            tk.Label(
                body,
                text=(
                    "The app writes a reversible ClientAppSettings.json, backs up the previous file, "
                    "and can sync it to every detected Windows or macOS Roblox client. It never injects a DLL, "
                    "edits memory, or changes Roblox executables."
                ),
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 9),
                wraplength=760,
                justify="left",
            ).pack(anchor="w", padx=22, pady=(0, 18))
            action_row = tk.Frame(body, bg=CARD)
            action_row.pack(anchor="w", padx=22, pady=(0, 20))
            ttk.Button(
                action_row,
                text="Open Optimizer",
                style="Accent.TButton",
                command=lambda: self.show_page("Optimizer"),
            ).pack(side="left")
            ttk.Button(
                action_row,
                text="View JSON",
                style="Ghost.TButton",
                command=lambda: self.show_page("JSON Preview"),
            ).pack(side="left", padx=(8, 0))

            stats = tk.Frame(inner, bg=BG)
            stats.pack(fill="x", pady=(0, 16))
            for col in range(4):
                stats.grid_columnconfigure(col, weight=1, uniform="stats")
            cards = (
                ("Detected clients", "—"),
                ("Active profile", "Performance"),
                ("FPS target", "144"),
                ("Managed flags", "—"),
            )
            for col, (label, value) in enumerate(cards):
                outer, body = self._card(stats, padding=16)
                outer.grid(row=0, column=col, sticky="nsew", padx=(0 if col == 0 else 10, 0))
                tk.Label(body, text=label.upper(), bg=CARD, fg=MUTED, font=(FONT_UI, 8, "bold")).pack(
                    anchor="w", padx=16, pady=(14, 3)
                )
                value_label = tk.Label(
                    body,
                    text=value,
                    bg=CARD,
                    fg=ACCENT_2,
                    font=(FONT_UI, 17, "bold"),
                )
                value_label.pack(anchor="w", padx=16, pady=(0, 14))
                self.stat_labels[label] = value_label

            lower = tk.Frame(inner, bg=BG)
            lower.pack(fill="x")
            lower.grid_columnconfigure(0, weight=1)
            lower.grid_columnconfigure(1, weight=1)

            quick, quick_body = self._card(lower, "Quick FPS presets", padding=16)
            quick.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
            tk.Label(
                quick_body,
                text="Pick a target that your PC can actually sustain. Stable FPS beats a huge number.",
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 9),
                wraplength=340,
                justify="left",
            ).pack(anchor="w", padx=16, pady=(0, 10))
            chips = tk.Frame(quick_body, bg=CARD)
            chips.pack(anchor="w", padx=16, pady=(0, 14))
            for value in (60, 120, 144, 165, 240, 9999):
                text = "9999 / Max" if value == 9999 else str(value)
                tk.Button(
                    chips,
                    text=text,
                    bg=CARD_2,
                    fg=TEXT,
                    activebackground=ACCENT,
                    activeforeground="white",
                    bd=0,
                    relief="flat",
                    font=(FONT_UI, 9, "bold"),
                    padx=10,
                    pady=6,
                    cursor="hand2",
                    command=lambda v=value: self._set_fps(v),
                ).pack(side="left", padx=(0, 6), pady=3)

            notice, notice_body = self._card(lower, "2026 compatibility notice", padding=16)
            notice.grid(row=0, column=1, sticky="nsew")
            tk.Label(
                notice_body,
                text="● Current clients use a FastFlag allowlist",
                bg=CARD,
                fg=WARNING,
                font=(FONT_UI, 10, "bold"),
                anchor="w",
            ).pack(fill="x", padx=16, pady=(2, 8))
            tk.Label(
                notice_body,
                text=(
                    "DFIntTaskSchedulerTargetFps is written as an optional legacy compatibility flag, "
                    "but current Roblox clients normally ignore it. For the supported frame-rate cap, "
                    "open Roblox Settings > Maximum Framerate (up to 240 FPS)."
                ),
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 9),
                wraplength=360,
                justify="left",
            ).pack(anchor="w", padx=16, pady=(0, 8))
            self._link_label(
                notice_body,
                "Read Roblox's official allowlist announcement →",
                OFFICIAL_ALLOWLIST_URL,
            ).pack(anchor="w", padx=16, pady=(0, 14))

            log_card, log_body = self._card(inner, "Recent activity", padding=14)
            log_card.pack(fill="both", expand=True, pady=(16, 8))
            self.compact_log = self._make_log_text(log_body, height=7)
            self.compact_log.pack(fill="both", expand=True, padx=14, pady=(0, 14))

        def _build_session(self, page: tk.Frame) -> None:
            inner = self._scrollable(page)
            self._section_title(
                inner,
                "Session",
                "V2 detects a running Roblox client through normal OS metadata, shows a local display name, "
                "and sends a safe readiness notification. No injection and no game-memory access.",
            )

            status_outer, status_body = self._card(inner, "Safe session status", padding=18)
            status_outer.pack(fill="x", pady=(0, 14))
            self.session_status_label = tk.Label(
                status_body,
                text="Checking for a Roblox client…",
                bg=CARD,
                fg=ACCENT_2,
                font=(FONT_UI, 18, "bold"),
            )
            self.session_status_label.pack(anchor="w", padx=18, pady=(14, 4))
            self.session_notification_label = tk.Label(
                status_body,
                text="Roptimer V3.1 is ready. Launch Roblox to use your local performance profile.",
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 9),
                wraplength=920,
                justify="left",
            )
            self.session_notification_label.pack(anchor="w", padx=18, pady=(0, 12))
            actions = tk.Frame(status_body, bg=CARD)
            actions.pack(anchor="w", padx=18, pady=(0, 16))
            ttk.Button(actions, text="Refresh session", style="Ghost.TButton", command=lambda: self._refresh_session(False)).pack(side="left", padx=(0, 8))
            ttk.Button(actions, text="Show readiness notification", style="Accent.TButton", command=self._show_session_notification).pack(side="left")

            info = tk.Frame(inner, bg=BG)
            info.pack(fill="x", pady=(0, 14))
            info.grid_columnconfigure(0, weight=1, uniform="session")
            info.grid_columnconfigure(1, weight=1, uniform="session")

            identity_outer, identity_body = self._card(info, "Identity (local only)", padding=16)
            identity_outer.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
            tk.Label(identity_body, text="Roblox display name (typed by you)", bg=CARD, fg=MUTED, font=(FONT_UI, 9, "bold")).pack(anchor="w", padx=16, pady=(12, 4))
            ttk.Entry(identity_body, textvariable=self.roblox_username_var, width=34).pack(anchor="w", padx=16, pady=(0, 8))
            local_name = SessionDetector.local_username()
            tk.Label(identity_body, text=f"Local Windows user: {local_name}", bg=CARD, fg=ACCENT_2, font=(FONT_UI, 9, "bold")).pack(anchor="w", padx=16, pady=(2, 4))
            self.session_display_label = tk.Label(identity_body, text="Display name: —", bg=CARD, fg=SUCCESS, font=(FONT_UI, 10, "bold"))
            self.session_display_label.pack(anchor="w", padx=16, pady=(0, 8))
            tk.Label(
                identity_body,
                text="This name is stored locally. Roptimer does not read Roblox account data, tokens, player lists, chat, or game memory.",
                bg=CARD,
                fg=WARNING,
                font=(FONT_UI, 8),
                wraplength=430,
                justify="left",
            ).pack(anchor="w", padx=16, pady=(0, 14))

            detect_outer, detect_body = self._card(info, "Client detection", padding=16)
            detect_outer.grid(row=0, column=1, sticky="nsew", padx=(8, 0))
            for key in (
                "Session state",
                "Local Windows user",
                "Display name",
                "Roblox version",
                "Installed versions",
                "Active window title",
                "Client paths",
            ):
                row = tk.Frame(detect_body, bg=CARD)
                row.pack(fill="x", padx=16, pady=3)
                tk.Label(row, text=key, bg=CARD, fg=MUTED, font=(FONT_UI, 8, "bold"), width=20, anchor="w").pack(side="left")
                value = tk.Label(
                    row,
                    text="—",
                    bg=CARD,
                    fg=TEXT,
                    font=(FONT_UI, 8),
                    anchor="w",
                    justify="left",
                    wraplength=390,
                )
                value.pack(side="left", fill="x", expand=True)
                self.session_labels[key] = value
            tk.Label(
                detect_body,
                text="Detection uses process paths and OS window titles only. It cannot see game servers, experience state, or other players.",
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 8),
                wraplength=430,
                justify="left",
            ).pack(anchor="w", padx=16, pady=(10, 14))

            controls = tk.Frame(inner, bg=BG)
            controls.pack(fill="x")
            for col in range(3):
                controls.grid_columnconfigure(col, weight=1, uniform="session-controls")

            fps_outer, fps_body = self._card(controls, "FPS booster", padding=16)
            fps_outer.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
            self.session_fps_label = tk.Label(fps_body, text="144 FPS", bg=CARD, fg=ACCENT, font=(FONT_UI, 22, "bold"))
            self.session_fps_label.pack(anchor="w", padx=16, pady=(12, 4))
            fps_chips = tk.Frame(fps_body, bg=CARD)
            fps_chips.pack(anchor="w", padx=16, pady=(0, 10))
            for value in (60, 120, 144, 240):
                tk.Button(
                    fps_chips,
                    text=str(value),
                    bg=FIELD,
                    fg=ACCENT_2,
                    activebackground=ACCENT,
                    activeforeground="white",
                    bd=0,
                    relief="flat",
                    font=(FONT_UI, 8, "bold"),
                    padx=7,
                    pady=4,
                    cursor="hand2",
                    command=lambda v=value: self._set_fps(v),
                ).pack(side="left", padx=(0, 4))
            boost_row = tk.Frame(fps_body, bg=CARD)
            boost_row.pack(fill="x", padx=16, pady=(0, 14))
            ToggleSwitch(boost_row, variable=self.render_paths_var, command=self._schedule_preview).pack(side="left")
            tk.Label(boost_row, text="Performance boost", bg=CARD, fg=SUCCESS, font=(FONT_UI, 8, "bold")).pack(side="left", padx=(8, 0))

            world_outer, world_body = self._card(controls, "Reduce building / world lag", padding=16)
            world_outer.grid(row=0, column=1, sticky="nsew", padx=8)
            tk.Label(world_body, text="Lower geometry, textures, MSAA and motion load.", bg=CARD, fg=MUTED, font=(FONT_UI, 9), wraplength=260, justify="left").pack(anchor="w", padx=16, pady=(12, 8))
            vfx_row = tk.Frame(world_body, bg=CARD)
            vfx_row.pack(fill="x", padx=16, pady=(0, 8))
            ToggleSwitch(vfx_row, variable=self.vfx_var, command=self._schedule_preview).pack(side="left")
            tk.Label(vfx_row, text="World detail reducer", bg=CARD, fg=ACCENT_2, font=(FONT_UI, 8, "bold")).pack(side="left", padx=(8, 0))
            ttk.Button(world_body, text="Activate Lag Rescue", style="Ghost.TButton", command=lambda: self.preset_var.set("Lag Rescue")).pack(anchor="w", padx=16, pady=(0, 12))
            tk.Label(world_body, text="This does not remove buildings.", bg=CARD, fg=WARNING, font=(FONT_UI, 8, "bold")).pack(anchor="w", padx=16, pady=(0, 14))

            visibility_outer, visibility_body = self._card(controls, "Visibility & lighting", padding=16)
            visibility_outer.grid(row=0, column=2, sticky="nsew", padx=(8, 0))
            bright_row = tk.Frame(visibility_body, bg=CARD)
            bright_row.pack(fill="x", padx=16, pady=(12, 8))

            def on_session_bright_toggle() -> None:
                self._apply_bright_ui()
                self._schedule_preview()

            ToggleSwitch(bright_row, variable=self.bright_ui_var, command=on_session_bright_toggle).pack(side="left")
            tk.Label(bright_row, text="Bright UI (app only)", bg=CARD, fg=WARNING, font=(FONT_UI, 8, "bold")).pack(side="left", padx=(8, 0))
            tk.Label(visibility_body, text="FULLBRIGHT: NOT INCLUDED", bg=CARD, fg=ERROR, font=(FONT_UI, 10, "bold")).pack(anchor="w", padx=16, pady=(8, 4))
            tk.Label(
                visibility_body,
                text="Changing Roblox world lighting or making walls transparent is exploit-style behavior. V2 only changes this app's contrast and safe local graphics settings.",
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 8),
                wraplength=260,
                justify="left",
            ).pack(anchor="w", padx=16, pady=(0, 14))

            banner_outer, banner_body = self._card(inner, padding=16)
            banner_outer.pack(fill="x", pady=(16, 8))
            tk.Label(
                banner_body,
                text="V2 SAFETY: NO INJECTION • NO MEMORY READS • NO ACCOUNT DATA EXTRACTION • NO FULLBRIGHT • NO ANTI-CHEAT BYPASS",
                bg=CARD,
                fg=ACCENT_2,
                font=(FONT_UI, 9, "bold"),
                wraplength=920,
                justify="left",
            ).pack(anchor="w", padx=16, pady=(14, 14))

        def _refresh_session(self, schedule_next: bool = True) -> None:
            """Refresh safe OS-level session information every few seconds."""
            try:
                running_paths = self.core.running_player_paths()
                snapshot = self.session_detector.snapshot(
                    roblox_username=self.roblox_username_var.get(),
                    installed_versions=len(self.versions),
                    running_paths=running_paths,
                )
            except Exception as exc:  # noqa: BLE001
                snapshot = self.session_detector.snapshot(
                    roblox_username=self.roblox_username_var.get(),
                    installed_versions=len(self.versions),
                    running_paths=[],
                    window_title="",
                )
                self.emit_log("warning", f"Session scan skipped: {exc}")

            self.session_snapshot = snapshot
            if hasattr(self, "session_status_label"):
                self.session_status_label.configure(
                    text="Roblox client detected" if snapshot.running else "Waiting for Roblox",
                    fg=SUCCESS if snapshot.running else WARNING,
                )
            if hasattr(self, "session_notification_label"):
                self.session_notification_label.configure(text=snapshot.notification)
            if hasattr(self, "session_display_label"):
                self.session_display_label.configure(text=f"Display name: {snapshot.display_username}")
            for key, value in snapshot.rows():
                label = self.session_labels.get(key)
                if label is not None:
                    label.configure(text=value)
            if snapshot.running and not self._last_session_running:
                self._toast(snapshot.notification, "success")
                self.emit_log("info", snapshot.notification)
            self._last_session_running = snapshot.running
            if schedule_next:
                self.after(5000, self._refresh_session)

        def _show_session_notification(self) -> None:
            snapshot = self.session_snapshot or self.session_detector.snapshot(
                roblox_username=self.roblox_username_var.get(),
                installed_versions=len(self.versions),
                running_paths=self.core.running_player_paths(),
            )
            self._toast(snapshot.notification, "success")
            self.emit_log("info", snapshot.notification)

        def _on_username_changed(self, *_args: Any) -> None:
            name = self.roblox_username_var.get().strip() or "Guest"
            if hasattr(self, "session_display_label"):
                self.session_display_label.configure(text=f"Display name: {name}")
            if self.session_snapshot is not None:
                self.session_snapshot.roblox_username = self.roblox_username_var.get().strip()
                self.session_snapshot.notification = self.session_detector.snapshot(
                    roblox_username=self.roblox_username_var.get(),
                    installed_versions=len(self.versions),
                    running_paths=[Path(p) for p in self.session_snapshot.running_paths],
                    window_title=self.session_snapshot.active_window_title,
                ).notification

        def _build_quick_setup(self, page: tk.Frame) -> None:
            inner = self._scrollable(page)
            self._section_title(
                inner,
                "Quick Setup",
                "Big, simple switches for FPS, boost, lag rescue, VFX load, notifications and client sync.",
            )

            grid = tk.Frame(inner, bg=BG)
            grid.pack(fill="x")
            for col in range(3):
                grid.grid_columnconfigure(col, weight=1, uniform="quick")

            def feature_card(col: int, row: int, badge: str, title: str, subtitle: str, accent: str) -> tk.Frame:
                outer, body = self._card(grid, padding=16)
                outer.grid(row=row, column=col, sticky="nsew", padx=(0 if col == 0 else 10, 0), pady=(0, 10))
                head = tk.Frame(body, bg=CARD)
                head.pack(fill="x")
                mark = tk.Label(
                    head,
                    text=badge,
                    bg=accent,
                    fg="white",
                    font=(FONT_UI, 10, "bold"),
                    width=3,
                    pady=5,
                )
                mark.pack(side="left")
                text = tk.Frame(head, bg=CARD)
                text.pack(side="left", padx=(10, 0), fill="x", expand=True)
                tk.Label(text, text=title, bg=CARD, fg=TEXT, font=(FONT_UI, 11, "bold")).pack(anchor="w")
                tk.Label(
                    text,
                    text=subtitle,
                    bg=CARD,
                    fg=MUTED,
                    font=(FONT_UI, 8),
                    wraplength=230,
                    justify="left",
                ).pack(anchor="w", pady=(2, 0))
                return body

            # FPS target.
            fps_body = feature_card(0, 0, "F", "FPS target", "Stable cap beats huge numbers.", ACCENT)
            self.quick_fps_label = tk.Label(
                fps_body,
                text="144 FPS",
                bg=CARD,
                fg=ACCENT_2,
                font=(FONT_UI, 24, "bold"),
            )
            self.quick_fps_label.pack(anchor="w", padx=16, pady=(12, 6))
            chips = tk.Frame(fps_body, bg=CARD)
            chips.pack(anchor="w", padx=16, pady=(0, 14))
            for value in (60, 120, 144, 240):
                tk.Button(
                    chips,
                    text=str(value),
                    bg=FIELD,
                    fg=ACCENT_2,
                    activebackground=ACCENT,
                    activeforeground="white",
                    bd=0,
                    relief="flat",
                    font=(FONT_UI, 8, "bold"),
                    padx=8,
                    pady=5,
                    cursor="hand2",
                    command=lambda v=value: self._set_fps(v),
                ).pack(side="left", padx=(0, 5))

            # Performance boost.
            boost_body = feature_card(1, 0, "B", "Performance Boost", "Allowlisted rendering paths only.", ACCENT_2)
            toggle_row = tk.Frame(boost_body, bg=CARD)
            toggle_row.pack(fill="x", padx=16, pady=(14, 6))
            ToggleSwitch(toggle_row, variable=self.render_paths_var, command=self._schedule_preview).pack(side="left")
            tk.Label(toggle_row, text="Enabled", bg=CARD, fg=SUCCESS, font=(FONT_UI, 9, "bold")).pack(side="left", padx=(8, 0))
            tk.Label(
                boost_body,
                text="No DLL injection • no memory edits",
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 8),
            ).pack(anchor="w", padx=16, pady=(0, 14))

            # Lag rescue.
            lag_body = feature_card(2, 0, "L", "Lag Rescue", "One click for the lowest safe settings.", WARNING)
            tk.Label(
                lag_body,
                text="Use when a game stutters heavily.",
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 9),
                wraplength=240,
                justify="left",
            ).pack(anchor="w", padx=16, pady=(12, 8))
            ttk.Button(
                lag_body,
                text="Activate Lag Rescue",
                style="Accent.TButton",
                command=lambda: self.preset_var.set("Lag Rescue"),
            ).pack(anchor="w", padx=16, pady=(0, 14))

            # VFX / world detail reducer.
            vfx_body = feature_card(0, 1, "V", "VFX / World Detail", "Reduce visual load safely.", ACCENT)
            vfx_row = tk.Frame(vfx_body, bg=CARD)
            vfx_row.pack(fill="x", padx=16, pady=(14, 6))
            ToggleSwitch(vfx_row, variable=self.vfx_var, command=self._schedule_preview).pack(side="left")
            tk.Label(vfx_row, text="Reducer", bg=CARD, fg=ACCENT_2, font=(FONT_UI, 9, "bold")).pack(side="left", padx=(8, 0))
            tk.Label(
                vfx_body,
                text="No full bright • no x-ray • no building removal",
                bg=CARD,
                fg=WARNING,
                font=(FONT_UI, 8),
                wraplength=240,
                justify="left",
            ).pack(anchor="w", padx=16, pady=(0, 14))

            # Notifications.
            note_body = feature_card(1, 1, "N", "Notifications", "In-app toasts and status log.", SUCCESS)
            note_row = tk.Frame(note_body, bg=CARD)
            note_row.pack(fill="x", padx=16, pady=(14, 6))
            ToggleSwitch(note_row, variable=self.notifications_var, command=self._schedule_preview).pack(side="left")
            tk.Label(note_row, text="Toasts", bg=CARD, fg=SUCCESS, font=(FONT_UI, 9, "bold")).pack(side="left", padx=(8, 0))
            tk.Label(
                note_body,
                text="Apply, restore and auto-sync alerts.",
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 8),
            ).pack(anchor="w", padx=16, pady=(0, 14))

            # Bright UI (app only).
            bright_body = feature_card(2, 1, "U", "Bright UI", "App contrast only, not game lighting.", WARNING)
            bright_row = tk.Frame(bright_body, bg=CARD)
            bright_row.pack(fill="x", padx=16, pady=(14, 6))

            def on_bright_toggle() -> None:
                self._apply_bright_ui()
                self._schedule_preview()

            ToggleSwitch(bright_row, variable=self.bright_ui_var, command=on_bright_toggle).pack(side="left")
            tk.Label(bright_row, text="App only", bg=CARD, fg=WARNING, font=(FONT_UI, 9, "bold")).pack(side="left", padx=(8, 0))
            tk.Label(
                bright_body,
                text="Does not change Roblox world brightness.",
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 8),
            ).pack(anchor="w", padx=16, pady=(0, 14))

            # Client sync.
            sync_body = feature_card(0, 2, "C", "Client Sync", "Any detected Windows or macOS Roblox client.", ACCENT_2)
            sync_row = tk.Frame(sync_body, bg=CARD)
            sync_row.pack(fill="x", padx=16, pady=(14, 6))
            ToggleSwitch(sync_row, variable=self.watch_var, command=self._schedule_preview).pack(side="left")
            tk.Label(sync_row, text="Auto", bg=CARD, fg=ACCENT_2, font=(FONT_UI, 9, "bold")).pack(side="left", padx=(8, 0))
            ttk.Button(
                sync_body,
                text="Sync all versions now",
                style="Ghost.TButton",
                command=self._sync_now,
            ).pack(anchor="w", padx=16, pady=(2, 14))

            # Safe content note spanning two columns.
            outer, body = self._card(grid, padding=18)
            outer.grid(row=2, column=1, columnspan=2, sticky="nsew", padx=(10, 0), pady=(0, 10))
            tk.Label(
                body,
                text="PERFORMANCE, NOT EXPLOITS",
                bg=CARD,
                fg=ACCENT_2,
                font=(FONT_UI, 9, "bold"),
            ).pack(anchor="w", padx=18, pady=(16, 6))
            tk.Label(
                body,
                text=(
                    "This app writes reversible JSON settings and runs a separate HUD. It cannot make "
                    "walls transparent, remove buildings, add full bright lighting, automate gameplay, "
                    "or bypass anti-cheat. Those features are intentionally not included."
                ),
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 9),
                wraplength=540,
                justify="left",
            ).pack(anchor="w", padx=18, pady=(0, 16))

            # Safe Optimization Engine: better FPS, building-lag reduction and
            # auto-selected performance. Explicitly no DLL injection.
            engine_outer, engine_body = self._card(grid, padding=18)
            engine_outer.grid(row=3, column=0, columnspan=3, sticky="nsew", pady=(0, 10))
            tk.Label(
                engine_body,
                text="SAFE OPTIMIZATION ENGINE  •  NO DLL INJECTOR",
                bg=CARD,
                fg=ACCENT_2,
                font=(FONT_UI, 10, "bold"),
            ).pack(anchor="w", padx=18, pady=(16, 4))
            tk.Label(
                engine_body,
                text=(
                    "Pick Better FPS, Reduce building lag, Maximum performance, or let the app choose "
                    "a better mode from local CPU/RAM hints. Every mode writes reversible JSON only."
                ),
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 9),
                wraplength=980,
                justify="left",
            ).pack(anchor="w", padx=18, pady=(0, 10))

            engine_controls = tk.Frame(engine_body, bg=CARD)
            engine_controls.pack(fill="x", padx=18, pady=(0, 6))
            tk.Label(
                engine_controls,
                text="Optimization mode",
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 8, "bold"),
            ).pack(anchor="w")
            self.optimization_mode_combo = ttk.Combobox(
                engine_controls,
                textvariable=self.optimization_mode_var,
                values=list(OPTIMIZATION_MODES),
                state="readonly",
                font=(FONT_UI, 9),
                width=28,
            )
            self.optimization_mode_combo.pack(side="left", pady=(3, 0))
            ttk.Button(
                engine_controls,
                text=AUTO_MODE_LABEL,
                style="Ghost.TButton",
                command=self._auto_choose_mode,
            ).pack(side="left", padx=(10, 0), pady=(3, 0))

            building_row = tk.Frame(engine_controls, bg=CARD)
            building_row.pack(side="left", padx=(24, 0), pady=(3, 0))
            ToggleSwitch(
                building_row,
                variable=self.building_lag_reducer_var,
                command=self._schedule_preview,
            ).pack(side="left")
            tk.Label(
                building_row,
                text="Reduce building / geometry lag",
                bg=CARD,
                fg=WARNING,
                font=(FONT_UI, 8, "bold"),
            ).pack(side="left", padx=(8, 0))

            self.optimization_mode_desc = tk.Label(
                engine_body,
                text="",
                bg=CARD,
                fg=SUCCESS,
                font=(FONT_UI, 9, "bold"),
                wraplength=980,
                justify="left",
            )
            self.optimization_mode_desc.pack(anchor="w", padx=18, pady=(4, 14))
            self._refresh_optimization_mode_label()

        def _build_optimizer(self, page: tk.Frame) -> None:
            inner = self._scrollable(page)
            self._section_title(
                inner,
                "Optimizer",
                "Choose a frame target and the rendering trade-offs you want. Everything is reversible.",
            )

            columns = tk.Frame(inner, bg=BG)
            columns.pack(fill="x")
            columns.grid_columnconfigure(0, weight=1, uniform="optimizer")
            columns.grid_columnconfigure(1, weight=1, uniform="optimizer")

            # Frame rate card.
            fps_card, fps_body = self._card(columns, "Frame rate", padding=18)
            fps_card.grid(row=0, column=0, sticky="nsew", padx=(0, 10))
            top_row = tk.Frame(fps_body, bg=CARD)
            top_row.pack(fill="x", padx=18, pady=(0, 8))
            self.fps_display = tk.Label(
                top_row,
                text="144 FPS",
                bg=CARD,
                fg=ACCENT_2,
                font=(FONT_UI, 27, "bold"),
            )
            self.fps_display.pack(side="left")
            tk.Label(
                top_row,
                text="Target",
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 9),
            ).pack(side="left", padx=(8, 0), pady=(12, 0))

            self.fps_scale = ttk.Scale(
                fps_body,
                from_=FPS_MIN,
                to=FPS_MAX,
                orient="horizontal",
                style="Neon.Horizontal.TScale",
                command=self._on_fps_slider,
            )
            self.fps_scale.set(self.fps_var.get())
            self.fps_scale.pack(fill="x", padx=18, pady=(2, 4))

            entry_row = tk.Frame(fps_body, bg=CARD)
            entry_row.pack(fill="x", padx=18, pady=(0, 8))
            tk.Label(entry_row, text="Exact value", bg=CARD, fg=MUTED, font=(FONT_UI, 9)).pack(side="left")
            self.fps_spin = ttk.Spinbox(
                entry_row,
                from_=FPS_MIN,
                to=FPS_MAX,
                width=8,
                textvariable=self.fps_entry_var,
                font=(FONT_UI, 10, "bold"),
                command=self._commit_fps_entry,
            )
            self.fps_spin.pack(side="left", padx=(8, 0))
            self.fps_spin.bind("<Return>", self._commit_fps_entry)
            self.fps_spin.bind("<FocusOut>", self._commit_fps_entry)
            tk.Label(entry_row, text=f"Range: {FPS_MIN}–{FPS_MAX}", bg=CARD, fg=MUTED, font=(FONT_UI, 9)).pack(
                side="right"
            )

            chip_frame = tk.Frame(fps_body, bg=CARD)
            chip_frame.pack(fill="x", padx=18, pady=(0, 8))
            for value in (60, 120, 144, 165, 240, 9999):
                tk.Button(
                    chip_frame,
                    text="MAX" if value == 9999 else str(value),
                    bg=FIELD,
                    fg=ACCENT_2,
                    activebackground=ACCENT,
                    activeforeground="white",
                    bd=0,
                    relief="flat",
                    font=(FONT_UI, 8, "bold"),
                    padx=9,
                    pady=5,
                    cursor="hand2",
                    command=lambda v=value: self._set_fps(v),
                ).pack(side="left", padx=(0, 5), pady=3)

            self.fps_note = tk.Label(
                fps_body,
                text="",
                bg=CARD,
                fg=WARNING,
                font=(FONT_UI, 8),
                wraplength=430,
                justify="left",
            )
            self.fps_note.pack(fill="x", padx=18, pady=(4, 10))

            self._toggle_row(
                fps_body,
                "Write legacy DFIntTaskSchedulerTargetFps",
                "For older clients. Current allowlisted clients may ignore this key.",
                self.legacy_var,
            )

            # Rendering card.
            render_card, render_body = self._card(columns, "Graphics tweaks", padding=18)
            render_card.grid(row=0, column=1, sticky="nsew")
            self._toggle_row(
                render_body,
                "Optimize Rendering Paths",
                "Uses allowlisted geometry LOD and voxel-lighting flags.",
                self.render_paths_var,
            )
            self._toggle_row(
                render_body,
                "Lower Hidden Textures",
                "Limits texture resolution to reduce GPU memory pressure.",
                self.hidden_textures_var,
            )
            self._toggle_row(
                render_body,
                "Reduce Grass Motion",
                "Uses the allowlisted reduced-motion grass factor.",
                self.grass_var,
            )
            self._toggle_row(
                render_body,
                "VFX / World Detail Reducer",
                "Lowers quality, texture, MSAA and motion flags for smoother frames.",
                self.vfx_var,
            )
            self._toggle_row(
                render_body,
                "Reduce Building / Geometry Lag",
                "Lowest safe LOD and grass draw distance. Does NOT remove buildings.",
                self.building_lag_reducer_var,
            )

            dropdowns = tk.Frame(render_body, bg=CARD)
            dropdowns.pack(fill="x", padx=18, pady=(8, 14))
            dropdowns.grid_columnconfigure(1, weight=1)
            dropdowns.grid_columnconfigure(3, weight=1)
            self._dropdown(dropdowns, "Preset", self.preset_var, list(PRESET_VALUES) + ["Custom"], 0, 0)
            self._dropdown(dropdowns, "Renderer", self.renderer_var, list(RENDERER_FLAGS), 0, 2)
            self._dropdown(dropdowns, "Graphics quality", self.graphics_quality_var, list(GRAPHICS_QUALITY), 1, 0)
            self._dropdown(dropdowns, "Texture quality", self.texture_quality_var, list(TEXTURE_QUALITY), 1, 2)
            self._dropdown(dropdowns, "Anti-aliasing", self.msaa_var, list(MSAA_SAMPLES), 2, 0)
            self._dropdown(dropdowns, "Grass motion", self.grass_motion_var, list(GRASS_MOTION), 2, 2)
            self._dropdown(
                dropdowns,
                "Optimization mode",
                self.optimization_mode_var,
                list(OPTIMIZATION_MODES),
                3,
                0,
            )

            tk.Label(
                render_body,
                text="Only current allowlisted rendering flags are used for active optimizations.",
                bg=CARD,
                fg=SUCCESS,
                font=(FONT_UI, 8),
                wraplength=440,
                justify="left",
            ).pack(anchor="w", padx=18, pady=(0, 14))

            # Delivery card.
            delivery, delivery_body = self._card(inner, "Client connection", padding=18)
            delivery.pack(fill="x", pady=(16, 8))
            row = tk.Frame(delivery_body, bg=CARD)
            row.pack(fill="x", padx=18, pady=(0, 8))
            tk.Label(row, text="Write profile to", bg=CARD, fg=MUTED, font=(FONT_UI, 9)).pack(side="left")
            self.scope_combo = ttk.Combobox(
                row,
                textvariable=self.scope_var,
                values=list(TARGET_SCOPES),
                state="readonly",
                width=38,
            )
            self.scope_combo.pack(side="left", padx=(10, 0))
            self.scope_combo.bind("<<ComboboxSelected>>", lambda _e: self._schedule_preview())
            ttk.Button(row, text="Sync all now", style="Ghost.TButton", command=self._sync_now).pack(
                side="right"
            )

            custom_row = tk.Frame(delivery_body, bg=CARD)
            custom_row.pack(fill="x", padx=18, pady=(0, 8))
            tk.Label(custom_row, text="Custom folder", bg=CARD, fg=MUTED, font=(FONT_UI, 9)).pack(side="left")
            self.custom_entry = ttk.Entry(custom_row, textvariable=self.custom_root_var, width=62)
            self.custom_entry.pack(side="left", padx=(10, 6), fill="x", expand=True)
            ttk.Button(custom_row, text="Browse", style="Ghost.TButton", command=self._browse_custom_root).pack(
                side="left"
            )

            toggle_row = tk.Frame(delivery_body, bg=CARD)
            toggle_row.pack(fill="x", padx=18, pady=(0, 14))
            for label, variable in (
                ("Also write shared profile", self.shared_profile_var),
                ("Auto-sync new versions", self.watch_var),
                ("Launch after apply", self.launch_var),
            ):
                item = tk.Frame(toggle_row, bg=CARD)
                item.pack(side="left", padx=(0, 18))
                ToggleSwitch(item, variable=variable, command=self._schedule_preview).pack(side="left")
                tk.Label(item, text=label, bg=CARD, fg=MUTED, font=(FONT_UI, 8)).pack(side="left", padx=(6, 0))

            self.client_status = tk.Label(
                delivery_body,
                text="Detected clients: scanning…",
                bg=CARD,
                fg=ACCENT_2,
                font=(FONT_UI, 9, "bold"),
            )
            self.client_status.pack(anchor="w", padx=18, pady=(0, 14))

        def _build_client_link(self, page: tk.Frame) -> None:
            inner = self._scrollable(page)
            self._section_title(
                inner,
                "Client Link",
                "Connect the JSON profile to any detected Windows or macOS Roblox client — safely, through files.",
            )

            toolbar = tk.Frame(inner, bg=BG)
            toolbar.pack(fill="x", pady=(0, 12))
            ttk.Button(toolbar, text="Refresh", style="Ghost.TButton", command=self._refresh_versions).pack(side="left")
            ttk.Button(toolbar, text="Apply to selected", style="Ghost.TButton", command=self._apply_selected).pack(
                side="left", padx=(8, 0)
            )
            ttk.Button(toolbar, text="Open folder", style="Ghost.TButton", command=self._open_selected_folder).pack(
                side="left", padx=(8, 0)
            )
            ttk.Button(
                toolbar,
                text="Restore stock settings",
                style="Danger.TButton",
                command=self._restore_async,
            ).pack(side="right")

            table_card, table_body = self._card(inner, "Detected installations", padding=12)
            table_card.pack(fill="both", expand=True)
            columns = ("version", "executable", "modified", "profile")
            self.version_tree = ttk.Treeview(
                table_body,
                columns=columns,
                show="headings",
                selectmode="extended",
                height=14,
            )
            headings = {
                "version": ("Version / path", 320),
                "executable": ("Executable", 160),
                "modified": ("Modified", 140),
                "profile": ("Profile status", 170),
            }
            for col, (heading, width) in headings.items():
                self.version_tree.heading(col, text=heading)
                self.version_tree.column(col, width=width, anchor="w")
            scrollbar = ttk.Scrollbar(table_body, orient="vertical", command=self.version_tree.yview)
            self.version_tree.configure(yscrollcommand=scrollbar.set)
            self.version_tree.pack(side="left", fill="both", expand=True, padx=12, pady=(8, 12))
            scrollbar.pack(side="right", fill="y", pady=(8, 12), padx=(0, 6))

            info, info_body = self._card(inner, "How version connection works", padding=16)
            info.pack(fill="x", pady=(14, 8))
            tk.Label(
                info_body,
                text=(
                    "On Windows the app scans %LOCALAPPDATA%\\Roblox\\Versions\\version-*, common Program Files "
                    "installations, the registered client executable, optional running-process paths, "
                    "and your custom folder. On macOS it scans /Applications/Roblox.app/Contents/MacOS. "
                    "Each selected location gets its own ClientSettings/ClientAppSettings.json. A shared "
                    "profile can also be written so new versions pick up the same settings where supported."
                ),
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 9),
                wraplength=850,
                justify="left",
            ).pack(anchor="w", padx=16, pady=(0, 14))

        def _build_json_preview(self, page: tk.Frame) -> None:
            inner = self._scrollable(page)
            self._section_title(
                inner,
                "JSON Preview",
                "This is the exact managed key set that will be merged into ClientAppSettings.json.",
            )

            toolbar = tk.Frame(inner, bg=BG)
            toolbar.pack(fill="x", pady=(0, 12))
            ttk.Button(toolbar, text="Refresh", style="Ghost.TButton", command=self._refresh_preview).pack(side="left")
            ttk.Button(toolbar, text="Copy JSON", style="Ghost.TButton", command=self._copy_json).pack(
                side="left", padx=(8, 0)
            )
            ttk.Button(toolbar, text="Download JSON", style="Ghost.TButton", command=self._download_json).pack(
                side="left", padx=(8, 0)
            )
            self.json_status = tk.Label(
                toolbar,
                textvariable=self.flag_count_var,
                bg=BG,
                fg=ACCENT_2,
                font=(FONT_UI, 9, "bold"),
            )
            self.json_status.pack(side="right")

            preview_card, preview_body = self._card(inner, "ClientAppSettings.json (managed keys)", padding=12)
            preview_card.pack(fill="both", expand=True)
            self.json_text = ScrolledText(
                preview_body,
                height=22,
                bg=FIELD,
                fg=TEXT,
                insertbackground=ACCENT_2,
                relief="flat",
                bd=0,
                font=(FONT_MONO, 10),
                wrap="none",
            )
            self.json_text.pack(fill="both", expand=True, padx=12, pady=(8, 12))
            self.json_text.configure(state="disabled")

            notes, notes_body = self._card(inner, "Compatibility notes", padding=14)
            notes.pack(fill="x", pady=(14, 8))
            self.json_notes = tk.Label(
                notes_body,
                text="",
                bg=CARD,
                fg=WARNING,
                font=(FONT_UI, 9),
                wraplength=850,
                justify="left",
            )
            self.json_notes.pack(anchor="w", padx=14, pady=(0, 12))

        def _build_activity_log(self, page: tk.Frame) -> None:
            inner = self._scrollable(page)
            self._section_title(
                inner,
                "Activity Log",
                "Success, warning and error messages are kept inside the application window.",
            )
            toolbar = tk.Frame(inner, bg=BG)
            toolbar.pack(fill="x", pady=(0, 12))
            ttk.Button(toolbar, text="Clear", style="Ghost.TButton", command=self._clear_logs).pack(side="left")
            ttk.Button(toolbar, text="Save log", style="Ghost.TButton", command=self._save_log).pack(
                side="left", padx=(8, 0)
            )
            log_card, log_body = self._card(inner, "Status log", padding=12)
            log_card.pack(fill="both", expand=True)
            self.full_log = self._make_log_text(log_body, height=24)
            self.full_log.pack(fill="both", expand=True, padx=12, pady=(8, 12))

        def _build_guide(self, page: tk.Frame) -> None:
            inner = self._scrollable(page)
            self._section_title(
                inner,
                "Safe Guide",
                "Use supported Roblox settings first. The JSON profile is a reversible companion, not a cheat.",
            )

            steps, steps_body = self._card(inner, "Recommended in-experience settings", padding=18)
            steps.pack(fill="x", pady=(0, 14))
            guide_text = [
                ("1", "Open the menu", "Press Esc, open the Settings tab, then set Graphics Mode to Manual."),
                ("2", "Lower graphics", "Move Graphics Quality left until frame time is stable. This is Roblox's supported quality control."),
                ("3", "Set Maximum Framerate", f"If available, choose a cap up to {MAX_NATIVE_FPS} FPS that matches your monitor. Prefer a stable cap over 9999."),
                ("4", "Restart after changes", "ClientAppSettings.json is read when Roblox starts. Close and reopen the client after applying."),
                ("5", "Revert if needed", "Use Restore Stock Settings. The app keeps backups and removes only flags it manages."),
            ]
            for number, title, body in guide_text:
                row = tk.Frame(steps_body, bg=CARD)
                row.pack(fill="x", padx=18, pady=5)
                badge = tk.Label(
                    row,
                    text=number,
                    bg=ACCENT,
                    fg="white",
                    font=(FONT_UI, 9, "bold"),
                    width=3,
                    pady=4,
                )
                badge.pack(side="left", anchor="n")
                text_frame = tk.Frame(row, bg=CARD)
                text_frame.pack(side="left", fill="x", expand=True, padx=(10, 0))
                tk.Label(text_frame, text=title, bg=CARD, fg=TEXT, font=(FONT_UI, 10, "bold")).pack(anchor="w")
                tk.Label(
                    text_frame,
                    text=body,
                    bg=CARD,
                    fg=MUTED,
                    font=(FONT_UI, 9),
                    wraplength=780,
                    justify="left",
                ).pack(anchor="w", pady=(1, 0))

            links, links_body = self._card(inner, "Official references", padding=18)
            links.pack(fill="x", pady=(0, 14))
            self._link_label(links_body, "Roblox: Graphics Quality settings →", OFFICIAL_GRAPHICS_URL).pack(
                anchor="w", padx=18, pady=3
            )
            self._link_label(links_body, "Roblox: How to Reduce Lag and Speed Up Play →", OFFICIAL_LAG_URL).pack(
                anchor="w", padx=18, pady=3
            )
            self._link_label(links_body, "Roblox: FastFlag allowlist announcement →", OFFICIAL_ALLOWLIST_URL).pack(
                anchor="w", padx=18, pady=(3, 14)
            )

            safety, safety_body = self._card(inner, "Safety promise", padding=18)
            safety.pack(fill="x")
            tk.Label(
                safety_body,
                text=(
                    "This tool only writes local JSON configuration files. It does not inject a DLL, "
                    "hook the renderer, read or write game memory, patch Roblox executables, automate "
                    "gameplay, or attempt to bypass Roblox's FastFlag allowlist. Writing the optional "
                    "legacy FPS key is clearly labeled and current clients simply ignore unsupported keys."
                ),
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 9),
                wraplength=850,
                justify="left",
            ).pack(anchor="w", padx=18, pady=(0, 16))

        def _build_footer(self, parent: tk.Frame) -> None:
            footer = tk.Frame(parent, bg=HEADER, height=76)
            footer.pack(fill="x", side="bottom")
            footer.pack_propagate(False)

            left = tk.Frame(footer, bg=HEADER)
            left.pack(side="left", padx=24)
            self.status_dot = tk.Label(left, text="●", bg=HEADER, fg=SUCCESS, font=(FONT_UI, 12))
            self.status_dot.pack(side="left")
            self.footer_status = tk.Label(
                left,
                textvariable=self.status_var,
                bg=HEADER,
                fg=MUTED,
                font=(FONT_UI, 9),
                wraplength=360,
                justify="left",
            )
            self.footer_status.pack(side="left", padx=(6, 0))

            self.progress = ttk.Progressbar(footer, mode="indeterminate", length=100)
            self.progress.pack(side="left", padx=(10, 0))

            actions = tk.Frame(footer, bg=HEADER)
            actions.pack(side="right", padx=20)
            ttk.Button(
                actions,
                text="Restore",
                style="Danger.TButton",
                command=self._restore_async,
            ).pack(side="left", padx=(0, 8))
            ttk.Button(
                actions,
                text="Preview JSON",
                style="Ghost.TButton",
                command=lambda: self.show_page("JSON Preview"),
            ).pack(side="left", padx=(0, 8))
            self.apply_button = ttk.Button(
                actions,
                text="Apply Optimizations & Launch",
                style="Accent.TButton",
                command=self._apply_async,
            )
            self.apply_button.pack(side="left")

        # -- small widget helpers -----------------------------------------

        def _make_log_text(self, parent: tk.Frame, height: int) -> ScrolledText:
            widget = ScrolledText(
                parent,
                height=height,
                bg=FIELD,
                fg=TEXT,
                insertbackground=ACCENT_2,
                relief="flat",
                bd=0,
                font=(FONT_MONO, 9),
                wrap="word",
            )
            widget.configure(state="disabled")
            for level, color in (
                ("info", ACCENT_2),
                ("success", SUCCESS),
                ("warning", WARNING),
                ("error", ERROR),
                ("time", MUTED),
            ):
                widget.tag_configure(level, foreground=color)
            self.log_widgets.append(widget)
            return widget

        def _link_label(self, parent: tk.Frame, text: str, url: str) -> tk.Label:
            label = tk.Label(
                parent,
                text=text,
                bg=CARD,
                fg=ACCENT_2,
                font=(FONT_UI, 9, "bold"),
                cursor="hand2",
            )
            label.bind("<Button-1>", lambda _e: webbrowser.open(url))
            return label

        def _toggle_row(
            self,
            parent: tk.Frame,
            title: str,
            subtitle: str,
            variable: "tk.BooleanVar",
        ) -> None:
            row = tk.Frame(parent, bg=CARD)
            row.pack(fill="x", padx=18, pady=5)
            text = tk.Frame(row, bg=CARD)
            text.pack(side="left", fill="x", expand=True)
            tk.Label(text, text=title, bg=CARD, fg=TEXT, font=(FONT_UI, 10, "bold")).pack(anchor="w")
            tk.Label(
                text,
                text=subtitle,
                bg=CARD,
                fg=MUTED,
                font=(FONT_UI, 8),
                wraplength=420,
                justify="left",
            ).pack(anchor="w")
            ToggleSwitch(row, variable=variable, command=self._schedule_preview).pack(side="right", padx=(8, 0))

        def _dropdown(
            self,
            parent: tk.Frame,
            label: str,
            variable: "tk.StringVar",
            values: list[str],
            row: int,
            column: int,
        ) -> ttk.Combobox:
            cell = tk.Frame(parent, bg=CARD)
            cell.grid(row=row, column=column, columnspan=2, sticky="ew", padx=(0, 10), pady=5)
            tk.Label(cell, text=label, bg=CARD, fg=MUTED, font=(FONT_UI, 8, "bold")).pack(anchor="w")
            combo = ttk.Combobox(
                cell,
                textvariable=variable,
                values=values,
                state="readonly",
                font=(FONT_UI, 9),
            )
            combo.pack(fill="x", pady=(3, 0))
            combo.bind("<<ComboboxSelected>>", lambda _e: self._on_combo_change(variable))
            return combo

        # -- state / events -------------------------------------------------

        def _apply_bright_ui(self) -> None:
            """High-contrast APP theme only. Never changes Roblox lighting."""
            enabled = bool(self.bright_ui_var.get())
            style = ttk.Style(self)
            if enabled:
                self.configure(bg="#050507")
                style.configure("Accent.TButton", background="#ff4b57", foreground="#ffffff")
                style.map(
                    "Accent.TButton",
                    background=[("active", "#ff6b76"), ("disabled", "#56506b")],
                    foreground=[("disabled", "#d0cbe0")],
                )
            else:
                self.configure(bg=BG)
                style.configure("Accent.TButton", background=ACCENT, foreground="#0b0913")
                style.map(
                    "Accent.TButton",
                    background=[("active", ACCENT_HOVER), ("disabled", "#56506b")],
                    foreground=[("disabled", "#d0cbe0")],
                )

        def _toast(self, message: str, level: str = "info") -> None:
            """Show a small in-app notification when notifications are enabled."""
            if not hasattr(self, "notifications_var") or not self.notifications_var.get():
                return
            color = {
                "info": ACCENT_2,
                "success": SUCCESS,
                "warning": WARNING,
                "error": ERROR,
            }.get(level, ACCENT_2)
            toast = tk.Toplevel(self)
            toast.overrideredirect(True)
            try:
                toast.attributes("-topmost", True)
                toast.attributes("-alpha", 0.96)
            except tk.TclError:
                pass
            frame = tk.Frame(toast, bg=FIELD, bd=1, relief="solid")
            frame.pack(fill="both", expand=True)
            tk.Label(
                frame,
                text="ROPTIMZIER",
                bg=FIELD,
                fg=color,
                font=(FONT_UI, 8, "bold"),
            ).pack(anchor="w", padx=12, pady=(9, 0))
            tk.Label(
                frame,
                text=message,
                bg=FIELD,
                fg=TEXT,
                font=(FONT_UI, 9),
                wraplength=280,
                justify="left",
            ).pack(anchor="w", padx=12, pady=(2, 10))
            try:
                self.update_idletasks()
                x = self.winfo_x() + self.winfo_width() - 320
                y = self.winfo_y() + self.winfo_height() - 130
                toast.geometry(f"300x70+{max(0, x)}+{max(0, y)}")
            except tk.TclError:
                pass
            toast.after(3600, toast.destroy)

        def _attach_traces(self) -> None:
            self.fps_entry_var.trace_add("write", self._on_fps_entry)
            self.roblox_username_var.trace_add("write", self._on_username_changed)
            for variable in (
                self.render_paths_var,
                self.hidden_textures_var,
                self.grass_var,
                self.vfx_var,
                self.building_lag_reducer_var,
                self.notifications_var,
                self.bright_ui_var,
                self.legacy_var,
                self.renderer_var,
                self.graphics_quality_var,
                self.texture_quality_var,
                self.msaa_var,
                self.grass_motion_var,
                self.scope_var,
                self.shared_profile_var,
                self.watch_var,
                self.launch_var,
                self.custom_root_var,
            ):
                variable.trace_add("write", self._on_setting_changed)
            self.preset_var.trace_add("write", self._on_preset_changed)
            self.optimization_mode_var.trace_add("write", self._on_optimization_mode_changed)

        def _on_preset_changed(self, *_args: Any) -> None:
            if self._setting_preset:
                return
            name = self.preset_var.get()
            if name not in PRESET_VALUES:
                self._schedule_preview()
                return
            self._setting_preset = True
            try:
                values = PRESET_VALUES[name]
                for key, value in values.items():
                    if key == "fps_target":
                        self._set_fps(int(value))
                    elif hasattr(self, f"{key}_var"):
                        getattr(self, f"{key}_var").set(value)
                    else:
                        # Map a few explicit names used by the preset table.
                        mapping = {
                            "legacy_fps_flag": self.legacy_var,
                            "optimize_rendering": self.render_paths_var,
                            "lower_textures": self.hidden_textures_var,
                            "reduce_grass_motion": self.grass_var,
                            "vfx_reducer": self.vfx_var,
                            "building_lag_reducer": self.building_lag_reducer_var,
                            "notifications": self.notifications_var,
                            "bright_ui": self.bright_ui_var,
                        }
                        if key in mapping:
                            mapping[key].set(bool(value))
            finally:
                self._setting_preset = False
            self._schedule_preview()

        def _on_combo_change(self, variable: "tk.StringVar") -> None:
            if variable is self.preset_var:
                # Changing the preset intentionally loads a full set of values;
                # it must not immediately be relabeled as "Custom".
                self._on_preset_changed()
                return
            if variable is self.optimization_mode_var:
                self._on_optimization_mode_changed()
                return
            self._mark_custom()

        def _refresh_optimization_mode_label(self) -> None:
            if not hasattr(self, "optimization_mode_desc"):
                return
            mode = self.optimization_mode_var.get()
            info = OPTIMIZATION_MODES.get(mode)
            if info:
                text = f"{mode}: {info['description']}"
            else:
                text = "Choose a safe, non-injecting optimization mode."
            self.optimization_mode_desc.configure(text=text)

        def _on_optimization_mode_changed(self, *_args: Any) -> None:
            if self._setting_mode:
                return
            if self._setting_preset:
                # A preset is already loading its own values; just update text.
                self._refresh_optimization_mode_label()
                return
            name = self.optimization_mode_var.get()
            if name not in OPTIMIZATION_MODES:
                return
            self._setting_mode = True
            previous_preset_guard = self._setting_preset
            self._setting_preset = True
            try:
                values = OPTIMIZATION_MODES[name]["values"]
                mapping = {
                    "preset": self.preset_var,
                    "legacy_fps_flag": self.legacy_var,
                    "optimize_rendering": self.render_paths_var,
                    "lower_textures": self.hidden_textures_var,
                    "reduce_grass_motion": self.grass_var,
                    "vfx_reducer": self.vfx_var,
                    "building_lag_reducer": self.building_lag_reducer_var,
                    "notifications": self.notifications_var,
                    "bright_ui": self.bright_ui_var,
                    "graphics_quality": self.graphics_quality_var,
                    "texture_quality": self.texture_quality_var,
                    "msaa": self.msaa_var,
                    "grass_motion": self.grass_motion_var,
                }
                for key, value in values.items():
                    if key == "fps_target":
                        self._set_fps(int(value))
                    elif key in mapping:
                        mapping[key].set(value)
                self._refresh_optimization_mode_label()
            finally:
                self._setting_preset = previous_preset_guard
                self._setting_mode = False
            self._schedule_preview()

        def _auto_choose_mode(self) -> None:
            profile = SafeOptimizationEngine.detect_profile()
            mode = SafeOptimizationEngine.choose_mode(profile)
            self.optimization_mode_var.set(mode)
            self._on_optimization_mode_changed()
            self._toast(f"Chose {mode} for {profile.tier} hardware.", "success")
            self.emit_log(
                "info",
                f"Safe Optimization Engine selected {mode} "
                f"({profile.cpu_cores} cores, {profile.memory_gb:.1f} GB RAM, {profile.source}).",
            )

        def _on_setting_changed(self, *_args: Any) -> None:
            if self._setting_preset or self._setting_mode:
                return
            self._mark_custom()

        def _mark_custom(self) -> None:
            if not self._setting_preset and self.preset_var.get() != "Custom":
                self._setting_preset = True
                self.preset_var.set("Custom")
                self._setting_preset = False
            if not self._setting_mode and self.optimization_mode_var.get() != "Custom":
                self._setting_mode = True
                self.optimization_mode_var.set("Custom")
                self._setting_mode = False
            self._refresh_optimization_mode_label()
            self._schedule_preview()

        def _on_fps_slider(self, value: str) -> None:
            if self._syncing_fps:
                return
            self._set_fps(int(float(value)))

        def _on_fps_entry(self, *_args: Any) -> None:
            if self._syncing_fps:
                return
            try:
                value = int(float(self.fps_entry_var.get()))
            except (TypeError, ValueError):
                return
            self._set_fps(value)

        def _commit_fps_entry(self, *_args: Any) -> None:
            self._on_fps_entry()
            return None

        def _set_fps(self, value: int) -> None:
            value = max(FPS_MIN, min(FPS_MAX, int(value)))
            self._syncing_fps = True
            try:
                self.fps_var.set(value)
                self.fps_entry_var.set(str(value))
                if hasattr(self, "fps_scale"):
                    self.fps_scale.set(value)
                display = f"{value:,} FPS" if value < 9999 else "UNLIMITED*"
                self.fps_display.configure(text=display)
                if value >= FPS_MAX:
                    note = (
                        f"* {FPS_MAX} is an uncapped ceiling, not {FPS_MAX} real FPS. Very high targets "
                        "can cause heat, stutter or physics instability."
                    )
                elif value > MAX_NATIVE_FPS:
                    note = (
                        f"Roblox's supported Maximum Framerate setting currently tops out at "
                        f"{MAX_NATIVE_FPS} FPS. Values above that rely on legacy/unsupported behavior."
                    )
                else:
                    note = (
                        f"Tip: also set Roblox Settings > Maximum Framerate to {value} FPS when available."
                    )
                if hasattr(self, "fps_note"):
                    self.fps_note.configure(text=note)
                if "FPS target" in self.stat_labels:
                    self.stat_labels["FPS target"].configure(text=display)
                if hasattr(self, "quick_fps_label"):
                    self.quick_fps_label.configure(text=display)
                if hasattr(self, "session_fps_label"):
                    self.session_fps_label.configure(text=display)
            finally:
                self._syncing_fps = False
            self._schedule_preview()

        def _collect_settings(self) -> OptimizerSettings:
            try:
                fps = int(float(self.fps_entry_var.get()))
            except (TypeError, ValueError):
                fps = self.fps_var.get()
            settings = OptimizerSettings(
                fps_target=fps,
                legacy_fps_flag=bool(self.legacy_var.get()),
                optimize_rendering=bool(self.render_paths_var.get()),
                lower_textures=bool(self.hidden_textures_var.get()),
                reduce_grass_motion=bool(self.grass_var.get()),
                vfx_reducer=bool(self.vfx_var.get()),
                building_lag_reducer=bool(self.building_lag_reducer_var.get()),
                notifications=bool(self.notifications_var.get()),
                bright_ui=bool(self.bright_ui_var.get()),
                roblox_username=self.roblox_username_var.get(),
                optimization_mode=self.optimization_mode_var.get(),
                preset=self.preset_var.get(),
                renderer=self.renderer_var.get(),
                graphics_quality=self.graphics_quality_var.get(),
                texture_quality=self.texture_quality_var.get(),
                msaa=self.msaa_var.get(),
                grass_motion=self.grass_motion_var.get(),
                target_scope=self.scope_var.get(),
                shared_profile=bool(self.shared_profile_var.get()),
                watch_versions=bool(self.watch_var.get()),
                launch_after_apply=bool(self.launch_var.get()),
                custom_root=self.custom_root_var.get().strip(),
            )
            settings.normalize_in_place()
            return settings

        def show_page(self, name: str) -> None:
            self.current_page = name
            self.pages[name].tkraise()
            for nav_name, button in self.nav_buttons.items():
                active = nav_name == name
                button.configure(
                    bg=CARD if active else SIDEBAR,
                    fg=TEXT if active else MUTED,
                )
            if name == "JSON Preview":
                self._refresh_preview()
            if name == "Client Link":
                self._refresh_versions()

        # -- logging -------------------------------------------------------

        def emit_log(self, level: str, message: str) -> None:
            self.log_queue.put((level, message))

        def _drain_queues(self) -> None:
            try:
                while True:
                    level, message = self.log_queue.get_nowait()
                    self._append_log(level, message)
            except queue.Empty:
                pass
            try:
                while True:
                    self.task_queue.get_nowait()
                    self._set_busy(False)
            except queue.Empty:
                pass
            try:
                while True:
                    callback = self.ui_queue.get_nowait()
                    callback()
            except queue.Empty:
                pass
            self.after(100, self._drain_queues)

        def _append_log(self, level: str, message: str) -> None:
            timestamp = dt.datetime.now().strftime("%H:%M:%S")
            color = {
                "info": ACCENT_2,
                "success": SUCCESS,
                "warning": WARNING,
                "error": ERROR,
            }.get(level, TEXT)
            self.status_var.set(message)
            self.status_dot.configure(fg=color)
            line = f"{timestamp}  {level.upper():<7}  {message}\n"
            for widget in self.log_widgets:
                try:
                    widget.configure(state="normal")
                    start = widget.index("end-1c")
                    widget.insert("end", line)
                    widget.tag_add("time", start, f"{start}+9c")
                    widget.tag_add(level, f"{start}+9c", "end-1c")
                    widget.see("end")
                    widget.configure(state="disabled")
                except tk.TclError:
                    continue

        def _clear_logs(self) -> None:
            for widget in self.log_widgets:
                widget.configure(state="normal")
                widget.delete("1.0", "end")
                widget.configure(state="disabled")

        # -- background tasks ---------------------------------------------

        def _set_busy(self, value: bool) -> None:
            self.busy = value
            try:
                self.apply_button.configure(state="disabled" if value else "normal")
            except tk.TclError:
                pass
            if value:
                self.progress.start(12)
            else:
                self.progress.stop()

        def _run_task(self, task: Callable[[], None]) -> None:
            if self.busy:
                self.emit_log("warning", "Another operation is already running.")
                return
            self._set_busy(True)

            def worker() -> None:
                try:
                    task()
                except Exception as exc:  # noqa: BLE001 - show all errors to user
                    self.emit_log("error", f"{exc}")
                finally:
                    self.task_queue.put("done")

            threading.Thread(target=worker, daemon=True).start()

        def _initial_scan(self) -> None:
            self.emit_log("info", f"{APP_TITLE} v{APP_VERSION} ready.")
            self._refresh_versions()
            self._refresh_preview()
            if not is_windows():
                self.emit_log(
                    "warning",
                    "This preview is not running on Windows. Use the packaged app on Windows to find Roblox installations.",
                )

        def _refresh_versions(self) -> None:
            try:
                self.versions = self.core.discover_versions()
            except Exception as exc:  # noqa: BLE001
                self.emit_log("error", f"Version scan failed: {exc}")
                self.versions = []
            active = self.core.active_version(self.versions)
            self.known_version_paths.update(str(v.path) for v in self.versions)
            self.core.update_synced_versions(self.versions)

            self.version_count_var.set(f"{len(self.versions)} detected")
            self.active_version_var.set(active.name if active else "Not detected")
            if "Detected clients" in self.stat_labels:
                self.stat_labels["Detected clients"].configure(text=str(len(self.versions)))
            if hasattr(self, "client_status"):
                active_text = active.name if active else "none"
                self.client_status.configure(
                    text=(
                        f"Detected clients: {len(self.versions)}    •    Active: {active_text}    •    "
                        f"Shared profile: {self.core.shared_profile_path()}"
                    )
                )
            if hasattr(self, "version_tree"):
                self.version_tree.delete(*self.version_tree.get_children())
                for version in self.versions:
                    modified = dt.datetime.fromtimestamp(version.modified).strftime("%Y-%m-%d %H:%M")
                    self.version_tree.insert(
                        "",
                        "end",
                        iid=str(version.path),
                        values=(
                            str(version.path),
                            version.executable.name,
                            modified,
                            self.core.profile_summary(version.profile_path),
                        ),
                    )
                shared = self.core.shared_profile_path()
                self.version_tree.insert(
                    "",
                    "end",
                    iid=str(shared.parent),
                    values=(
                        str(shared),
                        "Shared profile",
                        "—",
                        self.core.profile_summary(shared),
                    ),
                )
            self.emit_log(
                "success" if self.versions else "warning",
                f"Scan complete: {len(self.versions)} Roblox player version(s) detected.",
            )

        def _watch_versions(self) -> None:
            try:
                if self.watch_var.get() and not self.busy:
                    fresh = self.core.discover_versions()
                    new = [v for v in fresh if str(v.path) not in self.known_version_paths]
                    if new:
                        settings = dataclasses.replace(
                            self._collect_settings(),
                            target_scope="All detected versions + shared profile",
                            shared_profile=False,
                            launch_after_apply=False,
                        )
                        profile_paths = [v.profile_path for v in new]
                        self.core.apply(
                            settings,
                            launch=False,
                            profile_paths=profile_paths,
                            update_settings=False,
                        )
                        self.emit_log(
                            "success",
                            f"Auto-synced the performance profile to {len(new)} new Roblox version(s).",
                        )
                        self._toast(f"Auto-synced {len(new)} new Roblox version(s).", "success")
                    self.known_version_paths.update(str(v.path) for v in fresh)
                    self.versions = fresh
                    self.core.update_synced_versions(fresh)
            except Exception as exc:  # noqa: BLE001
                self.emit_log("warning", f"Auto-sync skipped: {exc}")
            finally:
                self.after(6000, self._watch_versions)

        def _apply_async(self, launch_override: bool | None = None) -> None:
            settings = self._collect_settings()
            if settings.fps_target >= FPS_MAX and settings.legacy_fps_flag:
                proceed = messagebox.askyesno(
                    "High FPS target",
                    (
                        f"{FPS_MAX} is an uncapped ceiling, not {FPS_MAX} real frames per second.\n\n"
                        f"Roblox's supported Maximum Framerate setting tops out at {MAX_NATIVE_FPS} FPS, "
                        "and very high targets can cause instability on some systems.\n\n"
                        "Continue anyway?"
                    ),
                    parent=self,
                )
                if not proceed:
                    return
            self.core.save_settings(settings)
            self.stat_labels["Active profile"].configure(text=settings.preset)

            def task() -> None:
                result = self.core.apply(
                    settings,
                    launch=settings.launch_after_apply if launch_override is None else launch_override,
                )
                self.emit_log(
                    "success",
                    f"Applied {len(result.flags)} managed flags to {len(result.profile_paths)} profile location(s).",
                )
                self.emit_log("info", "Restart Roblox if it was already open. Settings are read at launch.")
                self.ui_queue.put(lambda: self._toast("Optimizations applied. Restart Roblox if needed.", "success"))
                self.ui_queue.put(self._refresh_versions)
                self.ui_queue.put(self._refresh_preview)

            self._run_task(task)

        def _sync_now(self) -> None:
            settings = dataclasses.replace(
                self._collect_settings(),
                target_scope="All detected versions + shared profile",
                launch_after_apply=False,
            )

            def task() -> None:
                result = self.core.apply(settings, launch=False)
                self.emit_log(
                    "success",
                    f"Synced {len(result.flags)} flags to {len(result.profile_paths)} location(s).",
                )
                self.ui_queue.put(lambda: self._toast("All Roblox versions synced.", "success"))
                self.ui_queue.put(self._refresh_versions)

            self._run_task(task)

        def _restore_async(self) -> None:
            if not messagebox.askyesno(
                "Restore stock settings",
                (
                    "Remove only the FastFlags managed by this app from every location it changed?\n\n"
                    "Unrelated flags in those files are preserved, and backups are kept."
                ),
                parent=self,
            ):
                return

            def task() -> None:
                count = self.core.restore()
                self.emit_log("success", f"Restored {count} profile location(s) to their previous state.")
                self.ui_queue.put(lambda: self._toast("Stock settings restored.", "success"))
                self.ui_queue.put(self._refresh_versions)

            self._run_task(task)

        def _apply_selected(self) -> None:
            selected = self.version_tree.selection() if hasattr(self, "version_tree") else ()
            if not selected:
                messagebox.showinfo("No selection", "Select one or more rows in the versions table first.", parent=self)
                return
            settings = dataclasses.replace(
                self._collect_settings(),
                launch_after_apply=False,
            )
            paths: list[Path] = []
            for iid in selected:
                path = Path(iid)
                if path.name == "ClientSettings" or str(path).endswith("ClientSettings"):
                    paths.append(path / CLIENT_SETTINGS_FILE)
                else:
                    paths.append(path / "ClientSettings" / CLIENT_SETTINGS_FILE)

            def task() -> None:
                result = self.core.apply(settings, launch=False, profile_paths=paths, update_settings=False)
                self.emit_log("success", f"Applied profile to {len(result.profile_paths)} selected location(s).")
                self.ui_queue.put(lambda: self._toast("Selected versions updated.", "success"))
                self.ui_queue.put(self._refresh_versions)

            self._run_task(task)

        def _browse_custom_root(self) -> None:
            folder = filedialog.askdirectory(
                title="Select a Roblox version folder",
                mustexist=True,
                parent=self,
            )
            if not folder:
                return
            self.custom_root_var.set(folder)
            self.scope_var.set("Custom version folder")
            self.core.set_custom_root(folder)
            self.emit_log("info", f"Custom Roblox folder selected: {folder}")
            self._refresh_versions()

        def _open_selected_folder(self) -> None:
            selected = self.version_tree.selection() if hasattr(self, "version_tree") else ()
            if not selected:
                messagebox.showinfo("No selection", "Select a row first.", parent=self)
                return
            path = Path(selected[0])
            if path.name == "ClientSettings":
                path = path.parent
            if not path.exists():
                self.emit_log("error", f"Folder no longer exists: {path}")
                return
            try:
                if is_windows():
                    os.startfile(str(path))  # type: ignore[attr-defined]
                else:
                    webbrowser.open(path.as_uri())
            except Exception as exc:  # noqa: BLE001
                self.emit_log("error", f"Could not open folder: {exc}")

        # -- preview / export ---------------------------------------------

        def _schedule_preview(self) -> None:
            if self._preview_job:
                try:
                    self.after_cancel(self._preview_job)
                except tk.TclError:
                    pass
            self._preview_job = self.after(120, self._refresh_preview)

        def _refresh_preview(self) -> None:
            self._preview_job = None
            settings = self._collect_settings()
            preview = self.core.preview(settings)
            flags = json.loads(preview)
            if hasattr(self, "json_text"):
                self.json_text.configure(state="normal")
                self.json_text.delete("1.0", "end")
                self.json_text.insert("1.0", preview)
                self._colorize_json(self.json_text)
                self.json_text.configure(state="disabled")
            self.flag_count_var.set(f"{len(flags)} managed flags")
            if "Managed flags" in self.stat_labels:
                self.stat_labels["Managed flags"].configure(text=str(len(flags)))
            if hasattr(self, "json_notes"):
                notes = self.core.compatibility_notes(settings)
                self.json_notes.configure(
                    text="\n".join(f"• {note}" for note in notes)
                    or "• No compatibility warnings for the current selection."
                )

        @staticmethod
        def _colorize_json(widget: ScrolledText) -> None:
            widget.tag_configure("key", foreground=ACCENT_2)
            widget.tag_configure("value", foreground=SUCCESS)
            widget.tag_configure("legacy", foreground=WARNING)
            end_line = int(widget.index("end-1c").split(".")[0])
            for line_no in range(1, end_line + 1):
                start = f"{line_no}.0"
                end = f"{line_no}.end"
                text = widget.get(start, end)
                if '":' in text:
                    colon = text.index('":') + 1
                    widget.tag_add("key", start, f"{line_no}.{colon}")
                    widget.tag_add("value", f"{line_no}.{colon + 1}", end)
                if LEGACY_FPS_FLAG in text:
                    widget.tag_add("legacy", start, end)

        def _copy_json(self) -> None:
            self.clipboard_clear()
            self.clipboard_append(self.json_text.get("1.0", "end-1c"))
            self.emit_log("success", "JSON copied to the clipboard.")

        def _download_json(self) -> None:
            path = filedialog.asksaveasfilename(
                title="Save ClientAppSettings.json",
                defaultextension=".json",
                initialfile=CLIENT_SETTINGS_FILE,
                filetypes=(("JSON files", "*.json"), ("All files", "*.*")),
                parent=self,
            )
            if not path:
                return
            Path(path).write_text(self.json_text.get("1.0", "end-1c") + "\n", encoding="utf-8")
            self.emit_log("success", f"JSON saved to {path}")

        def _save_log(self) -> None:
            path = filedialog.asksaveasfilename(
                title="Save activity log",
                defaultextension=".txt",
                initialfile="roblox-optimizer-log.txt",
                filetypes=(("Text files", "*.txt"), ("All files", "*.*")),
                parent=self,
            )
            if not path:
                return
            Path(path).write_text(self.full_log.get("1.0", "end-1c") + "\n", encoding="utf-8")
            self.emit_log("success", f"Log saved to {path}")

        # -- lifecycle -----------------------------------------------------

        def _on_close(self) -> None:
            try:
                self.core.save_settings(self._collect_settings())
            except Exception:
                pass
            self.destroy()


else:  # pragma: no cover - used only when Tkinter is unavailable

    class OptimizerApp:  # type: ignore[no-redef]
        def __init__(self, *_args: Any, **_kwargs: Any) -> None:
            raise RuntimeError(
                "Tkinter is not available. Install a Python build that includes Tkinter, "
                "or use --self-test / --preview."
            )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="roblox_fps_optimizer.py",
        description=f"{APP_TITLE} — safe, reversible Roblox performance settings.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {APP_VERSION}")
    parser.add_argument("--self-test", action="store_true", help="run headless core tests and exit")
    parser.add_argument("--preview", action="store_true", help="print the generated FastFlag JSON and exit")
    parser.add_argument("--apply", action="store_true", help="apply saved settings without opening the GUI")
    parser.add_argument("--restore", action="store_true", help="restore managed settings and exit")
    parser.add_argument(
        "--session",
        action="store_true",
        help="print a safe OS-level Roblox session snapshot as JSON and exit",
    )
    parser.add_argument("--no-gui", action="store_true", help="use console mode with --apply/--restore")
    parser.add_argument("--fps", type=int, help=f"set FPS target ({FPS_MIN}-{FPS_MAX})")
    parser.add_argument("--all-versions", action="store_true", help="apply to every detected version")
    parser.add_argument("--no-launch", action="store_true", help="do not launch Roblox when applying")
    parser.add_argument("--mode", choices=[name for name in OPTIMIZATION_MODES if name != "Custom"], help="apply a safe optimization mode")
    parser.add_argument("--auto-mode", action="store_true", help="auto-select a mode from local CPU/RAM hints")
    parser.add_argument("--graphics-tier", type=int, help=f"set extended graphics tier {GRAPHICS_TIER_MIN}-{GRAPHICS_TIER_MAX}")
    parser.add_argument("--texture-tier", type=int, help=f"set texture tier {TEXTURE_TIER_MIN}-{TEXTURE_TIER_MAX}")
    parser.add_argument("--features", action="store_true", help="print the shared feature status catalog and exit")
    parser.add_argument("--tiers", action="store_true", help="print graphics and texture tier information and exit")
    parser.add_argument("--modes", action="store_true", help="print optimization modes and exit")
    parser.add_argument("--build-info", action="store_true", help="print build and safety information and exit")
    parser.add_argument("--cache-report", action="store_true", help="report old log/temp cache files and exit")
    parser.add_argument("--cache-clean", action="store_true", help="quarantine old log/temp cache files (dry run without --cache-force)")
    parser.add_argument("--cache-days", type=int, default=7, help="minimum age in days for cache cleanup (1-90)")
    parser.add_argument("--cache-force", action="store_true", help="actually quarantine files with --cache-clean")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_arg_parser().parse_args(argv)
    if args.self_test:
        return run_self_test()
    if args.features:
        print(json.dumps(load_feature_status(), indent=2, ensure_ascii=False))
        return 0
    if args.tiers:
        print(json.dumps({
            "graphics": [{"value": i, "label": graphics_tier_label(i), "flag": "DFIntDebugFRMQualityLevelOverride"} for i in range(GRAPHICS_TIER_MIN, GRAPHICS_TIER_MAX + 1)],
            "texture": [{"value": i, "label": texture_tier_label(i), "flag": "DFIntTextureQualityOverride"} for i in range(TEXTURE_TIER_MIN, TEXTURE_TIER_MAX + 1)],
            "note": "Values above 10 are legacy/micro levels; Roblox may change or ignore them."
        }, indent=2, ensure_ascii=False))
        return 0
    if args.modes:
        print(json.dumps({name: info for name, info in OPTIMIZATION_MODES.items()}, indent=2, ensure_ascii=False))
        return 0
    if args.build_info:
        print(json.dumps({
            "product": "Roptimer Hub V3.1",
            "pythonApp": APP_VERSION,
            "dotnetApp": "3.0.0",
            "platform": "Windows 10+ / macOS 11+ (Python companion) / .NET 8",
            "safety": {"injection": False, "memoryReads": False, "telemetryDisable": False, "antiCheatBypass": False, "gameScriptExecution": False}
        }, indent=2, ensure_ascii=False))
        return 0
    if args.cache_report or args.cache_clean:
        cleaner = SafeCacheCleaner()
        payload = cleaner.clean(args.cache_days, force=args.cache_force) if args.cache_clean else cleaner.report(args.cache_days)
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0

    core = OptimizerCore(logger=default_logger)
    settings = core.settings
    if args.mode:
        SafeOptimizationEngine.apply_mode(settings, args.mode)
    if args.auto_mode:
        profile = SystemProfile.detect()
        chosen = SafeOptimizationEngine.choose_mode(profile)
        SafeOptimizationEngine.apply_mode(settings, chosen)
        default_logger("info", f"Auto-selected {chosen} for {profile.tier} hardware.")
    if args.fps is not None:
        settings.fps_target = max(FPS_MIN, min(FPS_MAX, int(args.fps)))
    if args.graphics_tier is not None:
        settings.graphics_tier = args.graphics_tier
        settings.graphics_quality = graphics_tier_label(args.graphics_tier)
    if args.texture_tier is not None:
        settings.texture_tier = args.texture_tier
        settings.texture_quality = texture_tier_label(args.texture_tier)
    if args.all_versions:
        settings.target_scope = "All detected versions + shared profile"
    if args.no_launch:
        settings.launch_after_apply = False
    settings.normalize_in_place()

    if args.session:
        detector = SessionDetector()
        try:
            versions = core.discover_versions()
            running = core.running_player_paths()
        except Exception as exc:  # noqa: BLE001
            default_logger("warning", f"Session discovery limited: {exc}")
            versions = []
            running = []
        snapshot = detector.snapshot(
            roblox_username=settings.roblox_username,
            installed_versions=len(versions),
            running_paths=running,
        )
        payload = dataclasses.asdict(snapshot)
        payload["safety"] = {
            "injection": False,
            "memoryReads": False,
            "accountDataExtraction": False,
            "fullbright": False,
            "antiCheatBypass": False,
        }
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0

    if args.preview:
        print(core.preview(settings), end="")
        return 0

    if args.restore:
        count = core.restore()
        default_logger("success", f"Restored {count} profile location(s).")
        return 0

    if args.apply:
        result = core.apply(settings, launch=settings.launch_after_apply and not args.no_launch)
        default_logger(
            "success",
            f"Applied {len(result.flags)} flags to {len(result.profile_paths)} profile(s).",
        )
        for path in result.profile_paths:
            print(f"  {path}")
        return 0

    if args.no_gui:
        print(core.preview(settings), end="")
        return 0

    if not HAS_TK:
        default_logger(
            "error",
            f"Tkinter is unavailable ({TK_IMPORT_ERROR}). Use a Python build with Tkinter, "
            "or try --self-test / --preview.",
        )
        return 1

    try:
        app = OptimizerApp(core, settings)
        app.mainloop()
    except tk.TclError as exc:  # pragma: no cover - no display available
        default_logger("error", f"Could not open the desktop window: {exc}")
        default_logger("info", "Use --preview or --apply for console mode.")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
