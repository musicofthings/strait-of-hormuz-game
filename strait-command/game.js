// === IMPORTS ===
const loader = new THREE.GLTFLoader();

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
renderer.physicallyCorrectLights = true;
renderer.outputEncoding = THREE.sRGBEncoding;
document.body.appendChild(renderer.domElement);

// LIGHTING (REALISTIC)
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(100, 100, 50);
scene.add(sun);

scene.add(new THREE.AmbientLight(0xffffff, 0.4));

// === PHYSICS WORLD ===
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0);

// === OCEAN (GERSTNER WAVES) ===
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

  for (let i = 0; i < pos.count; i++) {
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

// === SHIPS ===
const ships = [];

function loadShip(x) {
  loader.load("assets/ship.glb", (gltf) => {
    const model = gltf.scene;
    model.scale.set(2, 2, 2);
    model.position.set(x, 0, -90);

    scene.add(model);

    const body = new CANNON.Body({
      mass: 5,
      shape: new CANNON.Box(new CANNON.Vec3(2, 1, 5)),
    });

    body.position.set(x, 0, -90);
    world.addBody(body);

    ships.push({ mesh: model, body, alive: true });
    updateStatus();
  });
}

// === ISLANDS (TOWERS BASE) ===
const towers = [];

function loadIsland(x, z) {
  loader.load("assets/island.glb", (gltf) => {
    const island = gltf.scene;
    island.scale.set(5, 5, 5);
    island.position.set(x, 0, z);

    scene.add(island);

    towers.push({
      position: new THREE.Vector3(x, 0, z),
      cooldown: Math.random() * 200,
    });

    updateStatus();
  });
}

// === MISSILES ===
const missiles = [];

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
  });
}

// === UI ===
const statusEl = document.getElementById("status");

function updateStatus() {
  const activeShips = ships.filter((s) => s.alive).length;
  statusEl.textContent = `Ships: ${activeShips} | Towers: ${towers.length} | Missiles: ${missiles.length}`;
}

// === GAME LOGIC ===
function updateShips() {
  ships.forEach((s) => {
    if (!s.alive) return;

    s.body.velocity.z = 5;
    s.mesh.position.copy(s.body.position);

    if (s.mesh.position.z > 90) {
      s.alive = false;
      scene.remove(s.mesh);
      world.removeBody(s.body);
    }
  });
}

function updateTowers() {
  towers.forEach((t) => {
    t.cooldown -= 1;

    if (t.cooldown <= 0 && ships.length > 0) {
      const target = ships[Math.floor(Math.random() * ships.length)];
      if (target && target.alive) {
        launchMissile(t.position, target);
      }
      t.cooldown = 200 + Math.random() * 200;
    }
  });
}

function updateMissiles() {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i];
    if (!m.target || !m.target.alive) {
      scene.remove(m.mesh);
      missiles.splice(i, 1);
      continue;
    }

    const dir = new THREE.Vector3()
      .subVectors(m.target.mesh.position, m.mesh.position)
      .normalize();

    m.velocity.add(dir.multiplyScalar(0.05));
    m.mesh.position.add(m.velocity);

    if (m.mesh.position.distanceTo(m.target.mesh.position) < 2) {
      m.target.alive = false;
      scene.remove(m.target.mesh);
      world.removeBody(m.target.body);
      scene.remove(m.mesh);
      missiles.splice(i, 1);
    }
  }
}

// === INIT ===
for (let i = -20; i <= 20; i += 10) loadShip(i);
for (let i = 0; i < 6; i += 1) {
  loadIsland((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 120);
}

// === LOOP ===
function animate(time) {
  requestAnimationFrame(animate);

  const t = time * 0.001;

  animateOcean(t);
  world.step(1 / 60);

  updateShips();
  updateTowers();
  updateMissiles();
  updateStatus();

  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();
