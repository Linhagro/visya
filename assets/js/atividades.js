console.log("[ATIV] Script atividades.js carregado.");

if (!window.API_BASE) {
  window.API_BASE = "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}

const DIAS_CONVERSAO = 20;
const PAGE_SIZE_ATIV = 5000;
const PAGE_SIZE_CARTEIRA = 5000;
const PAGE_SIZE_VENDAS = 5000;
const PAGE_SIZE_VENDEDORES = 1000;
const MAX_PARALLEL_REQUESTS = 3;

let atividadesBruto = [];
let vendasBruto = [];
let vendasDetalheBruto = [];
let carteiraBruto = [];
let vendedoresCentralizador = [];

let totalAtividadesGeral = 0;
let totalCarteiraGeral = 0;
let valorVendaTotalGeral = 0;
let qtdeClientesVendaGeral = 0;
let ticketMedioVendaGeral = 0;

let vendedoresBase = [];
let tiposAtividadeBase = [];

let leafletMapAtiv = null;
let markerLayerAtiv = null;
let mapaPontos = [];
let mapaPreparado = false;
let graficoEvolucaoMensal = null;

let loaderOverlay = null;
let loaderTimerId = null;
let resizeTimer = null;

let cacheVendasDetalhadas = new Map();
let cacheIndiceVendas = new Map();
let carregandoConversao = false;
let conversaoCarregada = false;

function setLoadingAtiv(isLoading) {
  if (!loaderOverlay) loaderOverlay = document.getElementById("loaderOverlay");
  if (!loaderOverlay) return;

  if (isLoading) {
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

function getUsuarioObrigatorio() {
  const user = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  if (!user || !user.email) {
    window.location.href = "/index.html";
    return null;
  }
  return user;
}

function getAuthHeadersAtiv() {
  const user = getUsuarioObrigatorio();
  if (!user) return { "Content-Type": "application/json" };

  let headers;
  if (typeof getAuthHeadersCalendario === "function") {
    headers = getAuthHeadersCalendario();
  } else {
    headers = { "Content-Type": "application/json" };
    try {
      const token = (window.sessionStorage && sessionStorage.getItem("authToken")) || null;
      if (token) headers["Authorization"] = "Bearer " + token;
    } catch (e) {
      console.warn("[ATIV] Erro ao ler authToken:", e);
    }
  }

  headers["x-usuario-email"] = user.email;
  return headers;
}

async function apiGetAtiv(path) {
  const url = window.API_BASE + path;
  const headers = getAuthHeadersAtiv();

  let resp;
  try {
    resp = await fetch(url, { method: "GET", headers });
  } catch (e) {
    throw new Error("Falha na comunicação com o servidor");
  }

  if (!resp.ok) {
    let body = "";
    try { body = await resp.text(); } catch (_) {}
    throw new Error("HTTP " + resp.status + " ao chamar " + path + " — " + body);
  }

  return resp.json();
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtInt(v) {
  return Number(v || 0).toLocaleString("pt-BR");
}

function fmtMoeda(v) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function fmtPerc(v) {
  return (Number(v || 0) * 100).toFixed(1).replace(".", ",") + "%";
}

function formatarData(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  } catch {
    return iso;
  }
}

function formatarMesAnoLabel(data) {
  try {
    return data.toLocaleDateString("pt-BR", {
      month: "short",
      year: "numeric"
    }).replace(".", "");
  } catch {
    return "";
  }
}

function getFiltros() {
  return {
    dtInicio: document.getElementById("fDtInicio")?.value || null,
    dtFim: document.getElementById("fDtFim")?.value || null,
    vendedor: document.getElementById("fVendedor")?.value?.trim() || null,
    tipoAtiv: document.getElementById("fTipoAtiv")?.value?.trim() || null,
    idStatus: document.getElementById("fIdStatus")?.value || null
  };
}

function getFiltrosKey() {
  const f = getFiltros();
  return JSON.stringify({
    dtInicio: f.dtInicio || "",
    dtFim: f.dtFim || "",
    vendedor: f.vendedor || "",
    tipoAtiv: f.tipoAtiv || "",
    idStatus: f.idStatus || ""
  });
}

function buildQSAtividadesPage(page = 1, incluirVendedor = true) {
  const f = getFiltros();
  const p = new URLSearchParams();

  if (f.dtInicio) p.set("dtInicialInicio", f.dtInicio);
  if (f.dtFim) p.set("dtInicialFim", f.dtFim);
  if (incluirVendedor && f.vendedor) p.set("vendedor", f.vendedor);
  if (f.tipoAtiv) p.set("tipoAtividade", f.tipoAtiv);
  if (f.idStatus) p.set("idStatus", f.idStatus);

  p.set("page", String(page));
  p.set("pageSize", String(PAGE_SIZE_ATIV));

  return "?" + p.toString();
}

function buildQSCarteiraPage(page = 1) {
  const f = getFiltros();
  const p = new URLSearchParams();

  if (f.vendedor) p.set("vendedor", f.vendedor);

  p.set("page", String(page));
  p.set("pageSize", String(PAGE_SIZE_CARTEIRA));

  return "?" + p.toString();
}

function buildQSVendasDashboardPage(page = 1) {
  const f = getFiltros();
  const p = new URLSearchParams();

  if (f.dtInicio) p.set("dataIni", f.dtInicio);
  if (f.dtFim) p.set("dataFim", f.dtFim);

  p.set("page", String(page));
  p.set("pageSize", String(PAGE_SIZE_VENDAS));

  return "?" + p.toString();
}

function buildQSVendasDetalhePage(page = 1) {
  const f = getFiltros();
  const p = new URLSearchParams();

  if (f.dtInicio) p.set("dtInicio", f.dtInicio);
  if (f.dtFim) p.set("dtFim", f.dtFim);

  p.set("page", String(page));
  p.set("pageSize", String(PAGE_SIZE_VENDAS));

  return "?" + p.toString();
}

function buildQSVendedoresPage(page = 1) {
  const p = new URLSearchParams();
  p.set("page", String(page));
  p.set("pageSize", String(PAGE_SIZE_VENDEDORES));
  return "?" + p.toString();
}

function extrairLista(res, chaves = ["atividades", "clientes", "data", "vendas", "vendedores"]) {
  for (const chave of chaves) {
    if (Array.isArray(res?.[chave])) return res[chave];
  }
  return [];
}

function extrairTotal(res, fallback = 0) {
  return Number(
    res?.pagination?.totalCount ??
    res?.totalCount ??
    res?.pagination?.total ??
    res?.total ??
    res?.totalRegistros ??
    res?.carteiraTotal ??
    res?.totalCarteira ??
    fallback
  );
}

async function carregarPaginasEmLotes(totalPaginas, montarPath, chavesLista, primeiraPaginaJaCarregada = null) {
  let itens = [];
  let paginaInicial = 1;

  if (primeiraPaginaJaCarregada) {
    itens = itens.concat(extrairLista(primeiraPaginaJaCarregada, chavesLista));
    paginaInicial = 2;
  }

  for (let inicio = paginaInicial; inicio <= totalPaginas; inicio += MAX_PARALLEL_REQUESTS) {
    const lote = [];
    for (let p = inicio; p < inicio + MAX_PARALLEL_REQUESTS && p <= totalPaginas; p++) {
      lote.push(apiGetAtiv(montarPath(p)));
    }

    const respostas = await Promise.all(lote);
    respostas.forEach(res => {
      itens = itens.concat(extrairLista(res, chavesLista));
    });
  }

  return itens;
}

async function carregarTodasPaginas(montarPath, chavesLista) {
  const primeira = await apiGetAtiv(montarPath(1));
  const listaPrimeira = extrairLista(primeira, chavesLista);
  const total = extrairTotal(primeira, listaPrimeira.length);
  const pageSize = Number(primeira?.pagination?.pageSize ?? primeira?.pageSize ?? PAGE_SIZE_ATIV);
  const totalPaginas = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));

  const itens = await carregarPaginasEmLotes(totalPaginas, montarPath, chavesLista, primeira);
  return { itens, total, primeira };
}

function ajustarTituloRanking() {
  const tituloRanking = document.querySelector("#tab-visao .visao-ranking .bloco-titulo");
  if (tituloRanking) tituloRanking.textContent = "Ranking de vendedores por atividades";
}

function refreshVisualizacaoVisao() {
  setTimeout(() => {
    if (graficoEvolucaoMensal && typeof graficoEvolucaoMensal.resize === "function") {
      graficoEvolucaoMensal.resize();
    }
  }, 80);
}

function refreshMapa() {
  setTimeout(() => {
    if (leafletMapAtiv && typeof leafletMapAtiv.invalidateSize === "function") {
      leafletMapAtiv.invalidateSize();
    }
  }, 120);
}

window.addEventListener("DOMContentLoaded", () => {
  loaderOverlay = document.getElementById("loaderOverlay");

  const user = getUsuarioObrigatorio();
  if (!user) return;

  const nomeEl = document.getElementById("ativUserNome");
  const emailEl = document.getElementById("ativUserEmail");

  if (nomeEl) nomeEl.textContent = user.nome || "Usuário VISYA";
  if (emailEl) emailEl.textContent = user.email || "";

  ajustarTituloRanking();

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;

      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      document.getElementById("tab-" + tab)?.classList.add("active");

      if (tab === "visao") {
        setTimeout(() => {
          renderizarGraficoEvolucaoMensal();
          renderizarRankingAtividadesVendedor();
          refreshVisualizacaoVisao();
        }, 120);
      }

      if (tab === "mapa") {
        setTimeout(() => {
          if (!mapaPreparado) {
            prepararPontosMapa();
            mapaPreparado = true;
          }
          inicializarMapa();
          renderizarMapaAtividades();
          refreshMapa();
        }, 120);
      }

      if (tab === "conversao") {
        setTimeout(() => {
          abrirAbaConversao().catch(e => {
            console.error("[ATIV][conversao] Erro:", e);
            mostrarErroGlobal("Erro ao carregar conversão: " + e.message);
          });
        }, 80);
      }
    });
  });

  document.getElementById("btnBuscar")?.addEventListener("click", () => {
    carregarTudo({ recarregarBases: false });
  });

  document.getElementById("btnLimpar")?.addEventListener("click", () => {
    document.getElementById("fDtInicio").value = "";
    document.getElementById("fDtFim").value = "";
    document.getElementById("fVendedor").value = "";
    document.getElementById("fTipoAtiv").value = "";
    document.getElementById("fIdStatus").value = "";
    carregarTudo({ recarregarBases: true });
  });

  document.getElementById("btnMapaRecarregar")?.addEventListener("click", () => {
    if (!mapaPreparado) {
      prepararPontosMapa();
      mapaPreparado = true;
    }
    inicializarMapa();
    renderizarMapaAtividades();
    refreshMapa();
  });

  document.getElementById("btnMapaAjustar")?.addEventListener("click", ajustarMapaAosPontos);
  document.getElementById("btnExportarCsv")?.addEventListener("click", exportarAtividadesCsv);

  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      refreshVisualizacaoVisao();
      if (document.getElementById("tab-mapa")?.classList.contains("active")) {
        refreshMapa();
      }
    }, 180);
  });

  const hoje = new Date();
  const anoMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;

  const fDtInicio = document.getElementById("fDtInicio");
  const fDtFim = document.getElementById("fDtFim");

  if (fDtInicio) fDtInicio.value = `${anoMes}-01`;

  if (fDtFim) {
    const ultimo = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
    fDtFim.value = `${anoMes}-${String(ultimo).padStart(2, "0")}`;
  }

  carregarTudo({ recarregarBases: true });
});

