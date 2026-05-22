console.log("[CARTEIRA-ANALYTICS] carregado.");

// ================== BASE API ==================

function getApiBaseCarteira() {
  if (typeof window !== "undefined") {
    if (window.APIBASE) return window.APIBASE;
    if (window.API_BASE) return window.API_BASE;
  }
  return "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}

// ================== ESTADO ==================

let dadosBrutos = [];
let dadosView = [];
let linhasRenderizadas = 0;
let sortState = { colIndex: null, dir: "asc" };
let selectedRowIndex = null;
let vendedoresDisponiveis = [];
let vendedoresSelecionados = [];

const loaderOverlay = document.getElementById("loaderOverlay");
let loaderTimerId = null;

// ================== COLUNAS - DEFINIÇÃO ==================

const TODAS_COLUNAS = [
  { key: "CODVEND", grupo: "Vendedor", label: "Cód. Vendedor", padrao: true },
  { key: "NOME_VENDEDOR", grupo: "Vendedor", label: "Nome do Vendedor", padrao: true },

  { key: "CODPARC", grupo: "Cliente", label: "Cód. Cliente", padrao: true },
  { key: "NOME_CLIENTE", grupo: "Cliente", label: "Nome do Cliente", padrao: true },
  { key: "Propriedades", grupo: "Cliente", label: "Propriedades", padrao: true },

  { key: "ParceiroEnderecoCompl", grupo: "Endereço", label: "Complemento", padrao: false },
  { key: "ParceiroEnderecoNumero", grupo: "Endereço", label: "Número", padrao: false },
  { key: "ParceiroLogradouro", grupo: "Endereço", label: "Logradouro", padrao: true },
  { key: "ParceiroBairro", grupo: "Endereço", label: "Bairro", padrao: false },
  { key: "ParceiroCidade", grupo: "Endereço", label: "Cidade", padrao: true },
  { key: "ParceiroCidadeCodigo", grupo: "Endereço", label: "Cód. Cidade", padrao: false },
  { key: "ParceiroUFSigla", grupo: "Endereço", label: "UF", padrao: true },
  { key: "ParceiroCEP", grupo: "Endereço", label: "CEP", padrao: false },

  { key: "QtdeCulturasDistintas", grupo: "Culturas", label: "Qtde Culturas", padrao: true },
  { key: "CulturasResumo", grupo: "Culturas", label: "Culturas / Áreas", padrao: true },
  { key: "CulturasDetalhe", grupo: "Culturas", label: "Detalhe", padrao: true },

  { key: "ParceiroTelefone", grupo: "Contato", label: "Telefone", padrao: true },
  { key: "ParceiroEmail", grupo: "Contato", label: "E-mail", padrao: false },

  { key: "ParceiroLatitude", grupo: "Coordenadas", label: "Latitude", padrao: false },
  { key: "ParceiroLongitude", grupo: "Coordenadas", label: "Longitude", padrao: false },

  { key: "CODEMP", grupo: "Crédito", label: "Cód. Empresa", padrao: false },
  { key: "DTLIM", grupo: "Crédito", label: "Data Limite", padrao: false },
  { key: "LIMCRED", grupo: "Crédito", label: "Limite Crédito", padrao: true },

  { key: "NroUnico", grupo: "Última Venda", label: "Nro. Único", padrao: false },
  { key: "NumeroNota", grupo: "Última Venda", label: "Nº Nota", padrao: false },
  { key: "DataVenda", grupo: "Última Venda", label: "Data Venda", padrao: true },
  { key: "ValorTotalVenda", grupo: "Última Venda", label: "Valor Total", padrao: true },
  { key: "VendedorQueVendeuCodigo", grupo: "Última Venda", label: "Cod Vend Vendeu", padrao: false },
  { key: "VendedorQueVendeuNome", grupo: "Última Venda", label: "Quem Vendeu", padrao: false },
  { key: "CargoVendedorQueVendeu", grupo: "Última Venda", label: "Cargo", padrao: false },

  { key: "IdAtividadeUltima", grupo: "Atividade", label: "ID Atividade", padrao: false },
  { key: "DtLancamentoUltimaAtividade", grupo: "Atividade", label: "Dt. Lançamento", padrao: false },
  { key: "DtInicialUltimaAtividade", grupo: "Atividade", label: "Data Última Visita", padrao: true },
  { key: "AssuntoUltimaAtividade", grupo: "Atividade", label: "Assunto Atividade", padrao: true },
  { key: "ObservacaoUltimaAtividade", grupo: "Atividade", label: "Desc. Atividade", padrao: false },

  { key: "Total_2024", grupo: "LTV", label: "Total 2024", padrao: true },
  { key: "Total_2025", grupo: "LTV", label: "Total 2025", padrao: true },
  { key: "Total_2026", grupo: "LTV", label: "Total 2026", padrao: true },
  { key: "LTV", grupo: "LTV", label: "LTV", padrao: true },
];

// ================== LAYOUT POR USUÁRIO (localStorage) ==================
// Estrutura salva: { visiveis: [...keys], larguras: {key: px}, ordem: [...keys] }
// A chave inclui o e-mail do usuário, isolando preferências por usuário mesmo
// que vários usem o mesmo navegador.

function getLayoutStorageKey() {
  let email = "";
  try {
    const u = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
    email = (u && u.email) ? u.email : "anon";
  } catch (e) {
    email = "anon";
  }
  return "visya-carteira-layout::" + email;
}

let colunasVisiveis = new Set(
  TODAS_COLUNAS.filter((c) => c.padrao).map((c) => c.key)
);
let colunasLarguras = {};         // { key: larguraPx }
let colunasOrdem = TODAS_COLUNAS.map((c) => c.key); // ordem atual das colunas

function ordemPadrao() {
  return TODAS_COLUNAS.map((c) => c.key);
}

function visiveisPadrao() {
  return TODAS_COLUNAS.filter((c) => c.padrao).map((c) => c.key);
}

function carregarLayout() {
  try {
    const raw = localStorage.getItem(getLayoutStorageKey());
    if (!raw) {
      // tenta migrar da chave antiga (só visibilidade)
      const legado = localStorage.getItem("visya-carteira-colunas-visiveis");
      if (legado) {
        const arr = JSON.parse(legado);
        if (Array.isArray(arr) && arr.length) {
          colunasVisiveis = new Set(arr);
        }
      }
      return;
    }
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object") {
      if (Array.isArray(obj.visiveis) && obj.visiveis.length) {
        colunasVisiveis = new Set(obj.visiveis);
      }
      if (obj.larguras && typeof obj.larguras === "object") {
        colunasLarguras = { ...obj.larguras };
      }
      if (Array.isArray(obj.ordem) && obj.ordem.length) {
        // garante que toda key conhecida esteja presente (acrescenta novas no fim)
        const set = new Set(obj.ordem);
        const ordem = obj.ordem.filter((k) => TODAS_COLUNAS.some((c) => c.key === k));
        TODAS_COLUNAS.forEach((c) => {
          if (!set.has(c.key)) ordem.push(c.key);
        });
        colunasOrdem = ordem;
      }
    }
  } catch (e) {
    console.warn("[CARTEIRA] erro ao ler layout:", e);
  }
}

function salvarLayout() {
  try {
    const payload = {
      visiveis: Array.from(colunasVisiveis),
      larguras: colunasLarguras,
      ordem: colunasOrdem,
    };
    localStorage.setItem(getLayoutStorageKey(), JSON.stringify(payload));
  } catch (e) {
    console.warn("[CARTEIRA] erro ao salvar layout:", e);
  }
}

function resetarLayout() {
  colunasVisiveis = new Set(visiveisPadrao());
  colunasLarguras = {};
  colunasOrdem = ordemPadrao();
  salvarLayout();
  reconstruirOrdemDOM();
  aplicarLargurasColunas();
  aplicarVisibilidadeColunas();
  renderizarDropdownColunas();
  mostrarToastCarteira("Layout restaurado ao padrão.");
}

// ================== APLICAR LARGURAS ==================

