#!/bin/bash
# Roptimer V3.1 safe macOS CLI/bootstrapper.
set -u
cd "$(dirname "$0")" || exit 1

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3 was not found. Install Python 3.10+ from python.org."
  read -r -p "Press Return to close..." _
  exit 1
fi

if [ "$#" -eq 0 ]; then
  exec python3 roblox_fps_optimizer.py --help
fi

exec python3 roblox_fps_optimizer.py "$@"
