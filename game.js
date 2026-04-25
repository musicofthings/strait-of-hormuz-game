import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as CANNON from "https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/+esm";

// === LOADERS ===
const loadingManager = new THREE.LoadingManager();
const loader = new GLTFLoader(loadingManager);

// === SCENE ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 120, 420);

// CAMERA
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 60, 120);

// RENDERER
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// LIGHTING
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(100, 100, 50);
scene.add(sun);
scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// === PHYSICS WORLD ===
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

// === OCEAN ===
const oceanGeo = new THREE.PlaneGeometry(500, 200, 200, 200);
const oceanMat = new THREE.MeshPhongMaterial({
  color: 0x1e3f66,
  shininess: 100,
  transparent: true,
  opacity: 0.9,
});
const ocean = new THREE.Mesh(oceanGeo, oceanMat);
ocean.rotation.x = -Math.PI / 2;
scene.add(ocean);

function animateOcean(time) {
  const pos = ocean.geometry.attributes.position;

  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);

    const wave =
      Math.sin(x * 0.05 + time) * 0.5 +
      Math.cos(y * 0.05 + time * 0.7) * 0.5;

    pos.setZ(i, wave);
  }

  pos.needsUpdate = true;
  ocean.geometry.computeVertexNormals();
}

// === INPUT ===
const mouse = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
let targetPoint = null;
let fireInterceptor = false;

window.addEventListener("click", (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObject(ocean);
  if (intersects.length > 0) {
    targetPoint = intersects[0].point.clone();
    updateUI(`Route updated: x=${targetPoint.x.toFixed(1)}, z=${targetPoint.z.toFixed(1)}`);
  }
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    fireInterceptor = true;
  }

  if (e.code === "KeyR") {
    location.reload();
  }
});

// === ENTITIES ===
let ships = [];
let towers = [];
let missiles = [];
let interceptors = [];

// === GAME STATE ===
let score = 0;
let level = 1;
let gameOver = false;
let loadingComplete = false;
let lastTime = 0;

// === UI ===
const statusEl = document.getElementById("status");
const loadingEl = document.getElementById("loading");

function updateUI(message) {
  statusEl.textContent = `${message} | Level: ${level} | Escaped: ${score} | Active ships: ${ships.filter((s) => s.alive).length} | Incoming missiles: ${missiles.length}`;
}

function updateHUD() {
  if (gameOver || !loadingComplete) return;

  statusEl.textContent = `Level: ${level} | Escaped: ${score} | Active ships: ${ships.filter((s) => s.alive).length} | Towers: ${towers.length} | Missiles: ${missiles.length} | Interceptors: ${interceptors.length}`;
}

function clearDynamicObjects() {
  ships.forEach((ship) => {
    if (ship.mesh.parent) {
      scene.remove(ship.mesh);
    }
    world.removeBody(ship.body);
  });

  missiles.forEach((m) => {
    if (m.mesh.parent) scene.remove(m.mesh);
  });

  interceptors.forEach((i) => {
    if (i.mesh.parent) scene.remove(i.mesh);
  });

  ships = [];
  missiles = [];
  interceptors = [];
}

// === SPAWN ===
function loadShip(x, z = -90) {
  loader.load("./assets/ship.glb", (gltf) => {
    const model = gltf.scene;
    model.scale.set(2, 2, 2);
    model.position.set(x, 0, z);
    scene.add(model);

    const body = new CANNON.Body({
      mass: 5,
      shape: new CANNON.Box(new CANNON.Vec3(2, 1, 5)),
      linearDamping: 0.25,
      angularDamping: 0.9,
    });

    body.position.set(x, 0, z);
    world.addBody(body);

    ships.push({ mesh: model, body, alive: true });
    updateHUD();
  });
}

function loadIsland(x, z) {
  loader.load("./assets/Island.glb", (gltf) => {
    const island = gltf.scene;
    island.scale.set(5, 5, 5);
    island.position.set(x, 0, z);
    scene.add(island);

    towers.push({
      position: new THREE.Vector3(x, 0, z),
      cooldown: 60 + Math.random() * 180,
    });

    updateHUD();
  });
}

function spawnWave(shipCount = 5) {
  const start = -Math.floor(shipCount / 2) * 10;
  for (let i = 0; i < shipCount; i += 1) {
    loadShip(start + i * 10);
  }
}

