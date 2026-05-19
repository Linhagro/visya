// assets/js/rh_dashboard.js
console.log("[RH-DASHBOARD] carregado.");

if (!window.API_BASE) {
  window.API_BASE =
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}

const loaderOverlay = document.getElementById("loaderOverlay");
let loaderTimer = null;

let chartStatusInst = null;
let chartPorMesInst = null;
let chartTopSetoresInst = null;
let chartTopProfInst = null;
let dadosUltimaResposta = null;

function setLoading(on) {
  if (!loaderOverlay) return;
  if (on) {
    loaderTimer = setTimeout(() => {
      loaderOverlay.style.display = "flex";
    }, 50);
  } else {
    clearTimeout(loaderTimer);
    loaderTimer = null;
    loaderOverlay.style.display = "none";
  }
}

function getAuth() {
  try {
    return JSON.parse(localStorage.getItem("orgdash_auth") || "null");
  } catch (e) {
    return null;
  }
}

function getHeaders() {
  const auth = getAuth();
  const headers = { "Content-Type": "application/json" };
  if (auth && auth.token) headers["Authorization"] = "Bearer " + auth.token;
  return headers;
}

function getUsuario() {
  const auth = getAuth();
  if (!auth || !auth.usuario) {
    window.location.href = "../../index.html";
    return null;
  }
  return auth.usuario;
}

function isLight() {
  return document.body.classList.contains("light-theme");
}

function mostrarToast(msg) {
  const toast = document.getElementById("toastDash");
  const span = document.getElementById("toastDashMsg");
  if (!toast || !span) return;
  span.textContent = msg;
  toast.classList.add("toast-ano-visible");
  toast.setAttribute("aria-hidden", "false");
  setTimeout(() => {
    toast.classList.remove("toast-ano-visible");
    toast.setAttribute("aria-hidden", "true");
  }, 3500);
}

function formatDate(val) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("pt-BR");
  } catch (e) {
    return val;
  }
}

function formatMonthLabel(yyyymm) {
  if (!yyyymm) return "";
  const parts = yyyymm.split("-");
  if (parts.length < 2) return yyyymm;
  const meses = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];
  const m = parseInt(parts[1], 10);
  const y = parts[0].slice(-2);
  return `${meses[m - 1] || ""}/${y}`;
}

// ================== TOKENS DE TEMA PARA OS CHARTS ==================

function getTokensTema() {
  const light = isLight();
  return {
    accent: "#3d8c5e",
    accentSoft: "rgba(61, 140, 94, 0.16)",
    warn: "#d4a056",
    info: "#6ea3d1",
    danger: "#c25450",
    text0: light ? "#0f172a" : "#f3f5f7",
    text1: light ? "#334155" : "#c9d0d8",
    text2: light ? "#64748b" : "#8a93a0",
    text3: light ? "#94a3b8" : "#5b6571",
    line: light ? "rgba(15, 23, 42, 0.08)" : "rgba(255, 255, 255, 0.06)",
    bg: "transparent",
    paletteSemequencia: ["#3d8c5e", "#6ea3d1", "#d4a056", "#c25450", "#9b7fc1", "#5fa8a0"],
  };
}

// ================== FETCH DADOS ==================

async function carregarDashboard() {
  const dataInicio = document.getElementById("fDataInicio")?.value || "";
  const dataFim = document.getElementById("fDataFim")?.value || "";
  const setor = document.getElementById("fSetor")?.value.trim() || "";

  const params = new URLSearchParams();
  if (dataInicio) params.set("dataInicio", dataInicio);
  if (dataFim) params.set("dataFim", dataFim);
  if (setor) params.set("setor", setor);

  const url =
    `${window.API_BASE}/rh/dashboard` +
    (params.toString() ? "?" + params.toString() : "");

  console.log("[RH-DASHBOARD][GET]", url);

  setLoading(true);
  try {
    const resp = await fetch(url, { headers: getHeaders() });
    if (!resp.ok) {
      const txt = await resp.text();
      console.error("[RH-DASHBOARD] HTTP", resp.status, txt);
      throw new Error("HTTP " + resp.status);
    }
    const data = await resp.json();
    dadosUltimaResposta = data;
    renderizarTudo(data);
  } catch (e) {
    console.error("[RH-DASHBOARD][carregarDashboard]", e);
    mostrarToast("Erro ao carregar dashboard: " + e.message);
  } finally {
    setLoading(false);
  }
}

// ================== RENDER ==================

