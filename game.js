import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// === SCENE ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88b8cc);
scene.fog = new THREE.Fog(0x88b8cc, 280, 700);

// CAMERA — top-down over the strait
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 220, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);

// RENDERER
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// LIGHTING
const sun = new THREE.DirectionalLight(0xffe8c0, 2.5);
sun.position.set(100, 200, -80);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xfff0d0, 0.55));

// === OCEAN ===
const oceanGeo = new THREE.PlaneGeometry(900, 600, 160, 80);
const oceanMat = new THREE.MeshPhongMaterial({
  color: 0x0d5e80,
  shininess: 50,
  transparent: true,
  opacity: 0.85,
});
const ocean = new THREE.Mesh(oceanGeo, oceanMat);
ocean.rotation.x = -Math.PI / 2;
scene.add(ocean);

function animateOcean(t) {
  const pos = ocean.geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    pos.setZ(i, Math.sin(x * 0.04 + t) * 0.5 + Math.cos(y * 0.04 + t * 0.65) * 0.35);
  }
  pos.needsUpdate = true;
  ocean.geometry.computeVertexNormals();
}

// === STRAIT OF HORMUZ COASTLINES ===
// Coordinates: [worldX, worldZ]
// Ships travel south→north (z: +100 → -100), exiting at z < -100
// Iran coast on right (+X), Oman/UAE on left (-X)

const IRAN_COAST = [
  [60, -140], [57, -110], [53, -85], [49, -65],
  [44, -40], [40, -18], [38,  4], [37, 22],
  [39, 42],  [43, 62],  [47, 82], [51, 105],
  [55, 125], [59, 145],
];

const OMAN_COAST = [
  [-66, -140], [-63, -110], [-59, -85], [-55, -65],
  [-51, -40], [-48, -18], [-46,  4], [-45, 22],
  [-47, 42],  [-50, 62],  [-54, 82], [-58, 105],
  [-62, 125], [-66, 145],
];

function buildCoast(edge, farX, color) {
  const shape = new THREE.Shape();
  shape.moveTo(edge[0][0], edge[0][1]);
  for (let i = 1; i < edge.length; i++) shape.lineTo(edge[i][0], edge[i][1]);
  shape.lineTo(farX, edge[edge.length - 1][1]);
  shape.lineTo(farX, edge[0][1]);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, { depth: 3.5, bevelEnabled: false });
  const mat = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  scene.add(mesh);
}

buildCoast(IRAN_COAST, 450, 0xc8a462);
buildCoast(OMAN_COAST, -450, 0xb89050);

function coastXAtZ(coast, z) {
  if (z <= coast[0][1]) return coast[0][0];
  if (z >= coast[coast.length - 1][1]) return coast[coast.length - 1][0];
  for (let i = 0; i < coast.length - 1; i++) {
    const [x0, z0] = coast[i], [x1, z1] = coast[i + 1];
    if (z >= z0 && z <= z1) return x0 + (z - z0) / (z1 - z0) * (x1 - x0);
  }
  return coast[0][0];
}

// Entry zone highlight — ships enter from the south (high z)
const entryZoneMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(78, 28),
  new THREE.MeshBasicMaterial({ color: 0x00ff99, transparent: true, opacity: 0.13, depthWrite: false })
);
entryZoneMesh.rotation.x = -Math.PI / 2;
entryZoneMesh.position.set(0, 0.3, 84);
scene.add(entryZoneMesh);

// Entry zone border line
const borderPts = [
  new THREE.Vector3(-39, 0.5, 70), new THREE.Vector3(39, 0.5, 70),
  new THREE.Vector3(39, 0.5, 98), new THREE.Vector3(-39, 0.5, 98),
  new THREE.Vector3(-39, 0.5, 70),
];
scene.add(new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(borderPts),
  new THREE.LineBasicMaterial({ color: 0x00ff99, opacity: 0.6, transparent: true })
));