function aplicarLargurasColunas() {
  const table = document.getElementById("tblCarteira");
  if (!table) return;
  const cols = table.querySelectorAll("colgroup col");
  cols.forEach((col) => {
    const key = col.dataset.colKey;
    if (!key) return;
    if (colunasLarguras[key]) {
      col.style.width = colunasLarguras[key] + "px";
    }
  });
}

// ================== APLICAR ORDEM (reordena DOM conforme colunasOrdem) ==================

function reconstruirOrdemDOM() {
  const table = document.getElementById("tblCarteira");
  if (!table) return;

  const colgroup = table.querySelector("colgroup");
  const headRow = table.querySelector("thead tr");
  if (!colgroup || !headRow) return;

  // mapeia key -> elementos atuais
  const colByKey = {};
  colgroup.querySelectorAll("col").forEach((col) => {
    if (col.dataset.colKey) colByKey[col.dataset.colKey] = col;
  });
  const thByKey = {};
  headRow.querySelectorAll("th").forEach((th) => {
    if (th.dataset.col) thByKey[th.dataset.col] = th;
  });

  // reanexa na ordem desejada
  colunasOrdem.forEach((key) => {
    if (colByKey[key]) colgroup.appendChild(colByKey[key]);
    if (thByKey[key]) headRow.appendChild(thByKey[key]);
  });

  // reordena também as células de cada linha do corpo já renderizado
  const idxByKey = {};
  colunasOrdem.forEach((key, i) => { idxByKey[key] = i; });

  // como as linhas são montadas na ordem fixa de add(), elas estão na ordem
  // ORIGINAL do array TODAS_COLUNAS; precisamos reordenar para colunasOrdem.
  // Construímos um mapa de "posição original" -> key:
  const ordemOriginal = TODAS_COLUNAS.map((c) => c.key);

  table.querySelectorAll("tbody tr").forEach((tr) => {
    const tds = Array.from(tr.children);
    if (tds.length !== ordemOriginal.length) return; // linha de empty-state etc.
    // cria fragmento na nova ordem
    const frag = document.createDocumentFragment();
    colunasOrdem.forEach((key) => {
      const origIdx = ordemOriginal.indexOf(key);
      if (origIdx >= 0 && tds[origIdx]) frag.appendChild(tds[origIdx]);
    });
    tr.appendChild(frag);
  });
}

// ================== APLICAR VISIBILIDADE ==================

function aplicarVisibilidadeColunas() {
  const table = document.getElementById("tblCarteira");
  if (!table) return;

  const cols = table.querySelectorAll("colgroup col");
  const ths = table.querySelectorAll("thead th");

  cols.forEach((col) => {
    const key = col.dataset.colKey;
    if (!key) return;
    col.classList.toggle("col-hidden", !colunasVisiveis.has(key));
  });

  ths.forEach((th) => {
    const key = th.dataset.col;
    if (!key) return;
    th.classList.toggle("col-hidden", !colunasVisiveis.has(key));
  });

  // para cada linha, esconde a célula cuja coluna (na posição visual atual)
  // está oculta. Como col e td estão na MESMA ordem visual após
  // reconstruirOrdemDOM, basta casar por índice.
  const colKeysVisualOrder = Array.from(cols).map((c) => c.dataset.colKey);

  table.querySelectorAll("tbody tr").forEach((tr) => {
    const tds = tr.querySelectorAll("td");
    tds.forEach((td, idx) => {
      const key = colKeysVisualOrder[idx];
      if (!key) return;
      td.classList.toggle("col-hidden", !colunasVisiveis.has(key));
    });
  });
}

// ================== DROPDOWN COLUNAS ==================

function renderizarDropdownColunas() {
  const list = document.getElementById("colunasDropdownList");
  if (!list) return;

  const grupos = {};
  TODAS_COLUNAS.forEach((c) => {
    if (!grupos[c.grupo]) grupos[c.grupo] = [];
    grupos[c.grupo].push(c);
  });

  list.innerHTML = "";

  Object.keys(grupos).forEach((grupo) => {
    const wrap = document.createElement("div");
    wrap.className = "colunas-dropdown-group";

    const titulo = document.createElement("div");
    titulo.className = "colunas-dropdown-group-title";
    titulo.textContent = grupo;
    wrap.appendChild(titulo);

    grupos[grupo].forEach((coluna) => {
      const label = document.createElement("label");
      label.className = "colunas-dropdown-opcao";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = colunasVisiveis.has(coluna.key);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          colunasVisiveis.add(coluna.key);
        } else {
          colunasVisiveis.delete(coluna.key);
        }
        salvarLayout();
        aplicarVisibilidadeColunas();
      });

      const texto = document.createElement("span");
      texto.textContent = coluna.label;

      label.appendChild(checkbox);
      label.appendChild(texto);
      wrap.appendChild(label);
    });

    list.appendChild(wrap);
  });
}

function abrirDropdownColunas() {
  const btn = document.getElementById("btnColunas");
  const dropdown = document.getElementById("colunasDropdown");
  if (!btn || !dropdown) return;
  dropdown.hidden = false;
  btn.setAttribute("aria-expanded", "true");
  renderizarDropdownColunas();
}

function fecharDropdownColunas() {
  const btn = document.getElementById("btnColunas");
  const dropdown = document.getElementById("colunasDropdown");
  if (!btn || !dropdown) return;
  dropdown.hidden = true;
  btn.setAttribute("aria-expanded", "false");
}

function initColunasDropdown() {
  const btn = document.getElementById("btnColunas");
  const dropdown = document.getElementById("colunasDropdown");
  const wrap = document.getElementById("colunasWrap");
  const btnTodas = document.getElementById("btnColunasTodas");
  const btnPadrao = document.getElementById("btnColunasPadrao");
  const btnNenhuma = document.getElementById("btnColunasNenhuma");

  if (!btn || !dropdown || !wrap) return;

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dropdown.hidden) {
      abrirDropdownColunas();
    } else {
      fecharDropdownColunas();
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (dropdown.hidden) return;
    if (wrap.contains(e.target)) return;
    fecharDropdownColunas();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !dropdown.hidden) {
      fecharDropdownColunas();
    }
  });

  if (btnTodas) {
    btnTodas.addEventListener("click", () => {
      colunasVisiveis = new Set(TODAS_COLUNAS.map((c) => c.key));
      salvarLayout();
      aplicarVisibilidadeColunas();
      renderizarDropdownColunas();
    });
  }

  if (btnPadrao) {
    btnPadrao.addEventListener("click", () => {
      colunasVisiveis = new Set(visiveisPadrao());
      salvarLayout();
      aplicarVisibilidadeColunas();
      renderizarDropdownColunas();
    });
  }

  if (btnNenhuma) {
    btnNenhuma.addEventListener("click", () => {
      colunasVisiveis = new Set(["CODPARC", "NOME_CLIENTE"]);
      salvarLayout();
      aplicarVisibilidadeColunas();
      renderizarDropdownColunas();
    });
  }
}

// ================== TOAST ==================

function mostrarToastCarteira(msg) {
  const toast = document.getElementById("toastCarteira");
  const span = document.getElementById("toastCarteiraMsg");
  if (!toast || !span) return;
  span.textContent = msg;
  toast.classList.add("toast-ano-visible");
  toast.setAttribute("aria-hidden", "false");
  setTimeout(() => {
    toast.classList.remove("toast-ano-visible");
    toast.setAttribute("aria-hidden", "true");
  }, 3500);
}

// ================== LOADER ==================

function setLoadingCarteira(ativo) {
  if (!loaderOverlay) return;

  if (ativo) {
    if (loaderTimerId !== null) clearTimeout(loaderTimerId);
    loaderTimerId = setTimeout(() => {
      loaderOverlay.style.display = "flex";
    }, 50);
  } else {
    if (loaderTimerId !== null) {
      clearTimeout(loaderTimerId);
      loaderTimerId = null;
    }
    loaderOverlay.style.display = "none";
  }
}

// ================== HELPERS ==================

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function getUsuarioObrigatorioCarteira() {
  const user =
    typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  if (!user || !user.email) {
    window.location.href = "/index.html";
    return null;
  }
  return user;
}

