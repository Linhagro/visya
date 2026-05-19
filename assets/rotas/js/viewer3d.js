// assets/rotas/js/viewer3d.js
import * as THREE from './three/three.module.js';
import { OrbitControls } from './three/OrbitControls.js';

console.log('[VIEWER3D] módulo carregado · three r' + THREE.REVISION);

// ================== ESTADO GLOBAL ==================

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

// Estado do modo de carga
let modoCarga = 'auto-entrega'; // 'auto-peso' | 'auto-entrega' | 'manual'

// Estado de drag manual
let manualDragEnabled = false;
let dragRaycaster = null;
let dragPlane = null;
let dragOffset = new THREE.Vector3();
let dragTarget = null;
let dragShiftHeld = false;
let selectedMesh = null;
const SNAP = 0.05;

// Estado de colisão durante drag
let collidingMeshes = new Set();
let collisionPulseTime = 0;

// Volumes fora do caminhão (staging area, do lado direito do baú)
// Cada item tem flag `forabau:true` quando está na área externa
// Layout: grade de fileiras no chão ao lado do caminhão
const STAGING_GAP = 0.25; // espaço entre itens na staging

// Cores POR PEDIDO (não por peso) — paleta accent / info / warn / danger / purple ciclando
const CORES_PEDIDO = [
  0x3d8c5e, 0x6ea3d1, 0xd4a056, 0xc25450, 0xa855f7,
  0x14b8a6, 0xec4899, 0x8b5cf6, 0x84cc16, 0xf472b6
];

const ZONA_NOMES = ['Traseira', 'Meia-traseira', 'Centro', 'Meia-frente', 'Frente'];

// ================== DOM ==================

const canvasContainer = document.getElementById('viewer3dCanvas');
const listaVolumesEl = document.getElementById('listaVolumes');
const selectCaminhao = document.getElementById('selectCaminhao');
const btnImprimirLayout = document.getElementById('btnImprimirLayout');
const filtroPedidoInput = document.getElementById('filtroPedido');
const topPedidos = document.getElementById('topPedidos');
const topVolumes = document.getElementById('topVolumes');
const topPeso = document.getElementById('topPeso');
const topOcupacaoPct = document.getElementById('topOcupacaoPct');
const topRegras = document.getElementById('topRegras');
const ocupadoM3 = document.getElementById('ocupadoM3');
const totalM3 = document.getElementById('totalM3');
const ocupacaoBar = document.getElementById('ocupacaoBar');
const ocupacaoPctTexto = document.getElementById('ocupacaoPctTexto');
const topProdutosQtd = document.getElementById('topProdutosQtd');
const hoverCard = document.getElementById('viewer3dHoverCard');

// ================== TOAST ==================