function spawnTowers(count = 6) {
  for (let i = 0; i < count; i += 1) {
    loadIsland((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 120);
  }
}

function increaseDifficulty() {
  level += 1;
  score = 0;
  clearDynamicObjects();
  spawnTowers(6 + level);
  spawnWave(4 + level);
  gameOver = false;
  updateUI(`Level ${level} started`);
}

// === PROJECTILES ===
function launchMissile(origin, target) {
  const geo = new THREE.SphereGeometry(0.5, 16, 16);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
  const mesh = new THREE.Mesh(geo, mat);

  mesh.position.copy(origin);
  scene.add(mesh);

  missiles.push({
    mesh,
    target,
    velocity: new THREE.Vector3(),
    active: true,
  });
}

function launchInterceptor(origin) {
  const geo = new THREE.SphereGeometry(0.3, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
  const mesh = new THREE.Mesh(geo, mat);

  mesh.position.copy(origin);
  scene.add(mesh);

  interceptors.push({
    mesh,
    velocity: new THREE.Vector3(0, 0, -120),
    active: true,
  });
}

// === GAMEPLAY ===
function updateShips(deltaScale) {
  ships.forEach((s) => {
    if (!s.alive) return;

    s.body.velocity.z = 4 * deltaScale;

    if (targetPoint) {
      const dirX = targetPoint.x - s.body.position.x;
      s.body.velocity.x = dirX * 0.5 * deltaScale;
    } else {
      s.body.velocity.x *= 0.9;
    }

    s.mesh.position.copy(s.body.position);

    if (s.mesh.position.z > 90) {
      s.alive = false;
      scene.remove(s.mesh);
      world.removeBody(s.body);
      score += 1;
      updateUI("Ship escaped ✔");
    }
  });
}

function updateTowers() {
  towers.forEach((t) => {
    t.cooldown -= 1;

    const active = ships.some(
      (s) => s.alive && s.mesh.position.distanceTo(t.position) < 60,
    );

    if (!active) return;

    if (t.cooldown <= 0) {
      const target = ships.find((s) => s.alive);
      if (target) {
        launchMissile(t.position, target);
      }
      t.cooldown = Math.max(60, 150 + Math.random() * 150 - level * 12);
    }
  });
}

function updateMissiles(deltaScale) {
  for (let i = missiles.length - 1; i >= 0; i -= 1) {
    const missile = missiles[i];

    if (!missile.active || !missile.target || !missile.target.alive) {
      missile.active = false;
      scene.remove(missile.mesh);
      missiles.splice(i, 1);
      continue;
    }

    const dir = new THREE.Vector3()
      .subVectors(missile.target.mesh.position, missile.mesh.position)
      .normalize();

    missile.velocity.add(dir.multiplyScalar(0.05 * deltaScale));
    missile.mesh.position.add(missile.velocity);

    if (missile.mesh.position.distanceTo(missile.target.mesh.position) < 2) {
      missile.target.alive = false;
      scene.remove(missile.target.mesh);
      world.removeBody(missile.target.body);

      missile.active = false;
      scene.remove(missile.mesh);
      missiles.splice(i, 1);
      updateUI("A convoy ship was destroyed ✖");
    }
  }
}

function updateInterceptors(deltaScale) {
  for (let i = interceptors.length - 1; i >= 0; i -= 1) {
    const interceptor = interceptors[i];
    interceptor.mesh.position.addScaledVector(interceptor.velocity, deltaScale / 60);

    let removed = false;

    for (let m = missiles.length - 1; m >= 0; m -= 1) {
      const missile = missiles[m];
      if (missile.mesh.position.distanceTo(interceptor.mesh.position) < 2) {
        missile.active = false;
        scene.remove(missile.mesh);
        missiles.splice(m, 1);

        interceptor.active = false;
        scene.remove(interceptor.mesh);
        interceptors.splice(i, 1);
        removed = true;

        updateUI("Interceptor hit ✔");
        break;
      }
    }

    if (removed) continue;

    if (Math.abs(interceptor.mesh.position.z) > 180) {
      interceptor.active = false;
      scene.remove(interceptor.mesh);
      interceptors.splice(i, 1);
    }
  }
}

function cleanupArrays() {
  missiles = missiles.filter((m) => m.active && m.mesh.parent !== null);
  interceptors = interceptors.filter((i) => i.active && i.mesh.parent !== null);
  ships = ships.filter((s) => s.alive || s.mesh.parent !== null);
}

function checkGameState() {
  const aliveShips = ships.filter((s) => s.alive).length;

  if (aliveShips === 0 && !gameOver) {
    gameOver = true;
    updateUI("MISSION FAILED ❌ (Press R to restart)");
  }

  if (score >= 3 && !gameOver) {
    gameOver = true;
    updateUI(`MISSION SUCCESS ✅ (Advancing to level ${level + 1}...)`);
    setTimeout(() => {
      increaseDifficulty();
    }, 1500);
  }
}

// === INIT ===
function initGame() {
  spawnTowers(6);
  spawnWave(5);
  updateUI("Click ocean to set route | Space: fire interceptor | R: restart");
}

loadingManager.onLoad = () => {
  loadingComplete = true;
  if (loadingEl) loadingEl.style.display = "none";
  if (!lastTime) {
    requestAnimationFrame(animate);
  }
};

loadingManager.onError = (url) => {
  console.error("Failed to load asset:", url);
};

initGame();

// === LOOP ===
function animate(time) {
  if (!lastTime) lastTime = time;
  const delta = Math.min(0.05, (time - lastTime) / 1000);
  const deltaScale = delta * 60;
  lastTime = time;

  requestAnimationFrame(animate);

  const t = time * 0.001;

  animateOcean(t);

  if (!loadingComplete) {
    renderer.render(scene, camera);
    return;
  }

  world.step(1 / 60, delta, 3);

  if (!gameOver) {
    if (fireInterceptor) {
      ships.forEach((s) => {
        if (s.alive) {
          launchInterceptor(s.mesh.position.clone());
        }
      });
      fireInterceptor = false;
    }

    updateShips(deltaScale);
    updateTowers();
    updateMissiles(deltaScale);
    updateInterceptors(deltaScale);
    cleanupArrays();
    checkGameState();
    updateHUD();
  }

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
