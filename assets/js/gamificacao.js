console.log("[GAMIF] Script gamificacao.js carregado.");

function getApiBaseGamif() {
  if (typeof window !== "undefined" && window.APIBASE) {
    return window.APIBASE;
  }
  return "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}

function showLoader() {
  const overlay = document.getElementById("loaderOverlay");
  if (!overlay) return;
  overlay.setAttribute("aria-hidden", "false");
  overlay.style.display = "flex";
}

function hideLoader() {
  const overlay = document.getElementById("loaderOverlay");
  if (!overlay) return;
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.display = "none";
}

function getUsuarioObrigatorioGamif() {
  const user = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;

  console.log("[GAMIF][getUsuarioObrigatorio] user:", user && {
    email: user.email,
    nome: user.nome,
    tipo: user.tipo,
    perfis: user.perfis,
  });

  if (!user || !user.email) {
    console.warn("[GAMIF][getUsuarioObrigatorio] Sem usuário, redirecionando.");
    window.location.href = "/index.html";
    return null;
  }
  return user;
}

function getAuthHeadersGamif() {
  const user = getUsuarioObrigatorioGamif();
  if (!user) {
    console.warn("[GAMIF][getAuthHeadersGamif] Sem usuário, retornando headers mínimos.");
    return { "Content-Type": "application/json" };
  }

  let headers;

  if (typeof getAuthHeadersCalendario === "function") {
    headers = getAuthHeadersCalendario();
  } else {
    headers = { "Content-Type": "application/json" };
    try {
      const token = (window.sessionStorage && sessionStorage.getItem("authToken")) || null;
      if (token) {
        headers["Authorization"] = "Bearer " + token;
      } else {
        console.warn("[GAMIF][getAuthHeadersGamif] authToken ausente no sessionStorage.");
      }
    } catch (e) {
      console.warn("[GAMIF][getAuthHeadersGamif] Erro ao ler authToken:", e);
    }
  }

  headers["x-usuario-email"] = user.email;

  const safe = { ...headers };
  if (safe.Authorization) safe.Authorization = "Bearer ****";
  console.log("[GAMIF][getAuthHeadersGamif] Headers finais:", safe);

  return headers;
}

async function apiGetGamif(path) {
  const base = getApiBaseGamif();
  if (!base) {
    console.error("[GAMIF][apiGetGamif] API base não definida.");
    throw new Error("API base não configurada");
  }

  const url = base + path;
  console.log("[GAMIF][apiGetGamif] URL:", url);

  const headers = getAuthHeadersGamif();
  const safe = { ...headers };
  if (safe.Authorization) safe.Authorization = "Bearer ****";
  console.log("[GAMIF][apiGetGamif] Headers enviados:", safe);

  let resp;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers,
    });
  } catch (e) {
    console.error("[GAMIF][apiGetGamif] Erro de rede/fetch:", e);
    throw new Error("Falha na comunicação com o servidor (gamificação)");
  }

  console.log("[GAMIF][apiGetGamif] HTTP status:", resp.status);

  if (!resp.ok) {
    let body = "";
    try {
      body = await resp.text();
    } catch (e) {
      console.warn("[GAMIF][apiGetGamif] Erro ao ler corpo:", e);
    }
    console.error("[GAMIF][apiGetGamif] Resposta não OK:", "status=", resp.status, "body=", body);
    if (resp.status === 401) {
      console.warn("[GAMIF][apiGetGamif] 401 - não autorizado.");
    }
    throw new Error("HTTP " + resp.status + " ao chamar " + path);
  }

  try {
    const json = await resp.json();
    console.log("[GAMIF][apiGetGamif] JSON recebido:", json);
    return json;
  } catch (e) {
    console.error("[GAMIF][apiGetGamif] Erro ao fazer parse JSON:", e);
    throw new Error("Erro ao interpretar resposta JSON");
  }
}

let gamificacaoBruta = [];
let linhasFiltradas = [];
let vendedorExpandidoId = null;
let ultimoPeriodoGamif = null;
const detalhesCache = new Map();

