if (!window.API_BASE) {
  window.API_BASE =
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}

let caminhoesBruto = [];
let caminhoesFiltrados = [];
let modoEdicaoId = null;
let idParaExcluir = null;

const loaderOverlay = document.getElementById("loaderOverlay");
let loaderTimerId = null;

function setLoading(isLoading) {
  if (!loaderOverlay) return;
  if (isLoading) {
    if (loaderTimerId !== null) clearTimeout(loaderTimerId);
    loaderTimerId = setTimeout(() => { loaderOverlay.style.display = "flex"; }, 50);
  } else {
    if (loaderTimerId !== null) { clearTimeout(loaderTimerId); loaderTimerId = null; }
    loaderOverlay.style.display = "none";
  }
}

function getUsuarioObrigatorio() {
  const user = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  if (!user || !user.email) { window.location.href = "/index.html"; return null; }
  return user;
}

function getAuthHeaders() {
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
    } catch (e) {}
  }
  headers["x-usuario-email"] = user.email;
  return headers;
}

async function apiFetch(method, path, body) {
  const url = window.API_BASE + path;
  const headers = getAuthHeaders();
  const options = { method, headers };
  if (body !== undefined) options.body = JSON.stringify(body);
  let resp;
  try {
    resp = await fetch(url, options);
  } catch (err) {
    throw new Error("Falha na comunicação com o servidor");
  }
  let json = null;
  try { json = await resp.json(); } catch (e) {}
  if (!resp.ok) throw new Error((json && json.error) || "HTTP " + resp.status);
  return json;
}

window.addEventListener("DOMContentLoaded", () => {
  const user = getUsuarioObrigatorio();
  if (!user) return;

  const nomeEl = document.getElementById("caminhoesUserNome");
  const emailEl = document.getElementById("caminhoesUserEmail");
  if (nomeEl) nomeEl.textContent = user.nome || "Usuário VISYA";
  if (emailEl) emailEl.textContent = user.email || "";

  document.getElementById("btnBuscar")?.addEventListener("click", carregarCaminhoes);
  document.getElementById("btnLimpar")?.addEventListener("click", limparFiltros);
  document.getElementById("btnNovo")?.addEventListener("click", abrirModalNovo);

  document.getElementById("fPlaca")?.addEventListener("input", aplicarFiltroLocal);
  document.getElementById("fDescricao")?.addEventListener("input", aplicarFiltroLocal);
  document.getElementById("fTipo")?.addEventListener("input", aplicarFiltroLocal);
  document.getElementById("fMotorista")?.addEventListener("input", aplicarFiltroLocal);
  document.getElementById("fAtivo")?.addEventListener("change", aplicarFiltroLocal);

  document.getElementById("modalCancelar")?.addEventListener("click", fecharModalCaminhao);
  document.getElementById("modalSalvar")?.addEventListener("click", salvarCaminhao);
  document.getElementById("modalExcluirCancelar")?.addEventListener("click", fecharModalExcluir);
  document.getElementById("modalExcluirConfirmar")?.addEventListener("click", confirmarExclusao);

  carregarCaminhoes();
});

function limparFiltros() {
  document.getElementById("fPlaca").value = "";
  document.getElementById("fDescricao").value = "";
  document.getElementById("fTipo").value = "";
  document.getElementById("fMotorista").value = "";
  document.getElementById("fAtivo").value = "";
  carregarCaminhoes();
}

