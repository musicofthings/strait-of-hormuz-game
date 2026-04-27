# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running locally

Browsers block local file access for GLB model loading, so a local server is required:

```bash
python3 -m http.server 8080
# or
npx serve .
```

Open `http://localhost:8080`. The `strait-command/` subdirectory is a self-contained alternate build and must be served from its own root (e.g. `python3 -m http.server 8080` from inside `strait-command/`).

There are no build steps, package.json, or test suite — this is a zero-dependency browser game.

## Architecture

Two parallel versions of the game exist:

| Path | Camera | Physics | Asset loading |
|------|--------|---------|---------------|
| `index.html` + `game.js` | Top-down (y=220) | None — pure math | Direct `GLTFLoader.load()`, `pendingLoads` counter |
| `strait-command/index.html` + `strait-command/game.js` | Angled (y=60, z=120) | cannon-es rigid bodies | `THREE.LoadingManager`, `loadingComplete` flag |

Both are single-file ES modules with no bundler. Three.js and GLTFLoader are loaded via `<script type="importmap">` pointing to unpkg CDN (`three@0.160.0`). cannon-es is loaded in `strait-command/game.js` via a direct CDN import.

### Game loop and phases

The root `game.js` uses a three-phase state machine: `"placement"` → `"loading"` → `"action"`. During placement, the player clicks the green entry zone (z 70–98, |x| < 39) to position up to 5 ships, then presses Enter to launch. The loading phase shows a spinner while GLB assets load; `pendingLoads` counts outstanding loads and calls `checkAllLoaded()` on each completion.

`strait-command/game.js` has no placement phase — ships spawn immediately and use cannon-es `CANNON.Body` for movement. The `loadingManager.onLoad` callback gates the game loop.

### Coordinate system

Ships travel **south → north** (z decreasing toward −z). The strait channel runs along the z-axis:
- Entry zone: high z (~+82 to +100)
- Exit/escape: z < −100 (root game) or z > 90 (strait-command, which has the opposite escape direction)
- Iran coastline: positive X side
- Oman/UAE coastline: negative X side

`coastXAtZ(coast, z)` linearly interpolates the coast edge arrays to place towers on the coastline at a given z depth.

### Key tuning variables (root `game.js`)

- `SHIP_SPEED = 11` — units/second
- `TURN_RATE = 1.8` — radians/second toward `targetPoint`
- Tower range: 75 units; tower cooldown: `max(55, 120 + rand*100 − level*8)` frames
- Win condition: `score >= 3` ships escaped per level

### Asset loading failure

Both versions silently fall back if GLB files are missing (the `loader.load` error callback just decrements `pendingLoads`). The loading screen will hide and gameplay continues without ship models. Assets live in `assets/` (root) and `strait-command/assets/` respectively and are not committed — see `assets/README.md` for sources.

## Active work context

Current branch: `fix/three-importmap-loading-screen` — fixing a loading screen issue caused by bare Three.js specifiers. The importmap in `index.html` resolves `"three"` and `"three/addons/"` to unpkg CDN URLs, which was the fix for the bare specifier problem.
