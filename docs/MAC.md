# Roptimer for macOS

The macOS edition is a **safe Python/Tkinter companion**. It is not the Windows WPF `.exe` and it is not a signed native Roblox client. It writes the same reversible local `ClientAppSettings.json` settings used by the Windows app.

---

## Requirements

- macOS 11 or newer.
- Python 3.10 or newer with Tkinter. The official installer from python.org includes Tkinter.
- Roblox desktop app installed at `/Applications/Roblox.app`.
- Optional: `psutil` for OS-level running-client detection.

Check Python:

```bash
python3 --version
python3 -c "import tkinter; print('Tkinter OK')"
```

---

## Install

1. Download `Roptimer-Mac.zip` for the packaged app build, or `Roptimer-Mac-Companion.zip` for the portable Python package.
2. Extract it somewhere you can write to, such as `~/Applications` or `~/Downloads`.
3. Because the package is unsigned, right-click the app or `.command` file and choose **Open** the first time.
4. If Terminal blocks execution, run:

   ```bash
   chmod +x "Roptimer Mac.command" "Roptimer HUD.command" "Roptimer Boost.command"
   ```

---

## Launchers

| File | Purpose |
| --- | --- |
| `Roptimer Mac.app` | Opens the desktop optimizer in Terminal. |
| `Roptimer Mac.command` | Direct double-click optimizer launcher. |
| `Roptimer HUD.command` | Opens the optional always-on-top HUD. |
| `Roptimer Boost.command` | Runs the safe CLI controller. |

CLI examples:

```bash
./Roptimer\ Boost.command --preview
./Roptimer\ Boost.command --apply --mode "Reduce building lag" --graphics-tier 21 --texture-tier 0 --all-versions --no-launch
./Roptimer\ Boost.command --restore
./Roptimer\ Boost.command --self-test
```

---

## Settings location

Roptimer targets:

```text
/Applications/Roblox.app/Contents/MacOS/ClientSettings/ClientAppSettings.json
```

If macOS denies access, create the folder yourself and make it writable by your user:

```bash
sudo mkdir -p "/Applications/Roblox.app/Contents/MacOS/ClientSettings"
sudo chown "$USER" "/Applications/Roblox.app/Contents/MacOS/ClientSettings"
```

Do **not** modify `RobloxPlayer` or other executable files. Roptimer only needs the `ClientSettings` folder.

Roblox updates may replace or remove this folder. If your settings disappear after an update, re-run `apply`. Changing files inside an app bundle can affect its code signature; Roptimer never patches the executable, and normal `ClientSettings` JSON files are the only supported target.

---

## Restore

```bash
./Roptimer\ Boost.command --restore
```

If you used a custom folder, open the desktop app and choose the same custom folder before restoring, or keep the `state.json` file created by Roptimer.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| “No Roblox player version was found” | Open Roblox once, then use the custom folder button and select `/Applications/Roblox.app/Contents/MacOS`. |
| “Permission denied” | Create and own the `ClientSettings` folder as shown above, or grant Terminal/Python Full Disk Access. |
| “Tkinter is unavailable” | Install Python from python.org instead of a minimal Homebrew Python. |
| Settings vanish after an update | Re-run `apply`; Roblox may replace the app-bundle `ClientSettings` folder. |
| App is blocked by Gatekeeper | Right-click → Open, or allow the unsigned local package in System Settings → Privacy & Security. |

---

## Safety

The macOS companion uses the same allowlisted flags and backup/restore logic as the Windows app. It does not inject code, read Roblox memory, disable diagnostics, or execute scripts inside games.
