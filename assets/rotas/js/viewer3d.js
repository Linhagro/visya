// ============================================================
//  viewer3d.js  –  Visualizador 3D de Carga   (Three.js r160)
//  Autor: gerado para sistema logístico
// ============================================================

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160/examples/jsm/controls/OrbitControls.js';


// ─── Paleta de cores para os itens de carga ──────────────────
const CARGO_COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12,
  0x9b59b6, 0x1abc9c, 0xe67e22, 0x34495e,
  0x16a085, 0xc0392b, 0x8e44ad, 0x27ae60,
];


// ─── Dimensões internas do baú (metros / unidades Three.js) ──
const BAU = {
  innerW : 2.30,   // largura interna
  innerH : 2.10,   // altura interna
  innerD : 5.80,   // profundidade interna
  wall   : 0.08,   // espessura das paredes
  // posição do CENTRO do baú no grupo do caminhão
  cx : 0,
  cy : 2.10,       // altura do centro (chão ≈ 0, rodas ≈ 0.5)
  cz : 1.40,       // deslocamento para trás (Z+)
};


// ─── Dimensões externas derivadas ────────────────────────────
const EW = BAU.innerW + BAU.wall * 2;
const EH = BAU.innerH + BAU.wall * 2;
const ED = BAU.innerD + BAU.wall * 2;



// ════════════════════════════════════════════════════════════
export class Viewer3D {

  /**
   * @param {string} canvasId – id do elemento anvas>
   * @param {string} listId   – id do elemento da lista de itens
   */
  constructor(canvasId, listId) {
    this.canvasId   = canvasId;
    this.listId     = listId;
    this.scene      = null;
    this.camera     = null;
    this.renderer   = null;
    this.controls   = null;
    this.truckGroup = null;
    this.cargoGroup = null;
    this._raf       = null;
    this._colorMap  = new Map();   // descrição → cor THREE
    this._colorIdx  = 0;
  }

  // ── Inicializa cena, câmera, renderer, luzes, caminhão ────
  init() {
    const canvas = document.getElementById(this.canvasId);
    if (!canvas) {
      console.error('[Viewer3D] canvas não encontrado:', this.canvasId);
      return;
    }

    /* ── Renderer ─────────────────────────────────────── */
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace  = THREE.SRGBColorSpace;

    /* ── Scene ────────────────────────────────────────── */
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8ecf0);
    this.scene.fog        = new THREE.FogExp2(0xe8ecf0, 0.025);

    /* ── Câmera ───────────────────────────────────────── */
    this.camera = new THREE.PerspectiveCamera(
      45,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      120
    );
    this.camera.position.set(9, 6, 12);

    /* ── Orbit Controls ───────────────────────────────── */
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance   = 3;
    this.controls.maxDistance   = 30;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.target.set(0, 1.8, 0);
    this.controls.update(); // [web:11]

    /* ── Luzes ────────────────────────────────────────── */
    this._setupLights();

    /* ── Chão + Grid ──────────────────────────────────── */
    this._buildGround();

    /* ── Caminhão ─────────────────────────────────────── */
    this.truckGroup = new THREE.Group();
    this.scene.add(this.truckGroup);
    this._buildTruck();

    /* ── Grupo de carga (filho do truckGroup) ─────────── */
    this.cargoGroup = new THREE.Group();
    this.truckGroup.add(this.cargoGroup);

    /* ── Resize ───────────────────────────────────────── */
    window.addEventListener('resize', () => this._onResize(canvas)); // [web:16]

