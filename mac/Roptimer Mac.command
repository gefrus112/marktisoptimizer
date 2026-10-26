#!/bin/bash
# Roptimer V3.1 macOS desktop optimizer launcher.
set -u
cd "$(dirname "$0")" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 was not found. Install Python 3.10+ from python.org."
  read -r -p "Press Return to close..." _
  exit 1
fi

if ! python3 -c "import tkinter" >/dev/null 2>&1; then
  echo "Tkinter is unavailable. Install the official Python 3.10+ build from python.org."
  read -r -p "Press Return to close..." _
  exit 1
fi

exec python3 roblox_fps_optimizer.py
