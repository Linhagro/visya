// js/atividades.js
console.log("[ATIV] Script atividades.js carregado.");

// ================== CONSTANTES ==================

const API_BASE_ATIV = (typeof window !== "undefined" && window.API_BASE)
  ? window.API_BASE
  : (typeof API_BASE !== "undefined" ? API_BASE : "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1");

const PAGE_SIZE = 100;
const DIAS_CONVERSAO = 20;
const MIN_VISITAS_RANKING = 5;

// Lista estática de tipos de atividade (vindo do backend uma vez seria melhor,
// mas como ela não muda quase nunca, deixei aqui pra evitar uma chamada extra)
const TIPOS_ATIVIDADE = [
  "ACOMPANHAMENTO DE BIOSALA",
  "ACOMPANHANDO O CTV",
  "AT BALCÃO  - PRESENCIAL",
  "AT BALCÃO - LIGAÇÃO REALIZADA",
  "AT BALCÃO - LIGAÇÃO RECEBIDA",
  "ATIVIDADE INTERNA",
  "CADASTRO DE BIOSALA",
  "CAMPO DEMOSNTRATIVO",
  "DIA DE CAMPO",
  "PROSPECÇÃO",
  "RETORNO EM CLIENTE",
  "REUNIÕES E EVENTOS",
  "SUGESTÕES E RECLAMAÇÕES",
  "VENDA REALIZADA",
  "VISITA TÉCNICA"
];

// ================== ESTADO ==================

const estado = {
  filtros: {
    dtInicio: null,
    dtFim: null,
    vendedor: null,
    tipoAtividade: null,
    idStatus: null,
    empresa: "linhagro"
  },
  page: 1,
  totalPages: 1,
  carregandoMais: false,
  ultimaResposta: null,
  atividadesAcumuladas: [],
  vendedoresJaPopulados: false,
  mapMarkers: null,
  mapLayer: null,
  chartEvolucao: null
};

let abortControllerAtual = null;
let loaderTimerId = null;

// ================== HELPERS ==================

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

function fmtData(d) {
  if (!d) return "-";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? "-" : dt.toLocaleDateString("pt-BR");
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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setLoading(ativo) {
  const overlay = document.getElementById("loaderOverlay");
  if (!overlay) return;

  if (ativo) {
    if (loaderTimerId !== null) clearTimeout(loaderTimerId);
    loaderTimerId = setTimeout(() => {
      overlay.style.display = "flex";
    }, 50);
  } else {
    if (loaderTimerId !== null) {
      clearTimeout(loaderTimerId);
      loaderTimerId = null;
    }
    overlay.style.display = "none";
  }
}

// ================== POPULAR FILTROS ==================

function popularSelectTipos() {
  const sel = document.getElementById("fTipoAtiv");
  if (!sel) return;
  if (sel.options.length > 1) return;

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

  // Pega vendedores únicos do ranking (que já vem do backend), ordena por nome
  const nomes = (rankingAtividades || [])
    .map(r => r.vendedor)
    .filter(n => n && n.trim());

  const unicos = Array.from(new Set(nomes)).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );

  // Mantém o "Todos"
  while (sel.options.length > 1) sel.remove(1);

  unicos.forEach(nome => {
    const opt = document.createElement("option");
    opt.value = nome;
    opt.textContent = nome;
    sel.appendChild(opt);
  });

  estado.vendedoresJaPopulados = true;
}

// ================== CHAMADA AO BACKEND ==================

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
  params.set("pageSize", PAGE_SIZE);

  const url = `${API_BASE_ATIV}/atividades-dashboard?${params}`;
  console.log("[ATIV][GET]", url);
  const t0 = performance.now();

  const resp = await fetch(url, {
    method: "GET",
    headers: getAuthHeaders(),
    signal: abortControllerAtual.signal
  });

  if (!resp.ok) {
    const texto = await resp.text();
    console.error("[ATIV][GET] erro", resp.status, texto);
    throw new Error(`HTTP ${resp.status}`);
  }

  const json = await resp.json();
  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`[ATIV][GET] OK em ${elapsed}s | atividades=${json?.cards?.total_atividades} | página ${page}`);

  return json;
}

// ================== CARDS PRINCIPAIS ==================