window.addEventListener("DOMContentLoaded", () => {
  console.log("[GAMIF] DOMContentLoaded");

  const user = getUsuarioObrigatorioGamif();
  if (!user) return;

  const nomeEl = document.getElementById("gamifUserNome");
  const emailEl = document.getElementById("gamifUserEmail");
  if (nomeEl) nomeEl.textContent = user.nome || "Usuário VISYA";
  if (emailEl) emailEl.textContent = user.email || "";

  const btnBuscar = document.getElementById("btnBuscar");
  const btnLimpar = document.getElementById("btnLimpar");
  const fVendedorNome = document.getElementById("fVendedorNome");
  const tbody = document.getElementById("tbodyGamificacao");
  const chkAnoTodo = document.getElementById("chkAnoTodo");

  if (btnBuscar) btnBuscar.addEventListener("click", carregarGamificacao);
  if (btnLimpar) btnLimpar.addEventListener("click", limparFiltros);
  if (fVendedorNome) fVendedorNome.addEventListener("input", aplicarFiltroLocal);
  if (chkAnoTodo) chkAnoTodo.addEventListener("change", onChkAnoTodoChange);

  if (tbody) {
    tbody.addEventListener("click", onTabelaClickGamif);
    console.log("[GAMIF] Listener de clique vinculado ao tbodyGamificacao");
  } else {
    console.warn("[GAMIF] tbodyGamificacao não encontrado ao carregar a página");
  }

  criarModalDetalhes();
  inicializarPeriodoPadrao();
});

function onChkAnoTodoChange() {
  const chk = document.getElementById("chkAnoTodo");
  const fMes = document.getElementById("fMes");
  if (!chk || !fMes) return;
  fMes.disabled = chk.checked;
  if (chk.checked) fMes.value = "";
}

function inicializarPeriodoPadrao() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;

  const fMes = document.getElementById("fMes");
  const fAno = document.getElementById("fAno");

  if (fMes) fMes.value = String(mes);
  if (fAno) fAno.value = String(ano);

  carregarGamificacao();
}

