// js/atividades.js
console.log("[ATIV] atividades.js carregado (VISYA gestão).");

// ================== CONSTANTES ==================

const API_BASE_ATIV = (typeof window !== "undefined" && window.API_BASE)
  ? window.API_BASE
  : (typeof API_BASE !== "undefined" ? API_BASE : "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1");

const DASHBOARD_PAGE_SIZE = 200;
const LISTAGEM_PAGE_SIZE = 1000;
const DIAS_CONVERSAO = 20;
const MIN_VISITAS_RANKING_DEFAULT = 5;
const VENDEDOR_OCIOSO_LIMIAR = 5;

const TIPOS_ATIVIDADE = [
  "ACOMPANHAMENTO DE BIOSALA","ACOMPANHANDO O CTV","AT BALCÃO  - PRESENCIAL",
  "AT BALCÃO - LIGAÇÃO REALIZADA","AT BALCÃO - LIGAÇÃO RECEBIDA","ATIVIDADE INTERNA",
  "CADASTRO DE BIOSALA","CAMPO DEMOSNTRATIVO","DIA DE CAMPO","PROSPECÇÃO",
  "RETORNO EM CLIENTE","REUNIÕES E EVENTOS","SUGESTÕES E RECLAMAÇÕES",
  "VENDA REALIZADA","VISITA TÉCNICA"
];

const STATUS_LABELS = {
  1: { label: "Pendente", pill: "pill-warn" },
  2: { label: "Em andamento", pill: "pill-info" },
  3: { label: "Concluído", pill: "pill-accent" },
  4: { label: "Cancelado", pill: "pill-danger" }
};

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const PALETA_DOUGHNUT = [
  "#3d8c5e", // verde Linhagro
  "#4ba271", // verde claro
  "#5fb886", // verde muito claro
  "#73ce9b", // verde pastel
  "#8ad1a3", // verde pálido
  "#a3dab8", // verde leve
  "#6ea3d1", // azul info (variação)
  "#d4a056", // amarelo warn (variação)
  "#8a93a0", // cinza para "Outros"
  "#5b6571"  // cinza escuro
];

// ================== ESTADO ==================

const estado = {
  filtros: {
    dtInicio: null, dtFim: null, vendedor: null,
    tipoAtividade: null, idStatus: null, empresa: "linhagro"
  },
  page: 1,
  totalPages: 1,
  carregandoMais: false,
  ultimaResposta: null,
  atividadesAcumuladas: [],
  vendedoresJaPopulados: false,
  mapMarkers: null,
  mapLayer: null,
  mapaDetalhe: null,
  chartEvolucao: null,
  chartTipo: null,
  chartDiaSemana: null,
  periodoAtivo: null,
  cabecalhoOculto: false,
  // Ranking conversão
  rankingConversaoCompleto: [],
  filtroMinimo: true,
  ordenacao: "score-desc"
};

let abortControllerAtual = null;
let loaderTimerId = null;
let toastTimer = null;
let confirmCallback = null;
let scrollObserver = null;

// ================== HELPERS BASICOS ==================

function debounce(fn, delay) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

function getUsuarioObrigatorio() {
  const user = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  if (!user || !user.email) {
    window.location.href = "/index.html";
    return null;
  }
  return user;
}

function getAuthHeaders() {
  const user = getUsuarioObrigatorio();
  const headers = { "Content-Type": "application/json" };
  if (user?.email) headers["x-usuario-email"] = user.email;
  try {
    const token = window.sessionStorage?.getItem("authToken");
    if (token) headers["Authorization"] = "Bearer " + token;
  } catch (e) {}
  return headers;
}

