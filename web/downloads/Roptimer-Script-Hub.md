# Roptimer Script Hub

The Script Hub is an **original, local UI scripting showcase** for Roptimer. It is inspired by the clean menu/loading-screen style of modern UI libraries, but it is **not a Roblox script executor**.

> Everything in this tab runs only inside the Roptimer website or a local desktop preview. No code is sent to a Roblox game, attached to a Roblox process, or loaded through an exploit API.

---

## What “Luau-inspired” means

The examples use a fictional `Roptimer.UI` API with Luau-like syntax. They are not Roblox engine scripts. They do not call `game`, `workspace`, `loadstring`, HTTP APIs, or executor functions. The website’s **Run preview** button maps each example to a hardcoded browser animation; it never evaluates user-supplied code.

Example shape:

```lua
-- Local preview only. Never sent to Roblox.
local ui = Roptimer.UI.new({
  title = "Roptimer",
  theme = "Sirius Dark"
})

ui:Loader({
  steps = {
    "Scan local settings",
    "Back up ClientAppSettings.json",
    "Preview managed flags",
    "Apply safe profile"
  }
})

ui:Show()
```

The real implementation behind the preview is plain HTML/CSS/JavaScript in `web/assets/sirius.js`.

---

## Included script cards

| Card | Local preview |
| --- | --- |
| Sirius Loading GUI | Animates a loading screen with backup/preview/apply steps. |
| Performance Preset | Shows a preset card for Better FPS, Reduce building lag, or Balanced. |
| Session Ready Toast | Shows a readiness notification in the mock desktop window. |
| Backup Status Panel | Shows a fake backup log and restore state in the local preview only. |

---

## Screenshots

The website includes seven SVG screenshots of:

- The new Sirius-style Download tab.
- The CLI Docs / How it works tab.
- The Roptimer Script Hub code editor.
- The local GUI Loading preview.
- The macOS companion window.
- The V3.2 command palette.
- The 100× animated starfield engine.

The command palette also includes actions for opening the Script Hub, restarting the local preview, copying Boost commands, and jumping to safety docs. These are design previews generated for this repository. They are not screenshots of a Roblox game.

---

## Boundaries

Roptimer Script Hub does **not** provide:

- A Roblox executor or exploit loader.
- `loadstring`, `hookfunction`, `getgenv`, or similar executor APIs.
- Remote script fetching into a game.
- Fullbright, x-ray, building removal, or anti-cheat bypass.
- Game memory reads/writes or account-data extraction.
- Automation, aim assistance, or gameplay advantages.

The goal is to give the project its own visual scripting identity for **local settings, GUI loading previews, and documentation only**.