function renderizarTudo(data) {
  renderizarKPIs(data.kpis || {});
  renderizarChartStatus(data.kpis || {});
  renderizarChartPorMes(data.treinamentosPorMes || []);
  renderizarChartTopSetores(data.topSetores || []);
  renderizarChartTopProfissionais(data.topProfissionais || []);
  renderizarCobertura(data.coberturaPorSetor || []);
  renderizarPendentes(data.atividadesSemDominio || []);
}

function renderizarKPIs(kpis) {
  const elTotalTrein = document.getElementById("kpiTotalTreinamentos");
  const elTotalProf = document.getElementById("kpiTotalProfissionais");
  const elTotalAtiv = document.getElementById("kpiTotalAtividades");
  const elTaxaDominio = document.getElementById("kpiTaxaDominio");
  const elTotalSetores = document.getElementById("kpiTotalSetores");
  const elPendentes = document.getElementById("kpiPendentesRevisao");

  if (elTotalTrein) {
    elTotalTrein.textContent = Number(kpis.totalTreinamentos || 0).toLocaleString("pt-BR");
  }
  if (elTotalProf) {
    elTotalProf.textContent = `${Number(kpis.totalProfissionais || 0).toLocaleString("pt-BR")} profissionais`;
  }
  if (elTotalAtiv) {
    elTotalAtiv.textContent = Number(kpis.totalAtividades || 0).toLocaleString("pt-BR");
  }
  if (elTaxaDominio) {
    const total = Number(kpis.totalAtividades || 0);
    const comD = Number(kpis.atividadesComDominio || 0);
    const pct = total > 0 ? Math.round((comD / total) * 100) : 0;
    elTaxaDominio.textContent = `${pct}% com domínio`;
  }
  if (elTotalSetores) {
    elTotalSetores.textContent = Number(kpis.totalSetores || 0).toLocaleString("pt-BR");
  }
  if (elPendentes) {
    elPendentes.textContent = Number(kpis.atividadesSemDominio || 0).toLocaleString("pt-BR");
  }
}

// ================== CHARTS ==================

function destruirChart(inst) {
  if (inst && typeof inst.destroy === "function") {
    try { inst.destroy(); } catch (e) {}
  }
  return null;
}

function renderizarChartStatus(kpis) {
  const target = document.getElementById("chartStatus");
  if (!target) return;
  chartStatusInst = destruirChart(chartStatusInst);

  const t = getTokensTema();
  const series = [
    Number(kpis.statusPendente || 0),
    Number(kpis.statusEmAndamento || 0),
    Number(kpis.statusConcluido || 0),
    Number(kpis.statusCancelado || 0),
  ];

  const options = {
    chart: {
      type: "donut",
      height: 270,
      background: "transparent",
      animations: {
        enabled: true,
        easing: "easeinout",
        speed: 600,
      },
      fontFamily: "Inter, sans-serif",
    },
    series: series,
    labels: ["Pendente", "Em andamento", "Concluído", "Cancelado"],
    colors: [t.warn, t.info, t.accent, t.danger],
    stroke: { width: 0 },
    legend: {
      position: "bottom",
      labels: { colors: t.text2 },
      fontSize: "11px",
      markers: { width: 8, height: 8, radius: 2 },
    },
    dataLabels: {
      enabled: true,
      style: {
        fontSize: "11px",
        fontWeight: 500,
        colors: ["#ffffff"],
      },
      dropShadow: { enabled: false },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "65%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "Total",
              color: t.text2,
              fontSize: "10px",
              fontFamily: "JetBrains Mono, monospace",
              formatter: () => series.reduce((a, b) => a + b, 0).toLocaleString("pt-BR"),
            },
            value: {
              color: t.text0,
              fontSize: "20px",
              fontWeight: 600,
            },
          },
        },
      },
    },
    tooltip: {
      theme: isLight() ? "light" : "dark",
      y: { formatter: (val) => val.toLocaleString("pt-BR") + " treinamento(s)" },
    },
  };

  chartStatusInst = new ApexCharts(target, options);
  chartStatusInst.render();
}