function getAuthHeadersCarteira() {
  const user = getUsuarioObrigatorioCarteira();
  if (!user) return { "Content-Type": "application/json" };

  let headers;

  if (typeof getAuthHeadersCalendario === "function") {
    headers = getAuthHeadersCalendario();
  } else {
    headers = { "Content-Type": "application/json" };
    try {
      const token =
        (window.sessionStorage && sessionStorage.getItem("authToken")) || null;
      if (token) headers["Authorization"] = "Bearer " + token;
    } catch (e) {
      console.warn("[CARTEIRA][getAuthHeadersCarteira] Erro token:", e);
    }
  }

  headers["x-usuario-email"] = user.email;
  return headers;
}

function normalizarTextoCarteira(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

// ================== API ==================

async function apiGetCarteira(page = 1, pageSize = 1000) {
  const base = getApiBaseCarteira();
  const qsFiltros = getFiltrosCarteiraQS();
  const url = `${base}/carteira-analytics?page=${page}&pageSize=${pageSize}${qsFiltros}`;
  console.log("[CARTEIRA][GET] URL:", url);

  const resp = await fetch(url, {
    method: "GET",
    headers: getAuthHeadersCarteira(),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error("[CARTEIRA][GET] HTTP != 200:", resp.status, txt);
    throw new Error("Erro HTTP " + resp.status);
  }

  const json = await resp.json();
  console.log("[CARTEIRA][GET] JSON:", json);
  return json;
}

async function apiGetVendedores(nome = "") {
  const base = getApiBaseCarteira();
  const p = new URLSearchParams();
  if (nome && nome.trim()) {
    p.append("nome", nome.trim());
  }
  const qs = p.toString();
  const url = `${base}/vendedores${qs ? "?" + qs : ""}`;
  console.log("[CARTEIRA][VENDEDORES][GET] URL:", url);

  const resp = await fetch(url, {
    method: "GET",
    headers: getAuthHeadersCarteira(),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    console.error("[CARTEIRA][VENDEDORES][GET] HTTP != 200:", resp.status, txt);
    throw new Error("Erro HTTP " + resp.status + " ao buscar vendedores");
  }

  const json = await resp.json();
  console.log("[CARTEIRA][VENDEDORES][GET] JSON:", json);
  return json;
}

async function apiGetCarteiraTodasPaginas(pageSize = 1000, onProgress) {
  const primeira = await apiGetCarteira(1, pageSize);
  const totalPages = primeira?.pagination?.totalPages || 1;
  const totalCount = primeira?.pagination?.totalCount || 0;

  let registros = Array.isArray(primeira?.carteiraAnalytics)
    ? primeira.carteiraAnalytics.slice()
    : [];

  if (typeof onProgress === "function") {
    onProgress(1, totalPages, registros.length, totalCount);
  }

  for (let page = 2; page <= totalPages; page++) {
    const json = await apiGetCarteira(page, pageSize);
    const arr = Array.isArray(json?.carteiraAnalytics)
      ? json.carteiraAnalytics
      : [];
    registros = registros.concat(arr);
    if (typeof onProgress === "function") {
      onProgress(page, totalPages, registros.length, totalCount);
    }
  }

  return { registros, totalCount, totalPages };
}

// ================== FORMATADORES ==================

function fmtValor(v) {
  if (v == null || v === "") return "-";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtDataIso(d) {
  if (!d) return "-";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function fmtTextOrDash(v) {
  if (v == null || v === "") return "-";
  return String(v);
}

function trunc40(value) {
  if (value == null || value === "") return "-";
  const str = String(value);
  if (str.length <= 40) return str;
  return str.slice(0, 37) + "...";
}

function montarResumoCulturas(row) {
  const arr = Array.isArray(row?.culturas) ? row.culturas : [];
  if (!arr.length) return "-";

  const partes = arr.map((c) => {
    const nome = c.NOME_CULTURA || "CULTURA";
    const area = c.AREA_PLANTADA;
    let areaStr = "";
    if (area != null && area !== "") {
      const n = Number(area);
      areaStr = Number.isNaN(n)
        ? String(area)
        : n.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
    }
    return areaStr ? `${nome} (${areaStr} ha)` : nome;
  });

  return partes.join("; ");
}

// ================== SELECT VENDEDORES ==================

function mapearVendedoresApi(lista) {
  const mapa = new Map();

  (lista || []).forEach((item) => {
    const codigoRaw = item?.codvend;
    const nomeRaw = item?.nome_vendedor;

    if (codigoRaw == null && !nomeRaw) return;

    const codigo = codigoRaw == null || codigoRaw === "" ? "" : String(codigoRaw);
    const nome = String(nomeRaw || "").trim();
    const qtdeClientes =
      item?.qtde_clientes == null || item?.qtde_clientes === ""
        ? null
        : Number(item.qtde_clientes);

    const key = `${codigo}||${normalizarTextoCarteira(nome)}`;

    if (!mapa.has(key)) {
      mapa.set(key, {
        codigo,
        nome,
        qtde_clientes: Number.isNaN(qtdeClientes) ? null : qtdeClientes,
      });
    }
  });

  return Array.from(mapa.values()).sort((a, b) => {
    const na = normalizarTextoCarteira(a.nome);
    const nb = normalizarTextoCarteira(b.nome);
    if (na < nb) return -1;
    if (na > nb) return 1;
    const ca = Number(a.codigo);
    const cb = Number(b.codigo);
    if (!Number.isNaN(ca) && !Number.isNaN(cb)) return ca - cb;
    return String(a.codigo).localeCompare(String(b.codigo), "pt-BR");
  });
}

async function carregarVendedoresDisponiveis(nome = "") {
  try {
    const json = await apiGetVendedores(nome);
    vendedoresDisponiveis = mapearVendedoresApi(json?.vendedores || []);
    sincronizarVendedoresSelecionadosComDados();
  } catch (e) {
    console.error("[CARTEIRA][VENDEDORES] Erro:", e);
    mostrarToastCarteira("Erro ao carregar lista de vendedores.");
  }
}

function getMultiVendedorSelecionados() {
  return vendedoresDisponiveis.filter((v) =>
    vendedoresSelecionados.includes(v.codigo || v.nome)
  );
}

function atualizarTextoMultiVendedor() {
  const textoEl = document.getElementById("multiVendedorTexto");
  if (!textoEl) return;

  const selecionados = getMultiVendedorSelecionados();

  if (!selecionados.length) {
    textoEl.className = "multiselect-vendedor-placeholder";
    textoEl.textContent = "selecione um vendedor";
    return;
  }

  const wrapper = document.createElement("span");
  wrapper.className = "multiselect-vendedor-tags";

  const v = selecionados[0];
  const tag = document.createElement("span");
  tag.className = "multiselect-vendedor-tag";

  const text = document.createElement("span");
  text.className = "multiselect-vendedor-tag-text";
  text.textContent = v.nome || `Cód. ${v.codigo}`;

  tag.appendChild(text);
  wrapper.appendChild(tag);

  textoEl.className = "";
  textoEl.innerHTML = "";
  textoEl.appendChild(wrapper);
}

function renderizarListaVendedores() {
  const lista = document.getElementById("multiVendedorLista");
  const busca = document.getElementById("fVendedorNomeCartBusca");
  if (!lista) return;

  const termo = normalizarTextoCarteira(busca?.value || "");
  lista.innerHTML = "";

  const filtrados = vendedoresDisponiveis.filter((v) => {
    if (!termo) return true;
    return (
      normalizarTextoCarteira(v.nome).includes(termo) ||
      normalizarTextoCarteira(v.codigo).includes(termo)
    );
  });

  if (!filtrados.length) {
    const vazio = document.createElement("div");
    vazio.className = "multiselect-vendedor-vazio";
    vazio.textContent = "Nenhum vendedor encontrado.";
    lista.appendChild(vazio);
    return;
  }

  filtrados.forEach((vendedor) => {
    const key = vendedor.codigo || vendedor.nome;
    const label = document.createElement("label");
    label.className = "multiselect-vendedor-opcao";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = key;
    checkbox.checked = vendedoresSelecionados.includes(key);

    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        vendedoresSelecionados = [key];

        lista.querySelectorAll('input[type="checkbox"]').forEach((other) => {
          other.checked = other.value === key;
        });
      } else {
        vendedoresSelecionados = [];
      }

      atualizarTextoMultiVendedor();
    });

    const texto = document.createElement("span");
    texto.className = "multiselect-vendedor-opcao-texto";

    const nome = document.createElement("span");
    nome.className = "multiselect-vendedor-opcao-nome";
    nome.textContent = vendedor.nome || "-";

    const codigo = document.createElement("span");
    codigo.className = "multiselect-vendedor-opcao-codigo";

    const partesCodigo = [];
    if (vendedor.codigo) partesCodigo.push(`Cód. ${vendedor.codigo}`);
    codigo.textContent = partesCodigo.join(" • ") || "Sem código";

    texto.appendChild(nome);
    texto.appendChild(codigo);

    label.appendChild(checkbox);
    label.appendChild(texto);
    lista.appendChild(label);
  });
}

async function abrirMultiVendedor() {
  const root = document.getElementById("multiVendedorCart");
  const dropdown = document.getElementById("multiVendedorDropdown");
  const trigger = document.getElementById("multiVendedorTrigger");
  const busca = document.getElementById("fVendedorNomeCartBusca");
  if (!root || !dropdown || !trigger) return;

  root.classList.add("is-open");
  dropdown.hidden = false;
  trigger.setAttribute("aria-expanded", "true");

  if (!vendedoresDisponiveis.length) {
    await carregarVendedoresDisponiveis(busca?.value || "");
  }

  renderizarListaVendedores();

  setTimeout(() => {
    if (busca) busca.focus();
  }, 0);
}

function fecharMultiVendedor() {
  const root = document.getElementById("multiVendedorCart");
  const dropdown = document.getElementById("multiVendedorDropdown");
  const trigger = document.getElementById("multiVendedorTrigger");
  if (!root || !dropdown || !trigger) return;

  root.classList.remove("is-open");
  dropdown.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
}

function toggleMultiVendedor() {
  const dropdown = document.getElementById("multiVendedorDropdown");
  if (!dropdown) return;
  if (dropdown.hidden) abrirMultiVendedor();
  else fecharMultiVendedor();
}

function sincronizarVendedoresSelecionadosComDados() {
  const chavesValidas = new Set(
    vendedoresDisponiveis.map((v) => v.codigo || v.nome)
  );

  vendedoresSelecionados = vendedoresSelecionados.filter((v) =>
    chavesValidas.has(v)
  );

  if (vendedoresSelecionados.length > 1) {
    vendedoresSelecionados = [vendedoresSelecionados[0]];
  }

  atualizarTextoMultiVendedor();
  renderizarListaVendedores();
}

function initMultiSelectVendedor() {
  const root = document.getElementById("multiVendedorCart");
  const trigger = document.getElementById("multiVendedorTrigger");
  const busca = document.getElementById("fVendedorNomeCartBusca");
  const btnTodos = document.getElementById("btnSelecionarTodosVendedores");
  const btnLimpar = document.getElementById("btnLimparVendedores");

  if (!root || !trigger) return;

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMultiVendedor();
  });

  if (busca) {
    const debouncedBuscarVendedores = debounce(async () => {
      await carregarVendedoresDisponiveis(busca.value || "");
      renderizarListaVendedores();
    }, 350);

    busca.addEventListener("input", () => {
      debouncedBuscarVendedores();
    });

    busca.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        fecharMultiVendedor();
        trigger.focus();
      }
    });
  }

  if (btnTodos) {
    btnTodos.addEventListener("click", () => {
      const buscaEl = document.getElementById("fVendedorNomeCartBusca");
      const termo = normalizarTextoCarteira(buscaEl?.value || "");

      const visiveis = vendedoresDisponiveis.filter((v) => {
        if (!termo) return true;
        return (
          normalizarTextoCarteira(v.nome).includes(termo) ||
          normalizarTextoCarteira(v.codigo).includes(termo)
        );
      });

      if (visiveis.length) {
        const primeiro = visiveis[0];
        vendedoresSelecionados = [primeiro.codigo || primeiro.nome];
      } else {
        vendedoresSelecionados = [];
      }

      atualizarTextoMultiVendedor();
      renderizarListaVendedores();
    });
  }

  if (btnLimpar) {
    btnLimpar.addEventListener("click", () => {
      vendedoresSelecionados = [];
      atualizarTextoMultiVendedor();
      renderizarListaVendedores();
    });
  }

  document.addEventListener("click", (e) => {
    if (!root.contains(e.target)) {
      fecharMultiVendedor();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fecharMultiVendedor();
    }
  });

  atualizarTextoMultiVendedor();
  renderizarListaVendedores();
}