function showToast(msg, isError = false) {
  const toast = document.getElementById('viewer3dToast');
  const span = document.getElementById('viewer3dToastMsg');
  if (!toast || !span) return;
  span.textContent = msg;
  toast.classList.toggle('toast-error', !!isError);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ================== HELPERS ==================

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

// Cor por pedido: hash do nunota → índice na paleta
function getCorPorPedido(pedido) {
  if (!pedido) return CORES_PEDIDO[0];
  const s = String(pedido);
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return CORES_PEDIDO[Math.abs(hash) % CORES_PEDIDO.length];
}

function corHex(cor) {
  return '#' + Number(cor).toString(16).padStart(6, '0');
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
  if (topPedidos) topPedidos.textContent = String(r.pedidos);
  if (topVolumes) topVolumes.textContent = String(r.volumes);
  if (topPeso) topPeso.textContent = `${r.peso.toFixed(1)} kg`;
  if (topOcupacaoPct) topOcupacaoPct.textContent = `${r.ocupPct.toFixed(1)}%`;
  if (ocupadoM3) ocupadoM3.textContent = `${r.volume.toFixed(2)} m³`;
  if (totalM3) totalM3.textContent = `${r.totalBau.toFixed(2)} m³`;
  if (ocupacaoBar) ocupacaoBar.style.width = `${Math.max(0, Math.min(100, r.ocupPct))}%`;
  if (ocupacaoPctTexto) ocupacaoPctTexto.textContent = `${r.ocupPct.toFixed(1)}%`;
  if (topProdutosQtd) topProdutosQtd.textContent = String(r.volumes);
  if (topRegras) {
    const lbl = modoCarga === 'manual' ? 'Manual'
      : modoCarga === 'auto-entrega' ? 'LIFO entrega'
      : 'Peso decres.';
    topRegras.textContent = lbl;
  }
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

// ================== ALGORITMO EMPACOTAMENTO ==================
// Aceita modo: 'auto-peso' (antigo) | 'auto-entrega' (LIFO) | 'manual' (sem reordenar)

function aplicarRegrasCarregamento(volumes, bau, modo = 'auto-peso') {
  const L = bau.comprimentoM || 6;
  const W = bau.larguraM || 2.4;
  const H = bau.alturaM || 2.4;
  const MARG = 0.001;
  const STEP = 0.05;

  // Normaliza itens
  const itens = (volumes || []).map((v, i) => ({
    ...v,
    dX: Math.max(Number(v.profundidadeM) || 0.05, 0.05),
    dY: Math.max(Number(v.alturaM) || 0.05, 0.05),
    dZ: Math.max(Number(v.larguraM) || 0.05, 0.05),
    pesoUnit: Number(v.pesoKg) || 0,
    _sortIdx: i,
  }));

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
    for (let ix = ix0; ix < ix1; ix++)
      for (let iy = iy0; iy < iy1; iy++)
        for (let iz = iz0; iz < iz1; iz++)
          if (grid[gi(ix, iy, iz)]) return false;
    return true;
  }

  function ocupar(x0, y0, z0, dx, dy, dz) {
    const ix0 = Math.floor(x0 / STEP);
    const iy0 = Math.floor(y0 / STEP);
    const iz0 = Math.floor(z0 / STEP);
    const ix1 = Math.min(NX, Math.ceil((x0 + dx) / STEP));
    const iy1 = Math.min(NY, Math.ceil((y0 + dy) / STEP));
    const iz1 = Math.min(NZ, Math.ceil((z0 + dz) / STEP));
    for (let ix = ix0; ix < ix1; ix++)
      for (let iy = iy0; iy < iy1; iy++)
        for (let iz = iz0; iz < iz1; iz++)
          grid[gi(ix, iy, iz)] = 1;
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
    for (let ix = ix0; ix < ix1; ix++)
      for (let iz = iz0; iz < iz1; iz++) {
        total++;
        if (grid[gi(ix, iyAbaixo, iz)]) ocup++;
      }
    return total === 0 || (ocup / total) > 0.4;
  }

  const resultado = [];
  const naoCouberam = [];

  // ============ MODO MANUAL: respeita manualPos ============
  if (modo === 'manual') {
    itens.forEach(item => {
      item.dX = Math.min(item.dX, L - 2 * MARG);
      item.dY = Math.min(item.dY, H - 2 * MARG);
      item.dZ = Math.min(item.dZ, W - 2 * MARG);
      let pos = null;
      if (item.manualPos) {
        pos = { x0: item.manualPos.x, y0: item.manualPos.y, z0: item.manualPos.z };
        ocupar(pos.x0, pos.y0, pos.z0, item.dX, item.dY, item.dZ);
      } else {
        pos = encontrarPosicaoSimples(item);
        if (!pos) { naoCouberam.push(item); return; }
        ocupar(pos.x0, pos.y0, pos.z0, item.dX, item.dY, item.dZ);
      }
      resultado.push(montarResultado(item, pos, L));
    });
    if (naoCouberam.length > 0) showToast(`${naoCouberam.length} item(s) não couberam no baú.`, true);
    return { volumes: resultado, naoCouberam };
  }

  // ============ MODOS AUTOMÁTICOS ============
  // Estratégia: BLOCOS POR PEDIDO.
  // 1) Agrupa itens por pedido
  // 2) Ordena os pedidos pela regra (entrega ou peso)
  // 3) Cada pedido vira um BLOCO COMPACTO que ocupa um ranger X contínuo
  //    cobrindo a largura W e altura H do baú até onde precisar.
  //    Isso significa: a parede toda do fundo é do pedido N, à frente vem pedido N-1, etc.
  // 4) Dentro do bloco do pedido: itens pesados embaixo, leves em cima.

  // Agrupa por pedido
  const grupos = new Map();
  itens.forEach(item => {
    const key = String(item.pedido || '_sem_pedido');
    if (!grupos.has(key)) {
      grupos.set(key, {
        pedido: key,
        ordemEntrega: Number(item.ordemEntrega ?? 999),
        pesoTotal: 0,
        volumeTotal: 0,
        itens: []
      });
    }
    const g = grupos.get(key);
    g.itens.push(item);
    g.pesoTotal += item.pesoUnit;
    g.volumeTotal += item.dX * item.dY * item.dZ;
    if (item.ordemEntrega != null && Number(item.ordemEntrega) < g.ordemEntrega) {
      g.ordemEntrega = Number(item.ordemEntrega);
    }
  });

  const gruposArr = Array.from(grupos.values());

  // Ordena grupos: primeiro empacotado vai pro fundo (X maior)
  if (modo === 'auto-entrega') {
    // LIFO: maior ordemEntrega entra primeiro (vai pro fundo)
    gruposArr.sort((a, b) => {
      if (a.ordemEntrega !== b.ordemEntrega) return b.ordemEntrega - a.ordemEntrega;
      return b.pesoTotal - a.pesoTotal;
    });
  } else {
    // auto-peso: pedido mais pesado primeiro (vai pro fundo)
    gruposArr.sort((a, b) => b.pesoTotal - a.pesoTotal);
  }

  // Função pra empacotar um GRUPO inteiro num range X [xFundo, xFrente]
  // Estratégia: preenche o chão (Y=0) primeiro, depois sobe camadas
  // Itens pesados primeiro → ficam na camada inferior
  function empacotarGrupo(grupo, xFundo, xFrente) {
    const itensOrdenados = [...grupo.itens].sort((a, b) => {
      // Pesados primeiro (vão pro chão)
      if (Math.abs(b.pesoUnit - a.pesoUnit) > 0.1) return b.pesoUnit - a.pesoUnit;
      // Maiores primeiro
      return (b.dX * b.dY * b.dZ) - (a.dX * a.dY * a.dZ);
    });

    let xLimiteUsado = xFundo; // Atualiza com o X mínimo usado pelo grupo

    itensOrdenados.forEach(item => {
      item.dX = Math.min(item.dX, L - 2 * MARG);
      item.dY = Math.min(item.dY, H - 2 * MARG);
      item.dZ = Math.min(item.dZ, W - 2 * MARG);

      const pos = encontrarPosicaoNoRange(item, xFundo, xFrente);

      if (!pos) {
        // Tenta expandir range pra frente (estoura limite do grupo)
        const posExp = encontrarPosicaoNoRange(item, xFundo - 0.5, xFrente);
        if (posExp) {
          ocupar(posExp.x0, posExp.y0, posExp.z0, item.dX, item.dY, item.dZ);
          if (posExp.x0 < xLimiteUsado) xLimiteUsado = posExp.x0;
          resultado.push(montarResultado(item, posExp, L));
          return;
        }
        // Última tentativa: em qualquer lugar do baú
        const posAny = encontrarPosicaoSimples(item);
        if (posAny) {
          ocupar(posAny.x0, posAny.y0, posAny.z0, item.dX, item.dY, item.dZ);
          if (posAny.x0 < xLimiteUsado) xLimiteUsado = posAny.x0;
          resultado.push(montarResultado(item, posAny, L));
          return;
        }
        naoCouberam.push(item);
        return;
      }

      ocupar(pos.x0, pos.y0, pos.z0, item.dX, item.dY, item.dZ);
      if (pos.x0 < xLimiteUsado) xLimiteUsado = pos.x0;
      resultado.push(montarResultado(item, pos, L));
    });

    return xLimiteUsado;
  }

  // Procura posição preferindo:
  // 1) X o mais ao fundo possível (x grande, perto de xFrente)
  // 2) Y baixo (no chão)
  // 3) Z centralizado
  // Mas SÓ DENTRO do range [xFundo, xFrente]
  function encontrarPosicaoNoRange(item, xFundo, xFrente) {
    const dx = item.dX, dy = item.dY, dz = item.dZ;

    // Estratégia: camada por camada (Y), em cada camada varre X do fundo (xFrente) pra frente (xFundo)
    // Dentro de cada X, varre Z (preferindo o centro)
    for (let yStep = 0; yStep * STEP + dy <= H; yStep++) {
      const y0 = yStep * STEP;

      const xStart = Math.min(xFrente, L) - dx - MARG;
      const xEnd = Math.max(xFundo, 0) - MARG;
      const xSteps = [];
      for (let x = xStart; x >= xEnd; x -= STEP) xSteps.push(x);

      for (const x0 of xSteps) {
        if (x0 < 0 || x0 + dx > L) continue;
        // Z varre de uma borda pra outra (esquerda → direita)
        // Não centraliza pq queremos preencher solidamente
        for (let z0 = MARG; z0 + dz <= W - MARG; z0 += STEP) {
          if (!temSuporteAbaixo(x0, y0, z0, dx, dz)) continue;
          if (isLivre(x0, y0, z0, dx, dy, dz)) return { x0, y0, z0 };
        }
      }
    }
    return null;
  }

  function encontrarPosicaoSimples(item) {
    return encontrarPosicaoNoRange(item, 0, L);
  }

  // Empacota cada grupo no range que sobrou
  let xFrenteAtual = L; // Começa o primeiro grupo no fundo absoluto
  gruposArr.forEach(grupo => {
    // Range alvo: do xFundoEstimado até xFrenteAtual.
    // xFundoEstimado é o quanto esse grupo deveria ocupar de profundidade.
    // Estimativa generosa: volumeGrupo / (W*H_efetiva)
    // H_efetiva considera que a coluna empilha até ~80% da altura útil
    const H_efetiva = H * 0.85;
    const profMinima = Math.max(...grupo.itens.map(it => it.dX));
    const profEstimada = (grupo.volumeTotal / (W * H_efetiva)) * 1.10; // 10% folga
    const profUsada = Math.max(profEstimada, profMinima);
    const xFundoEstimado = Math.max(0, xFrenteAtual - profUsada - 1.5); // permite expandir 1.5m pra trás se precisar

    const xUsadoMin = empacotarGrupo(grupo, xFundoEstimado, xFrenteAtual);

    // Próximo grupo começa onde esse terminou
    xFrenteAtual = xUsadoMin;
    if (xFrenteAtual <= 0) xFrenteAtual = 0;
  });

  if (naoCouberam.length > 0) {
    showToast(`${naoCouberam.length} item(s) não couberam no baú.`, true);
  }

  return { volumes: resultado, naoCouberam };
}

function montarResultado(item, pos, L) {
  const zona = Math.max(0, Math.min(4, Math.floor((1 - (pos.x0 + item.dX / 2) / L) * 5)));
  const cor = getCorPorPedido(item.pedido);
  return {
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
    cor,
    corHex: corHex(cor),
  };
}

// ================== STAGING (área fora do baú) ==================

// Calcula posição na staging area para um índice de item.
// Staging fica à DIREITA do caminhão (z positivo, depois da parede), em fileiras.
function calcularPosicaoStaging(idx, item, caminhao) {
  const C = caminhao.comprimentoM || 6;
  const W = caminhao.larguraM || 2.4;

  // Staging começa logo após a parede z=W, com 1m de gap pra rampa
  const stagingZStart = W + 1.0;
  // Cada "linha" tem W de largura (z) + GAP, em quantas linhas couberem
  const linhasPorColuna = 8;
  const col = Math.floor(idx / linhasPorColuna);
  const row = idx % linhasPorColuna;

  const dx = Math.max(Number(item.profundidadeM) || 0.3, 0.3);
  const dz = Math.max(Number(item.larguraM) || 0.3, 0.3);
  const dy = Math.max(Number(item.alturaM) || 0.3, 0.3);

  // Distribui ao longo do comprimento do caminhão
  const stepX = 0.8;
  const stepZ = 0.7;

  return {
    x: row * stepX + 0.4,
    y: dy / 2,
    z: stagingZStart + col * stepZ
  };
}

// Cria visual de uma "pista" no chão pra demarcar a staging area
function criarStagingArea(caminhao) {
  const W = caminhao.larguraM || 2.4;
  const stagingZStart = W + 1.0;
  const stagingWidth = 6;
  const stagingLength = caminhao.comprimentoM * 1.2 || 8;

  const mat = new THREE.MeshStandardMaterial({
    color: 0x12181f,
    metalness: 0.1,
    roughness: 0.95,
    transparent: true,
    opacity: 0.6
  });
  const piso = new THREE.Mesh(
    new THREE.PlaneGeometry(stagingLength, stagingWidth),
    mat
  );
  piso.rotation.x = -Math.PI / 2;
  piso.position.set(stagingLength / 2, 0.005, stagingZStart + stagingWidth / 2);
  piso.receiveShadow = true;
  scene.add(piso);

  // Linhas tracejadas demarcando staging
  const edges = new THREE.EdgesGeometry(new THREE.PlaneGeometry(stagingLength, stagingWidth));
  const wire = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: 0xd4a056, transparent: true, opacity: 0.4 })
  );
  wire.rotation.x = -Math.PI / 2;
  wire.position.set(stagingLength / 2, 0.01, stagingZStart + stagingWidth / 2);
  scene.add(wire);
}

