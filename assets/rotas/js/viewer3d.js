// assets/rotas/js/viewer3d.js
import * as THREE from './three/three.module.js';
import { OrbitControls } from './three/OrbitControls.js';

console.log('[VIEWER3D] módulo carregado (three ES module + OrbitControls)');
console.log('[VIEWER3D] THREE versão:', THREE.REVISION);

let scene, camera, renderer, controls;
let carga = null;
let volumesMesh = [];
let volumesEdges = [];
let currentCenter = new THREE.Vector3(0, 0, 0);
let sectionPlane = null;

let animIdx = 0;
let animPlaying = false;
let animSpeed = 5;
let animTimer = 0;
let animLastTick = null;
const ANIM_BASE_MS = 480;

let wireOn = false;
let explodOn = false;
let sectionOn = false;
let volumesComRegras = [];

const ZONA_NOMES = ['Traseira', 'Meia-traseira', 'Centro', 'Meia-frente', 'Frente'];

const canvasContainer = document.getElementById('viewer3dCanvas');
const infoCaminhao = document.getElementById('infoCaminhao');
const infoResumoCarga = document.getElementById('infoResumoCarga');
const listaVolumesEl = document.getElementById('listaVolumes');
const selectCaminhao = document.getElementById('selectCaminhao');
const btnResetCamera = document.getElementById('btnResetCamera');
const btnImprimirLayout = document.getElementById('btnImprimirLayout');
const filtroPedidoInput = document.getElementById('filtroPedido');
const topPedidos = document.getElementById('topPedidos');
const topVolumes = document.getElementById('topVolumes');
const topPeso = document.getElementById('topPeso');
const topOcupacaoPct = document.getElementById('topOcupacaoPct');
const ocupadoM3 = document.getElementById('ocupadoM3');
const totalM3 = document.getElementById('totalM3');
const ocupacaoBar = document.getElementById('ocupacaoBar');
const ocupacaoPctTexto = document.getElementById('ocupacaoPctTexto');
const topProdutosQtd = document.getElementById('topProdutosQtd');

