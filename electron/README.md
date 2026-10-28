# Marktis Optimizer — Electron Windows client

Marktis Optimizer keeps its primary Rust + Tauri client. This optional Electron build is
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

The output is `electron/dist/Marktis-Optimizer-Electron-Setup-x64.exe`. It is an NSIS
wizard that lets the user choose an install folder, creates Start Menu and
Desktop shortcuts, registers a Windows uninstaller, and can launch the app when
setup finishes. The installer bundles Electron, Chromium, and Node for the app;
end users do not install a separate Node runtime or run a batch file. The
application can also be launched later from either shortcut. The GitHub Actions workflow uploads the
installer and SHA-256 file as a build artifact.

## Security and behavior

- Electron uses context isolation, sandboxing, no Node integration in the
  renderer, no remote navigation, and a narrow IPC command allowlist.
- The renderer blocks remote HTTP(S)/WebSocket content. The backend can make one
  fixed TCP handshake to `www.roblox.com:443` only after the user presses the
  latency button; it sends no HTTP/TLS payload and is a website connection-time
  estimate, not Roblox game-server ping. The endpoint can see the normal network
  connection. There is no updater, analytics, or telemetry.
- Anime desktop backgrounds are bundled locally; ten of the requested forty
  images are included so far, with theme selections saved on-device.
- Local hardware inventory uses a fixed, read-only PowerShell/WMI query for the
  device model, CPU, RAM, graphics adapters, and drives. Results stay in the app;
  serial numbers are not collected or saved. The System page can open the fixed
  Windows Advanced Graphics settings page, but does not change GPU preferences,
  HAGS, or driver settings. Process checks inspect only exact
  image-name fields for Xeno, Solara, JJSploit, and Delta; they do not retain
  PIDs or read paths, command lines, memory, or game data.
- Settings writes use the canonical 18-key FastFlag allowlist by default in
  discovered Roblox `ClientAppSettings.json` files. An explicit, off-by-default
  experimental option separately requests the legacy
  `DFIntTaskSchedulerTargetFps` value (60–1000); it is not allowlisted and
  current Roblox clients may ignore or cap it. No FPS gain is guaranteed. The
  app preserves unrelated JSON keys, creates timestamped backups, and Restore
  removes managed keys, including the legacy FPS key. Actual in-game FPS and
  game-server ping are not read; use Roblox Performance Stats (`Shift+F5`).
- The launcher dispatches only the fixed `roblox://` URI through Windows
  Explorer, without a shell or user-provided URL. Apply & launch asks for
  confirmation and launches only after a successful settings write.
- It never injects into or terminates Roblox, changes process affinity, alters
  internal render resolution, reroutes traffic, or executes game scripts. It
  also does not silently delete cache/log/temp files, write fullscreen or CPU
  priority registry tweaks, clear standby memory, force restore points, change
  DNS/MTU, or replace Roblox assets or audio.

The Electron backend is covered by `npm test`; the Windows installer itself is
built by `.github/workflows/build-electron.yml` on a Windows runner.
