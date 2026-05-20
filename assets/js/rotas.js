// assets/js/rotas.js

// ================== CONFIG API BASE ==================

if (!window.API_BASE && window.APIBASE === undefined) {
  window.API_BASE =
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}

if (window.APIBASE === undefined) {
  const DEFAULT_LOGISTICA_API_BASE =
    window.API_BASE ||
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
  const LOGISTICA_SCRIPT_TAG = document.currentScript;
  const LOGISTICA_API_BASE =
    LOGISTICA_SCRIPT_TAG?.dataset?.apiBase || DEFAULT_LOGISTICA_API_BASE;
  window.APIBASE = LOGISTICA_API_BASE;
}

console.log("[ROTAS] rotas.js carregado. APIBASE =", window.APIBASE);

// ================== TOAST + MODAL CONFIRMAÇÃO ==================

function mostrarToast(msg, isError = false) {
  const toast = document.getElementById("toastRotas");
  const span = document.getElementById("toastRotasMsg");
  if (!toast || !span) return;
  span.textContent = msg;
  toast.classList.toggle("toast-ano-error", !!isError);
  toast.classList.add("toast-ano-visible");
  toast.setAttribute("aria-hidden", "false");
  setTimeout(() => {
    toast.classList.remove("toast-ano-visible");
    toast.setAttribute("aria-hidden", "true");
  }, 3500);
}

let _confirmCallback = null;

function abrirConfirmacao(titulo, mensagem, callback) {
  const modal = document.getElementById("modalRotasConfirm");
  const tit = document.getElementById("confirmTitulo");
  const msg = document.getElementById("confirmMensagem");
  if (!modal || !tit || !msg) return;
  tit.textContent = titulo || "Confirmar ação";
  msg.textContent = mensagem || "Tem certeza?";
  _confirmCallback = callback;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function fecharConfirmacao() {
  const modal = document.getElementById("modalRotasConfirm");
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
  _confirmCallback = null;
}

// ================== LOADER LOCAL ==================

let rotasLoaderTimerId = null;

function showRotasLoader() {
  const overlay =
    document.getElementById("loaderOverlay") ||
    document.getElementById("rotas-loader-overlay");
  if (!overlay) return;
  if (rotasLoaderTimerId !== null) clearTimeout(rotasLoaderTimerId);
  rotasLoaderTimerId = setTimeout(() => {
    overlay.setAttribute("aria-hidden", "false");
    overlay.style.display = "flex";
  }, 50);
}

function hideRotasLoader() {
  const overlay =
    document.getElementById("loaderOverlay") ||
    document.getElementById("rotas-loader-overlay");
  if (!overlay) return;
  if (rotasLoaderTimerId !== null) {
    clearTimeout(rotasLoaderTimerId);
    rotasLoaderTimerId = null;
  }
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.display = "none";
}

// ================== AUTH ==================

function getAuthHeadersRotas() {
  try {
    const token =
      (window.sessionStorage && sessionStorage.getItem("authToken")) || null;
    if (!token) return;
    return { Authorization: "Bearer " + token };
  } catch (e) {
    return;
  }
}

async function apiFetch(path, options = {}) {
  const url = window.APIBASE + path;
  const resp = await fetch(url, {
    method: options.method || "GET",
    headers: {
      ...(options.headers || {}),
      ...(getAuthHeadersRotas() || {})
    },
    body: options.body === undefined ? undefined : options.body,
    signal: options.signal
  });
  return resp;
}

const LIMITE_PONTOS_ROTA = 80;

// TOMTOM
const TOMTOM_API_KEY = "l22aGTuKjY30e1lAcUqAup3XZ8pYzCOb";

const tomtomTrafficLayer = L.tileLayer(
  "https://api.tomtom.com/traffic/map/4/tile/flow/absolute/{z}/{x}/{y}.png?key=" +
    TOMTOM_API_KEY,
  { opacity: 0.7, attribution: "© TomTom" }
);

function toggleTraffic(ativo) {
  if (ativo) tomtomTrafficLayer.addTo(map);
  else map.removeLayer(tomtomTrafficLayer);
}

let incidentMarkers = [];

function escolherIconePorCategoria(cat) {
  let color = "#6ea3d1";
  if (cat === 1) color = "#c25450";
  else if (cat === 6) color = "#d4a056";
  else if (cat === 8) color = "#0f172a";
  else if (cat === 9) color = "#d4a056";
  return L.divIcon({
    className: "incident-marker-wrapper",
    html: `<div class="incident-marker" style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #07090c;box-shadow:0 0 6px rgba(0,0,0,0.7);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

function traduzirDescricaoTomTom(desc) {
  if (!desc) return "Incidente de trânsito";
  const d = String(desc).toLowerCase();
  if (d.includes("queuing traffic")) return "Trânsito em fila / lento";
  if (d.includes("stationary traffic")) return "Trânsito parado";
  return desc;
}

async function carregarIncidentesTomTom() {
  showRotasLoader();
  try {
    incidentMarkers.forEach((m) => map.removeLayer(m));
    incidentMarkers = [];

    const bounds = map.getBounds();
    if (map.getZoom() < 9) return;

    const bbox = `${bounds.getWest()},${bounds.getSouth()},${bounds.getEast()},${bounds.getNorth()}`;
    const path = `/logistica/tomtom/incidentes?bbox=${encodeURIComponent(bbox)}`;
    const resp = await apiFetch(path);
    if (!resp.ok) return;
    const data = await resp.json();
    (data.incidents || []).forEach((inc) => {
      const props = inc.properties;
      const geom = inc.geometry;
      const cat = props.iconCategory;
      const evt = props.events && props.events[0];
      const descr = traduzirDescricaoTomTom(evt?.description);
      let lat = null, lon = null;
      if (geom.type === "Point") { lon = geom.coordinates[0]; lat = geom.coordinates[1]; }
      else if (geom.type === "LineString" && geom.coordinates?.length) {
        const mid = Math.floor(geom.coordinates.length / 2);
        lon = geom.coordinates[mid][0];
        lat = geom.coordinates[mid][1];
      }
      if (lat == null || lon == null) return;
      const marker = L.marker([lat, lon], { icon: escolherIconePorCategoria(cat) }).bindPopup(descr);
      marker.addTo(map);
      incidentMarkers.push(marker);
    });
  } catch (e) {
    console.warn("[ROTAS] Erro TomTom:", e);
  } finally {
    hideRotasLoader();
  }
}

// ================== MAPA ==================

const map = L.map("map", {
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  wheelDebounceTime: 20,
  wheelPxPerZoomLevel: 80,
  attributionControl: false
}).setView([-19.5, -40.3], 7);

L.Marker.prototype.options.icon = L.divIcon({ className: "", html: "", iconSize: null });

// ================== CAMADAS DE MAPA ==================

// OSM Standard (padrão, vetorial leve)
const tileOSM = L.tileLayer(
  "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
  {
    maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors'
  }
);

// Satélite Google (gratuito via tile público, sem API key, cobertura muito melhor que ESRI)
// Usa 4 subdomínios em paralelo (mt0-mt3) pra acelerar carregamento
const tileSatelite = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=s&hl=pt-BR&x={x}&y={y}&z={z}",
  {
    maxZoom: 20,
    subdomains: ["0", "1", "2", "3"],
    attribution: "&copy; Google"
  }
);

// Híbrido Google (satélite + ruas + nomes em pt-BR)
const tileHibrido = L.tileLayer(
  "https://mt{s}.google.com/vt/lyrs=y&hl=pt-BR&x={x}&y={y}&z={z}",
  {
    maxZoom: 20,
    subdomains: ["0", "1", "2", "3"],
    attribution: "&copy; Google"
  }
);

// Mantém variável (não usada agora, mas evita break em referências antigas)
const tileSateliteLabels = null;

// MapTiler 3D (opcional, requer window.MAPTILER_KEY)
let tileMapTiler3D = null;
if (window.MAPTILER_KEY) {
  tileMapTiler3D = L.tileLayer(
    `https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${window.MAPTILER_KEY}`,
    {
      maxZoom: 22,
      attribution: '&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }
  );
}

let camadaAtualMapa = "osm";
tileOSM.addTo(map);
map.doubleClickZoom.disable();

function trocarCamadaMapa(novaCamada) {
  // Remove todas as camadas base
  [tileOSM, tileSatelite, tileHibrido].forEach((t) => {
    if (t && map.hasLayer(t)) map.removeLayer(t);
  });
  if (tileMapTiler3D && map.hasLayer(tileMapTiler3D)) map.removeLayer(tileMapTiler3D);

  // Adiciona a escolhida
  if (novaCamada === "osm") tileOSM.addTo(map);
  else if (novaCamada === "satelite") tileSatelite.addTo(map);
  else if (novaCamada === "hibrido") tileHibrido.addTo(map);
  else if (novaCamada === "3d" && tileMapTiler3D) tileMapTiler3D.addTo(map);

  camadaAtualMapa = novaCamada;

  // Atualiza botões
  document.querySelectorAll(".mapa-camada-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.camada === novaCamada);
  });
}

// Control customizado de troca de camadas + Street View
const MapaCamadasControl = L.Control.extend({
  options: { position: "topright" },
  onAdd: function () {
    const div = L.DomUtil.create("div", "mapa-camadas-control");
    const has3D = !!tileMapTiler3D;

    div.innerHTML = `
      <button type="button" class="mapa-camada-btn is-active" data-camada="osm" title="Mapa">2D</button>
      <button type="button" class="mapa-camada-btn" data-camada="satelite" title="Satélite">Sat</button>
      <button type="button" class="mapa-camada-btn" data-camada="hibrido" title="Híbrido (satélite + ruas)">Hib</button>
      ${has3D ? '<button type="button" class="mapa-camada-btn" data-camada="3d" title="3D">3D</button>' : ''}
      <button type="button" class="mapa-camada-btn mapa-camada-sv" data-acao="streetview" title="Abrir Street View no centro do mapa">SV</button>
    `;

    L.DomEvent.disableClickPropagation(div);

    div.querySelectorAll("[data-camada]").forEach((b) => {
      b.addEventListener("click", () => trocarCamadaMapa(b.dataset.camada));
    });

    div.querySelector("[data-acao='streetview']")?.addEventListener("click", abrirStreetViewCentro);

    return div;
  }
});

map.addControl(new MapaCamadasControl());

function abrirStreetViewCentro() {
  const c = map.getCenter();
  const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${c.lat},${c.lng}`;
  window.open(url, "_blank");
}

function abrirStreetViewCoord(lat, lng) {
  const url = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
  window.open(url, "_blank");
}

// ================== ESTADO ==================

let routingControl = null;
let clienteMarkers = {};
let todosMarkersRota = [];
let ultimaRotaWaypoints = null;

let cacheClientes = null;
let cachePedidosPendentes = null;
let cacheCarteira = null;
let cacheVendedores = null;
let cachePedidosItens = new Map();

let clientesFiltradosAtuais = null;
let paginaClientes = 0;
const TAMANHO_PAGINA = 30;
let carregandoMais = false;

let ultimaAnaliseRota = null;
let dragListaConfigurado = false;

let idsSelecionados = new Set();
let origemAtual = "pedidos";

let filtroVendedorAtivo = null;

const ORIGEM_FIXA = { lat: -19.383869647653956, lng: -40.067551247607746 };

let marcadorLocalizacao = null;
let origemManual = { ...ORIGEM_FIXA };

let pontosManuais = [];
let manualIdSeq = 1;

let filtroBuscaDebounce = null;

const myLocationIcon = L.divIcon({
  className: "",
  html: `<div class="pin-minha-localizacao"></div>`,
  iconSize: [26, 34],
  iconAnchor: [13, 26]
});

// ================== DOM ==================

const listaClientesDiv = document.getElementById("listaClientes");
const contadorClientesSpan = document.getElementById("contadorClientes");
const contadorSelecionadosSpan = document.getElementById("contadorSelecionados");
const resumoSelecionadosDiv = document.getElementById("resumoSelecionados");
const alertasRota = document.getElementById("alertasRota");
const alertasRotaSidebar = document.getElementById("alertasRotaSidebar");
const filtroNomeInput = document.getElementById("filtroNome");
const btnGerarLinkMapsSidebar = document.getElementById("btnGerarLinkMapsSidebar");
const chkEvitarPedagios = document.getElementById("chkEvitarPedagios");
const chkEvitarPontes = document.getElementById("chkEvitarPontes");
const linkMapsDiv = document.getElementById("linkMaps");

const tipoOrigemSelect = document.getElementById("tipoOrigem");
const grupoVendedoresDiv = document.getElementById("grupoVendedores");
const grupoChipsVendedor = document.getElementById("grupoChipsVendedor");
const selectVendedor = document.getElementById("selectVendedor");

let chkVerTransito = document.getElementById("chkVerTransito");
if (!chkVerTransito) chkVerTransito = chkEvitarPontes;

const novoPontoInput = document.getElementById("novoPontoInput");
const btnAdicionarPonto = document.getElementById("btnAdicionarPonto");
const rotaPanel = document.getElementById("rota-panel");
const rotaPanelMinimize = document.getElementById("rotaPanelMinimize");
const destinoCampoPainel = document.getElementById("destinoCampoPainel");
const btnGerarRota = document.getElementById("btnGerarRota");
const btnGerarLinkMaps = document.getElementById("btnGerarLinkMaps");
const btnSelecionarTodos = document.getElementById("btnSelecionarTodos");
const btnLimparSelecao = document.getElementById("btnLimparSelecao");
const btnOtimizarRota = document.getElementById("btnOtimizarRota");

const btnRealizarCarregamento = document.getElementById("btnRealizarCarregamento");
const btnMontarCarga3D = document.getElementById("btnMontarCarga3D");
const campoResumoCarga = document.getElementById("resumoCargaSelecionada");
const selectCaminhaoCarga = document.getElementById("selectCaminhaoCarga");

function getRotaListaDiv() { return document.getElementById("rotaListaPontos"); }

// ================== HELPERS ==================

function getDestinoCampo() { return destinoCampoPainel.value.trim(); }

function setAlertasTexto(texto) {
  alertasRota.textContent = texto;
  alertasRotaSidebar.textContent = texto;
}

function setLinkMapsEnabled(enabled) {
  btnGerarLinkMaps.disabled = !enabled;
  btnGerarLinkMapsSidebar.disabled = !enabled;
}

function removerTodosMarkersDoMapa() {
  todosMarkersRota.forEach((m) => { if (map.hasLayer(m)) map.removeLayer(m); });
  todosMarkersRota = [];
  Object.values(clienteMarkers).forEach((m) => { if (map.hasLayer(m)) map.removeLayer(m); });
  clienteMarkers = {};
}

function montarEnderecoPadrao(item) {
  const partes = [];
  if (item.logradouro) {
    let log = item.logradouro;
    if (item.numero) log += ", " + item.numero;
    partes.push(log);
  }
  const linha2 = [];
  if (item.bairro) linha2.push(item.bairro);
  if (item.cidade) linha2.push(item.cidade);
  if (item.uf) linha2.push(item.uf);
  if (linha2.length) partes.push(linha2.join(" - "));
  if (item.cep) partes.push("CEP " + item.cep);
  return partes.join(" | ");
}

function getNomeVendedorPorCodigo(codvend) {
  if (codvend == null || codvend === "") return "";
  const cod = String(codvend);
  const lista = cacheVendedores || [];
  const vendedor = lista.find((v) => String(v.codvend) === cod);
  if (!vendedor) return "";
  return (
    vendedor.nome_vendedor || vendedor.nomevendedor ||
    vendedor.nome || vendedor.descricao || ""
  );
}

function getNomeExibicaoVendedor(pedido) {
  // Tenta todas as variações que vêm da API (NOME_VENDEDOR é o formato do backend SQL)
  const nomeDireto =
    pedido?.NOME_VENDEDOR || pedido?.nomevendedor || pedido?.nome_vendedor ||
    pedido?.NOMEVENDEDOR || pedido?.nomeVendedor || "";
  if (String(nomeDireto).trim()) return String(nomeDireto).trim();
  const nomeCache = getNomeVendedorPorCodigo(pedido?.codvend ?? pedido?.CODVEND);
  if (String(nomeCache).trim()) return String(nomeCache).trim();
  // Se nada achou, retorna vazio (NÃO o código — assim chip mostra "Sem nome" em vez do número)
  return "";
}

function getChaveSelecao(item) {
  if (!item) return "";
  if (item.chaveSelecao != null && String(item.chaveSelecao).trim() !== "") {
    return String(item.chaveSelecao);
  }
  if (item.origemTipo === "pedido") return `pedido:${String(item.nunota ?? item.id ?? "")}`;
  if (item.origemTipo === "clientes") return `clientes:${String(item.codparc ?? item.codigo ?? item.id ?? "")}`;
  if (item.origemTipo === "carteira") return `carteira:${String(item.codparc ?? item.codigo ?? item.id ?? "")}`;
  return String(item.id ?? "");
}

function criarMarkerNumerado(lat, lng, numero, titulo, pontoRef) {
  const html = `<div class="marker-numero"><div class="marker-numero-label">${numero}</div></div>`;
  const icon = L.divIcon({
    className: "marker-numero-wrapper",
    html,
    iconSize: [26, 26],
    iconAnchor: [13, 26]
  });
  const marker = L.marker([lat, lng], { icon, draggable: true }).bindPopup(titulo);
  marker.on("dragend", (e) => {
    const { lat: newLat, lng: newLng } = e.target.getLatLng();
    if (pontoRef.tipo === "cliente") {
      const base = getCacheAtual();
      const c = base.find((x) => getChaveSelecao(x) === pontoRef.id);
      if (c) { c.lat = newLat; c.lng = newLng; }
    } else if (pontoRef.tipo === "manual") {
      const p = pontosManuais.find((x) => x.id === pontoRef.id);
      if (p) { p.lat = newLat; p.lng = newLng; }
    }
    gerarRotaAuto();
  });
  return marker;
}

// Agrupa pontos por coordenada (com tolerância) e cria 1 marker por grupo
// Cada grupo terá um marker que mostra:
// - número da parada (se 1 ponto)
// - badge com contagem + animação pulse (se >1 pontos no mesmo lugar)
function criarMarkersAgrupadosPorCoord(pontosPainel) {
  // Tolerância pra considerar "mesma coordenada" (~11m)
  const TOL = 0.0001;

  // Agrupa pontos por chave aproximada (lat, lng arredondados)
  const grupos = new Map();
  pontosPainel.forEach((p, idx) => {
    const chaveLat = Math.round(p.lat / TOL) * TOL;
    const chaveLng = Math.round(p.lng / TOL) * TOL;
    const chave = `${chaveLat.toFixed(4)},${chaveLng.toFixed(4)}`;
    if (!grupos.has(chave)) {
      grupos.set(chave, { lat: p.lat, lng: p.lng, pontos: [] });
    }
    grupos.get(chave).pontos.push({ ...p, idxOriginal: idx });
  });

  const markers = [];

  grupos.forEach((grupo) => {
    const qtd = grupo.pontos.length;
    const primeiro = grupo.pontos[0];
    const numeros = grupo.pontos.map((p) => p.idxOriginal + 1);

    // Detecta status mais relevante dos pedidos do grupo
    let statusGrupo = null;
    let statusBadgeHtml = "";
    if (typeof statusPedidosPorNunota !== "undefined") {
      grupo.pontos.forEach((p) => {
        if (p.tipo !== "cliente") return;
        const idStr = String(p.id);
        if (!idStr.startsWith("pedido:")) return;
        const nun = idStr.replace("pedido:", "");
        const st = statusPedidosPorNunota[nun];
        if (st && st !== "pendente") {
          // Prioridade: cancelado > faturado > removido
          if (!statusGrupo || st === "cancelado") statusGrupo = st;
        }
      });
    }
    if (statusGrupo) {
      const symbol = statusGrupo === "faturado" ? "✓" :
                     statusGrupo === "cancelado" ? "✕" : "!";
      statusBadgeHtml = `<div class="marker-status-corner status-${statusGrupo}">${symbol}</div>`;
    }

    let html;
    let className;

    if (qtd === 1) {
      // Marker normal verde com número (ou colorido por status)
      const extraClass = statusGrupo ? `marker-numero-status status-${statusGrupo}` : "";
      html = `<div class="marker-numero ${extraClass}"><div class="marker-numero-label">${primeiro.idxOriginal + 1}</div>${statusBadgeHtml}</div>`;
      className = "marker-numero-wrapper";
    } else {
      // Marker em alerta: laranja piscando + badge com contagem
      const listaNums = numeros.join(",");
      const extraClass = statusGrupo ? `marker-numero-status status-${statusGrupo}` : "";
      html = `
        <div class="marker-numero marker-numero-grupo ${extraClass}" data-count="${qtd}">
          <div class="marker-numero-label">${listaNums}</div>
          <div class="marker-grupo-badge">${qtd}</div>
          ${statusBadgeHtml}
        </div>
      `;
      className = "marker-numero-wrapper";
    }

    const icon = L.divIcon({
      className,
      html,
      iconSize: qtd > 1 ? [34, 34] : [26, 26],
      iconAnchor: qtd > 1 ? [17, 30] : [13, 26]
    });

    // Conteúdo do popup
    let popupHtml;
    if (qtd === 1) {
      popupHtml = montarPopupPonto(primeiro);
    } else {
      popupHtml = montarPopupGrupo(grupo.pontos);
    }

    const marker = L.marker([grupo.lat, grupo.lng], {
      icon,
      draggable: qtd === 1 // só permite arrastar se não for grupo
    });

    marker.bindPopup(popupHtml, { maxWidth: 320, className: "popup-rota" });

    // Após abrir popup, conecta os botões "ver itens" e "street view"
    marker.on("popupopen", (e) => {
      const node = e.popup.getElement();
      if (!node) return;
      node.querySelectorAll("[data-acao='ver-itens']").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          const nunota = btn.getAttribute("data-nunota");
          abrirModalItensPedido(nunota);
        });
      });
      node.querySelectorAll("[data-acao='street-view']").forEach((btn) => {
        btn.addEventListener("click", (ev) => {
          ev.preventDefault();
          const lat = parseFloat(btn.getAttribute("data-lat"));
          const lng = parseFloat(btn.getAttribute("data-lng"));
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            abrirStreetViewCoord(lat, lng);
          }
        });
      });
    });

    if (qtd === 1) {
      marker.on("dragend", (ev) => {
        const { lat: newLat, lng: newLng } = ev.target.getLatLng();
        if (primeiro.tipo === "cliente") {
          const base = getCacheAtual();
          const c = base.find((x) => getChaveSelecao(x) === primeiro.id);
          if (c) { c.lat = newLat; c.lng = newLng; }
        } else if (primeiro.tipo === "manual") {
          const p = pontosManuais.find((x) => x.id === primeiro.id);
          if (p) { p.lat = newLat; p.lng = newLng; }
        }
        gerarRotaAuto();
      });
    }

    markers.push(marker);
  });

  return markers;
}