function renderCards(cards) {
  setCardValor("cardTotalAtiv",
    fmtNumero(cards.total_atividades),
    "Atividades no período");

  setCardValor("cardTotalCarteira",
    fmtNumero(cards.total_carteira),
    "Clientes na carteira");

  setCardValor("cardClientesAtend",
    fmtPerc(cards.clientes_atendidos.percentual),
    `${fmtNumero(cards.clientes_atendidos.qtde)} clientes com atividade`);

  setCardValor("cardClientesVisita",
    fmtNumero(cards.clientes_visita.qtde),
    `${fmtPerc(cards.clientes_visita.percentual)} da carteira`);

  setCardValor("cardTaxaConv",
    fmtPerc(cards.taxa_conversao),
    "Visitas que viraram venda");

  setCardValor("cardPedidos",
    fmtNumero(cards.pedidos_emitidos),
    `${fmtNumero(cards.clientes_venda_periodo)} clientes • ${fmtMoedaCompacto(cards.valor_vendas_periodo)}`);
}

// ================== ABA CONVERSÃO ==================

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
      ? Number(dias).toFixed(1).replace(".", ",") + " dias"
      : "-");

  setText("convTotalVendas", fmtMoedaCompacto(totalVendasPeriodo || 0));

  renderRankingsConversao(conversao.ranking || []);
}

function renderRankingsConversao(ranking) {
  const comDados = ranking.filter(r => r.visitados >= MIN_VISITAS_RANKING);

  const ordenadoDesc = [...comDados].sort((a, b) => b.taxa - a.taxa);
  const ordenadoAsc = [...comDados].sort((a, b) => a.taxa - b.taxa);

  renderListaRankConversao("rankingBons", ordenadoDesc.slice(0, 15), false);
  renderListaRankConversao("rankingRuins", ordenadoAsc.slice(0, 15), true);
}

function renderListaRankConversao(elementId, lista, ehPiores) {
  const el = document.getElementById(elementId);
  if (!el) return;

  if (!lista.length) {
    el.innerHTML = '<div class="ativ-empty">Sem dados suficientes (mín. ' + MIN_VISITAS_RANKING + ' visitas).</div>';
    return;
  }

  const maxTaxa = Math.max(...lista.map(r => r.taxa), 0.01);

  el.innerHTML = lista.map((r, idx) => {
    const widthBar = Math.max(2, (r.taxa / maxTaxa) * 100);
    return `
      <div class="rank-row">
        <span class="rank-pos">${idx + 1}º</span>
        <div class="rank-nome-bloco">
          <div class="rank-nome">${escapeHtml(r.vendedor || "-")}</div>
          <div class="rank-detalhe">
            ${r.visitados} vis • ${r.convertidos} conv • ${r.pedidos} ped • ${fmtMoedaCompacto(r.valor_convertido)}
          </div>
        </div>
        <div class="rank-bar-wrap">
          <div class="rank-bar" style="width:${widthBar}%; background:${ehPiores ? 'var(--accent-red)' : 'var(--accent-green)'}"></div>
        </div>
        <span class="rank-taxa">${fmtPerc(r.taxa)}</span>
      </div>
    `;
  }).join("");
}

// ================== EVOLUÇÃO MENSAL (Chart.js) ==================

