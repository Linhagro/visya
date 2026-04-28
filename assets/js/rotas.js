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


// ================== LOADER LOCAL DE ROTAS ==================


let rotasLoaderTimerId = null;


function showRotasLoader() {
  const overlay =
    document.getElementById("loaderOverlay") ||
    document.getElementById("rotas-loader-overlay");
  if (!overlay) {
    console.warn("[ROTAS] loaderOverlay global não encontrado no DOM");
    return;
  }


  if (rotasLoaderTimerId !== null) {
    clearTimeout(rotasLoaderTimerId);
  }
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


// ================== AUTH HELPER JWT ==================


function getAuthHeadersRotas() {
  try {
    const token =
      (window.sessionStorage && sessionStorage.getItem("authToken")) || null;
    if (!token) return;
    return {
      Authorization: "Bearer " + token
    };
  } catch (e) {
    console.warn("[ROTAS] Erro ao recuperar authToken do sessionStorage:", e);
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


// CONSTANTES DE LIMITE
const LIMITE_PONTOS_ROTA = 80;


// TOMTOM TRAFFIC FLOW
const TOMTOM_API_KEY = "l22aGTuKjY30e1lAcUqAup3XZ8pYzCOb";


const tomtomTrafficLayer = L.tileLayer(
  "https://api.tomtom.com/traffic/map/4/tile/flow/absolute/{z}/{x}/{y}.png?key=" +
    TOMTOM_API_KEY,
  {
    opacity: 0.7,
    attribution: "© TomTom"
  }
);


function toggleTraffic(ativo) {
  if (ativo) {
    tomtomTrafficLayer.addTo(map);
  } else {
    map.removeLayer(tomtomTrafficLayer);
  }
}


// TOMTOM TRAFFIC INCIDENTS
let incidentMarkers = [];


function escolherIconePorCategoria(cat) {
  let color = "#2563eb";
  if (cat === 1) color = "#ef4444";
  else if (cat === 6) color = "#f97316";
  else if (cat === 8) color = "#111827";
  else if (cat === 9) color = "#eab308";


  return L.divIcon({
    className: "incident-marker-wrapper",
    html: `<div class="incident-marker" style="
        width:14px;
        height:14px;
        border-radius:50%;
        background:${color};
        border:2px solid #0f172a;
        box-shadow:0 0 6px rgba(15,23,42,0.8);
      "></div>`,
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
    incidentMarkers.forEach(m => map.removeLayer(m));
    incidentMarkers = [];


    const bounds = map.getBounds();
    const minLat = bounds.getSouth();
    const minLon = bounds.getWest();
    const maxLat = bounds.getNorth();
    const maxLon = bounds.getEast();


    if (map.getZoom() < 9) {
      console.log(
        "[ROTAS] Zoom muito baixo para incidentes, pulando chamada TomTom"
      );
      return;
    }


    const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
    const path = `/logistica/tomtom/incidentes?bbox=${encodeURIComponent(
      bbox
    )}`;


    const resp = await apiFetch(path);
    if (!resp.ok) {
      console.warn("[ROTAS] Incidentes HTTP", resp.status);
      return;
    }
    const data = await resp.json();
    (data.incidents || []).forEach(inc => {
      const props = inc.properties;
      const geom = inc.geometry;
      const cat = props.iconCategory;
      const evt = props.events && props.events[0];
      const descrOriginal = evt?.description || "Incidente de trânsito";
      const descr = traduzirDescricaoTomTom(descrOriginal);


      let lat = null;
      let lon = null;
      if (geom.type === "Point") {
        const coords = geom.coordinates;
        lon = coords[0];
        lat = coords[1];
      } else if (geom.type === "LineString") {
        const coords = geom.coordinates || [];
        if (coords.length === 0) return;
        const mid = Math.floor(coords.length / 2);
        lon = coords[mid][0];
        lat = coords[mid][1];
      }
      if (lat == null || lon == null) return;


      const marker = L.marker([lat, lon], {
        icon: escolherIconePorCategoria(cat)
      }).bindPopup(descr);


      marker.addTo(map);
      incidentMarkers.push(marker);
    });
  } catch (e) {
    console.warn("[ROTAS] Erro ao carregar incidentes TomTom:", e);
  } finally {
    hideRotasLoader();
  }
}


// MAPA
const map = L.map("map", {
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  wheelDebounceTime: 20,
  wheelPxPerZoomLevel: 80,
  attributionControl: false
}).setView([-19.5, -40.3], 7);


L.Marker.prototype.options.icon = L.divIcon({
  className: "",
  html: "",
  iconSize: null
});


const OpenStreetMapFrance = L.tileLayer(
  "https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png",
  {
    maxZoom: 20,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }
);
OpenStreetMapFrance.addTo(map);
map.doubleClickZoom.disable();


// ESTADO
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
let rotaDebounceTimeout = null;
let dragListaConfigurado = false;


let idsSelecionados = new Set();
let origemAtual = "pedidos";


// FILTRO VENDEDOR PEDIDOS PENDENTES
let filtroVendedorAtivo = null;


const ORIGEM_FIXA = {
  lat: -19.383869647653956,
  lng: -40.067551247607746
};


let marcadorLocalizacao = null;
let origemManual = { ...ORIGEM_FIXA };


let pontosManuais = [];
let manualIdSeq = 1;


const myLocationIcon = L.divIcon({
  className: "",
  html: `<div class="pin-minha-localizacao"></div>`,
  iconSize: [26, 34],
  iconAnchor: [13, 26]
});


// DOM
const listaClientesDiv = document.getElementById("listaClientes");
const contadorClientesSpan = document.getElementById("contadorClientes");
const contadorSelecionadosSpan = document.getElementById(
  "contadorSelecionados"
);
const resumoSelecionadosDiv = document.getElementById("resumoSelecionados");
const alertasRota = document.getElementById("alertasRota");
const alertasRotaSidebar = document.getElementById("alertasRotaSidebar");
const filtroNomeInput = document.getElementById("filtroNome");
const btnGerarLinkMapsSidebar = document.getElementById(
  "btnGerarLinkMapsSidebar"
);
const chkEvitarPedagios = document.getElementById("chkEvitarPedagios");
const chkEvitarPontes = document.getElementById("chkEvitarPontes");
const linkMapsDiv = document.getElementById("linkMaps");


const tipoOrigemSelect = document.getElementById("tipoOrigem");
const grupoVendedoresDiv = document.getElementById("grupoVendedores");
const selectVendedor = document.getElementById("selectVendedor");


let chkVerTransito = document.getElementById("chkVerTransito");
if (!chkVerTransito) chkVerTransito = chkEvitarPontes;


const novoPontoInput = document.getElementById("novoPontoInput");
const btnAdicionarPonto = document.getElementById("btnAdicionarPonto");
const rotaPanel = document.getElementById("rota-panel");
const rotaPanelHeader = document.getElementById("rota-panel-header");
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


function getRotaListaDiv() {
  return document.getElementById("rotaListaPontos");
}


// HELPERS
function getDestinoCampo() {
  return destinoCampoPainel.value.trim();
}


function setAlertasTexto(texto) {
  alertasRota.textContent = texto;
  alertasRotaSidebar.textContent = texto;
}


function setLinkMapsEnabled(enabled) {
  btnGerarLinkMaps.disabled = !enabled;
  btnGerarLinkMapsSidebar.disabled = !enabled;
}


function removerTodosMarkersDoMapa() {
  todosMarkersRota.forEach(m => {
    if (map.hasLayer(m)) map.removeLayer(m);
  });
  todosMarkersRota = [];
  Object.values(clienteMarkers).forEach(m => {
    if (map.hasLayer(m)) map.removeLayer(m);
  });
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
  const vendedor = lista.find(v => String(v.codvend) === cod);
  if (!vendedor) return "";
  return (
    vendedor.nome_vendedor ||
    vendedor.nomevendedor ||
    vendedor.nome ||
    vendedor.descricao ||
    ""
  );
}


function getNomeExibicaoVendedor(pedido) {
  const nomeDireto =
    pedido?.nomevendedor ||
    pedido?.nome_vendedor ||
    pedido?.NOMEVENDEDOR ||
    pedido?.nomeVendedor ||
    "";


  if (String(nomeDireto).trim()) {
    return String(nomeDireto).trim();
  }


  const nomeCache = getNomeVendedorPorCodigo(pedido?.codvend ?? pedido?.CODVEND);
  if (String(nomeCache).trim()) {
    return String(nomeCache).trim();
  }


  return String(pedido?.codvend ?? pedido?.CODVEND ?? "").trim();
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
  const html = `
    <div class="marker-numero">
      <div class="marker-numero-label">${numero}</div>
    </div>
  `;
  const icon = L.divIcon({
    className: "marker-numero-wrapper",
    html,
    iconSize: [26, 26],
    iconAnchor: [13, 26]
  });


  const marker = L.marker([lat, lng], {
    icon,
    draggable: true
  }).bindPopup(titulo);


  marker.on("dragend", e => {
    const { lat: newLat, lng: newLng } = e.target.getLatLng();
    if (pontoRef.tipo === "cliente") {
      const base = getCacheAtual();
      const c = base.find(x => getChaveSelecao(x) === pontoRef.id);
      if (c) {
        c.lat = newLat;
        c.lng = newLng;
      }
    } else if (pontoRef.tipo === "manual") {
      const p = pontosManuais.find(x => x.id === pontoRef.id);
      if (p) {
        p.lat = newLat;
        p.lng = newLng;
      }
    }
    gerarRotaAuto();
  });


  return marker;
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
    return Number.isFinite(valor) && valor >= -180 && valor <= 180
      ? valor
      : null;
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
    if (!resp.ok) {
      console.error("[ROTAS] Erro HTTP no geocode:", resp.status);
      return null;
    }
    const data = await resp.json();
    if (data && data.lat != null && data.lng != null) {
      return {
        lat: data.lat,
        lng: data.lng,
        label: texto
      };
    }
    return null;
  } catch (e) {
    console.error("[ROTAS] Erro ao chamar geocode:", e);
    return null;
  } finally {
    hideRotasLoader();
  }
}


// ================== FILTRO VENDEDOR – CHIPS ==================


function extrairVendedoresDoPedidos(pedidos) {
  const mapa = new Map();
  pedidos.forEach(p => {
    if (!p.codvend) return;
    const cod = String(p.codvend);
    if (!mapa.has(cod)) {
      mapa.set(cod, getNomeExibicaoVendedor(p));
    }
  });
  return Array.from(mapa.entries())
    .map(([codvend, nome]) => ({ codvend, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}


function renderizarChipsVendedor(vendedores) {
  const container = document.getElementById("filtroVendedorChips");
  if (!container) return;


  container.innerHTML = "";


  if (!vendedores || vendedores.length === 0) {
    container.style.display = "none";
    return;
  }


  container.style.display = "flex";


  const chipTodos = document.createElement("button");
  chipTodos.type = "button";
  chipTodos.className = "chip-vendedor" + (filtroVendedorAtivo === null ? " chip-vendedor-ativo" : "");
  chipTodos.textContent = "Todos";
  chipTodos.addEventListener("click", () => {
    filtroVendedorAtivo = null;
    aplicarFiltroVendedorLocal();
    atualizarChipsVendedorAtivo();
  });
  container.appendChild(chipTodos);


  vendedores.forEach(v => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip-vendedor" + (filtroVendedorAtivo === v.codvend ? " chip-vendedor-ativo" : "");
    chip.textContent = v.nome;
    chip.dataset.codvend = v.codvend;
    chip.addEventListener("click", () => {
      if (filtroVendedorAtivo === v.codvend) {
        filtroVendedorAtivo = null;
      } else {
        filtroVendedorAtivo = v.codvend;
      }
      aplicarFiltroVendedorLocal();
      atualizarChipsVendedorAtivo();
    });
    container.appendChild(chip);
  });
}


function atualizarChipsVendedorAtivo() {
  const container = document.getElementById("filtroVendedorChips");
  if (!container) return;
  container.querySelectorAll(".chip-vendedor").forEach(chip => {
    const cod = chip.dataset.codvend || null;
    const ativo = filtroVendedorAtivo === cod;
    chip.classList.toggle("chip-vendedor-ativo", ativo);
  });
}


function aplicarFiltroVendedorLocal() {
  listaClientesDiv.scrollTop = 0;
  const base = cachePedidosPendentes || [];


  let resultado = filtroVendedorAtivo
    ? base.filter(p => String(p.codvend) === String(filtroVendedorAtivo))
    : base;


  const filtroNome = filtroNomeInput.value.trim().toLowerCase();
  if (filtroNome) {
    resultado = resultado.filter(c => {
      const cod = String(c.codigo || "").toLowerCase();
      const nome = String(c.nome || "").toLowerCase();
      const end = String(c.endereco || "").toLowerCase();
      return cod.includes(filtroNome) || nome.includes(filtroNome) || end.includes(filtroNome);
    });
  }


  renderClientes(resultado);
}


// LISTA / SELEÇÃO
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


  itens.forEach(cb => {
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


  const checkWrap = document.createElement("label");
  checkWrap.className = "checkbox-wrapper checkbox-sm checkbox-cliente";


  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "cliente-checkbox";
  checkbox.value = getChaveSelecao(c);


  const checkmark = document.createElement("div");
  checkmark.className = "checkmark";
  checkmark.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M20 6L9 17L4 12" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;


  const spanLabelVis = document.createElement("span");
  spanLabelVis.className = "label";
  spanLabelVis.textContent = "";


  checkWrap.appendChild(checkbox);
  checkWrap.appendChild(checkmark);
  checkWrap.appendChild(spanLabelVis);


  const textos = document.createElement("div");
  textos.className = "cliente-textos";


  const spanNome = document.createElement("span");
  spanNome.className = "nome";
  const nomePrincipal =
    c.origemTipo === "pedido"
      ? `${c.nunota} - ${c.nome}`
      : `${c.codigo} - ${c.nome}`;
  spanNome.textContent = nomePrincipal;


  const spanBadge = document.createElement("span");
  spanBadge.className = "badge";
  spanBadge.textContent = c.endereco || "";


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
    checkWrap.classList.add("checkbox-desabilitado");
  }


  function handleToggleSelecao(novoEstado) {
    if (semLocalizacao) {
      checkbox.checked = false;
      return;
    }
    const chave = getChaveSelecao(c);
    checkbox.checked = novoEstado;
    if (novoEstado) {
      idsSelecionados.add(chave);
    } else {
      idsSelecionados.delete(chave);
    }
    div.classList.toggle("selecionado", novoEstado);
    atualizarContadorSelecionados();
  }


  checkbox.addEventListener("change", e => {
    e.stopPropagation();
    handleToggleSelecao(checkbox.checked);
  });


  checkbox.addEventListener("click", e => {
    e.stopPropagation();
  });


  checkWrap.addEventListener("click", e => {
    e.stopPropagation();
    if (e.target === checkbox) return;
    e.preventDefault();
    if (semLocalizacao) return;
    handleToggleSelecao(!checkbox.checked);
  });


  textos.appendChild(spanNome);
  textos.appendChild(spanBadge);
  textos.appendChild(spanAlerta);
  div.appendChild(checkWrap);
  div.appendChild(textos);


  return div;
}


function configurarDragAndDropLista() {
  if (dragListaConfigurado) return;
  dragListaConfigurado = true;


  let draggingItem = null;
  let mouseDownX = 0;
  let mouseDownY = 0;
  let dragAtivo = false;


  listaClientesDiv.addEventListener("mousedown", e => {
    const item = e.target.closest(".cliente-item");
    if (!item) return;


    if (e.target.closest(".checkbox-wrapper")) return;
    if (e.target.closest("input")) return;


    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    draggingItem = item;
    dragAtivo = false;


    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });


  function onMouseMove(e) {
    if (!draggingItem) return;


    if (!dragAtivo) {
      const dx = Math.abs(e.clientX - mouseDownX);
      const dy = Math.abs(e.clientY - mouseDownY);
      if (dx < 5 && dy < 5) return;
      dragAtivo = true;
      draggingItem.classList.add("dragging");
      document.body.style.userSelect = "none";
    }


    const afterElement = getDragAfterElement(
      listaClientesDiv,
      e.clientY,
      ".cliente-item:not(.dragging)"
    );


    if (!afterElement) {
      listaClientesDiv.appendChild(draggingItem);
    } else {
      listaClientesDiv.insertBefore(draggingItem, afterElement);
    }
  }


  function onMouseUp() {
    if (!draggingItem) return;
    if (dragAtivo) {
      draggingItem.classList.remove("dragging");
      document.body.style.userSelect = "";
    }
    draggingItem = null;
    dragAtivo = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }
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
    return;
  }


  const inicio = paginaClientes * TAMANHO_PAGINA;
  if (inicio >= clientesFiltradosAtuais.length) return;


  const fim = Math.min(
    inicio + TAMANHO_PAGINA,
    clientesFiltradosAtuais.length
  );


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


  contadorClientesSpan.textContent =
    clientesFiltradosAtuais.length + " clientes";
}


function renderClientes(clientes) {
  clientesFiltradosAtuais = clientes;
  paginaClientes = 0;
  limparListaClientesVisual();
  renderClientesPagina();
  configurarDragAndDropLista();
}


function configurarInfiniteScrollClientes() {
  listaClientesDiv.addEventListener("scroll", () => {
    if (carregandoMais) return;
    const scrollBottom =
      listaClientesDiv.scrollTop + listaClientesDiv.clientHeight;
    const limite = listaClientesDiv.scrollHeight - 40;
    if (scrollBottom >= limite) {
      const inicio = paginaClientes * TAMANHO_PAGINA;
      if (!clientesFiltradosAtuais || inicio >= clientesFiltradosAtuais.length)
        return;
      carregandoMais = true;
      setTimeout(() => {
        renderClientesPagina();
        carregandoMais = false;
      }, 0);
    }
  });
}


// ORIGENS / APIS
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


  console.log("[ROTAS] GET pedidos-pendentes-itens em", window.APIBASE + path);


  try {
    const resp = await apiFetch(path);
    if (!resp.ok) {
      console.warn("[ROTAS] Erro HTTP em pedidos-pendentes-itens:", resp.status);
      return;
    }
    const data = await resp.json();
    const pedidos = data.pedidos || [];


    cachePedidosItens.clear();


    pedidos.forEach(p => {
      const nunota = p.nunota;
      if (!nunota || !Array.isArray(p.itens)) return;


      let pesoTotalKg = 0;
      let volumeTotalM3 = 0;


      const itensEnriquecidos = p.itens.map(it => {
        const pesoBruto = Number(it.pesobruto) || 0;
        const qtd = Number(it.qtdneg) || 1;
        const m3Unit =
          Number(it.m3_calc) ||
          Number(it.m3_erp) ||
          0;


        pesoTotalKg += pesoBruto * qtd;
        volumeTotalM3 += m3Unit * qtd;


        return {
          ...it,
          pesoUnitKg: pesoBruto,
          volumeUnitM3: m3Unit
        };
      });


      cachePedidosItens.set(String(nunota), {
        pesoTotalKg,
        volumeTotalM3,
        itens: itensEnriquecidos
      });
    });


    console.log("[ROTAS] cachePedidosItens populado com", cachePedidosItens.size, "pedidos");
  } catch (e) {
    console.error("[ROTAS] Exception em pedidos-pendentes-itens:", e);
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
    console.log("[ROTAS] GET pedidos pendentes em", window.APIBASE + path);


    const resp = await apiFetch(path);
    if (!resp.ok) {
      console.error("[ROTAS] Erro HTTP em pedidos pendentes:", resp.status);
      cachePedidosPendentes = [];
      return;
    }


    const data = await resp.json();
    const pedidosApi = data.pedidos || [];


    await carregarPedidosPendentesItens(
      codvendFiltro ? { codvend: codvendFiltro } : {}
    );


    cachePedidosPendentes = pedidosApi.map(p => {
      const endereco = montarEnderecoPadrao(p);
      const chave = String(p.NUNOTA);
      const agregados = cachePedidosItens.get(chave) || {
        pesoTotalKg: 0,
        volumeTotalM3: 0,
        itens: []
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
    console.error("[ROTAS] Exception em pedidos pendentes:", e);
    cachePedidosPendentes = [];
  } finally {
    hideRotasLoader();
  }
}


async function carregarClientesNormais() {
  showRotasLoader();
  try {
    listaClientesDiv.innerHTML = "";


    const container = document.getElementById("filtroVendedorChips");
    if (container) container.style.display = "none";


    const path = "/logistica/clientes";
    console.log("[ROTAS] GET clientes em", window.APIBASE + path);


    const resp = await apiFetch(path);
    if (!resp.ok) {
      throw new Error("HTTP " + resp.status);
    }
    const data = await resp.json();
    cacheClientes = (data.clientes || []).map(r => {
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
    console.error("[ROTAS] Erro em carregarClientesNormais:", e);
    cacheClientes = [];
  } finally {
    hideRotasLoader();
  }
}


async function carregarVendedores() {
  showRotasLoader();
  try {
    const path = "/vendedores";
    console.log("[ROTAS] GET vendedores em", window.APIBASE + path);
    const resp = await apiFetch(path);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    cacheVendedores = data.vendedores || [];


    selectVendedor.innerHTML =
      '<option value="">Selecione um vendedor...</option>';
    cacheVendedores.forEach(v => {
      const opt = document.createElement("option");
      opt.value = v.codvend;
      opt.textContent = `${v.codvend} - ${v.nome_vendedor || v.nomevendedor || ""}`;
      selectVendedor.appendChild(opt);
    });
  } catch (e) {
    console.error("[ROTAS] Erro ao carregar vendedores:", e);
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


    const container = document.getElementById("filtroVendedorChips");
    if (container) container.style.display = "none";


    const path = `/carteira?codvend=${encodeURIComponent(codvend)}`;
    console.log("[ROTAS] GET carteira em", window.APIBASE + path);


    const resp = await apiFetch(path);
    if (!resp.ok) throw new Error("HTTP " + resp.status);


    const data = await resp.json();
    cacheCarteira = (data.carteira || []).map(c => {
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
    console.error("[ROTAS] Erro ao carregar carteira do vendedor:", e);
    cacheCarteira = [];
  } finally {
    hideRotasLoader();
  }
}


// FILTRO LOCAL
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


  const filtrados = base.filter(c => {
    const cod = String(c.codigo || "").toLowerCase();
    const nome = String(c.nome || "").toLowerCase();
    const end = String(c.endereco || "").toLowerCase();
    return (
      cod.includes(filtro) || nome.includes(filtro) || end.includes(filtro)
    );
  });
  renderClientes(filtrados);
}


// PONTOS / ROTA
function getClientesSelecionados() {
  const base = getCacheAtual();
  const clientes = [];
  base.forEach(c => {
    if (idsSelecionados.has(getChaveSelecao(c))) clientes.push(c);
  });
  return clientes;
}


function reconstruirPainelRota() {
  const rotaListaDiv = getRotaListaDiv();
  if (!rotaListaDiv) return;
  rotaListaDiv.innerHTML = "";


  const clientesSelecionados = getClientesSelecionados();
  const pontos = [];


  clientesSelecionados.forEach(c => {
    const lat = normalizarLat(c.lat);
    const lng = normalizarLng(c.lng);
    if (lat == null || lng == null) return;
    pontos.push({
      tipo: "cliente",
      id: getChaveSelecao(c),
      label: `${c.codigo} - ${c.nome}`,
      endereco: c.endereco,
      lat,
      lng
    });
  });


  pontosManuais.forEach(p => pontos.push(p));


  if (pontos.length > LIMITE_PONTOS_ROTA - 1) {
    alert(
      "Você selecionou muitos pontos (" +
        pontos.length +
        "). Recomenda-se dividir em duas rotas (limite atual ~" +
        (LIMITE_PONTOS_ROTA - 1) +
        " paradas)."
    );
  }


  pontos.forEach((ponto, idx) => {
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
    main.textContent =
      ponto.tipo === "cliente" ? ponto.label : `Manual: ${ponto.label}`;


    const sub = document.createElement("div");
    sub.className = "rota-item-label-sub";
    sub.textContent = `${ponto.endereco} (${ponto.lat.toFixed(
      5
    )}, ${ponto.lng.toFixed(5)})`;


    labelWrap.appendChild(main);
    labelWrap.appendChild(sub);


    const remover = document.createElement("button");
    remover.className = "rota-item-remove";
    remover.type = "button";
    remover.innerHTML = "&times;";
    remover.title = "Remover ponto";
    remover.addEventListener("click", e => {
      e.stopPropagation();
      removerPontoDaRota(ponto);
    });


    li.appendChild(handle);
    li.appendChild(num);
    li.appendChild(labelWrap);
    li.appendChild(remover);


    rotaListaDiv.appendChild(li);
  });


  configurarDragAndDropPainelRota();
}


// BUG FIX: remover listeners antigos antes de registrar novos
function configurarDragAndDropPainelRota() {
  const listaAtual = getRotaListaDiv();
  if (!listaAtual || !listaAtual.parentNode) return;


  const novaLista = listaAtual.cloneNode(false);
  while (listaAtual.firstChild) {
    novaLista.appendChild(listaAtual.firstChild);
  }
  listaAtual.parentNode.replaceChild(novaLista, listaAtual);


  const lista = novaLista;
  let draggingEl = null;


  lista.addEventListener("dragstart", e => {
    const item = e.target.closest(".rota-item");
    if (!item) return;
    draggingEl = item;
    item.classList.add("dragging");
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.dataset.id);
    }
  });


  lista.addEventListener("dragover", e => {
    e.preventDefault();
    if (!draggingEl) return;


    const afterElement = getDragAfterElement(
      lista,
      e.clientY,
      ".rota-item:not(.dragging)"
    );


    limpaDropzonesRota(lista);


    if (!afterElement) {
      lista.appendChild(draggingEl);
    } else {
      lista.insertBefore(draggingEl, afterElement);
    }
  });


  lista.addEventListener("drop", e => {
    e.preventDefault();
    if (!draggingEl) return;
    draggingEl.classList.remove("dragging");
    limpaDropzonesRota(lista);
    draggingEl = null;
    renumerarPontosRota(lista);
    gerarRotaAuto();
  });


  lista.addEventListener("dragend", () => {
    if (!draggingEl) return;
    draggingEl.classList.remove("dragging");
    limpaDropzonesRota(lista);
    draggingEl = null;
  });


  function limpaDropzonesRota(el) {
    el.querySelectorAll(".rota-item-dropzone-before, .rota-item-dropzone-after")
      .forEach(item => {
        item.classList.remove("rota-item-dropzone-before", "rota-item-dropzone-after");
      });
  }
}


function getDragAfterElement(container, y, selector) {
  const draggableElements = [...container.querySelectorAll(selector)];


  return draggableElements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      } else {
        return closest;
      }
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}


function renumerarPontosRota(lista) {
  const alvo = lista || getRotaListaDiv();
  if (!alvo) return;
  alvo.querySelectorAll(".rota-item-num")
    .forEach((el, idx) => (el.textContent = idx + 1));
}


function removerPontoDaRota(ponto) {
  if (ponto.tipo === "manual") {
    pontosManuais = pontosManuais.filter(p => p.id !== ponto.id);
  } else if (ponto.tipo === "cliente") {
    idsSelecionados.delete(ponto.id);
    listaClientesDiv.querySelectorAll(".cliente-item").forEach(div => {
      const cb = div.querySelector(".cliente-checkbox");
      if (!cb) return;
      const id = String(cb.value);
      if (id === String(ponto.id)) {
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
  lista.querySelectorAll(".rota-item").forEach(div => {
    const tipo = div.dataset.tipo;
    const id = div.dataset.id;


    if (tipo === "cliente") {
      const base = getCacheAtual();
      const c = base.find(x => getChaveSelecao(x) === String(id));
      const lat = normalizarLat(c?.lat);
      const lng = normalizarLng(c?.lng);
      if (c && lat != null && lng != null) {
        pontos.push({
          tipo: "cliente",
          id: getChaveSelecao(c),
          label: `${c.codigo} - ${c.nome}`,
          endereco: c.endereco,
          lat,
          lng
        });
      }
    } else if (tipo === "manual") {
      const p = pontosManuais.find(x => String(x.id) === String(id));
      if (p) pontos.push({ ...p });
    }
  });
  return pontos;
}


// =======================
// OTIMIZAR ROTA – Vizinho mais próximo
// =======================


function distanciaEntrePontosKm(a, b) {
  const R = 6371;
  const dLat = ((a.lat - b.lat) * Math.PI) / 180;
  const dLng = ((a.lng - b.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;


  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);


  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;


  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}


function otimizarOrdemParadasVizinhoMaisProximo() {
  console.log("[ROTAS][ROTA] Otimizando ordem de paradas (vizinho mais próximo)");


  const pontos = getPontosNaOrdemPainel();
  if (!pontos || pontos.length <= 2) {
    alert("Selecione pelo menos 3 pontos para otimizar a rota.");
    return;
  }


  const origem = origemManual || ORIGEM_FIXA;


  const naoVisitados = pontos.map(p => ({ ...p }));
  const ordemOtima = [];


  let atualIndex = 0;
  if (origem && origem.lat != null && origem.lng != null) {
    let melhorDist = Infinity;
    naoVisitados.forEach((p, idx) => {
      const d = distanciaEntrePontosKm(
        { lat: origem.lat, lng: origem.lng },
        { lat: p.lat, lng: p.lng }
      );
      if (d < melhorDist) {
        melhorDist = d;
        atualIndex = idx;
      }
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
      if (d < melhorDist) {
        melhorDist = d;
        melhorIdx = idx;
      }
    });


    atual = naoVisitados.splice(melhorIdx, 1)[0];
    ordemOtima.push(atual);
  }


  console.log("[ROTAS][ROTA] Ordem otimizada:", ordemOtima);


  const lista = getRotaListaDiv();
  if (!lista) return;
  lista.innerHTML = "";
  ordemOtima.forEach((ponto, idx) => {
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
    main.textContent =
      ponto.tipo === "cliente" ? ponto.label : `Manual: ${ponto.label}`;


    const sub = document.createElement("div");
    sub.className = "rota-item-label-sub";
    sub.textContent = `${ponto.endereco} (${ponto.lat.toFixed(
      5
    )}, ${ponto.lng.toFixed(5)})`;


    labelWrap.appendChild(main);
    labelWrap.appendChild(sub);


    const remover = document.createElement("button");
    remover.className = "rota-item-remove";
    remover.type = "button";
    remover.innerHTML = "&times;";
    remover.title = "Remover ponto";
    remover.addEventListener("click", e => {
      e.stopPropagation();
      removerPontoDaRota(ponto);
    });


    li.appendChild(handle);
    li.appendChild(num);
    li.appendChild(labelWrap);
    li.appendChild(remover);


    lista.appendChild(li);
  });


  configurarDragAndDropPainelRota();
  gerarRotaAuto();
}


// ROTA / OSRM
function limparRota() {
  if (routingControl) {
    map.removeControl(routingControl);
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
    alert(
      "Rota com muitos pontos (" +
        totalParadas +
        "). Reduza para aproximadamente " +
        (LIMITE_PONTOS_ROTA - 2) +
        " paradas ou divida em duas rotas."
    );
    return;
  }


  showRotasLoader();


  try {
    if (routingControl) {
      map.removeControl(routingControl);
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
      })
        .addTo(map)
        .bindPopup("Ponto de partida (arraste para ajustar)");
      marcadorLocalizacao.on("dragend", e => {
        const pos = e.target.getLatLng();
        origemManual.lat = pos.lat;
        origemManual.lng = pos.lng;
        gerarRotaAuto();
      });
    } else {
      marcadorLocalizacao.setLatLng(origemLatLng);
    }


    pontosPainel.forEach(p => {
      const lat = normalizarLat(p.lat);
      const lng = normalizarLng(p.lng);
      if (lat == null || lng == null) return;
      waypoints.push(L.latLng(lat, lng));
    });


    let destinoLatLng = null;
    if (destinoStr) {
      let destLat = null;
      let destLng = null;
      const parsed = parseLatLngText(destinoStr);
      if (parsed) {
        destLat = normalizarLat(parsed.lat);
        destLng = normalizarLng(parsed.lng);
      }
      if (destLat != null && destLng != null) {
        destinoLatLng = L.latLng(destLat, destLng);
      } else {
        const geo = await geocodeTexto(destinoStr);
        if (geo && geo.lat != null && geo.lng != null) {
          destinoLatLng = L.latLng(geo.lat, geo.lng);
        }
      }


      if (destinoLatLng) {
        waypoints.push(destinoLatLng);
      }
    }


    ultimaRotaWaypoints = waypoints;


    const osrmServiceUrl =
      window.OSRM_SERVICE_URL || "https://router.project-osrm.org/route/v1";


    routingControl = L.Routing.control({
      waypoints,
      router: L.Routing.osrmv1({
        serviceUrl: osrmServiceUrl
      }),
      lineOptions: {
        styles: [{ color: "#a855f7", weight: 5, opacity: 0.9 }]
      },
      show: false,
      addWaypoints: false,
      routeWhileDragging: false,
      draggableWaypoints: false
    })
      .on("routesfound", e => {
        const route = e.routes[0];
        ultimaAnaliseRota = route;
        setAlertasTexto(
          `Rota com ${
            route.waypoints.length
          } pontos, distância aproximada ${(route.summary.totalDistance / 1000).toFixed(
            1
          )} km, tempo ${(route.summary.totalTime / 3600).toFixed(1)} h.`
        );


        todosMarkersRota = [];
        pontosPainel.forEach((p, idx) => {
          const marker = criarMarkerNumerado(
            p.lat,
            p.lng,
            idx + 1,
            `${p.label}`,
            { tipo: p.tipo, id: p.id }
          );
          marker.addTo(map);
          todosMarkersRota.push(marker);
        });


        setLinkMapsEnabled(true);
      })
      .on("routingerror", err => {
        const msg = err?.error?.message || "";
        const status = err?.error?.status;


        if (status === -1 && msg.includes("OSRM request timed out")) {
          console.warn(
            "[ROTAS] OSRM demo timeout, mantendo lista e pontos no mapa."
          );
          setAlertasTexto(
            "Serviço de rota externo demorou a responder. Tente novamente em instantes."
          );
          return;
        }


        console.error("[ROTAS] Erro no cálculo de rota:", err);
        setAlertasTexto("Erro ao calcular rota. Verifique os pontos.");
        setLinkMapsEnabled(false);
      })
      .addTo(map);
  } finally {
    hideRotasLoader();
  }
}


// PAINEL ROTA – DRAG/MINIMIZAR
function initPainelRota() {
  const panel = document.getElementById("rota-panel");
  const header = document.getElementById("rota-panel-header");
  const mapContainer = document.getElementById("map-container");
  if (!panel || !header || !mapContainer) return;


  let isDragging = false;
  let startMouseX = 0;
  let startMouseY = 0;
  let startPanelLeft = 0;
  let startPanelTop = 0;


  function onMouseDown(e) {
    if (e.target === rotaPanelMinimize || rotaPanelMinimize.contains(e.target)) {
      return;
    }
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


// RESIZER DA SIDEBAR
function initSidebarResizer() {
  const wrapper = document.getElementById("sidebar-wrapper");
  const resizer = document.getElementById("sidebar-resizer");
  const grid = document.querySelector(".logistica-grid");
  if (!wrapper || !resizer || !grid) return;


  let isResizing = false;
  let startX = 0;
  let startWidth = 0;


  resizer.addEventListener("mousedown", e => {
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
    const newWidth = Math.max(260, Math.min(520, startWidth + dx));
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


// === NOVO: Carregamento manual – sugerir caminhão e montar carga 3D


async function sugerirCaminhaoParaCarga(pesoTotalKg) {
  try {
    const resp = await apiFetch("/caminhoes?ativo=true");
    if (!resp.ok) {
      console.warn("[ROTAS] /caminhoes HTTP", resp.status);
      return null;
    }
    const data = await resp.json();
    const lista = (data || []).filter(c => Number(c.capacidadeKg) > 0);


    if (!lista.length) return null;


    const candidatos = lista.filter(c => Number(c.capacidadeKg) >= pesoTotalKg);


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
    console.error("[ROTAS] Erro ao sugerir caminhão:", e);
    return null;
  }
}


function montarCarga3DManualPorItens(caminhaoSelecionado, pedidosSelecionados) {
  if (!caminhaoSelecionado || !pedidosSelecionados || !pedidosSelecionados.length) {
    return null;
  }


  const comprimentoM = caminhaoSelecionado.comprimentoM || 6;
  const larguraM = caminhaoSelecionado.larguraM || 2.4;
  const alturaM = caminhaoSelecionado.alturaM || 2.4;


  const volumes = [];
  const cores = [0x22c55e, 0x3b82f6, 0xf97316, 0xa855f7, 0x14b8a6];
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


        if (
          profItem > (maxX - minX) ||
          larguraItem > (maxZ - minZ) ||
          alturaItem > (maxY - minY)
        ) {
          continue;
        }


        let colocado = false;
        let tentativasCamada = 0;


        while (!colocado && tentativasCamada < 100) {
          if (!camadas[camadaAtual]) {
            const camadaAnterior = camadas[camadaAtual - 1];
            if (!camadaAnterior) {
              break;
            }
            camadas[camadaAtual] = {
              yBase: camadaAnterior.yBase + camadaAnterior.alturaUsada + margemY,
              alturaUsada: 0
            };
          }


          const camada = camadas[camadaAtual];
          const yBase = camada.yBase;


          if (yBase + alturaItem > maxY) {
            break;
          }


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
            xCentro - halfX < minX ||
            xCentro + halfX > maxX ||
            zCentro - halfZ < minZ ||
            zCentro + halfZ > maxZ ||
            yCentro - halfY < minY ||
            yCentro + halfY > maxY
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
            nunota: nunota,
            codprod: it.codprod,
            descrprod: it.descrprod,
            larguraM: larguraItem,
            alturaM: alturaItem,
            profundidadeM: profItem,
            x: xCentro,
            y: yCentro,
            z: zCentro,
            cor: corBase,
            pesoKg: pesoUnitKg,
            volumeM3: volumeM3 || larguraItem * alturaItem * profItem
          });


          posX = xCentro + halfX + margemX;
          colocado = true;
        }


        if (!colocado) {
          continue;
        }
      }
    });
  });


  return {
    caminhao: {
      id: caminhaoSelecionado.idCaminhao || caminhaoSelecionado.id,
      descricao:
        caminhaoSelecionado.descricao ||
        caminhaoSelecionado.placa ||
        "Caminhão",
      comprimentoM,
      larguraM,
      alturaM
    },
    volumes
  };
}


// EVENTOS INICIAIS
function initEventos() {
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
      grupoVendedoresDiv.style.display = "block";
      if (selectVendedor.value) {
        carregarCarteiraPorVendedor(selectVendedor.value);
      } else {
        renderClientes([]);
      }
    }
  });


  selectVendedor.addEventListener("change", () => {
    if (origemAtual === "carteira") {
      carregarCarteiraPorVendedor(selectVendedor.value);
    }
  });


  filtroNomeInput.addEventListener("input", () => {
    aplicarFiltroLocalClientes();
  });


  btnSelecionarTodos.addEventListener("click", () => {
    marcarTodosVisiveis(true);
  });


  btnLimparSelecao.addEventListener("click", () => {
    marcarTodosVisiveis(false);
  });


  btnOtimizarRota.addEventListener("click", () => {
    otimizarOrdemParadasVizinhoMaisProximo();
  });


  chkVerTransito.addEventListener("change", () => {
    toggleTraffic(chkVerTransito.checked);
    if (chkVerTransito.checked) {
      carregarIncidentesTomTom();
    } else {
      incidentMarkers.forEach(m => map.removeLayer(m));
      incidentMarkers = [];
    }
  });


  btnAdicionarPonto.addEventListener("click", async () => {
    const txt = novoPontoInput.value.trim();
    if (!txt) return;


    let latLngParsed = parseLatLngText(txt);
    let novoPonto = null;


    if (latLngParsed) {
      const lat = normalizarLat(latLngParsed.lat);
      const lng = normalizarLng(latLngParsed.lng);
      if (lat != null && lng != null) {
        novoPonto = {
          tipo: "manual",
          id: "manual_" + manualIdSeq++,
          label: txt,
          endereco: txt,
          lat,
          lng
        };
      }
    } else {
      const geo = await geocodeTexto(txt);
      if (geo && geo.lat != null && geo.lng != null) {
        novoPonto = {
          tipo: "manual",
          id: "manual_" + manualIdSeq++,
          label: geo.label,
          endereco: geo.label,
          lat: geo.lat,
          lng: geo.lng
        };
      }
    }


    if (!novoPonto) {
      alert(
        "Não foi possível interpretar esse ponto. Use 'lat,lng' ou um endereço."
      );
      return;
    }


    pontosManuais.push(novoPonto);
    novoPontoInput.value = "";
    reconstruirPainelRota();
    gerarRotaAuto();
  });


  btnGerarRota.addEventListener("click", () => {
    gerarRotaAuto();
  });


  btnGerarLinkMaps.addEventListener("click", () => {
    gerarLinkGoogleMaps();
  });


  btnGerarLinkMapsSidebar.addEventListener("click", () => {
    gerarLinkGoogleMaps();
  });


  if (btnRealizarCarregamento) {
    btnRealizarCarregamento.addEventListener("click", async () => {
      const pedidosSelecionados = getClientesSelecionados().filter(
        c => c.origemTipo === "pedido"
      );


      if (!pedidosSelecionados.length) {
        alert("Selecione pelo menos um pedido para realizar o carregamento.");
        return;
      }


      let pesoTotal = 0;
      let volumeTotal = 0;


      pedidosSelecionados.forEach(p => {
        const chave = String(p.nunota);
        const agg = cachePedidosItens.get(chave);
        if (agg) {
          pesoTotal += agg.pesoTotalKg || 0;
          volumeTotal += agg.volumeTotalM3 || 0;
        }
      });


      const sugestao = await sugerirCaminhaoParaCarga(pesoTotal);
      if (!sugestao || !sugestao.caminhao) {
        alert("Não foi possível sugerir um caminhão para essa carga.");
        return;
      }


      const cam = sugestao.caminhao;


      if (campoResumoCarga) {
        campoResumoCarga.textContent =
          `Pedidos: ${pedidosSelecionados.length} • Peso total: ${pesoTotal.toFixed(1)} kg • ` +
          `Volume total: ${volumeTotal.toFixed(3)} m³ • Sugerido: ` +
          `${cam.descricao || cam.placa} (${cam.capacidadeKg} kg)`;
      }


      if (selectCaminhaoCarga) {
        selectCaminhaoCarga.innerHTML = "";
        sugestao.listaCaminhoes.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c.idCaminhao;
          opt.textContent = `${c.descricao || c.placa} (${c.capacidadeKg} kg)`;
          if (c.idCaminhao === cam.idCaminhao) opt.selected = true;
          selectCaminhaoCarga.appendChild(opt);
        });
      }


      if (btnMontarCarga3D) {
        btnMontarCarga3D.disabled = false;
      }


      window.__VISYA_CARGA_BASE_MANUAL__ = {
        pedidosSelecionados,
        pesoTotal,
        volumeTotal,
        listaCaminhoes: sugestao.listaCaminhoes,
        caminhaoSugeridoId: cam.idCaminhao
      };
    });
  }


  if (btnMontarCarga3D) {
    btnMontarCarga3D.addEventListener("click", () => {
      const base = window.__VISYA_CARGA_BASE_MANUAL__;
      if (!base) {
        alert("Realize o carregamento primeiro para escolher o caminhão.");
        return;
      }


      const lista = base.listaCaminhoes || [];
      const idEscolhido =
        selectCaminhaoCarga && selectCaminhaoCarga.value
          ? selectCaminhaoCarga.value
          : base.caminhaoSugeridoId;


      const cam =
        lista.find(c => String(c.idCaminhao) === String(idEscolhido)) ||
        lista.find(c => String(c.idCaminhao) === String(base.caminhaoSugeridoId));


      if (!cam) {
        alert("Não foi possível identificar o caminhão selecionado.");
        return;
      }


      const carga = montarCarga3DManualPorItens(cam, base.pedidosSelecionados);
      if (!carga) {
        alert("Não foi possível montar a carga 3D para os itens selecionados.");
        return;
      }


      window.__VISYA_CARGA_ATUAL__ = carga;
      window.open("../rotas/html/viewer3d.html", "_blank");
    });
  }
}


// LINK GOOGLE MAPS
function gerarLinkGoogleMaps() {
  if (!ultimaRotaWaypoints || ultimaRotaWaypoints.length === 0) {
    alert("Nenhuma rota calculada para gerar link.");
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
    const wps = intermediarios.map(p => `${p.lat},${p.lng}`).join("|");
    url += `&waypoints=${encodeURIComponent(wps)}`;
  }
  if (chkEvitarPedagios.checked) {
    url += `&avoid=tolls`;
  }


  linkMapsDiv.textContent = url;
  setLinkMapsEnabled(true);


  try {
    navigator.clipboard.writeText(url);
    const toast = document.getElementById("toast-copiar-link");
    if (toast) {
      toast.style.display = "block";
      requestAnimationFrame(() => {
        toast.classList.add("show");
      });
      setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => {
          toast.style.display = "none";
        }, 200);
      }, 2000);
    }
  } catch (e) {
    console.warn("[ROTAS] Não foi possível copiar automaticamente o link:", e);
  }
}


// INIT
document.addEventListener("DOMContentLoaded", () => {
  initPainelRota();
  initSidebarResizer();
  initEventos();
  configurarInfiniteScrollClientes();
  carregarVendedores();
  carregarPedidosPendentes();
});