function fmtMoeda(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtMoedaCompacto(v) {
  const n = Number(v || 0);
  if (Math.abs(n) >= 1_000_000) return "R$ " + (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
  if (Math.abs(n) >= 1_000) return "R$ " + (n / 1_000).toFixed(1).replace(".", ",") + "K";
  return fmtMoeda(n);
}

function fmtPerc(v, casas = 1) {
  const n = Number(v || 0) * 100;
  return n.toFixed(casas).replace(".", ",") + "%";
}

function fmtNumero(v) {
  return Number(v || 0).toLocaleString("pt-BR");
}

function fmtNumeroDecimal(v, casas = 1) {
  return Number(v || 0).toFixed(casas).replace(".", ",");
}

function fmtData(d) {
  if (!d) return "-";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "-" : dt.toLocaleDateString("pt-BR");
}

function fmtDataHora(d) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function setText(id, texto) {
  const el = document.getElementById(id);
  if (el) el.textContent = texto;
}

function setCardValor(cardId, valor, legenda) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const elValor = card.querySelector(".resumo-valor");
  const elLegenda = card.querySelector(".resumo-legenda");
  if (elValor) elValor.textContent = valor;
  if (elLegenda && legenda !== undefined) elLegenda.textContent = legenda;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function iniciais(nome) {
  if (!nome) return "—";
  const partes = String(nome).trim().split(/\s+/);
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function setLoading(ativo) {
  const overlay = document.getElementById("loaderOverlay");
  if (!overlay) return;
  if (ativo) {
    if (loaderTimerId !== null) clearTimeout(loaderTimerId);
    loaderTimerId = setTimeout(() => {
      overlay.setAttribute("aria-hidden", "false");
      overlay.style.display = "flex";
    }, 50);
  } else {
    if (loaderTimerId !== null) {
      clearTimeout(loaderTimerId);
      loaderTimerId = null;
    }
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  }
}

function calcularDiasUteis(dtInicio, dtFim) {
  if (!dtInicio || !dtFim) return 0;
  const ini = new Date(dtInicio + "T00:00:00");
  const fim = new Date(dtFim + "T23:59:59");
  if (Number.isNaN(ini.getTime()) || Number.isNaN(fim.getTime())) return 0;
  let count = 0;
  const cur = new Date(ini);
  while (cur <= fim) {
    const dia = cur.getDay();
    if (dia !== 0 && dia !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// ================== TOAST CUSTOM ==================

function mostrarToast(mensagem, ehErro = false) {
  const toast = document.getElementById("ativToast");
  if (!toast) return;
  toast.textContent = mensagem;
  toast.classList.toggle("is-error", !!ehErro);
  toast.classList.add("is-visible");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3200);
}

// ================== MODAL CONFIRMACAO ==================

function abrirConfirmacao(titulo, mensagem, callback) {
  const modal = document.getElementById("modalConfirmAtiv");
  setText("confirmTitulo", titulo || "Confirmar");
  setText("confirmMensagem", mensagem || "Tem certeza?");
  confirmCallback = callback;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function fecharConfirmacao() {
  const modal = document.getElementById("modalConfirmAtiv");
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  confirmCallback = null;
}

// ================== POPULAR FILTROS ==================

function popularSelectTipos() {
  const sel = document.getElementById("fTipoAtiv");
  if (!sel || sel.options.length > 1) return;
  TIPOS_ATIVIDADE.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    sel.appendChild(opt);
  });
}

function popularSelectVendedoresDoBackend(rankingAtividades) {
  if (estado.vendedoresJaPopulados) return;
  const sel = document.getElementById("fVendedor");
  if (!sel) return;
  const nomes = (rankingAtividades || []).map(r => r.vendedor).filter(n => n && n.trim());
  const unicos = Array.from(new Set(nomes)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  while (sel.options.length > 1) sel.remove(1);
  unicos.forEach(nome => {
    const opt = document.createElement("option");
    opt.value = nome;
    opt.textContent = nome;
    sel.appendChild(opt);
  });
  estado.vendedoresJaPopulados = true;
}

// ================== CHIPS DE PERIODO ==================

function aplicarPeriodoRapido(periodo) {
  const hoje = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);
  const dt = (offsetDias) => {
    const d = new Date(hoje);
    d.setDate(d.getDate() - offsetDias);
    return d;
  };
  let inicio, fim = fmt(hoje);
  switch (periodo) {
    case "hoje": inicio = fmt(hoje); break;
    case "7d": inicio = fmt(dt(7)); break;
    case "30d": inicio = fmt(dt(30)); break;
    case "90d": inicio = fmt(dt(90)); break;
    case "mes": inicio = fmt(new Date(hoje.getFullYear(), hoje.getMonth(), 1)); break;
    case "ano": inicio = fmt(new Date(hoje.getFullYear(), 0, 1)); break;
    default: return;
  }
  document.getElementById("fDtInicio").value = inicio;
  document.getElementById("fDtFim").value = fim;
  document.querySelectorAll(".chip-periodo").forEach(c => {
    c.classList.toggle("is-active", c.dataset.periodo === periodo);
  });
  estado.periodoAtivo = periodo;
  carregarDashboard();
}

function limparChipsPeriodo() {
  document.querySelectorAll(".chip-periodo").forEach(c => c.classList.remove("is-active"));
  estado.periodoAtivo = null;
}

// ================== TOGGLE CABECALHO ==================

function toggleCabecalho() {
  const area = document.getElementById("ativRecolhivel");
  const btn = document.getElementById("btnToggleCabecalho");
  const label = document.getElementById("toggleLabel");
  estado.cabecalhoOculto = !estado.cabecalhoOculto;
  area.classList.toggle("is-collapsed", estado.cabecalhoOculto);
  btn.classList.toggle("is-collapsed", estado.cabecalhoOculto);
  if (label) {
    label.textContent = estado.cabecalhoOculto ? "Mostrar filtros" : "Ocultar filtros";
  }
  try {
    localStorage.setItem("visya-ativ-header-collapsed", estado.cabecalhoOculto ? "1" : "0");
  } catch (e) {}
  // Reajusta mapa quando expande/colapsa
  setTimeout(() => {
    if (estado.mapLayer) estado.mapLayer.invalidateSize();
  }, 320);
}

function restaurarEstadoCabecalho() {
  try {
    const saved = localStorage.getItem("visya-ativ-header-collapsed");
    if (saved === "1") {
      const area = document.getElementById("ativRecolhivel");
      const btn = document.getElementById("btnToggleCabecalho");
      const label = document.getElementById("toggleLabel");
      estado.cabecalhoOculto = true;
      area.classList.add("is-collapsed");
      btn.classList.add("is-collapsed");
      if (label) label.textContent = "Mostrar filtros";
    }
  } catch (e) {}
}

// ================== CHAMADAS BACKEND ==================

async function fetchDashboard(page = 1) {
  if (abortControllerAtual) abortControllerAtual.abort();
  abortControllerAtual = new AbortController();

  const params = new URLSearchParams();
  if (estado.filtros.dtInicio) params.set("dtInicio", estado.filtros.dtInicio);
  if (estado.filtros.dtFim) params.set("dtFim", estado.filtros.dtFim);
  if (estado.filtros.vendedor) params.set("vendedor", estado.filtros.vendedor);
  if (estado.filtros.tipoAtividade) params.set("tipoAtividade", estado.filtros.tipoAtividade);
  if (estado.filtros.idStatus !== null && estado.filtros.idStatus !== "") {
    params.set("idStatus", estado.filtros.idStatus);
  }
  if (estado.filtros.empresa) params.set("empresa", estado.filtros.empresa);
  params.set("diasConversao", DIAS_CONVERSAO);
  params.set("page", page);
  params.set("pageSize", DASHBOARD_PAGE_SIZE);

  const url = `${API_BASE_ATIV}/atividades-dashboard?${params}`;
  console.log("[ATIV][GET dashboard]", url);
  const t0 = performance.now();
  const resp = await fetch(url, {
    method: "GET", headers: getAuthHeaders(), signal: abortControllerAtual.signal
  });
  if (!resp.ok) {
    const texto = await resp.text();
    console.error("[ATIV][GET dashboard] erro", resp.status, texto);
    throw new Error(`HTTP ${resp.status}`);
  }
  const json = await resp.json();
  console.log(`[ATIV][GET dashboard] OK ${((performance.now()-t0)/1000).toFixed(2)}s | total=${json?.cards?.total_atividades}`);
  return json;
}

async function fetchListagem(page = 1, abortSignal = null) {
  const params = new URLSearchParams();
  if (estado.filtros.dtInicio) params.set("dtInicialInicio", estado.filtros.dtInicio);
  if (estado.filtros.dtFim) params.set("dtInicialFim", estado.filtros.dtFim);
  if (estado.filtros.vendedor) params.set("vendedor", estado.filtros.vendedor);
  if (estado.filtros.tipoAtividade) params.set("tipoAtividade", estado.filtros.tipoAtividade);
  if (estado.filtros.idStatus !== null && estado.filtros.idStatus !== "") {
    params.set("idStatus", estado.filtros.idStatus);
  }
  params.set("page", page);
  params.set("pageSize", LISTAGEM_PAGE_SIZE);

  const url = `${API_BASE_ATIV}/atividades?${params}`;
  console.log("[ATIV][GET listagem]", url);
  const t0 = performance.now();
  const resp = await fetch(url, {
    method: "GET", headers: getAuthHeaders(), signal: abortSignal
  });
  if (!resp.ok) {
    const texto = await resp.text();
    console.error("[ATIV][GET listagem] erro", resp.status, texto);
    throw new Error(`HTTP ${resp.status}`);
  }
  const json = await resp.json();
  console.log(`[ATIV][GET listagem] OK ${((performance.now()-t0)/1000).toFixed(2)}s | linhas=${json.atividades?.length}/${json.pagination?.totalCount}`);

  const atividadesNormalizadas = (json.atividades || []).map(a => ({
    id: a.id, idAtividade: a.idAtividade, dtLancamento: a.dtLancamento,
    dtInicial: a.dtInicial, dtFinal: a.dtFinal, idStatus: a.idStatus,
    tipo: a.nmTipoAtividade, cliente: a.nmCliente, vendedor: a.nmVendedor,
    assunto: a.nmAssunto, observacao: a.nmObservacao,
    latitude: a.latitude, longitude: a.longitude,
    codparc: a.codparc || null, codvend: a.codvend || null,
    tem_gps: a.latitude !== null && a.longitude !== null
  }));

  return { atividades: atividadesNormalizadas, pagination: json.pagination };
}

// ================== CARDS PRINCIPAIS ==================

function renderCards(cards) {
  setCardValor("cardTotalAtiv", fmtNumero(cards.total_atividades), "Atividades no período");
  setCardValor("cardTotalCarteira", fmtNumero(cards.total_carteira), "Clientes na carteira");
  setCardValor("cardClientesAtend", fmtPerc(cards.clientes_atendidos.percentual),
    `${fmtNumero(cards.clientes_atendidos.qtde)} clientes com atividade`);
  setCardValor("cardClientesVisita", fmtNumero(cards.clientes_visita.qtde),
    `${fmtPerc(cards.clientes_visita.percentual)} da carteira`);
  setCardValor("cardTaxaConv", fmtPerc(cards.taxa_conversao), "Visitas que viraram venda");
  setCardValor("cardPedidos", fmtNumero(cards.pedidos_emitidos),
    `${fmtNumero(cards.clientes_venda_periodo)} clientes · ${fmtMoedaCompacto(cards.valor_vendas_periodo)}`);

  // Mini KPIs no topbar
  setText("miniTotalAtiv", fmtNumero(cards.total_atividades));
  setText("miniAtendidos", fmtPerc(cards.clientes_atendidos.percentual));
  setText("miniConversao", fmtPerc(cards.taxa_conversao));
  setText("miniValor", fmtMoedaCompacto(cards.valor_vendas_periodo));
}

// ================== KPIs DE GESTÃO ==================

function renderKPIsGestao(cards, conversao, rankingAtividades) {
  const diasUteis = calcularDiasUteis(estado.filtros.dtInicio, estado.filtros.dtFim);

  // Atividades / dia útil
  if (diasUteis > 0) {
    const media = cards.total_atividades / diasUteis;
    setText("kpiAtivDia", fmtNumeroDecimal(media));
    setText("kpiAtivDiaLeg", `${fmtNumero(cards.total_atividades)} ÷ ${diasUteis} dias úteis`);
  } else {
    setText("kpiAtivDia", "—");
    setText("kpiAtivDiaLeg", "selecione período");
  }

  // Visitas por vendedor (média)
  const totalVendedores = rankingAtividades?.length || 0;
  if (totalVendedores > 0) {
    const total = rankingAtividades.reduce((a, b) => a + Number(b.total || 0), 0);
    const media = total / totalVendedores;
    setText("kpiVisVend", fmtNumeroDecimal(media));
    setText("kpiVisVendLeg", `${totalVendedores} vendedores ativos`);
  } else {
    setText("kpiVisVend", "—");
    setText("kpiVisVendLeg", "sem dados");
  }

  // Ticket médio convertido
  setText("kpiTicket", fmtMoedaCompacto(conversao.ticket_medio || 0));

  // Vendedores ativos
  setText("kpiVendedoresAtivos", fmtNumero(totalVendedores));

  // Vendedores ociosos (< 5 atividades)
  const ociosos = (rankingAtividades || []).filter(r => Number(r.total || 0) < VENDEDOR_OCIOSO_LIMIAR).length;
  setText("kpiVendedoresOciosos", fmtNumero(ociosos));
  const percOciosos = totalVendedores > 0 ? (ociosos / totalVendedores) : 0;
  setText("kpiVendedoresOciososLeg", `${fmtPerc(percOciosos, 0)} dos ativos`);

  // Dias úteis
  setText("kpiDiasUteis", fmtNumero(diasUteis));
}

// ================== GRAFICO EVOLUCAO ==================

function renderGraficoEvolucao(evolucao) {
  const canvas = document.getElementById("graficoEvolucaoMensal");
  if (!canvas || typeof Chart === "undefined") return;
  if (estado.chartEvolucao) estado.chartEvolucao.destroy();

  const meses = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const labels = evolucao.map(e => {
    const [ano, mes] = String(e.mes).split("-");
    const mesIdx = parseInt(mes, 10) - 1;
    return `${meses[mesIdx] || mes}/${String(ano).slice(2)}`;
  });
  const valores = evolucao.map(e => Number(e.qtde || 0));

  const isLight = document.body.classList.contains("light-theme");
  const corPrincipal = isLight ? "#3d8c5e" : "#4ba271";
  const corTexto = isLight ? "#5b6571" : "#8a93a0";
  const corGrid = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";

  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 300);
  gradient.addColorStop(0, "rgba(75, 162, 113, 0.30)");
  gradient.addColorStop(1, "rgba(75, 162, 113, 0.00)");

  estado.chartEvolucao = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Atividades", data: valores,
        borderColor: corPrincipal, backgroundColor: gradient,
        borderWidth: 2, fill: true, tension: 0.4,
        pointBackgroundColor: corPrincipal,
        pointBorderColor: isLight ? "#fff" : "#07090c",
        pointBorderWidth: 2, pointRadius: 4,
        pointHoverRadius: 7, pointHoverBorderWidth: 3, pointHitRadius: 12
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isLight ? "rgba(255,255,255,0.98)" : "rgba(13, 20, 25, 0.98)",
          titleColor: isLight ? "#1a1f2a" : "#f3f5f7",
          bodyColor: isLight ? "#3a414d" : "#c9d0d8",
          borderColor: corPrincipal, borderWidth: 1,
          padding: 12, cornerRadius: 6, displayColors: false,
          titleFont: { family: "JetBrains Mono", size: 10, weight: "500" },
          bodyFont: { family: "Inter", size: 12, weight: "600" },
          callbacks: { label: ctx => `  ${fmtNumero(ctx.parsed.y)} atividades` }
        }
      },
      scales: {
        x: {
          ticks: { color: corTexto, font: { family: "JetBrains Mono", size: 10, weight: "500" } },
          grid: { display: false }, border: { color: corGrid }
        },
        y: {
          beginAtZero: true,
          ticks: { color: corTexto, font: { family: "JetBrains Mono", size: 10 },
                   callback: v => fmtNumero(v), maxTicksLimit: 6 },
          grid: { color: corGrid, drawTicks: false }, border: { display: false }
        }
      }
    }
  });
}