function renderGraficoEvolucao(evolucao) {
  const canvas = document.getElementById("graficoEvolucaoMensal");
  if (!canvas || typeof Chart === "undefined") return;

  if (estado.chartEvolucao) {
    estado.chartEvolucao.destroy();
  }

  // Formata "2026-04" -> "Abr/26"
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const labels = evolucao.map(e => {
    const [ano, mes] = String(e.mes).split("-");
    const mesIdx = parseInt(mes, 10) - 1;
    return `${meses[mesIdx] || mes}/${String(ano).slice(2)}`;
  });
  const valores = evolucao.map(e => Number(e.qtde || 0));

  const isLight = document.body.classList.contains("light-theme");
  const corPrincipal = isLight ? "#3b82f6" : "#60a5fa";
  const corTexto = isLight ? "#4b5563" : "#a3a3a3";
  const corGrid = isLight ? "rgba(0,0,0,0.05)" : "rgba(255,255,255,0.04)";

  const ctx = canvas.getContext("2d");

  // Gradiente vertical pra área sob a linha
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 300);
  gradient.addColorStop(0, isLight ? "rgba(59, 130, 246, 0.35)" : "rgba(96, 165, 250, 0.45)");
  gradient.addColorStop(1, isLight ? "rgba(59, 130, 246, 0.02)" : "rgba(96, 165, 250, 0.02)");

  estado.chartEvolucao = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Atividades",
        data: valores,
        borderColor: corPrincipal,
        backgroundColor: gradient,
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: corPrincipal,
        pointBorderColor: isLight ? "#fff" : "#0a0a0a",
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7,
        pointHoverBorderWidth: 3,
        pointHitRadius: 12
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isLight ? "rgba(17, 24, 39, 0.95)" : "rgba(15, 23, 42, 0.98)",
          titleColor: "#f9fafb",
          bodyColor: "#f9fafb",
          borderColor: corPrincipal,
          borderWidth: 1,
          padding: 10,
          cornerRadius: 6,
          displayColors: false,
          titleFont: { size: 11, weight: "600" },
          bodyFont: { size: 12, weight: "700" },
          callbacks: {
            label: ctx => `  ${fmtNumero(ctx.parsed.y)} atividades`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: corTexto,
            font: { size: 10, weight: "500" }
          },
          grid: { display: false },
          border: { color: corGrid }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: corTexto,
            font: { size: 10 },
            callback: v => fmtNumero(v),
            maxTicksLimit: 6
          },
          grid: {
            color: corGrid,
            drawTicks: false
          },
          border: { display: false }
        }
      }
    }
  });
}

// ================== RANKING DE ATIVIDADES (visão geral) ==================

function renderRankingAtividades(ranking) {
  const el = document.getElementById("rankingVisitas");
  if (!el) return;

  if (!ranking.length) {
    el.innerHTML = '<div class="ativ-empty">Nenhuma atividade.</div>';
    return;
  }

  const top = ranking.slice(0, 30);
  const maxTotal = Math.max(...top.map(r => r.total), 1);

  el.innerHTML = top.map((r, idx) => {
    const widthBar = (r.total / maxTotal) * 100;
    return `
      <div class="rank-row">
        <span class="rank-pos">${idx + 1}º</span>
        <div class="rank-nome-bloco">
          <div class="rank-nome">${escapeHtml(r.vendedor || "-")}</div>
        </div>
        <div class="rank-bar-wrap">
          <div class="rank-bar" style="width:${widthBar}%"></div>
        </div>
        <span class="rank-taxa">${fmtNumero(r.total)}</span>
      </div>
    `;
  }).join("");
}

// ================== MAPA (Leaflet) ==================

function renderMapa(atividades) {
  const mapEl = document.getElementById("mapaAtividades");
  if (!mapEl || typeof L === "undefined") return;

  if (!estado.mapLayer) {
    estado.mapLayer = L.map("mapaAtividades").setView([-19.0, -40.0], 7);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap",
      maxZoom: 18
    }).addTo(estado.mapLayer);
    estado.mapMarkers = L.layerGroup().addTo(estado.mapLayer);
  } else {
    estado.mapMarkers.clearLayers();
  }

  const comGps = atividades.filter(a => a.tem_gps && a.latitude && a.longitude);
  const bounds = [];

  comGps.forEach(a => {
    const popup = `
      <strong>${escapeHtml(a.cliente || "-")}</strong><br>
      <em>${escapeHtml(a.tipo || "-")}</em><br>
      Vendedor: ${escapeHtml(a.vendedor || "-")}<br>
      ${fmtData(a.dtInicial)}
      ${a.assunto ? "<br><small>" + escapeHtml(a.assunto) + "</small>" : ""}
    `;
    const m = L.marker([a.latitude, a.longitude]).bindPopup(popup);
    estado.mapMarkers.addLayer(m);
    bounds.push([a.latitude, a.longitude]);
  });

  if (bounds.length > 0) {
    estado.mapLayer.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }
}

function ajustarZoomMapa() {
  if (!estado.mapLayer || !estado.atividadesAcumuladas.length) return;
  const comGps = estado.atividadesAcumuladas.filter(a => a.tem_gps && a.latitude && a.longitude);
  const bounds = comGps.map(a => [a.latitude, a.longitude]);
  if (bounds.length > 0) {
    estado.mapLayer.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
  }
}

// ================== LISTAGEM (TABELA) ==================

