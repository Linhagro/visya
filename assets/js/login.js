// assets/js/login.js
import * as THREE from "three";

/**
 * ================== FUNDO 3D - TERRENO TOPOGRÃFICO ==================
 */

const canvas = document.getElementById("bgCanvas");
let w = window.innerWidth;
let h = window.innerHeight;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x07090c, 30, 90);

const camera = new THREE.PerspectiveCamera(55, w / h, 0.1, 200);
camera.position.set(0, 14, 28);
camera.lookAt(0, -2, 0);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(w, h);
renderer.setClearColor(0x000000, 0);

const GRID_SIZE = 80;
const GRID_DIVISIONS = 56;

const planeGeometry = new THREE.PlaneGeometry(
  GRID_SIZE,
  GRID_SIZE,
  GRID_DIVISIONS,
  GRID_DIVISIONS
);
planeGeometry.rotateX(-Math.PI / 2);

const basePositions = planeGeometry.attributes.position.array.slice();

const lineMaterial = new THREE.LineBasicMaterial({
  color: 0x2a3a3f,
  transparent: true,
  opacity: 0.55,
});

const wireframeGeometry = new THREE.WireframeGeometry(planeGeometry);
const wireframe = new THREE.LineSegments(wireframeGeometry, lineMaterial);
wireframe.position.y = -4;
scene.add(wireframe);

const pointsMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.12,
  transparent: true,
  opacity: 0.7,
  sizeAttenuation: true,
});

const points = new THREE.Points(planeGeometry, pointsMaterial);
points.position.y = -4;
scene.add(points);

const accentLight = new THREE.PointLight(0x3d8c5e, 1.4, 60);
accentLight.position.set(-18, 8, 10);
scene.add(accentLight);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
scene.add(ambientLight);

const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

window.addEventListener("mousemove", (e) => {
  mouse.targetX = (e.clientX / w - 0.5) * 2;
  mouse.targetY = (e.clientY / h - 0.5) * 2;
});

function animateTerrain(time) {
  const positions = planeGeometry.attributes.position.array;

  for (let i = 0; i < positions.length; i += 3) {
    const x = basePositions[i];
    const z = basePositions[i + 2];

    const wave1 = Math.sin(x * 0.18 + time * 0.6) * 0.85;
    const wave2 = Math.cos(z * 0.22 + time * 0.45) * 0.7;
    const wave3 = Math.sin((x + z) * 0.12 + time * 0.3) * 1.2;

    const dist = Math.sqrt(x * x + z * z);
    const radial = Math.cos(dist * 0.18 - time * 0.8) * 0.6;

    positions[i + 1] = wave1 + wave2 + wave3 + radial;
  }

  planeGeometry.attributes.position.needsUpdate = true;
}

function rebuildWireframe() {
  wireframe.geometry.dispose();
  wireframe.geometry = new THREE.WireframeGeometry(planeGeometry);
}

let frameCount = 0;
let clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const elapsed = clock.getElapsedTime();

  animateTerrain(elapsed);

  frameCount++;
  if (frameCount % 2 === 0) {
    rebuildWireframe();
  }

  mouse.x += (mouse.targetX - mouse.x) * 0.04;
  mouse.y += (mouse.targetY - mouse.y) * 0.04;

  camera.position.x = mouse.x * 3;
  camera.position.y = 14 + mouse.y * -1.5;
  camera.lookAt(0, -2, 0);

  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  w = window.innerWidth;
  h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
});

/**
 * ================== LÃ“GICA DE LOGIN VISYA ==================
 */

const form = document.getElementById("visyaLoginForm");
const userInput = document.getElementById("loginUser");
const passInput = document.getElementById("loginPass");
const button = document.getElementById("loginButton");
const loaderOverlay = document.getElementById("loaderOverlay");
const errorEl = document.getElementById("loginError");

function setLoading(isLoading) {
  if (loaderOverlay) {
    loaderOverlay.style.display = isLoading ? "flex" : "none";
    loaderOverlay.setAttribute("aria-hidden", isLoading ? "false" : "true");
  }
  if (button) {
    button.disabled = isLoading;
  }
}

function showError(msg) {
  if (errorEl) {
    errorEl.textContent = msg || "";
  }
}

if (form && userInput && passInput) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError("");

    const email = (userInput.value || "").trim();
    const senha = (passInput.value || "").trim();

    if (!email || !senha) {
      showError("Informe e-mail e senha.");
      return;
    }

    setLoading(true);

    try {
      const user = await loginSistema(email, senha);

      if (!user) {
        showError("UsuÃ¡rio ou senha invÃ¡lidos.");
        return;
      }

      let atual = null;
      if (typeof getUsuarioAtual === "function") {
        atual = getUsuarioAtual();
      }

      if (!atual || !Array.isArray(atual.empresas) || atual.empresas.length === 0) {
        showError("UsuÃ¡rio sem empresa vinculada. Contate o administrador.");
        return;
      }

      window.location.href = "./assets/html/app.html";
    } catch (e) {
      console.error("Erro no login VISYA:", e);
      showError("Falha ao autenticar. Tente novamente.");
    } finally {
      setLoading(false);
    }
  });
}