// ================== GRAFICO POR TIPO DE ATIVIDADE ==================

function renderGraficoTipoAtividade(atividades) {
  const canvas = document.getElementById("graficoTipoAtividade");
  if (!canvas || typeof Chart === "undefined") return;
  if (estado.chartTipo) estado.chartTipo.destroy();

  // Agrupa por tipo
  const contagem = {};
  (atividades || []).forEach(a => {
    const t = (a.tipo || "Não informado").trim();
    contagem[t] = (contagem[t] || 0) + 1;
  });

  const entradas = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
  const top = entradas.slice(0, 8);
  if (entradas.length > 8) {
    const restoSoma = entradas.slice(8).reduce((s, [, v]) => s + v, 0);
    top.push(["Outros", restoSoma]);
  }
  const labels = top.map(e => e[0]);
  const valores = top.map(e => e[1]);

  const isLight = document.body.classList.contains("light-theme");
  const corTexto = isLight ? "#3a414d" : "#c9d0d8";
  const ctx = canvas.getContext("2d");

  estado.chartTipo = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: valores,
        backgroundColor: PALETA_DOUGHNUT.slice(0, top.length),
        borderColor: isLight ? "#fff" : "#0d1419",
        borderWidth: 2, hoverOffset: 6
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: "60%",
      plugins: {
        legend: {
          position: "right",
          align: "center",
          labels: {
            color: corTexto,
            font: { family: "Inter", size: 11, weight: "500" },
            boxWidth: 10, boxHeight: 10, padding: 6,
            usePointStyle: false,
            generateLabels: (chart) => {
              const data = chart.data;
              const total = valores.reduce((a, b) => a + b, 0);
              return data.labels.map((label, i) => {
                const valor = valores[i];
                const perc = total > 0 ? (valor / total * 100).toFixed(0) : 0;
                const lbl = label.length > 20 ? label.slice(0, 20) + "…" : label;
                return {
                  text: `${lbl}  ${perc}%`,
                  fillStyle: data.datasets[0].backgroundColor[i],
                  strokeStyle: data.datasets[0].backgroundColor[i],
                  fontColor: corTexto,            // ← FIX: explicito
                  lineWidth: 0,
                  hidden: false,
                  index: i
                };
              });
            }
          }
        },
        tooltip: {
          backgroundColor: isLight ? "rgba(255,255,255,0.98)" : "rgba(13, 20, 25, 0.98)",
          titleColor: isLight ? "#1a1f2a" : "#f3f5f7",
          bodyColor: isLight ? "#3a414d" : "#c9d0d8",
          borderColor: PALETA_DOUGHNUT[0], borderWidth: 1,
          padding: 10, cornerRadius: 6,
          callbacks: {
            label: ctx => {
              const valor = ctx.parsed;
              const total = valores.reduce((a, b) => a + b, 0);
              const perc = total > 0 ? (valor / total * 100).toFixed(1) : 0;
              return `${ctx.label}: ${fmtNumero(valor)} (${perc}%)`;
            }
          }
        }
      }
    }
  });
}

// ================== GRAFICO POR DIA DA SEMANA ==================

function renderGraficoDiaSemana(atividades) {
  const canvas = document.getElementById("graficoDiaSemana");
  if (!canvas || typeof Chart === "undefined") return;
  if (estado.chartDiaSemana) estado.chartDiaSemana.destroy();

  // Conta por dia da semana
  const contagem = [0, 0, 0, 0, 0, 0, 0]; // Dom-Sáb
  (atividades || []).forEach(a => {
    if (!a.dtInicial) return;
    const dt = new Date(a.dtInicial);
    if (Number.isNaN(dt.getTime())) return;
    contagem[dt.getDay()]++;
  });

  // Reordena pra começar segunda-feira (índice 1)
  const ordem = [1, 2, 3, 4, 5, 6, 0];
  const labels = ordem.map(i => DIAS_SEMANA[i]);
  const valores = ordem.map(i => contagem[i]);
  // Dias úteis em verde forte, fim de semana em verde claro
  const cores = ordem.map(i => {
    if (i === 0 || i === 6) return "rgba(61, 140, 94, 0.35)";
    return "#3d8c5e";
  });

  const isLight = document.body.classList.contains("light-theme");
  const corTexto = isLight ? "#5b6571" : "#8a93a0";
  const corGrid = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)";

  const ctx = canvas.getContext("2d");
  estado.chartDiaSemana = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        data: valores, backgroundColor: cores,
        borderRadius: 4, borderSkipped: false,
        maxBarThickness: 40
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isLight ? "rgba(255,255,255,0.98)" : "rgba(13, 20, 25, 0.98)",
          titleColor: isLight ? "#1a1f2a" : "#f3f5f7",
          bodyColor: isLight ? "#3a414d" : "#c9d0d8",
          borderColor: "#3d8c5e", borderWidth: 1,
          padding: 10, cornerRadius: 6, displayColors: false,
          callbacks: { label: ctx => `  ${fmtNumero(ctx.parsed.y)} atividades` }
        }
      },
      scales: {
        x: {
          ticks: { color: corTexto, font: { family: "JetBrains Mono", size: 10, weight: "500" } },
          grid: { display: false }, border: { color: corGrid }
        },
        y: {
          beginAtZero: true,
          ticks: { color: corTexto, font: { family: "JetBrains Mono", size: 10 },
                   callback: v => fmtNumero(v), maxTicksLimit: 5 },
          grid: { color: corGrid, drawTicks: false }, border: { display: false }
        }
      }
    }
  });
}

