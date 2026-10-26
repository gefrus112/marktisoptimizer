#!/bin/bash
# Roptimer V3.1 macOS HUD launcher.
set -u
cd "$(dirname "$0")" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 was not found. Install Python 3.10+ from python.org."
  read -r -p "Press Return to close..." _
  exit 1
fi

exec python3 roptimer_hud.py --settings hud-settings.json