async function carregarTudo(opcoes = {}) {
  const { recarregarBases = false } = opcoes;
  setLoadingAtiv(true);

  try {
    const filtrosKey = getFiltrosKey();

    conversaoCarregada = false;
    carregandoConversao = false;
    vendasDetalheBruto = [];
    vendedoresCentralizador = [];
    mapaPontos = [];
    mapaPreparado = false;

    if (!cacheVendasDetalhadas.has(filtrosKey)) {
      cacheIndiceVendas.delete(filtrosKey);
    }

    const promessas = [
      carregarTodasPaginas((page) => "/atividades" + buildQSAtividadesPage(page, true), ["atividades", "data"]),
      carregarTodasPaginas((page) => "/carteira-analytics" + buildQSCarteiraPage(page), ["clientes", "data"]),
      carregarTodasPaginas((page) => "/vendas/dashboard" + buildQSVendasDashboardPage(page), ["clientes", "data"]),
      carregarTodasPaginas((page) => "/vendedores" + buildQSVendedoresPage(page), ["vendedores", "data"])
    ];

    if (recarregarBases || !vendedoresBase.length || !tiposAtividadeBase.length) {
      promessas.push(
        carregarTodasPaginas((page) => "/atividades" + buildQSAtividadesPage(page, false), ["atividades", "data"])
      );
    }

    const respostas = await Promise.all(promessas);
    const [resAtiv, resCarteira, resVendasDashboard, resVendedores, resBase] = respostas;

    atividadesBruto = resAtiv.itens || [];
    carteiraBruto = resCarteira.itens || [];
    vendasBruto = resVendasDashboard.itens || [];
    vendedoresCentralizador = resVendedores.itens || [];

    totalAtividadesGeral = Number(resAtiv.total || atividadesBruto.length);
    totalCarteiraGeral = Number(resCarteira.total || carteiraBruto.length);

    const primeiraVenda = resVendasDashboard.primeira || {};
    valorVendaTotalGeral = Number(
      primeiraVenda?.valor_venda_total ??
      primeiraVenda?.valorTotal ??
      primeiraVenda?.total_vendas ??
      0
    );

    qtdeClientesVendaGeral = Number(
      primeiraVenda?.qtde_clientes_venda ??
      primeiraVenda?.quantidade_clientes_venda ??
      primeiraVenda?.totalClientesVenda ??
      vendasBruto.length
    );

    ticketMedioVendaGeral = Number(
      primeiraVenda?.ticket_medio_venda_geral ??
      primeiraVenda?.ticketMedio ??
      0
    );

    if (resBase) {
      popularBasesFiltros(resBase.itens);
    } else if (!vendedoresBase.length || !tiposAtividadeBase.length) {
      popularBasesFiltros(atividadesBruto);
    }

    popularFiltrosBase();
    ajustarTituloRanking();
    renderizarCards();
    renderizarTabelaAtividades();
    renderizarGraficoEvolucaoMensal();
    renderizarRankingAtividadesVendedor();
    renderizarConversaoPlaceholder();

    if (document.getElementById("tab-mapa")?.classList.contains("active")) {
      prepararPontosMapa();
      mapaPreparado = true;
      inicializarMapa();
      renderizarMapaAtividades();
      refreshMapa();
    }

    refreshVisualizacaoVisao();
  } catch (e) {
    console.error("[ATIV][carregarTudo] Erro:", e);
    mostrarErroGlobal("Erro ao carregar dados: " + e.message);
  } finally {
    setLoadingAtiv(false);
  }
}