// ================== RANKING DE VISITAS (visão geral) ==================

function renderRankingAtividades(ranking) {
  const el = document.getElementById("rankingVisitas");
  if (!el) return;
  if (!ranking.length) {
    el.innerHTML = '<div class="ativ-empty">Nenhuma atividade</div>';
    return;
  }
  // Mostra TODOS os vendedores (o scroll interno cuida da altura)
  const top = ranking;
  const maxTotal = Math.max(...top.map(r => r.total), 1);
  el.innerHTML = top.map((r, idx) => {
    const widthBar = (r.total / maxTotal) * 100;
    return `
      <div class="rank-row">
        <span class="rank-pos">${idx + 1}º</span>
        <div class="rank-avatar">${iniciais(r.vendedor)}</div>
        <div class="rank-nome-bloco">
          <div class="rank-nome">${escapeHtml(r.vendedor || "—")}</div>
          <div class="rank-detalhe">${r.total} atividade${r.total === 1 ? "" : "s"}</div>
        </div>
        <div class="rank-bar-wrap">
          <div class="rank-bar" style="width:${widthBar}%"></div>
        </div>
        <span class="rank-taxa">${fmtNumero(r.total)}</span>
      </div>
    `;
  }).join("");
}

// ================== CONVERSAO ==================

function renderConversao(conversao, totalVendasPeriodo) {
  setText("convVisitados", fmtNumero(conversao.visitados));
  setText("convClientesConv", fmtNumero(conversao.convertidos));
  setText("convTaxaGeral", fmtPerc(conversao.taxa_geral));
  setText("convPedidos", fmtNumero(conversao.pedidos_convertidos));
  setText("convValorConv", fmtMoedaCompacto(conversao.valor_convertido));
  setText("convTicket", fmtMoeda(conversao.ticket_medio));
  const dias = conversao.dias_medio_ate_venda;
  setText("convDiasMedio",
    dias !== null && dias !== undefined
      ? fmtNumeroDecimal(dias) + " dias"
      : "-");
  setText("convTotalVendas", fmtMoedaCompacto(totalVendasPeriodo || 0));

  estado.rankingConversaoCompleto = conversao.ranking || [];
  renderConversaoCards();
}

// ================== CLASSIFICAÇÃO DE VENDEDOR ==================
//
// Cada vendedor recebe um score composto (0-100) baseado em 3 dimensões:
//
// 1. VOLUME (max 30 pts) — quantas visitas vs média da equipe
// 2. CONVERSÃO (max 40 pts) — taxa de conversão + cobertura da carteira
// 3. RESULTADO (max 30 pts) — valor convertido + ticket por visita
//
// Classificação final:
//   85+  EXCELENTE       (verde forte)
//   65+  BOM             (verde)
//   45+  MÉDIO           (amarelo)
//   25+  ATENÇÃO         (laranja)
//   <25  CRÍTICO         (vermelho)
//
// Casos especiais:
// - pedidos_por_convertido > 3 + convertidos < 5: "CARTEIRA VICIADA"
//   (faz muita recompra mas não converte clientes novos)
// - visitados < média/2 + taxa alta: "POUCO TRABALHO"
//   (taxa boa mas trabalha pouco)
// - visitados > média*1.5 + taxa < 0.10: "MUITO TRABALHO, POUCO RESULTADO"

function calcularEstatisticasEquipe(ranking) {
  if (!ranking.length) return null;
  const visitas = ranking.map(r => Number(r.visitados || 0));
  const valores = ranking.map(r => Number(r.valor_convertido || 0));
  const ticketsPorVisita = ranking
    .map(r => Number(r.ticket_por_visita || 0))
    .filter(v => v > 0);
  const coberturas = ranking
    .map(r => Number(r.cobertura_carteira || 0))
    .filter(v => v > 0);

  const media = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  return {
    mediaVisitas: media(visitas),
    maxVisitas: Math.max(...visitas, 1),
    mediaValor: media(valores),
    maxValor: Math.max(...valores, 1),
    mediaTicketPorVisita: media(ticketsPorVisita),
    mediaCobertura: media(coberturas)
  };
}

function classificarVendedor(r, stats) {
  if (!stats) return { score: 0, nivel: "medio", label: "MÉDIO", flag: null };

  const visitados = Number(r.visitados || 0);
  const convertidos = Number(r.convertidos || 0);
  const taxa = Number(r.taxa || 0);
  const valor = Number(r.valor_convertido || 0);
  const cobertura = Number(r.cobertura_carteira || 0);
  const ticketPorVisita = Number(r.ticket_por_visita || 0);
  const pedidosPorConv = Number(r.pedidos_por_convertido || 0);

  // === Dimensão 1: VOLUME (30 pts) ===
  // Bate ou supera a média = 20 pts. Dobro da média = 30 pts.
  let pVolume = 0;
  if (stats.mediaVisitas > 0) {
    pVolume = Math.min(30, (visitados / stats.mediaVisitas) * 20);
  }

  // === Dimensão 2: CONVERSÃO (40 pts) ===
  // Taxa: 25 pts. >=50% = 25, 25-50% = 15, <25% = proporcional
  let pTaxa = 0;
  if (taxa >= 0.50) pTaxa = 25;
  else if (taxa >= 0.25) pTaxa = 15 + ((taxa - 0.25) / 0.25) * 10;
  else pTaxa = (taxa / 0.25) * 15;

  // Cobertura da carteira: 15 pts.
  let pCobertura = 0;
  if (stats.mediaCobertura > 0) {
    pCobertura = Math.min(15, (cobertura / stats.mediaCobertura) * 10);
  }

  // === Dimensão 3: RESULTADO (30 pts) ===
  // Valor: 20 pts (relativo à média)
  let pValor = 0;
  if (stats.mediaValor > 0) {
    pValor = Math.min(20, (valor / stats.mediaValor) * 12);
  }

  // Ticket por visita (eficiência): 10 pts
  let pTicket = 0;
  if (stats.mediaTicketPorVisita > 0) {
    pTicket = Math.min(10, (ticketPorVisita / stats.mediaTicketPorVisita) * 7);
  }

  const score = pVolume + pTaxa + pCobertura + pValor + pTicket;

  let nivel, label;
  if (score >= 85) { nivel = "excelente"; label = "EXCELENTE"; }
  else if (score >= 65) { nivel = "bom"; label = "BOM"; }
  else if (score >= 45) { nivel = "medio"; label = "MÉDIO"; }
  else if (score >= 25) { nivel = "atencao"; label = "ATENÇÃO"; }
  else { nivel = "critico"; label = "CRÍTICO"; }

  // === Flags especiais ===
  let flag = null;
  if (pedidosPorConv > 3 && convertidos < 5 && convertidos > 0) {
    flag = { tipo: "viciada", texto: "Carteira viciada — recompra alta, conversão nova baixa" };
  } else if (visitados < stats.mediaVisitas * 0.5 && taxa >= 0.25 && visitados >= 5) {
    flag = { tipo: "ocioso", texto: "Pouco trabalho — taxa boa mas faz poucas visitas" };
  } else if (visitados > stats.mediaVisitas * 1.5 && taxa < 0.10) {
    flag = { tipo: "improdutivo", texto: "Muito trabalho, pouco resultado — taxa muito baixa" };
  } else if (visitados < 5 && stats.mediaVisitas >= 20) {
    flag = { tipo: "ausente", texto: "Praticamente sem atividade no período" };
  }

  return {
    score: Math.round(score),
    nivel, label, flag,
    detalhes: {
      volume: Math.round(pVolume),
      taxa: Math.round(pTaxa),
      cobertura: Math.round(pCobertura),
      valor: Math.round(pValor),
      ticket: Math.round(pTicket)
    }
  };
}

