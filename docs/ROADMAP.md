# Safe feature roadmap

This is a proposal list, not a claim that the items below are implemented. The
project stays a local, reversible Roblox settings manager: no DLL injection,
process-memory access, anti-cheat bypass, or code execution inside Roblox. The
Windows desktop apps also include a user-controlled WireGuard integration that
requires a provider-supplied `.conf` and the official WireGuard client; it does
not supply VPN service or promise lower ping.

## Highest-value next features

1. **Roblox version-change notifications.** Watch or periodically rescan the
   standard version folders and tell the user when a new Player build appears.
   Offer a review/apply action for the new version; do not migrate or reapply
   settings silently in the background.
2. **Per-version profiles.** Let users assign saved local profiles to detected
   Player/Studio versions instead of only applying to the first or all detected
   settings files. Keep every write behind confirmation and a timestamped
   backup.
3. **Before/after settings preview and backup manager.** Show the exact JSON
   keys that will change, validate the file before writing, and let users
   inspect or restore a selected timestamped backup. Preserve unrelated keys.
4. **Portable profile import/export.** Use a versioned JSON format, validate
   imported keys against the canonical allowlist, and keep files on-device. Do
   not add cloud sync or telemetry by default.
5. **Guided performance troubleshooting.** Use the existing read-only device
   snapshot to suggest conservative settings and provide a checklist for
   Roblox's own Performance Stats (`Shift+F5`). If users enter FPS or ping
   manually, label it user-reported; never invent a live value or read game
   memory.
6. **Optional narrow cleanup, only if explicitly requested.** First show a
   dry-run list and sizes; restrict any future cleanup to recognized Roblox
   temporary files, require confirmation, and prefer the Recycle Bin. Never
   wipe all of `%TEMP%` or delete files automatically on game launch.

The System tab already includes a fixed shortcut to Windows Advanced Graphics
settings. It opens the Windows page only; GPU choice and Hardware-Accelerated
GPU Scheduling (HAGS) remain under Windows/driver control.

## Intentionally out of scope

- Injecting a DLL or adding an in-game overlay—even one described as “GUI only”—
  would cross the no-injection boundary. Actual game FPS and experience ping
  remain available in Roblox's own overlay (`Shift+F5`).
- High process priority, affinity changes, fullscreen-compatibility registry
  edits, RAM/standby-list cleaners, and forced system restore points are not
  needed for the app's reversible local JSON profile and can affect Windows
  stability or responsiveness.
- IP/region filtering, optimizer-controlled DNS/MTU/QoS changes, game-specific
  route optimization, and claims of lower game ping are not supported. The
  separate WireGuard tunnel follows only a user/provider-supplied profile; it is
  not an ExitLag-style relay. The optional TCP probe is only connection time to
  `www.roblox.com:443`, not game-server ping.
- Replacing Roblox textures, skyboxes, particles, or audio assets is outside the
  allowlisted settings boundary and is not planned.

Presets can reduce selected visual detail, but no feature can guarantee a
specific FPS, remove all stutter, or eliminate network latency.