function renderizarChartPorMes(arr) {
  const target = document.getElementById("chartPorMes");
  if (!target) return;
  chartPorMesInst = destruirChart(chartPorMesInst);

  const t = getTokensTema();
  const labels = arr.map((r) => formatMonthLabel(r.mes));
  const values = arr.map((r) => Number(r.qtde || 0));

  const options = {
    chart: {
      type: "bar",
      height: 270,
      background: "transparent",
      toolbar: { show: false },
      fontFamily: "Inter, sans-serif",
      animations: {
        enabled: true,
        easing: "easeinout",
        speed: 600,
      },
    },
    series: [{ name: "Treinamentos", data: values }],
    colors: [t.accent],
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: "55%",
        distributed: false,
      },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: labels,
      labels: {
        style: { colors: t.text3, fontSize: "10px", fontFamily: "JetBrains Mono, monospace" },
      },
      axisBorder: { color: t.line },
      axisTicks: { color: t.line },
    },
    yaxis: {
      labels: {
        style: { colors: t.text3, fontSize: "10px", fontFamily: "JetBrains Mono, monospace" },
      },
    },
    grid: {
      borderColor: t.line,
      strokeDashArray: 3,
    },
    tooltip: {
      theme: isLight() ? "light" : "dark",
      y: { formatter: (val) => val.toLocaleString("pt-BR") + " treinamento(s)" },
    },
    noData: {
      text: "Sem dados",
      style: { color: t.text3, fontSize: "12px" },
    },
  };

  chartPorMesInst = new ApexCharts(target, options);
  chartPorMesInst.render();
}

function renderizarChartTopSetores(arr) {
  const target = document.getElementById("chartTopSetores");
  if (!target) return;
  chartTopSetoresInst = destruirChart(chartTopSetoresInst);

  const t = getTokensTema();
  const labels = arr.map((r) => r.setor || "—");
  const values = arr.map((r) => Number(r.qtde || 0));

  const options = {
    chart: {
      type: "bar",
      height: 270,
      background: "transparent",
      toolbar: { show: false },
      fontFamily: "Inter, sans-serif",
      animations: {
        enabled: true,
        easing: "easeinout",
        speed: 600,
      },
    },
    series: [{ name: "Treinamentos", data: values }],
    colors: [t.accent],
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        barHeight: "70%",
      },
    },
    dataLabels: {
      enabled: true,
      style: { fontSize: "10px", colors: ["#ffffff"], fontWeight: 500 },
      offsetX: -8,
    },
    xaxis: {
      categories: labels,
      labels: {
        style: { colors: t.text3, fontSize: "10px", fontFamily: "JetBrains Mono, monospace" },
      },
      axisBorder: { color: t.line },
      axisTicks: { color: t.line },
    },
    yaxis: {
      labels: {
        style: { colors: t.text1, fontSize: "11px" },
        maxWidth: 160,
      },
    },
    grid: {
      borderColor: t.line,
      strokeDashArray: 3,
    },
    tooltip: {
      theme: isLight() ? "light" : "dark",
      y: { formatter: (val) => val.toLocaleString("pt-BR") + " treinamento(s)" },
    },
    noData: {
      text: "Sem dados",
      style: { color: t.text3, fontSize: "12px" },
    },
  };

  chartTopSetoresInst = new ApexCharts(target, options);
  chartTopSetoresInst.render();
}

function renderizarChartTopProfissionais(arr) {
  const target = document.getElementById("chartTopProfissionais");
  if (!target) return;
  chartTopProfInst = destruirChart(chartTopProfInst);

  const t = getTokensTema();
  const labels = arr.map((r) => r.profissional || "—");
  const comDominio = arr.map((r) => Number(r.comDominio || 0));
  const semDominio = arr.map((r) => Number(r.semDominio || 0));

  const options = {
    chart: {
      type: "bar",
      stacked: true,
      height: 270,
      background: "transparent",
      toolbar: { show: false },
      fontFamily: "Inter, sans-serif",
      animations: {
        enabled: true,
        easing: "easeinout",
        speed: 600,
      },
    },
    series: [
      { name: "Com domínio", data: comDominio },
      { name: "Sem domínio", data: semDominio },
    ],
    colors: [t.accent, t.warn],
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        barHeight: "70%",
      },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: labels,
      labels: {
        style: { colors: t.text3, fontSize: "10px", fontFamily: "JetBrains Mono, monospace" },
      },
      axisBorder: { color: t.line },
      axisTicks: { color: t.line },
    },
    yaxis: {
      labels: {
        style: { colors: t.text1, fontSize: "11px" },
        maxWidth: 160,
      },
    },
    legend: {
      position: "bottom",
      labels: { colors: t.text2 },
      fontSize: "11px",
      markers: { width: 8, height: 8, radius: 2 },
    },
    grid: {
      borderColor: t.line,
      strokeDashArray: 3,
    },
    tooltip: {
      theme: isLight() ? "light" : "dark",
      y: { formatter: (val) => val.toLocaleString("pt-BR") + " atividade(s)" },
    },
    noData: {
      text: "Sem dados",
      style: { color: t.text3, fontSize: "12px" },
    },
  };

  chartTopProfInst = new ApexCharts(target, options);
  chartTopProfInst.render();
}