function renderConversaoCards() {
  const el = document.getElementById("convCardsWrap");
  if (!el) return;

  let lista = [...estado.rankingConversaoCompleto];

  // Filtro mínimo
  if (estado.filtroMinimo) {
    lista = lista.filter(r => Number(r.visitados || 0) >= MIN_VISITAS_RANKING_DEFAULT);
  }

  // Stats da equipe (sem o filtro mínimo pra ter média real)
  const stats = calcularEstatisticasEquipe(
    estado.rankingConversaoCompleto.filter(r => Number(r.visitados || 0) >= MIN_VISITAS_RANKING_DEFAULT)
  );

  // Anexa classificação a cada vendedor
  const listaClassificada = lista.map(r => ({
    ...r,
    _classif: classificarVendedor(r, stats)
  }));

  // Ordenação
  switch (estado.ordenacao) {
    case "taxa-desc":
      listaClassificada.sort((a, b) => Number(b.taxa) - Number(a.taxa)); break;
    case "taxa-asc":
      listaClassificada.sort((a, b) => Number(a.taxa) - Number(b.taxa)); break;
    case "valor-desc":
      listaClassificada.sort((a, b) => Number(b.valor_convertido) - Number(a.valor_convertido)); break;
    case "pedidos-desc":
      listaClassificada.sort((a, b) => Number(b.pedidos) - Number(a.pedidos)); break;
    case "visitados-desc":
      listaClassificada.sort((a, b) => Number(b.visitados) - Number(a.visitados)); break;
    case "score-desc":
    default:
      listaClassificada.sort((a, b) => b._classif.score - a._classif.score); break;
  }

  // Toolbar info
  const totalListaCompleta = estado.rankingConversaoCompleto.length;
  const exibidos = listaClassificada.length;
  setText("convToolbarInfo",
    `MOSTRANDO ${fmtNumero(exibidos)} DE ${fmtNumero(totalListaCompleta)} VENDEDORES`);

  if (!listaClassificada.length) {
    el.innerHTML = '<div class="ativ-empty">Sem dados que atendem o filtro</div>';
    renderAlertasEquipe([], stats);
    return;
  }

  const maxValor = Math.max(...listaClassificada.map(r => Number(r.valor_convertido || 0)), 1);

  // Renderiza alertas de equipe primeiro
  renderAlertasEquipe(listaClassificada, stats);

  // Cards
  el.innerHTML = listaClassificada.map((r, idx) => {
    const valorConv = Number(r.valor_convertido || 0);
    const widthBar = Math.max(1, (valorConv / maxValor) * 100);
    const c = r._classif;
    const taxa = Number(r.taxa || 0);
    const pedidosPorConv = Number(r.pedidos_por_convertido || 0);
    const cobertura = Number(r.cobertura_carteira || 0);

    const cardClasse = `nivel-${c.nivel}`;

    // Cor da barra acompanha o nível
    let barClasse = "";
    if (c.nivel === "atencao") barClasse = "conv-rank-card-bar-warn";
    else if (c.nivel === "critico") barClasse = "conv-rank-card-bar-danger";
    else if (c.nivel === "medio") barClasse = "conv-rank-card-bar-warn";

    // Coloração da taxa (semáforo)
    let taxaClasse = "taxa-baixa";
    if (taxa >= 0.50) taxaClasse = "taxa-alta";
    else if (taxa >= 0.25) taxaClasse = "taxa-media";

    // Flag de alerta no card
    const flagHtml = c.flag
      ? `<div class="conv-card-flag flag-${c.flag.tipo}" title="${escapeHtml(c.flag.texto)}">${escapeHtml(c.flag.texto)}</div>`
      : "";

    return `
      <div class="conv-rank-card ${cardClasse}" data-vendedor="${escapeHtml(r.vendedor || '')}">
        <span class="conv-rank-card-pos">${idx + 1}</span>
        <div class="conv-rank-card-avatar">${iniciais(r.vendedor)}</div>
        <div class="conv-rank-card-nome-bloco">
          <span class="conv-rank-card-nome">${escapeHtml(r.vendedor || "—")}</span>
          <div class="conv-rank-card-bar-wrap">
            <div class="conv-rank-card-bar ${barClasse}" style="width:${widthBar}%"></div>
          </div>
          ${flagHtml}
        </div>
        <div class="conv-metric">
          <span class="conv-metric-label">Visitas</span>
          <span class="conv-metric-valor info">${fmtNumero(r.visitados)}</span>
          <span class="conv-metric-sub">${r.clientes_carteira ? `de ${fmtNumero(r.clientes_carteira)} cart.` : ""}</span>
        </div>
        <div class="conv-metric">
          <span class="conv-metric-label">Conv.</span>
          <span class="conv-metric-valor accent">${fmtNumero(r.convertidos)}</span>
          <span class="conv-metric-sub">${cobertura > 0 ? fmtPerc(cobertura, 0) + " cart." : ""}</span>
        </div>
        <div class="conv-metric">
          <span class="conv-metric-label">Pedidos</span>
          <span class="conv-metric-valor info">${fmtNumero(r.pedidos)}</span>
          <span class="conv-metric-sub">${pedidosPorConv > 0 ? fmtNumeroDecimal(pedidosPorConv) + "/conv." : ""}</span>
        </div>
        <div class="conv-metric">
          <span class="conv-metric-label">Valor</span>
          <span class="conv-metric-valor accent">${fmtMoedaCompacto(r.valor_convertido)}</span>
          <span class="conv-metric-sub">${r.ticket_por_visita > 0 ? fmtMoedaCompacto(r.ticket_por_visita) + "/vis." : ""}</span>
        </div>
        <div class="conv-rank-card-taxa">
          <span class="conv-rank-card-taxa-valor ${taxaClasse}">${fmtPerc(taxa)}</span>
          <span class="conv-rank-card-taxa-label">TAXA</span>
        </div>
        <div class="conv-rank-card-score">
          <span class="conv-rank-card-score-label">NOTA</span>
          <span class="conv-rank-card-score-valor">${c.score}</span>
          <span class="conv-rank-card-badge badge-${c.nivel}">${c.label}</span>
        </div>
      </div>
    `;
  }).join("");
}