// ================== COLISÃO ==================

// Testa AABB entre 2 volumes
function colideAABB(meshA, meshB) {
  if (meshA === meshB) return false;
  const a = meshA.userData.volumeData;
  const b = meshB.userData.volumeData;
  if (!a || !b) return false;
  // Ignora colisão com itens que estão na staging
  if (a.forabau || b.forabau) return false;

  const halfAx = (a.profundidadeM || 0.1) / 2;
  const halfAy = (a.alturaM || 0.1) / 2;
  const halfAz = (a.larguraM || 0.1) / 2;
  const halfBx = (b.profundidadeM || 0.1) / 2;
  const halfBy = (b.alturaM || 0.1) / 2;
  const halfBz = (b.larguraM || 0.1) / 2;

  const dx = Math.abs(meshA.position.x - meshB.position.x);
  const dy = Math.abs(meshA.position.y - meshB.position.y);
  const dz = Math.abs(meshA.position.z - meshB.position.z);

  // Pequena tolerância pra não disparar com SNAP
  const tol = 0.005;
  return (dx + tol < halfAx + halfBx) &&
         (dy + tol < halfAy + halfBy) &&
         (dz + tol < halfAz + halfBz);
}

// Verifica colisões do dragTarget com todos os outros
function checarColisoes() {
  if (!dragTarget) {
    collidingMeshes.clear();
    return;
  }
  collidingMeshes.clear();
  volumesMesh.forEach(m => {
    if (m === dragTarget) return;
    if (colideAABB(dragTarget, m)) {
      collidingMeshes.add(m);
      collidingMeshes.add(dragTarget);
    }
  });
}

// Aplica visual de colisão (chamado no tick do animate)
function tickColisao(delta) {
  if (!collidingMeshes.size) return;
  collisionPulseTime += delta;
  // Pulso de emissive vermelho
  const pulse = (Math.sin(collisionPulseTime * 8) + 1) / 2; // 0..1
  const intensity = 0.35 + pulse * 0.45;
  collidingMeshes.forEach(m => {
    if (m.material && m.material.emissive) {
      m.material.emissive.setHex(0xc25450);
      m.material.emissiveIntensity = intensity;
    }
    const eLine = volumesEdges[volumesMesh.indexOf(m)];
    if (eLine) {
      eLine.material.color.setHex(0xc25450);
      eLine.material.opacity = 0.7 + pulse * 0.3;
    }
  });
}

// Limpa visual de colisão
function limparVisualColisao() {
  collidingMeshes.forEach(m => {
    if (m === selectedMesh) return; // mantém highlight do selecionado
    if (m.material && m.material.emissive) {
      m.material.emissive.setHex(0x000000);
      m.material.emissiveIntensity = 0;
    }
    const eLine = volumesEdges[volumesMesh.indexOf(m)];
    if (eLine) {
      eLine.material.color.setHex(0x000000);
      eLine.material.opacity = 0.3;
    }
  });
  collidingMeshes.clear();
  collisionPulseTime = 0;
}

// Retorna se uma posição (centro x,y,z + dims) está dentro do baú
function dentroDoCaminhao(x, y, z, dx, dy, dz, caminhao) {
  const L = caminhao.comprimentoM || 6;
  const W = caminhao.larguraM || 2.4;
  const H = caminhao.alturaM || 2.4;
  return (x - dx / 2 >= -0.01 && x + dx / 2 <= L + 0.01 &&
          y - dy / 2 >= -0.01 && y + dy / 2 <= H + 0.01 &&
          z - dz / 2 >= -0.01 && z + dz / 2 <= W + 0.01);
}

// ================== THREE.JS INIT ==================

function initThree() {
  if (!canvasContainer) throw new Error('canvasContainer não encontrado');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07090c);
  scene.fog = new THREE.FogExp2(0x07090c, 0.018);

  const width = canvasContainer.clientWidth || 800;
  const height = canvasContainer.clientHeight || 600;

  camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 5000);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance'
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace || THREE.sRGBEncoding;
  canvasContainer.appendChild(renderer.domElement);

  // Iluminação refinada: ambient + key + fill + rim + hemi
  const amb = new THREE.AmbientLight(0xffffff, 0.32);
  scene.add(amb);

  const keyLight = new THREE.DirectionalLight(0xfff5e0, 0.95);
  keyLight.position.set(10, 16, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 60;
  keyLight.shadow.camera.left = -20;
  keyLight.shadow.camera.right = 20;
  keyLight.shadow.camera.top = 20;
  keyLight.shadow.camera.bottom = -20;
  keyLight.shadow.bias = -0.0008;
  keyLight.shadow.normalBias = 0.02;
  keyLight.shadow.radius = 4;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x6ea3d1, 0.22);
  fillLight.position.set(-8, 10, -4);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x3d8c5e, 0.18);
  rimLight.position.set(20, 4, 12);
  scene.add(rimLight);

  const hemi = new THREE.HemisphereLight(0x6ea3d1, 0x07090c, 0.34);
  scene.add(hemi);

  // Chão grande de fundo
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x0a0e14,
    metalness: 0.12,
    roughness: 0.92
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  floor.receiveShadow = true;
  floor.userData.persistentBase = true;
  scene.add(floor);

  // Grid sutil
  const grid = new THREE.GridHelper(80, 80, 0x131a22, 0x0d1419);
  grid.position.y = 0.001;
  grid.material.opacity = 0.6;
  grid.material.transparent = true;
  grid.userData.persistentBase = true;
  scene.add(grid);

  // Plano de corte (escondido)
  sectionPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 9999);

  // OrbitControls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.enableZoom = true;
  controls.autoRotate = false;
  controls.maxPolarAngle = Math.PI * 0.495; // não vai abaixo do horizonte
  controls.target.set(3, 1.2, 1.2);
  controls.update();

  // Raycaster pra drag manual / hover / click
  dragRaycaster = new THREE.Raycaster();
  dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  window.addEventListener('resize', onWindowResize);
  setupRaycasterEvents();
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

// ================== BAÚ ==================

function criarBau(caminhao) {
  if (!caminhao) return;
  const C = caminhao.comprimentoM || 6;
  const A = caminhao.alturaM || 2.4;
  const L = caminhao.larguraM || 2.4;
  const E = 0.04;

  // Chão do baú (madeira escura)
  const chao = new THREE.Mesh(
    new THREE.BoxGeometry(C, E, L),
    new THREE.MeshStandardMaterial({ color: 0x2a1810, metalness: 0.15, roughness: 0.92 })
  );
  chao.position.set(C / 2, E / 2, L / 2);
  chao.receiveShadow = true;
  scene.add(chao);

  // Trilhos laterais
  const trilhoMat = new THREE.MeshStandardMaterial({ color: 0x2a3140, metalness: 0.7, roughness: 0.35 });
  [0.08, L - 0.08].forEach(z => {
    const t = new THREE.Mesh(new THREE.BoxGeometry(C, 0.04, 0.06), trilhoMat);
    t.position.set(C / 2, 0.06, z);
    scene.add(t);
  });

  // Paredes translúcidas: BackSide pra não atrapalhar visão de fora pra dentro
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x14202e,
    metalness: 0.4,
    roughness: 0.55,
    transparent: true,
    opacity: 0.18,
    side: THREE.BackSide,
    depthWrite: false
  });

  [[C / 2, A / 2, 0], [C / 2, A / 2, L]].forEach(([px, py, pz]) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(C, A, E), wallMat);
    m.position.set(px, py, pz);
    scene.add(m);
  });

  const fundo = new THREE.Mesh(new THREE.BoxGeometry(E, A, L), wallMat);
  fundo.position.set(C, A / 2, L / 2);
  scene.add(fundo);

  const teto = new THREE.Mesh(new THREE.BoxGeometry(C, E, L), wallMat);
  teto.position.set(C / 2, A, L / 2);
  scene.add(teto);

  // Wireframe verde discreto (delimita o baú)
  const bauEdges = new THREE.EdgesGeometry(new THREE.BoxGeometry(C, A, L));
  const wire = new THREE.LineSegments(
    bauEdges,
    new THREE.LineBasicMaterial({ color: 0x3d8c5e, transparent: true, opacity: 0.45 })
  );
  wire.position.set(C / 2, A / 2, L / 2);
  scene.add(wire);

  // Área de staging fora do caminhão (só visível em modo manual)
  if (manualDragEnabled) {
    criarStagingArea(caminhao);
  }
}