// === GAME STATE ===
let ships = [];
let towers = [];
let missiles = [];
let interceptors = [];
let placementMarkers = [];
let placedPositions = [];
let targetPoint = null;
let fireInterceptor = false;
let phase = "placement"; // "placement" | "loading" | "action"
let score = 0;
let level = 1;
let gameOver = false;
let lastTime = 0;
let pendingLoads = 0;
let msgTimer = 0;

// === UI ===
const statusEl = document.getElementById("status");
const controlsEl = document.getElementById("controls");
const loadingEl = document.getElementById("loading");

function flashMsg(msg, ms = 1800) {
  statusEl.textContent = msg;
  msgTimer = ms;
}

function updateHUD() {
  if (phase === "placement") {
    statusEl.textContent = `PLACEMENT — ${placedPositions.length}/5 ships placed | click green entry zone to place`;
    controlsEl.textContent = "Click green zone → place ship  |  Enter → launch convoy  |  R → restart";
  } else if (phase === "loading") {
    statusEl.textContent = "Convoy launching…";
  } else {
    if (gameOver) return;
    statusEl.textContent = `Level: ${level}  |  Escaped: ${score}/3  |  Ships: ${ships.filter(s => s.alive).length}  |  Missiles: ${missiles.length}`;
    controlsEl.textContent = "Click ocean → set route  |  Space → fire interceptor  |  R → restart";
  }
}

// === LOADER ===
const loader = new GLTFLoader();

function checkAllLoaded() {
  if (pendingLoads <= 0) {
    pendingLoads = 0;
    if (loadingEl) loadingEl.style.display = "none";
    phase = "action";
    updateHUD();
  }
}

// === PLACEMENT ===
function addPlacementMarker(x, z) {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(1.8, 5, 8),
    new THREE.MeshLambertMaterial({ color: 0x00ffbb })
  );
  cone.position.set(x, 4, z);
  cone.rotation.x = Math.PI;
  scene.add(cone);
  placementMarkers.push(cone);
}

function clearPlacementMarkers() {
  placementMarkers.forEach(m => scene.remove(m));
  placementMarkers = [];
}

function launchConvoy() {
  if (phase !== "placement") return;
  clearPlacementMarkers();
  entryZoneMesh.visible = false;

  const pos = placedPositions.length > 0
    ? placedPositions
    : [
        { x: -20, z: 82 }, { x: -10, z: 82 }, { x: 0, z: 82 },
        { x: 10, z: 82 },  { x: 20, z: 82 },
      ];

  phase = "loading";
  if (loadingEl) loadingEl.style.display = "grid";
  pos.forEach(p => loadShip(p.x, p.z));
  updateHUD();
}

// === SHIPS ===
function loadShip(x, z) {
  pendingLoads++;
  loader.load("./assets/ship.glb", (gltf) => {
    const model = gltf.scene;
    model.scale.set(18, 18, 18);
    model.position.set(x, 0, z);
    // Ships start heading north (toward -z, heading = Math.PI)
    scene.add(model);
    ships.push({ mesh: model, heading: Math.PI, alive: true });
    pendingLoads--;
    checkAllLoaded();
    updateHUD();
  }, undefined, () => { pendingLoads--; checkAllLoaded(); });
}

// === TOWERS ===
function spawnTowers(count) {
  for (let i = 0; i < count; i++) {
    const z = -100 + (i / Math.max(count - 1, 1)) * 200 + (Math.random() - 0.5) * 18;
    // 70% Iran (right/+X), 30% Oman (left/-X)
    const onIran = Math.random() > 0.3;
    const cx = onIran ? coastXAtZ(IRAN_COAST, z) : coastXAtZ(OMAN_COAST, z);
    const inland = onIran ? 5 + Math.random() * 7 : -(5 + Math.random() * 7);
    spawnTower(cx + inland, z);
  }
}