function renderAlertasEquipe(listaClassificada, stats) {
  const wrap = document.getElementById("convAlertasWrap");
  if (!wrap) return;

  if (!listaClassificada.length || !stats) {
    wrap.innerHTML = "";
    wrap.style.display = "none";
    return;
  }

  // Top 3 e Bottom 3 por score
  const porScore = [...listaClassificada].sort((a, b) => b._classif.score - a._classif.score);
  const heroes = porScore.slice(0, 3).filter(v => v._classif.nivel === "excelente" || v._classif.nivel === "bom");
  const criticos = porScore.slice(-5).reverse().filter(v => v._classif.nivel === "critico" || v._classif.nivel === "atencao");

  // Vendedores com flag
  const comFlags = listaClassificada.filter(v => v._classif.flag);

  const html = [];

  // Heroes
  if (heroes.length) {
    html.push(`
      <div class="alerta-card alerta-success">
        <div class="alerta-titulo">
          <svg class="icon-14" aria-hidden="true"><use href="#icon-trophy"/></svg>
          DESTAQUES DA EQUIPE
        </div>
        <div class="alerta-lista">
          ${heroes.map(v => `
            <div class="alerta-item">
              <span class="alerta-avatar">${iniciais(v.vendedor)}</span>
              <span class="alerta-nome">${escapeHtml(v.vendedor)}</span>
              <span class="alerta-score">NOTA ${v._classif.score}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `);
  }

  // Críticos
  if (criticos.length) {
    html.push(`
      <div class="alerta-card alerta-danger">
        <div class="alerta-titulo">
          <svg class="icon-14" aria-hidden="true"><use href="#icon-alert"/></svg>
          PRECISAM DE ATENÇÃO
        </div>
        <div class="alerta-lista">
          ${criticos.map(v => `
            <div class="alerta-item">
              <span class="alerta-avatar">${iniciais(v.vendedor)}</span>
              <span class="alerta-nome">${escapeHtml(v.vendedor)}</span>
              <span class="alerta-score">NOTA ${v._classif.score}</span>
            </div>
          `).join("")}
        </div>
      </div>
    `);
  }

  // Flags especiais (carteira viciada / ocioso / improdutivo)
  if (comFlags.length) {
    const flagsMap = {
      viciada: { titulo: "Carteira viciada", cor: "alerta-warn" },
      ocioso: { titulo: "Vendedor com pouco volume", cor: "alerta-warn" },
      improdutivo: { titulo: "Muito esforço, pouco resultado", cor: "alerta-danger" },
      ausente: { titulo: "Ausente no período", cor: "alerta-danger" }
    };

    // Agrupa por tipo
    const porTipo = {};
    comFlags.forEach(v => {
      const tipo = v._classif.flag.tipo;
      if (!porTipo[tipo]) porTipo[tipo] = [];
      porTipo[tipo].push(v);
    });

    Object.entries(porTipo).forEach(([tipo, vendedores]) => {
      const info = flagsMap[tipo] || { titulo: "Atenção", cor: "alerta-warn" };
      html.push(`
        <div class="alerta-card ${info.cor}">
          <div class="alerta-titulo">
            <svg class="icon-14" aria-hidden="true"><use href="#icon-alert"/></svg>
            ${info.titulo.toUpperCase()} <span class="alerta-count">(${vendedores.length})</span>
          </div>
          <div class="alerta-lista">
            ${vendedores.slice(0, 4).map(v => `
              <div class="alerta-item">
                <span class="alerta-avatar">${iniciais(v.vendedor)}</span>
                <span class="alerta-nome">${escapeHtml(v.vendedor)}</span>
              </div>
            `).join("")}
            ${vendedores.length > 4 ? `<div class="alerta-item alerta-mais">+${vendedores.length - 4}</div>` : ""}
          </div>
        </div>
      `);
    });
  }

  if (!html.length) {
    wrap.innerHTML = "";
    wrap.style.display = "none";
    return;
  }

  wrap.style.display = "";
  wrap.innerHTML = html.join("");
}

// ================== MAPA ==================

// ================== MAPA ==================

// Tile providers (dark, light, satelite)
const MAPA_TILES = {
  dark: {
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
    subdomains: "abcd"
  },
  light: {
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 19,
    subdomains: "abcd"
  },
  sat: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles © Esri",
    maxZoom: 19
  }
};

// Cria marker VISYA: pin verde com inicial do cliente dentro
function criarMarkerVisya(atividade) {
  const inicial = (atividade.cliente || "?").trim()[0]?.toUpperCase() || "?";
  const html = `
    <div class="visya-marker">
      <svg viewBox="0 0 32 42" width="32" height="42" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="vmShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.35"/>
          </filter>
        </defs>
        <path d="M16 0C7.2 0 0 7.2 0 16c0 10 16 26 16 26s16-16 16-26C32 7.2 24.8 0 16 0z"
              fill="#3d8c5e" stroke="#2a6242" stroke-width="1.5" filter="url(#vmShadow)"/>
        <circle cx="16" cy="16" r="9" fill="#0a0e14" opacity="0.95"/>
        <text x="16" y="20" text-anchor="middle"
              font-family="Inter, sans-serif" font-size="11" font-weight="700"
              fill="#3d8c5e">${escapeHtml(inicial)}</text>
      </svg>
    </div>
  `;
  return L.divIcon({
    html,
    className: "visya-marker-wrap",
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -36]
  });
}

function renderMapa(atividades) {
  const mapEl = document.getElementById("mapaAtividades");
  if (!mapEl || typeof L === "undefined") return;

  // Cria mapa só uma vez
  if (!estado.mapLayer) {
    estado.mapLayer = L.map("mapaAtividades", {
      zoomControl: true,
      attributionControl: true,
      preferCanvas: true
    }).setView([-19.0, -40.0], 7);

    // Tile inicial (dark)
    const t = MAPA_TILES.dark;
    estado.mapTileLayer = L.tileLayer(t.url, {
      attribution: t.attribution,
      maxZoom: t.maxZoom,
      subdomains: t.subdomains || "abc"
    }).addTo(estado.mapLayer);
    estado.mapEstiloAtual = "dark";

    // Camada de marcadores: cluster ou layerGroup
    estado.mapClusterAtivo = true;
    estado.mapMarkers = criarLayerMarcadores(estado.mapClusterAtivo);
    estado.mapLayer.addLayer(estado.mapMarkers);
  } else {
    if (estado.mapMarkers) estado.mapMarkers.clearLayers();
  }

  const comGps = atividades.filter(a => a.tem_gps && a.latitude && a.longitude);
  const bounds = [];

  comGps.forEach(a => {
    const popup = `
      <div class="popup-mapa">
        <div class="popup-mapa-cliente">${escapeHtml(a.cliente || "—")}</div>
        <div class="popup-mapa-tipo">${escapeHtml(a.tipo || "—")}</div>
        <div class="popup-mapa-info">
          <span class="popup-mapa-label">Vendedor:</span>
          <span>${escapeHtml(a.vendedor || "—")}</span>
        </div>
        <div class="popup-mapa-info">
          <span class="popup-mapa-label">Data:</span>
          <span>${fmtData(a.dtInicial)}</span>
        </div>
        ${a.assunto ? `<div class="popup-mapa-assunto">${escapeHtml(a.assunto)}</div>` : ""}
      </div>
    `;
    const m = L.marker([a.latitude, a.longitude], {
      icon: criarMarkerVisya(a),
      riseOnHover: true
    }).bindPopup(popup);
    estado.mapMarkers.addLayer(m);
    bounds.push([a.latitude, a.longitude]);
  });

  if (bounds.length > 0) {
    estado.mapLayer.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }
}

function criarLayerMarcadores(cluster) {
  if (cluster && typeof L.markerClusterGroup === "function") {
    return L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      spiderfyOnMaxZoom: true,
      maxClusterRadius: 50,
      iconCreateFunction: (clusterGroup) => {
        const total = clusterGroup.getChildCount();
        // Tamanho proporcional
        let size = 36;
        if (total >= 1000) size = 56;
        else if (total >= 100) size = 48;
        else if (total >= 10) size = 40;

        const html = `
          <div class="visya-cluster" style="width:${size}px;height:${size}px;line-height:${size}px;">
            ${fmtNumero(total)}
          </div>
        `;
        return L.divIcon({
          html,
          className: "visya-cluster-wrap",
          iconSize: L.point(size, size)
        });
      }
    });
  }
  return L.layerGroup();
}

function trocarEstiloMapa(estilo) {
  if (!estado.mapLayer) return;
  const t = MAPA_TILES[estilo];
  if (!t) return;

  if (estado.mapTileLayer) {
    estado.mapLayer.removeLayer(estado.mapTileLayer);
  }
  estado.mapTileLayer = L.tileLayer(t.url, {
    attribution: t.attribution,
    maxZoom: t.maxZoom,
    subdomains: t.subdomains || "abc"
  }).addTo(estado.mapLayer);
  estado.mapEstiloAtual = estilo;
}

function alternarClusterMapa(ativo) {
  if (!estado.mapLayer) return;
  estado.mapClusterAtivo = !!ativo;

  // Salva marcadores existentes
  const markersAtuais = [];
  if (estado.mapMarkers) {
    estado.mapMarkers.eachLayer(l => markersAtuais.push(l));
    estado.mapLayer.removeLayer(estado.mapMarkers);
  }

  estado.mapMarkers = criarLayerMarcadores(estado.mapClusterAtivo);
  markersAtuais.forEach(m => estado.mapMarkers.addLayer(m));
  estado.mapLayer.addLayer(estado.mapMarkers);
}

function ajustarZoomMapa() {
  if (!estado.mapLayer || !estado.atividadesAcumuladas.length) return;
  const comGps = estado.atividadesAcumuladas.filter(a => a.tem_gps && a.latitude && a.longitude);
  const bounds = comGps.map(a => [a.latitude, a.longitude]);
  if (bounds.length > 0) {
    estado.mapLayer.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }
}

// ================== MAPA DETALHE ==================

function renderMapaDetalhe(lat, lng, titulo) {
  const wrap = document.getElementById("detalheMapaWrap");
  const mapEl = document.getElementById("detalheMapa");
  if (!wrap || !mapEl || typeof L === "undefined") return;
  if (!lat || !lng) { wrap.style.display = "none"; return; }
  wrap.style.display = "";
  if (estado.mapaDetalhe) { estado.mapaDetalhe.remove(); estado.mapaDetalhe = null; }
  setTimeout(() => {
    estado.mapaDetalhe = L.map("detalheMapa", {
      zoomControl: true, attributionControl: false
    }).setView([lat, lng], 15);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(estado.mapaDetalhe);
    L.marker([lat, lng]).addTo(estado.mapaDetalhe).bindPopup(titulo || "Aqui");
    estado.mapaDetalhe.invalidateSize();
  }, 60);
}

// ================== MODAL DETALHE ==================

function abrirModalDetalhe(atividade) {
  const modal = document.getElementById("modalDetalheAtividade");
  setText("detalheTitulo", atividade.tipo || "Atividade");
  setText("detalheData", fmtDataHora(atividade.dtInicial));
  setText("detalheVendedor", atividade.vendedor || "—");
  setText("detalheCliente", atividade.cliente || "—");
  setText("detalheAssunto", atividade.assunto || "—");
  setText("detalheObservacao", atividade.observacao || "—");

  const statusEl = document.getElementById("detalheStatus");
  if (statusEl) {
    const info = STATUS_LABELS[atividade.idStatus];
    statusEl.innerHTML = info
      ? `<span class="status-pill ${info.pill}">${info.label}</span>`
      : "—";
  }

  if (atividade.tem_gps && atividade.latitude && atividade.longitude) {
    renderMapaDetalhe(atividade.latitude, atividade.longitude, atividade.cliente);
  } else {
    document.getElementById("detalheMapaWrap").style.display = "none";
  }
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function fecharModalDetalhe() {
  const modal = document.getElementById("modalDetalheAtividade");
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  if (estado.mapaDetalhe) { estado.mapaDetalhe.remove(); estado.mapaDetalhe = null; }
}

// ================== LISTAGEM (tabela) ==================

function renderTabelaAtividades(atividades, append = false) {
  const tbody = document.getElementById("tbodyAtividades");
  if (!tbody) return;
  if (!append) tbody.innerHTML = "";

  if (!atividades.length && !append) {
    tbody.innerHTML = '<tr><td colspan="8" class="ativ-empty">Nenhuma atividade encontrada</td></tr>';
    return;
  }

  const baseIdx = append ? (estado.atividadesAcumuladas.length - atividades.length) : 0;

  const html = atividades.map((a, i) => {
    const idxGlobal = baseIdx + i;
    return `
      <tr data-idx="${idxGlobal}">
        <td>${fmtData(a.dtInicial)}</td>
        <td title="${escapeHtml(a.tipo || '')}">${escapeHtml(a.tipo || "—")}</td>
        <td title="${escapeHtml(a.cliente || '')}">${escapeHtml(a.cliente || "—")}</td>
        <td title="${escapeHtml(a.vendedor || '')}">${escapeHtml(a.vendedor || "—")}</td>
        <td title="${escapeHtml(a.assunto || '')}">${escapeHtml(a.assunto || "—")}</td>
        <td title="${escapeHtml(a.observacao || '')}">${escapeHtml(a.observacao || "—")}</td>
        <td class="${a.tem_gps ? 'gps-on' : 'gps-off'}">${a.tem_gps ? "●" : "—"}</td>
        <td class="td-acoes">
          <button type="button" class="btn-acoes" data-idx="${idxGlobal}" title="Ver detalhes">
            <svg class="icon-14" aria-hidden="true"><use href="#icon-list"/></svg>
          </button>
        </td>
      </tr>
    `;
  }).join("");
  tbody.insertAdjacentHTML("beforeend", html);
}

function atualizarInfoAtividades() {
  const total = estado.ultimaResposta?.cards?.total_atividades ?? 0;
  const exibidas = estado.atividadesAcumuladas.length;
  const tempo = estado.ultimaResposta?.meta?.tempo_total_ms ?? 0;
  setText("infoAtividades",
    `MOSTRANDO ${fmtNumero(exibidas)} DE ${fmtNumero(total)} · ${tempo}MS`);
}

// ================== SCROLL INFINITO ==================

function initScrollInfinito() {
  const tbody = document.getElementById("tbodyAtividades");
  const wrapper = document.querySelector(".ativ-table-wrapper");
  if (!tbody || !wrapper) return;

  const sentinela = document.createElement("tr");
  sentinela.id = "scrollSentinela";
  sentinela.innerHTML = '<td colspan="8" style="height: 1px; padding: 0; border: none;"></td>';

  if (scrollObserver) scrollObserver.disconnect();

  // BUG FIX: root = wrapper (não viewport). Sem isso, a sentinela nunca
  // entra na "viewport" porque o scroll é dentro da tabela.
  scrollObserver = new IntersectionObserver(async (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (estado.carregandoMais) continue;
      if (estado.page >= estado.totalPages) continue;

      estado.carregandoMais = true;
      console.log(`[ATIV] sentinela visível → página ${estado.page + 1} de ${estado.totalPages}`);
      mostrarIndicadorCarregandoMais(true);
      try {
        const { atividades, pagination } = await fetchListagem(estado.page + 1);
        estado.page = pagination.page;
        estado.totalPages = pagination.totalPages;
        estado.atividadesAcumuladas.push(...atividades);
        renderTabelaAtividades(atividades, true);
        if (estado.mapLayer) renderMapa(estado.atividadesAcumuladas);
        atualizarInfoAtividades();
        reanexarSentinela();
      } catch (e) {
        if (e.name !== "AbortError") {
          console.error("[ATIV] erro scroll infinito:", e);
          mostrarToast("Erro ao carregar mais atividades.", true);
        }
      } finally {
        mostrarIndicadorCarregandoMais(false);
        estado.carregandoMais = false;
      }
    }
  }, { root: wrapper, rootMargin: "400px", threshold: 0 });

  reanexarSentinela(sentinela);
}

function reanexarSentinela(elementoOpcional) {
  const tbody = document.getElementById("tbodyAtividades");
  if (!tbody) return;
  let sentinela = document.getElementById("scrollSentinela");
  if (!sentinela && elementoOpcional) sentinela = elementoOpcional;
  if (!sentinela) {
    sentinela = document.createElement("tr");
    sentinela.id = "scrollSentinela";
    sentinela.innerHTML = '<td colspan="8" style="height: 1px; padding: 0; border: none;"></td>';
  }
  tbody.appendChild(sentinela);
  if (scrollObserver) {
    scrollObserver.unobserve(sentinela);
    scrollObserver.observe(sentinela);
  }
}

function mostrarIndicadorCarregandoMais(ativo) {
  const tbody = document.getElementById("tbodyAtividades");
  if (!tbody) return;
  let loader = document.getElementById("scrollLoaderRow");
  if (ativo) {
    if (loader) return;
    loader = document.createElement("tr");
    loader.id = "scrollLoaderRow";
    loader.innerHTML = '<td colspan="8" class="ativ-empty">Carregando mais atividades...</td>';
    const sentinela = document.getElementById("scrollSentinela");
    if (sentinela) tbody.insertBefore(loader, sentinela);
    else tbody.appendChild(loader);
  } else {
    if (loader) loader.remove();
  }
}

// ================== ABAS ==================

function initAbas() {
  const botoes = document.querySelectorAll(".tab-btn");
  const paineis = document.querySelectorAll(".tab-panel");
  botoes.forEach(btn => {
    btn.addEventListener("click", () => {
      const alvo = btn.dataset.tab;
      botoes.forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      paineis.forEach(p => p.classList.toggle("is-active", p.id === `tab-${alvo}`));
      if (alvo === "mapa") {
        setTimeout(() => {
          if (estado.mapLayer) {
            estado.mapLayer.invalidateSize();
            ajustarZoomMapa();
          }
        }, 100);
      }
    });
  });
}

// ================== EXPORT CSV ==================

function exportarCSV() {
  const linhas = estado.atividadesAcumuladas;
  if (!linhas.length) {
    mostrarToast("Nenhuma atividade carregada para exportar.", true);
    return;
  }
  abrirConfirmacao(
    "Exportar CSV?",
    `Serão exportadas ${fmtNumero(linhas.length)} atividade(s). Deseja continuar?`,
    () => {
      const cabecalho = ["Data","Tipo","Cliente","Vendedor","Assunto","Observação",
                          "Latitude","Longitude","CODPARC","CODVEND","Status"];
      const csv = [cabecalho.join(";")];
      linhas.forEach(a => {
        const linha = [
          fmtData(a.dtInicial), a.tipo || "", a.cliente || "", a.vendedor || "",
          a.assunto || "", (a.observacao || "").replace(/[\r\n;]+/g, " "),
          a.latitude ?? "", a.longitude ?? "", a.codparc ?? "", a.codvend ?? "", a.idStatus ?? ""
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(";");
        csv.push(linha);
      });
      const blob = new Blob(["\ufeff" + csv.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const hoje = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `atividades-${hoje}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      mostrarToast(`${fmtNumero(linhas.length)} atividade(s) exportadas.`);
    }
  );
}