function showToast(msg) {
  const toast = document.getElementById('viewer3dToast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 5000);
}

function obterCargaDoOpener() {
  try {
    if (window.opener && window.opener.__VISYA_CARGA_ATUAL__) return window.opener.__VISYA_CARGA_ATUAL__;
  } catch (e) {}
  try {
    if (window.__VISYA_CARGA_ATUAL__) return window.__VISYA_CARGA_ATUAL__;
  } catch (e) {}
  try {
    const raw = sessionStorage.getItem('__VISYA_CARGA_ATUAL__');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

function getCorPesoInfo(peso) {
  const p = Number(peso) || 0;
  if (p >= 25) return { cor: 0xef4444, hex: '#ef4444', nome: 'Muito pesado' };
  if (p >= 18) return { cor: 0xf97316, hex: '#f97316', nome: 'Pesado' };
  if (p >= 10) return { cor: 0xeab308, hex: '#eab308', nome: 'Médio' };
  if (p >= 4) return { cor: 0x06b6d4, hex: '#06b6d4', nome: 'Leve' };
  return { cor: 0x3b82f6, hex: '#3b82f6', nome: 'Muito leve' };
}

function getResumoCarga(volumes, bau) {
  const pedidos = new Set();
  let peso = 0;
  let volume = 0;

  (volumes || []).forEach(v => {
    if (v.pedido != null) pedidos.add(String(v.pedido));
    peso += Number(v.pesoKg) || 0;
    volume += Number(v.volumeM3) || ((Number(v.profundidadeM) || 0) * (Number(v.larguraM) || 0) * (Number(v.alturaM) || 0));
  });

  const totalBau = (Number(bau?.comprimentoM) || 0) * (Number(bau?.larguraM) || 0) * (Number(bau?.alturaM) || 0);
  const ocupPct = totalBau > 0 ? (volume / totalBau) * 100 : 0;

  return { pedidos: pedidos.size, volumes: (volumes || []).length, peso, volume, totalBau, ocupPct };
}

function atualizarResumoCargaUI(volumes, bau) {
  const r = getResumoCarga(volumes, bau || {});
  if (infoResumoCarga) infoResumoCarga.textContent = `Pedidos: ${r.pedidos} • Itens: ${r.volumes} • Peso: ${r.peso.toFixed(1)} kg • Volume: ${r.volume.toFixed(3)} m³ • Ocupação: ${r.ocupPct.toFixed(1)}%`;
  if (topPedidos) topPedidos.textContent = String(r.pedidos);
  if (topVolumes) topVolumes.textContent = String(r.volumes);
  if (topPeso) topPeso.textContent = `${r.peso.toFixed(1)} kg`;
  if (topOcupacaoPct) topOcupacaoPct.textContent = `${r.ocupPct.toFixed(1)}%`;
  if (ocupadoM3) ocupadoM3.textContent = `${r.volume.toFixed(2)} m³`;
  if (totalM3) totalM3.textContent = `${r.totalBau.toFixed(2)} m³`;
  if (ocupacaoBar) ocupacaoBar.style.width = `${Math.max(0, Math.min(100, r.ocupPct))}%`;
  if (ocupacaoPctTexto) ocupacaoPctTexto.textContent = `${r.ocupPct.toFixed(1)}%`;
  if (topProdutosQtd) topProdutosQtd.textContent = `${r.volumes} PRODUTOS`;
}

function atualizarPesoPorZonaUI(volumes) {
  const pesos = [0, 0, 0, 0, 0];
  (volumes || []).forEach(v => {
    const z = Math.max(0, Math.min(4, Number(v.zona) || 0));
    pesos[z] += Number(v.pesoKg) || 0;
  });
  pesos.forEach((p, i) => {
    const el = document.getElementById(`zonaPeso${i}`);
    if (el) el.textContent = p.toFixed(0);
  });
}

function hideTopDuplicateControls() {
  document.querySelectorAll('.viewer-top-controls, .v3d-dup-controls, [data-dup-control="1"]').forEach(el => el.remove());
  const nodes = Array.from(document.querySelectorAll('button, .chip, .toolbar-item, .action-chip'));
  let foundAnimarOutsideHud = false;
  nodes.forEach(el => {
    const txt = (el.textContent || '').trim().toLowerCase();
    const insideHud = !!el.closest('#v3d-hud-root');
    if (insideHud) return;

    if ((txt.includes('wire') || txt.includes('wireframe') || txt.includes('explod') || txt.includes('corte')) && el.parentElement) {
      el.remove();
      return;
    }

    if (txt === 'animar' || txt.includes('▶ animar')) {
      if (!foundAnimarOutsideHud) {
        foundAnimarOutsideHud = true;
        el.remove();
      }
    }
  });
}

function aplicarRegrasCarregamento(volumes, bau) {
  const L = bau.comprimentoM || 6;
  const W = bau.larguraM || 2.4;
  const H = bau.alturaM || 2.4;
  const MARG = 0.001;

  const itens = (volumes || []).map((v, i) => ({
    ...v,
    dX: Math.max(Number(v.profundidadeM) || 0.05, 0.05),
    dY: Math.max(Number(v.alturaM) || 0.05, 0.05),
    dZ: Math.max(Number(v.larguraM) || 0.05, 0.05),
    pesoUnit: Number(v.pesoKg) || 0,
    _sortIdx: i,
  }));

  itens.sort((a, b) => {
    const dPeso = b.pesoUnit - a.pesoUnit;
    if (Math.abs(dPeso) > 0.1) return dPeso;
    const volA = a.dX * a.dY * a.dZ;
    const volB = b.dX * b.dY * b.dZ;
    return volB - volA;
  });

  const STEP = 0.05;
  const NX = Math.ceil(L / STEP);
  const NY = Math.ceil(H / STEP);
  const NZ = Math.ceil(W / STEP);
  const grid = new Uint8Array(NX * NY * NZ);
  const gi = (ix, iy, iz) => ix * NY * NZ + iy * NZ + iz;

  function isLivre(x0, y0, z0, dx, dy, dz) {
    const ix0 = Math.floor(x0 / STEP);
    const iy0 = Math.floor(y0 / STEP);
    const iz0 = Math.floor(z0 / STEP);
    const ix1 = Math.min(NX, Math.ceil((x0 + dx) / STEP));
    const iy1 = Math.min(NY, Math.ceil((y0 + dy) / STEP));
    const iz1 = Math.min(NZ, Math.ceil((z0 + dz) / STEP));
    for (let ix = ix0; ix < ix1; ix++) for (let iy = iy0; iy < iy1; iy++) for (let iz = iz0; iz < iz1; iz++) if (grid[gi(ix, iy, iz)]) return false;
    return true;
  }

  function ocupar(x0, y0, z0, dx, dy, dz) {
    const ix0 = Math.floor(x0 / STEP);
    const iy0 = Math.floor(y0 / STEP);
    const iz0 = Math.floor(z0 / STEP);
    const ix1 = Math.min(NX, Math.ceil((x0 + dx) / STEP));
    const iy1 = Math.min(NY, Math.ceil((y0 + dy) / STEP));
    const iz1 = Math.min(NZ, Math.ceil((z0 + dz) / STEP));
    for (let ix = ix0; ix < ix1; ix++) for (let iy = iy0; iy < iy1; iy++) for (let iz = iz0; iz < iz1; iz++) grid[gi(ix, iy, iz)] = 1;
  }

  function temSuporteAbaixo(x0, y0, z0, dx, dz) {
    if (y0 < MARG) return true;
    const iyAbaixo = Math.floor((y0 - MARG) / STEP);
    if (iyAbaixo < 0) return true;
    const ix0 = Math.floor(x0 / STEP);
    const iz0 = Math.floor(z0 / STEP);
    const ix1 = Math.min(NX, Math.ceil((x0 + dx) / STEP));
    const iz1 = Math.min(NZ, Math.ceil((z0 + dz) / STEP));
    let ocup = 0, total = 0;
    for (let ix = ix0; ix < ix1; ix++) for (let iz = iz0; iz < iz1; iz++) { total++; if (grid[gi(ix, iyAbaixo, iz)]) ocup++; }
    return total === 0 || (ocup / total) > 0.25;
  }

  function encontrarPosicao(item, fracPesado) {
    const dx = item.dX, dy = item.dY, dz = item.dZ;
    const xSteps = [];

    if (fracPesado < 0.55) {
      for (let x = L - dx - MARG; x >= MARG; x -= STEP * 2) xSteps.push(x);
    } else {
      for (let x = MARG; x + dx <= L - MARG; x += STEP * 2) xSteps.push(x);
    }

    for (let yStep = 0; yStep * STEP + dy <= H; yStep++) {
      const y0 = yStep * STEP;
      for (const x0 of xSteps) {
        const zOpts = [];
        for (let z = MARG; z + dz <= W - MARG; z += STEP * 2) zOpts.push({ z, dist: Math.abs(z + dz / 2 - W / 2) });
        zOpts.sort((a, b) => a.dist - b.dist);
        for (const { z: z0 } of zOpts) {
          if (!temSuporteAbaixo(x0, y0, z0, dx, dz)) continue;
          if (isLivre(x0, y0, z0, dx, dy, dz)) return { x0, y0, z0 };
        }
      }
    }
    return null;
  }

  const resultado = [];
  const naoCouberam = [];
  const totalVol = L * W * H;
  let volOcup = 0;

  itens.forEach((item, i) => {
    const fracPesado = i / Math.max(itens.length, 1);
    item.dX = Math.min(item.dX, L - 2 * MARG);
    item.dY = Math.min(item.dY, H - 2 * MARG);
    item.dZ = Math.min(item.dZ, W - 2 * MARG);

    const pos = encontrarPosicao(item, fracPesado);
    if (!pos) {
      naoCouberam.push(item);
      return;
    }

    ocupar(pos.x0, pos.y0, pos.z0, item.dX, item.dY, item.dZ);
    volOcup += item.dX * item.dY * item.dZ;
    const zona = Math.max(0, Math.min(4, Math.floor((1 - (pos.x0 + item.dX / 2) / L) * 5)));
    const faixaPeso = getCorPesoInfo(item.pesoUnit);

    resultado.push({
      ...item,
      px: pos.x0 + item.dX / 2,
      py: pos.y0 + item.dY / 2,
      pz: pos.z0 + item.dZ / 2,
      x: pos.x0,
      y: pos.y0,
      z: pos.z0,
      profundidadeM: item.dX,
      larguraM: item.dZ,
      alturaM: item.dY,
      zona,
      pesoKg: item.pesoUnit,
      volumeM3: item.dX * item.dY * item.dZ,
      cor: faixaPeso.cor,
      corHex: faixaPeso.hex,
      faixaPeso: faixaPeso.nome,
    });
  });

  if (naoCouberam.length > 0) showToast(`⚠ ${naoCouberam.length} item(s) não couberam no baú selecionado.`);
  return { volumes: resultado, volOcup, totalVol, naoCouberam };
}

function criarMateriaisCaixa(v, highlight) {
  const faixa = getCorPesoInfo(v.pesoKg);
  v.cor = faixa.cor;
  v.corHex = faixa.hex;
  v.faixaPeso = faixa.nome;

  const emissive = highlight ? new THREE.Color(0xfacc15) : new THREE.Color(0x000000);
  const emissiveIntensity = highlight ? 0.45 : 0;

  const makeMat = () => new THREE.MeshStandardMaterial({
    color: faixa.cor,
    metalness: 0.08,
    roughness: 0.58,
    emissive,
    emissiveIntensity,
    transparent: true,
    opacity: 0.96,
    clippingPlanes: sectionOn && sectionPlane ? [sectionPlane] : [],
  });

  return [makeMat(), makeMat(), makeMat(), makeMat(), makeMat(), makeMat()];
}

function initThree() {
  if (!canvasContainer) throw new Error('canvasContainer não encontrado no DOM');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04050a);
  scene.fog = new THREE.FogExp2(0x04050a, 0.018);

  const width = canvasContainer.clientWidth || 800;
  const height = canvasContainer.clientHeight || 600;

  camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 5000);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  canvasContainer.appendChild(renderer.domElement);

  const amb = new THREE.AmbientLight(0xffffff, 0.42);
  scene.add(amb);

  const dir1 = new THREE.DirectionalLight(0xfff5e0, 1.05);
  dir1.position.set(8, 14, 6);
  dir1.castShadow = true;
  dir1.shadow.mapSize.width = 2048;
  dir1.shadow.mapSize.height = 2048;
  dir1.shadow.camera.near = 0.5;
  dir1.shadow.camera.far = 60;
  dir1.shadow.camera.left = -20;
  dir1.shadow.camera.right = 20;
  dir1.shadow.camera.top = 20;
  dir1.shadow.camera.bottom = -20;
  dir1.shadow.bias = -0.001;
  scene.add(dir1);

  const dir2 = new THREE.DirectionalLight(0x3b82f6, 0.2);
  dir2.position.set(-6, 8, -4);
  scene.add(dir2);

  const rim = new THREE.DirectionalLight(0xf59e0b, 0.08);
  rim.position.set(20, 2, 10);
  scene.add(rim);

  const hemi = new THREE.HemisphereLight(0x88aaff, 0x442200, 0.28);
  scene.add(hemi);

  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({ color: 0x0a0d18, metalness: 0.1, roughness: 0.95 })
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -0.01;
  floorMesh.receiveShadow = true;
  floorMesh.userData.persistentBase = true;
  scene.add(floorMesh);

  const grid = new THREE.GridHelper(80, 80, 0x111827, 0x111827);
  grid.position.y = 0;
  grid.userData.persistentBase = true;
  scene.add(grid);

  sectionPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 9999);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.autoRotate = false;
  controls.target.set(0, 1.2, 0);
  controls.update();

  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  if (!camera || !renderer || !canvasContainer) return;
  const w = canvasContainer.clientWidth || 800;
  const h = canvasContainer.clientHeight || 600;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function clearScene() {
  const toRemove = [];
  scene.traverse(obj => {
    if (obj.isMesh || obj.isLineSegments) {
      if (!obj.userData?.persistentBase) toRemove.push(obj);
    }
  });

  toRemove.forEach(m => {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach(mat => mat.dispose());
    }
  });

  volumesMesh = [];
  volumesEdges = [];
}

