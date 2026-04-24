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
const ships = [];
const towers = [];
const missiles = [];
const interceptors = [];

// === GAME STATE ===
let score = 0;
let gameOver = false;

// === UI ===
const statusEl = document.getElementById("status");

function updateUI(message) {
  statusEl.textContent = `${message} | Escaped: ${score} | Active ships: ${ships.filter((s) => s.alive).length} | Incoming missiles: ${missiles.length}`;
}

function updateHUD() {
  if (gameOver) return;

  statusEl.textContent = `Escaped: ${score} | Active ships: ${ships.filter((s) => s.alive).length} | Towers: ${towers.length} | Missiles: ${missiles.length} | Interceptors: ${interceptors.length}`;
}

// === LOADERS ===
function loadShip(x) {
  loader.load("assets/ship.glb", (gltf) => {
    const model = gltf.scene;
    model.scale.set(2, 2, 2);
    model.position.set(x, 0, -90);
    scene.add(model);

    const body = new CANNON.Body({
      mass: 5,
      shape: new CANNON.Box(new CANNON.Vec3(2, 1, 5)),
      linearDamping: 0.25,
      angularDamping: 0.9,
    });

    body.position.set(x, 0, -90);
    world.addBody(body);

    ships.push({ mesh: model, body, alive: true });
    updateHUD();
  });
}

function loadIsland(x, z) {
  loader.load("assets/island.glb", (gltf) => {
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
    velocity: new THREE.Vector3(0, 0, -2),
  });
}

// === GAMEPLAY ===
function updateShips() {
  ships.forEach((s) => {
    if (!s.alive) return;

    // Forward movement
    s.body.velocity.z = 4;

    // Player lane steering
    if (targetPoint) {
      const dirX = targetPoint.x - s.body.position.x;
      s.body.velocity.x = dirX * 0.5;
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
      t.cooldown = 150 + Math.random() * 150;
    }
  });
}

function updateMissiles() {
  for (let i = missiles.length - 1; i >= 0; i -= 1) {
    const missile = missiles[i];

    if (!missile.target || !missile.target.alive) {
      scene.remove(missile.mesh);
      missiles.splice(i, 1);
      continue;
    }

    const dir = new THREE.Vector3()
      .subVectors(missile.target.mesh.position, missile.mesh.position)
      .normalize();

    missile.velocity.add(dir.multiplyScalar(0.05));
    missile.mesh.position.add(missile.velocity);

    if (missile.mesh.position.distanceTo(missile.target.mesh.position) < 2) {
      missile.target.alive = false;
      scene.remove(missile.target.mesh);
      world.removeBody(missile.target.body);
      scene.remove(missile.mesh);
      missiles.splice(i, 1);
      updateUI("A convoy ship was destroyed ✖");
    }
  }
}

function updateInterceptors() {
  for (let i = interceptors.length - 1; i >= 0; i -= 1) {
    const interceptor = interceptors[i];
    interceptor.mesh.position.add(interceptor.velocity);

    let removed = false;

    for (let m = missiles.length - 1; m >= 0; m -= 1) {
      const missile = missiles[m];
      if (missile.mesh.position.distanceTo(interceptor.mesh.position) < 2) {
        scene.remove(missile.mesh);
        missiles.splice(m, 1);
        scene.remove(interceptor.mesh);
        interceptors.splice(i, 1);
        removed = true;
        updateUI("Interceptor hit ✔");
        break;
      }
    }

    if (removed) continue;

    if (Math.abs(interceptor.mesh.position.z) > 180) {
      scene.remove(interceptor.mesh);
      interceptors.splice(i, 1);
    }
  }
}

function checkGameState() {
  const aliveShips = ships.filter((s) => s.alive).length;

  if (aliveShips === 0 && !gameOver) {
    gameOver = true;
    updateUI("MISSION FAILED ❌ (Press R to restart)");
  }

  if (score >= 3 && !gameOver) {
    gameOver = true;
    updateUI("MISSION SUCCESS ✅ (Press R to restart)");
  }
}

// === INIT ===
for (let i = -20; i <= 20; i += 10) {
  loadShip(i);
}

for (let i = 0; i < 6; i += 1) {
  loadIsland((Math.random() - 0.5) * 80, (Math.random() - 0.5) * 120);
}

updateUI("Click ocean to set route | Space: fire interceptor | R: restart");

// === LOOP ===
function animate(time) {
  requestAnimationFrame(animate);

  const t = time * 0.001;

  animateOcean(t);
  world.step(1 / 60);

  if (!gameOver) {
    if (fireInterceptor) {
      ships.forEach((s) => {
        if (s.alive) {
          launchInterceptor(s.mesh.position.clone());
        }
      });
      fireInterceptor = false;
    }

    updateShips();
    updateTowers();
    updateMissiles();
    updateInterceptors();
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

animate();
