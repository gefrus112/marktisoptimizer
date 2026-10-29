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
  renderer, no remote navigation, and a narrow IPC command allowlist. Its
  permission handlers allow only notification requests from the trusted local
  UI; other browser permissions are denied.
- The renderer blocks remote HTTP(S)/WebSocket content. The backend can make one
  fixed TCP handshake to `www.roblox.com:443` only after the user presses the
  latency button; it sends no HTTP/TLS payload and is a website connection-time
  estimate, not Roblox game-server ping. The endpoint can see the normal network
  connection. There is no updater, analytics, or telemetry.
- Anime desktop backgrounds are bundled locally; ten of the requested forty
  images are included so far, with theme selections saved on-device.
- Local hardware inventory uses a fixed, read-only PowerShell/WMI query for the
  device model, CPU, RAM, graphics adapters, and drives. Results stay in the
  app; serial numbers are not collected or saved. The System page can open the
  fixed Windows Advanced Graphics settings page, but does not change GPU
  preferences, HAGS, or driver settings. Process checks inspect only exact
  image-name fields for Xeno, Solara, JJSploit, and Delta; they do not retain
  PIDs or read paths, command lines, memory, or game data. The Security tab opens
  Windows Security, where users can choose a Defender Quick, Full, or Custom scan
  and review Protection history. Defender performs file scanning and controls
  quarantine/remediation according to Windows settings; the app does not read
  file contents, delete threats, or provide a custom antivirus engine. Real-time
  and cloud protection, ransomware controls, web/phishing protection (SmartScreen),
  firewall, and updates are Windows-managed; verify their status there. The VPN
  tab integrates the official WireGuard for Windows client with a user/provider-supplied
  `.conf` profile. It encrypts the local profile with machine-scope DPAPI; importing,
  connecting, disconnecting, or removing a tunnel requires explicit confirmation
  and Windows administrator approval. The app supplies no VPN service, server,
  subscription, or credentials, and cannot guarantee a working tunnel or lower ping.
  The tunnel stays active when the app closes and may remain after uninstall;
  disconnect/remove it in the VPN tab first. It is set not to auto-start after a
  Windows restart. No custom password manager or dark-web-monitoring engine is included.
- On startup, a read-only storage advisory shows free/used/total capacity for
  fixed local drives. Drives under 10 GB free or 5% free are flagged; the user
  can continue or exit. It never scans or deletes files.
- The shared desktop UI includes a local notification center for Player-process
  changes, known process-name matches, settings apply/restore, and low storage.
  Notifications default off; preferences and history stay on-device. Optional
  desktop toasts are requested only when the user clicks the permission control
  and enables notifications. In-app alerts remain available if native Web
  Notifications are blocked or unsupported.
- The Main page's latest-version button opens the fixed official GitHub Releases
  page. Users download and install updates manually; the app has no self-updater.
- F5 Quick Status refreshes local Roblox installation and Player process status,
  Windows-reported hardware/storage inventory, and the local process-name check.
  The Player card also shows an approximate stopwatch since this app first
  observed `RobloxPlayerBeta.exe` running; it resets when no longer detected, a
  status check fails, or the app closes. This is not game/session time. The app
  does not read the experience thumbnail/ID, server, player count, exact session
  time, or account data. The before/after journal stores
  only user-entered FPS and ping values read from Roblox `Shift+F5`; these
  metrics are not measured or verified by the app.
- The Main page includes a Version Garden that lists detected Player/Studio
  folders, settings-file presence, and detected/expected paths without reading
  JSON values. Tuning Lab compares saved/staged profiles without writing files.
  The Benchmark Storyboard visualizes only the manual `Shift+F5` journal. The
  offline troubleshooting guide is bundled and makes no network requests.
- The Quick Action Tray is available in-app and in the Windows notification
  area. Tray shortcuts open the app, open the detected settings location, launch
  Roblox normally, or request a confirmed restore; choosing Quit exits the app.
  Closing the window hides it to the tray while the process remains running.
- The profile shortcut accepts a numeric Roblox User ID and opens the fixed
  official profile URL in the system browser. It does not log in, access cookies,
  fetch the profile, or scrape account data.
- Settings writes use the canonical 18-key FastFlag allowlist by default in
  discovered Roblox `ClientAppSettings.json` files. An explicit, off-by-default
  experimental option separately requests the legacy
  `DFIntTaskSchedulerTargetFps` value (60–1000); it is not allowlisted and
  current Roblox clients may ignore or cap it. No FPS gain is guaranteed. The
  app preserves unrelated JSON keys, creates timestamped backups, and Restore
  removes managed keys, including the legacy FPS key. Actual in-game FPS and
  game-server ping are not read; use Roblox Performance Stats (`Shift+F5`).
- Normal launch dispatches the fixed `roblox://` URI through Windows Explorer.
  The optional same-server rejoin accepts only a positive numeric Place ID and
  UUID Job ID supplied by the user, then builds the standard
  `roblox://experiences/start` URI. It never reads a running game session; Roblox
  may reject a full, private, closed, or unavailable server. Neither action
  invokes a shell or accepts an arbitrary URL. Apply & launch asks for
  confirmation and launches only after a successful settings write.
- Settings files can be written while Roblox is open, but changes do not modify
  the live game and may not apply until a normal restart.
- It never injects into or terminates Roblox, changes process affinity, alters
  internal render resolution, optimizes Roblox traffic through relays, or executes
  game scripts. The separate WireGuard tunnel follows only the routes/DNS in the
  user-supplied profile and may carry all internet traffic; it is not a ping
  optimizer. The app also does not silently delete cache/log/temp files, write
  fullscreen or CPU-priority registry tweaks, clear standby memory, force restore
  points, change DNS/MTU outside the imported VPN profile, or replace Roblox
  assets or audio. See the [safe feature roadmap](../docs/ROADMAP.md) for scoped
  next steps and features intentionally left out.

The Electron backend is covered by `npm test`; the Windows installer itself is
built by `.github/workflows/build-electron.yml` on a Windows runner.