// ================== FILTROS ==================

function lerFiltrosDoDOM() {
  estado.filtros.dtInicio = document.getElementById("fDtInicio")?.value || null;
  estado.filtros.dtFim = document.getElementById("fDtFim")?.value || null;
  const v = document.getElementById("fVendedor")?.value || "";
  estado.filtros.vendedor = v.trim() || null;
  const t = document.getElementById("fTipoAtiv")?.value || "";
  estado.filtros.tipoAtividade = t.trim() || null;
  const s = document.getElementById("fIdStatus")?.value || "";
  estado.filtros.idStatus = s !== "" ? Number(s) : null;
  const e = document.getElementById("fEmpresa")?.value || "linhagro";
  estado.filtros.empresa = e || "linhagro";
}

function limparFiltros() {
  ["fDtInicio","fDtFim","fVendedor","fTipoAtiv","fIdStatus"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const eEmpresa = document.getElementById("fEmpresa");
  if (eEmpresa) eEmpresa.value = "linhagro";
  limparChipsPeriodo();
}

// ================== CARREGAMENTO PRINCIPAL ==================

async function carregarDashboard() {
  setLoading(true);
  try {
    lerFiltrosDoDOM();
    estado.page = 1;
    estado.atividadesAcumuladas = [];

    const [json, listagem] = await Promise.all([
      fetchDashboard(1),
      fetchListagem(1)
    ]);

    estado.ultimaResposta = json;
    estado.totalPages = listagem.pagination?.totalPages || 1;
    estado.atividadesAcumuladas = [...listagem.atividades];

    renderCards(json.cards);
    renderKPIsGestao(json.cards, json.conversao, json.ranking_atividades);
    renderConversao(json.conversao, json.cards.valor_vendas_periodo);
    renderGraficoEvolucao(json.evolucao_mensal || []);
    renderGraficoTipoAtividade(estado.atividadesAcumuladas);
    renderGraficoDiaSemana(estado.atividadesAcumuladas);
    renderRankingAtividades(json.ranking_atividades || []);
    renderTabelaAtividades(estado.atividadesAcumuladas, false);
    renderMapa(estado.atividadesAcumuladas);
    atualizarInfoAtividades();

    popularSelectVendedoresDoBackend(json.ranking_atividades);

    console.log(`[ATIV] OK | total=${listagem.pagination?.totalCount} | totalPages=${estado.totalPages}`);
  } catch (e) {
    if (e.name === "AbortError") return;
    console.error("[ATIV] erro:", e);
    mostrarToast("Erro ao carregar dados. Tente novamente.", true);
    const tbody = document.getElementById("tbodyAtividades");
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="8" class="ativ-empty">Erro ao carregar.</td></tr>';
    }
  } finally {
    setLoading(false);
  }
}