function limparFiltros() {
  const fMes = document.getElementById("fMes");
  const fAno = document.getElementById("fAno");
  const fVendedorId = document.getElementById("fVendedorId");
  const fVendedorNome = document.getElementById("fVendedorNome");
  const chkAnoTodo = document.getElementById("chkAnoTodo");

  if (fMes) { fMes.value = ""; fMes.disabled = false; }
  if (fAno) fAno.value = "";
  if (fVendedorId) fVendedorId.value = "";
  if (fVendedorNome) fVendedorNome.value = "";
  if (chkAnoTodo) chkAnoTodo.checked = false;

  const tbody = document.getElementById("tbodyGamificacao");
  const infoRegistros = document.getElementById("infoRegistros");
  const infoPeriodo = document.getElementById("infoPeriodo");

  gamificacaoBruta = [];
  linhasFiltradas = [];
  vendedorExpandidoId = null;
  ultimoPeriodoGamif = null;
  detalhesCache.clear();

  if (tbody) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="empty-state">
          Selecione mês/ano e clique em Atualizar.
        </td>
      </tr>
    `;
  }
  if (infoRegistros) infoRegistros.textContent = "Mostrando 0 de 0 vendedores";
  if (infoPeriodo) infoPeriodo.textContent = "Período não definido";

  atualizarCardsResumo([]);
}

function getPeriodoSelecionadoGamif() {
  const fMes = document.getElementById("fMes");
  const fAno = document.getElementById("fAno");
  const chkAnoTodo = document.getElementById("chkAnoTodo");

  const anoStr = (fAno?.value || "").trim();
  const ano = anoStr ? parseInt(anoStr, 10) : NaN;

  if (!anoStr || Number.isNaN(ano)) {
    return null;
  }

  const anoTodo = chkAnoTodo?.checked || false;

  if (anoTodo) {
    const inicio = `${ano}-01-01`;
    const fim = `${ano}-12-31`;
    const inicioCompacto = `0101${ano}`;
    const fimCompacto = `3112${ano}`;
    return {
      inicio,
      fim,
      mes: null,
      ano,
      anoTodo: true,
      inicioCompacto,
      fimCompacto,
      descricao: `Período: Ano todo ${ano} (${inicioCompacto} até ${fimCompacto})`,
      descricaoCurta: `Ano todo ${ano}`,
      descricaoModal: `${inicioCompacto} até ${fimCompacto} | Ano ${ano}`
    };
  }

  const mesStr = fMes?.value || "";
  const mes = mesStr ? parseInt(mesStr, 10) : NaN;

  if (!mesStr || Number.isNaN(mes)) {
    return null;
  }

  const mesPad = String(mes).padStart(2, "0");
  const inicio = `${ano}-${mesPad}-01`;
  const ultimoDiaDate = new Date(ano, mes, 0);
  const diaFinal = String(ultimoDiaDate.getDate()).padStart(2, "0");
  const fim = `${ano}-${mesPad}-${diaFinal}`;
  const inicioCompacto = `01${mesPad}${ano}`;
  const fimCompacto = `${diaFinal}${mesPad}${ano}`;

  return {
    inicio,
    fim,
    mes,
    ano,
    anoTodo: false,
    inicioCompacto,
    fimCompacto,
    descricao: `Período: ${inicio} até ${fim}`,
    descricaoCurta: `${inicioCompacto} até ${fimCompacto}`,
    descricaoModal: `${inicioCompacto} até ${fimCompacto}`
  };
}

async function carregarGamificacao() {
  const tbody = document.getElementById("tbodyGamificacao");
  const infoRegistros = document.getElementById("infoRegistros");
  const infoPeriodo = document.getElementById("infoPeriodo");
  const fVendedorId = document.getElementById("fVendedorId");

  if (!tbody) return;

  const periodo = getPeriodoSelecionadoGamif();

  if (!periodo) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="empty-state">
          Selecione mês e ano para buscar.
        </td>
      </tr>
    `;
    if (infoRegistros) infoRegistros.textContent = "Mostrando 0 de 0 vendedores";
    if (infoPeriodo) infoPeriodo.textContent = "Período não definido";
    atualizarCardsResumo([]);
    return;
  }

  ultimoPeriodoGamif = periodo;

  const { inicio, fim } = periodo;

  const vendedorIdRaw = fVendedorId?.value.trim() || "";
  const vendedorId = vendedorIdRaw ? parseInt(vendedorIdRaw, 10) : null;

  tbody.innerHTML = `
    <tr>
      <td colspan="11" class="empty-state">
        Carregando dados de gamificação...
      </td>
    </tr>
  `;
  if (infoRegistros) infoRegistros.textContent = "Carregando...";
  if (infoPeriodo) {
    infoPeriodo.textContent = periodo.descricao;
  }

  const params = new URLSearchParams();
  params.set("inicio", inicio);
  params.set("fim", fim);
  if (vendedorId && !Number.isNaN(vendedorId)) {
    params.set("vendedorId", String(vendedorId));
  }

  const path = `/gamificacao?${params.toString()}`;

  vendedorExpandidoId = null;
  detalhesCache.clear();

  showLoader();
  try {
    const data = await apiGetGamif(path);
    const lista = data && Array.isArray(data.gamificacao) ? data.gamificacao : [];

    gamificacaoBruta = lista;

    if (!lista.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="11" class="empty-state">
            Nenhum dado retornado para o período/filtro informados.
          </td>
        </tr>
      `;
      if (infoRegistros) infoRegistros.textContent = "Mostrando 0 de 0 vendedores";
      atualizarCardsResumo([]);
      return;
    }

    aplicarFiltroLocal();
  } catch (e) {
    console.error("[GAMIF] Erro ao carregar gamificação:", e);
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="empty-state">
          Erro ao carregar dados de gamificação (API). Tente novamente mais tarde.
        </td>
      </tr>
    `;
    if (infoRegistros) infoRegistros.textContent = "Erro ao carregar";
    if (infoPeriodo) infoPeriodo.textContent = "Período não definido";
    atualizarCardsResumo([]);
  } finally {
    hideLoader();
  }
}

function aplicarFiltroLocal() {
  const tbody = document.getElementById("tbodyGamificacao");
  const infoRegistros = document.getElementById("infoRegistros");

  if (!tbody) return;

  const filtroNome = (document.getElementById("fVendedorNome")?.value || "")
    .toLowerCase()
    .trim();

  let linhas = gamificacaoBruta.slice();

  if (filtroNome) {
    linhas = linhas.filter((r) => {
      const nome = String(r.nmVendedor || r.NMVENDEDOR || "").toLowerCase();
      return nome.includes(filtroNome);
    });
  }

  linhasFiltradas = linhas;

  if (
    vendedorExpandidoId !== null &&
    !linhasFiltradas.some((r) => Number(r.idVendedor ?? r.IDVENDEDOR) === Number(vendedorExpandidoId))
  ) {
    vendedorExpandidoId = null;
  }

  renderTabelaGamificacao();

  if (infoRegistros) {
    infoRegistros.textContent = "Mostrando " + linhasFiltradas.length + " vendedores";
  }

  atualizarCardsResumo(linhasFiltradas);
}