function criarBau(caminhao) {
  if (!caminhao) return;
  const C = caminhao.comprimentoM || 6;
  const A = caminhao.alturaM || 2.4;
  const L = caminhao.larguraM || 2.4;
  const E = 0.04;

  const chao = new THREE.Mesh(
    new THREE.BoxGeometry(C, E, L),
    new THREE.MeshStandardMaterial({ color: 0x1a0d05, metalness: 0.2, roughness: 0.95 })
  );
  chao.position.set(C / 2, E / 2, L / 2);
  chao.receiveShadow = true;
  scene.add(chao);

  const trilhoMat = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.75, roughness: 0.3 });
  [0.08, L - 0.08].forEach(z => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(C, 0.04, 0.06), trilhoMat);
    t.position.set(C / 2, 0.06, z);
    scene.add(t);
  });

  const wMat = new THREE.MeshStandardMaterial({
    color: 0x1e3a5f,
    metalness: 0.35,
    roughness: 0.6,
    transparent: true,
    opacity: 0.14,
    side: THREE.DoubleSide
  });

  [[C / 2, A / 2, 0], [C / 2, A / 2, L]].forEach(([px, py, pz]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(C, A, E), wMat);
    m.position.set(px, py, pz);
    scene.add(m);
  });

  const fundo = new THREE.Mesh(new THREE.BoxGeometry(E, A, L), wMat);
  fundo.position.set(C, A / 2, L / 2);
  scene.add(fundo);

  const teto = new THREE.Mesh(new THREE.BoxGeometry(C, E, L), wMat);
  teto.position.set(C / 2, A, L / 2);
  scene.add(teto);

  const bauEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(C, A, L));
  const wire = new THREE.LineSegments(bauEdges, new THREE.LineBasicMaterial({ color: 0x1e40af }));
  wire.position.set(C / 2, A / 2, L / 2);
  scene.add(wire);

  if (infoCaminhao) infoCaminhao.textContent = `${caminhao.descricao || caminhao.id || 'Caminhão'} • ${C.toFixed(2)}m × ${L.toFixed(2)}m × ${A.toFixed(2)}m`;
}