function spawnTower(x, z) {
  const group = new THREE.Group();

  const bunker = new THREE.Mesh(
    new THREE.BoxGeometry(4.5, 2, 4.5),
    new THREE.MeshLambertMaterial({ color: 0x7a6c52 })
  );
  bunker.position.y = 1;
  group.add(bunker);

  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.5, 5, 6),
    new THREE.MeshLambertMaterial({ color: 0x383838 })
  );
  tube.position.set(0, 5.5, 0);
  group.add(tube);

  group.position.set(x, 0, z);
  scene.add(group);
  towers.push({ mesh: group, position: new THREE.Vector3(x, 0, z), cooldown: 80 + Math.random() * 160 });
}

// === PROJECTILES ===
function launchMissile(origin, target) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.65, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff4400 })
  );
  mesh.position.copy(origin);
  mesh.position.y = 2;
  scene.add(mesh);
  const initDir = new THREE.Vector3().subVectors(target.mesh.position, origin).normalize();
  missiles.push({ mesh, target, velocity: initDir.multiplyScalar(6), active: true });
}

function launchInterceptor(shipPos) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0x00eeff })
  );
  mesh.position.copy(shipPos);
  mesh.position.y = 2;
  scene.add(mesh);

  let nearestMissile = null;
  let best = Infinity;
  missiles.forEach(m => {
    if (!m.active) return;
    const d = m.mesh.position.distanceTo(shipPos);
    if (d < best) { best = d; nearestMissile = m; }
  });

  const vel = nearestMissile
    ? new THREE.Vector3().subVectors(nearestMissile.mesh.position, shipPos).normalize().multiplyScalar(70)
    : new THREE.Vector3(0, 0, 70); // fire north if no target
  interceptors.push({ mesh, target: nearestMissile, velocity: vel, active: true });
}

// === UPDATE ===
const SHIP_SPEED = 11;
const TURN_RATE = 1.8;

function updateShips(delta, t) {
  ships.forEach(s => {
    if (!s.alive) return;

    if (targetPoint) {
      const dx = targetPoint.x - s.mesh.position.x;
      const dz = targetPoint.z - s.mesh.position.z;
      if (dx * dx + dz * dz > 64) {
        const desired = Math.atan2(dx, dz);
        let diff = desired - s.heading;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        s.heading += Math.sign(diff) * Math.min(Math.abs(diff), TURN_RATE * delta);
      }
    }

    s.mesh.position.x += Math.sin(s.heading) * SHIP_SPEED * delta;
    s.mesh.position.z += Math.cos(s.heading) * SHIP_SPEED * delta;
    s.mesh.position.y = Math.sin(t * 1.8 + s.mesh.position.x * 0.2) * 0.25;
    s.mesh.rotation.y = -s.heading;

    // Escaped when reaching north end (z < -100)
    if (s.mesh.position.z < -100) {
      s.alive = false;
      scene.remove(s.mesh);
      score++;
      flashMsg(`Ship escaped through the strait! ✔  (${score}/3)`);
    }
  });
}

function updateTowers() {
  towers.forEach(t => {
    t.cooldown--;
    const target = ships.find(s => s.alive && s.mesh.position.distanceTo(t.position) < 75);
    if (!target || t.cooldown > 0) return;
    launchMissile(t.position.clone(), target);
    t.cooldown = Math.max(55, 120 + Math.random() * 100 - level * 8);
  });
}

function updateMissiles(delta) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    if (!m.active || !m.target?.alive) {
      scene.remove(m.mesh);
      missiles.splice(i, 1);
      continue;
    }
    const dir = new THREE.Vector3().subVectors(m.target.mesh.position, m.mesh.position).normalize();
    m.velocity.addScaledVector(dir, 5 * delta);
    if (m.velocity.length() > 22) m.velocity.setLength(22);
    m.mesh.position.addScaledVector(m.velocity, delta);

    if (m.mesh.position.distanceTo(m.target.mesh.position) < 2.5) {
      m.target.alive = false;
      scene.remove(m.target.mesh);
      scene.remove(m.mesh);
      missiles.splice(i, 1);
      flashMsg("Convoy ship destroyed! ✖");
    }
  }
}