// ================== FILTROS ==================

function getFiltrosCarteiraQS() {
  const codvend = (document.getElementById("fVendedorCart")?.value || "").trim();
  const codparc = (document.getElementById("fClienteCart")?.value || "").trim();
  const cliente =
    (document.getElementById("fClienteNomeCart")?.value || "").trim();
  const cidade = (document.getElementById("fCidadeCart")?.value || "").trim();
  const cultura = (document.getElementById("fCulturaCart")?.value || "").trim();

  const p = new URLSearchParams();
  if (codvend) {
    p.append("codvend", codvend);
  } else {
    const vendedoresSelecionadosObjs = getMultiVendedorSelecionados();
    if (vendedoresSelecionadosObjs.length === 1) {
      const vend = vendedoresSelecionadosObjs[0];
      if (vend.codigo) {
        p.append("codvend", String(vend.codigo).trim());
      } else if (vend.nome) {
        p.append("vendedor", vend.nome.trim());
      }
    }
  }

  if (codparc) p.append("codparc", codparc);
  if (cliente) p.append("cliente", cliente);
  if (cidade) p.append("cidade", cidade);
  if (cultura) p.append("cultura", cultura);

  const s = p.toString();
  return s ? "&" + s : "";
}

function limparFiltrosCarteira() {
  [
    "fVendedorCart",
    "fClienteCart",
    "fClienteNomeCart",
    "fCidadeCart",
    "fCulturaCart",
    "fBuscaGeral",
    "fVendedorNomeCartBusca",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });

  vendedoresSelecionados = [];
  atualizarTextoMultiVendedor();
  carregarVendedoresDisponiveis();
}

// ================== CARGA / VIEW ==================

async function carregarCarteira() {
  const { carteiraAnalytics, pagination } = await apiGetCarteira(1, 1000);
  dadosBrutos = carteiraAnalytics || [];

  const info = document.getElementById("infoQtdeRegistros");
  if (info) {
    const total = pagination?.totalCount ?? dadosBrutos.length;
    info.textContent = `${total.toLocaleString("pt-BR")} clientes`;
  }

  selectedRowIndex = null;
  construirView();
}

function construirView() {
  const texto =
    (document.getElementById("fBuscaGeral")?.value || "").trim().toUpperCase();

  const filtrado = dadosBrutos.filter((reg) => {
    const selecionados = getMultiVendedorSelecionados();

    if (selecionados.length) {
      const nomeReg = normalizarTextoCarteira(reg?.NOME_VENDEDOR);
      const codReg = String(reg?.CODVEND ?? "").trim();

      const bateVendedor = selecionados.some((v) => {
        const nomeVend = normalizarTextoCarteira(v.nome);
        const codVend = String(v.codigo ?? "").trim();
        return (nomeVend && nomeVend === nomeReg) || (codVend && codVend === codReg);
      });

      if (!bateVendedor) return false;
    }

    if (!texto) return true;
    for (const v of Object.values(reg || {})) {
      if (v == null) continue;
      if (String(v).toUpperCase().includes(texto)) return true;
    }
    return false;
  });

  let ordenado = filtrado;
  if (sortState.colIndex !== null) {
    const ths = document.querySelectorAll("#tblCarteira thead th");
    const th = ths[sortState.colIndex];
    const field = th ? th.dataset.col : null;
    const dir = sortState.dir === "asc" ? 1 : -1;

    if (field) {
      ordenado = filtrado.slice().sort((a, b) => {
        const va = a[field];
        const vb = b[field];

        const na = Number(va);
        const nb = Number(vb);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) {
          if (na < nb) return -1 * dir;
          if (na > nb) return 1 * dir;
          return 0;
        }

        const da = new Date(va);
        const db = new Date(vb);
        if (!Number.isNaN(da.getTime()) && !Number.isNaN(db.getTime())) {
          if (da < db) return -1 * dir;
          if (da > db) return 1 * dir;
          return 0;
        }

        const sa = (va ?? "").toString().toUpperCase();
        const sb = (vb ?? "").toString().toUpperCase();
        if (sa < sb) return -1 * dir;
        if (sa > sb) return 1 * dir;
        return 0;
      });
    }
  }

  dadosView = ordenado.map((reg) => {
    const clone = { ...reg };
    clone.CulturasResumo = montarResumoCulturas(clone);
    return clone;
  });

  redesenharTabelaComLazy();
}