function criarVolumesAnimados(volumes) {
  volumesMesh.forEach(m => scene.remove(m));
  volumesEdges.forEach(e => scene.remove(e));
  volumesMesh = [];
  volumesEdges = [];

  if (!volumes || !volumes.length) return;

  volumes.forEach(v => {
    const profM = Math.max(Number(v.profundidadeM) || 0.1, 0.05);
    const altM = Math.max(Number(v.alturaM) || 0.1, 0.05);
    const larM = Math.max(Number(v.larguraM) || 0.1, 0.05);

    const geo = new THREE.BoxGeometry(profM, altM, larM);
    const mats = criarMateriaisCaixa(v, false);
    (Array.isArray(mats) ? mats : [mats]).forEach(m => { m.transparent = true; m.opacity = 0; });

    const mesh = new THREE.Mesh(geo, mats);
    const cx = v.px != null ? v.px : ((Number(v.x) || 0) + profM / 2);
    const cy = v.py != null ? v.py : ((Number(v.y) || 0) + altM / 2);
    const cz = v.pz != null ? v.pz : ((Number(v.z) || 0) + larM / 2);

    mesh.position.set(cx, cy + 2.5, cz);
    mesh.userData.volumeData = v;
    mesh.userData.targetY = cy;
    mesh.userData.basePosition = new THREE.Vector3(cx, cy, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    volumesMesh.push(mesh);

    const eLine = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, clippingPlanes: sectionOn && sectionPlane ? [sectionPlane] : [] })
    );
    eLine.position.set(cx, cy + 2.5, cz);
    eLine.userData.parentId = v.id;
    eLine.userData.basePosition = new THREE.Vector3(cx, cy, cz);
    eLine.frustumCulled = false;
    scene.add(eLine);
    volumesEdges.push(eLine);
  });
}

function showVolumeAnimado(idx) {
  if (idx >= volumesMesh.length) return;
  const mesh = volumesMesh[idx];
  const eLine = volumesEdges[idx];
  const v = mesh.userData.volumeData;
  const targetY = mesh.userData.targetY ?? mesh.position.y;

  let t = 0;
  const startY = mesh.position.y;
  const DUR = 340;
  let lt = null;

  function step(now) {
    if (!lt) lt = now;
    t += now - lt;
    lt = now;
    const p = Math.min(t / DUR, 1);
    const ease = 1 - Math.pow(1 - p, 3);

    mesh.position.y = startY + (targetY - startY) * ease;
    if (eLine) eLine.position.y = mesh.position.y;

    const op = ease * 0.92;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(m => { m.opacity = op; });
    if (eLine) eLine.material.opacity = ease * 0.45;

    if (p < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
  _atualizarHUDAnimacao(idx, v);
  _destacarItemLista(v);
}

function _atualizarHUDAnimacao(idx, v) {
  const total = volumesMesh.length;
  const pct = ((idx + 1) / total * 100).toFixed(0);

  const bar = document.getElementById('v3d-prog-fill');
  const label = document.getElementById('v3d-prog-label');
  const cnt = document.getElementById('v3d-prog-count');
  const fly = document.getElementById('v3d-fly-label');
  const zona = document.getElementById('v3d-zona-label');

  if (bar) bar.style.width = pct + '%';
  if (label) label.textContent = (v.descrprod || v.codprod || '—').slice(0, 40);
  if (cnt) cnt.textContent = `${idx + 1}/${total}`;

  if (fly) {
    const pesoStr = v.pesoKg ? `${Number(v.pesoKg).toFixed(1)} kg` : '';
    fly.textContent = `${v.descrprod || v.codprod || 'Item'}${pesoStr ? ' · ' + pesoStr : ''}`;
    fly.classList.add('show');
    setTimeout(() => fly.classList.remove('show'), 1400);
  }

  if (zona && v.zona != null) {
    const msgs = [
      '⚖ PESADO → posicionado na TRASEIRA',
      '📦 Item médio-pesado → meia-traseira',
      '📦 Empilhamento central',
      '🔒 Item mais leve → meia-frente',
      '🔒 LEVE → posicionado na FRENTE'
    ];
    zona.textContent = msgs[Math.min(v.zona, 4)] || '';
    zona.classList.add('show');
    setTimeout(() => zona.classList.remove('show'), 1300);
  }
}

function _destacarItemLista(v) {
  if (!listaVolumesEl) return;
  const card = listaVolumesEl.querySelector(`.v3d-volume-item[data-id="${v.id}"]`);
  if (!card) return;
  const cor = v.corHex || (v.cor ? '#' + Number(v.cor).toString(16).padStart(6, '0') : '#22c55e');
  card.style.borderColor = cor;
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => { card.style.borderColor = ''; }, 900);
}

function playAnim() {
  if (animPlaying) return;
  animPlaying = true;
  _setProg(true);
  document.getElementById('v3d-btn-play')?.classList.add('ativo');
  requestAnimationFrame(tickAnim);
}

function pauseAnim() {
  animPlaying = false;
  animLastTick = null;
  document.getElementById('v3d-btn-play')?.classList.remove('ativo');
}

function resetAnim() {
  pauseAnim();
  animIdx = 0;
  animTimer = 0;

  volumesMesh.forEach((m, i) => {
    const targetY = m.userData.targetY ?? m.position.y;
    m.position.y = targetY + 2.5;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach(mt => { mt.opacity = 0; });
    if (volumesEdges[i]) volumesEdges[i].material.opacity = 0;
  });

  _setProg(false);

  const bar = document.getElementById('v3d-prog-fill');
  const label = document.getElementById('v3d-prog-label');
  const cnt = document.getElementById('v3d-prog-count');

  if (bar) bar.style.width = '0%';
  if (label) label.textContent = 'Aguardando...';
  if (cnt) cnt.textContent = `0/${volumesMesh.length}`;
}

function skipFim() {
  pauseAnim();

  volumesMesh.forEach((m, i) => {
    const targetY = m.userData.targetY ?? m.position.y;
    m.position.y = targetY;
    if (volumesEdges[i]) volumesEdges[i].position.y = targetY;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach(mt => { mt.opacity = 0.92; });
    if (volumesEdges[i]) volumesEdges[i].material.opacity = 0.45;
  });

  animIdx = volumesMesh.length;
  const bar = document.getElementById('v3d-prog-fill');
  if (bar) bar.style.width = '100%';
  _setProg(false);
}

function _setProg(show) {
  const el = document.getElementById('v3d-prog-wrap');
  if (el) el.style.display = show ? 'block' : 'none';
}

function tickAnim(now) {
  if (!animPlaying) return;
  if (!animLastTick) animLastTick = now;
  animTimer += now - animLastTick;
  animLastTick = now;

  const interval = ANIM_BASE_MS / animSpeed;
  if (animTimer >= interval) {
    animTimer = 0;
    if (animIdx < volumesMesh.length) {
      showVolumeAnimado(animIdx);
      animIdx++;
    } else {
      pauseAnim();
      setTimeout(() => _setProg(false), 2200);
      animLastTick = null;
      return;
    }
  }

  requestAnimationFrame(tickAnim);
}

function toggleWireframe() {
  wireOn = !wireOn;
  volumesMesh.forEach(m => {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach(mt => { mt.wireframe = wireOn; });
  });
  document.getElementById('v3d-btn-wire')?.classList.toggle('ativo', wireOn);
}

function toggleExplode() {
  explodOn = !explodOn;
  document.getElementById('v3d-btn-explode')?.classList.toggle('ativo', explodOn);

  volumesMesh.forEach((m, i) => {
    const base = m.userData.basePosition || m.position.clone();
    const targetY = m.userData.targetY ?? m.position.y;
    const cam = carga?._caminhaoAtual || carga?.caminhao || {};
    const CX = (cam.comprimentoM || 6) / 2;
    const CY = (cam.alturaM || 2.4) / 2;
    const CZ = (cam.larguraM || 2.4) / 2;

    const pos = explodOn
      ? { x: base.x + (base.x - CX) * 0.35, y: targetY + (targetY - CY) * 0.35, z: base.z + (base.z - CZ) * 0.35 }
      : { x: base.x, y: targetY, z: base.z };

    m.position.set(pos.x, pos.y, pos.z);
    if (volumesEdges[i]) volumesEdges[i].position.set(pos.x, pos.y, pos.z);
  });
}

function toggleSection() {
  sectionOn = !sectionOn;
  document.getElementById('v3d-btn-section')?.classList.toggle('ativo', sectionOn);

  const cam = carga?._caminhaoAtual || carga?.caminhao || {};
  if (sectionOn) {
    const mid = (cam.comprimentoM || 6) * 0.52;
    sectionPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), mid);
    renderer.clippingPlanes = [sectionPlane];
    renderer.localClippingEnabled = true;
  } else {
    renderer.clippingPlanes = [];
    renderer.localClippingEnabled = false;
  }

  volumesMesh.forEach(m => {
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    mats.forEach(mt => {
      mt.clippingPlanes = sectionOn && sectionPlane ? [sectionPlane] : [];
      mt.needsUpdate = true;
    });
  });

  volumesEdges.forEach(e => {
    e.material.clippingPlanes = sectionOn && sectionPlane ? [sectionPlane] : [];
    e.material.needsUpdate = true;
  });
}