function montarPopupPonto(ponto) {
  const isCliente = ponto.tipo === "cliente";
  const isPedido = isCliente && String(ponto.id).startsWith("pedido:");
  const nunota = isPedido ? String(ponto.id).replace("pedido:", "") : null;

  let html = `
    <div class="popup-rota-content">
      <div class="popup-rota-num">Parada ${ponto.idxOriginal + 1}</div>
      <div class="popup-rota-titulo">${escapeHtml(ponto.label)}</div>
      <div class="popup-rota-endereco">${escapeHtml(ponto.endereco || "—")}</div>
      <div class="popup-rota-acoes">
  `;

  if (nunota) {
    html += `
        <button type="button" class="popup-rota-btn" data-acao="ver-itens" data-nunota="${escapeHtml(nunota)}">
          Ver itens
        </button>
    `;
  }

  html += `
        <button type="button" class="popup-rota-btn popup-rota-btn-ghost" data-acao="street-view" data-lat="${ponto.lat}" data-lng="${ponto.lng}">
          Street View
        </button>
      </div>
    </div>
  `;
  return html;
}

function montarPopupGrupo(pontos) {
  const qtd = pontos.length;
  const primeiroLat = pontos[0].lat;
  const primeiroLng = pontos[0].lng;

  let html = `
    <div class="popup-rota-content">
      <div class="popup-rota-alerta">
        <span class="popup-rota-alerta-icon">⚠</span>
        <span>${qtd} paradas na mesma coordenada</span>
      </div>
      <div class="popup-rota-acoes" style="margin-bottom: 6px;">
        <button type="button" class="popup-rota-btn popup-rota-btn-ghost popup-rota-btn-sm" data-acao="street-view" data-lat="${primeiroLat}" data-lng="${primeiroLng}">
          Ver no Street View
        </button>
      </div>
      <div class="popup-rota-lista">
  `;

  pontos.forEach((p) => {
    const isPedido = p.tipo === "cliente" && String(p.id).startsWith("pedido:");
    const nunota = isPedido ? String(p.id).replace("pedido:", "") : null;

    html += `
      <div class="popup-rota-item">
        <div class="popup-rota-item-num">${p.idxOriginal + 1}</div>
        <div class="popup-rota-item-body">
          <div class="popup-rota-item-titulo">${escapeHtml(p.label)}</div>
          <div class="popup-rota-item-end">${escapeHtml(p.endereco || "—")}</div>
        </div>
    `;

    if (nunota) {
      html += `
        <button type="button" class="popup-rota-btn popup-rota-btn-sm" data-acao="ver-itens" data-nunota="${escapeHtml(nunota)}">
          Itens
        </button>
      `;
    }

    html += `</div>`;
  });

  html += `</div></div>`;
  return html;
}

function normalizarLat(valor) {
  if (valor == null) return null;
  if (typeof valor === "number") {
    return Number.isFinite(valor) && valor >= -90 && valor <= 90 ? valor : null;
  }
  const s = String(valor).trim();
  if (!s) return null;
  if (s.includes("e") || s.includes("E")) return null;
  const n = parseFloat(s.replace(",", "."));
  if (!Number.isFinite(n) || n < -90 || n > 90) return null;
  return n;
}

function normalizarLng(valor) {
  if (valor == null) return null;
  if (typeof valor === "number") {
    return Number.isFinite(valor) && valor >= -180 && valor <= 180 ? valor : null;
  }
  const s = String(valor).trim();
  if (!s) return null;
  if (s.includes("e") || s.includes("E")) return null;
  const n = parseFloat(s.replace(",", "."));
  if (!Number.isFinite(n) || n < -180 || n > 180) return null;
  return n;
}