// ================== RENDER / LAZY ==================

function redesenharTabelaComLazy() {
  const tbody = document.getElementById("tbodyCarteira");
  if (!tbody) return;

  if (!dadosView.length) {
    tbody.innerHTML = `
      <tr class="empty-state-row">
        <td colspan="50" class="empty-state">
          Nenhum dado para os filtros atuais.
        </td>
      </tr>
    `;
    linhasRenderizadas = 0;
    return;
  }

  tbody.innerHTML = "";
  linhasRenderizadas = 0;
  renderizarMaisLinhas(15);
}

function renderizarMaisLinhas(qtd) {
  const tbody = document.getElementById("tbodyCarteira");
  if (!tbody) return;

  const inicio = linhasRenderizadas;
  const fim = Math.min(inicio + qtd, dadosView.length);
  if (inicio >= fim) return;

  for (let i = inicio; i < fim; i++) {
    const c = dadosView[i];
    const tr = document.createElement("tr");
    tr.dataset.viewIndex = String(i);

    function add(field, formatter) {
      const td = document.createElement("td");
      let raw = c[field];

      if (formatter === fmtValor || formatter === fmtDataIso) {
        raw = formatter(raw);
      } else if (formatter) {
        raw = formatter(raw);
      } else {
        raw = fmtTextOrDash(raw);
      }

      const full = raw == null ? "" : String(raw);
      // mostra o texto completo; o CSS (text-overflow: ellipsis) corta
      // visualmente conforme a largura da coluna, e o usuário pode
      // redimensionar a coluna para ver mais. O title mantém o texto
      // completo no tooltip ao passar o mouse.
      td.textContent = full;
      td.title = full === "-" ? "" : full;
      tr.appendChild(td);
    }

    add("CODVEND");
    add("NOME_VENDEDOR");

    add("CODPARC");
    add("NOME_CLIENTE");

    const tdProp = document.createElement("td");
    tdProp.className = "td-propriedades";
    const propsArr = Array.isArray(c.propriedades) ? c.propriedades : [];
    const qtdeProp = propsArr.length || (c.QtdePropriedades || 0);
    if (qtdeProp > 1) {
      const btnProp = document.createElement("button");
      btnProp.type = "button";
      btnProp.className = "btn-propriedades";
      btnProp.textContent = `Ver (${qtdeProp})`;
      btnProp.title = "Ver propriedades";
      btnProp.addEventListener("click", (ev) => {
        ev.stopPropagation();
        abrirModalPropriedades(c);
      });
      tdProp.appendChild(btnProp);
    } else {
      tdProp.textContent = qtdeProp === 1 ? "1" : "-";
    }
    tr.appendChild(tdProp);

    add("ParceiroEnderecoCompl");
    add("ParceiroEnderecoNumero");
    add("ParceiroLogradouro");
    add("ParceiroBairro");
    add("ParceiroCidade");
    add("ParceiroCidadeCodigo");
    add("ParceiroUFSigla");
    add("ParceiroCEP");

    add("QtdeCulturasDistintas");
    add("CulturasResumo");

    const tdDet = document.createElement("td");
    tdDet.className = "td-culturas-detalhe";
    if (Array.isArray(c.culturas) && c.culturas.length) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn-culturas";
      btn.textContent = "Ver";
      btn.title = "Ver culturas";
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        abrirModalCulturas(c);
      });
      tdDet.appendChild(btn);
    } else {
      tdDet.textContent = "-";
    }
    tr.appendChild(tdDet);

    add("ParceiroTelefone");
    add("ParceiroEmail");

    add("ParceiroLatitude");
    add("ParceiroLongitude");

    add("CODEMP");
    add("DTLIM", fmtDataIso);
    add("LIMCRED", fmtValor);

    add("NroUnico");
    add("NumeroNota");
    add("DataVenda", fmtDataIso);
    add("ValorTotalVenda", fmtValor);
    add("VendedorQueVendeuCodigo");
    add("VendedorQueVendeuNome");
    add("CargoVendedorQueVendeu");

    add("IdAtividadeUltima");
    add("DtLancamentoUltimaAtividade", fmtDataIso);
    add("DtInicialUltimaAtividade", fmtDataIso);
    add("AssuntoUltimaAtividade");
    add("ObservacaoUltimaAtividade");

    add("Total_2024", fmtValor);
    add("Total_2025", fmtValor);
    add("Total_2026", fmtValor);

    add("LTV", fmtValor);

    if (selectedRowIndex !== null && selectedRowIndex === i) {
      tr.classList.add("row-selected");
      tr.setAttribute("aria-selected", "true");
    }

    tbody.appendChild(tr);
  }

  linhasRenderizadas = fim;

  // aplica ordem visual, larguras e visibilidade nas linhas recém-criadas
  reordenarLinhasNovas();
  aplicarVisibilidadeColunas();
}

// reordena as células das linhas conforme colunasOrdem (usado após render lazy)
function reordenarLinhasNovas() {
  const table = document.getElementById("tblCarteira");
  if (!table) return;
  const ordemOriginal = TODAS_COLUNAS.map((c) => c.key);

  // se a ordem atual == ordem original, não precisa reordenar
  let igual = colunasOrdem.length === ordemOriginal.length;
  if (igual) {
    for (let i = 0; i < colunasOrdem.length; i++) {
      if (colunasOrdem[i] !== ordemOriginal[i]) { igual = false; break; }
    }
  }
  if (igual) return;

  table.querySelectorAll("tbody tr").forEach((tr) => {
    const tds = Array.from(tr.children);
    if (tds.length !== ordemOriginal.length) return;
    const frag = document.createDocumentFragment();
    colunasOrdem.forEach((key) => {
      const origIdx = ordemOriginal.indexOf(key);
      if (origIdx >= 0 && tds[origIdx]) frag.appendChild(tds[origIdx]);
    });
    tr.appendChild(frag);
  });
}

// ================== MODAL CULTURAS ==================