function renderTabelaAtividades(atividades, append = false) {
  const tbody = document.getElementById("tbodyAtividades");
  if (!tbody) return;

  if (!append) {
    tbody.innerHTML = "";
  }

  if (!atividades.length && !append) {
    tbody.innerHTML = '<tr><td colspan="7" class="ativ-empty">Nenhuma atividade encontrada.</td></tr>';
    return;
  }

  const html = atividades.map(a => `
    <tr>
      <td>${fmtData(a.dtInicial)}</td>
      <td title="${escapeHtml(a.tipo || '')}">${escapeHtml(a.tipo || "-")}</td>
      <td title="${escapeHtml(a.cliente || '')}">${escapeHtml(a.cliente || "-")}</td>
      <td title="${escapeHtml(a.vendedor || '')}">${escapeHtml(a.vendedor || "-")}</td>
      <td title="${escapeHtml(a.assunto || '')}">${escapeHtml(a.assunto || "-")}</td>
      <td title="${escapeHtml(a.observacao || '')}">${escapeHtml(a.observacao || "-")}</td>
      <td>${a.tem_gps ? "📍" : "-"}</td>
    </tr>
  `).join("");

  tbody.insertAdjacentHTML("beforeend", html);
}

function atualizarInfoAtividades() {
  const total = estado.ultimaResposta?.cards?.total_atividades ?? 0;
  const exibidas = estado.atividadesAcumuladas.length;
  const tempo = estado.ultimaResposta?.meta?.tempo_total_ms ?? 0;
  setText("infoAtividades",
    `Mostrando ${fmtNumero(exibidas)} de ${fmtNumero(total)} atividades • ${tempo}ms`);
}

// ================== SCROLL INFINITO ==================

let scrollObserver = null;

function initScrollInfinito() {
  // Cria a sentinela: um elemento invisível no fim da tabela.
  // Quando ele entrar na viewport, carregamos a próxima página.
  const tbody = document.getElementById("tbodyAtividades");
  if (!tbody) return;

  // Cria o elemento sentinela (uma linha vazia no fim do tbody)
  const sentinela = document.createElement("tr");
  sentinela.id = "scrollSentinela";
  sentinela.innerHTML = '<td colspan="7" style="height: 1px; padding: 0; border: none;"></td>';

  // Observador
  if (scrollObserver) scrollObserver.disconnect();

  scrollObserver = new IntersectionObserver(async (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      if (estado.carregandoMais) continue;
      if (estado.page >= estado.totalPages) continue;

      estado.carregandoMais = true;
      console.log(`[ATIV] sentinela visível, carregando página ${estado.page + 1} de ${estado.totalPages}`);

      // Mostra indicador de loading no fim da tabela
      mostrarIndicadorCarregandoMais(true);

      try {
        const json = await fetchDashboard(estado.page + 1);
        estado.page = json.pagination.page;
        estado.atividadesAcumuladas.push(...(json.atividades || []));
        renderTabelaAtividades(json.atividades || [], true);
        if (estado.mapLayer) renderMapa(estado.atividadesAcumuladas);
        atualizarInfoAtividades();

        // Reanexa a sentinela ao final do tbody (porque o renderTabela append insere antes)
        reanexarSentinela();
      } catch (e) {
        if (e.name !== "AbortError") {
          console.error("[ATIV] erro scroll infinito:", e);
        }
      } finally {
        mostrarIndicadorCarregandoMais(false);
        estado.carregandoMais = false;
      }
    }
  }, {
    root: null,           // viewport
    rootMargin: "300px",  // dispara 300px antes de chegar no fim
    threshold: 0
  });

  // Anexa a sentinela ao tbody pela primeira vez
  reanexarSentinela(sentinela);
}