    /* ── Loop ─────────────────────────────────────────── */
    this._animate();
  }

  // ── Destrói o viewer (limpa RAF e renderer) ───────────────
  destroy() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this.renderer?.dispose();
  }

  // ── API pública: carrega pedido no viewer ─────────────────
  //  @param {object} pedido
  //  { numero, volumes: [{descricao, largura, altura, comprimento, peso, quantidade}] }
  loadPedido(pedido) {
    if (!pedido) return;

    // limpa carga anterior
    this.cargoGroup.clear();
    this._colorMap.clear();
    this._colorIdx = 0;

    // normaliza volumes
    const volumes = Array.isArray(pedido.volumes) ? pedido.volumes : [];

    // monta lista lateral
    this._buildItemList(pedido, volumes);

    // empacota itens no baú
    this._packCargo(volumes);
  }

  // ════════════════════════════════════════════════════════
  //  PRIVADO – Loop de animação
  // ════════════════════════════════════════════════════════
  _animate() {
    this._raf = requestAnimationFrame(() => this._animate());
    this.controls?.update();
    this.renderer?.render(this.scene, this.camera);
  }

  // ════════════════════════════════════════════════════════
  //  PRIVADO – Resize
  // ════════════════════════════════════════════════════════
  _onResize(canvas) {
    const width  = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false); // [web:16]
  }

  // ════════════════════════════════════════════════════════
  //  PRIVADO – Luzes
  // ════════════════════════════════════════════════════════
  _setupLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const sun = new THREE.DirectionalLight(0xfff4e0, 1.3);
    sun.position.set(12, 20, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -18, right: 18, top: 18, bottom: -18, near: 0.5, far: 60,
    });
    this.scene.add(sun);

    const fill = new THREE.DirectionalLight(0xbbd4ff, 0.45);
    fill.position.set(-8, 8, -8);
    this.scene.add(fill);

    const back = new THREE.HemisphereLight(0xddeeff, 0x887766, 0.3);
    this.scene.add(back);
  }

  // ════════════════════════════════════════════════════════
  //  PRIVADO – Chão
  // ════════════════════════════════════════════════════════
  _buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60),
      new THREE.MeshLambertMaterial({ color: 0xc8cfd8 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(60, 60, 0x99aabb, 0x99aabb);
    grid.material.opacity = 0.25;
    grid.material.transparent = true;
    this.scene.add(grid);
  }

  // ════════════════════════════════════════════════════════
  //  PRIVADO – Caminhão completo
  // ════════════════════════════════════════════════════════
  _buildTruck() {
    /* ── Materiais ─────────────────────────────────────── */
    const matBody  = this._mat(0xfafafa);                       // baú branco
    const matCab   = this._mat(0x1a4fa0);                       // cabine azul
    const matMetal = this._mat(0x777788);                       // metal/chassi
    const matGlass = this._mat(0x88ccee, 0.45);                 // vidro
    const matLight = this._mat(0xffffaa, 0, 0xffee00, 0.9);     // farol
    const matStop  = this._mat(0xff2200, 0, 0xff0000, 0.8);     // lanterna
    const matTire  = this._mat(0x1a1a1a);                       // pneu
    const matRim   = this._mat(0xcccccc);                       // aro

    /* ════ CHASSI / LONGARINAS ══════════════════════════ */
    const chassiY = 0.38;
    [[-0.7], [0.7]].forEach(([x]) => {
      const longMesh = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 10.8), matMetal);
      longMesh.position.set(x, chassiY, 0.2);
      longMesh.castShadow = true;
      this.truckGroup.add(longMesh);
    });
    // travessas
    [-3.5, -1.5, 0.5, 2.5, 4.5].forEach(z => {
      const t = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.14), matMetal);
      t.position.set(0, chassiY - 0.05, z);
      this.truckGroup.add(t);
    });

    /* ════ BAÚ ══════════════════════════════════════════ */
    const { cx, cy, cz, wall, innerW, innerH, innerD } = BAU;

    // piso
    this._bauPlane(cx, cy - innerH/2 - wall/2, cz, EW, wall, ED, matMetal);
    // teto
    this._bauPlane(cx, cy + innerH/2 + wall/2, cz, EW, wall, ED, matBody);
    // lateral esquerda
    this._bauPlane(cx - EW/2 + wall/2, cy, cz, wall, EH, ED, matBody);
    // lateral direita
    this._bauPlane(cx + EW/2 - wall/2, cy, cz, wall, EH, ED, matBody);
    // frente
    this._bauPlane(cx, cy, cz - ED/2 + wall/2, EW, EH, wall, matBody);
    // traseira (porta)
    this._bauPlane(cx, cy, cz + ED/2 - wall/2, EW, EH, wall, this._mat(0xdddddd));

    // nervuras laterais
    for (let i = -2; i <= 2; i++) {
      const zOff = i * (innerD / 5);
      [-EW/2 - 0.02, EW/2 + 0.02].forEach(x => {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, EH, 0.10), matMetal);
        rib.position.set(x, cy, cz + zOff);
        rib.castShadow = true;
        this.truckGroup.add(rib);
      });
    }

    // frisos horizontais
    [cy - innerH/2 + 0.3, cy, cy + innerH/2 - 0.3].forEach(y => {
      [-EW/2 - 0.02, EW/2 + 0.02].forEach(x => {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, ED), matMetal);
        f.position.set(x, y, cz);
        this.truckGroup.add(f);
      });
    });

    // aba de vedação teto
    const eaveGeo = new THREE.BoxGeometry(EW + 0.12, 0.05, ED + 0.12);
    const eave = new THREE.Mesh(eaveGeo, matMetal);
    eave.position.set(cx, cy + EH/2, cz);
    this.truckGroup.add(eave);

    /* ════ CABINE ═══════════════════════════════════════ */
    const cabZ = cz - ED/2 - 1.15;
    const cabY = 1.45;
    const cabW = 2.35;
    const cabH = 1.70;
    const cabD = 2.20;

    // corpo principal
    const cabBody = new THREE.Mesh(new THREE.BoxGeometry(cabW, cabH, cabD), matCab);
    cabBody.position.set(0, cabY, cabZ);
    cabBody.castShadow = true;
    this.truckGroup.add(cabBody);

    // teto
    const roofBox = new THREE.Mesh(new THREE.BoxGeometry(cabW, 0.30, cabD), matCab);
    roofBox.position.set(0, cabY + cabH/2 + 0.13, cabZ);
    this.truckGroup.add(roofBox);

    // defletor de ar
    const deflector = new THREE.Mesh(new THREE.BoxGeometry(cabW + 0.1, 0.55, 0.12), matMetal);
    deflector.position.set(0, cabY + cabH/2 + 0.10, cabZ + cabD/2);
    this.truckGroup.add(deflector);

    // grade frontal
    const grille = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.2, 0.50, 0.06), matMetal);
    grille.position.set(0, cabY - 0.30, cabZ - cabD/2);
    this.truckGroup.add(grille);

    // para-choque frontal
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(cabW + 0.10, 0.22, 0.18), matMetal);
    bumper.position.set(0, 0.62, cabZ - cabD/2 - 0.06);
    bumper.castShadow = true;
    this.truckGroup.add(bumper);

    // estribos
    [-1.05, 1.05].forEach(x => {
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.55), matMetal);
      step.position.set(x, 0.70, cabZ + 0.2);
      this.truckGroup.add(step);
    });

    // para-brisa
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(cabW - 0.30, 0.78, 0.04), matGlass);
    windshield.position.set(0, cabY + 0.22, cabZ - cabD/2 - 0.01);
    windshield.rotation.x = THREE.MathUtils.degToRad(8);
    this.truckGroup.add(windshield);

    // janelas laterais + espelhos
    [-cabW/2 - 0.01, cabW/2 + 0.01].forEach((x, i) => {
      const sideWin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.55, 0.75), matGlass);
      sideWin.position.set(x, cabY + 0.20, cabZ - 0.15);
      this.truckGroup.add(sideWin);

      const mirrorArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.04), matMetal);
      mirrorArm.position.set(
        x + (i === 0 ? -0.11 : 0.11),
        cabY + 0.48,
        cabZ - cabD/2 + 0.30
      );
      this.truckGroup.add(mirrorArm);

      const mirrorHead = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.20, 0.14), matMetal);
      mirrorHead.position.set(
        x + (i === 0 ? -0.23 : 0.23),
        cabY + 0.48,
        cabZ - cabD/2 + 0.30
      );
      this.truckGroup.add(mirrorHead);
    });

    // faróis principais + posição
    [-0.68, 0.68].forEach(x => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.06), matLight);
      hl.position.set(x, cabY - 0.10, cabZ - cabD/2 - 0.02);
      this.truckGroup.add(hl);

      const pos = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.05), matLight);
      pos.position.set(x, cabY - 0.32, cabZ - cabD/2 - 0.01);
      this.truckGroup.add(pos);
    });

    // lanternas traseiras do baú
    [-EW/2 + 0.18, EW/2 - 0.18].forEach(x => {
      const stop = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.05), matStop);
      stop.position.set(x, cy - innerH/2 + 0.35, cz + ED/2 + 0.01);
      this.truckGroup.add(stop);
    });

    // placa dianteira
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.14, 0.03), this._mat(0xffffff));
    plate.position.set(0, 0.70, cabZ - cabD/2 - 0.10);
    this.truckGroup.add(plate);

    /* ════ RODAS ════════════════════════════════════════ */
    const axleFront = cabZ + 0.50;
    const axleRear1 = cz + ED/2 - 0.80;
    const axleRear2 = cz + ED/2 - 2.10;

    // dianteiras simples
    [-1.28, 1.28].forEach(x => this._addWheel(x, 0.50, axleFront, matTire, matRim, false));

    // traseiras duplas
    [-1.28, 1.28].forEach(x => {
      this._addWheel(x, 0.50, axleRear1, matTire, matRim, true);
      this._addWheel(x, 0.50, axleRear2, matTire, matRim, true);
    });

    // eixos visuais
    [axleFront, axleRear1, axleRear2].forEach(z => {
      const axle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.055, 0.055, 3.20, 10),
        matMetal
      );
      axle.rotation.z = Math.PI / 2;
      axle.position.set(0, 0.50, z);
      this.truckGroup.add(axle);
    });

    /* ════ TANQUE DE COMBUSTÍVEL ════════════════════════ */
    const tank = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.85, 16),
      matMetal
    );
    tank.rotation.z = Math.PI / 2;
    tank.position.set(-1.20, 0.70, cabZ + cabD/2 + 0.20);
    this.truckGroup.add(tank);

    /* ════ ESCAPAMENTO ══════════════════════════════════ */
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 1.80, 8),
      matMetal
    );
    exhaust.position.set(-1.10, cabY + cabH/2 + 0.60, cabZ + cabD/2 - 0.15);
    this.truckGroup.add(exhaust);

    const exhaustCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.055, 0.10, 8),
      matMetal
    );
    exhaustCap.position.set(-1.10, cabY + cabH/2 + 1.52, cabZ + cabD/2 - 0.15);
    this.truckGroup.add(exhaustCap);
  }

  // ════════════════════════════════════════════════════════
  //  PRIVADO – Material helper
  // ════════════════════════════════════════════════════════
  _mat(color, opacity = 1, emissive = 0x000000, metalness = 0.1) {
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive,
      metalness,
      roughness: 0.6,
      transparent: opacity < 1,
      opacity,
    });
    mat.side = THREE.FrontSide;
    return mat;
  }

  // ════════════════════════════════════════════════════════
  //  PRIVADO – Roda completa (pneu + aro + parafusos)
  // ════════════════════════════════════════════════════════
  _addWheel(x, y, z, matTire, matRim, dual = false) {
    const tireRadius = 0.48;
    const tireWidth  = dual ? 0.20 : 0.24;
    const offset     = dual ? 0.13 : 0;
    const sides      = dual ? [-offset, offset] : [0];

    sides.forEach(dx => {
      // pneu
      const tire = new THREE.Mesh(
        new THREE.TorusGeometry(tireRadius - 0.09, 0.13, 14, 28),
        matTire
      );
      tire.rotation.y = Math.PI / 2;
      tire.position.set(x + dx, y, z);
      tire.castShadow = true;
      this.truckGroup.add(tire);

      // aro
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(tireRadius - 0.12, tireRadius - 0.12, tireWidth, 16),
        matRim
      );
      rim.rotation.z = Math.PI / 2;
      rim.position.set(x + dx, y, z);
      rim.castShadow = true;
      this.truckGroup.add(rim);

      // parafusos
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const bolt = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.025, tireWidth + 0.01, 6),
          matRim
        );
        bolt.rotation.z = Math.PI / 2;
        bolt.position.set(
          x + dx,
          y + Math.sin(angle) * (tireRadius - 0.22),
          z + Math.cos(angle) * (tireRadius - 0.22)
        );
        this.truckGroup.add(bolt);
      }

      // hub central
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, tireWidth + 0.02, 12),
        matRim
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.set(x + dx, y, z);
      this.truckGroup.add(hub);
    });
  }

  // ════════════════════════════════════════════════════════
  //  PRIVADO – painel do baú (placa simples)
  // ════════════════════════════════════════════════════════
  _bauPlane(x, y, z, w, h, d, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    this.truckGroup.add(mesh);
    return mesh;
  }

  // ════════════════════════════════════════════════════════
  //  PRIVADO – Empacotamento de carga dentro do baú
  // ════════════════════════════════════════════════════════
  _packCargo(volumes) {
    if (!volumes.length) return;

    const { innerW, innerH, innerD, cx, cy, cz } = BAU;

    // origem do canto interno (mínimo X, mínimo Y, mínimo Z)
    const originX = cx - innerW / 2;
    const originY = cy - innerH / 2;
    const originZ = cz - innerD / 2;

    // algoritmo simples: coluna por coluna, linha por linha
    let curX = originX;
    let curY = originY;
    let curZ = originZ;
    let rowMaxX   = 0; // largura máxima na linha atual
    let layerMaxY = 0; // altura máxima na camada atual

    volumes.forEach((vol, idx) => {
      const qty   = Math.max(1, parseInt(vol.quantidade) || 1);
      const desc  = vol.descricao || vol.produto || `Item ${idx + 1}`;
      const color = this._getColor(desc);
      const mat   = new THREE.MeshLambertMaterial({ color });

      // dimensões em metros (converte cm → m se necessário)
      let iW = parseFloat(vol.largura)     || 0.40;
      let iH = parseFloat(vol.altura)      || 0.40;
      let iD = parseFloat(vol.comprimento) || 0.40;

      // se valores > 5 assume que estão em cm
      if (iW > 5) iW /= 100;
      if (iH > 5) iH /= 100;
      if (iD > 5) iD /= 100;

      // clamp para não ultrapassar o baú
      iW = Math.min(iW, innerW);
      iH = Math.min(iH, innerH);
      iD = Math.min(iD, innerD);

      const gap = 0.015; // espaçamento entre volumes

      for (let q = 0; q < qty; q++) {
        // verifica se cabe na profundidade atual
        if (curZ + iD > originZ + innerD + 0.001) {
          // avança para próxima linha (X+)
          curX += rowMaxX + gap;
          curZ  = originZ;
          rowMaxX = 0;

          // verifica se cabe na largura
          if (curX + iW > originX + innerW + 0.001) {
            // sobe uma camada (Y+)
            curX      = originX;
            curZ      = originZ;
            curY     += layerMaxY + gap;
            rowMaxX   = 0;
            layerMaxY = 0;

            // se não cabe mais na altura, para
            if (curY + iH > originY + innerH + 0.001) break;
          }
        }

        // posição do centro do item
        const px = curX + iW / 2;
        const py = curY + iH / 2;
        const pz = curZ + iD / 2;

        const geo  = new THREE.BoxGeometry(
          Math.max(iW - gap, 0.01),
          Math.max(iH - gap, 0.01),
          Math.max(iD - gap, 0.01)
        );
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(px, py, pz);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;

        // arestas visíveis
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.25,
          })
        );
        mesh.add(edges);

        this.cargoGroup.add(mesh);

        // atualiza cursores
        curZ      += iD + gap;
        rowMaxX    = Math.max(rowMaxX,   iW);
        layerMaxY  = Math.max(layerMaxY, iH);
      }
    });
  }

  // ════════════════════════════════════════════════════════
  //  PRIVADO – Lista lateral de itens com scroll
  // ════════════════════════════════════════════════════════
  _buildItemList(pedido, volumes) {
    const el = document.getElementById(this.listId);
    if (!el) return;

    el.innerHTML = '';

    // cabeçalho do pedido
    const header = document.createElement('div');
    header.className = 'viewer-list-header';
    const numPedido  = pedido.numero || pedido.id || '—';
    const cliente    = pedido.cliente || pedido.nomeCliente || '';

    header.innerHTML = `
      <div class="vlh-title">
        <span class="vlh-icon">📦</span>
        <span class="vlh-num">Pedido #${numPedido}</span>
      </div>
      ${cliente ? `<div class="vlh-cliente">${cliente}</div>` : ''}
      <div class="vlh-total">${volumes.length} tipo(s) de volume</div>
    `;
    el.appendChild(header);

    // container com scroll apenas dos itens
    const listWrap = document.createElement('div');
    listWrap.className = 'viewer-list-scroll';
    el.appendChild(listWrap);

    if (!volumes.length) {
      const empty = document.createElement('div');
      empty.className = 'viewer-list-empty';
      empty.textContent = 'Nenhum volume neste pedido.';
      listWrap.appendChild(empty);
      return;
    }

    volumes.forEach((vol, idx) => {
      const desc  = vol.descricao || vol.produto || `Item ${idx + 1}`;
      const qty   = Math.max(1, parseInt(vol.quantidade) || 1);
      const color = this._getColor(desc);

      const item = document.createElement('div');
      item.className = 'viewer-list-item';

      item.innerHTML = `
        <div class="vli-color" style="background-color:#${color.toString(16).padStart(6, '0')}"></div>
        <div class="vli-main">
          <div class="vli-desc">${desc}</div>
          <div class="vli-meta">
            Qtd: ${qty}
            · ${vol.largura || '—'} x ${vol.altura || '—'} x ${vol.comprimento || '—'}
          </div>
        </div>
      `;

      listWrap.appendChild(item);
    });
  }

  // ════════════════════════════════════════════════════════
  //  PRIVADO – Paleta de cores determinística por descrição
  // ════════════════════════════════════════════════════════
  _getColor(desc) {
    if (this._colorMap.has(desc)) {
      return this._colorMap.get(desc);
    }
    const color = CARGO_COLORS[this._colorIdx % CARGO_COLORS.length];
    this._colorMap.set(desc, color);
    this._colorIdx++;
    return color;
  }
}