function toggleAutoRotate() {
  controls.autoRotate = !controls.autoRotate;
  document.getElementById('v3d-btn-rotate')?.classList.toggle('ativo', controls.autoRotate);
}

function recenterCamera() {
  try {
    const objs = [...volumesMesh, ...volumesEdges].filter(Boolean);
    const camAtual = carga?._caminhaoAtual || carga?.caminhao || {};

    if (objs.length) {
      const box = new THREE.Box3();
      objs.forEach(o => box.expandByObject(o));
      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 10;
      const dist = maxDim * 2.25;
      camera.position.set(center.x + dist * 0.85, center.y + dist * 0.62, center.z + dist * 0.95);
      camera.lookAt(center);
      currentCenter.copy(center);
      if (controls) { controls.target.copy(center); controls.update(); }
      return;
    }

    const CX = (camAtual.comprimentoM || 6) / 2;
    const CY = (camAtual.alturaM || 2.4) / 2;
    const CZ = (camAtual.larguraM || 2.4) / 2;
    const baseTarget = new THREE.Vector3(CX, CY, CZ);
    camera.position.set(CX + 8, CY + 4, CZ + 8);
    camera.lookAt(baseTarget);
    currentCenter.copy(baseTarget);
    if (controls) { controls.target.copy(baseTarget); controls.update(); }
  } catch (e) { console.error('[CAM]', e); }
}

function setCamFront() {
  const cam = carga?._caminhaoAtual || carga?.caminhao || {};
  const CX = (cam.comprimentoM || 6) / 2;
  const CY = (cam.alturaM || 2.4) / 2;
  const CZ = (cam.larguraM || 2.4) / 2;
  camera.position.set(CX * 2, CY * 2, CZ - (cam.larguraM || 2.4) * 4);
  camera.lookAt(CX, CY, CZ);
  if (controls) { controls.target.set(CX, CY, CZ); controls.update(); }
}

function setCamTop() {
  const cam = carga?._caminhaoAtual || carga?.caminhao || {};
  const CX = (cam.comprimentoM || 6) / 2;
  const CZ = (cam.larguraM || 2.4) / 2;
  camera.position.set(CX, 12, CZ);
  camera.lookAt(CX, 0, CZ);
  if (controls) { controls.target.set(CX, 0, CZ); controls.update(); }
}

function setCamSide() {
  const cam = carga?._caminhaoAtual || carga?.caminhao || {};
  const CX = (cam.comprimentoM || 6) / 2;
  const CY = (cam.alturaM || 2.4) / 2;
  const CZ = (cam.larguraM || 2.4) / 2;
  camera.position.set(CX, CY, CZ + (cam.larguraM || 2.4) * 4);
  camera.lookAt(CX, CY, CZ);
  if (controls) { controls.target.set(CX, CY, CZ); controls.update(); }
}