// ================== VOLUMES ==================

function criarMateriaisCaixa(v, highlight) {
  const cor = v.cor || getCorPorPedido(v.pedido);

  const emissive = highlight ? new THREE.Color(0x3d8c5e) : new THREE.Color(0x000000);
  const emissiveIntensity = highlight ? 0.55 : 0;

  return new THREE.MeshStandardMaterial({
    color: cor,
    metalness: 0.18,
    roughness: 0.62,
    emissive,
    emissiveIntensity,
    transparent: false,
    opacity: 1.0,
    depthWrite: true,
    clippingPlanes: sectionOn && sectionPlane ? [sectionPlane] : []
  });
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
    const mat = criarMateriaisCaixa(v, false);
    // Inicia transparente pra animação de fade; depois vira opaco
    mat.transparent = true;
    mat.opacity = 0;
    mat.depthWrite = false;

    const mesh = new THREE.Mesh(geo, mat);
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

    // Edge lines pra dar contorno
    const eLine = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        clippingPlanes: sectionOn && sectionPlane ? [sectionPlane] : []
      })
    );
    eLine.position.set(cx, cy + 2.5, cz);
    eLine.userData.parentId = v.id;
    eLine.userData.basePosition = new THREE.Vector3(cx, cy, cz);
    eLine.frustumCulled = false;
    scene.add(eLine);
    volumesEdges.push(eLine);
  });
}

// ================== ANIMAÇÃO DE QUEDA ==================

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
    const op = ease;
    mesh.material.opacity = op;
    if (eLine) eLine.material.opacity = ease * 0.4;
    if (p < 1) {
      requestAnimationFrame(step);
    } else {
      // Ao terminar fade-in: volta a material OPACO (resolve bug de transparência)
      mesh.material.transparent = false;
      mesh.material.opacity = 1.0;
      mesh.material.depthWrite = true;
      mesh.material.needsUpdate = true;
    }
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
      'PESADO → TRASEIRA',
      'Médio-pesado → meia-traseira',
      'Empilhamento central',
      'Mais leve → meia-frente',
      'LEVE → FRENTE'
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
  card.classList.add('flash');
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  setTimeout(() => card.classList.remove('flash'), 900);
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
    m.material.transparent = true;
    m.material.opacity = 0;
    m.material.depthWrite = false;
    m.material.needsUpdate = true;
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
    m.material.transparent = false;
    m.material.opacity = 1.0;
    m.material.depthWrite = true;
    m.material.needsUpdate = true;
    if (volumesEdges[i]) volumesEdges[i].material.opacity = 0.4;
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

// ================== FERRAMENTAS 3D ==================