function parseLatLngText(txt) {
  if (!txt) return null;
  const parts = txt.split(",");
  if (parts.length !== 2) return null;
  const lat = parts[0].trim();
  const lng = parts[1].trim();
  if (!lat || !lng) return null;
  return { lat, lng };
}

async function geocodeTexto(texto) {
  const path = `/geocode?q=${encodeURIComponent(texto)}`;
  showRotasLoader();
  try {
    const resp = await apiFetch(path);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data && data.lat != null && data.lng != null) {
      return { lat: data.lat, lng: data.lng, label: texto };
    }
    return null;
  } catch (e) {
    return null;
  } finally {
    hideRotasLoader();
  }
}

// ================== CHIPS VENDEDOR (com contagem) ==================

function extrairVendedoresDoPedidos(pedidos) {
  const mapa = new Map();
  pedidos.forEach((p) => {
    const codvend = p.codvend ?? p.CODVEND;
    if (codvend == null || codvend === "") return;
    const cod = String(codvend);
    if (!mapa.has(cod)) {
      // tenta: nome direto no pedido (várias variações de case) > cache > "Sem nome"
      let nome =
        String(
          p.NOME_VENDEDOR || p.nomevendedor || p.nome_vendedor ||
          p.NOMEVENDEDOR || p.nomeVendedor || ""
        ).trim() ||
        String(getNomeVendedorPorCodigo(cod) || "").trim();
      if (!nome) nome = "Sem nome";
      mapa.set(cod, { nome, count: 0 });
    }
    mapa.get(cod).count++;
  });
  return Array.from(mapa.entries())
    .map(([codvend, info]) => ({ codvend, nome: info.nome, count: info.count }))
    .sort((a, b) => b.count - a.count || a.nome.localeCompare(b.nome));
}

function renderizarChipsVendedor(vendedores) {
  const container = document.getElementById("filtroVendedorChips");
  if (!container) return;
  container.innerHTML = "";

  if (!vendedores || vendedores.length === 0) {
    if (grupoChipsVendedor) grupoChipsVendedor.style.display = "none";
    return;
  }
  if (grupoChipsVendedor) grupoChipsVendedor.style.display = "";

  const totalPedidos = vendedores.reduce((s, v) => s + v.count, 0);

  const chipTodos = document.createElement("button");
  chipTodos.type = "button";
  chipTodos.className = "chip-vendedor" + (filtroVendedorAtivo === null ? " chip-vendedor-ativo" : "");
  chipTodos.innerHTML = `<span>Todos</span><span class="chip-vendedor-count">${totalPedidos}</span>`;
  chipTodos.addEventListener("click", () => {
    filtroVendedorAtivo = null;
    aplicarFiltroVendedorLocal();
    atualizarChipsVendedorAtivo();
  });
  container.appendChild(chipTodos);

  vendedores.forEach((v) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip-vendedor" + (filtroVendedorAtivo === v.codvend ? " chip-vendedor-ativo" : "");
    chip.innerHTML = `<span>${escapeHtml(v.nome)}</span><span class="chip-vendedor-count">${v.count}</span>`;
    chip.dataset.codvend = v.codvend;
    chip.addEventListener("click", () => {
      filtroVendedorAtivo = filtroVendedorAtivo === v.codvend ? null : v.codvend;
      aplicarFiltroVendedorLocal();
      atualizarChipsVendedorAtivo();
    });
    container.appendChild(chip);
  });
}

function atualizarChipsVendedorAtivo() {
  const container = document.getElementById("filtroVendedorChips");
  if (!container) return;
  container.querySelectorAll(".chip-vendedor").forEach((chip) => {
    const cod = chip.dataset.codvend || null;
    chip.classList.toggle("chip-vendedor-ativo", filtroVendedorAtivo === cod);
  });
}

function aplicarFiltroVendedorLocal() {
  listaClientesDiv.scrollTop = 0;
  const base = cachePedidosPendentes || [];

  let resultado = filtroVendedorAtivo
    ? base.filter((p) => String(p.codvend) === String(filtroVendedorAtivo))
    : base;

  const filtroNome = filtroNomeInput.value.trim().toLowerCase();
  if (filtroNome) {
    resultado = resultado.filter((c) => {
      const cod = String(c.codigo || "").toLowerCase();
      const nome = String(c.nome || "").toLowerCase();
      const end = String(c.endereco || "").toLowerCase();
      return cod.includes(filtroNome) || nome.includes(filtroNome) || end.includes(filtroNome);
    });
  }

  renderClientes(resultado);
}

// ================== LISTA / SELEÇÃO ==================

function atualizarResumoSelecionados() {
  const qtde = idsSelecionados.size;
  if (qtde === 0) {
    resumoSelecionadosDiv.textContent = "Nenhum cliente selecionado.";
  } else if (qtde === 1) {
    resumoSelecionadosDiv.textContent = "1 cliente selecionado.";
  } else {
    resumoSelecionadosDiv.textContent = qtde + " clientes selecionados.";
  }
}

function atualizarContadorSelecionados() {
  const qtde = idsSelecionados.size;
  contadorSelecionadosSpan.textContent = qtde + " selecionados";
  atualizarResumoSelecionados();

  if (qtde === 0 && pontosManuais.length === 0) {
    limparRota();
    const lista = getRotaListaDiv();
    if (lista) lista.innerHTML = "";
    return;
  }
  reconstruirPainelRota();
  gerarRotaAuto();
}

function marcarTodosVisiveis(marcar) {
  const itens = Array.from(
    listaClientesDiv.querySelectorAll(".cliente-item .cliente-checkbox")
  );
  const limite = 50;
  let count = 0;

  itens.forEach((cb) => {
    const id = String(cb.value);
    const wrapper = cb.closest(".cliente-item");
    const semLoc = wrapper?.classList.contains("cliente-sem-localizacao");
    if (semLoc) {
      cb.checked = false;
      idsSelecionados.delete(id);
      return;
    }
    if (marcar) {
      if (count >= limite) return;
      cb.checked = true;
      idsSelecionados.add(id);
      if (wrapper) wrapper.classList.add("selecionado");
      count++;
    } else {
      cb.checked = false;
      idsSelecionados.delete(id);
      if (wrapper) wrapper.classList.remove("selecionado");
    }
  });

  atualizarContadorSelecionados();
}

function criarItemCliente(c) {
  const div = document.createElement("div");
  div.className = "cliente-item";
  div.draggable = false;
  div.dataset.id = getChaveSelecao(c);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "cliente-checkbox";
  checkbox.value = getChaveSelecao(c);

  const textos = document.createElement("div");
  textos.className = "cliente-textos";

  const spanNome = document.createElement("span");
  spanNome.className = "nome";
  const nomePrincipal =
    c.origemTipo === "pedido" ? `${c.nunota} · ${c.nome}` : `${c.codigo} · ${c.nome}`;
  spanNome.textContent = nomePrincipal;

  const spanBadge = document.createElement("span");
  spanBadge.className = "badge";
  spanBadge.textContent = c.endereco || "—";

  const spanAlerta = document.createElement("span");
  spanAlerta.className = "badge alerta";
  spanAlerta.style.display = "none";
  spanAlerta.textContent = "endereço não localizado";

  const latValida = normalizarLat(c.lat) != null;
  const lngValida = normalizarLng(c.lng) != null;
  const semLocalizacao = !latValida || !lngValida;

  if (semLocalizacao) {
    spanAlerta.style.display = "inline-block";
    div.classList.add("cliente-sem-localizacao");
    checkbox.disabled = true;
    checkbox.classList.add("checkbox-desabilitado");
  }

  function handleToggleSelecao(novoEstado) {
    if (semLocalizacao) {
      checkbox.checked = false;
      return;
    }
    const chave = getChaveSelecao(c);
    checkbox.checked = novoEstado;
    if (novoEstado) idsSelecionados.add(chave);
    else idsSelecionados.delete(chave);
    div.classList.toggle("selecionado", novoEstado);
    atualizarContadorSelecionados();
  }

  checkbox.addEventListener("change", (e) => {
    e.stopPropagation();
    handleToggleSelecao(checkbox.checked);
  });

  checkbox.addEventListener("click", (e) => e.stopPropagation());

  div.addEventListener("click", (e) => {
    if (e.target === checkbox) return;
    if (e.target.closest("[data-acao='ver-itens']")) return; // não togglar quando clica em "Itens"
    if (semLocalizacao) return;
    handleToggleSelecao(!checkbox.checked);
  });

  textos.appendChild(spanNome);
  textos.appendChild(spanBadge);
  textos.appendChild(spanAlerta);
  div.appendChild(checkbox);
  div.appendChild(textos);

  // Botão "Itens" inline (só pra pedidos)
  if (c.origemTipo === "pedido" && c.nunota) {
    const btnItens = document.createElement("button");
    btnItens.type = "button";
    btnItens.className = "cliente-btn-itens";
    btnItens.setAttribute("data-acao", "ver-itens");
    btnItens.setAttribute("data-nunota", String(c.nunota));
    btnItens.textContent = "Itens";
    btnItens.title = "Ver itens do pedido";
    btnItens.addEventListener("click", (e) => {
      e.stopPropagation();
      abrirModalItensPedido(String(c.nunota));
    });
    div.appendChild(btnItens);
  }

  return div;
}

function limparListaClientesVisual() {
  listaClientesDiv.innerHTML = "";
  contadorSelecionadosSpan.textContent = idsSelecionados.size + " selecionados";
  atualizarResumoSelecionados();
}

function renderClientesPagina() {
  if (!clientesFiltradosAtuais || clientesFiltradosAtuais.length === 0) {
    limparListaClientesVisual();
    contadorClientesSpan.textContent = "0 clientes";
    listaClientesDiv.innerHTML =
      '<div style="text-align:center;padding:18px;font-family:\'JetBrains Mono\',monospace;font-size:11px;color:var(--text-3);letter-spacing:0.06em;">Nenhum cliente encontrado</div>';
    return;
  }

  const inicio = paginaClientes * TAMANHO_PAGINA;
  if (inicio >= clientesFiltradosAtuais.length) return;

  const fim = Math.min(inicio + TAMANHO_PAGINA, clientesFiltradosAtuais.length);
  const frag = document.createDocumentFragment();

  for (let i = inicio; i < fim; i++) {
    const c = clientesFiltradosAtuais[i];
    const div = criarItemCliente(c);
    if (idsSelecionados.has(getChaveSelecao(c))) {
      const cb = div.querySelector(".cliente-checkbox");
      if (cb && !cb.disabled) {
        cb.checked = true;
        if (!div.classList.contains("cliente-sem-localizacao")) {
          div.classList.add("selecionado");
        }
      }
    }
    frag.appendChild(div);
  }

  listaClientesDiv.appendChild(frag);
  paginaClientes += 1;

  contadorClientesSpan.textContent = clientesFiltradosAtuais.length + " clientes";

  // Aplica visual de status se rota salva está aberta
  if (typeof aplicarStatusNasLinhasClientes === "function" &&
      typeof statusPedidosPorNunota !== "undefined" &&
      Object.keys(statusPedidosPorNunota).length) {
    aplicarStatusNasLinhasClientes();
  }
}

function renderClientes(clientes) {
  clientesFiltradosAtuais = clientes;
  paginaClientes = 0;
  limparListaClientesVisual();
  renderClientesPagina();
}

function configurarInfiniteScrollClientes() {
  listaClientesDiv.addEventListener("scroll", () => {
    if (carregandoMais) return;
    const scrollBottom = listaClientesDiv.scrollTop + listaClientesDiv.clientHeight;
    const limite = listaClientesDiv.scrollHeight - 40;
    if (scrollBottom >= limite) {
      const inicio = paginaClientes * TAMANHO_PAGINA;
      if (!clientesFiltradosAtuais || inicio >= clientesFiltradosAtuais.length) return;
      carregandoMais = true;
      setTimeout(() => {
        renderClientesPagina();
        carregandoMais = false;
      }, 0);
    }
  });
}

// ================== ORIGENS / APIS ==================

function getCacheAtual() {
  if (origemAtual === "pedidos") return cachePedidosPendentes || [];
  if (origemAtual === "clientes") return cacheClientes || [];
  if (origemAtual === "carteira") return cacheCarteira || [];
  return [];
}

async function carregarPedidosPendentesItens(filtros = {}) {
  const params = [];
  if (filtros.nunota) params.push(`nunota=${encodeURIComponent(filtros.nunota)}`);
  if (filtros.codemp) params.push(`codemp=${encodeURIComponent(filtros.codemp)}`);
  if (filtros.codparc) params.push(`codparc=${encodeURIComponent(filtros.codparc)}`);
  if (filtros.codvend) params.push(`codvend=${encodeURIComponent(filtros.codvend)}`);

  const qs = params.length ? `?${params.join("&")}` : "";
  const path = `/pedidos-pendentes-itens${qs}`;

  try {
    const resp = await apiFetch(path);
    if (!resp.ok) return;
    const data = await resp.json();
    const pedidos = data.pedidos || [];
    cachePedidosItens.clear();
    pedidos.forEach((p) => {
      const nunota = p.nunota;
      if (!nunota || !Array.isArray(p.itens)) return;
      let pesoTotalKg = 0;
      let volumeTotalM3 = 0;
      const itensEnriquecidos = p.itens.map((it) => {
        const pesoBruto = Number(it.pesobruto) || 0;
        const qtd = Number(it.qtdneg) || 1;
        const m3Unit = Number(it.m3_calc) || Number(it.m3_erp) || 0;
        pesoTotalKg += pesoBruto * qtd;
        volumeTotalM3 += m3Unit * qtd;
        return { ...it, pesoUnitKg: pesoBruto, volumeUnitM3: m3Unit };
      });
      cachePedidosItens.set(String(nunota), {
        pesoTotalKg, volumeTotalM3, itens: itensEnriquecidos
      });
    });
  } catch (e) {
    console.error("[ROTAS] Erro pedidos-pendentes-itens:", e);
  }
}

