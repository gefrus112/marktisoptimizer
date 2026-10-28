# Third-party notices (root / website / Rust client)

Roptimer's website, Rust + Tauri client, .NET app, and Python tools are original
implementations. The GitHub Pages website uses local CSS, JavaScript, SVG, and
image assets; it does not bundle Three.js or another third-party rendering
engine, and it makes no CDN/runtime-library requests. The standalone Tauri UI
is independently sourced and does not bundle the website assets.

## Other references (not bundled)

- Roblox FastFlag allowlist — <https://devforum.roblox.com/t/allowlist-for-local-client-configuration-via-fast-flags/3966569>
- Bubblestrap / Bloxstrap (WPF layout inspiration only) — see
  [`dotnet/THIRD_PARTY_NOTICES.md`](dotnet/THIRD_PARTY_NOTICES.md). No source,
  assets, or icons are copied from those projects.
- Tauri (<https://tauri.app/>) and its Rust crates are build-time dependencies
  of the primary desktop client, distributed under their own licenses via crates.io.
- The optional Electron desktop build bundles the Electron runtime (Chromium and
  Node.js) and its third-party notices in the generated installer. Electron and
  its components remain under their respective licenses; `electron-builder` is
  a build-time packaging dependency from npm.