function toggleWireframe() {
  wireOn = !wireOn;
  volumesMesh.forEach(m => { m.material.wireframe = wireOn; });
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
    m.material.clippingPlanes = sectionOn && sectionPlane ? [sectionPlane] : [];
    m.material.needsUpdate = true;
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

// ================== CÂMERA ==================

function recenterCamera() {
  try {
    const camAtual = carga?._caminhaoAtual || carga?.caminhao || {};
    const CX = (camAtual.comprimentoM || 6) / 2;
    const CY = (camAtual.alturaM || 2.4) / 2;
    const CZ = (camAtual.larguraM || 2.4) / 2;

    // Em modo manual: target deslocado pra direita (entre caminhão e staging)
    const targetZ = manualDragEnabled ? CZ + 2.0 : CZ;
    const target = new THREE.Vector3(CX, CY, targetZ);

    const dist = Math.max(camAtual.comprimentoM || 6, camAtual.larguraM || 2.4, camAtual.alturaM || 2.4)
      * (manualDragEnabled ? 2.4 : 1.85);

    camera.position.set(CX + dist, CY + dist * 0.7, targetZ + dist);
    camera.lookAt(target);
    currentCenter.copy(target);
    if (controls) { controls.target.copy(target); controls.update(); }
  } catch (e) { console.error('[CAM]', e); }
}

function setCamFront() {
  const cam = carga?._caminhaoAtual || carga?.caminhao || {};
  const CX = (cam.comprimentoM || 6) / 2;
  const CY = (cam.alturaM || 2.4) / 2;
  const CZ = (cam.larguraM || 2.4) / 2;
  camera.position.set(CX, CY, CZ + (cam.larguraM || 2.4) * 4);
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
  camera.position.set(CX + (cam.comprimentoM || 6) * 3.5, CY * 1.2, CZ);
  camera.lookAt(CX, CY, CZ);
  if (controls) { controls.target.set(CX, CY, CZ); controls.update(); }
}

function setCamIso() {
  recenterCamera();
}

function focusCameraOnVolume(volumeId) {
  const mesh = volumesMesh.find(m => m.userData.volumeData?.id === volumeId);
  if (!mesh) return;
  const tp = mesh.position.clone();
  camera.position.copy(tp.clone().add(new THREE.Vector3(2, 1.5, 3)));
  camera.lookAt(tp);
  if (controls) { controls.target.copy(tp); controls.update(); }
}

// ================== SELEÇÃO / DETALHES ==================

function highlightMesh(volumeId, highlight) {
  volumesMesh.forEach(m => {
    if (m.userData.volumeData?.id === volumeId) {
      if (m.material.emissive) m.material.emissive.set(highlight ? 0x3d8c5e : 0x000000);
      m.material.emissiveIntensity = highlight ? 0.55 : 0;
      m.scale.setScalar(highlight ? 1.04 : 1);
    }
  });
  volumesEdges.forEach(e => {
    if (e.userData.parentId === volumeId) {
      e.material.color.set(highlight ? 0x3d8c5e : 0x000000);
      e.material.opacity = highlight ? 0.85 : 0.3;
    }
  });
}

function abrirDetalhes(v) {
  selectedMesh = volumesMesh.find(m => m.userData.volumeData?.id === v.id);
  highlightMesh(v.id, true);

  const det = document.getElementById('v3d-detalhes');
  const body = document.getElementById('v3dDetalhesBody');
  if (!det || !body) return;

  const cor = v.corHex || corHex(getCorPorPedido(v.pedido));
  const zona = v.zona != null ? ZONA_NOMES[v.zona] : '—';
  const ordem = v.ordemEntrega != null ? `${v.ordemEntrega}ª parada` : '—';

  body.innerHTML = `
    <div class="v3d-det-titulo">
      <span class="v3d-det-cor" style="background:${cor}"></span>
      ${escapeHtml(v.descrprod || v.codprod || 'Item')}
    </div>
    <div class="v3d-det-row"><span>Pedido</span><strong>${escapeHtml(String(v.pedido || '—'))}</strong></div>
    <div class="v3d-det-row"><span>Código</span><strong>${escapeHtml(String(v.codprod || '—'))}</strong></div>
    <div class="v3d-det-row"><span>Peso</span><strong>${(Number(v.pesoKg) || 0).toFixed(2)} kg</strong></div>
    <div class="v3d-det-row"><span>Volume</span><strong>${(Number(v.volumeM3) || 0).toFixed(4)} m³</strong></div>
    <div class="v3d-det-row"><span>Largura</span><strong>${(Number(v.larguraM) || 0).toFixed(2)} m</strong></div>
    <div class="v3d-det-row"><span>Altura</span><strong>${(Number(v.alturaM) || 0).toFixed(2)} m</strong></div>
    <div class="v3d-det-row"><span>Profund.</span><strong>${(Number(v.profundidadeM) || 0).toFixed(2)} m</strong></div>
    <div class="v3d-det-row"><span>Zona</span><strong>${zona}</strong></div>
    <div class="v3d-det-row"><span>Ordem entrega</span><strong>${ordem}</strong></div>
  `;
  det.style.display = 'flex';

  // Destaca card na lista
  listaVolumesEl.querySelectorAll('.v3d-volume-item').forEach(c => {
    c.classList.toggle('ativo', c.dataset.id === String(v.id));
  });

  focusCameraOnVolume(v.id);
}

function fecharDetalhes() {
  const det = document.getElementById('v3d-detalhes');
  if (det) det.style.display = 'none';
  if (selectedMesh) {
    const v = selectedMesh.userData.volumeData;
    if (v) highlightMesh(v.id, false);
    selectedMesh = null;
  }
  listaVolumesEl.querySelectorAll('.v3d-volume-item').forEach(c => c.classList.remove('ativo'));
}

// ================== LISTA ==================

function renderListaVolumes(volumes) {
  if (!listaVolumesEl) return;
  listaVolumesEl.innerHTML = '';
  if (!volumes || !volumes.length) {
    listaVolumesEl.innerHTML = '<div class="v3d-volume-sub" style="padding:20px;text-align:center">Nenhum item para exibir.</div>';
    return;
  }

  // Em modo manual: separa em 2 seções (dentro / fora)
  if (manualDragEnabled) {
    const dentro = volumes.filter(v => !v.forabau);
    const fora = volumes.filter(v => v.forabau);

    const frag = document.createDocumentFragment();

    // SEÇÃO DENTRO
    const headerDentro = document.createElement('div');
    headerDentro.className = 'v3d-lista-sec';
    headerDentro.innerHTML = `<span>Dentro do baú</span><strong>${dentro.length}</strong>`;
    frag.appendChild(headerDentro);

    if (dentro.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'v3d-lista-empty';
      empty.textContent = 'Nenhum volume carregado ainda.';
      frag.appendChild(empty);
    } else {
      dentro.forEach(v => frag.appendChild(criarCardVolume(v, 'dentro')));
    }

    // SEÇÃO FORA
    const headerFora = document.createElement('div');
    headerFora.className = 'v3d-lista-sec v3d-lista-sec-warn';
    headerFora.innerHTML = `<span>Fora · staging</span><strong>${fora.length}</strong>`;
    frag.appendChild(headerFora);

    if (fora.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'v3d-lista-empty';
      empty.textContent = 'Todos os itens estão carregados.';
      frag.appendChild(empty);
    } else {
      fora.forEach(v => frag.appendChild(criarCardVolume(v, 'fora')));
    }

    listaVolumesEl.appendChild(frag);
    return;
  }

  // Modo automático: lista flat
  const frag = document.createDocumentFragment();
  volumes.forEach(v => frag.appendChild(criarCardVolume(v, 'auto')));
  listaVolumesEl.appendChild(frag);
}

function criarCardVolume(v, modo) {
  const cor = v.corHex || corHex(getCorPorPedido(v.pedido));
  const zona = v.zona != null ? ZONA_NOMES[v.zona] : '—';

  const card = document.createElement('div');
  card.className = 'v3d-volume-item';
  if (v.forabau) card.classList.add('forabau');
  card.dataset.id = v.id;
  card.dataset.pedido = v.pedido;
  card.style.setProperty('--cor-pedido', cor);

  // Botão de transferência (só em modo manual)
  let btnTransfer = '';
  if (modo === 'dentro') {
    btnTransfer = `<button type="button" class="v3d-volume-btn v3d-volume-btn-warn" data-acao="tirar" data-id="${v.id}" title="Tirar do caminhão">↩ Fora</button>`;
  } else if (modo === 'fora') {
    btnTransfer = `<button type="button" class="v3d-volume-btn v3d-volume-btn-primary" data-acao="meter" data-id="${v.id}" title="Carregar no caminhão">→ Carregar</button>`;
  }

  card.innerHTML = `
    <div class="v3d-volume-header">
      <div class="v3d-volume-title-wrap">
        <span class="v3d-volume-dot" style="background:${cor}"></span>
        <div class="v3d-volume-title">Ped ${escapeHtml(String(v.pedido))} · ${escapeHtml(String(v.codprod || ''))}</div>
      </div>
      <div class="v3d-volume-chip">${(Number(v.pesoKg) || 0).toFixed(1)} kg</div>
    </div>
    <div class="v3d-volume-sub">${escapeHtml(v.descrprod || 'Volume')}</div>
    <div class="v3d-volume-sub mono">${(Number(v.profundidadeM) || 0).toFixed(2)}×${(Number(v.larguraM) || 0).toFixed(2)}×${(Number(v.alturaM) || 0).toFixed(2)} m · ${zona}</div>
    ${btnTransfer ? `<div class="v3d-volume-actions">${btnTransfer}</div>` : ''}
  `;

  card.addEventListener('mouseenter', () => highlightMesh(v.id, true));
  card.addEventListener('mouseleave', () => {
    if (!selectedMesh || selectedMesh.userData.volumeData?.id !== v.id) highlightMesh(v.id, false);
  });
  card.addEventListener('click', (e) => {
    // Não abre detalhes se clicou no botão de transferência
    if (e.target.closest('[data-acao]')) return;
    abrirDetalhes(v);
  });

  // Handlers dos botões
  card.querySelectorAll('[data-acao]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const acao = btn.dataset.acao;
      const id = btn.dataset.id;
      if (acao === 'tirar') tirarDoCaminhao(id);
      else if (acao === 'meter') meterNoCaminhao(id);
    });
  });

  return card;
}

// ================== TRANSFERÊNCIA DENTRO ↔ FORA ==================

function tirarDoCaminhao(volumeId) {
  const v = carga._volumesAtuais.find(x => String(x.id) === String(volumeId));
  if (!v) return;
  const mesh = volumesMesh.find(m => m.userData.volumeData?.id === volumeId);
  if (!mesh) return;

  const cam = carga._caminhaoAtual || {};
  const idxFora = carga._volumesAtuais.filter(x => x.forabau).length;
  const sp = calcularPosicaoStaging(idxFora, v, cam);

  // Anima ida pra staging
  const mat = mesh.material;
  const eLine = volumesEdges[volumesMesh.indexOf(mesh)];
  const target = new THREE.Vector3(sp.x, sp.y, sp.z);
  animarMoveMesh(mesh, eLine, target);

  // Atualiza estado
  v.forabau = true;
  v.zona = null;
  v.x = sp.x - v.profundidadeM / 2;
  v.y = 0;
  v.z = sp.z - v.larguraM / 2;
  v.px = sp.x;
  v.py = sp.y;
  v.pz = sp.z;
  v.manualPos = { x: v.x, y: v.y, z: v.z };

  fecharDetalhes();
  renderListaVolumes(carga._volumesAtuais);
  atualizarResumoCargaUI(carga._volumesAtuais.filter(x => !x.forabau), cam);
  atualizarPesoPorZonaUI(carga._volumesAtuais.filter(x => !x.forabau));
  showToast(`${v.descrprod || 'Item'} removido do caminhão`);
}