async function carregarPedidosPendentes(codvendFiltro) {
  showRotasLoader();
  try {
    listaClientesDiv.innerHTML = "";

    let path = "/pedidos-pendentes";
    if (codvendFiltro) {
      const sep = path.includes("?") ? "&" : "?";
      path += `${sep}codvend=${encodeURIComponent(codvendFiltro)}`;
    }

    // Paraleliza as 2 chamadas
    const [respPedidos] = await Promise.all([
      apiFetch(path),
      carregarPedidosPendentesItens(codvendFiltro ? { codvend: codvendFiltro } : {})
    ]);

    if (!respPedidos.ok) {
      cachePedidosPendentes = [];
      mostrarToast("Erro ao carregar pedidos pendentes.", true);
      return;
    }

    const data = await respPedidos.json();
    const pedidosApi = data.pedidos || [];

    cachePedidosPendentes = pedidosApi.map((p) => {
      const endereco = montarEnderecoPadrao(p);
      const chave = String(p.NUNOTA);
      const agregados = cachePedidosItens.get(chave) || {
        pesoTotalKg: 0, volumeTotalM3: 0, itens: []
      };
      return {
        id: p.NUNOTA,
        chaveSelecao: `pedido:${String(p.NUNOTA)}`,
        codigo: p.NUNOTA,
        nome: p.NOME_CLIENTE,
        endereco,
        origemTipo: "pedido",
        nunota: p.NUNOTA,
        numnota: p.NUMNOTA,
        codparc: p.CODPARC,
        codvend: p.CODVEND,
        nomevendedor: getNomeExibicaoVendedor(p),
        nome_vendedor: getNomeExibicaoVendedor(p),
        codemp: p.CODEMP,
        logradouro: p.logradouro,
        numero: p.numero,
        bairro: p.bairro,
        cidade: p.cidade,
        uf: p.uf,
        cep: p.cep,
        lat: normalizarLat(p.lat),
        lng: normalizarLng(p.lng),
        pesoTotalKg: agregados.pesoTotalKg,
        volumeTotalM3: agregados.volumeTotalM3,
        itens: agregados.itens
      };
    });

    filtroVendedorAtivo = null;
    const vendedoresComPedidos = extrairVendedoresDoPedidos(cachePedidosPendentes);
    renderizarChipsVendedor(vendedoresComPedidos);

    idsSelecionados.clear();
    pontosManuais = [];
    limparRota();
    renderClientes(cachePedidosPendentes);
  } catch (e) {
    console.error("[ROTAS] Exception pedidos pendentes:", e);
    cachePedidosPendentes = [];
    mostrarToast("Erro ao carregar pedidos pendentes.", true);
  } finally {
    hideRotasLoader();
  }
}

async function carregarClientesNormais() {
  showRotasLoader();
  try {
    listaClientesDiv.innerHTML = "";
    if (grupoChipsVendedor) grupoChipsVendedor.style.display = "none";

    const resp = await apiFetch("/logistica/clientes");
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    cacheClientes = (data.clientes || []).map((r) => {
      const endereco = montarEnderecoPadrao(r);
      return {
        id: r.id,
        chaveSelecao: `clientes:${String(r.codparc ?? r.codigo ?? r.id)}`,
        codigo: r.codigo ?? r.codparc ?? r.id,
        nome: r.nomecliente || r.nome || r.nome_cliente,
        endereco,
        origemTipo: "clientes",
        codparc: r.codparc,
        codvend: r.codvend,
        nomevendedor: r.nomevendedor || r.nome_vendedor,
        nome_vendedor: r.nome_vendedor || r.nomevendedor,
        codemp: r.codemp,
        logradouro: r.logradouro,
        numero: r.numero,
        bairro: r.bairro,
        cidade: r.cidade,
        uf: r.uf,
        cep: r.cep,
        lat: normalizarLat(r.lat),
        lng: normalizarLng(r.lng)
      };
    });

    idsSelecionados.clear();
    pontosManuais = [];
    limparRota();
    renderClientes(cacheClientes);
  } catch (e) {
    console.error("[ROTAS] Erro clientes:", e);
    cacheClientes = [];
    mostrarToast("Erro ao carregar clientes.", true);
  } finally {
    hideRotasLoader();
  }
}

async function carregarVendedores() {
  showRotasLoader();
  try {
    const resp = await apiFetch("/vendedores");
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    cacheVendedores = data.vendedores || [];

    selectVendedor.innerHTML = '<option value="">Selecione um vendedor...</option>';
    cacheVendedores.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v.codvend;
      opt.textContent = `${v.codvend} - ${v.nome_vendedor || v.nomevendedor || ""}`;
      selectVendedor.appendChild(opt);
    });

    // Se já carregou pedidos antes dos vendedores, re-renderiza chips com nomes corretos
    if (cachePedidosPendentes && cachePedidosPendentes.length && origemAtual === "pedidos") {
      const vendedoresComPedidos = extrairVendedoresDoPedidos(cachePedidosPendentes);
      renderizarChipsVendedor(vendedoresComPedidos);
    }
  } catch (e) {
    console.error("[ROTAS] Erro vendedores:", e);
    cacheVendedores = [];
  } finally {
    hideRotasLoader();
  }
}

async function carregarCarteiraPorVendedor(codvend) {
  if (!codvend) {
    cacheCarteira = [];
    renderClientes([]);
    return;
  }

  showRotasLoader();
  try {
    listaClientesDiv.innerHTML = "";
    if (grupoChipsVendedor) grupoChipsVendedor.style.display = "none";

    const resp = await apiFetch(`/carteira?codvend=${encodeURIComponent(codvend)}`);
    if (!resp.ok) throw new Error("HTTP " + resp.status);

    const data = await resp.json();
    cacheCarteira = (data.carteira || []).map((c) => {
      const endereco = montarEnderecoPadrao(c);
      return {
        id: c.codparc,
        chaveSelecao: `carteira:${String(c.codparc)}`,
        codigo: c.codparc,
        nome: c.nome_cliente || c.nomecliente || c.nome,
        endereco,
        origemTipo: "carteira",
        codparc: c.codparc,
        codvend: c.codvend,
        nomevendedor: c.nome_vendedor || c.nomevendedor,
        nome_vendedor: c.nome_vendedor || c.nomevendedor,
        codemp: c.codemp,
        dtlim: c.dtlim,
        limcred: c.limcred,
        logradouro: c.logradouro,
        numero: c.numero,
        bairro: c.bairro,
        cidade: c.cidade,
        uf: c.uf,
        cep: c.cep,
        lat: normalizarLat(c.lat),
        lng: normalizarLng(c.lng)
      };
    });

    idsSelecionados.clear();
    pontosManuais = [];
    limparRota();
    renderClientes(cacheCarteira);
  } catch (e) {
    console.error("[ROTAS] Erro carteira:", e);
    cacheCarteira = [];
    mostrarToast("Erro ao carregar carteira.", true);
  } finally {
    hideRotasLoader();
  }
}

function aplicarFiltroLocalClientes() {
  if (origemAtual === "pedidos") {
    aplicarFiltroVendedorLocal();
    return;
  }

  const filtro = filtroNomeInput.value.trim().toLowerCase();
  listaClientesDiv.scrollTop = 0;

  const base = getCacheAtual();
  if (!filtro) {
    renderClientes(base);
    return;
  }

  const filtrados = base.filter((c) => {
    const cod = String(c.codigo || "").toLowerCase();
    const nome = String(c.nome || "").toLowerCase();
    const end = String(c.endereco || "").toLowerCase();
    return cod.includes(filtro) || nome.includes(filtro) || end.includes(filtro);
  });
  renderClientes(filtrados);
}

// ================== PONTOS / ROTA ==================

function getClientesSelecionados() {
  const base = getCacheAtual();
  const clientes = [];
  base.forEach((c) => {
    if (idsSelecionados.has(getChaveSelecao(c))) clientes.push(c);
  });
  return clientes;
}

function montarLinhaPontoRota(ponto, idx) {
  const li = document.createElement("li");
  li.className = "rota-item";
  li.setAttribute("draggable", "true");
  li.dataset.tipo = ponto.tipo;
  li.dataset.id = ponto.id;

  const handle = document.createElement("div");
  handle.className = "rota-item-handle";
  handle.innerHTML = "⋮⋮";

  const num = document.createElement("div");
  num.className = "rota-item-num";
  num.textContent = idx + 1;

  const labelWrap = document.createElement("div");
  labelWrap.className = "rota-item-label";

  const main = document.createElement("div");
  main.className = "rota-item-label-main";
  main.textContent = ponto.tipo === "cliente" ? ponto.label : `Manual: ${ponto.label}`;

  const sub = document.createElement("div");
  sub.className = "rota-item-label-sub";
  sub.textContent = `${ponto.endereco} (${ponto.lat.toFixed(5)}, ${ponto.lng.toFixed(5)})`;

  labelWrap.appendChild(main);
  labelWrap.appendChild(sub);

  const remover = document.createElement("button");
  remover.className = "rota-item-remove";
  remover.type = "button";
  remover.innerHTML = "&times;";
  remover.title = "Remover ponto";
  remover.addEventListener("click", (e) => {
    e.stopPropagation();
    removerPontoDaRota(ponto);
  });

  li.appendChild(handle);
  li.appendChild(num);
  li.appendChild(labelWrap);
  li.appendChild(remover);

  return li;
}

function reconstruirPainelRota() {
  const rotaListaDiv = getRotaListaDiv();
  if (!rotaListaDiv) return;
  rotaListaDiv.innerHTML = "";

  const clientesSelecionados = getClientesSelecionados();
  const pontos = [];

  clientesSelecionados.forEach((c) => {
    const lat = normalizarLat(c.lat);
    const lng = normalizarLng(c.lng);
    if (lat == null || lng == null) return;
    pontos.push({
      tipo: "cliente",
      id: getChaveSelecao(c),
      label: `${c.codigo} - ${c.nome}`,
      endereco: c.endereco,
      lat, lng
    });
  });

  pontosManuais.forEach((p) => pontos.push(p));

  if (pontos.length > LIMITE_PONTOS_ROTA - 1) {
    mostrarToast(
      `Muitos pontos (${pontos.length}). Recomendado dividir em duas rotas.`,
      true
    );
  }

  pontos.forEach((ponto, idx) => {
    rotaListaDiv.appendChild(montarLinhaPontoRota(ponto, idx));
  });

  configurarDragAndDropPainelRota();
}

function configurarDragAndDropPainelRota() {
  const listaAtual = getRotaListaDiv();
  if (!listaAtual || !listaAtual.parentNode) return;

  const novaLista = listaAtual.cloneNode(false);
  while (listaAtual.firstChild) novaLista.appendChild(listaAtual.firstChild);
  listaAtual.parentNode.replaceChild(novaLista, listaAtual);

  const lista = novaLista;
  let draggingEl = null;

  lista.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".rota-item");
    if (!item) return;
    draggingEl = item;
    item.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.dataset.id);
    }
  });

  lista.addEventListener("dragover", (e) => {
    e.preventDefault();
    if (!draggingEl) return;
    const afterElement = getDragAfterElement(lista, e.clientY, ".rota-item:not(.dragging)");
    if (!afterElement) lista.appendChild(draggingEl);
    else lista.insertBefore(draggingEl, afterElement);
  });

  lista.addEventListener("drop", (e) => {
    e.preventDefault();
    if (!draggingEl) return;
    draggingEl.classList.remove("dragging");
    draggingEl = null;
    renumerarPontosRota(lista);
    gerarRotaAuto();
  });

  lista.addEventListener("dragend", () => {
    if (!draggingEl) return;
    draggingEl.classList.remove("dragging");
    draggingEl = null;
  });
}

