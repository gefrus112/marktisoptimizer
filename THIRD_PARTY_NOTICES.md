# Third-party notices (root / website / Rust client)

Roptimer's website, Rust + Tauri client, .NET app, and Python tools are original
implementations. The GitHub Pages website bundles one third-party library,
vendored locally so nothing is fetched from a CDN at runtime. The standalone
Tauri desktop UI does not bundle that library.

## three.js (MIT License)

- Version: **0.169.0**
- Home: <https://threejs.org/>
- Source: <https://github.com/mrdoob/three.js>
- License: MIT — see [`web/assets/vendor/three/LICENSE.txt`](web/assets/vendor/three/LICENSE.txt)
  and [`web/assets/vendor/three/VERSION.txt`](web/assets/vendor/three/VERSION.txt).

Vendored files under `web/assets/vendor/three/`:

- `three.module.min.js` — the ESM core build.
- `addons/postprocessing/*` — EffectComposer, RenderPass, UnrealBloomPass,
  ShaderPass, MaskPass, OutputPass, Pass.
- `addons/shaders/*` — CopyShader, LuminosityHighPassShader, OutputShader.

The only modification applied to the vendored addon sources is replacing the
bare `from 'three'` import specifier with a relative path to the local
`three.module.min.js` (e.g. `../../three.module.min.js`). This lets the module
graph load on static hosts such as GitHub Pages without an import map or
network access. No library logic was changed.

The MIT license requires that the copyright notice and permission notice be
included in all copies or substantial portions of the software. The full text
is preserved verbatim in `web/assets/vendor/three/LICENSE.txt` and is shipped
with the website and source packages. The standalone Tauri frontend does not
bundle Three.js.

## Other references (not bundled)

- Roblox FastFlag allowlist — <https://devforum.roblox.com/t/allowlist-for-local-client-configuration-via-fast-flags/3966569>
- Bubblestrap / Bloxstrap (WPF layout inspiration only) — see
  [`dotnet/THIRD_PARTY_NOTICES.md`](dotnet/THIRD_PARTY_NOTICES.md). No source,
  assets, or icons are copied from those projects.
- Tauri (<https://tauri.app/>) and its Rust crates are build-time dependencies
  of the desktop client, distributed under their own licenses via crates.io.