// ================== COBERTURA (lista custom) ==================

function renderizarCobertura(arr) {
  const body = document.getElementById("coberturaBody");
  if (!body) return;

  if (!arr.length) {
    body.innerHTML = '<p class="cobertura-empty">Sem dados para os filtros atuais.</p>';
    return;
  }

  body.innerHTML = "";
  arr.forEach((item) => {
    const total = Number(item.totalAtividades || 0);
    const trein = Number(item.comTreinamento || 0);
    const dom = Number(item.comDominio || 0);

    const pctTrein = total > 0 ? Math.round((trein / total) * 100) : 0;
    const pctDom = total > 0 ? Math.round((dom / total) * 100) : 0;

    const card = document.createElement("div");
    card.className = "cobertura-item";
    card.innerHTML = `
      <div class="cobertura-item-top">
        <span class="cobertura-item-setor"></span>
        <span class="cobertura-item-total">${total} atividade(s)</span>
      </div>
      <div class="cobertura-bars">
        <div class="cobertura-bar-row">
          <span class="cobertura-bar-label">Treinamento</span>
          <div class="cobertura-bar-track">
            <div class="cobertura-bar-fill" style="width: ${pctTrein}%"></div>
          </div>
          <span class="cobertura-bar-value">${trein} (${pctTrein}%)</span>
        </div>
        <div class="cobertura-bar-row">
          <span class="cobertura-bar-label">Domínio</span>
          <div class="cobertura-bar-track">
            <div class="cobertura-bar-fill fill-info" style="width: ${pctDom}%"></div>
          </div>
          <span class="cobertura-bar-value">${dom} (${pctDom}%)</span>
        </div>
      </div>
    `;
    card.querySelector(".cobertura-item-setor").textContent = item.setor || "—";
    body.appendChild(card);
  });
}

// ================== PENDENTES ==================

function renderizarPendentes(arr) {
  const body = document.getElementById("pendentesBody");
  const count = document.getElementById("pendentesCount");
  if (!body) return;

  if (count) count.textContent = String(arr.length);

  if (!arr.length) {
    body.innerHTML = '<p class="cobertura-empty">Nenhuma atividade pendente de revisão.</p>';
    return;
  }

  body.innerHTML = "";
  arr.forEach((item) => {
    const div = document.createElement("div");
    div.className = "pendentes-item";

    const top = document.createElement("div");
    top.className = "pendentes-item-top";

    const prof = document.createElement("span");
    prof.className = "pendentes-item-prof";
    prof.textContent = item.profissional || "—";
    top.appendChild(prof);

    const data = document.createElement("span");
    data.className = "pendentes-item-data";
    data.textContent = formatDate(item.dataAtividade);
    top.appendChild(data);

    const ativ = document.createElement("p");
    ativ.className = "pendentes-item-atividade";
    ativ.textContent = item.atividade || "—";

    const meta = document.createElement("div");
    meta.className = "pendentes-item-meta";

    if (item.setor) {
      const tag = document.createElement("span");
      tag.className = "pendentes-item-tag";
      tag.textContent = item.setor;
      meta.appendChild(tag);
    }

    const tagTrein = document.createElement("span");
    tagTrein.className = "pendentes-item-tag";
    tagTrein.textContent = item.recebiTreinamento === "S" ? "Treinou" : "Sem treinamento";
    meta.appendChild(tagTrein);

    div.appendChild(top);
    div.appendChild(ativ);
    div.appendChild(meta);
    body.appendChild(div);
  });
}

// ================== RECRIAR CHARTS QUANDO TEMA MUDA ==================

window.recriarGraficosTema = function () {
  if (!dadosUltimaResposta) return;
  renderizarTudo(dadosUltimaResposta);
};

// ================== INIT ==================

function limparFiltros() {
  ["fDataInicio", "fDataFim", "fSetor"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
}

window.addEventListener("DOMContentLoaded", () => {
  const user = getUsuario();
  if (!user) return;

  const nomeEl = document.getElementById("rhUserNome");
  const emailEl = document.getElementById("rhUserEmail");
  if (nomeEl) nomeEl.textContent = user.nome || "Usuário VISYA";
  if (emailEl) emailEl.textContent = user.email || "";

  document.getElementById("btnAplicar")?.addEventListener("click", carregarDashboard);
  document.getElementById("btnLimpar")?.addEventListener("click", async () => {
    limparFiltros();
    await carregarDashboard();
  });

  // enter aplica
  ["fDataInicio", "fDataFim", "fSetor"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") carregarDashboard();
    });
  });

  carregarDashboard();
});