function meterNoCaminhao(volumeId) {
  const v = carga._volumesAtuais.find(x => String(x.id) === String(volumeId));
  if (!v) return;
  const mesh = volumesMesh.find(m => m.userData.volumeData?.id === volumeId);
  if (!mesh) return;

  const cam = carga._caminhaoAtual || {};
  const L = cam.comprimentoM || 6;
  const W = cam.larguraM || 2.4;
  const H = cam.alturaM || 2.4;

  // Tenta achar um lugar livre dentro do baú (escaneia)
  const dx = v.profundidadeM;
  const dy = v.alturaM;
  const dz = v.larguraM;
  let achou = null;
  const STEP = 0.05;
  outer:
  for (let y = 0; y + dy <= H; y += STEP * 2) {
    for (let x = L - dx; x >= 0; x -= STEP * 2) {
      for (let z = 0; z + dz <= W; z += STEP * 2) {
        // testa AABB contra todos os outros volumes que estão dentro
        const cx = x + dx / 2;
        const cy = y + dy / 2;
        const cz = z + dz / 2;
        let livre = true;
        for (const outro of carga._volumesAtuais) {
          if (outro.id === v.id || outro.forabau) continue;
          const ox = outro.px;
          const oy = outro.py;
          const oz = outro.pz;
          const ohx = outro.profundidadeM / 2;
          const ohy = outro.alturaM / 2;
          const ohz = outro.larguraM / 2;
          if (Math.abs(cx - ox) < dx / 2 + ohx &&
              Math.abs(cy - oy) < dy / 2 + ohy &&
              Math.abs(cz - oz) < dz / 2 + ohz) {
            livre = false;
            break;
          }
        }
        if (livre) {
          achou = { x: cx, y: cy, z: cz, xR: x, yR: y, zR: z };
          break outer;
        }
      }
    }
  }

  if (!achou) {
    showToast('Sem espaço livre no baú. Arraste o item manualmente.', true);
    return;
  }

  // Anima entrada
  const eLine = volumesEdges[volumesMesh.indexOf(mesh)];
  animarMoveMesh(mesh, eLine, new THREE.Vector3(achou.x, achou.y, achou.z));

  v.forabau = false;
  v.x = achou.xR;
  v.y = achou.yR;
  v.z = achou.zR;
  v.px = achou.x;
  v.py = achou.y;
  v.pz = achou.z;
  v.manualPos = { x: v.x, y: v.y, z: v.z };
  v.zona = Math.max(0, Math.min(4, Math.floor((1 - achou.x / L) * 5)));

  renderListaVolumes(carga._volumesAtuais);
  atualizarResumoCargaUI(carga._volumesAtuais.filter(x => !x.forabau), cam);
  atualizarPesoPorZonaUI(carga._volumesAtuais.filter(x => !x.forabau));
  showToast(`${v.descrprod || 'Item'} carregado no caminhão`);
}

// Anima mesh + edge line indo até target em ~400ms
function animarMoveMesh(mesh, eLine, target) {
  const startPos = mesh.position.clone();
  const DUR = 400;
  let t = 0;
  let lt = null;
  function step(now) {
    if (!lt) lt = now;
    t += now - lt;
    lt = now;
    const p = Math.min(t / DUR, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    mesh.position.lerpVectors(startPos, target, ease);
    if (eLine) eLine.position.copy(mesh.position);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function applyFiltroPedido() {
  if (!carga || !carga._volumesAtuais) return;
  const filtro = (filtroPedidoInput?.value || '').trim().toLowerCase();
  const vols = filtro
    ? carga._volumesAtuais.filter(v => String(v.pedido).toLowerCase().includes(filtro))
    : carga._volumesAtuais;
  renderListaVolumes(vols);
}

// ================== RAYCASTER (hover, click, drag) ==================

function setupRaycasterEvents() {
  const dom = renderer.domElement;
  const mouse = new THREE.Vector2();

  function getMouseNDC(e) {
    const rect = dom.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    return mouse;
  }

  function getIntersectedMesh(e) {
    getMouseNDC(e);
    dragRaycaster.setFromCamera(mouse, camera);
    const hits = dragRaycaster.intersectObjects(volumesMesh, false);
    return hits.length ? hits[0] : null;
  }

  // HOVER: mostra hover card
  dom.addEventListener('mousemove', (e) => {
    // Se está em drag, não faz hover
    if (dragTarget) return;

    const hit = getIntersectedMesh(e);
    if (hit) {
      const v = hit.object.userData.volumeData;
      if (v) showHover(v, e);
      dom.style.cursor = manualDragEnabled ? 'grab' : 'pointer';
    } else {
      hideHover();
      dom.style.cursor = '';
    }
  });

  dom.addEventListener('mouseleave', () => hideHover());

  // CLICK: abre detalhes (só se não foi drag)
  let mouseDownPos = null;
  dom.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    mouseDownPos = { x: e.clientX, y: e.clientY };

    // Em modo manual: inicia drag
    if (manualDragEnabled) {
      const hit = getIntersectedMesh(e);
      if (hit) {
        dragTarget = hit.object;
        const v = dragTarget.userData.volumeData;

        // Plano horizontal na altura atual da caixa
        dragShiftHeld = e.shiftKey;
        const planeNormal = dragShiftHeld ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
        const planeY = dragTarget.position.y;
        dragPlane.setFromNormalAndCoplanarPoint(planeNormal, dragTarget.position);

        // Offset do click até o centro da caixa
        const intersect = new THREE.Vector3();
        dragRaycaster.ray.intersectPlane(dragPlane, intersect);
        dragOffset.copy(intersect).sub(dragTarget.position);

        controls.enabled = false;
        dom.style.cursor = 'grabbing';
      }
    }
  });

  dom.addEventListener('mousemove', (e) => {
    if (!dragTarget) return;

    // Atualiza plano se shift mudar no meio do drag
    const shiftAgora = e.shiftKey;
    if (shiftAgora !== dragShiftHeld) {
      dragShiftHeld = shiftAgora;
      const planeNormal = dragShiftHeld ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      dragPlane.setFromNormalAndCoplanarPoint(planeNormal, dragTarget.position);
    }

    getMouseNDC(e);
    dragRaycaster.setFromCamera(mouse, camera);
    const newPos = new THREE.Vector3();
    if (!dragRaycaster.ray.intersectPlane(dragPlane, newPos)) return;
    newPos.sub(dragOffset);

    // Snap 5cm
    newPos.x = Math.round(newPos.x / SNAP) * SNAP;
    newPos.z = Math.round(newPos.z / SNAP) * SNAP;
    if (dragShiftHeld) {
      newPos.y = Math.round(newPos.y / SNAP) * SNAP;
    } else {
      newPos.y = dragTarget.position.y; // mantém altura
    }

    // Clamp em range estendido: dentro do baú OU dentro da staging area
    const cam = carga?._caminhaoAtual || carga?.caminhao || {};
    const L = cam.comprimentoM || 6;
    const W = cam.larguraM || 2.4;
    const H = cam.alturaM || 2.4;

    // Limites estendidos: x livre dentro de [-0.5, L*1.5], z livre até staging
    const v = dragTarget.userData.volumeData;
    const halfX = (v.profundidadeM || 0.1) / 2;
    const halfY = (v.alturaM || 0.1) / 2;
    const halfZ = (v.larguraM || 0.1) / 2;

    const xMin = -0.5 + halfX;
    const xMax = L * 1.4 - halfX;
    const yMin = halfY;
    const yMax = H - halfY;
    const zMin = halfZ;
    const zMax = W + 7 - halfZ; // até onde vai a staging

    newPos.x = Math.max(xMin, Math.min(xMax, newPos.x));
    newPos.y = Math.max(yMin, Math.min(yMax, newPos.y));
    newPos.z = Math.max(zMin, Math.min(zMax, newPos.z));

    dragTarget.position.copy(newPos);
    // Sincroniza edge line
    const eLine = volumesEdges[volumesMesh.indexOf(dragTarget)];
    if (eLine) eLine.position.copy(newPos);

    // Verifica colisões durante o drag (só quando dentro do baú)
    const vd = dragTarget.userData.volumeData;
    if (dentroDoCaminhao(newPos.x, newPos.y, newPos.z,
                          vd.profundidadeM || 0.1, vd.alturaM || 0.1, vd.larguraM || 0.1,
                          cam)) {
      checarColisoes();
    } else {
      limparVisualColisao();
    }
  });

  dom.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    const wasDrag = dragTarget !== null;
    const moved = mouseDownPos && (Math.abs(e.clientX - mouseDownPos.x) > 3 || Math.abs(e.clientY - mouseDownPos.y) > 3);

    if (wasDrag) {
      const v = dragTarget.userData.volumeData;
      const halfX = (v.profundidadeM || 0.1) / 2;
      const halfY = (v.alturaM || 0.1) / 2;
      const halfZ = (v.larguraM || 0.1) / 2;
      const cam = carga?._caminhaoAtual || carga?.caminhao || {};

      // Verifica se o item foi solto DENTRO do caminhão ou FORA (staging)
      const dentro = dentroDoCaminhao(
        dragTarget.position.x, dragTarget.position.y, dragTarget.position.z,
        v.profundidadeM || 0.1, v.alturaM || 0.1, v.larguraM || 0.1,
        cam
      );

      v.forabau = !dentro;
      v.manualPos = {
        x: dragTarget.position.x - halfX,
        y: dragTarget.position.y - halfY,
        z: dragTarget.position.z - halfZ
      };
      v.x = v.manualPos.x;
      v.y = v.manualPos.y;
      v.z = v.manualPos.z;
      v.px = dragTarget.position.x;
      v.py = dragTarget.position.y;
      v.pz = dragTarget.position.z;

      // Atualiza zona (só se dentro)
      if (dentro) {
        const L = cam.comprimentoM || 6;
        v.zona = Math.max(0, Math.min(4, Math.floor((1 - dragTarget.position.x / L) * 5)));
      } else {
        v.zona = null;
      }

      // Limpa visual de colisão
      limparVisualColisao();

      // Re-render lista (refletir mudança de forabau)
      atualizarPesoPorZonaUI(carga._volumesAtuais);
      renderListaVolumes(carga._volumesAtuais);
      atualizarResumoCargaUI(carga._volumesAtuais.filter(x => !x.forabau), cam);

      dragTarget = null;
      controls.enabled = true;
      renderer.domElement.style.cursor = 'grab';
      mouseDownPos = null;

      // Toast se foi pra staging
      if (!dentro) {
        showToast(`${v.descrprod || 'Item'} movido pra área externa`);
      }
      return;
    }

    // Click puro (sem drag) → abre detalhes
    if (!moved) {
      const hit = getIntersectedMesh(e);
      if (hit) {
        const v = hit.object.userData.volumeData;
        if (v) abrirDetalhes(v);
      }
    }

    mouseDownPos = null;
  });

  // Tecla R: rotaciona volume selecionado em manual
  document.addEventListener('keydown', (e) => {
    if (!manualDragEnabled || !selectedMesh) return;
    if (e.key === 'r' || e.key === 'R') {
      const v = selectedMesh.userData.volumeData;
      if (!v) return;
      // Troca largura ↔ profundidade
      const tmp = v.profundidadeM;
      v.profundidadeM = v.larguraM;
      v.larguraM = tmp;
      // Recria geometria
      const novaGeo = new THREE.BoxGeometry(v.profundidadeM, v.alturaM, v.larguraM);
      selectedMesh.geometry.dispose();
      selectedMesh.geometry = novaGeo;
      const eLine = volumesEdges[volumesMesh.indexOf(selectedMesh)];
      if (eLine) {
        eLine.geometry.dispose();
        eLine.geometry = new THREE.EdgesGeometry(novaGeo);
      }
      showToast('Volume rotacionado 90°');
    }
  });
}

