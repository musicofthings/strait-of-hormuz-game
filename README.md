# Strait Command (Browser Prototype)

Strait Command is a lightweight 3D browser game prototype built with **Three.js** and **cannon-es**. You steer a convoy through hostile waters while towers fire missiles and you launch interceptors to protect your ships.

## Features

- Real-time 3D scene with dynamic ocean animation
- GLTF/GLB asset loading for ships and islands
- Basic rigid-body simulation with cannon-es
- Click-to-steer convoy routing
- Spacebar interceptor firing
- Mission success/failure loop with level scaling

## Controls

- **Mouse click**: Set convoy lane target on the ocean
- **Space**: Fire interceptors from all alive ships
- **R**: Restart mission

## Project Structure

```text
/
├── index.html
├── style.css
├── game.js
└── assets/
    ├── ship.glb
    ├── island.glb
    └── README.md
```

## Run Locally

Because browsers block local file access for model loading, run via a local web server:

### Option A: Python

```bash
python3 -m http.server 8080
```

Then open: <http://localhost:8080>

### Option B: Node (serve)

```bash
npx serve .
```

## Asset Setup

This project expects the following files in `/assets`:

- `ship.glb`
- `island.glb`

See [`assets/README.md`](assets/README.md) for recommended public asset sources and naming instructions.

## Gameplay Objective

- Escort ships from the spawn corridor to extraction (`z > 90`)
- Prevent tower missiles from destroying your convoy
- Reach mission threshold to trigger level progression

## Notes

- Prototype balance, visuals, and AI are intentionally simple and designed for rapid iteration.
- If models appear too large/small, tune scales in `game.js` (`loadShip` and `loadIsland`).
