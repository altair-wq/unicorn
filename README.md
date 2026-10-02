# Unicorn Orbit

A side-scrolling browser game: gallop a rainbow-maned unicorn across an endless
chain of floating candy planets while other unicorns hop around with you.
Collect stars, chain them mid-air for combos, and reach each sector's rainbow
gate (+10 stars, +15 seconds) before the 90-second timer runs out.

Open `index.html` in a browser to play. There is no build step.

## Controls

| Key | Action |
| --- | --- |
| ← → / A D | Run (momentum builds up; turning around takes a moment) |
| Shift | Hold to sprint |
| Space / ↑ / W | Jump. Hold for full height, tap for a hop, press again mid-air to double jump |
| X / K | Dash, once per jump (also works on the ground) |
| ↓ / S | Ground pound. Press jump as you land for a super bounce (1.5× height) |
| P / Esc | Pause |
| M | Sound on/off |

On touch screens, on-screen ◀ ▼ ▶ DASH JUMP buttons appear. Holding ◀ or ▶
for half a second starts sprinting.

## Files

- `core.js`: physics, world generation and game rules (no DOM, runs in Node too)
- `game.js`: rendering, input, sound and screens
- `test/reachability.test.js`: a bot plays 40 random worlds with the real
  physics to check every gap can be cleared, plus jump-height checks

```sh
node test/reachability.test.js
```