function popularBasesFiltros(listaBase) {
  vendedoresBase = [...new Set(
    listaBase.map(a => (a.nmVendedor || a.vendedor || "").trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "pt-BR"));

  tiposAtividadeBase = [...new Set(
    listaBase.map(a => (a.nmTipoAtividade || a.tipoAtividade || "").trim()).filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function popularFiltrosBase() {
  const selVendedor = document.getElementById("fVendedor");
  const selTipo = document.getElementById("fTipoAtiv");
  if (!selVendedor || !selTipo) return;

  const vendedorSelecionado = selVendedor.value;
  const tipoSelecionado = selTipo.value;

  selVendedor.innerHTML =
    `<option value="">Todos</option>` +
    vendedoresBase.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");

  selTipo.innerHTML =
    `<option value="">Todos</option>` +
    tiposAtividadeBase.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");

  selVendedor.value = vendedoresBase.includes(vendedorSelecionado) ? vendedorSelecionado : "";
  selTipo.value = tiposAtividadeBase.includes(tipoSelecionado) ? tipoSelecionado : "";
}

function renderizarCards() {
  const totalAtiv = totalAtividadesGeral;
  const totalCarteira = totalCarteiraGeral;

  const clientesAtendidos = new Set(
    atividadesBruto.map(a => a.idCliente || a.codCliente || a.nmCliente).filter(Boolean)
  );

  const ativVisita = filtrarAtividadesVisita();

  const clientesVisita = new Set(
    ativVisita.map(a => a.idCliente || a.codCliente || a.nmCliente).filter(Boolean)
  );

  const percAtendidos = totalCarteira > 0 ? clientesAtendidos.size / totalCarteira : 0;
  const percVisita = totalCarteira > 0 ? clientesVisita.size / totalCarteira : 0;

  setCard("cardTotalAtiv", fmtInt(totalAtiv), "Total real da API");
  setCard("cardTotalCarteira", fmtInt(totalCarteira), "Total real da carteira");
  setCard("cardClientesAtend", fmtPerc(percAtendidos), `${fmtInt(clientesAtendidos.size)} clientes com atividade`);
  setCard("cardClientesVisita", `${fmtInt(clientesVisita.size)} • ${fmtPerc(percVisita)}`, "Clientes com visita na carteira");
  setCard("cardTaxaConv", "Sob demanda", "Abra a aba Conversão para calcular");
  setCard("cardPedidos", fmtInt(qtdeClientesVendaGeral), "Clientes com venda na API");
}

function setCard(id, valor, legenda) {
  const el = document.getElementById(id);
  if (!el) return;

  const valorEl = el.querySelector(".resumo-valor");
  const legendaEl = el.querySelector(".resumo-legenda");

  if (valorEl) valorEl.textContent = valor;
  if (legendaEl) legendaEl.textContent = legenda;
}

function renderizarTabelaAtividades() {
  const tbody = document.getElementById("tbodyAtividades");
  const info = document.getElementById("infoAtividades");
  if (!tbody) return;

  if (!atividadesBruto.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="ativ-empty">Nenhuma atividade encontrada para os filtros.</td></tr>`;
    if (info) info.textContent = "0 registros";
    return;
  }

  const html = atividadesBruto.map(a => {
    const tipo = a.nmTipoAtividade || a.tipoAtividade || "—";
    const cliente = a.nmCliente || a.nomeCliente || "—";
    const vendedor = (a.nmVendedor || a.vendedor || "—").split(" - ")[0];
    const dtLanc = a.dtLancamento || a.dtInicial || a.data || null;
    const assunto = a.nmAssunto || a.assunto || "—";
    const obsOriginal = a.nmObservacao || a.observacao || "";
    const obs = obsOriginal ? obsOriginal.substring(0, 60) + (obsOriginal.length > 60 ? "…" : "") : "—";
    const tipoPill = getTipoPill(tipo);
    const temGps = extrairCoordenadas(a) ? "📍" : "—";

    return `
      <tr>
        <td>${escapeHtml(formatarData(dtLanc))}</td>
        <td><span class="status-pill ${tipoPill.cls}">${escapeHtml(tipo)}</span></td>
        <td>${escapeHtml(cliente)}</td>
        <td>${escapeHtml(vendedor)}</td>
        <td>${escapeHtml(assunto)}</td>
        <td title="${escapeHtml(obsOriginal)}">${escapeHtml(obs)}</td>
        <td class="num">${temGps}</td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = html;
  if (info) info.textContent = "Total real filtrado: " + fmtInt(totalAtividadesGeral);
}

function getTipoPill(tipo) {
  const t = String(tipo || "").toUpperCase();
  if (t.includes("VISITA")) return { cls: "pill-ok" };
  if (t.includes("PROSPECCAO") || t.includes("PROSPECÇÃO")) return { cls: "pill-blue" };
  if (t.includes("CANCEL")) return { cls: "pill-bad" };
  return { cls: "pill-alert" };
}

function filtrarAtividadesVisita() {
  return atividadesBruto.filter(a => {
    const tipo = String(a.nmTipoAtividade || a.tipoAtividade || "").toUpperCase();
    return tipo.includes("VISITA") || tipo.includes("PROSPECÇÃO") || tipo.includes("PROSPECCAO");
  });
}

function agruparEvolucaoMensal() {
  const mapa = new Map();

  atividadesBruto.forEach(a => {
    const dt = new Date(a.dtLancamento || a.dtInicial || a.data || null);
    if (Number.isNaN(dt.getTime())) return;

    const ano = dt.getFullYear();
    const mes = dt.getMonth();
    const chave = `${ano}-${String(mes + 1).padStart(2, "0")}`;

    mapa.set(chave, (mapa.get(chave) || 0) + 1);
  });

  const chaves = [...mapa.keys()].sort();

  const labels = chaves.map(chave => {
    const [ano, mes] = chave.split("-");
    const dataRef = new Date(Number(ano), Number(mes) - 1, 1);
    return formatarMesAnoLabel(dataRef);
  });

  const valores = chaves.map(chave => mapa.get(chave));

  return { labels, valores };
}

function renderizarGraficoEvolucaoMensal() {
  const canvas = document.getElementById("graficoEvolucaoMensal");
  if (!canvas || typeof Chart === "undefined") return;

  const { labels, valores } = agruparEvolucaoMensal();

  if (graficoEvolucaoMensal) graficoEvolucaoMensal.destroy();

  graficoEvolucaoMensal = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Atividades",
        data: valores,
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.15)",
        fill: true,
        tension: 0.25,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: document.body.classList.contains("light-theme") ? "#111827" : "#e5e5e5"
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: document.body.classList.contains("light-theme") ? "#6b7280" : "#a3a3a3",
            maxRotation: 0,
            autoSkip: true
          },
          grid: {
            color: document.body.classList.contains("light-theme") ? "rgba(17,24,39,0.08)" : "rgba(255,255,255,0.06)"
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: document.body.classList.contains("light-theme") ? "#6b7280" : "#a3a3a3"
          },
          grid: {
            color: document.body.classList.contains("light-theme") ? "rgba(17,24,39,0.08)" : "rgba(255,255,255,0.06)"
          }
        }
      }
    }
  });
}