function getDragAfterElement(container, y, selector) {
  const draggableElements = [...container.querySelectorAll(selector)];
  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

function renumerarPontosRota(lista) {
  const alvo = lista || getRotaListaDiv();
  if (!alvo) return;
  alvo.querySelectorAll(".rota-item-num").forEach((el, idx) => (el.textContent = idx + 1));
}

function removerPontoDaRota(ponto) {
  if (ponto.tipo === "manual") {
    pontosManuais = pontosManuais.filter((p) => p.id !== ponto.id);
  } else if (ponto.tipo === "cliente") {
    idsSelecionados.delete(ponto.id);
    listaClientesDiv.querySelectorAll(".cliente-item").forEach((div) => {
      const cb = div.querySelector(".cliente-checkbox");
      if (!cb) return;
      if (String(cb.value) === String(ponto.id)) {
        cb.checked = false;
        div.classList.remove("selecionado");
      }
    });
  }

  const temSelecionados = idsSelecionados.size > 0 || pontosManuais.length > 0;
  if (!temSelecionados) {
    limparRota();
    const lista = getRotaListaDiv();
    if (lista) lista.innerHTML = "";
    return;
  }
  reconstruirPainelRota();
  gerarRotaAuto();
}

function getPontosNaOrdemPainel() {
  const pontos = [];
  const lista = getRotaListaDiv();
  if (!lista) return pontos;
  lista.querySelectorAll(".rota-item").forEach((div) => {
    const tipo = div.dataset.tipo;
    const id = div.dataset.id;
    if (tipo === "cliente") {
      const base = getCacheAtual();
      const c = base.find((x) => getChaveSelecao(x) === String(id));
      const lat = normalizarLat(c?.lat);
      const lng = normalizarLng(c?.lng);
      if (c && lat != null && lng != null) {
        pontos.push({
          tipo: "cliente",
          id: getChaveSelecao(c),
          label: `${c.codigo} - ${c.nome}`,
          endereco: c.endereco,
          lat, lng
        });
      }
    } else if (tipo === "manual") {
      const p = pontosManuais.find((x) => String(x.id) === String(id));
      if (p) pontos.push({ ...p });
    }
  });
  return pontos;
}

// ================== OTIMIZAR ROTA ==================

function distanciaEntrePontosKm(a, b) {
  const R = 6371;
  const dLat = ((a.lat - b.lat) * Math.PI) / 180;
  const dLng = ((a.lng - b.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}

function otimizarOrdemParadasVizinhoMaisProximo() {
  const pontos = getPontosNaOrdemPainel();
  if (!pontos || pontos.length <= 2) {
    mostrarToast("Selecione pelo menos 3 pontos para otimizar a rota.", true);
    return;
  }

  const origem = origemManual || ORIGEM_FIXA;
  const naoVisitados = pontos.map((p) => ({ ...p }));
  const ordemOtima = [];

  let atualIndex = 0;
  if (origem && origem.lat != null && origem.lng != null) {
    let melhorDist = Infinity;
    naoVisitados.forEach((p, idx) => {
      const d = distanciaEntrePontosKm(
        { lat: origem.lat, lng: origem.lng },
        { lat: p.lat, lng: p.lng }
      );
      if (d < melhorDist) { melhorDist = d; atualIndex = idx; }
    });
  }

  let atual = naoVisitados.splice(atualIndex, 1)[0];
  ordemOtima.push(atual);

  while (naoVisitados.length) {
    let melhorIdx = 0;
    let melhorDist = Infinity;
    naoVisitados.forEach((p, idx) => {
      const d = distanciaEntrePontosKm(
        { lat: atual.lat, lng: atual.lng },
        { lat: p.lat, lng: p.lng }
      );
      if (d < melhorDist) { melhorDist = d; melhorIdx = idx; }
    });
    atual = naoVisitados.splice(melhorIdx, 1)[0];
    ordemOtima.push(atual);
  }

  const lista = getRotaListaDiv();
  if (!lista) return;
  lista.innerHTML = "";
  ordemOtima.forEach((ponto, idx) => {
    lista.appendChild(montarLinhaPontoRota(ponto, idx));
  });

  configurarDragAndDropPainelRota();
  gerarRotaAuto();
  mostrarToast(`Rota otimizada (${ordemOtima.length} paradas).`);
}

// ================== ROTA / OSRM ==================

function limparRota() {
  if (routingControl) {
    try { map.removeControl(routingControl); } catch (e) { console.warn("removeControl:", e); }
    routingControl = null;
  }
  ultimaRotaWaypoints = null;
  ultimaAnaliseRota = null;
  setLinkMapsEnabled(false);
  linkMapsDiv.textContent = "Nenhum link gerado ainda.";
  setAlertasTexto("Nenhuma rota analisada ainda.");
  removerTodosMarkersDoMapa();
}

async function gerarRotaAuto() {
  const selecionados = getClientesSelecionados();
  for (const c of selecionados) {
    c.lat = normalizarLat(c.lat);
    c.lng = normalizarLng(c.lng);
  }

  const destinoStr = getDestinoCampo();
  const pontosPainel = getPontosNaOrdemPainel();

  if (pontosPainel.length === 0) {
    limparRota();
    return;
  }

  const totalParadas = pontosPainel.length;
  const totalWaypointsPotencial = totalParadas + (destinoStr ? 1 : 0) + 1;
  if (totalWaypointsPotencial > LIMITE_PONTOS_ROTA) {
    mostrarToast(`Rota com muitos pontos (${totalParadas}). Reduza ou divida em duas rotas.`, true);
    return;
  }

  showRotasLoader();

  try {
    if (routingControl) {
      try { map.removeControl(routingControl); } catch (e) { console.warn("removeControl:", e); }
      routingControl = null;
    }
    ultimaRotaWaypoints = null;
    ultimaAnaliseRota = null;
    setLinkMapsEnabled(false);
    linkMapsDiv.textContent = "Nenhum link gerado ainda.";
    setAlertasTexto("Nenhuma rota analisada ainda.");
    removerTodosMarkersDoMapa();

    const waypoints = [];

    if (!origemManual) origemManual = { ...ORIGEM_FIXA };
    const origemLatLng = L.latLng(origemManual.lat, origemManual.lng);
    waypoints.push(origemLatLng);

    if (!marcadorLocalizacao) {
      marcadorLocalizacao = L.marker(origemLatLng, {
        icon: myLocationIcon,
        draggable: true
      }).addTo(map).bindPopup("Ponto de partida (arraste para ajustar)");
      marcadorLocalizacao.on("dragend", (e) => {
        const pos = e.target.getLatLng();
        origemManual.lat = pos.lat;
        origemManual.lng = pos.lng;
        gerarRotaAuto();
      });
    } else {
      marcadorLocalizacao.setLatLng(origemLatLng);
    }

    pontosPainel.forEach((p) => {
      const lat = normalizarLat(p.lat);
      const lng = normalizarLng(p.lng);
      if (lat == null || lng == null) return;
      waypoints.push(L.latLng(lat, lng));
    });

    let destinoLatLng = null;
    if (destinoStr) {
      const parsed = parseLatLngText(destinoStr);
      if (parsed) {
        const destLat = normalizarLat(parsed.lat);
        const destLng = normalizarLng(parsed.lng);
        if (destLat != null && destLng != null) destinoLatLng = L.latLng(destLat, destLng);
      }
      if (!destinoLatLng) {
        const geo = await geocodeTexto(destinoStr);
        if (geo && geo.lat != null && geo.lng != null) destinoLatLng = L.latLng(geo.lat, geo.lng);
      }
      if (destinoLatLng) waypoints.push(destinoLatLng);
    }

    ultimaRotaWaypoints = waypoints;

    const osrmServiceUrl = window.OSRM_SERVICE_URL || "https://router.project-osrm.org/route/v1";

    routingControl = L.Routing.control({
      waypoints,
      router: L.Routing.osrmv1({ serviceUrl: osrmServiceUrl }),
      lineOptions: { styles: [{ color: "#3d8c5e", weight: 5, opacity: 0.9 }] },
      show: false,
      addWaypoints: false,
      routeWhileDragging: false,
      draggableWaypoints: false
    })
      .on("routesfound", (e) => {
        const route = e.routes[0];
        ultimaAnaliseRota = route;
        setAlertasTexto(
          `${route.waypoints.length} pontos · ${(route.summary.totalDistance / 1000).toFixed(1)} km · ${(route.summary.totalTime / 3600).toFixed(1)} h`
        );

        todosMarkersRota = [];
        const markersAgrupados = criarMarkersAgrupadosPorCoord(pontosPainel);
        markersAgrupados.forEach((m) => {
          m.addTo(map);
          todosMarkersRota.push(m);
        });

        setLinkMapsEnabled(true);
      })
      .on("routingerror", (err) => {
        const msg = err?.error?.message || "";
        const status = err?.error?.status;
        if (status === -1 && msg.includes("OSRM request timed out")) {
          setAlertasTexto("Serviço de rota demorou a responder. Tente novamente.");
          return;
        }
        setAlertasTexto("Erro ao calcular rota. Verifique os pontos.");
        setLinkMapsEnabled(false);
      })
      .addTo(map);
  } finally {
    hideRotasLoader();
  }
}

// ================== PAINEL ROTA – DRAG/MINIMIZAR ==================

function initPainelRota() {
  const panel = document.getElementById("rota-panel");
  const header = document.getElementById("rota-panel-header");
  const mapContainer = document.getElementById("map-container");
  if (!panel || !header || !mapContainer) return;

  let isDragging = false;
  let startMouseX = 0, startMouseY = 0;
  let startPanelLeft = 0, startPanelTop = 0;

  function onMouseDown(e) {
    if (e.target === rotaPanelMinimize || rotaPanelMinimize.contains(e.target)) return;
    if (e.button !== 0) return;

    const panelRect = panel.getBoundingClientRect();
    const containerRect = mapContainer.getBoundingClientRect();

    startMouseX = e.clientX;
    startMouseY = e.clientY;
    startPanelLeft = panelRect.left - containerRect.left;
    startPanelTop = panelRect.top - containerRect.top;

    isDragging = true;
    panel.classList.add("rota-panel-dragging");
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    const containerRect = mapContainer.getBoundingClientRect();
    const dx = e.clientX - startMouseX;
    const dy = e.clientY - startMouseY;
    let newLeft = startPanelLeft + dx;
    let newTop = startPanelTop + dy;
    const maxLeft = containerRect.width - panel.offsetWidth;
    const maxTop = containerRect.height - panel.offsetHeight;
    newLeft = Math.max(0, Math.min(newLeft, maxLeft));
    newTop = Math.max(0, Math.min(newTop, maxTop));
    panel.style.left = newLeft + "px";
    panel.style.top = newTop + "px";
    panel.style.right = "auto";
  }

  function onMouseUp() {
    if (!isDragging) return;
    isDragging = false;
    panel.classList.remove("rota-panel-dragging");
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }

  header.addEventListener("mousedown", onMouseDown);

  rotaPanelMinimize.addEventListener("click", () => {
    rotaPanel.classList.toggle("rota-panel-minimized");
    if (rotaPanel.classList.contains("rota-panel-minimized")) {
      rotaPanel.style.left = "";
      rotaPanel.style.top = "";
      rotaPanel.style.right = "";
    }
  });
}

// ================== SIDEBAR RESIZER ==================

function initSidebarResizer() {
  const wrapper = document.getElementById("sidebar-wrapper");
  const resizer = document.getElementById("sidebar-resizer");
  const grid = document.querySelector(".rt-grid");
  if (!wrapper || !resizer || !grid) return;

  let isResizing = false;
  let startX = 0, startWidth = 0;

  resizer.addEventListener("mousedown", (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = wrapper.offsetWidth;
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  function onMouseMove(e) {
    if (!isResizing) return;
    const dx = e.clientX - startX;
    const newWidth = Math.max(280, Math.min(560, startWidth + dx));
    grid.style.gridTemplateColumns = `${newWidth}px 6px minmax(0, 1fr)`;
  }

  function onMouseUp() {
    if (!isResizing) return;
    isResizing = false;
    document.body.style.userSelect = "";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }
}

// ================== ABAS ==================

function initTabs() {
  const tabs = document.querySelectorAll(".rt-tab");
  const panels = document.querySelectorAll(".rt-tab-panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.getAttribute("data-tab");
      tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
      panels.forEach((p) =>
        p.classList.toggle("is-active", p.getAttribute("data-panel") === target)
      );
    });
  });
}

// ================== CARREGAMENTO MANUAL ==================

async function sugerirCaminhaoParaCarga(pesoTotalKg) {
  try {
    const resp = await apiFetch("/caminhoes?ativo=true");
    if (!resp.ok) return null;
    const data = await resp.json();
    const lista = (data || []).filter((c) => Number(c.capacidadeKg) > 0);
    if (!lista.length) return null;
    const candidatos = lista.filter((c) => Number(c.capacidadeKg) >= pesoTotalKg);
    let escolhido = null;
    if (candidatos.length) {
      escolhido = candidatos.reduce((menor, c) => {
        if (!menor) return c;
        return Number(c.capacidadeKg) < Number(menor.capacidadeKg) ? c : menor;
      }, null);
    } else {
      escolhido = lista.reduce((maior, c) => {
        if (!maior) return c;
        return Number(c.capacidadeKg) > Number(maior.capacidadeKg) ? c : maior;
      }, null);
    }
    return { caminhao: escolhido, listaCaminhoes: lista };
  } catch (e) {
    return null;
  }
}

function montarCarga3DManualPorItens(caminhaoSelecionado, pedidosSelecionados) {
  if (!caminhaoSelecionado || !pedidosSelecionados || !pedidosSelecionados.length) return null;

  const comprimentoM = caminhaoSelecionado.comprimentoM || 6;
  const larguraM = caminhaoSelecionado.larguraM || 2.4;
  const alturaM = caminhaoSelecionado.alturaM || 2.4;

  const volumes = [];
  const cores = [0x3d8c5e, 0x6ea3d1, 0xd4a056, 0xa855f7, 0x14b8a6];
  let corIdxPorPedido = new Map();

  const margemX = comprimentoM * 0.02;
  const margemZ = larguraM * 0.02;
  const margemY = alturaM * 0.02;

  const minX = margemX;
  const maxX = comprimentoM - margemX;
  const minZ = margemZ;
  const maxZ = larguraM - margemZ;
  const minY = margemY;
  const maxY = alturaM - margemY;

  let posX = minX;
  let posZ = minZ;
  let camadas = [{ yBase: minY, alturaUsada: 0 }];
  let camadaAtual = 0;

  pedidosSelecionados.forEach((pedido) => {
    const nunota = pedido.nunota;
    const chave = String(nunota);
    const agreg = cachePedidosItens.get(chave);
    if (!agreg || !Array.isArray(agreg.itens)) return;

    if (!corIdxPorPedido.has(chave)) {
      corIdxPorPedido.set(chave, cores[corIdxPorPedido.size % cores.length]);
    }
    const corBase = corIdxPorPedido.get(chave);

    agreg.itens.forEach((it) => {
      const qtd = Number(it.qtdneg) || 1;

      for (let q = 0; q < qtd; q++) {
        let larguraItem = Number(it.largura) || 0;
        let alturaItem = Number(it.altura) || 0;
        let profItem = Number(it.espessura) || 0;
        let volumeM3 = it.volumeUnitM3 || 0;

        if (!larguraItem || !alturaItem || !profItem) {
          if (volumeM3 > 0) {
            const lado = Math.cbrt(volumeM3);
            larguraItem = larguraItem || lado;
            alturaItem = alturaItem || lado;
            profItem = profItem || lado;
          } else {
            larguraItem = larguraItem || 0.5;
            alturaItem = alturaItem || 0.5;
            profItem = profItem || 0.5;
          }
        }

        if (profItem > (maxX - minX) || larguraItem > (maxZ - minZ) || alturaItem > (maxY - minY)) continue;

        let colocado = false;
        let tentativasCamada = 0;

        while (!colocado && tentativasCamada < 100) {
          if (!camadas[camadaAtual]) {
            const camadaAnterior = camadas[camadaAtual - 1];
            if (!camadaAnterior) break;
            camadas[camadaAtual] = {
              yBase: camadaAnterior.yBase + camadaAnterior.alturaUsada + margemY,
              alturaUsada: 0
            };
          }

          const camada = camadas[camadaAtual];
          const yBase = camada.yBase;
          if (yBase + alturaItem > maxY) break;

          if (posX + profItem > maxX) {
            posX = minX;
            posZ += larguraItem + margemZ;
          }

          if (posZ + larguraItem > maxZ) {
            posX = minX;
            posZ = minZ;
            camadaAtual++;
            tentativasCamada++;
            continue;
          }

          const xCentro = posX + profItem / 2;
          const zCentro = posZ + larguraItem / 2;
          const yCentro = yBase + alturaItem / 2;

          const halfX = profItem / 2;
          const halfZ = larguraItem / 2;
          const halfY = alturaItem / 2;

          if (
            xCentro - halfX < minX || xCentro + halfX > maxX ||
            zCentro - halfZ < minZ || zCentro + halfZ > maxZ ||
            yCentro - halfY < minY || yCentro + halfY > maxY
          ) {
            posX = minX;
            posZ += larguraItem + margemZ;
            if (posZ + larguraItem > maxZ) {
              posX = minX;
              posZ = minZ;
              camadaAtual++;
              tentativasCamada++;
            }
            continue;
          }

          const alturaTopo = yBase + alturaItem;
          if (alturaTopo > camada.yBase + camada.alturaUsada) {
            camada.alturaUsada = alturaTopo - camada.yBase;
          }

          const pesoUnitKg = Number(it.pesoUnitKg) || 0;

          volumes.push({
            id: `${nunota}-${it.sequencia}-${q + 1}`,
            pedido: nunota,
            nunota,
            codprod: it.codprod,
            descrprod: it.descrprod,
            larguraM: larguraItem,
            alturaM: alturaItem,
            profundidadeM: profItem,
            x: xCentro, y: yCentro, z: zCentro,
            cor: corBase,
            pesoKg: pesoUnitKg,
            volumeM3: volumeM3 || larguraItem * alturaItem * profItem
          });

          posX = xCentro + halfX + margemX;
          colocado = true;
        }
      }
    });
  });

  return {
    caminhao: {
      id: caminhaoSelecionado.idCaminhao || caminhaoSelecionado.id,
      descricao: caminhaoSelecionado.descricao || caminhaoSelecionado.placa || "Caminhão",
      comprimentoM, larguraM, alturaM
    },
    volumes
  };
}

// ================== EVENTOS ==================

function initEventos() {
  initTabs();

  tipoOrigemSelect.addEventListener("change", () => {
    origemAtual = tipoOrigemSelect.value;
    idsSelecionados.clear();
    pontosManuais = [];
    limparRota();
    filtroVendedorAtivo = null;
    if (origemAtual === "pedidos") {
      grupoVendedoresDiv.style.display = "none";
      carregarPedidosPendentes();
    } else if (origemAtual === "clientes") {
      grupoVendedoresDiv.style.display = "none";
      carregarClientesNormais();
    } else if (origemAtual === "carteira") {
      grupoVendedoresDiv.style.display = "";
      if (selectVendedor.value) {
        carregarCarteiraPorVendedor(selectVendedor.value);
      } else {
        renderClientes([]);
      }
    }
  });

  selectVendedor.addEventListener("change", () => {
    if (origemAtual === "carteira") carregarCarteiraPorVendedor(selectVendedor.value);
  });

  // Debounce na busca
  filtroNomeInput.addEventListener("input", () => {
    if (filtroBuscaDebounce) clearTimeout(filtroBuscaDebounce);
    filtroBuscaDebounce = setTimeout(() => aplicarFiltroLocalClientes(), 300);
  });

  btnSelecionarTodos.addEventListener("click", () => marcarTodosVisiveis(true));
  btnLimparSelecao.addEventListener("click", () => marcarTodosVisiveis(false));
  btnOtimizarRota.addEventListener("click", otimizarOrdemParadasVizinhoMaisProximo);

  chkVerTransito.addEventListener("change", () => {
    toggleTraffic(chkVerTransito.checked);
    if (chkVerTransito.checked) carregarIncidentesTomTom();
    else {
      incidentMarkers.forEach((m) => map.removeLayer(m));
      incidentMarkers = [];
    }
  });

  btnAdicionarPonto.addEventListener("click", async () => {
    const txt = novoPontoInput.value.trim();
    if (!txt) return;

    let novoPonto = null;
    const latLngParsed = parseLatLngText(txt);
    if (latLngParsed) {
      const lat = normalizarLat(latLngParsed.lat);
      const lng = normalizarLng(latLngParsed.lng);
      if (lat != null && lng != null) {
        novoPonto = {
          tipo: "manual",
          id: "manual_" + manualIdSeq++,
          label: txt, endereco: txt, lat, lng
        };
      }
    } else {
      const geo = await geocodeTexto(txt);
      if (geo && geo.lat != null && geo.lng != null) {
        novoPonto = {
          tipo: "manual",
          id: "manual_" + manualIdSeq++,
          label: geo.label, endereco: geo.label,
          lat: geo.lat, lng: geo.lng
        };
      }
    }

    if (!novoPonto) {
      mostrarToast("Ponto inválido. Use 'lat,lng' ou um endereço.", true);
      return;
    }

    pontosManuais.push(novoPonto);
    novoPontoInput.value = "";
    reconstruirPainelRota();
    gerarRotaAuto();
  });

  novoPontoInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") btnAdicionarPonto.click();
  });

  btnGerarRota.addEventListener("click", gerarRotaAuto);
  btnGerarLinkMaps.addEventListener("click", gerarLinkGoogleMaps);
  btnGerarLinkMapsSidebar.addEventListener("click", gerarLinkGoogleMaps);

  // ============ ROTAS SALVAS ============
  btnSalvarRota?.addEventListener("click", abrirModalSalvarRota);
  btnAbrirRotasSalvas?.addEventListener("click", abrirModalListarRotas);
  btnVerificarStatus?.addEventListener("click", () => {
    verificarStatusRota();
    mostrarToast("Verificando status...");
  });

  document.getElementById("btnFecharSalvarRota")?.addEventListener("click", fecharModalSalvarRota);
  document.getElementById("btnCancelarSalvarRota")?.addEventListener("click", fecharModalSalvarRota);
  document.getElementById("btnConfirmarSalvarRota")?.addEventListener("click", confirmarSalvarRota);

  document.getElementById("btnFecharListarRotas")?.addEventListener("click", fecharModalListarRotas);
  document.getElementById("filtroRotasSalvasBusca")?.addEventListener("input", debounceCarregarRotas);
  document.getElementById("filtroIncluirArquivadas")?.addEventListener("change", carregarRotasSalvas);

  // Backdrop close mousedown+mouseup
  function setupBackdropClose(modalId, fecharFn) {
    const m = document.getElementById(modalId);
    if (!m) return;
    let downBackdrop = false;
    m.addEventListener("mousedown", (e) => { downBackdrop = e.target.id === modalId; });
    m.addEventListener("mouseup", (e) => {
      if (downBackdrop && e.target.id === modalId) fecharFn();
      downBackdrop = false;
    });
  }
  setupBackdropClose("modalSalvarRota", fecharModalSalvarRota);
  setupBackdropClose("modalListarRotas", fecharModalListarRotas);

  // Modal confirmação handlers
  document.getElementById("btnFecharConfirm")?.addEventListener("click", fecharConfirmacao);
  document.getElementById("btnConfirmCancelar")?.addEventListener("click", fecharConfirmacao);
  document.getElementById("btnConfirmOk")?.addEventListener("click", () => {
    if (typeof _confirmCallback === "function") {
      const fn = _confirmCallback;
      _confirmCallback = null;
      fn();
    }
    fecharConfirmacao();
  });

  // ESC fecha modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fecharConfirmacao();
      fecharModalItens();
      fecharModalSalvarRota();
      fecharModalListarRotas();
    }
  });

  // Backdrop fecha modal (mousedown+mouseup pattern)
  (function setupBackdropClose() {
    const modal = document.getElementById("modalRotasConfirm");
    if (!modal) return;
    let mouseDownInBackdrop = false;
    modal.addEventListener("mousedown", (e) => {
      mouseDownInBackdrop = e.target.id === "modalRotasConfirm";
    });
    modal.addEventListener("mouseup", (e) => {
      if (mouseDownInBackdrop && e.target.id === "modalRotasConfirm") fecharConfirmacao();
      mouseDownInBackdrop = false;
    });
  })();

  // Modal itens do pedido
  document.getElementById("btnFecharModalItens")?.addEventListener("click", fecharModalItens);
  (function setupBackdropCloseItens() {
    const modal = document.getElementById("modalItensPedido");
    if (!modal) return;
    let mouseDownInBackdrop = false;
    modal.addEventListener("mousedown", (e) => {
      mouseDownInBackdrop = e.target.id === "modalItensPedido";
    });
    modal.addEventListener("mouseup", (e) => {
      if (mouseDownInBackdrop && e.target.id === "modalItensPedido") fecharModalItens();
      mouseDownInBackdrop = false;
    });
  })();

  if (btnRealizarCarregamento) {
    btnRealizarCarregamento.addEventListener("click", async () => {
      const pedidosSelecionados = getClientesSelecionados().filter((c) => c.origemTipo === "pedido");

      if (!pedidosSelecionados.length) {
        mostrarToast("Selecione pelo menos um pedido pendente.", true);
        return;
      }

      let pesoTotal = 0;
      let volumeTotal = 0;

      pedidosSelecionados.forEach((p) => {
        const chave = String(p.nunota);
        const agg = cachePedidosItens.get(chave);
        if (agg) {
          pesoTotal += agg.pesoTotalKg || 0;
          volumeTotal += agg.volumeTotalM3 || 0;
        }
      });

      const sugestao = await sugerirCaminhaoParaCarga(pesoTotal);
      if (!sugestao || !sugestao.caminhao) {
        mostrarToast("Não foi possível sugerir um caminhão.", true);
        return;
      }

      const cam = sugestao.caminhao;

      if (campoResumoCarga) {
        campoResumoCarga.textContent =
          `${pedidosSelecionados.length} pedidos · ${pesoTotal.toFixed(1)} kg · ${volumeTotal.toFixed(3)} m³ · Sugerido: ${cam.descricao || cam.placa} (${cam.capacidadeKg} kg)`;
      }

      if (selectCaminhaoCarga) {
        selectCaminhaoCarga.innerHTML = "";
        sugestao.listaCaminhoes.forEach((c) => {
          const opt = document.createElement("option");
          opt.value = c.idCaminhao;
          opt.textContent = `${c.descricao || c.placa} (${c.capacidadeKg} kg)`;
          if (c.idCaminhao === cam.idCaminhao) opt.selected = true;
          selectCaminhaoCarga.appendChild(opt);
        });
      }

      if (btnMontarCarga3D) btnMontarCarga3D.disabled = false;

      window.__VISYA_CARGA_BASE_MANUAL__ = {
        pedidosSelecionados, pesoTotal, volumeTotal,
        listaCaminhoes: sugestao.listaCaminhoes,
        caminhaoSugeridoId: cam.idCaminhao
      };

      mostrarToast(`Carregamento pronto. Caminhão sugerido: ${cam.descricao || cam.placa}.`);
    });
  }

  if (btnMontarCarga3D) {
    btnMontarCarga3D.addEventListener("click", () => {
      const base = window.__VISYA_CARGA_BASE_MANUAL__;
      if (!base) {
        mostrarToast("Realize o carregamento primeiro.", true);
        return;
      }

      const lista = base.listaCaminhoes || [];
      const idEscolhido =
        selectCaminhaoCarga && selectCaminhaoCarga.value
          ? selectCaminhaoCarga.value
          : base.caminhaoSugeridoId;

      const cam =
        lista.find((c) => String(c.idCaminhao) === String(idEscolhido)) ||
        lista.find((c) => String(c.idCaminhao) === String(base.caminhaoSugeridoId));

      if (!cam) {
        mostrarToast("Caminhão não identificado.", true);
        return;
      }

      const carga = montarCarga3DManualPorItens(cam, base.pedidosSelecionados);
      if (!carga) {
        mostrarToast("Não foi possível montar a carga 3D.", true);
        return;
      }

      window.__VISYA_CARGA_ATUAL__ = carga;
      window.open("../rotas/html/viewer3d.html", "_blank");
    });
  }
}

