# Session Handover
_Generated: 2026-04-27T14:10:00Z_
_Branch: fix/three-importmap-loading-screen_
_Triggered by: user request_

---

## 🎯 Active Task
**What we're building/fixing:**
This branch fixes a loading screen that was stuck indefinitely due to bare Three.js specifiers (`import * as THREE from "three"`) not resolving in the browser without a bundler. The fix uses a `<script type="importmap">` in `index.html` to map `"three"` and `"three/addons/"` to unpkg CDN URLs, allowing the ES module game script to load correctly.

**Phase:** Fix complete — context engineering housekeeping
**Progress:** 100% complete on the core fix (committed as `ee5ab46`); this session added `CLAUDE.md` and `session_handover.md` which are untracked.

---

## ✅ Completed This Session
- Created `CLAUDE.md` with architecture overview, coordinate system, two-version comparison, tuning constants, and asset loading behavior
- Ran `/context-health` — identified missing `CLAUDE.md` and empty `session_handover.md` as the two issues
- Populated this `session_handover.md`

---

## 🔄 In Progress (Exact Resume Point)
**File:** N/A — no code changes in progress
**What was happening:** Context engineering health check and housekeeping
**Next immediate action:** Commit `CLAUDE.md` and `session_handover.md`, then open a PR to merge `fix/three-importmap-loading-screen` into `main`

---

## 🚧 Blockers & Known Issues
- `scripts/session_sync.sh` and `scripts/generate_session_handover.py` referenced by CEK hooks do not exist in this project — session sync via scripts is unavailable; use `/handover` manually
- `state.json` shows `active_task: "unknown"` — stop hook isn't capturing task context; expected without structured task tracking

---

## 📋 Remaining Work
1. Commit `CLAUDE.md` and `session_handover.md`
2. Open PR: `fix/three-importmap-loading-screen` → `main`
3. Optional: clarify `strait-command/` deployment target (`_redirects` file suggests Netlify/Cloudflare Pages)

---

## 🏗 Architecture Decisions Made This Session
| Decision | Rationale | Date |
|----------|-----------|------|
| Two parallel game versions (root vs `strait-command/`) | Root = top-down + no physics; `strait-command/` = angled camera + cannon-es — kept separate for A/B iteration | prior sessions |
| importmap for Three.js | Avoids bundler for zero-dependency browser prototype; maps bare specifiers to unpkg CDN | commit ee5ab46 |

---

## 🔧 Commands to Resume
```bash
git pull origin fix/three-importmap-loading-screen

# Serve locally (required — browsers block local GLB loading)
python3 -m http.server 8080
# open http://localhost:8080

# Commit housekeeping files
git add CLAUDE.md session_handover.md
git commit -m "Add CLAUDE.md and session handover"
```

---

## 📁 Key Files Modified
| File | What changed |
|------|--------------|
| `index.html` | Added `<script type="importmap">` mapping `three` → unpkg CDN (fix for bare specifier loading screen bug) |
| `game.js` | Redesigned as Strait of Hormuz tower-defense with placement phase, coastline geometry, top-down camera |
| `strait-command/game.js` | Alternate version with cannon-es physics, `THREE.LoadingManager`, angled camera |
| `CLAUDE.md` | Created this session — architecture overview for future Claude instances |

---

## ⚠️ Critical Rules for This Project
- Always serve via a local HTTP server — `file://` protocol breaks GLB loading
- No build step: edits to `game.js` or `index.html` take effect immediately on browser refresh
- `strait-command/` is a self-contained copy; changes to root files do not affect it and vice versa
- Assets (`ship.glb`, `Island.glb`) are not committed — see `assets/README.md` for sources

---
_Read this file at the start of every session. Update it with /handover before compacting._