function renderTabelaGamificacao() {
  const tbody = document.getElementById("tbodyGamificacao");
  if (!tbody) return;

  if (!linhasFiltradas.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="empty-state">
          Nenhum vendedor após aplicar os filtros.
        </td>
      </tr>
    `;
    return;
  }

  let html = "";

  for (const r of linhasFiltradas) {
    const idVendedor = Number(r.idVendedor ?? r.IDVENDEDOR ?? 0);
    const nmVendedor = r.nmVendedor ?? r.NMVENDEDOR ?? "";

    const diasSemRota = Number(r.diasSemRota ?? 0);
    const qtdeAtivRuins = Number(r.qtdeAtividadesRuins ?? 0);
    const diasComAtivRuim = Number(r.diasComAtivRuim ?? 0);
    const qtdePendentes = Number(r.qtdeAtividadesPendentes ?? 0);
    const diasComPendencia = Number(r.diasComPendencia ?? 0);
    const totalPontosPerdidos = Number(r.totalPontosPerdidos ?? 0);
    const pontuacaoFinal = Number(r.pontuacaoFinal ?? 0);
    const classificacao = String(r.classificacao ?? "").trim();

    const classPillClass = getClassPillClass(classificacao);

    html += `
      <tr data-vendedor-id="${idVendedor}">
        <td>
          <button
            class="btn-ver-detalhes"
            data-vendedor-id="${idVendedor}"
            title="Ver motivos da perda de pontos"
          >Detalhes</button>
        </td>
        <td>${escapeHtml(idVendedor)}</td>
        <td>
          <span class="vendedor-nome">${escapeHtml(nmVendedor)}</span>
        </td>
        <td class="num">${diasSemRota}</td>
        <td class="num">${qtdeAtivRuins}</td>
        <td class="num">${diasComAtivRuim}</td>
        <td class="num">${qtdePendentes}</td>
        <td class="num">${diasComPendencia}</td>
        <td class="num">${totalPontosPerdidos}</td>
        <td class="num">${pontuacaoFinal}</td>
        <td>
          <span class="status-pill ${classPillClass}">
            ${escapeHtml(classificacao || "—")}
          </span>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
  console.log("[GAMIF] Tabela renderizada. Linhas:", linhasFiltradas.length);
}

function criarModalDetalhes() {
  const overlay = document.getElementById("gamifModalOverlay");
  if (!overlay) return;

  overlay.setAttribute("aria-hidden", "true");
  overlay.classList.remove("is-open");

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      fecharModalDetalhes();
    }
  });

  const closeBtn = document.getElementById("gamifModalClose");
  if (closeBtn) {
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      fecharModalDetalhes();
    });
  }

  const modal = document.getElementById("gamifModal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharModalDetalhes();
  });
}

function abrirModalDetalhes(nmVendedor, idVendedor) {
  const overlay = document.getElementById("gamifModalOverlay");
  const title = document.getElementById("gamifModalTitle");
  const subtitle = document.getElementById("gamifModalSubtitle");
  if (!overlay) return;
  if (title) title.textContent = `Detalhes da perda de pontos - ${nmVendedor}`;
  if (subtitle) {
    subtitle.textContent = ultimoPeriodoGamif
      ? `Vendedor ${idVendedor} | ${ultimoPeriodoGamif.descricaoModal}`
      : `Vendedor ${idVendedor}`;
  }
  overlay.setAttribute("aria-hidden", "false");
  overlay.classList.add("is-open");
  document.body.style.overflow = "hidden";
}

function fecharModalDetalhes() {
  const overlay = document.getElementById("gamifModalOverlay");
  if (!overlay) return;
  overlay.setAttribute("aria-hidden", "true");
  overlay.classList.remove("is-open");
  document.body.style.overflow = "";
  vendedorExpandidoId = null;
}

function setModalBody(html) {
  const body = document.getElementById("gamifModalBody");
  if (body) body.innerHTML = html;
}