function renderizarRankingAtividadesVendedor() {
  const container = document.getElementById("rankingVisitas");
  if (!container) return;

  const lista = atividadesBruto;

  if (!lista.length) {
    container.innerHTML = `<div class="ativ-empty">Sem atividades no período.</div>`;
    return;
  }

  const mapa = new Map();

  lista.forEach(a => {
    const vendedor = (a.nmVendedor || a.vendedor || "Sem vendedor").split(" - ")[0];
    mapa.set(vendedor, (mapa.get(vendedor) || 0) + 1);
  });

  const ranking = [...mapa.entries()]
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);

  const max = Math.max(...ranking.map(r => r.total), 1);
  const somaTotal = ranking.reduce((acc, r) => acc + r.total, 0);

  container.innerHTML = `
    <div class="rank-total-linha">📌 Soma total: ${fmtInt(somaTotal)}</div>
    ${ranking.map((r, i) => `
      <div class="rank-row">
        <span class="rank-pos">${i + 1}</span>
        <span class="rank-nome" title="${escapeHtml(r.nome)}">${escapeHtml(r.nome)}</span>
        <div class="rank-bar-wrap">
          <div class="rank-bar" style="width:${Math.round((r.total / max) * 100)}%"></div>
        </div>
        <span class="rank-taxa">${fmtInt(r.total)}</span>
      </div>
    `).join("")}
  `;
}

