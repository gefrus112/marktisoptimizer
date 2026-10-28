# Optional Electron Windows client

Roptimer keeps its primary Rust + Tauri client. This optional Electron build is
an alternative Windows shell for the same standalone desktop interface; it is
not the website and it does not require a `.bat` launcher.

## Local development

From the repository root, assemble the canonical desktop frontend and start the
Electron shell:

```powershell
python build_tauri_frontend.py
cd electron
npm ci
npm start
```

## Build the guided x64 installer

Run on Windows 10/11 x64 with Node.js 22 and Python 3.11 or newer:

```powershell
python build_tauri_frontend.py
cd electron
npm ci
npm run build:win
```

The output is `electron/dist/Roptimer-Electron-Setup-x64.exe`. It is an NSIS
wizard that lets the user choose an install folder, creates Start Menu and
Desktop shortcuts, registers a Windows uninstaller, and can launch the app when
setup finishes. The installer bundles Electron, Chromium, and Node for the app;
end users do not install a separate Node runtime or run a batch file. The
application can also be launched later from either shortcut. The GitHub Actions workflow uploads the
installer and SHA-256 file as a build artifact.

## Security and behavior

- Electron uses context isolation, sandboxing, no Node integration in the
  renderer, no remote navigation, and a narrow IPC command allowlist.
- Outbound HTTP(S)/WebSocket requests are blocked. There is no updater,
  analytics, telemetry, or network service.
- Local discovery checks standard Roblox install folders. Process checks inspect
  only exact image-name fields; they do not retain PIDs or read paths, command
  lines, memory, game data, or network data.
- Settings writes are limited to the canonical FastFlag allowlist in discovered
  Roblox `ClientAppSettings.json` files. The app preserves unrelated JSON keys,
  writes timestamped backups before changes, and can restore only managed keys.
- It never injects into or terminates Roblox, changes process affinity, alters
  internal render resolution, reroutes traffic, or executes game scripts.

The Electron backend is covered by `npm test`; the Windows installer itself is
built by `.github/workflows/build-electron.yml` on a Windows runner.