async function carregarCaminhoes() {
  const tbody = document.getElementById("tbodyCaminhoes");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="11" class="caminhoes-empty">Carregando dados...</td></tr>`;
  setLoading(true);
  try {
    const data = await apiFetch("GET", "/caminhoes");
    caminhoesBruto = Array.isArray(data) ? data : [];
    aplicarFiltroLocal();
  } catch (e) {
    console.error("[CAMINHOES] Erro ao carregar:", e);
    tbody.innerHTML = `<tr><td colspan="11" class="caminhoes-empty">Erro ao carregar dados. Tente novamente.</td></tr>`;
    atualizarCards([]);
  } finally {
    setLoading(false);
  }
}

function aplicarFiltroLocal() {
  const fPlaca = (document.getElementById("fPlaca")?.value || "").toLowerCase();
  const fDesc = (document.getElementById("fDescricao")?.value || "").toLowerCase();
  const fTipo = (document.getElementById("fTipo")?.value || "").toLowerCase();
  const fMotorista = (document.getElementById("fMotorista")?.value || "").toLowerCase();
  const fAtivo = document.getElementById("fAtivo")?.value || "";

let itens = caminhoesBruto.slice().sort((a, b) => a.idCaminhao - b.idCaminhao);
  if (fPlaca) itens = itens.filter(r => String(r.placa || "").toLowerCase().includes(fPlaca));
  if (fDesc) itens = itens.filter(r => String(r.descricao || "").toLowerCase().includes(fDesc));
  if (fTipo) itens = itens.filter(r => String(r.tipo || "").toLowerCase().includes(fTipo));
  if (fMotorista) itens = itens.filter(r => String(r.motorista || "").toLowerCase().includes(fMotorista));
  if (fAtivo === "true") itens = itens.filter(r => r.ativo === true);
  if (fAtivo === "false") itens = itens.filter(r => r.ativo === false);

  caminhoesFiltrados = itens;
  renderizarTabela(caminhoesFiltrados);
  atualizarCards(caminhoesFiltrados);

  const infoRegistros = document.getElementById("infoRegistros");
  if (infoRegistros) infoRegistros.textContent = `Total filtrado: ${caminhoesFiltrados.length} registros`;
}

function renderizarTabela(itens) {
  const tbody = document.getElementById("tbodyCaminhoes");
  if (!tbody) return;

  if (!itens.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="caminhoes-empty">Nenhum registro encontrado.</td></tr>`;
    return;
  }

  let html = "";
  for (const r of itens) {
    const statusClass = r.ativo ? "status-ok" : "status-critico";
    const statusLabel = r.ativo ? "Ativo" : "Inativo";
    html += `
      <tr>
        <td>${escapeHtml(String(r.idCaminhao ?? ""))}</td>
        <td><span class="badge-placa">${escapeHtml(r.placa ?? "")}</span></td>
        <td>${escapeHtml(r.descricao ?? "")}</td>
        <td>${escapeHtml(r.tipo ?? "")}</td>
        <td class="num">${r.capacidadeKg != null ? Number(r.capacidadeKg).toLocaleString("pt-BR") : "—"}</td>
        <td class="num">${r.larguraM != null ? r.larguraM : "—"}</td>
        <td class="num">${r.alturaM != null ? r.alturaM : "—"}</td>
        <td class="num">${r.comprimentoM != null ? r.comprimentoM : "—"}</td>
        <td>${escapeHtml(r.motorista ?? "—")}</td>
        <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
        <td class="acoes-cell">
          <button type="button" class="btn-acao btn-editar" data-id="${r.idCaminhao}" title="Editar">✏️</button>
          <button type="button" class="btn-acao btn-excluir" data-id="${r.idCaminhao}" title="Excluir">🗑️</button>
        </td>
      </tr>
    `;
  }
  tbody.innerHTML = html;

  tbody.querySelectorAll(".btn-editar").forEach(btn => {
    btn.addEventListener("click", () => abrirModalEdicao(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll(".btn-excluir").forEach(btn => {
    btn.addEventListener("click", () => abrirModalExcluir(Number(btn.dataset.id)));
  });
}

function atualizarCards(itens) {
  const ativos = itens.filter(r => r.ativo === true).length;
  const inativos = itens.filter(r => r.ativo === false).length;
  const capTotal = itens.reduce((acc, r) => acc + Number(r.capacidadeKg || 0), 0);

  const cardTotal = document.getElementById("cardTotal");
  const cardAtivos = document.getElementById("cardAtivos");
  const cardInativos = document.getElementById("cardInativos");
  const cardCapTotal = document.getElementById("cardCapTotal");

  if (cardTotal) cardTotal.textContent = itens.length;
  if (cardAtivos) cardAtivos.textContent = ativos;
  if (cardInativos) cardInativos.textContent = inativos;
  if (cardCapTotal) cardCapTotal.textContent = capTotal.toLocaleString("pt-BR");
}

function abrirModalNovo() {
  modoEdicaoId = null;
  document.getElementById("modalTitulo").textContent = "Novo Caminhão";
  document.getElementById("mPlaca").value = "";
  document.getElementById("mDescricao").value = "";
  document.getElementById("mTipo").value = "";
  document.getElementById("mCapacidadeKg").value = "";
  document.getElementById("mMotorista").value = "";
  document.getElementById("mLarguraM").value = "";
  document.getElementById("mAlturaM").value = "";
  document.getElementById("mComprimentoM").value = "";
  document.getElementById("mAtivo").value = "true";
  document.getElementById("modalErro").textContent = "";
  document.getElementById("modalCaminhao").style.display = "flex";
}

function abrirModalEdicao(id) {
  const caminhao = caminhoesBruto.find(r => r.idCaminhao === id);
  if (!caminhao) return;
  modoEdicaoId = id;
  document.getElementById("modalTitulo").textContent = "Editar Caminhão";
  document.getElementById("mPlaca").value = caminhao.placa ?? "";
  document.getElementById("mDescricao").value = caminhao.descricao ?? "";
  document.getElementById("mTipo").value = caminhao.tipo ?? "";
  document.getElementById("mCapacidadeKg").value = caminhao.capacidadeKg ?? "";
  document.getElementById("mMotorista").value = caminhao.motorista ?? "";
  document.getElementById("mLarguraM").value = caminhao.larguraM ?? "";
  document.getElementById("mAlturaM").value = caminhao.alturaM ?? "";
  document.getElementById("mComprimentoM").value = caminhao.comprimentoM ?? "";
  document.getElementById("mAtivo").value = caminhao.ativo ? "true" : "false";
  document.getElementById("modalErro").textContent = "";
  document.getElementById("modalCaminhao").style.display = "flex";
}

function fecharModalCaminhao() {
  document.getElementById("modalCaminhao").style.display = "none";
}

async function salvarCaminhao() {
  const placa = document.getElementById("mPlaca").value.trim();
  const erroEl = document.getElementById("modalErro");

  if (!placa) {
    erroEl.textContent = "Placa é obrigatória.";
    return;
  }

  const body = {
    placa,
    descricao: document.getElementById("mDescricao").value.trim() || null,
    tipo: document.getElementById("mTipo").value.trim() || null,
    capacidadeKg: document.getElementById("mCapacidadeKg").value !== "" ? Number(document.getElementById("mCapacidadeKg").value) : null,
    motorista: document.getElementById("mMotorista").value.trim() || null,
    larguraM: document.getElementById("mLarguraM").value !== "" ? Number(document.getElementById("mLarguraM").value) : null,
    alturaM: document.getElementById("mAlturaM").value !== "" ? Number(document.getElementById("mAlturaM").value) : null,
    comprimentoM: document.getElementById("mComprimentoM").value !== "" ? Number(document.getElementById("mComprimentoM").value) : null,
    ativo: document.getElementById("mAtivo").value === "true",
  };

  setLoading(true);
  try {
    if (modoEdicaoId !== null) {
      await apiFetch("PUT", `/caminhoes/${modoEdicaoId}`, body);
    } else {
      await apiFetch("POST", "/caminhoes", body);
    }
    fecharModalCaminhao();
    await carregarCaminhoes();
  } catch (e) {
    erroEl.textContent = e.message || "Erro ao salvar.";
  } finally {
    setLoading(false);
  }
}

function abrirModalExcluir(id) {
  const caminhao = caminhoesBruto.find(r => r.idCaminhao === id);
  if (!caminhao) return;
  idParaExcluir = id;
  document.getElementById("modalExcluirTexto").textContent =
    `Deseja excluir o caminhão "${caminhao.placa} - ${caminhao.descricao || ""}"? Esta ação não pode ser desfeita.`;
  document.getElementById("modalExcluir").style.display = "flex";
}

function fecharModalExcluir() {
  idParaExcluir = null;
  document.getElementById("modalExcluir").style.display = "none";
}

async function confirmarExclusao() {
  if (!idParaExcluir) return;
  setLoading(true);
  try {
    await apiFetch("DELETE", `/caminhoes/${idParaExcluir}`);
    fecharModalExcluir();
    await carregarCaminhoes();
  } catch (e) {
    console.error("[CAMINHOES] Erro ao excluir:", e);
    fecharModalExcluir();
    exibirModalAviso(e.message || "Erro ao excluir caminhão.");
  } finally {
    setLoading(false);
  }
}
function exibirModalAviso(mensagem) {
  const modal = document.getElementById("modalAviso");
  const texto = document.getElementById("modalAvisoTexto");
  if (!modal || !texto) return;
  texto.textContent = mensagem;
  modal.style.display = "flex";
}
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}