function normalizarNumeroCoord(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;

  let s = String(valor).trim();
  if (!s) return null;

  s = s.replace(/\s+/g, "");
  const virgulas = (s.match(/,/g) || []).length;
  const pontos = (s.match(/\./g) || []).length;

  if (virgulas > 0 && pontos > 0) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (virgulas > 0 && pontos === 0) {
    s = s.replace(",", ".");
  }

  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function extrairCoordenadas(a) {
  const latKeys = ["latitude", "Latitude", "lat", "LATITUDE", "nrLatitude", "geoLat", "geo_lat"];
  const lngKeys = ["longitude", "Longitude", "lng", "lon", "LONGITUDE", "nrLongitude", "geoLng", "geo_lon"];

  let lat = null;
  let lng = null;

  for (const k of latKeys) {
    if (a[k] !== undefined && a[k] !== null && a[k] !== "") {
      lat = normalizarNumeroCoord(a[k]);
      if (lat !== null) break;
    }
  }

  for (const k of lngKeys) {
    if (a[k] !== undefined && a[k] !== null && a[k] !== "") {
      lng = normalizarNumeroCoord(a[k]);
      if (lng !== null) break;
    }
  }

  if (lat === null || lng === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;

  return { lat, lng };
}

function prepararPontosMapa() {
  mapaPontos = atividadesBruto.map(a => {
    const coord = extrairCoordenadas(a);
    if (!coord) return null;

    return {
      lat: coord.lat,
      lng: coord.lng,
      cliente: a.nmCliente || a.nomeCliente || "Sem cliente",
      vendedor: (a.nmVendedor || a.vendedor || "Sem vendedor").split(" - ")[0],
      tipo: a.nmTipoAtividade || a.tipoAtividade || "Sem tipo",
      assunto: a.nmAssunto || a.assunto || "—",
      data: formatarData(a.dtLancamento || a.dtInicial || a.data),
      obs: a.nmObservacao || a.observacao || ""
    };
  }).filter(Boolean);
}

function inicializarMapa() {
  const mapDiv = document.getElementById("mapaAtividades");
  if (!mapDiv || typeof L === "undefined") return;

  if (!leafletMapAtiv) {
    leafletMapAtiv = L.map("mapaAtividades", {
      attributionControl: true,
      zoomControl: true
    }).setView([-20.3155, -40.3128], 7);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(leafletMapAtiv);

    markerLayerAtiv = L.layerGroup().addTo(leafletMapAtiv);
  }

  setTimeout(() => {
    try { leafletMapAtiv.invalidateSize(); } catch (_) {}
  }, 200);
}

function renderizarMapaAtividades() {
  inicializarMapa();
  if (!leafletMapAtiv || !markerLayerAtiv) return;

  markerLayerAtiv.clearLayers();

  if (!mapaPontos.length) {
    leafletMapAtiv.setView([-20.3155, -40.3128], 7);
    return;
  }

  const bounds = [];

  mapaPontos.forEach((p) => {
    const marker = L.circleMarker([p.lat, p.lng], {
      radius: 7,
      fillColor: "#22c55e",
      color: "#ffffff",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.92
    });

    marker.bindPopup(`
      <div style="min-width:220px">
        <div style="font-weight:700;margin-bottom:6px;">${escapeHtml(p.cliente)}</div>
        <div><b>Tipo:</b> ${escapeHtml(p.tipo)}</div>
        <div><b>Vendedor:</b> ${escapeHtml(p.vendedor)}</div>
        <div><b>Data:</b> ${escapeHtml(p.data)}</div>
        <div><b>Assunto:</b> ${escapeHtml(p.assunto)}</div>
        <div><b>Lat/Lng:</b> ${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}</div>
      </div>
    `);

    marker.addTo(markerLayerAtiv);
    bounds.push([p.lat, p.lng]);
  });

  if (bounds.length === 1) {
    leafletMapAtiv.setView(bounds[0], 15);
  } else {
    leafletMapAtiv.fitBounds(bounds, { padding: [30, 30] });
  }

  setTimeout(() => {
    try { leafletMapAtiv.invalidateSize(); } catch (_) {}
  }, 250);
}

function ajustarMapaAosPontos() {
  if (!leafletMapAtiv || !mapaPontos.length) return;

  const bounds = mapaPontos.map(p => [p.lat, p.lng]);
  if (bounds.length === 1) {
    leafletMapAtiv.setView(bounds[0], 15);
  } else {
    leafletMapAtiv.fitBounds(bounds, { padding: [30, 30] });
  }
}

// --------- CONVERSÃO: CLIENTE + DATA (SEM CENTRALIZADOR) ---------

function normalizarTexto(txt) {
  return String(txt || "").trim().toUpperCase();
}

function normalizarCodigo(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  return String(valor).trim();
}

function getChaveClienteAtividade(a) {
  return (
    a.codigoIntegracao ||
    a.codCliente ||
    a.idCliente ||
    a.nmCliente ||
    a.nomeCliente ||
    null
  );
}

function getChaveClienteVendaDetalhe(v) {
  return (
    v.ParceiroCodigo ??
    v.parceiroCodigo ??
    v.codparc ??
    null
  );
}

function getDataVenda(v) {
  return (
    v.DataVenda ||
    v.data_venda ||
    v.dtVenda ||
    v.data ||
    v.dtNegociacao ||
    null
  );
}

function getValorVenda(v) {
  return Number(
    v.ValorVendaPedido ??
    v.valor_venda ??
    v.valorVenda ??
    v.valor ??
    0
  );
}

function getIdPedidoVenda(v) {
  return (
    v.NroUnico ??
    v.nroUnico ??
    v.chave_conversao ??
    null
  );
}

function getNomeVendedorAtividade(a) {
  return String(a.nmVendedor || a.vendedor || "").split(" - ")[0].trim();
}

function vendaNoPrazo(atividade, venda) {
  const dtAtividade = new Date(atividade.dtLancamento || atividade.dtInicial || atividade.data || null);
  const dtVenda = new Date(getDataVenda(venda));

  if (Number.isNaN(dtAtividade.getTime()) || Number.isNaN(dtVenda.getTime())) return false;

  const diffMs = dtVenda.getTime() - dtAtividade.getTime();
  const diffDias = diffMs / (1000 * 60 * 60 * 24);

  return diffDias >= 0 && diffDias <= DIAS_CONVERSAO;
}

function construirIndiceVendasPorCliente() {
  const filtrosKey = getFiltrosKey();
  if (cacheIndiceVendas.has(filtrosKey)) {
    return cacheIndiceVendas.get(filtrosKey);
  }

  const indice = new Map();

  vendasDetalheBruto.forEach(v => {
    const chave = getChaveClienteVendaDetalhe(v);
    if (chave === null || chave === undefined || chave === "") return;

    const chaveNorm = normalizarTexto(chave);
    const chaveCod = normalizarCodigo(chave);

    if (chaveNorm) {
      if (!indice.has(chaveNorm)) indice.set(chaveNorm, []);
      indice.get(chaveNorm).push(v);
    }

    if (chaveCod && chaveCod !== chaveNorm) {
      if (!indice.has(chaveCod)) indice.set(chaveCod, []);
      indice.get(chaveCod).push(v);
    }
  });

  cacheIndiceVendas.set(filtrosKey, indice);
  return indice;
}

function obterVendasDetalheCompativeis(atividade, indice = null) {
  if (!indice) indice = construirIndiceVendasPorCliente();

  const chaveAtiv = getChaveClienteAtividade(atividade);
  if (!chaveAtiv) return [];

  const chaveAtivNorm = normalizarTexto(chaveAtiv);
  const codigoAtiv = normalizarCodigo(
    atividade.codigoIntegracao || atividade.codCliente || atividade.idCliente || null
  );

  const candidatas = [
    ...(indice.get(chaveAtivNorm) || []),
    ...(codigoAtiv ? (indice.get(codigoAtiv) || []) : [])
  ];

  const vistos = new Set();
  const unicas = candidatas.filter(v => {
    const id = getIdPedidoVenda(v) || `${getChaveClienteVendaDetalhe(v)}|${getDataVenda(v)}|${getValorVenda(v)}`;
    if (vistos.has(id)) return false;
    vistos.add(id);
    return true;
  });

  return unicas.filter(v => vendaNoPrazo(atividade, v));
}

async function carregarVendasDetalhadasSobDemanda() {
  const cacheKey = getFiltrosKey();

  if (cacheVendasDetalhadas.has(cacheKey)) {
    vendasDetalheBruto = cacheVendasDetalhadas.get(cacheKey);
    conversaoCarregada = true;
    return vendasDetalheBruto;
  }

  if (carregandoConversao) return vendasDetalheBruto;

  carregandoConversao = true;
  try {
    const res = await carregarTodasPaginas(
      (page) => "/vendas" + buildQSVendasDetalhePage(page),
      ["vendas", "data"]
    );

    vendasDetalheBruto = res.itens || [];
    cacheVendasDetalhadas.set(cacheKey, vendasDetalheBruto);
    cacheIndiceVendas.delete(cacheKey);
    conversaoCarregada = true;

    return vendasDetalheBruto;
  } finally {
    carregandoConversao = false;
  }
}

function renderizarConversaoPlaceholder() {
  const elConv = document.getElementById("convClientesConv");
  const elTaxa = document.getElementById("convTaxaGeral");
  const elValor = document.getElementById("convValorConv");
  const elTotal = document.getElementById("convTotalVendas");
  const bons = document.getElementById("rankingBons");
  const ruins = document.getElementById("rankingRuins");

  if (elConv) elConv.textContent = "—";
  if (elTaxa) elTaxa.textContent = "—";
  if (elValor) elValor.textContent = "—";
  if (elTotal) elTotal.textContent = fmtMoeda(valorVendaTotalGeral);

  if (bons) bons.innerHTML = `<div class="ativ-empty">Abra a aba para carregar a conversão.</div>`;
  if (ruins) ruins.innerHTML = `<div class="ativ-empty">Abra a aba para carregar a conversão.</div>`;
}

function renderizarConversaoCarregando() {
  const bons = document.getElementById("rankingBons");
  const ruins = document.getElementById("rankingRuins");
  const elConv = document.getElementById("convClientesConv");
  const elTaxa = document.getElementById("convTaxaGeral");
  const elValor = document.getElementById("convValorConv");
  const elTotal = document.getElementById("convTotalVendas");

  if (elConv) elConv.textContent = "...";
  if (elTaxa) elTaxa.textContent = "...";
  if (elValor) elValor.textContent = "...";
  if (elTotal) elTotal.textContent = fmtMoeda(valorVendaTotalGeral);

  if (bons) bons.innerHTML = `<div class="ativ-empty">Carregando conversão...</div>`;
  if (ruins) ruins.innerHTML = `<div class="ativ-empty">Carregando conversão...</div>`;
}

async function abrirAbaConversao() {
  if (!conversaoCarregada) {
    renderizarConversaoCarregando();
    await carregarVendasDetalhadasSobDemanda();
  }
  renderizarAba3Conversao();
}

function renderizarAba3Conversao() {
  const ativVisita = filtrarAtividadesVisita();
  const indiceVendas = construirIndiceVendasPorCliente();
  const mapVend = new Map();

  ativVisita.forEach(a => {
    const vendedorNome = getNomeVendedorAtividade(a) || "Sem vendedor";
    const chaveCliente = getChaveClienteAtividade(a);
    if (!chaveCliente) return;

    if (!mapVend.has(vendedorNome)) {
      mapVend.set(vendedorNome, {
        visitas: [],
        visitados: new Set(),
        convertidos: new Set(),
        pedidosConvertidos: new Set(),
        valorConvertido: 0
      });
    }

    mapVend.get(vendedorNome).visitas.push(a);
    mapVend.get(vendedorNome).visitados.add(normalizarTexto(chaveCliente));
  });

  mapVend.forEach((dados) => {
    dados.visitas.forEach(a => {
      const chaveAtiv = getChaveClienteAtividade(a);
      if (!chaveAtiv) return;

      const chaveAtivNorm = normalizarTexto(chaveAtiv);
      const vendasNoPrazo = obterVendasDetalheCompativeis(a, indiceVendas);

      if (vendasNoPrazo.length) {
        dados.convertidos.add(chaveAtivNorm);

        vendasNoPrazo.forEach(v => {
          const idPedido = getIdPedidoVenda(v) || `${getChaveClienteVendaDetalhe(v)}|${getDataVenda(v)}|${getValorVenda(v)}`;
          if (dados.pedidosConvertidos.has(idPedido)) return;

          dados.pedidosConvertidos.add(idPedido);
          dados.valorConvertido += getValorVenda(v);
        });
      }
    });
  });

  const ranking = [];
  mapVend.forEach((dados, vendedor) => {
    const visitados = dados.visitados.size;
    const convertidos = dados.convertidos.size;
    const taxa = visitados > 0 ? convertidos / visitados : 0;

    ranking.push({
      vend: vendedor,
      visitados,
      convertidos,
      taxa,
      valorConvertido: dados.valorConvertido
    });
  });

  ranking.sort((a, b) => b.taxa - a.taxa);

  const totalVisitados = new Set(
    ativVisita.map(a => normalizarTexto(getChaveClienteAtividade(a))).filter(Boolean)
  ).size;

  const totalConvertidos = new Set(
    ranking.flatMap(r => Array.from(mapVend.get(r.vend)?.convertidos || []))
  ).size;

  const pedidosSomados = new Set();
  let valorConvertido = 0;

  ativVisita.forEach(a => {
    const vendasNoPrazo = obterVendasDetalheCompativeis(a, indiceVendas);
    vendasNoPrazo.forEach(v => {
      const idPedido = getIdPedidoVenda(v) || `${getChaveClienteVendaDetalhe(v)}|${getDataVenda(v)}|${getValorVenda(v)}`;
      if (pedidosSomados.has(idPedido)) return;
      pedidosSomados.add(idPedido);
      valorConvertido += getValorVenda(v);
    });
  });

  const taxaGeral = totalVisitados > 0 ? totalConvertidos / totalVisitados : 0;

  const elConv = document.getElementById("convClientesConv");
  const elTaxa = document.getElementById("convTaxaGeral");
  const elValor = document.getElementById("convValorConv");
  const elTotal = document.getElementById("convTotalVendas");

  if (elConv) elConv.textContent = fmtInt(totalConvertidos);
  if (elTaxa) elTaxa.textContent = fmtPerc(taxaGeral);
  if (elValor) elValor.textContent = fmtMoeda(valorConvertido);
  if (elTotal) elTotal.textContent = fmtMoeda(valorVendaTotalGeral);

  setCard("cardTaxaConv", fmtPerc(taxaGeral), "Venda x visita em até " + DIAS_CONVERSAO + " dias");

  renderizarRankingConversao(ranking);
}

function renderizarRankingConversao(ranking) {
  const containerBons = document.getElementById("rankingBons");
  const containerRuins = document.getElementById("rankingRuins");

  if (!containerBons || !containerRuins) return;

  if (!ranking.length) {
    containerBons.innerHTML = `<div class="ativ-empty">Sem dados</div>`;
    containerRuins.innerHTML = `<div class="ativ-empty">Sem dados</div>`;
    return;
  }

  const maxTaxa = Math.max(...ranking.map(r => r.taxa), 0.01);
  const limite = Math.min(15, ranking.length);

  const bons = ranking.slice(0, limite);
  const ruins = [...ranking].reverse().slice(0, limite);

  containerBons.innerHTML = bons.map((r, i) => `
    <div class="rank-row rank-bom">
      <span class="rank-pos">${i + 1}</span>
      <span class="rank-nome" title="${escapeHtml(r.vend)}">${escapeHtml(r.vend.split(" - ")[0])}</span>
      <div class="rank-bar-wrap">
        <div class="rank-bar" style="width:${Math.round((r.taxa / maxTaxa) * 100)}%"></div>
      </div>
      <span class="rank-taxa" style="color:#bbf7d0">${fmtPerc(r.taxa)}</span>
    </div>
  `).join("");

  containerRuins.innerHTML = ruins.map((r, i) => `
    <div class="rank-row rank-ruim">
      <span class="rank-pos">${ranking.length - i}</span>
      <span class="rank-nome" title="${escapeHtml(r.vend)}">${escapeHtml(r.vend.split(" - ")[0])}</span>
      <div class="rank-bar-wrap">
        <div class="rank-bar" style="width:${Math.round((r.taxa / maxTaxa) * 100)}%; background:#ef4444"></div>
      </div>
      <span class="rank-taxa" style="color:#fecaca">${fmtPerc(r.taxa)}</span>
    </div>
  `).join("");
}

function exportarAtividadesCsv() {
  if (!atividadesBruto.length) return;

  const linhas = [
    ["Data", "Tipo", "Cliente", "Vendedor", "Assunto", "Observação", "Latitude", "Longitude"]
  ];

  atividadesBruto.forEach(a => {
    const coord = extrairCoordenadas(a) || {};
    linhas.push([
      formatarData(a.dtLancamento || a.dtInicial || a.data || ""),
      a.nmTipoAtividade || a.tipoAtividade || "",
      a.nmCliente || a.nomeCliente || "",
      a.nmVendedor || a.vendedor || "",
      a.nmAssunto || a.assunto || "",
      a.nmObservacao || a.observacao || "",
      coord.lat ?? "",
      coord.lng ?? ""
    ]);
  });

  const csv = linhas.map(colunas =>
    colunas.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")
  ).join("\n");

  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "atividades.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function mostrarErroGlobal(msg) {
  const tbody = document.getElementById("tbodyAtividades");
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" class="ativ-empty">${escapeHtml(msg)}</td></tr>`;
  }

  const rankingVisitas = document.getElementById("rankingVisitas");
  const bons = document.getElementById("rankingBons");
  const ruins = document.getElementById("rankingRuins");

  if (rankingVisitas) rankingVisitas.innerHTML = `<div class="ativ-empty">${escapeHtml(msg)}</div>`;
  if (bons) bons.innerHTML = `<div class="ativ-empty">${escapeHtml(msg)}</div>`;
  if (ruins) ruins.innerHTML = `<div class="ativ-empty">${escapeHtml(msg)}</div>`;
}