function reanexarSentinela(elementoOpcional) {
  const tbody = document.getElementById("tbodyAtividades");
  if (!tbody) return;

  let sentinela = document.getElementById("scrollSentinela");

  // Se não existe e foi passado um elemento, usa ele
  if (!sentinela && elementoOpcional) {
    sentinela = elementoOpcional;
  }

  // Se ainda não existe, cria
  if (!sentinela) {
    sentinela = document.createElement("tr");
    sentinela.id = "scrollSentinela";
    sentinela.innerHTML = '<td colspan="7" style="height: 1px; padding: 0; border: none;"></td>';
  }

  // Move a sentinela pro final do tbody
  tbody.appendChild(sentinela);

  // Observa
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
    loader.innerHTML = '<td colspan="7" class="ativ-empty" style="padding: 12px;">⏳ Carregando mais atividades...</td>';
    const sentinela = document.getElementById("scrollSentinela");
    if (sentinela) {
      tbody.insertBefore(loader, sentinela);
    } else {
      tbody.appendChild(loader);
    }
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
      botoes.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      paineis.forEach(p => {
        p.classList.toggle("active", p.id === `tab-${alvo}`);
      });

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
    alert("Nenhuma atividade carregada para exportar.");
    return;
  }

  const cabecalho = [
    "Data", "Tipo", "Cliente", "Vendedor", "Assunto", "Observação",
    "Latitude", "Longitude", "CODPARC", "CODVEND", "Status"
  ];

  const csv = [cabecalho.join(";")];

  linhas.forEach(a => {
    const linha = [
      fmtData(a.dtInicial),
      a.tipo || "",
      a.cliente || "",
      a.vendedor || "",
      a.assunto || "",
      (a.observacao || "").replace(/[\r\n;]+/g, " "),
      a.latitude ?? "",
      a.longitude ?? "",
      a.codparc ?? "",
      a.codvend ?? "",
      a.idStatus ?? ""
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

  console.log("[ATIV] filtros aplicados:", estado.filtros);
}

function limparFiltros() {
  ["fDtInicio", "fDtFim", "fVendedor", "fTipoAtiv", "fIdStatus"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const eEmpresa = document.getElementById("fEmpresa");
  if (eEmpresa) eEmpresa.value = "linhagro";
}

// ================== CARREGAMENTO PRINCIPAL ==================

async function carregarDashboard() {
  setLoading(true);
  try {
    lerFiltrosDoDOM();
    estado.page = 1;
    estado.atividadesAcumuladas = [];

    const json = await fetchDashboard(1);
    estado.ultimaResposta = json;
    estado.totalPages = json.pagination.totalPages;
    estado.atividadesAcumuladas = [...(json.atividades || [])];

    renderCards(json.cards);
    renderConversao(json.conversao, json.cards.valor_vendas_periodo);
    renderGraficoEvolucao(json.evolucao_mensal || []);
    renderRankingAtividades(json.ranking_atividades || []);
    renderTabelaAtividades(json.atividades || [], false);
    renderMapa(json.atividades || []);
    atualizarInfoAtividades();

    popularSelectVendedoresDoBackend(json.ranking_atividades);

    console.log(`[ATIV] dashboard renderizado em ${json.meta.tempo_total_ms}ms`);
  } catch (e) {
    if (e.name === "AbortError") {
      console.log("[ATIV] requisição abortada (filtro mudou).");
      return;
    }
    console.error("[ATIV] erro ao carregar dashboard:", e);

    const tbody = document.getElementById("tbodyAtividades");
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" class="ativ-empty">Erro ao carregar. Tente novamente.</td></tr>';
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

  const debouncedCarregar = debounce(carregarDashboard, 500);

// Datas: só aplicam ao clicar em "Atualizar" (evita filtrar com data parcial)
  // Outros filtros: aplicam automaticamente ao mudar
  ["fVendedor", "fTipoAtiv", "fIdStatus", "fEmpresa"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", debouncedCarregar);
    });

  // Permite Enter nos inputs de data pra aplicar (atalho)
  ["fDtInicio", "fDtFim"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        carregarDashboard();
      }
    });
  });

  const btnBuscar = document.getElementById("btnBuscar");
  if (btnBuscar) btnBuscar.addEventListener("click", carregarDashboard);

  const btnLimpar = document.getElementById("btnLimpar");
  if (btnLimpar) {
    btnLimpar.addEventListener("click", () => {
      limparFiltros();
      carregarDashboard();
    });
  }

  const btnMapaRecarregar = document.getElementById("btnMapaRecarregar");
  if (btnMapaRecarregar) {
    btnMapaRecarregar.addEventListener("click", () => {
      if (estado.atividadesAcumuladas.length) {
        renderMapa(estado.atividadesAcumuladas);
      }
    });
  }

  const btnMapaAjustar = document.getElementById("btnMapaAjustar");
  if (btnMapaAjustar) {
    btnMapaAjustar.addEventListener("click", ajustarZoomMapa);
  }

  const btnExportar = document.getElementById("btnExportarCsv");
  if (btnExportar) btnExportar.addEventListener("click", exportarCSV);

  initAbas();
  initScrollInfinito();

  carregarDashboard();
});