function focusCameraOnVolume(volumeId) {
  const mesh = volumesMesh.find(m => m.userData.volumeData?.id === volumeId);
  if (!mesh) return;
  const tp = mesh.position.clone();
  camera.position.copy(tp.clone().add(new THREE.Vector3(2, 1.5, 3)));
  camera.lookAt(tp);
  if (controls) { controls.target.copy(tp); controls.update(); }
}

function resetCamera() {
  recenterCamera();
}

function highlightMesh(volumeId, highlight) {
  volumesMesh.forEach(m => {
    if (m.userData.volumeData?.id === volumeId) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach(mt => {
        if (mt.emissive) mt.emissive.set(highlight ? 0xfacc15 : 0x000000);
        mt.emissiveIntensity = highlight ? 0.45 : 0;
      });
      m.scale.setScalar(highlight ? 1.04 : 1);
    }
  });

  volumesEdges.forEach(e => {
    if (e.userData.parentId === volumeId) {
      e.material.color.set(highlight ? 0xfacc15 : 0x000000);
      e.material.opacity = highlight ? 0.88 : 0.3;
    }
  });
}

function highlightVolumeCard(volumeId, highlight) {
  if (!listaVolumesEl) return;
  listaVolumesEl.querySelectorAll('.v3d-volume-item').forEach(card => {
    const same = String(card.dataset.id) === String(volumeId);
    card.classList.toggle('ativo', highlight && same);
    if (highlight && same) card.style.borderColor = '#facc15';
    if (!highlight && same) card.style.borderColor = '';
  });
}

function renderListaVolumes(volumes) {
  if (!listaVolumesEl) return;
  listaVolumesEl.innerHTML = '';

  if (!volumes || !volumes.length) {
    listaVolumesEl.innerHTML = '<div class="v3d-volume-sub">Nenhum item para exibir.</div>';
    return;
  }

  const frag = document.createDocumentFragment();

  volumes.forEach(v => {
    const faixa = getCorPesoInfo(v.pesoKg);
    const corHex = v.corHex || faixa.hex;
    const zona = v.zona != null ? ZONA_NOMES[v.zona] : '—';
    const vendedor = v.vendedor || v.nomeVendedor || v.nomevendedor || v.nome_vendedor || '—';

    const card = document.createElement('div');
    card.className = 'v3d-volume-item';
    card.dataset.id = v.id;
    card.dataset.pedido = v.pedido;

    const hdr = document.createElement('div');
    hdr.className = 'v3d-volume-header';

    const tw = document.createElement('div');
    tw.style.cssText = 'display:flex;align-items:center;gap:6px;min-width:0';

    const dot = document.createElement('span');
    dot.style.cssText = `display:inline-block;width:9px;height:9px;border-radius:50%;background:${corHex};flex-shrink:0`;

    const title = document.createElement('div');
    title.className = 'v3d-volume-title';
    title.textContent = `Ped ${v.pedido} · ${v.codprod || v.descrprod || 'Volume'}`;

    tw.appendChild(dot);
    tw.appendChild(title);

    const chip = document.createElement('div');
    chip.className = 'v3d-volume-chip';
    chip.textContent = `${(Number(v.pesoKg) || 0).toFixed(1)} kg`;

    hdr.appendChild(tw);
    hdr.appendChild(chip);

    const sub1 = document.createElement('div');
    sub1.className = 'v3d-volume-sub';
    sub1.textContent = v.descrprod || v.codprod || 'Volume agregado';

    const sub2 = document.createElement('div');
    sub2.className = 'v3d-volume-sub';
    sub2.textContent = `${(Number(v.profundidadeM) || 0).toFixed(2)}×${(Number(v.larguraM) || 0).toFixed(2)}×${(Number(v.alturaM) || 0).toFixed(2)} m · Zona: ${zona}`;

    const sub3 = document.createElement('div');
    sub3.className = 'v3d-volume-sub';
    sub3.textContent = `Vendedor: ${vendedor} · Faixa: ${v.faixaPeso || faixa.nome}`;

    card.appendChild(hdr);
    card.appendChild(sub1);
    card.appendChild(sub2);
    card.appendChild(sub3);

    card.addEventListener('mouseenter', () => { highlightVolumeCard(v.id, true); highlightMesh(v.id, true); });
    card.addEventListener('mouseleave', () => { highlightVolumeCard(v.id, false); highlightMesh(v.id, false); });
    card.addEventListener('click', () => { focusCameraOnVolume(v.id); });

    frag.appendChild(card);
  });

  listaVolumesEl.appendChild(frag);
}

function applyFiltroPedido() {
  if (!carga || !carga._volumesAtuais) return;
  const filtro = (filtroPedidoInput?.value || '').trim().toLowerCase();
  const vols = filtro
    ? carga._volumesAtuais.filter(v => String(v.pedido).toLowerCase().includes(filtro))
    : carga._volumesAtuais;
  renderListaVolumes(vols);
}

