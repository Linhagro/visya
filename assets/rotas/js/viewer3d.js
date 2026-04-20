// assets/rotas/js/viewer3d.js
import * as THREE from './three/three.module.js';
import { OrbitControls } from './three/OrbitControls.js';

console.log('[VIEWER3D] módulo carregado (three ES module + OrbitControls)');
console.log('[VIEWER3D] THREE versão:', THREE.REVISION);

let scene, camera, renderer, controls;
let carga = null;
let volumesMesh = [];
let currentCenter = new THREE.Vector3(0, 0, 0);

console.log('[VIEWER3D] buscando elementos do DOM...');
const canvasContainer  = document.getElementById('viewer3dCanvas');
const infoCaminhao     = document.getElementById('infoCaminhao');
const infoResumoCarga  = document.getElementById('infoResumoCarga');
const listaVolumesEl   = document.getElementById('listaVolumes');
const selectCaminhao   = document.getElementById('selectCaminhao');
const btnResetCamera   = document.getElementById('btnResetCamera');
const btnImprimirLayout = document.getElementById('btnImprimirLayout');
const filtroPedidoInput = document.getElementById('filtroPedido');

console.log('[VIEWER3D] DOM elementos:', {
  canvasContainer:   !!canvasContainer,
  infoCaminhao:      !!infoCaminhao,
  infoResumoCarga:   !!infoResumoCarga,
  listaVolumesEl:    !!listaVolumesEl,
  selectCaminhao:    !!selectCaminhao,
  btnResetCamera:    !!btnResetCamera,
  btnImprimirLayout: !!btnImprimirLayout,
  filtroPedidoInput: !!filtroPedidoInput
});