function abrirModalCulturas(rowData) {
  const modal = document.getElementById("culturasModal");
  const body = document.getElementById("culturasModalBody");
  const sub = document.getElementById("culturasModalSub");
  if (!modal || !body) return;

  body.innerHTML = "";
  const arr = Array.isArray(rowData.culturas) ? rowData.culturas : [];

  const nomeCliente = rowData.NOME_CLIENTE || rowData.ParceiroNome || "";
  const codparc =
    rowData.CODPARC != null ? rowData.CODPARC : rowData.ParceiroCodigo;
  if (sub) {
    sub.textContent = nomeCliente ? `${codparc || ""} - ${nomeCliente}` : "";
  }

  if (!arr.length) {
    const p = document.createElement("p");
    p.textContent = "Nenhuma cultura cadastrada para este cliente.";
    p.style.fontSize = "12px";
    p.style.color = "var(--text-3)";
    body.appendChild(p);
  } else {
    arr.forEach((cultura, idx) => {
      const card = document.createElement("div");
      card.className = "cultura-card";

      const titulo = document.createElement("div");
      titulo.className = "cultura-titulo";
      titulo.textContent =
        idx + 1 + " - " + (cultura.NOME_CULTURA || "CULTURA");

      const linhas = [];

      if (cultura.AREA_PLANTADA != null) {
        const n = Number(cultura.AREA_PLANTADA);
        const areaStr = Number.isNaN(n)
          ? String(cultura.AREA_PLANTADA)
          : n.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            });
        linhas.push("Área: " + areaStr + " ha");
      }

      if (cultura.CODPARC != null) {
        linhas.push("CODPARC: " + cultura.CODPARC);
      }
      if (cultura.COD_CULTURA != null) {
        linhas.push("Cód. cultura: " + cultura.COD_CULTURA);
      }
      if (cultura.CODAREA != null) {
        linhas.push("Área código: " + cultura.CODAREA);
      }
      if (cultura.IRRIGACAO) {
        linhas.push("Irrigação: " + cultura.IRRIGACAO);
      }
      if (cultura.LATITUDE && cultura.LONGITUDE) {
        linhas.push("Coord.: " + cultura.LATITUDE + ", " + cultura.LONGITUDE);
      }

      const ul = document.createElement("ul");
      ul.className = "cultura-lista";
      linhas.forEach((txt) => {
        const li = document.createElement("li");
        li.textContent = txt;
        ul.appendChild(li);
      });

      card.appendChild(titulo);
      card.appendChild(ul);
      body.appendChild(card);
    });
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function fecharModalCulturas() {
  const modal = document.getElementById("culturasModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

// ================== MODAL PROPRIEDADES ==================

function abrirModalPropriedades(rowData) {
  const modal = document.getElementById("propriedadesModal");
  const body = document.getElementById("propriedadesModalBody");
  const sub = document.getElementById("propriedadesModalSub");
  if (!modal || !body) return;

  body.innerHTML = "";
  const arr = Array.isArray(rowData.propriedades) ? rowData.propriedades : [];

  const nomeCliente = rowData.NOME_CLIENTE || rowData.ParceiroNome || "";
  if (sub) {
    sub.textContent = nomeCliente
      ? `${nomeCliente} • ${arr.length} propriedade(s)`
      : `${arr.length} propriedade(s)`;
  }

  if (!arr.length) {
    const p = document.createElement("p");
    p.textContent = "Nenhuma propriedade adicional para este cliente.";
    p.style.fontSize = "12px";
    p.style.color = "var(--text-3)";
    body.appendChild(p);
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    return;
  }

  const culturasPorCodparc = {};
  if (Array.isArray(rowData.culturas)) {
    rowData.culturas.forEach((c) => {
      const k = c.CODPARC;
      if (k == null) return;
      if (!culturasPorCodparc[k]) culturasPorCodparc[k] = [];
      culturasPorCodparc[k].push(c);
    });
  }

  arr.forEach((prop, idx) => {
    const card = document.createElement("div");
    card.className = "propriedade-card";

    const titulo = document.createElement("div");
    titulo.className = "propriedade-titulo";
    const ehPrincipal =
      prop.CODPARC != null && prop.CODPARC === rowData.CODPARC;
    titulo.textContent =
      idx + 1 +
      " - CODPARC " + (prop.CODPARC ?? "-") +
      (ehPrincipal ? " (principal)" : "");

    const linhas = [];

    const enderecoPartes = [];
    if (prop.ParceiroLogradouro) enderecoPartes.push(prop.ParceiroLogradouro);
    if (prop.ParceiroEnderecoNumero)
      enderecoPartes.push("Nº " + prop.ParceiroEnderecoNumero);
    if (prop.ParceiroEnderecoCompl)
      enderecoPartes.push(prop.ParceiroEnderecoCompl);
    if (enderecoPartes.length)
      linhas.push("Endereço: " + enderecoPartes.join(", "));

    if (prop.ParceiroBairro) linhas.push("Bairro: " + prop.ParceiroBairro);
    if (prop.ParceiroCidade || prop.ParceiroUFSigla) {
      linhas.push(
        "Cidade/UF: " +
          (prop.ParceiroCidade || "-") +
          "/" +
          (prop.ParceiroUFSigla || "-")
      );
    }
    if (prop.ParceiroCEP) linhas.push("CEP: " + prop.ParceiroCEP);
    if (prop.ParceiroTelefone) linhas.push("Tel: " + prop.ParceiroTelefone);
    if (prop.ParceiroEmail) linhas.push("E-mail: " + prop.ParceiroEmail);
    if (prop.ParceiroLatitude && prop.ParceiroLongitude) {
      linhas.push(
        "Coord.: " + prop.ParceiroLatitude + ", " + prop.ParceiroLongitude
      );
    }

    const ul = document.createElement("ul");
    ul.className = "propriedade-lista";
    linhas.forEach((txt) => {
      const li = document.createElement("li");
      li.textContent = txt;
      ul.appendChild(li);
    });

    card.appendChild(titulo);
    card.appendChild(ul);

    const culturasDessaProp = culturasPorCodparc[prop.CODPARC] || [];
    if (culturasDessaProp.length) {
      const wrap = document.createElement("div");
      wrap.className = "propriedade-culturas";

      const tituloC = document.createElement("div");
      tituloC.className = "propriedade-culturas-titulo";
      tituloC.textContent = "Culturas";
      wrap.appendChild(tituloC);

      const partes = culturasDessaProp.map((cu) => {
        const nome = cu.NOME_CULTURA || "CULTURA";
        const area = cu.AREA_PLANTADA;
        let areaStr = "";
        if (area != null && area !== "") {
          const n = Number(area);
          areaStr = Number.isNaN(n)
            ? String(area)
            : n.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
        }
        return areaStr ? `${nome} (${areaStr} ha)` : nome;
      });

      const txt = document.createElement("div");
      txt.textContent = partes.join("; ");
      wrap.appendChild(txt);

      card.appendChild(wrap);
    }

    body.appendChild(card);
  });

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function fecharModalPropriedades() {
  const modal = document.getElementById("propriedadesModal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

// ================== INFINITE SCROLL ==================

function initInfiniteScrollLocal() {
  const wrapper = document.querySelector(".table-wrapper");
  if (!wrapper) return;

  wrapper.addEventListener("scroll", () => {
    const nearBottom =
      wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 50;
    if (nearBottom) {
      renderizarMaisLinhas(15);
    }
  });
}

// ================== SELEÇÃO LINHA ==================

function initRowSelectionCarteira() {
  const tbody = document.getElementById("tbodyCarteira");
  if (!tbody) return;

  tbody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr");
    if (!tr || tr.classList.contains("empty-state-row")) return;

    tbody.querySelectorAll("tr.row-selected").forEach((row) => {
      row.classList.remove("row-selected");
      row.removeAttribute("aria-selected");
    });

    tr.classList.add("row-selected");
    tr.setAttribute("aria-selected", "true");

    const idxStr = tr.dataset.viewIndex;
    selectedRowIndex = idxStr != null ? Number(idxStr) : null;

    const selecionado = getLinhaSelecionadaCarteira();
    if (selecionado) {
      console.log(
        "[CARTEIRA] Linha selecionada CODPARC:",
        selecionado.CODPARC
      );
    }
  });
}

function getLinhaSelecionadaCarteira() {
  if (selectedRowIndex == null) return null;
  return dadosView[selectedRowIndex] || null;
}

// ================== SORT CABEÇALHO ==================

function sortByColumn(colIndex) {
  const ths = document.querySelectorAll("#tblCarteira thead th");
  const wrapper = document.querySelector(".table-wrapper");

  const prevScrollTop = wrapper ? wrapper.scrollTop : 0;
  const prevScrollLeft = wrapper ? wrapper.scrollLeft : 0;

  if (sortState.colIndex === colIndex) {
    sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
  } else {
    sortState.colIndex = colIndex;
    sortState.dir = "asc";
  }

  ths.forEach((th, idx) => {
    th.classList.remove("sorted-asc", "sorted-desc");
    if (idx === colIndex) {
      th.classList.add(
        sortState.dir === "asc" ? "sorted-asc" : "sorted-desc"
      );
    }
  });

  construirView();

  if (wrapper) {
    wrapper.scrollTop = prevScrollTop;
    wrapper.scrollLeft = prevScrollLeft;
  }
}

// ================== FILTRO GERAL ==================

function aplicarFiltroGeral() {
  construirView();
}

// ================== EXPORT EXCEL ==================

function aplicarFiltroBuscaGeralLocal(arr) {
  const texto =
    (document.getElementById("fBuscaGeral")?.value || "").trim().toUpperCase();
  if (!texto) return arr.slice();

  return arr.filter((reg) => {
    for (const v of Object.values(reg || {})) {
      if (v == null) continue;
      if (String(v).toUpperCase().includes(texto)) return true;
    }
    return false;
  });
}

function montarLinhaExcel(c) {
  const tr = document.createElement("tr");

  function add(field, formatter, valueOverride, opts = {}) {
    const td = document.createElement("td");
    let raw = valueOverride !== undefined ? valueOverride : c[field];

    if (formatter === fmtValor || formatter === fmtDataIso) {
      raw = formatter(raw);
    } else if (formatter) {
      raw = formatter(raw);
    } else {
      raw = fmtTextOrDash(raw);
    }

    if (opts.truncate) {
      const s = raw == null || raw === "" ? "" : String(raw);
      raw = s.length > (opts.maxLen || 300) ? s.slice(0, (opts.maxLen || 300)) + "..." : s;
    }

    td.textContent = raw == null ? "" : String(raw);
    td.style.whiteSpace = "nowrap";
    td.style.overflow = "hidden";

    tr.appendChild(td);
  }

  add("CODVEND");
  add("NOME_VENDEDOR", null, undefined, { truncate: true, maxLen: 120 });

  add("CODPARC");
  add("NOME_CLIENTE", null, undefined, { truncate: true, maxLen: 120 });

  const qtdePropriedades =
    (Array.isArray(c.propriedades) && c.propriedades.length) ||
    c.QtdePropriedades ||
    1;
  add(null, null, qtdePropriedades);

  add("ParceiroEnderecoCompl", null, undefined, {
    truncate: true,
    maxLen: 120,
  });
  add("ParceiroEnderecoNumero");
  add("ParceiroLogradouro", null, undefined, {
    truncate: true,
    maxLen: 120,
  });
  add("ParceiroBairro", null, undefined, { truncate: true, maxLen: 120 });
  add("ParceiroCidade", null, undefined, { truncate: true, maxLen: 100 });
  add("ParceiroCidadeCodigo");
  add("ParceiroUFSigla");
  add("ParceiroCEP");

  add("QtdeCulturasDistintas");
  const resumoCulturas = c.CulturasResumo || montarResumoCulturas(c);
  add(null, null, resumoCulturas || "-", {
    truncate: true,
    maxLen: 200,
  });
  add(null, null, "");

  add("ParceiroTelefone", null, undefined, {
    truncate: true,
    maxLen: 60,
  });
  add("ParceiroEmail", null, undefined, { truncate: true, maxLen: 120 });

  add("ParceiroLatitude");
  add("ParceiroLongitude");

  add("CODEMP");
  add("DTLIM", fmtDataIso);
  add("LIMCRED", fmtValor);

  add("NroUnico");
  add("NumeroNota");
  add("DataVenda", fmtDataIso);
  add("ValorTotalVenda", fmtValor);
  add("VendedorQueVendeuCodigo");
  add("VendedorQueVendeuNome", null, undefined, {
    truncate: true,
    maxLen: 120,
  });
  add("CargoVendedorQueVendeu", null, undefined, {
    truncate: true,
    maxLen: 120,
  });

  add("IdAtividadeUltima");
  add("DtLancamentoUltimaAtividade", fmtDataIso);
  add("DtInicialUltimaAtividade", fmtDataIso);
  add("AssuntoUltimaAtividade", null, undefined, {
    truncate: true,
    maxLen: 200,
  });

  add("ObservacaoUltimaAtividade", null, undefined, {
    truncate: true,
    maxLen: 300,
  });

  add("Total_2024", fmtValor);
  add("Total_2025", fmtValor);
  add("Total_2026", fmtValor);

  add("LTV", fmtValor);

  return tr;
}

async function exportarTabelaParaExcel() {
  const vendedorCod =
    (document.getElementById("fVendedorCart")?.value || "").trim();
  const vendedorNomeSelecionado = getMultiVendedorSelecionados();

  if (!vendedorCod && !vendedorNomeSelecionado.length) {
    mostrarToastCarteira("Para exportar, informe código ou selecione vendedor.");
    return;
  }

  const table = document.getElementById("tblCarteira");
  if (!table) return;

  setLoadingCarteira(true);

  try {
    const { registros, totalCount } = await apiGetCarteiraTodasPaginas(
      1000,
      (page, totalPages, baixados, total) => {
        console.log(
          `[CARTEIRA][EXPORT] página ${page}/${totalPages} - ${baixados}/${total} registros`
        );
      }
    );

    const dadosCompletos = registros.map((reg) => {
      const clone = { ...reg };
      clone.CulturasResumo = montarResumoCulturas(clone);
      return clone;
    });

    const dadosExport = aplicarFiltroBuscaGeralLocal(dadosCompletos);

    if (!dadosExport.length) {
      mostrarToastCarteira("Não há dados para exportar.");
      return;
    }

    const cloned = table.cloneNode(true);
    const clTbody = cloned.tBodies[0];
    clTbody.innerHTML = "";

    dadosExport.forEach((c) => {
      const tr = montarLinhaExcel(c);
      clTbody.appendChild(tr);
    });

    cloned.querySelectorAll(".col-hidden").forEach((el) => {
      el.classList.remove("col-hidden");
    });

    const styleEl = document.createElement("style");
    styleEl.textContent = `
      table {
        table-layout: fixed;
        border-collapse: collapse;
      }
      td, th {
        white-space: nowrap !important;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `;
    cloned.appendChild(styleEl);

    const blob = new Blob(["\ufeff" + cloned.outerHTML], {
      type: "application/vnd.ms-excel;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const hoje = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `carteira-analytics-${hoje}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    mostrarToastCarteira(
      `Exportados ${dadosExport.length.toLocaleString("pt-BR")} de ${totalCount.toLocaleString("pt-BR")} clientes.`
    );
  } catch (e) {
    console.error("[CARTEIRA][EXPORT] Erro:", e);
    mostrarToastCarteira(e.message || "Erro ao exportar Excel");
  } finally {
    setLoadingCarteira(false);
  }
}

// ================== RESIZE DE COLUNA ==================
// Grava a largura no <col> (que é quem controla a largura em table-layout:fixed),
// não no <th>. Persiste por usuário em colunasLarguras.

function getColPorTh(th) {
  const table = document.getElementById("tblCarteira");
  if (!table) return null;
  const key = th.dataset.col;
  if (!key) return null;
  return table.querySelector(`colgroup col[data-col-key="${CSS.escape(key)}"]`);
}

function initColumnResize() {
  const ths = document.querySelectorAll("#tblCarteira thead th");
  ths.forEach((th) => {
    // evita duplicar handle se reinicializado
    if (th.querySelector(".col-resize-handle")) return;

    const handle = document.createElement("div");
    handle.className = "col-resize-handle";
    th.appendChild(handle);

    let startX;
    let startWidth;
    let col;

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      startX = e.pageX;
      col = getColPorTh(th);
      startWidth = col ? col.offsetWidth : th.offsetWidth;
      th.classList.add("resizing");
      document.body.style.userSelect = "none";

      function onMouseMove(ev) {
        const delta = ev.pageX - startX;
        const newWidth = Math.max(50, startWidth + delta);
        if (col) {
          col.style.width = newWidth + "px";
        }
      }

      function onMouseUp() {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        th.classList.remove("resizing");
        document.body.style.userSelect = "";

        // persiste a largura final por chave de coluna
        if (col && col.dataset.colKey) {
          const w = col.offsetWidth;
          colunasLarguras[col.dataset.colKey] = w;
          salvarLayout();
        }
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    // impede que o mousedown no handle inicie o drag de reordenação
    handle.addEventListener("dragstart", (e) => e.preventDefault());
  });
}

// ================== DRAG / REORDENAR COLUNA ==================
// Move <col>, <th> e as <td> de cada linha juntos, e persiste a ordem.

function initColumnDrag() {
  const headRow = document.querySelector("#tblCarteira thead tr");
  if (!headRow) return;
  let dragSrcKey = null;

  headRow.querySelectorAll("th").forEach((th) => {
    th.draggable = true;

    th.addEventListener("dragstart", (e) => {
      if (e.target.classList && e.target.classList.contains("col-resize-handle")) {
        e.preventDefault();
        return;
      }
      dragSrcKey = th.dataset.col;
      th.classList.add("drag-source");
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", dragSrcKey || ""); } catch (_) {}
    });

    th.addEventListener("dragover", (e) => {
      e.preventDefault();
      th.classList.add("drag-over");
    });

    th.addEventListener("dragleave", () => {
      th.classList.remove("drag-over");
    });

    th.addEventListener("drop", (e) => {
      e.preventDefault();
      th.classList.remove("drag-over");
      const destKey = th.dataset.col;
      if (!dragSrcKey || !destKey || dragSrcKey === destKey) return;

      moverColunaPorKey(dragSrcKey, destKey);
      dragSrcKey = null;

      headRow
        .querySelectorAll("th")
        .forEach((th2) => th2.classList.remove("drag-source", "drag-over"));

      salvarLayout();
    });

    th.addEventListener("dragend", () => {
      dragSrcKey = null;
      headRow.querySelectorAll("th").forEach((th2) =>
        th2.classList.remove("drag-source", "drag-over")
      );
    });
  });
}

// Move a coluna de origem para a posição da coluna de destino,
// atualizando colunasOrdem e o DOM (col + th + tds de cada linha).
function moverColunaPorKey(srcKey, destKey) {
  const fromIdx = colunasOrdem.indexOf(srcKey);
  const toIdx = colunasOrdem.indexOf(destKey);
  if (fromIdx < 0 || toIdx < 0) return;

  // atualiza o array de ordem
  colunasOrdem.splice(fromIdx, 1);
  colunasOrdem.splice(toIdx, 0, srcKey);

  // guarda o índice de sort (por key) pra restaurar depois
  const sortKeyAtual = (() => {
    if (sortState.colIndex == null) return null;
    const ths = document.querySelectorAll("#tblCarteira thead th");
    const th = ths[sortState.colIndex];
    return th ? th.dataset.col : null;
  })();

  // reconstrói o DOM inteiro na nova ordem
  reconstruirOrdemDOM();

  // recalcula o índice de sort pela nova posição da key
  if (sortKeyAtual) {
    const ths = document.querySelectorAll("#tblCarteira thead th");
    let novoIdx = null;
    ths.forEach((th, i) => {
      if (th.dataset.col === sortKeyAtual) novoIdx = i;
    });
    sortState.colIndex = novoIdx;
  }
}

// ================== INIT ==================

async function atualizarTudoCarteira() {
  console.log("========== [CARTEIRA-ANALYTICS][ATUALIZAR] ==========");
  setLoadingCarteira(true);
  try {
    await carregarCarteira();
  } catch (e) {
    console.error("[CARTEIRA-ANALYTICS][ATUALIZAR] Erro:", e);
    mostrarToastCarteira(e.message || "Erro ao carregar carteira");
  } finally {
    setLoadingCarteira(false);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  const user = getUsuarioObrigatorioCarteira();
  if (!user) return;

  const nomeEl = document.getElementById("carteiraUserNome");
  const emailEl = document.getElementById("carteiraUserEmail");
  if (nomeEl) nomeEl.textContent = user.nome || "Usuário VISYA";
  if (emailEl) emailEl.textContent = user.email || "";

  // carrega layout do usuário e aplica ordem/largura/visibilidade
  carregarLayout();
  reconstruirOrdemDOM();
  aplicarLargurasColunas();
  aplicarVisibilidadeColunas();

  const btnAplicar = document.getElementById("btnAplicarCart");
  const btnLimpar = document.getElementById("btnLimparCart");
  const btnExport = document.getElementById("btnExportExcelCart");
  const btnReset = document.getElementById("btnResetLayout");
  const btnCloseModal = document.getElementById("btnCloseCulturasModal");
  const modal = document.getElementById("culturasModal");
  const btnClosePropModal = document.getElementById("btnClosePropriedadesModal");
  const modalProp = document.getElementById("propriedadesModal");

  if (btnAplicar) btnAplicar.addEventListener("click", atualizarTudoCarteira);
  if (btnLimpar) {
    btnLimpar.addEventListener("click", async () => {
      limparFiltrosCarteira();
      await atualizarTudoCarteira();
    });
  }
  if (btnExport) btnExport.addEventListener("click", exportarTabelaParaExcel);
  if (btnReset) btnReset.addEventListener("click", resetarLayout);

  if (btnCloseModal) {
    btnCloseModal.addEventListener("click", fecharModalCulturas);
  }
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target.classList.contains("culturas-modal-backdrop")) {
        fecharModalCulturas();
      }
    });
  }

  if (btnClosePropModal) {
    btnClosePropModal.addEventListener("click", fecharModalPropriedades);
  }
  if (modalProp) {
    modalProp.addEventListener("click", (e) => {
      if (e.target.classList.contains("propriedades-modal-backdrop")) {
        fecharModalPropriedades();
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fecharModalCulturas();
      fecharModalPropriedades();
    }
  });

  function atualizarEstadoBotaoExport() {
    const vendedorCod =
      (document.getElementById("fVendedorCart")?.value || "").trim();
    const habilita = !!(vendedorCod || getMultiVendedorSelecionados().length);
    if (btnExport) {
      btnExport.disabled = !habilita;
      btnExport.classList.toggle("btn-disabled", !habilita);
    }
  }

  const idsFiltrosApi = [
    "fVendedorCart",
    "fClienteCart",
    "fClienteNomeCart",
    "fCidadeCart",
    "fCulturaCart",
  ];
  const debouncedAtualizarApi = debounce(atualizarTudoCarteira, 600);
  idsFiltrosApi.forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, debouncedAtualizarApi);

    if (id === "fVendedorCart") {
      el.addEventListener(evt, atualizarEstadoBotaoExport);
    }
  });

  const fBusca = document.getElementById("fBuscaGeral");
  if (fBusca) {
    fBusca.addEventListener("input", debounce(aplicarFiltroGeral, 250));
  }

  document
    .querySelectorAll("#tblCarteira thead th")
    .forEach((th, idx) => {
      th.addEventListener("click", (e) => {
        if (e.target.classList.contains("col-resize-handle")) return;
        // calcula índice atual da th (a ordem pode ter mudado)
        const ths = Array.from(document.querySelectorAll("#tblCarteira thead th"));
        const realIdx = ths.indexOf(th);
        sortByColumn(realIdx);
      });
    });

  initMultiSelectVendedor();
  initColunasDropdown();

  const btnSelecionarTodosVendedores = document.getElementById("btnSelecionarTodosVendedores");
  const btnLimparVendedores = document.getElementById("btnLimparVendedores");
  const fVendedorNomeCartBusca = document.getElementById("fVendedorNomeCartBusca");

  if (btnSelecionarTodosVendedores) {
    btnSelecionarTodosVendedores.addEventListener("click", atualizarEstadoBotaoExport);
  }

  if (btnLimparVendedores) {
    btnLimparVendedores.addEventListener("click", atualizarEstadoBotaoExport);
  }

  if (fVendedorNomeCartBusca) {
    fVendedorNomeCartBusca.addEventListener("input", () => {
      renderizarListaVendedores();
    });
  }

  const triggerMulti = document.getElementById("multiVendedorTrigger");
  if (triggerMulti) {
    triggerMulti.addEventListener("click", () => {
      renderizarListaVendedores();
    });
  }

  document.addEventListener("change", (e) => {
    if (
      e.target &&
      e.target.closest &&
      e.target.closest("#multiVendedorLista")
    ) {
      atualizarEstadoBotaoExport();
    }
  });

  initColumnResize();
  initColumnDrag();
  initInfiniteScrollLocal();
  initRowSelectionCarteira();

  await carregarVendedoresDisponiveis();
  atualizarEstadoBotaoExport();
  await atualizarTudoCarteira();
});