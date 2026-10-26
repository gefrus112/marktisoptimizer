# Roptimer Boost CLI

`RoptimerBoost.exe` on Windows and `Roptimer Boost.command` on macOS are **safe local settings controllers**. They do not inject a DLL, attach to Roblox, read memory, or execute scripts inside a Roblox game. They only preview, write, back up, and restore local `ClientAppSettings.json` files.

---

## Quick start

### Windows

Download `Roptimer-Windows-x64.zip` from the [Windows release](https://github.com/gefrus112/robloxclinetbooster/releases/tag/v3.0.0-windows), extract it, then open a terminal in that folder:

```powershell
RoptimerBoost.exe open
RoptimerBoost.exe bootstrap --launch
RoptimerBoost.exe preview --mode "Reduce building lag" --tier 21 --texture 0
RoptimerBoost.exe apply --mode "Better FPS" --fps 144 --all-versions
RoptimerBoost.exe restore
```

### macOS

Download `Roptimer-Mac-Companion.zip` or `Roptimer-Mac.zip` from the [macOS release](https://github.com/gefrus112/robloxclinetbooster/releases/tag/v3.1.0-mac), extract it, then run:

```bash
./Roptimer\ Boost.command --help
./Roptimer\ Boost.command --preview --mode "Reduce building lag" --tier 21 --texture 0
./Roptimer\ Boost.command --apply --mode "Better FPS" --fps 144 --all-versions
./Roptimer\ Boost.command --restore
```

If you use the portable Python package, the equivalent command is:

```bash
python3 roblox_fps_optimizer.py --preview --mode "Reduce building lag" --tier 21 --texture 0
```

---

## Commands

| Command | What it does |
| --- | --- |
| `open` | Opens the desktop GUI. Windows only for the `.exe` app. |
| `bootstrap --launch` | Applies a recommended safe profile, opens the app, then launches Roblox through its normal URL scheme. |
| `preview` | Prints the exact `ClientAppSettings.json` that would be written. No files are changed. |
| `apply` | Writes the generated flags to discovered Roblox settings locations, with timestamped backups. |
| `restore` | Restores the managed keys from the recorded pre-apply state, or removes an optimizer-only file. |
| `session` | Prints safe OS-level session metadata. No account, game, chat, or memory data is read. |
| `features` | Prints the shared implemented / legacy / rejected feature catalog. |
| `tiers` | Prints graphics tiers 0–21 and texture tiers 0–3. |
| `modes` | Prints the available optimization modes. |
| `cache-report --days 7` | Lists old log/temp files that could be quarantined. |
| `cache-clean --days 7 --force` | Quarantines old log/temp files. Without `--force`, it is a dry run. |
| `self-test` | Runs headless safety and core logic checks. |
| `build-info` | Prints product, platform, and safety metadata. |

---

## Performance options

```text
--mode "Better FPS"
--mode "Reduce building lag"
--mode "Balanced"
--mode "Maximum performance"
--mode "Visual quality"
--auto-mode
--fps 144
--graphics-tier 21
--texture-tier 0
--all-versions
--no-launch
```

- `--fps` writes the **legacy** `DFIntTaskSchedulerTargetFps` flag. Current allowlisted Roblox clients may ignore it. For a supported FPS cap, use Roblox Settings → Maximum Framerate.
- `--graphics-tier` accepts 0–21 through `DFIntDebugFRMQualityLevelOverride`. Values above 10 are legacy/micro levels and may be ignored.
- `--texture-tier` accepts 0–3. Lower values reduce texture work through `DFIntTextureQualityOverride`.
- `--all-versions` applies the profile to every discovered Roblox settings location, plus the shared profile where supported.
- `--no-launch` prevents the normal `roblox://` launch after applying.

### Recommended performance sequence

1. Preview first:

   ```text
   preview --mode "Reduce building lag" --tier 21 --texture 0
   ```

2. Apply without launching:

   ```text
   apply --mode "Reduce building lag" --tier 21 --texture 0 --all-versions --no-launch
   ```

3. Restart Roblox so it reads the local settings at launch.
4. Check Roblox’s built-in Performance Stats / Debug Stats.
5. If you dislike the result, run `restore`.

---

## Safety notes

- Only allowlisted rendering, geometry, UI, and texture keys are managed.
- Existing unrelated keys in `ClientAppSettings.json` are preserved.
- A timestamped backup is made before each write.
- No telemetry/Crashpad/Backtrace disabling flags are written.
- No fullbright, x-ray, building removal, anti-cheat bypass, or gameplay automation.
- The Script Hub is a **local UI preview** system. It does not execute scripts inside Roblox.

See also `HOW_IT_WORKS.md`, `MAC.md`, and `SCRIPT_HUB.md`.