async function onTabelaClickGamif(event) {
  const btn = event.target.closest("button.btn-ver-detalhes");
  if (!btn) return;

  const idVendedor = Number(btn.getAttribute("data-vendedor-id") || 0);
  console.log("[GAMIF] Botão detalhes clicado. idVendedor:", idVendedor);

  if (!idVendedor) {
    console.warn("[GAMIF] Clique ignorado: data-vendedor-id inválido.");
    return;
  }

  const resumo = linhasFiltradas.find(
    (r) => Number(r.idVendedor ?? r.IDVENDEDOR) === idVendedor
  );
  const nmVendedor = resumo
    ? String(resumo.nmVendedor ?? resumo.NMVENDEDOR ?? "")
    : String(idVendedor);

  vendedorExpandidoId = idVendedor;

  const cacheAtual = detalhesCache.get(idVendedor);
  if (cacheAtual && !cacheAtual.erro && !cacheAtual.carregando) {
    console.log("[GAMIF] Detalhes já em cache para vendedor:", idVendedor);
    abrirModalDetalhes(nmVendedor, idVendedor);
    setModalBody(renderDetalhesVendedor(resumo, cacheAtual));
    return;
  }

  abrirModalDetalhes(nmVendedor, idVendedor);
  setModalBody(`<div class="detail-loading">Carregando detalhes da perda de pontos...</div>`);

  const periodo = getPeriodoSelecionadoGamif();
  if (!periodo) {
    setModalBody(`<div class="detail-error">Período inválido para buscar detalhes.</div>`);
    return;
  }

  const params = new URLSearchParams();
  params.set("inicio", periodo.inicio);
  params.set("fim", periodo.fim);
  params.set("vendedorId", String(idVendedor));

  try {
    const data = await apiGetGamif(`/gamificacao/detalhes?${params.toString()}`);
    const entry = {
      detalhes: normalizarDetalhesGamif(data)
    };
    detalhesCache.set(idVendedor, entry);
    console.log("[GAMIF] Detalhes carregados para vendedor", idVendedor, entry);

    if (Number(vendedorExpandidoId) === Number(idVendedor)) {
      setModalBody(renderDetalhesVendedor(resumo, entry));
    }
  } catch (e) {
    console.error("[GAMIF] Erro ao carregar detalhes:", e);
    const entry = { erro: "Erro ao carregar os detalhes deste vendedor." };
    detalhesCache.set(idVendedor, entry);

    if (Number(vendedorExpandidoId) === Number(idVendedor)) {
      setModalBody(renderDetalhesVendedor(resumo, entry));
    }
  }
}

function normalizarDetalhesGamif(data) {
  if (Array.isArray(data?.detalhes)) return data.detalhes;
  if (Array.isArray(data?.gamificacaoDetalhes)) return data.gamificacaoDetalhes;
  if (Array.isArray(data?.itens)) return data.itens;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data)) return data;
  return [];
}

function renderDetalhesVendedor(resumo, detalhes) {
  if (!detalhes || detalhes.carregando) {
    return `<div class="detail-loading">Carregando detalhes da perda de pontos...</div>`;
  }

  if (detalhes.erro) {
    return `<div class="detail-error">${escapeHtml(detalhes.erro)}</div>`;
  }

  const lista = Array.isArray(detalhes.detalhes) ? detalhes.detalhes : [];

  if (!lista.length) {
    return `
      <div class="detail-header">
        <div>
          <div class="detail-title">Nenhum detalhe retornado pela API</div>
          <div class="detail-subtitle">
            ${ultimoPeriodoGamif ? escapeHtml(ultimoPeriodoGamif.descricao) : "Período não definido"}
          </div>
        </div>
      </div>
      <div class="detail-empty">A API de detalhes não retornou ocorrências para este vendedor no período informado.</div>
    `;
  }

  const diasSemRota = lista.filter((x) => isTipoPerda(x, "diasSemRota", "semRota", "diaSemRota"));
  const atividadesRuins = lista.filter((x) => isTipoPerda(x, "atividadesRuins", "atividadeRuim", "ruim"));
  const pendencias = lista.filter((x) => isTipoPerda(x, "pendencias", "pendencia", "pendente"));

  return `
    <div class="detail-header">
      <div>
        <div class="detail-title">${escapeHtml(resumo?.nmVendedor ?? resumo?.NMVENDEDOR ?? "Vendedor")}</div>
        <div class="detail-subtitle">
          ${ultimoPeriodoGamif ? escapeHtml(ultimoPeriodoGamif.descricao) : "Período não definido"}
        </div>
      </div>
      <div class="detail-subtitle">
        Total de ocorrências detalhadas: ${lista.length}
      </div>
    </div>

    <div class="detail-grid">
      <section class="detail-card">
        <div class="detail-card-head">
          <span class="detail-badge detail-badge-rota">Dias sem rota</span>
          <strong>${diasSemRota.length}</strong>
        </div>
        ${renderListaDiasSemRota(diasSemRota)}
      </section>

      <section class="detail-card">
        <div class="detail-card-head">
          <span class="detail-badge detail-badge-ruim">Atividades ruins</span>
          <strong>${atividadesRuins.length}</strong>
        </div>
        ${renderListaAtividadesRuins(atividadesRuins)}
      </section>

      <section class="detail-card">
        <div class="detail-card-head">
          <span class="detail-badge detail-badge-pend">Pendências</span>
          <strong>${pendencias.length}</strong>
        </div>
        ${renderListaPendencias(pendencias)}
      </section>
    </div>

    <section class="detail-card" style="margin-top: 10px;">
      <div class="detail-card-head">
        <span class="detail-badge detail-badge-ruim">Listagem completa</span>
        <strong>${lista.length}</strong>
      </div>
      ${renderListaCompletaDetalhes(lista)}
    </section>
  `;
}