// ================== LINK GOOGLE MAPS ==================

function gerarLinkGoogleMaps() {
  if (!ultimaRotaWaypoints || ultimaRotaWaypoints.length === 0) {
    mostrarToast("Nenhuma rota calculada para gerar link.", true);
    return;
  }
  const pontos = ultimaRotaWaypoints;
  const origem = pontos[0];
  const destino = pontos[pontos.length - 1];
  const intermediarios = pontos.slice(1, -1);

  let url = `https://www.google.com/maps/dir/?api=1`;
  url += `&origin=${origem.lat},${origem.lng}`;
  url += `&destination=${destino.lat},${destino.lng}`;
  if (intermediarios.length) {
    const wps = intermediarios.map((p) => `${p.lat},${p.lng}`).join("|");
    url += `&waypoints=${encodeURIComponent(wps)}`;
  }
  if (chkEvitarPedagios.checked) url += `&avoid=tolls`;

  linkMapsDiv.textContent = url;
  setLinkMapsEnabled(true);

  try {
    navigator.clipboard.writeText(url);
    mostrarToast("Link copiado para a área de transferência.");
  } catch (e) {
    mostrarToast("Link gerado (não foi possível copiar automaticamente).");
  }
}

// ================== HELPERS ==================

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ================== MODAL ITENS DO PEDIDO ==================