function showHover(v, e) {
  if (!hoverCard) return;
  document.getElementById('hoverTitulo').textContent = v.descrprod || v.codprod || 'Item';
  document.getElementById('hoverPedido').textContent = v.pedido || '—';
  document.getElementById('hoverCodigo').textContent = v.codprod || '—';
  document.getElementById('hoverPeso').textContent = `${(Number(v.pesoKg) || 0).toFixed(2)} kg`;
  document.getElementById('hoverMedidas').textContent =
    `${(Number(v.profundidadeM) || 0).toFixed(2)}×${(Number(v.larguraM) || 0).toFixed(2)}×${(Number(v.alturaM) || 0).toFixed(2)} m`;
  document.getElementById('hoverZona').textContent = v.zona != null ? ZONA_NOMES[v.zona] : '—';

  hoverCard.classList.remove('is-hidden');
  // Posiciona perto do mouse
  const rect = canvasContainer.getBoundingClientRect();
  let x = e.clientX - rect.left + 14;
  let y = e.clientY - rect.top + 14;
  const cardWidth = hoverCard.offsetWidth || 240;
  const cardHeight = hoverCard.offsetHeight || 180;
  if (x + cardWidth > rect.width) x = e.clientX - rect.left - cardWidth - 14;
  if (y + cardHeight > rect.height) y = e.clientY - rect.top - cardHeight - 14;
  hoverCard.style.left = x + 'px';
  hoverCard.style.top = y + 'px';
}

function hideHover() {
  if (hoverCard) hoverCard.classList.add('is-hidden');
}

// ================== ABAS / MODO ==================

function initTabs() {
  document.querySelectorAll('.v3d-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.v3d-tab').forEach(t => t.classList.toggle('is-active', t === tab));
      document.querySelectorAll('.v3d-tab-panel').forEach(p =>
        p.classList.toggle('is-active', p.dataset.panel === target)
      );
    });
  });

  // Radios de modo
  document.querySelectorAll('input[name="modoCarga"]').forEach(r => {
    r.addEventListener('change', () => {
      document.querySelectorAll('.v3d-modo-opt').forEach(o => {
        o.classList.toggle('is-active', o.querySelector('input').checked);
      });
    });
  });

  // Aplicar modo
  document.getElementById('btnAplicarModo')?.addEventListener('click', () => {
    const sel = document.querySelector('input[name="modoCarga"]:checked');
    if (!sel) return;
    modoCarga = sel.value;
    aplicarModo();
  });
}

function aplicarModo() {
  const isManual = modoCarga === 'manual';
  manualDragEnabled = isManual;

  document.getElementById('v3d-modo-manual-bar').style.display = isManual ? 'inline-flex' : 'none';
  document.getElementById('manualHelp').style.display = isManual ? 'block' : 'none';

  // Re-renderiza com o modo selecionado
  if (selectCaminhao) {
    renderForCaminhao(selectCaminhao.value);
  }

  showToast(`Modo aplicado: ${
    modoCarga === 'manual' ? 'Manual' :
    modoCarga === 'auto-entrega' ? 'Auto por entrega (LIFO)' :
    'Auto por peso'
  }`);
}

// ================== CAMINHÃO ==================

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
  selectCaminhao.addEventListener('change', () => renderForCaminhao(selectCaminhao.value));
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
  fecharDetalhes();
  clearScene();
  const cam = getCaminhaoById(idSel);
  const volumes = getVolumesForCaminhao(idSel);
  carga._caminhaoAtual = cam;

  // Aplica ordemEntrega do payload (se vier) nos volumes
  if (carga.ordemEntrega && Array.isArray(carga.ordemEntrega)) {
    const mapaOrdem = {};
    if (Array.isArray(carga.ordemEntrega)) {
      carga.ordemEntrega.forEach((item, idx) => {
        if (typeof item === 'object' && item.pedido) {
          mapaOrdem[String(item.pedido)] = item.ordem || (idx + 1);
        } else {
          mapaOrdem[String(item)] = idx + 1;
        }
      });
    }
    volumes.forEach(v => {
      if (v.ordemEntrega == null && mapaOrdem[String(v.pedido)] != null) {
        v.ordemEntrega = mapaOrdem[String(v.pedido)];
      }
    });
  }

  // Em modo MANUAL: todos os volumes começam FORA do baú (na staging area)
  // O usuário arrasta cada um pra dentro manualmente
  let vols;
  if (modoCarga === 'manual') {
    // Reseta flag forabau e posiciona em grade na staging
    vols = volumes.map((v, idx) => {
      const dx = Math.max(Number(v.profundidadeM) || 0.3, 0.3);
      const dy = Math.max(Number(v.alturaM) || 0.3, 0.3);
      const dz = Math.max(Number(v.larguraM) || 0.3, 0.3);

      const pos = v.manualPos
        ? { x: v.manualPos.x, y: v.manualPos.y, z: v.manualPos.z }
        : (() => {
            const sp = calcularPosicaoStaging(idx, v, cam);
            return { x: sp.x - dx / 2, y: 0, z: sp.z - dz / 2 };
          })();

      // Se nunca foi posicionado manualmente, está fora
      const forabau = v.manualPos
        ? !dentroDoCaminhao(pos.x + dx / 2, pos.y + dy / 2, pos.z + dz / 2, dx, dy, dz, cam)
        : true;

      return {
        ...v,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        px: pos.x + dx / 2,
        py: pos.y + dy / 2,
        pz: pos.z + dz / 2,
        profundidadeM: dx,
        alturaM: dy,
        larguraM: dz,
        pesoKg: Number(v.pesoKg) || 0,
        volumeM3: dx * dy * dz,
        cor: getCorPorPedido(v.pedido),
        corHex: corHex(getCorPorPedido(v.pedido)),
        forabau,
        zona: forabau ? null : Math.max(0, Math.min(4, Math.floor((1 - (pos.x + dx / 2) / (cam.comprimentoM || 6)) * 5)))
      };
    });
  } else {
    // Modo auto: limpa forabau (todos vão pra dentro)
    volumes.forEach(v => { v.forabau = false; });
    const result = aplicarRegrasCarregamento(volumes, cam || {}, modoCarga);
    vols = result.volumes;
  }

  carga._volumesAtuais = vols;

  criarBau(cam);
  criarVolumesAnimados(vols);
  renderListaVolumes(vols);
  // Para auto-modo conta todos; pra manual conta só os dentro
  const dentroVols = vols.filter(v => !v.forabau);
  atualizarResumoCargaUI(dentroVols, cam || {});
  atualizarPesoPorZonaUI(dentroVols);
  renderLegenda(vols);
  recenterCamera();

  animIdx = 0;
  animTimer = 0;
  animPlaying = false;
  animLastTick = null;

  // Em modo manual: não anima (já mostra tudo direto)
  if (modoCarga === 'manual') {
    skipFim();
  } else {
    setTimeout(() => playAnim(), 700);
  }
}