function updateInterceptors(delta) {
  for (let i = interceptors.length - 1; i >= 0; i--) {
    const ic = interceptors[i];
    if (ic.target?.active) {
      const dir = new THREE.Vector3()
        .subVectors(ic.target.mesh.position, ic.mesh.position)
        .normalize()
        .multiplyScalar(80);
      ic.velocity.lerp(dir, Math.min(1, 5 * delta));
    }
    ic.mesh.position.addScaledVector(ic.velocity, delta);

    let hit = false;
    for (let m = missiles.length - 1; m >= 0; m--) {
      if (missiles[m].mesh.position.distanceTo(ic.mesh.position) < 2.5) {
        scene.remove(missiles[m].mesh);
        missiles.splice(m, 1);
        hit = true;
        flashMsg("Interceptor neutralised a missile! ✔");
        break;
      }
    }

    if (hit || ic.mesh.position.length() > 280) {
      scene.remove(ic.mesh);
      interceptors.splice(i, 1);
    }
  }
}

function checkGameState() {
  if (phase !== "action" || gameOver) return;
  if (score >= 3) {
    gameOver = true;
    statusEl.textContent = `MISSION SUCCESS ✅  —  Advancing to level ${level + 1}…`;
    setTimeout(nextLevel, 2200);
    return;
  }
  const alive = ships.filter(s => s.alive).length;
  if (alive === 0 && ships.length > 0) {
    gameOver = true;
    statusEl.textContent = "MISSION FAILED ❌  —  Press R to restart";
  }
}

function nextLevel() {
  level++;
  score = 0;
  gameOver = false;
  clearDynamic();
  spawnTowers(6 + level);
  phase = "placement";
  placedPositions = [];
  entryZoneMesh.visible = true;
  updateHUD();
}

function clearDynamic() {
  ships.forEach(o => { if (o.mesh.parent) scene.remove(o.mesh); });
  missiles.forEach(o => { if (o.mesh.parent) scene.remove(o.mesh); });
  interceptors.forEach(o => { if (o.mesh.parent) scene.remove(o.mesh); });
  towers.forEach(t => { if (t.mesh?.parent) scene.remove(t.mesh); });
  ships = []; missiles = []; interceptors = []; towers = [];
}

// === INPUT ===
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

window.addEventListener("click", e => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(ocean);
  if (!hits.length) return;
  const pt = hits[0].point;

  if (phase === "placement") {
    // Entry zone: south end of strait (z 70–98, within channel width)
    if (pt.z > 70 && pt.z < 98 && Math.abs(pt.x) < 39 && placedPositions.length < 5) {
      placedPositions.push({ x: pt.x, z: pt.z });
      addPlacementMarker(pt.x, pt.z);
      updateHUD();
    }
  } else if (phase === "action") {
    targetPoint = pt.clone();
  }
});

window.addEventListener("keydown", e => {
  if (e.code === "Enter" && phase === "placement") launchConvoy();
  if (e.code === "Space" && phase === "action") fireInterceptor = true;
  if (e.code === "KeyR") location.reload();
});

// === INIT ===
spawnTowers(7);
if (loadingEl) loadingEl.style.display = "none";
updateHUD();

// === LOOP ===
function animate(time) {
  if (!lastTime) lastTime = time;
  const delta = Math.min(0.05, (time - lastTime) / 1000);
  const t = time * 0.001;
  lastTime = time;

  requestAnimationFrame(animate);
  animateOcean(t);

  if (msgTimer > 0) {
    msgTimer -= delta * 1000;
    if (msgTimer <= 0) updateHUD();
  }

  if (phase === "action" && !gameOver) {
    if (fireInterceptor) {
      ships.forEach(s => { if (s.alive) launchInterceptor(s.mesh.position.clone()); });
      fireInterceptor = false;
    }
    updateShips(delta, t);
    updateTowers();
    updateMissiles(delta);
    updateInterceptors(delta);
    checkGameState();
    if (msgTimer <= 0) updateHUD();
  }

  renderer.render(scene, camera);
}

requestAnimationFrame(animate);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