function imprimirLayout() {
  if (!carga?._volumesAtuais?.length) {
    showToast('Nenhum item para imprimir.');
    return;
  }

  const cam = carga._caminhaoAtual || {};
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;

  const titulo = `Layout de carga – ${cam.descricao || cam.id || ''}`;
  const linhas = carga._volumesAtuais.map(v => `
    <tr>
      <td>${v.pedido}</td>
      <td>${v.descrprod || v.codprod || '—'}</td>
      <td>${v.vendedor || v.nomeVendedor || v.nomevendedor || v.nome_vendedor || '—'}</td>
      <td style="text-align:right">${(v.pesoKg || 0).toFixed(1)}</td>
      <td style="text-align:right">${(v.volumeM3 || 0).toFixed(4)}</td>
      <td>${(v.profundidadeM || 0).toFixed(2)} × ${(v.larguraM || 0).toFixed(2)} × ${(v.alturaM || 0).toFixed(2)}</td>
      <td>${v.zona != null ? ZONA_NOMES[v.zona] : '—'}</td>
    </tr>
  `).join('');

  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
    <title>${titulo}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:11px;color:#111}
      h1{font-size:14px;margin-bottom:4px}
      p{font-size:11px;color:#555;margin-bottom:8px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #d1d5db;padding:4px 6px}
      th{background:#f3f4f6;font-weight:600}
      tr:nth-child(even){background:#fafafa}
    </style>
    </head><body>
    <h1>${titulo}</h1>
    <p>${infoResumoCarga ? infoResumoCarga.textContent : ''}</p>
    <table>
      <thead><tr>
        <th>Pedido</th><th>Produto</th><th>Vendedor</th><th>Peso (kg)</th><th>Volume (m³)</th><th>Dimensões (m)</th><th>Zona</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <p style="margin-top:12px;color:#888;font-size:10px">
      Regra aplicada: mais pesado na traseira · mais leve na frente e topo
    </p>
    <script>window.print();<\/script></body></html>`);
  win.document.close();
}

function injetarHUD() {
  if (!canvasContainer) return;
  const existing = document.getElementById('v3d-hud-root');
  if (existing) existing.remove();

  const hud = document.createElement('div');
  hud.id = 'v3d-hud-root';
  hud.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:"DM Mono",monospace;';

  hud.innerHTML = `
    <div id="v3d-fly-label" style="
      position:absolute;top:10px;left:50%;transform:translateX(-50%);
      background:rgba(4,5,10,.92);border:1px solid #f59e0b;border-radius:5px;
      padding:4px 14px;font-size:11px;font-weight:700;color:#f59e0b;
      letter-spacing:.04em;pointer-events:none;opacity:0;transition:opacity .22s;
      white-space:nowrap;
    "></div>

    <div id="v3d-zona-label" style="
      position:absolute;top:40px;left:50%;transform:translateX(-50%);
      background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.45);border-radius:4px;
      padding:3px 12px;font-size:10px;color:#ef4444;pointer-events:none;
      opacity:0;transition:opacity .2s;white-space:nowrap;
    "></div>

    <div id="v3d-prog-wrap" style="
      display:none;position:absolute;bottom:52px;left:50%;transform:translateX(-50%);
      width:320px;background:rgba(4,5,10,.94);border:1px solid #1c2235;
      border-radius:7px;padding:9px 13px;
    ">
      <div style="display:flex;justify-content:space-between;font-size:10px;color:#4a5568;margin-bottom:4px">
        <span id="v3d-prog-label" style="color:#e2e8f0;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Aguardando...</span>
        <span id="v3d-prog-count" style="flex-shrink:0">0/0</span>
      </div>
      <div style="height:3px;background:#1c2235;border-radius:999px;overflow:hidden">
        <div id="v3d-prog-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#f59e0b,#f97316);border-radius:999px;transition:width .22s ease"></div>
      </div>
    </div>

    <div style="position:absolute;bottom:8px;left:8px;display:flex;gap:5px;pointer-events:all">
      <button id="v3d-btn-play" onclick="window.__v3d.playAnim()" style="${_btnStyle('#f59e0b')}">▶ Animar</button>
      <button onclick="window.__v3d.pauseAnim()" style="${_btnStyle()}">⏸</button>
      <button onclick="window.__v3d.resetAnim()" style="${_btnStyle()}">⏮</button>
      <button onclick="window.__v3d.skipFim()" style="${_btnStyle()}">⏭</button>
      <input type="range" min="1" max="12" value="5" style="width:70px;accent-color:#f59e0b;align-self:center"
        oninput="window.__v3d.setSpeed(this.value)"/>
      <span id="v3d-spd-lbl" style="font-size:10px;color:#94a3b8;align-self:center">5×</span>
    </div>

    <div style="position:absolute;bottom:8px;right:8px;display:flex;gap:5px;flex-wrap:wrap;pointer-events:all;justify-content:flex-end">
      <button onclick="window.__v3d.setCamFront()" style="${_btnStyle()}">◼ Frente</button>
      <button onclick="window.__v3d.setCamTop()" style="${_btnStyle()}">▽ Topo</button>
      <button onclick="window.__v3d.setCamSide()" style="${_btnStyle()}">◁ Lateral</button>
      <button id="v3d-btn-wire" onclick="window.__v3d.toggleWireframe()" style="${_btnStyle()}">◫ Wireframe</button>
      <button id="v3d-btn-explode" onclick="window.__v3d.toggleExplode()" style="${_btnStyle()}">⊕ Explodir</button>
      <button id="v3d-btn-section" onclick="window.__v3d.toggleSection()" style="${_btnStyle()}">✂ Corte</button>
      <button id="v3d-btn-rotate" onclick="window.__v3d.toggleAutoRotate()" style="${_btnStyle()}">↺ Girar</button>
    </div>

    <div style="position:absolute;bottom:55px;right:8px;font-size:9px;color:#4a5568;text-align:right;pointer-events:none">
      ← FRENTE &nbsp;&nbsp;&nbsp; TRASEIRA →
    </div>
  `;

  canvasContainer.style.position = 'relative';
  canvasContainer.appendChild(hud);

  const existingStyle = document.getElementById('v3d-hud-style');
  if (existingStyle) existingStyle.remove();

  const style = document.createElement('style');
  style.id = 'v3d-hud-style';
  style.textContent = `
    .v3d-hud-btn.ativo, #v3d-hud-root button.ativo { border-color:#f59e0b !important; color:#f59e0b !important; background:rgba(245,158,11,.09) !important; }
    #v3d-fly-label.show { opacity:1 !important; }
    #v3d-zona-label.show { opacity:1 !important; }
    .v3d-volume-item.ativo { border-color:#facc15 !important; }
  `;
  document.head.appendChild(style);
}

function _btnStyle(accent) {
  return `
    pointer-events:all;
    background:rgba(4,5,10,.88);
    border:1px solid ${accent || '#1c2235'};
    color:${accent || '#e2e8f0'};
    font-family:'DM Mono',monospace;font-size:10px;
    padding:4px 9px;border-radius:4px;cursor:pointer;
    transition:border-color .15s,color .15s;
    white-space:nowrap;letter-spacing:.03em;
  `;
}

function initCaminhaoSelector() {
  if (!selectCaminhao) return;
  const caminhoes = carga.caminhoes || (carga.caminhao ? [carga.caminhao] : []);
  if (!caminhoes.length) return;

  selectCaminhao.innerHTML = '';
  caminhoes.forEach((cam, idx) => {
    const opt = document.createElement('option');
    opt.value = cam.id != null ? cam.id : idx;
    opt.textContent = cam.descricao || `Caminhão ${idx + 1}`;
    selectCaminhao.appendChild(opt);
  });

  selectCaminhao.addEventListener('change', () => {
    renderForCaminhao(selectCaminhao.value);
  });

  const idInicial = (carga.caminhao?.id) || caminhoes[0]?.id || 0;
  selectCaminhao.value = String(idInicial);
}

function getCaminhaoById(idSel) {
  const caminhoes = carga.caminhoes || (carga.caminhao ? [carga.caminhao] : []);
  return caminhoes.find(c => String(c.id) === String(idSel)) || caminhoes[0] || null;
}

function getVolumesForCaminhao(idSel) {
  if (carga.alocacao) return (carga.volumes || []).filter(v => String(carga.alocacao[v.id]) === String(idSel));
  return carga.volumes || [];
}

function renderForCaminhao(idSel) {
  clearScene();

  const cam = getCaminhaoById(idSel);
  const volumes = getVolumesForCaminhao(idSel);

  carga._caminhaoAtual = cam;

  const { volumes: volsComRegras, volOcup, totalVol } = aplicarRegrasCarregamento(volumes, cam || {});
  carga._volumesAtuais = volsComRegras;
  carga._volOcup = volOcup;
  carga._totalVol = totalVol;
  volumesComRegras = volsComRegras;

  criarBau(cam);
  criarVolumesAnimados(volsComRegras);
  renderListaVolumes(volsComRegras);
  atualizarResumoCargaUI(volsComRegras, cam || {});
  atualizarPesoPorZonaUI(volsComRegras);
  recenterCamera();
  injetarHUD();
  hideTopDuplicateControls();

  animIdx = 0;
  animTimer = 0;
  animPlaying = false;
  animLastTick = null;

  setTimeout(() => playAnim(), 700);
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

window.__v3d = {
  playAnim,
  pauseAnim,
  resetAnim,
  skipFim,
  resetCamera,
  imprimirLayout,
  setSpeed: (v) => {
    animSpeed = Number(v);
    const lbl = document.getElementById('v3d-spd-lbl');
    if (lbl) lbl.textContent = v + '×';
  },
  toggleWireframe,
  toggleExplode,
  toggleSection,
  toggleAutoRotate,
  setCamFront,
  setCamTop,
  setCamSide,
};

window.resetCam = resetCamera;
window.setCamFront = setCamFront;
window.setCamTop = setCamTop;
window.setCamSide = setCamSide;

document.addEventListener('DOMContentLoaded', () => {
  carga = obterCargaDoOpener();

  if (!carga) {
    showToast('Dados de carga 3D não encontrados. Abra o viewer a partir da tela de rotas.');
    carga = {
      caminhao: {
        id: 'toco-1',
        descricao: 'Toco 1719 RDB-9B71',
        comprimentoM: 6.95,
        larguraM: 2.50,
        alturaM: 2.00,
      },
      volumes: [
        { id:'V1', pedido:'739968', codprod:'19377', descrprod:'TURFA GEL BB 20 LT', larguraM:0.290, alturaM:0.400, profundidadeM:0.230, pesoKg:22.97, volumeM3:0.027, x:0, y:0, z:0, cor:0x22c55e, nomevendedor:'Demo' },
        { id:'V2', pedido:'739968', codprod:'21590', descrprod:'LITHAMIN PLUS BB 20 LT', larguraM:0.270, alturaM:0.380, profundidadeM:0.240, pesoKg:25.0, volumeM3:0.025, x:0, y:0, z:0, cor:0x3b82f6, nomevendedor:'Demo' },
        { id:'V3', pedido:'739968', codprod:'230', descrprod:'AMINO PLUS 20 LT', larguraM:0.330, alturaM:0.380, profundidadeM:0.240, pesoKg:27.2, volumeM3:0.030, x:0, y:0, z:0, cor:0xf97316, nomevendedor:'Demo' },
        { id:'V4', pedido:'739968', codprod:'3298', descrprod:'LITHOCAL BD 10 LT', larguraM:0.280, alturaM:0.280, profundidadeM:0.280, pesoKg:16.64, volumeM3:0.022, x:0, y:0, z:0, cor:0xa855f7, nomevendedor:'Demo' },
        { id:'V5', pedido:'749641', codprod:'24458', descrprod:'AMINO ARGININE 1LT', larguraM:0.370, alturaM:0.260, profundidadeM:0.280, pesoKg:1.0, volumeM3:0.027, x:0, y:0, z:0, cor:0x14b8a6, nomevendedor:'Demo' },
        { id:'V6', pedido:'748204', codprod:'26598', descrprod:'AMINO FORT 1L', larguraM:0.370, alturaM:0.260, profundidadeM:0.280, pesoKg:1.1, volumeM3:0.027, x:0, y:0, z:0, cor:0xf59e0b, nomevendedor:'Demo' },
      ],
    };
  }

  try { initThree(); } catch (e) { console.error('[INIT] initThree ERRO:', e); return; }
  try { initCaminhaoSelector(); } catch (e) { console.error('[INIT] initCaminhaoSelector ERRO:', e); }

  const idInicial = (carga.caminhao?.id) || (carga.caminhoes?.[0]?.id) || 0;

  try { renderForCaminhao(String(idInicial)); } catch (e) { console.error('[INIT] renderForCaminhao ERRO:', e); return; }

  animate();

  if (btnResetCamera) btnResetCamera.addEventListener('click', resetCamera);
  if (btnImprimirLayout) btnImprimirLayout.addEventListener('click', imprimirLayout);
  if (filtroPedidoInput) filtroPedidoInput.addEventListener('input', applyFiltroPedido);

  console.log('[INIT] VIEWER3D totalmente inicializado ✅');
});