function renderLegenda(volumes) {
  const leg = document.getElementById('v3d-legenda');
  if (!leg) return;
  const pedidos = new Map();
  volumes.forEach(v => {
    if (!pedidos.has(v.pedido)) {
      pedidos.set(v.pedido, { cor: corHex(getCorPorPedido(v.pedido)), count: 0 });
    }
    pedidos.get(v.pedido).count++;
  });
  if (pedidos.size <= 1) { leg.classList.remove('show'); leg.innerHTML = ''; return; }
  let html = '<div class="v3d-legenda-title">Pedidos</div>';
  pedidos.forEach((info, ped) => {
    html += `<div class="v3d-legenda-item"><span class="v3d-legenda-dot" style="background:${info.cor}"></span>${escapeHtml(String(ped))} · ${info.count}</div>`;
  });
  leg.innerHTML = html;
  leg.classList.add('show');
}

// ================== IMPRIMIR ==================

function imprimirLayout() {
  if (!carga?._volumesAtuais?.length) {
    showToast('Nenhum item para imprimir.', true);
    return;
  }
  const cam = carga._caminhaoAtual || {};
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  const titulo = `Layout de carga · ${cam.descricao || cam.id || ''}`;
  const r = getResumoCarga(carga._volumesAtuais, cam);
  const linhas = carga._volumesAtuais.map(v => `
    <tr>
      <td>${v.pedido}</td>
      <td>${v.codprod || '—'}</td>
      <td>${escapeHtml(v.descrprod || '—')}</td>
      <td style="text-align:right">${(v.pesoKg || 0).toFixed(1)}</td>
      <td style="text-align:right">${(v.volumeM3 || 0).toFixed(4)}</td>
      <td>${(v.profundidadeM || 0).toFixed(2)} × ${(v.larguraM || 0).toFixed(2)} × ${(v.alturaM || 0).toFixed(2)}</td>
      <td>${v.zona != null ? ZONA_NOMES[v.zona] : '—'}</td>
      <td>${v.ordemEntrega ?? '—'}</td>
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
    <p>Pedidos: ${r.pedidos} · Itens: ${r.volumes} · Peso: ${r.peso.toFixed(1)} kg · Volume: ${r.volume.toFixed(3)} m³ · Ocupação: ${r.ocupPct.toFixed(1)}%</p>
    <table>
      <thead><tr>
        <th>Pedido</th><th>Cód</th><th>Produto</th><th>Peso (kg)</th><th>Vol (m³)</th><th>Dim (m)</th><th>Zona</th><th>Ordem</th>
      </tr></thead>
      <tbody>${linhas}</tbody>
    </table>
    <p style="margin-top:12px;color:#888;font-size:10px">
      Modo: ${modoCarga} · Gerado por VISYA Logística
    </p>
    <script>window.print();<\/script></body></html>`);
  win.document.close();
}

// ================== LOOP ==================

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  if (!animate._lastNow) animate._lastNow = now;
  const delta = (now - animate._lastNow) / 1000;
  animate._lastNow = now;
  if (controls) controls.update();
  tickColisao(delta);
  if (renderer && scene && camera) renderer.render(scene, camera);
}

// ================== HELPERS ==================

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ================== EXPORT PRA HUD ==================

window.__v3d = {
  playAnim, pauseAnim, resetAnim, skipFim,
  toggleWireframe, toggleExplode, toggleSection, toggleAutoRotate,
  setCamFront, setCamTop, setCamSide, setCamIso,
  recenterCamera, imprimirLayout
};

// ================== INIT ==================

document.addEventListener('DOMContentLoaded', () => {
  carga = obterCargaDoOpener();

  if (!carga) {
    showToast('Dados de carga não encontrados. Abra a partir da tela de rotas.', true);
    carga = {
      caminhao: { id: 'demo', descricao: 'Caminhão Demo', comprimentoM: 6.95, larguraM: 2.50, alturaM: 2.00 },
      volumes: [
        { id: 'V1', pedido: '739968', codprod: '19377', descrprod: 'TURFA GEL BB 20 LT', larguraM: 0.29, alturaM: 0.40, profundidadeM: 0.23, pesoKg: 22.97, ordemEntrega: 1 },
        { id: 'V2', pedido: '739968', codprod: '21590', descrprod: 'LITHAMIN PLUS BB 20 LT', larguraM: 0.27, alturaM: 0.38, profundidadeM: 0.24, pesoKg: 25.0, ordemEntrega: 1 },
        { id: 'V3', pedido: '749641', codprod: '24458', descrprod: 'AMINO ARGININE 1LT', larguraM: 0.37, alturaM: 0.26, profundidadeM: 0.28, pesoKg: 1.0, ordemEntrega: 3 },
        { id: 'V4', pedido: '748204', codprod: '26598', descrprod: 'AMINO FORT 1L', larguraM: 0.37, alturaM: 0.26, profundidadeM: 0.28, pesoKg: 1.1, ordemEntrega: 2 }
      ]
    };
  }

  try { initThree(); } catch (e) { console.error('[INIT] initThree:', e); return; }

  initTabs();
  initCaminhaoSelector();

  // Bind HUD buttons
  document.getElementById('v3d-btn-play')?.addEventListener('click', playAnim);
  document.getElementById('v3d-btn-pause')?.addEventListener('click', pauseAnim);
  document.getElementById('v3d-btn-reset')?.addEventListener('click', resetAnim);
  document.getElementById('v3d-btn-skip')?.addEventListener('click', skipFim);
  document.getElementById('v3d-btn-wire')?.addEventListener('click', toggleWireframe);
  document.getElementById('v3d-btn-explode')?.addEventListener('click', toggleExplode);
  document.getElementById('v3d-btn-section')?.addEventListener('click', toggleSection);
  document.getElementById('v3d-btn-rotate')?.addEventListener('click', toggleAutoRotate);

  document.getElementById('speedRange')?.addEventListener('input', (e) => {
    animSpeed = Number(e.target.value);
    const lbl = document.getElementById('v3d-spd-lbl');
    if (lbl) lbl.textContent = animSpeed + '×';
  });

  document.getElementById('btnCamReset')?.addEventListener('click', recenterCamera);
  document.getElementById('btnCamFront')?.addEventListener('click', setCamFront);
  document.getElementById('btnCamTop')?.addEventListener('click', setCamTop);
  document.getElementById('btnCamSide')?.addEventListener('click', setCamSide);
  document.getElementById('btnCamIso')?.addEventListener('click', setCamIso);

  document.getElementById('btnFecharDetalhes')?.addEventListener('click', fecharDetalhes);

  if (btnImprimirLayout) btnImprimirLayout.addEventListener('click', imprimirLayout);
  if (filtroPedidoInput) filtroPedidoInput.addEventListener('input', applyFiltroPedido);

  const idInicial = (carga.caminhao?.id) || (carga.caminhoes?.[0]?.id) || 0;
  try { renderForCaminhao(String(idInicial)); } catch (e) { console.error('[INIT] renderForCaminhao:', e); return; }

  animate();
  console.log('[INIT] VIEWER3D ✅');
});