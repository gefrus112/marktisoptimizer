#!/bin/bash
# Launcher inside Roptimer Mac.app/Contents/MacOS/Roptimer.
# Opens the portable optimizer in Terminal instead of trying to be a native GUI.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
COMMAND="$ROOT/Roptimer Mac.command"

if [ -f "$COMMAND" ]; then
  open -a Terminal "$COMMAND"
else
  osascript -e 'tell application "Terminal" to do script "echo \"Roptimer launcher not found. Extract the full ZIP package.\""'
fi