// ─────────────────────────────────────────────────────────────────
// GERADOR DE TEXTURA DE PAPELÃO
// ─────────────────────────────────────────────────────────────────
function gerarTexturaPapelao(opcoes) {
  console.log('[TEX] gerando textura:', opcoes);
  opcoes = opcoes || {};

  const largura  = opcoes.largura  || 512;
  const altura   = opcoes.altura   || 512;
  const pedido   = opcoes.pedido   || '';
  const codprod  = opcoes.codprod  || '';
  const corFaixa = opcoes.corFaixa || null;
  const face     = opcoes.face     || 'lado';

  try {
    const canvas = document.createElement('canvas');
    canvas.width  = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('[TEX] ctx 2D não disponível');
      return new THREE.Texture();
    }

    // Fundo papelão
    const grad = ctx.createLinearGradient(0, 0, largura, altura);
    grad.addColorStop(0,   '#c9a96e');
    grad.addColorStop(0.3, '#d4b07a');
    grad.addColorStop(0.6, '#c09060');
    grad.addColorStop(1,   '#b8864e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, largura, altura);

    // Ondulações
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth   = 1;
    for (let y = 0; y < altura; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= largura; x += 4) {
        ctx.lineTo(x, y + Math.sin(x / 8) * 2);
      }
      ctx.stroke();
    }

    // Riscos de fibra
    ctx.strokeStyle = 'rgba(80,40,0,0.06)';
    ctx.lineWidth   = 0.5;
    for (let i = 0; i < 30; i++) {
      const y = Math.random() * altura;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(largura, y + (Math.random() - 0.5) * 20);
      ctx.stroke();
    }

    // Borda
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth   = 8;
    ctx.strokeRect(4, 4, largura - 8, altura - 8);

    // Vincos diagonais
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(0, 0);              ctx.lineTo(largura * 0.3, altura * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(largura, 0);        ctx.lineTo(largura * 0.7, altura * 0.3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, altura);         ctx.lineTo(largura * 0.3, altura * 0.7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(largura, altura);   ctx.lineTo(largura * 0.7, altura * 0.7); ctx.stroke();

    // Fita no topo
    if (face === 'topo') {
      const fitaCor = corFaixa || '#f5e642';
      ctx.fillStyle   = fitaCor + 'cc';
      ctx.fillRect(largura / 2 - 20, 0, 40, altura);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(largura / 2 - 20, 0, 40, altura);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth   = 2;
      for (let y = 0; y < altura; y += 12) {
        ctx.beginPath();
        ctx.moveTo(largura / 2 - 18, y);
        ctx.lineTo(largura / 2 + 18, y + 6);
        ctx.stroke();
      }
    }

    // Faixa colorida na frente
    if (face === 'frente' && corFaixa) {
      ctx.fillStyle   = corFaixa + 'dd';
      ctx.fillRect(0, altura * 0.55, largura, altura * 0.12);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(0, altura * 0.55, largura, altura * 0.12);
    }

    // Texto frente/lado
    if (face === 'frente' || face === 'lado') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.font      = `bold ${Math.floor(largura * 0.07)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('▲ FRÁGIL ▲', largura / 2, altura * 0.14);

      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(largura * 0.1, altura * 0.19);
      ctx.lineTo(largura * 0.9, altura * 0.19);
      ctx.stroke();

      if (pedido) {
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.font      = `bold ${Math.floor(largura * 0.1)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('Ped: ' + String(pedido), largura / 2, altura * 0.35);
      }

      if (codprod) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.font      = `${Math.floor(largura * 0.072)}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(String(codprod).slice(0, 14), largura / 2, altura * 0.48);
      }

      // Código de barras decorativo
      ctx.fillStyle   = 'rgba(0,0,0,0.6)';
      const barX      = largura * 0.2;
      const barY      = altura  * 0.72;
      const barW      = largura * 0.6;
      const barH      = altura  * 0.1;
      const numBarras = 28;
      for (let i = 0; i < numBarras; i++) {
        const x = barX + (barW / numBarras) * i;
        const w = (barW / numBarras) * (i % 3 === 0 ? 0.6 : 0.35);
        ctx.fillRect(x, barY, w, barH);
      }

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.font      = `${Math.floor(largura * 0.05)}px monospace`;
      ctx.textAlign = 'center';
      const codigoFake = String(Math.abs(parseInt(pedido) || 0) * 7 + 1000).padStart(8, '0');
      ctx.fillText(codigoFake, largura / 2, barY + barH + largura * 0.06);
    }

    const tex = new THREE.CanvasTexture(canvas);
    console.log('[TEX] textura criada OK face:', face);
    return tex;

  } catch (e) {
    console.error('[TEX] erro ao gerar textura:', e);
    return new THREE.Texture();
  }
}

// ─────────────────────────────────────────────────────────────────
// MATERIAIS DE CAIXA
// ─────────────────────────────────────────────────────────────────
function criarMateriaisCaixa(v, highlight) {
  console.log('[MAT] criando materiais para volume:', v.id, 'highlight:', highlight);
  try {
    const corNum   = typeof v.cor === 'number' ? v.cor : 0x22c55e;
    const corHex   = '#' + corNum.toString(16).padStart(6, '0');
    const opcoes   = { pedido: v.pedido, codprod: v.codprod, corFaixa: corHex };
    const emissive = highlight ? new THREE.Color(0xfacc15) : new THREE.Color(0x000000);
    const emissiveIntensity = highlight ? 0.4 : 0;

    const texFrente = gerarTexturaPapelao({ ...opcoes, face: 'frente', largura: 512, altura: 512 });
    const texLado   = gerarTexturaPapelao({ ...opcoes, face: 'lado',   largura: 512, altura: 512 });
    const texTopo   = gerarTexturaPapelao({ ...opcoes, face: 'topo',   largura: 512, altura: 512 });

    function mat(tex) {
      return new THREE.MeshStandardMaterial({
        map: tex, metalness: 0.0, roughness: 0.85, emissive, emissiveIntensity
      });
    }

    // +X, -X, +Y (topo), -Y (base), +Z (frente), -Z (fundo)
    const mats = [mat(texLado), mat(texLado), mat(texTopo), mat(texTopo), mat(texFrente), mat(texLado)];
    console.log('[MAT] materiais criados OK:', mats.length);
    return mats;

  } catch (e) {
    console.error('[MAT] erro ao criar materiais:', e);
    return new THREE.MeshStandardMaterial({ color: 0x22c55e });
  }
}

// ─────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────
function showToast(msg) {
  console.log('[TOAST]', msg);
  const toast = document.getElementById('viewer3dToast');
  if (!toast) return;
  toast.textContent   = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// ─────────────────────────────────────────────────────────────────
// OBTER CARGA
// ─────────────────────────────────────────────────────────────────
function obterCargaDoOpener() {
  console.log('[CARGA] tentando obter carga...');

  try {
    if (window.opener && window.opener.__VISYA_CARGA_ATUAL__) {
      console.log('[CARGA] obtida via window.opener');
      return window.opener.__VISYA_CARGA_ATUAL__;
    }
  } catch (e) {
    console.warn('[CARGA] window.opener erro:', e);
  }

  try {
    if (window.__VISYA_CARGA_ATUAL__) {
      console.log('[CARGA] obtida via window local');
      return window.__VISYA_CARGA_ATUAL__;
    }
  } catch (e) {
    console.warn('[CARGA] window local erro:', e);
  }

  try {
    const raw = sessionStorage.getItem('__VISYA_CARGA_ATUAL__');
    if (raw) {
      console.log('[CARGA] obtida via sessionStorage');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[CARGA] sessionStorage erro:', e);
  }

  console.warn('[CARGA] nenhuma carga encontrada, usará mock');
  return null;
}

// ─────────────────────────────────────────────────────────────────
// INIT THREE
// ─────────────────────────────────────────────────────────────────
function initThree() {
  console.log('[THREE] iniciando...');

  if (!canvasContainer) {
    throw new Error('canvasContainer não encontrado no DOM');
  }

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0f1e);
  scene.fog        = new THREE.Fog(0x0a0f1e, 20, 80);
  console.log('[THREE] scene criada');

  const width  = canvasContainer.clientWidth  || 800;
  const height = canvasContainer.clientHeight || 600;
  console.log('[THREE] canvas size:', width, 'x', height);

  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 2000);
  console.log('[THREE] camera criada');

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  canvasContainer.appendChild(renderer.domElement);
  console.log('[THREE] renderer criado e adicionado ao DOM');

  // Luzes
  const ambient = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambient);
  console.log('[THREE] ambient light adicionada');

  const dir1 = new THREE.DirectionalLight(0xfff5e0, 1.1);
  dir1.position.set(8, 14, 6);
  dir1.castShadow            = true;
  dir1.shadow.mapSize.width  = 2048;
  dir1.shadow.mapSize.height = 2048;
  dir1.shadow.camera.near    = 0.5;
  dir1.shadow.camera.far     = 60;
  dir1.shadow.camera.left    = -20;
  dir1.shadow.camera.right   = 20;
  dir1.shadow.camera.top     = 20;
  dir1.shadow.camera.bottom  = -20;
  dir1.shadow.bias           = -0.001;
  scene.add(dir1);
  console.log('[THREE] dir light 1 adicionada');

  const dir2 = new THREE.DirectionalLight(0xc8d8ff, 0.4);
  dir2.position.set(-6, 8, -4);
  scene.add(dir2);
  console.log('[THREE] dir light 2 adicionada');

  const hemi = new THREE.HemisphereLight(0x88aaff, 0x442200, 0.3);
  scene.add(hemi);
  console.log('[THREE] hemi light adicionada');

  // Chão
  const floorGeom = new THREE.PlaneGeometry(60, 60);
  const floorMat  = new THREE.MeshStandardMaterial({ color: 0x0d1224, metalness: 0.1, roughness: 0.9 });
  const floor     = new THREE.Mesh(floorGeom, floorMat);
  floor.rotation.x    = -Math.PI / 2;
  floor.position.y    = -0.01;
  floor.receiveShadow = true;
  scene.add(floor);
  console.log('[THREE] chão adicionado');

  const grid = new THREE.GridHelper(60, 60, 0x1a2a4a, 0x1a2a4a);
  grid.position.y = 0;
  scene.add(grid);
  console.log('[THREE] grid adicionado');

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan     = true;
  controls.enableZoom    = true;
  controls.autoRotate    = false;
  controls.target.set(0, 1.2, 0);
  controls.update();
  console.log('[THREE] OrbitControls criado');

  window.addEventListener('resize', onWindowResize);
  console.log('[THREE] initThree completo');
}

function onWindowResize() {
  if (!camera || !renderer) return;
  const width  = canvasContainer.clientWidth  || 800;
  const height = canvasContainer.clientHeight || 600;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  console.log('[THREE] resize:', width, 'x', height);
}

// ─────────────────────────────────────────────────────────────────
// LIMPAR CENA
// ─────────────────────────────────────────────────────────────────
function clearScene() {
  console.log('[SCENE] limpando cena...');
  const toRemove = [];
  scene.traverse((obj) => { if (obj.isMesh || obj.isLine) toRemove.push(obj); });
  console.log('[SCENE] objetos a remover:', toRemove.length);

  toRemove.forEach((m) => {
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => { if (mat.map) mat.map.dispose(); mat.dispose(); });
      } else {
        if (m.material.map) m.material.map.dispose();
        m.material.dispose();
      }
    }
  });
  volumesMesh = [];
  console.log('[SCENE] cena limpa');
}

// ─────────────────────────────────────────────────────────────────
// CRIAR BAÚ
// ─────────────────────────────────────────────────────────────────
function criarBau(caminhao) {
  console.log('[BAU] criando baú:', caminhao);
  if (!caminhao) { console.warn('[BAU] caminhao null, abortando'); return; }

  const comprimento = caminhao.comprimentoM || 6;
  const altura      = caminhao.alturaM      || 2.4;
  const largura     = caminhao.larguraM     || 2.4;
  const espessura   = 0.04;

  console.log('[BAU] dimensões:', comprimento, 'x', largura, 'x', altura);

  const matParede = new THREE.MeshStandardMaterial({
    color: 0x1a2a3a, metalness: 0.4, roughness: 0.6,
    transparent: true, opacity: 0.22, side: THREE.DoubleSide
  });

  // Chão do baú
  const chaoGeom = new THREE.BoxGeometry(comprimento, espessura, largura);
  const chaoMat  = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, metalness: 0.2, roughness: 0.9 });
  const chao     = new THREE.Mesh(chaoGeom, chaoMat);
  chao.position.set(comprimento / 2, espessura / 2, largura / 2);
  chao.receiveShadow = true;
  scene.add(chao);

  // Parede lateral esquerda
  const paredeGeom = new THREE.BoxGeometry(comprimento, altura, espessura);
  const p1 = new THREE.Mesh(paredeGeom, matParede);
  p1.position.set(comprimento / 2, altura / 2, 0);
  scene.add(p1);

  // Parede lateral direita
  const p2 = new THREE.Mesh(paredeGeom, matParede);
  p2.position.set(comprimento / 2, altura / 2, largura);
  scene.add(p2);

  // Parede do fundo
  const fundoGeom = new THREE.BoxGeometry(espessura, altura, largura);
  const fundo     = new THREE.Mesh(fundoGeom, matParede);
  fundo.position.set(comprimento, altura / 2, largura / 2);
  scene.add(fundo);

  // Arestas do baú
  const bauGeom = new THREE.BoxGeometry(comprimento, altura, largura);
  const edges   = new THREE.EdgesGeometry(bauGeom);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x4a7abf });
  const wire    = new THREE.LineSegments(edges, lineMat);
  wire.position.set(comprimento / 2, altura / 2, largura / 2);
  scene.add(wire);

  // Trilhos do chão
  const trilhoMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, metalness: 0.8, roughness: 0.3 });
  for (const z of [0.1, largura - 0.1]) {
    const trilhoGeom = new THREE.BoxGeometry(comprimento, 0.04, 0.06);
    const trilho     = new THREE.Mesh(trilhoGeom, trilhoMat);
    trilho.position.set(comprimento / 2, 0.06, z);
    scene.add(trilho);
  }

  if (infoCaminhao) {
    infoCaminhao.textContent =
      `${caminhao.descricao || caminhao.id} • ${comprimento.toFixed(2)}m x ${largura.toFixed(2)}m x ${altura.toFixed(2)}m`;
  }

  console.log('[BAU] baú criado OK');
}

// ─────────────────────────────────────────────────────────────────
// CRIAR VOLUMES
// ─────────────────────────────────────────────────────────────────
function criarVolumes(volumes) {
  console.log('[VOL] criarVolumes chamado, total:', volumes ? volumes.length : 0);

  volumesMesh.forEach((m) => scene.remove(m));
  volumesMesh = [];

  if (!volumes || !volumes.length) {
    console.warn('[VOL] nenhum volume para renderizar');
    return;
  }

  let pesoTotal   = 0;
  let volumeTotal = 0;

  volumes.forEach((v, idx) => {
    console.log(`[VOL] processando volume ${idx + 1}/${volumes.length}:`, v.id, v);

    try {
      const larguraM      = Math.max(Number(v.larguraM)      || 0.3, 0.05);
      const alturaM       = Math.max(Number(v.alturaM)       || 0.3, 0.05);
      const profundidadeM = Math.max(Number(v.profundidadeM) || 0.3, 0.05);

      console.log(`[VOL] dimensões resolvidas: prof=${profundidadeM} larg=${larguraM} alt=${alturaM}`);

      const geom = new THREE.BoxGeometry(profundidadeM, alturaM, larguraM);
      console.log(`[VOL] BoxGeometry criada`);

      const mats = criarMateriaisCaixa(v, false);
      console.log(`[VOL] materiais criados:`, Array.isArray(mats) ? mats.length : typeof mats);

      const mesh = new THREE.Mesh(geom, mats);

      const posX = (Number(v.x) || 0) + profundidadeM / 2;
      const posY = (Number(v.y) || 0) + alturaM       / 2;
      const posZ = (Number(v.z) || 0) + larguraM      / 2;

      console.log(`[VOL] posição: x=${posX} y=${posY} z=${posZ}`);

      mesh.position.set(posX, posY, posZ);
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      mesh.userData.volumeData = v;
      scene.add(mesh);
      volumesMesh.push(mesh);
      console.log(`[VOL] mesh adicionado à cena`);

      // Arestas da caixa
      const edgesGeom = new THREE.EdgesGeometry(geom);
      const edgesMat  = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
      const edgesMesh = new THREE.LineSegments(edgesGeom, edgesMat);
      edgesMesh.position.copy(mesh.position);
      edgesMesh.userData.isEdge   = true;
      edgesMesh.userData.parentId = v.id;
      scene.add(edgesMesh);
      console.log(`[VOL] arestas adicionadas`);

      pesoTotal   += Number(v.pesoKg)   || 0;
      volumeTotal += Number(v.volumeM3) || (profundidadeM * larguraM * alturaM);

    } catch (e) {
      console.error(`[VOL] erro ao processar volume ${v.id}:`, e);
    }
  });

  console.log('[VOL] total meshes na cena:', volumesMesh.length);

  if (infoResumoCarga) {
    infoResumoCarga.textContent =
      `Itens: ${volumes.length} • Peso: ${pesoTotal.toFixed(1)} kg • Volume: ${volumeTotal.toFixed(3)} m³`;
  }
}

// ─────────────────────────────────────────────────────────────────
// HIGHLIGHT
// ─────────────────────────────────────────────────────────────────
function highlightMesh(volumeId, highlight) {
  volumesMesh.forEach((m) => {
    if (m.userData.volumeData && m.userData.volumeData.id === volumeId) {
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => { if (mat.map) mat.map.dispose(); mat.dispose(); });
      }
      m.material = criarMateriaisCaixa(m.userData.volumeData, highlight);
      m.scale.set(highlight ? 1.03 : 1, highlight ? 1.03 : 1, highlight ? 1.03 : 1);
    }
  });
  scene.traverse((obj) => {
    if (obj.userData.isEdge && obj.userData.parentId === volumeId) {
      obj.material.color.set(highlight ? 0xfacc15 : 0x000000);
      obj.material.opacity = highlight ? 0.9 : 0.35;
    }
  });
}

function highlightVolumeCard(volumeId, highlight) {
  if (!listaVolumesEl) return;
  const card = listaVolumesEl.querySelector(`.v3d-volume-item[data-id="${volumeId}"]`);
  if (card) card.dataset.highlight = highlight ? 'true' : 'false';
}

// ─────────────────────────────────────────────────────────────────
// CÂMERA
// ─────────────────────────────────────────────────────────────────
function recenterCamera() {
  console.log('[CAM] recentrando câmera...');
  try {
    const box    = new THREE.Box3().setFromObject(scene);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size   = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 10;
    const dist   = maxDim * 2.2;

    camera.position.set(center.x + dist * 0.8, center.y + dist * 0.6, center.z + dist);
    camera.lookAt(center);
    currentCenter.copy(center);

    if (controls) { controls.target.copy(center); controls.update(); }
    console.log('[CAM] câmera recentrada. center:', center, 'dist:', dist);
  } catch (e) {
    console.error('[CAM] erro ao recentrar:', e);
  }
}

function focusCameraOnVolume(volumeId) {
  const mesh = volumesMesh.find((m) => m.userData.volumeData && m.userData.volumeData.id === volumeId);
  if (!mesh) return;
  const targetPos = mesh.position.clone();
  camera.position.copy(targetPos.clone().add(new THREE.Vector3(3, 2, 4)));
  camera.lookAt(targetPos);
  if (controls) { controls.target.copy(targetPos); controls.update(); }
}

function resetCamera() { recenterCamera(); }

// ─────────────────────────────────────────────────────────────────
// LISTA DE VOLUMES
// ─────────────────────────────────────────────────────────────────
function renderListaVolumes(volumes) {
  console.log('[LISTA] renderizando lista, total:', volumes ? volumes.length : 0);
  if (!listaVolumesEl) { console.warn('[LISTA] listaVolumesEl não encontrado'); return; }

  listaVolumesEl.innerHTML = '';

  if (!volumes || !volumes.length) {
    const empty = document.createElement('div');
    empty.className   = 'v3d-volume-sub';
    empty.textContent = 'Nenhum item para exibir.';
    listaVolumesEl.appendChild(empty);
    return;
  }

  const frag = document.createDocumentFragment();

  volumes.forEach((v) => {
    const corNum = typeof v.cor === 'number' ? v.cor : 0x22c55e;
    const corHex = '#' + corNum.toString(16).padStart(6, '0');

    const card = document.createElement('div');
    card.className      = 'v3d-volume-item';
    card.dataset.id     = v.id;
    card.dataset.pedido = v.pedido;

    const header = document.createElement('div');
    header.className = 'v3d-volume-header';

    const titleWrap = document.createElement('div');
    titleWrap.style.cssText = 'display:flex;align-items:center;gap:6px;';

    const dot = document.createElement('span');
    dot.style.cssText = `display:inline-block;width:9px;height:9px;border-radius:50%;background:${corHex};flex-shrink:0;`;

    const title = document.createElement('div');
    title.className   = 'v3d-volume-title';
    title.textContent = `Ped ${v.pedido} • ${v.codprod || v.descrprod || 'Volume agregado'}`;

    titleWrap.appendChild(dot);
    titleWrap.appendChild(title);

    const chip = document.createElement('div');
    chip.className   = 'v3d-volume-chip';
    chip.textContent = `${(v.volumeM3 || 0).toFixed(3)} m³`;

    header.appendChild(titleWrap);
    header.appendChild(chip);

    const sub1 = document.createElement('div');
    sub1.className   = 'v3d-volume-sub';
    sub1.textContent = v.descrprod || (v.codprod ? `Produto ${v.codprod}` : 'Volume agregado');

    const sub2 = document.createElement('div');
    sub2.className   = 'v3d-volume-sub';
    sub2.textContent = `Peso: ${(v.pesoKg || 0).toFixed(1)} kg • ${(v.profundidadeM || 0).toFixed(2)} x ${(v.larguraM || 0).toFixed(2)} x ${(v.alturaM || 0).toFixed(2)} m`;

    card.appendChild(header);
    card.appendChild(sub1);
    card.appendChild(sub2);

    card.addEventListener('mouseenter', () => { highlightVolumeCard(v.id, true);  highlightMesh(v.id, true);  });
    card.addEventListener('mouseleave', () => { highlightVolumeCard(v.id, false); highlightMesh(v.id, false); });
    card.addEventListener('click',      () => { focusCameraOnVolume(v.id); });

    frag.appendChild(card);
  });

  listaVolumesEl.appendChild(frag);
  console.log('[LISTA] lista renderizada OK');
}

// ─────────────────────────────────────────────────────────────────
// FILTRO
// ─────────────────────────────────────────────────────────────────
function applyFiltroPedido() {
  if (!carga || !carga._volumesAtuais) return;
  const filtro = (filtroPedidoInput.value || '').trim().toLowerCase();
  const vols   = filtro
    ? carga._volumesAtuais.filter((v) => String(v.pedido).toLowerCase().includes(filtro))
    : carga._volumesAtuais;
  renderListaVolumes(vols);
}

// ─────────────────────────────────────────────────────────────────
// IMPRIMIR
// ─────────────────────────────────────────────────────────────────
function imprimirLayout() {
  if (!carga || !carga._volumesAtuais || !carga._volumesAtuais.length) {
    showToast('Nenhum item para imprimir.');
    return;
  }
  const cam    = carga._caminhaoAtual || {};
  const win    = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  const titulo = `Layout de carga – ${cam.descricao || cam.id || ''}`;
  const linhas = carga._volumesAtuais.map((v) => `
    <tr>
      <td>${v.pedido}</td>
      <td>${v.codprod || v.descrprod || 'Volume agregado'}</td>
      <td>${(v.pesoKg || 0).toFixed(1)}</td>
      <td>${(v.volumeM3 || 0).toFixed(3)}</td>
      <td>${(v.profundidadeM || 0).toFixed(2)} x ${(v.larguraM || 0).toFixed(2)} x ${(v.alturaM || 0).toFixed(2)}</td>
    </tr>`).join('');

  win.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
    <title>${titulo}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;}table{width:100%;border-collapse:collapse;margin-top:8px;}th,td{border:1px solid #ccc;padding:4px;}th{background:#f3f4f6;}</style>
    </head><body><h1>${titulo}</h1>
    <p>${infoResumoCarga ? infoResumoCarga.textContent : ''}</p>
    <table><thead><tr><th>Pedido</th><th>Produto</th><th>Peso (kg)</th><th>Volume (m³)</th><th>Dimensões</th></tr></thead>
    <tbody>${linhas}</tbody></table>
    <script>window.print();<\/script></body></html>`);
  win.document.close();
}

// ─────────────────────────────────────────────────────────────────
// SELECTOR DE CAMINHÃO
// ─────────────────────────────────────────────────────────────────
function initCaminhaoSelector() {
  console.log('[SEL] initCaminhaoSelector...');
  if (!selectCaminhao) { console.warn('[SEL] selectCaminhao não encontrado'); return; }

  const caminhoes = carga.caminhoes || (carga.caminhao ? [carga.caminhao] : []);
  console.log('[SEL] caminhoes:', caminhoes.length);
  if (!caminhoes.length) return;

  selectCaminhao.innerHTML = '';
  caminhoes.forEach((cam, idx) => {
    const opt = document.createElement('option');
    opt.value       = cam.id != null ? cam.id : idx;
    opt.textContent = cam.descricao || `Caminhão ${idx + 1}`;
    selectCaminhao.appendChild(opt);
  });

  selectCaminhao.addEventListener('change', () => {
    console.log('[SEL] caminhão selecionado:', selectCaminhao.value);
    renderForCaminhao(selectCaminhao.value);
  });

  const idInicial = (carga.caminhao && carga.caminhao.id) || caminhoes[0].id || 0;
  selectCaminhao.value = idInicial;
  console.log('[SEL] idInicial:', idInicial);
}

function getCaminhaoById(idSel) {
  const caminhoes = carga.caminhoes || (carga.caminhao ? [carga.caminhao] : []);
  return caminhoes.find((c) => String(c.id) === String(idSel)) || caminhoes[0] || null;
}

function getVolumesForCaminhao(idSel) {
  if (carga.alocacao) {
    return (carga.volumes || []).filter((v) => String(carga.alocacao[v.id]) === String(idSel));
  }
  return carga.volumes || [];
}

function renderForCaminhao(idSel) {
  console.log('[RENDER] renderForCaminhao:', idSel);
  clearScene();

  const cam     = getCaminhaoById(idSel);
  const volumes = getVolumesForCaminhao(idSel);

  console.log('[RENDER] caminhao:', cam);
  console.log('[RENDER] volumes:', volumes.length);

  carga._caminhaoAtual = cam;
  carga._volumesAtuais = volumes;

  criarBau(cam);
  criarVolumes(volumes);
  renderListaVolumes(volumes);
  recenterCamera();

  console.log('[RENDER] renderForCaminhao completo');
}

// ─────────────────────────────────────────────────────────────────
// LOOP
// ─────────────────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

// ─────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  console.log('[INIT] DOMContentLoaded disparou');
  console.log('[INIT] canvasContainer:', canvasContainer);
  console.log('[INIT] canvasContainer size:', canvasContainer?.clientWidth, 'x', canvasContainer?.clientHeight);

  carga = obterCargaDoOpener();

  if (!carga) {
    showToast('Dados de carga 3D não encontrados. Abra o viewer a partir da tela de rotas.');
    carga = {
      caminhao: {
        id: 'M710', descricao: 'Truck 3/4 Baú (mock)',
        comprimentoM: 6, larguraM: 2.4, alturaM: 2.4
      },
      volumes: [
        { id: 'V1', pedido: '10001', codprod: 'PROD-A', descrprod: 'Produto A',
          larguraM: 0.6, alturaM: 0.8, profundidadeM: 0.5, volumeM3: 0.24, pesoKg: 18,
          x: 0.1, y: 0, z: 0.1, cor: 0x22c55e },
        { id: 'V2', pedido: '10001', codprod: 'PROD-B', descrprod: 'Produto B',
          larguraM: 0.4, alturaM: 0.6, profundidadeM: 0.4, volumeM3: 0.096, pesoKg: 9,
          x: 0.7, y: 0, z: 0.2, cor: 0x3b82f6 },
        { id: 'V3', pedido: '10002', codprod: 'PROD-C', descrprod: 'Produto C',
          larguraM: 1.0, alturaM: 1.2, profundidadeM: 0.8, volumeM3: 0.96, pesoKg: 45,
          x: 1.2, y: 0, z: 0.1, cor: 0xf97316 },
        { id: 'V4', pedido: '10003', codprod: 'PROD-D', descrprod: 'Produto D',
          larguraM: 0.5, alturaM: 0.5, profundidadeM: 0.5, volumeM3: 0.125, pesoKg: 12,
          x: 2.1, y: 0, z: 0.5, cor: 0xa855f7 }
      ]
    };
    console.log('[INIT] usando mock:', carga);
  }

  console.log('[INIT] iniciando THREE...');
  try {
    initThree();
    console.log('[INIT] initThree OK');
  } catch (e) {
    console.error('[INIT] initThree ERRO:', e);
    return;
  }

  try {
    initCaminhaoSelector();
    console.log('[INIT] initCaminhaoSelector OK');
  } catch (e) {
    console.error('[INIT] initCaminhaoSelector ERRO:', e);
  }

  const idInicial =
    (carga.caminhao && carga.caminhao.id) ||
    (carga.caminhoes && carga.caminhoes[0] && carga.caminhoes[0].id) || 0;

  console.log('[INIT] idInicial:', idInicial);

  try {
    renderForCaminhao(idInicial);
    console.log('[INIT] renderForCaminhao OK');
  } catch (e) {
    console.error('[INIT] renderForCaminhao ERRO:', e);
    return;
  }

  animate();
  console.log('[INIT] animate iniciado');

  if (btnResetCamera)    btnResetCamera.addEventListener('click',   resetCamera);
  if (btnImprimirLayout) btnImprimirLayout.addEventListener('click', imprimirLayout);
  if (filtroPedidoInput) filtroPedidoInput.addEventListener('input', applyFiltroPedido);

  console.log('[INIT] VIEWER3D totalmente inicializado ✅');
});