function isTipoPerda(item, ...aliases) {
  const tipo = String(
    item?.tipoPerda ??
    item?.tipo ??
    item?.categoria ??
    item?.tpPerda ??
    ""
  ).toLowerCase();
  return aliases.some((alias) => tipo === String(alias).toLowerCase());
}

function renderListaDiasSemRota(lista) {
  if (!lista.length) {
    return `<div class="detail-empty">Nenhum dia sem rota no período.</div>`;
  }

  return `
    <div class="detail-list">
      ${lista.map((item) => `
        <div class="detail-item">
          <div class="detail-item-top">
            <span class="detail-date">${formatDateBr(item.dtDia ?? item.data ?? item.dataOcorrencia)}</span>
            <span class="detail-points">- ${Number(item.pontosPerdidos ?? item.pontos ?? 0)} pts</span>
          </div>
          <div class="detail-text">${escapeHtml(item.motivo || item.dsMotivo || "Sem rota no dia útil")}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderListaAtividadesRuins(lista) {
  if (!lista.length) {
    return `<div class="detail-empty">Nenhuma atividade ruim no período.</div>`;
  }

  return `
    <div class="detail-list">
      ${lista.map((item) => `
        <div class="detail-item">
          <div class="detail-item-top">
            <span class="detail-date">${formatDateBr(item.dtDia ?? item.data ?? item.dataOcorrencia)}</span>
            <span class="detail-points">- ${Number(item.pontosPerdidos ?? item.pontos ?? 0)} pt</span>
          </div>
          <div class="detail-text">
            <strong>Atividade:</strong> ${escapeHtml(item.idAtividade || item.cdAtividade || "—")}
            ${item.nmAssunto ? ` - ${escapeHtml(item.nmAssunto)}` : ""}
          </div>
          <div class="detail-text">
            <strong>Motivo:</strong> ${escapeHtml(item.motivo || item.dsMotivo || "Atividade inconsistente")}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderListaPendencias(lista) {
  if (!lista.length) {
    return `<div class="detail-empty">Nenhuma pendência no período.</div>`;
  }

  return `
    <div class="detail-list">
      ${lista.map((item) => `
        <div class="detail-item">
          <div class="detail-item-top">
            <span class="detail-date">${formatDateBr(item.dtDia ?? item.data ?? item.dataOcorrencia)}</span>
            <span class="detail-points">- ${Number(item.pontosPerdidos ?? item.pontos ?? 0)} pt</span>
          </div>
          <div class="detail-text"><strong>Atividade:</strong> ${escapeHtml(item.idAtividade || item.cdAtividade || "—")}</div>
          <div class="detail-text"><strong>Cliente:</strong> ${escapeHtml(item.nmCliente || item.cliente || "—")}</div>
          <div class="detail-text"><strong>Tipo:</strong> ${escapeHtml(item.tipoAtividade || item.tipo || "—")}</div>
          <div class="detail-text"><strong>Motivo:</strong> ${escapeHtml(item.motivo || item.dsMotivo || "Atividade pendente")}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderListaCompletaDetalhes(lista) {
  return `
    <div class="detail-list">
      ${lista.map((item) => `
        <div class="detail-item">
          <div class="detail-item-top">
            <span class="detail-date">${formatDateBr(item.dtDia ?? item.data ?? item.dataOcorrencia)}</span>
            <span class="detail-points">- ${Number(item.pontosPerdidos ?? item.pontos ?? 0)} pt(s)</span>
          </div>
          <div class="detail-text"><strong>Tipo perda:</strong> ${escapeHtml(item.tipoPerda || item.tipo || item.categoria || "—")}</div>
          <div class="detail-text"><strong>Motivo:</strong> ${escapeHtml(item.motivo || item.dsMotivo || "—")}</div>
          <div class="detail-text"><strong>Atividade:</strong> ${escapeHtml(item.idAtividade || item.cdAtividade || "—")}</div>
          <div class="detail-text"><strong>Cliente:</strong> ${escapeHtml(item.nmCliente || item.cliente || "—")}</div>
          <div class="detail-text"><strong>Assunto:</strong> ${escapeHtml(item.nmAssunto || item.assunto || "—")}</div>
          <div class="detail-text"><strong>Tipo atividade:</strong> ${escapeHtml(item.tipoAtividade || "—")}</div>
        </div>
      `).join("")}
    </div>
  `;
}

function atualizarCardsResumo(lista) {
  const cardPontuacaoMedia = document.getElementById("cardPontuacaoMedia");
  const cardPontuacaoMax = document.getElementById("cardPontuacaoMax");
  const cardPontuacaoMin = document.getElementById("cardPontuacaoMin");
  const cardQtdeVendedores = document.getElementById("cardQtdeVendedores");
  const cardMelhorVendedor = document.getElementById("cardMelhorVendedor");
  const cardPiorVendedor = document.getElementById("cardPiorVendedor");

  if (!lista || !lista.length) {
    if (cardPontuacaoMedia) cardPontuacaoMedia.textContent = "0,0";
    if (cardPontuacaoMax) cardPontuacaoMax.textContent = "0,0";
    if (cardPontuacaoMin) cardPontuacaoMin.textContent = "0,0";
    if (cardQtdeVendedores) cardQtdeVendedores.textContent = "0";
    if (cardMelhorVendedor) cardMelhorVendedor.textContent = "—";
    if (cardPiorVendedor) cardPiorVendedor.textContent = "—";
    return;
  }

  let soma = 0;
  let max = -Infinity;
  let min = Infinity;
  let melhor = null;
  let pior = null;

  for (const r of lista) {
    const score = Number(r.pontuacaoFinal ?? 0);
    soma += score;

    if (score > max) {
      max = score;
      melhor = r;
    }
    if (score < min) {
      min = score;
      pior = r;
    }
  }

  const media = soma / lista.length;

  if (cardPontuacaoMedia) cardPontuacaoMedia.textContent = media.toFixed(1);
  if (cardPontuacaoMax) cardPontuacaoMax.textContent = isFinite(max) ? max.toFixed(1) : "0,0";
  if (cardPontuacaoMin) cardPontuacaoMin.textContent = isFinite(min) ? min.toFixed(1) : "0,0";
  if (cardQtdeVendedores) cardQtdeVendedores.textContent = String(lista.length);

  if (cardMelhorVendedor) {
    const nome = melhor?.nmVendedor ?? melhor?.NMVENDEDOR ?? "";
    cardMelhorVendedor.textContent = nome ? `Melhor: ${nome}` : "—";
  }
  if (cardPiorVendedor) {
    const nome = pior?.nmVendedor ?? pior?.NMVENDEDOR ?? "";
    cardPiorVendedor.textContent = nome ? `Pior: ${nome}` : "—";
  }
}

function getClassPillClass(classificacao) {
  const c = String(classificacao || "").toLowerCase();
  if (c === "excelente") return "status-ok";
  if (c === "bom") return "status-ok";
  if (c === "regular") return "status-alerta";
  if (c === "crítico" || c === "critico") return "status-critico";
  return "";
}

function formatDateBr(value) {
  if (!value) return "—";
  const s = String(value).substring(0, 10);
  const [y, m, d] = s.split("-");
  if (!y || !m || !d) return escapeHtml(value);
  return `${d}/${m}/${y}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}