# Roptimer V3.1 — macOS companion

This release adds macOS downloads, Sirius-style dark website tabs, CLI/how-it-works documentation, and the safe Roptimer Script Hub preview.

## Assets

- `Roptimer-Mac.zip` — packaged macOS app build from GitHub Actions, when available.
- `Roptimer-Mac-Companion.zip` — portable Python/Tkinter companion with `.command` launchers.
- `Roptimer-Mac.zip.sha256` — checksum for the packaged app build.
- `Roptimer-Mac-Companion.zip.sha256` — checksum for the portable package.
- `Roptimer-CLI-Docs.md` — Boost CLI reference.
- `Roptimer-Mac-README.md` — macOS setup and troubleshooting.

## Notes

- The macOS app is unsigned. Right-click → Open on first launch.
- Python 3.10+ with Tkinter is required for the portable companion.
- Roptimer writes only local `ClientAppSettings.json` settings and keeps backups.
- No DLL injection, memory edits, Roblox telemetry disabling, anti-cheat bypass, or game script execution.
- Existing Windows EXEs remain on the `v3.0.0-windows` release.