function abrirModalItensPedido(nunota) {
  if (!nunota) return;
  const chave = String(nunota);
  const agg = cachePedidosItens.get(chave);

  // Acha o pedido na cache pra exibir nome do cliente
  const pedido = (cachePedidosPendentes || []).find(
    (p) => String(p.nunota) === chave
  );

  const titulo = document.getElementById("modalItensTitulo");
  const sub = document.getElementById("modalItensSub");
  const corpo = document.getElementById("modalItensCorpo");
  const totais = document.getElementById("modalItensTotais");

  if (titulo) titulo.textContent = `Pedido ${chave}`;
  if (sub) {
    sub.textContent = pedido
      ? `${pedido.nome || ""} · ${pedido.endereco || ""}`
      : `Nota ${chave}`;
  }

  if (!agg || !Array.isArray(agg.itens) || agg.itens.length === 0) {
    if (corpo) {
      corpo.innerHTML = `
        <div class="modal-itens-empty">
          Sem itens carregados para esse pedido.
        </div>`;
    }
    if (totais) totais.textContent = "—";
  } else {
    let html = `
      <table class="modal-itens-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Descrição</th>
            <th class="num">Qtd</th>
            <th class="num">Peso unit</th>
            <th class="num">Peso total</th>
            <th class="num">Volume</th>
          </tr>
        </thead>
        <tbody>`;

    agg.itens.forEach((it) => {
      const qtd = Number(it.qtdneg) || 0;
      const pesoUnit = Number(it.pesoUnitKg) || 0;
      const pesoTotal = pesoUnit * qtd;
      const volumeUnit = Number(it.volumeUnitM3) || 0;
      const volumeTotal = volumeUnit * qtd;

      html += `
        <tr>
          <td class="cell-cod">${escapeHtml(String(it.codprod || "—"))}</td>
          <td class="cell-desc" title="${escapeHtml(String(it.descrprod || ""))}">${escapeHtml(String(it.descrprod || "—"))}</td>
          <td class="num">${qtd.toFixed(2)}</td>
          <td class="num">${pesoUnit.toFixed(3)} kg</td>
          <td class="num">${pesoTotal.toFixed(2)} kg</td>
          <td class="num">${volumeTotal.toFixed(4)} m³</td>
        </tr>`;
    });

    html += `</tbody></table>`;
    if (corpo) corpo.innerHTML = html;

    if (totais) {
      totais.innerHTML = `
        <span><strong>${agg.itens.length}</strong> itens</span>
        <span><strong>${agg.pesoTotalKg.toFixed(2)}</strong> kg</span>
        <span><strong>${agg.volumeTotalM3.toFixed(4)}</strong> m³</span>
      `;
    }
  }

  const modal = document.getElementById("modalItensPedido");
  if (modal) {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }
}

function fecharModalItens() {
  const modal = document.getElementById("modalItensPedido");
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
}

// ================== ROTAS SALVAS ==================

let rotaAtualSalva = null;          // {id_rota, nome, ...} quando uma rota salva está aberta
let statusPedidosPorNunota = {};    // {nunota: 'pendente'|'faturado'|'cancelado'|'removido'}
let statusPollingTimer = null;
let buscaRotasDebounceTimer = null;
const STATUS_POLL_INTERVAL = 2 * 60 * 1000; // 2 minutos

function debounceCarregarRotas() {
  if (buscaRotasDebounceTimer) clearTimeout(buscaRotasDebounceTimer);
  buscaRotasDebounceTimer = setTimeout(carregarRotasSalvas, 300);
}

const modalSalvarRota = document.getElementById("modalSalvarRota");
const modalListarRotas = document.getElementById("modalListarRotas");
const btnSalvarRota = document.getElementById("btnSalvarRota");
const btnAbrirRotasSalvas = document.getElementById("btnAbrirRotasSalvas");
const btnVerificarStatus = document.getElementById("btnVerificarStatus");
const rotaAtualBox = document.getElementById("rotaAtualBox");
const rotaAtualNome = document.getElementById("rotaAtualNome");
const rotaAtualStatusInfo = document.getElementById("rotaAtualStatusInfo");

function abrirModalSalvarRota() {
  const ehEdicao = !!(rotaAtualSalva && rotaAtualSalva.id_rota);
  const tit = document.getElementById("salvarRotaTitulo");
  const msg = document.getElementById("salvarRotaMsg");
  const inpNome = document.getElementById("salvarRotaNome");
  const inpObs = document.getElementById("salvarRotaObs");

  if (ehEdicao) {
    tit.textContent = "Atualizar rota";
    msg.textContent = `Você está editando "${rotaAtualSalva.nome}". Confirme o nome (pode alterar) para salvar as mudanças.`;
    inpNome.value = rotaAtualSalva.nome || "";
    inpObs.value = rotaAtualSalva.obs || "";
  } else {
    tit.textContent = "Nova rota";
    msg.textContent = "Dê um nome para identificar essa rota mais tarde.";
    inpNome.value = "";
    inpObs.value = "";
  }

  modalSalvarRota.classList.add("is-open");
  modalSalvarRota.setAttribute("aria-hidden", "false");
  setTimeout(() => inpNome.focus(), 50);
}

function fecharModalSalvarRota() {
  if (modalSalvarRota) {
    modalSalvarRota.classList.remove("is-open");
    modalSalvarRota.setAttribute("aria-hidden", "true");
  }
}

function montarPayloadRotaParaSalvar(nome, obs) {
  const pontos = getPontosNaOrdemPainel();
  if (!pontos.length) return null;

  const paradas = pontos.map((p, idx) => {
    // Caso seja cliente (vindo de pedido/cliente/carteira), recupera dados do cache
    let dadosCliente = null;
    if (p.tipo === "cliente") {
      const base = getCacheAtual();
      dadosCliente = base.find((x) => getChaveSelecao(x) === p.id);
    }

    let tipo = "manual";
    let nunota = null;
    let codparc = null;
    let codvend = null;
    let nomeCliente = null;
    let nomeVendedor = null;
    let pesoKg = null;
    let volumeM3 = null;
    let labelManual = null;

    if (p.tipo === "manual") {
      tipo = "manual";
      labelManual = p.label;
    } else if (dadosCliente) {
      // Detecta o tipo pela chaveSelecao
      const chave = String(dadosCliente.chaveSelecao || "");
      if (chave.startsWith("pedido:")) tipo = "pedido";
      else if (chave.startsWith("clientes:")) tipo = "cliente";
      else if (chave.startsWith("carteira:")) tipo = "carteira";

      nunota = dadosCliente.nunota || null;
      codparc = dadosCliente.codparc || null;
      codvend = dadosCliente.codvend || null;
      nomeCliente = dadosCliente.nome || null;
      nomeVendedor = dadosCliente.nomevendedor || dadosCliente.nome_vendedor || null;
      pesoKg = dadosCliente.pesoTotalKg || null;
      volumeM3 = dadosCliente.volumeTotalM3 || null;
    }

    return {
      ordem: idx + 1,
      tipo,
      nunota,
      codparc,
      codvend,
      nome_cliente: nomeCliente,
      nome_vendedor: nomeVendedor,
      endereco: p.endereco || null,
      lat: p.lat,
      lng: p.lng,
      peso_kg: pesoKg,
      volume_m3: volumeM3,
      label_manual: labelManual,
      chave_selecao: p.tipo === "cliente" && dadosCliente ? dadosCliente.chaveSelecao : null
    };
  });

  return {
    nome,
    obs,
    origem_lat: origemManual?.lat,
    origem_lng: origemManual?.lng,
    destino_texto: getDestinoCampo() || null,
    evitar_pedagios: chkEvitarPedagios.checked,
    evitar_pontes: chkEvitarPontes.checked,
    paradas
  };
}

async function confirmarSalvarRota() {
  const nome = document.getElementById("salvarRotaNome").value.trim();
  const obs = document.getElementById("salvarRotaObs").value.trim();
  const btnConfirmar = document.getElementById("btnConfirmarSalvarRota");

  if (!nome) {
    mostrarToast("Informe um nome para a rota.", true);
    return;
  }

  // Bloqueia botão pra impedir duplo-clique
  if (btnConfirmar.disabled) return; // já está salvando
  const textoOriginal = btnConfirmar.textContent;
  btnConfirmar.disabled = true;
  btnConfirmar.textContent = "Salvando...";

  const payload = montarPayloadRotaParaSalvar(nome, obs);
  if (!payload) {
    mostrarToast("Adicione paradas antes de salvar.", true);
    btnConfirmar.disabled = false;
    btnConfirmar.textContent = textoOriginal;
    return;
  }

  showRotasLoader();
  try {
    const ehEdicao = !!(rotaAtualSalva && rotaAtualSalva.id_rota);
    const url = ehEdicao
      ? `/rotas-salvas/${rotaAtualSalva.id_rota}`
      : "/rotas-salvas";
    const method = ehEdicao ? "PUT" : "POST";

    const resp = await apiFetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const erroData = await resp.json().catch(() => ({}));
      mostrarToast(erroData.error || "Erro ao salvar rota.", true);
      return;
    }

    const data = await resp.json();
    fecharModalSalvarRota();
    mostrarToast(ehEdicao ? "Rota atualizada." : "Rota salva com sucesso.");

    // Atualiza estado: agora estamos editando essa rota salva
    if (!ehEdicao) {
      rotaAtualSalva = {
        id_rota: data.id_rota,
        nome,
        obs
      };
    } else {
      rotaAtualSalva.nome = nome;
      rotaAtualSalva.obs = obs;
    }
    atualizarUIRotaAberta();
    iniciarPollingStatus();
  } catch (e) {
    console.error(e);
    mostrarToast("Erro ao salvar rota.", true);
  } finally {
    hideRotasLoader();
    btnConfirmar.disabled = false;
    btnConfirmar.textContent = textoOriginal;
  }
}

function abrirModalListarRotas() {
  modalListarRotas.classList.add("is-open");
  modalListarRotas.setAttribute("aria-hidden", "false");
  carregarRotasSalvas();
}

function fecharModalListarRotas() {
  modalListarRotas.classList.remove("is-open");
  modalListarRotas.setAttribute("aria-hidden", "true");
}

