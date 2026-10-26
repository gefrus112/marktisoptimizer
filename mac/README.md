# macOS launcher sources

These files are copied into `web/downloads/Roptimer-Mac-Companion.zip` by `build_downloads.py`.

- `Roptimer Mac.command` — opens `roblox_fps_optimizer.py`.
- `Roptimer HUD.command` — opens `roptimer_hud.py`.
- `Roptimer Boost.command` — passes CLI arguments to `roblox_fps_optimizer.py`.
- `app-launcher.sh` — becomes `Roptimer Mac.app/Contents/MacOS/Roptimer`.
- `Info.plist` — minimal app-bundle metadata.

The generated package is unsigned. Users should right-click → Open on first launch. See `docs/MAC.md` for full instructions.