// ================== INIT ==================

window.addEventListener("DOMContentLoaded", () => {
  const user = getUsuarioObrigatorio();
  if (!user) return;

  setText("ativUserNome", user.nome || "Usuário VISYA");
  setText("ativUserEmail", user.email || "");

  popularSelectTipos();
  restaurarEstadoCabecalho();

  const debouncedCarregar = debounce(() => {
    limparChipsPeriodo();
    carregarDashboard();
  }, 500);

  ["fVendedor","fTipoAtiv","fIdStatus","fEmpresa"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", debouncedCarregar);
  });

  ["fDtInicio","fDtFim"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("change", debouncedCarregar);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); carregarDashboard(); }
    });
  });

  document.querySelectorAll(".chip-periodo").forEach(c => {
    c.addEventListener("click", () => aplicarPeriodoRapido(c.dataset.periodo));
  });

  document.getElementById("btnBuscar")?.addEventListener("click", () => {
    limparChipsPeriodo();
    carregarDashboard();
  });
  document.getElementById("btnLimpar")?.addEventListener("click", () => {
    limparFiltros();
    carregarDashboard();
    mostrarToast("Filtros limpos.");
  });
  document.getElementById("btnToggleCabecalho")?.addEventListener("click", toggleCabecalho);
  document.getElementById("btnMapaRecarregar")?.addEventListener("click", () => {
    if (estado.atividadesAcumuladas.length) {
      renderMapa(estado.atividadesAcumuladas);
      mostrarToast("Mapa recarregado.");
    }
  });
  document.getElementById("btnMapaAjustar")?.addEventListener("click", ajustarZoomMapa);

  // Switcher de estilo do mapa
  document.querySelectorAll(".mapa-estilo-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mapa-estilo-btn").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      trocarEstiloMapa(btn.dataset.estilo);
    });
  });

  // Toggle cluster
  document.getElementById("mapaClusterToggle")?.addEventListener("change", (e) => {
    alternarClusterMapa(e.target.checked);
  });

  document.getElementById("btnExportarCsv")?.addEventListener("click", exportarCSV);
  document.getElementById("btnFecharDetalhe")?.addEventListener("click", fecharModalDetalhe);
  document.getElementById("btnConfirmCancelar")?.addEventListener("click", fecharConfirmacao);
  document.getElementById("btnConfirmOk")?.addEventListener("click", () => {
    const cb = confirmCallback;
    fecharConfirmacao();
    if (typeof cb === "function") cb();
  });

  // Conversão: filtro mínimo + ordenação
  document.getElementById("convFiltroMinimo")?.addEventListener("change", (e) => {
    estado.filtroMinimo = e.target.checked;
    renderConversaoCards();
  });
  document.getElementById("convOrdenacao")?.addEventListener("change", (e) => {
    estado.ordenacao = e.target.value;
    renderConversaoCards();
  });

  // Click em linha ou botão de ações
  document.getElementById("tbodyAtividades")?.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-acoes");
    if (btn) {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      const atividade = estado.atividadesAcumuladas[idx];
      if (atividade) abrirModalDetalhe(atividade);
      return;
    }
    const tr = e.target.closest("tr[data-idx]");
    if (!tr) return;
    const idx = parseInt(tr.dataset.idx, 10);
    const atividade = estado.atividadesAcumuladas[idx];
    if (atividade) abrirModalDetalhe(atividade);
  });

  // Backdrop click fecha modais
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
  setupBackdropClose("modalDetalheAtividade", fecharModalDetalhe);
  setupBackdropClose("modalConfirmAtiv", fecharConfirmacao);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fecharModalDetalhe();
      fecharConfirmacao();
    }
  });

  initAbas();
  initScrollInfinito();
  carregarDashboard();
});