async function carregarRotasSalvas() {
  const lista = document.getElementById("listaRotasSalvas");
  if (!lista) return;
  lista.innerHTML = '<div class="rt-listrotas-empty">Carregando...</div>';

  const busca = document.getElementById("filtroRotasSalvasBusca").value.trim();
  const incluirArquivadas = document.getElementById("filtroIncluirArquivadas").checked;

  const params = [];
  if (busca) params.push(`busca=${encodeURIComponent(busca)}`);
  if (!incluirArquivadas) params.push("arquivada=0");
  const qs = params.length ? `?${params.join("&")}` : "";

  try {
    const resp = await apiFetch(`/rotas-salvas${qs}`);
    if (!resp.ok) {
      lista.innerHTML = '<div class="rt-listrotas-empty">Erro ao carregar rotas.</div>';
      return;
    }
    const data = await resp.json();
    const rotas = data.rotas || [];

    if (!rotas.length) {
      lista.innerHTML = '<div class="rt-listrotas-empty">Nenhuma rota salva ainda.</div>';
      return;
    }

    lista.innerHTML = "";
    rotas.forEach((r) => {
      const item = document.createElement("div");
      item.className = "rt-rotaitem";
      if (r.arquivada) item.classList.add("arquivada");

      const dataStr = r.data_criacao
        ? new Date(r.data_criacao).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
        : "—";

      item.innerHTML = `
        <div class="rt-rotaitem-info">
          <div class="rt-rotaitem-nome">${escapeHtml(r.nome)}</div>
          <div class="rt-rotaitem-meta">
            <span>📍 ${r.total_paradas} paradas</span>
            <span>📋 ${r.total_pedidos} pedidos</span>
            <span>🕒 ${escapeHtml(dataStr)}</span>
            ${r.email_usuario ? `<span>👤 ${escapeHtml(r.email_usuario)}</span>` : ""}
          </div>
          ${r.obs ? `<div class="rt-rotaitem-obs">${escapeHtml(r.obs)}</div>` : ""}
        </div>
        <div class="rt-rotaitem-actions">
          <button type="button" class="rt-btn rt-btn-primary" data-acao="abrir" data-id="${r.id_rota}">Abrir</button>
          <button type="button" class="rt-btn" data-acao="arquivar" data-id="${r.id_rota}" data-arquivada="${r.arquivada ? '1' : '0'}">
            ${r.arquivada ? 'Desarquivar' : 'Arquivar'}
          </button>
          <button type="button" class="rt-btn" data-acao="excluir" data-id="${r.id_rota}" data-nome="${escapeHtml(r.nome)}">Excluir</button>
        </div>
      `;

      lista.appendChild(item);
    });

    // Liga handlers
    lista.querySelectorAll("[data-acao]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const acao = btn.dataset.acao;
        const id = btn.dataset.id;
        if (acao === "abrir") abrirRotaSalva(id);
        else if (acao === "arquivar") arquivarRotaSalva(id, btn.dataset.arquivada === "1");
        else if (acao === "excluir") confirmarExcluirRota(id, btn.dataset.nome);
      });
    });
  } catch (e) {
    console.error(e);
    lista.innerHTML = '<div class="rt-listrotas-empty">Erro de conexão.</div>';
  }
}

async function abrirRotaSalva(idRota) {
  // Desabilita TODOS os botões da listagem enquanto carrega
  const listagem = document.getElementById("listaRotasSalvas");
  if (listagem) listagem.querySelectorAll("button").forEach(b => b.disabled = true);

  showRotasLoader();
  try {
    const resp = await apiFetch(`/rotas-salvas/${idRota}`);
    if (!resp.ok) {
      mostrarToast("Erro ao carregar rota.", true);
      return;
    }
    const data = await resp.json();
    const rota = data.rota;
    if (!rota) {
      mostrarToast("Rota não encontrada.", true);
      return;
    }

    fecharModalListarRotas();

    // Carrega no editor
    await aplicarRotaSalvaNoEditor(rota);

    rotaAtualSalva = {
      id_rota: rota.id_rota,
      nome: rota.nome,
      obs: rota.obs
    };
    atualizarUIRotaAberta();
    iniciarPollingStatus();
    mostrarToast(`Rota "${rota.nome}" carregada.`);
  } catch (e) {
    console.error(e);
    mostrarToast("Erro ao abrir rota.", true);
  } finally {
    hideRotasLoader();
    if (listagem) listagem.querySelectorAll("button").forEach(b => b.disabled = false);
  }
}

async function aplicarRotaSalvaNoEditor(rota) {
  // 1) Restaura origem se houver
  if (rota.origem_lat != null && rota.origem_lng != null) {
    origemManual = { lat: Number(rota.origem_lat), lng: Number(rota.origem_lng) };
  }

  // 2) Restaura preferências
  chkEvitarPedagios.checked = !!rota.evitar_pedagios;
  chkEvitarPontes.checked = !!rota.evitar_pontes;
  destinoCampoPainel.value = rota.destino_texto || "";

  // 3) Limpa estado atual
  idsSelecionados.clear();
  pontosManuais = [];

  // 4) Garante que origem = pedidos (caso a rota tenha pedidos) ou clientes
  const temPedidos = rota.paradas.some((p) => p.tipo === "pedido");
  const temClientes = rota.paradas.some((p) => p.tipo === "cliente");
  const temCarteira = rota.paradas.some((p) => p.tipo === "carteira");

  // Carrega o cache base correto se necessário
  if (temPedidos && origemAtual !== "pedidos") {
    origemAtual = "pedidos";
    tipoOrigemSelect.value = "pedidos";
    grupoVendedoresDiv.style.display = "none";
    await carregarPedidosPendentes();
  } else if (temClientes && origemAtual !== "clientes") {
    origemAtual = "clientes";
    tipoOrigemSelect.value = "clientes";
    grupoVendedoresDiv.style.display = "none";
    await carregarClientesNormais();
  } else if (temCarteira && origemAtual !== "carteira") {
    origemAtual = "carteira";
    tipoOrigemSelect.value = "carteira";
    grupoVendedoresDiv.style.display = "";
  }

  // 5) Para cada parada: adiciona ao estado adequado
  let manualId = manualIdSeq;
  rota.paradas.forEach((p) => {
    if (p.tipo === "manual") {
      pontosManuais.push({
        tipo: "manual",
        id: "manual_" + (manualId++),
        label: p.label_manual || p.endereco || "Ponto manual",
        endereco: p.endereco || "",
        lat: Number(p.lat),
        lng: Number(p.lng)
      });
    } else {
      // tenta encontrar o item correspondente no cache atual
      const chave = p.chave_selecao || (p.nunota ? `pedido:${p.nunota}` : null);
      if (chave) {
        idsSelecionados.add(chave);
        // Se não está no cache, injeta um item "fake" pra render
        const base = getCacheAtual();
        const existe = base.find((x) => getChaveSelecao(x) === chave);
        if (!existe) {
          base.push({
            id: p.nunota || p.codparc || chave,
            chaveSelecao: chave,
            codigo: p.nunota || p.codparc,
            nunota: p.nunota,
            codparc: p.codparc,
            codvend: p.codvend,
            nome: p.nome_cliente || "Cliente",
            nomevendedor: p.nome_vendedor,
            endereco: p.endereco,
            lat: normalizarLat(p.lat),
            lng: normalizarLng(p.lng),
            pesoTotalKg: p.peso_kg ? Number(p.peso_kg) : 0,
            volumeTotalM3: p.volume_m3 ? Number(p.volume_m3) : 0,
            itens: [],
            origemTipo: p.tipo === "pedido" ? "pedido" : p.tipo
          });
        }
      }
    }
  });
  manualIdSeq = manualId;

  // 6) Renderiza tudo
  if (cachePedidosPendentes || cacheClientes || cacheCarteira) {
    renderClientes(getCacheAtual());
  }

  reconstruirPainelRota();
  await gerarRotaAuto();
}

function arquivarRotaSalva(idRota, atualmenteArquivada) {
  const novoEstado = !atualmenteArquivada;
  abrirConfirmacao(
    novoEstado ? "Arquivar rota?" : "Desarquivar rota?",
    novoEstado
      ? "A rota será movida para os arquivados. Você pode acessá-la marcando 'Incluir arquivadas'."
      : "A rota voltará para a lista principal.",
    async () => {
      try {
        const resp = await apiFetch(`/rotas-salvas/${idRota}/arquivar`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ arquivada: novoEstado })
        });
        if (!resp.ok) {
          mostrarToast("Erro ao arquivar.", true);
          return;
        }
        mostrarToast(novoEstado ? "Rota arquivada." : "Rota desarquivada.");
        carregarRotasSalvas();
      } catch (e) {
        mostrarToast("Erro de conexão.", true);
      }
    }
  );
}

function confirmarExcluirRota(idRota, nome) {
  abrirConfirmacao(
    "Excluir rota?",
    `Tem certeza que deseja excluir "${nome}"? Esta ação não pode ser desfeita.`,
    async () => {
      try {
        const resp = await apiFetch(`/rotas-salvas/${idRota}`, { method: "DELETE" });
        if (!resp.ok) {
          mostrarToast("Erro ao excluir.", true);
          return;
        }
        mostrarToast("Rota excluída.");
        // Se a rota excluída era a atual, limpa
        if (rotaAtualSalva && String(rotaAtualSalva.id_rota) === String(idRota)) {
          rotaAtualSalva = null;
          pararPollingStatus();
          atualizarUIRotaAberta();
        }
        carregarRotasSalvas();
      } catch (e) {
        mostrarToast("Erro de conexão.", true);
      }
    }
  );
}

function atualizarUIRotaAberta() {
  if (rotaAtualSalva && rotaAtualSalva.id_rota) {
    rotaAtualBox.style.display = "";
    rotaAtualNome.textContent = rotaAtualSalva.nome || "(sem nome)";
    btnVerificarStatus.style.display = "";
  } else {
    rotaAtualBox.style.display = "none";
    btnVerificarStatus.style.display = "none";
  }
}

// ================== POLLING DE STATUS ==================

function iniciarPollingStatus() {
  pararPollingStatus();
  if (!rotaAtualSalva || !rotaAtualSalva.id_rota) return;
  // primeira verificação imediata
  verificarStatusRota();
  statusPollingTimer = setInterval(verificarStatusRota, STATUS_POLL_INTERVAL);
}

function pararPollingStatus() {
  if (statusPollingTimer) {
    clearInterval(statusPollingTimer);
    statusPollingTimer = null;
  }
  // Limpa visual de status nas linhas e markers
  statusPedidosPorNunota = {};
  document.querySelectorAll(".cliente-item.status-faturado, .cliente-item.status-cancelado, .cliente-item.status-removido")
    .forEach((el) => el.classList.remove("status-faturado", "status-cancelado", "status-removido"));
}

async function verificarStatusRota() {
  if (!rotaAtualSalva || !rotaAtualSalva.id_rota) return;
  try {
    const resp = await apiFetch(`/rotas-salvas/${rotaAtualSalva.id_rota}/status`);
    if (!resp.ok) return;
    const data = await resp.json();
    const paradas = data.paradas || [];

    statusPedidosPorNunota = {};
    let faturados = 0;
    let cancelados = 0;
    let removidos = 0;
    let pendentes = 0;

    paradas.forEach((p) => {
      if (!p.nunota) return;
      statusPedidosPorNunota[String(p.nunota)] = p.status_atual;
      if (p.status_atual === "faturado") faturados++;
      else if (p.status_atual === "cancelado") cancelados++;
      else if (p.status_atual === "removido") removidos++;
      else if (p.status_atual === "pendente") pendentes++;
    });

    const dtStr = new Date().toLocaleTimeString("pt-BR");
    let resumo = `${pendentes} pendentes`;
    if (faturados) resumo += ` · ${faturados} faturados`;
    if (cancelados) resumo += ` · ${cancelados} cancelados`;
    if (removidos) resumo += ` · ${removidos} removidos`;
    resumo += ` · atualizado ${dtStr}`;
    if (rotaAtualStatusInfo) rotaAtualStatusInfo.textContent = resumo;

    // Notifica se houve mudança (faturado/cancelado novo)
    if (faturados || cancelados || removidos) {
      mostrarToast(`${faturados + cancelados + removidos} pedido(s) mudaram de status na rota.`);
    }

    aplicarStatusNasLinhasClientes();
    aplicarStatusNosMarkers();
  } catch (e) {
    console.warn("Erro ao verificar status:", e);
  }
}

function aplicarStatusNasLinhasClientes() {
  document.querySelectorAll(".cliente-item").forEach((el) => {
    el.classList.remove("status-faturado", "status-cancelado", "status-removido");
    el.querySelectorAll(".badge-status").forEach((b) => b.remove());

    const chave = el.dataset.id || "";
    if (!chave.startsWith("pedido:")) return;
    const nunota = chave.replace("pedido:", "");
    const status = statusPedidosPorNunota[nunota];
    if (!status || status === "pendente") return;

    el.classList.add(`status-${status}`);
    const badge = document.createElement("span");
    badge.className = `badge-status badge-status-${status}`;
    badge.textContent = status.toUpperCase();
    const textos = el.querySelector(".cliente-textos .nome");
    if (textos) textos.appendChild(badge);
  });
}

function aplicarStatusNosMarkers() {
  // Atualiza markers do mapa com status
  if (!todosMarkersRota || !todosMarkersRota.length) return;
  if (!map) return;
  // Atalho: re-executa gerarRotaAuto pra reconstruir os markers com status
  if (gerarRotaAuto._jaPedidoUpdate) return;
  gerarRotaAuto._jaPedidoUpdate = true;
  setTimeout(() => {
    gerarRotaAuto._jaPedidoUpdate = false;
    try {
      gerarRotaAuto();
    } catch (e) {
      console.warn("[ROTAS] Erro ao re-render markers com status:", e);
    }
  }, 300);
}

// ================== INIT ==================

document.addEventListener("DOMContentLoaded", async () => {
  initPainelRota();
  initSidebarResizer();
  initEventos();
  configurarInfiniteScrollClientes();
  // Carrega vendedores PRIMEIRO pra garantir que os nomes apareçam nos chips
  // (se ficar em paralelo, pedidos podem chegar antes e renderizar chips com código)
  await carregarVendedores();
  carregarPedidosPendentes();
});