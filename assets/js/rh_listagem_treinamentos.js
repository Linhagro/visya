// assets/js/rh_listagem_treinamentos.js

if (!window.API_BASE) {
  window.API_BASE =
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}

const loaderOverlay = document.getElementById("loaderOverlay");
let loaderTimer = null;

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

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(val) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleDateString("pt-BR");
  } catch (e) {
    return val;
  }
}

function statusLabel(st) {
  const s = Number(st);
  switch (s) {
    case 1:
      return "Pendente";
    case 2:
      return "Em andamento";
    case 3:
      return "Concluído";
    case 4:
      return "Cancelado";
    default:
      return "—";
  }
}

function statusClass(st) {
  const s = Number(st);
  switch (s) {
    case 1:
      return "pill-status pendente";
    case 2:
      return "pill-status andamento";
    case 3:
      return "pill-status concluido";
    case 4:
      return "pill-status cancelado";
    default:
      return "pill-status";
  }
}

let listaCabecalhos = [];
let deleteIdPendente = null;

// ================== BOOTSTRAP ==================

window.addEventListener("DOMContentLoaded", () => {
  const user = getUsuario();
  if (!user) return;

  const nomeEl = document.getElementById("rhUserNome");
  const emailEl = document.getElementById("rhUserEmail");
  if (nomeEl) nomeEl.textContent = user.nome || "Usuário VISYA";
  if (emailEl) emailEl.textContent = user.email || "";

  document
    .getElementById("btnBuscar")
    ?.addEventListener("click", carregarTreinamentos);
  document.getElementById("btnLimpar")?.addEventListener("click", () => {
    const fNome = document.getElementById("fNome");
    const fSetor = document.getElementById("fSetor");
    if (fNome) fNome.value = "";
    if (fSetor) fSetor.value = "";
    carregarTreinamentos();
  });

  document
    .getElementById("btnDeleteCancelar")
    ?.addEventListener("click", () => {
      const modal = document.getElementById("modalDelete");
      if (modal) modal.style.display = "none";
      deleteIdPendente = null;
    });

  document
    .getElementById("btnDeleteConfirmar")
    ?.addEventListener("click", confirmarDelete);

  carregarTreinamentos();
});

// ================== CARREGAR LISTA ==================

async function carregarTreinamentos() {
  const tbody = document.getElementById("tbodyRh");
  const infoEl = document.getElementById("infoRegistros");
  if (!tbody) return;

  tbody.innerHTML =
    '<tr><td colspan="7" class="rh-empty">Carregando...</td></tr>';
  if (infoEl) infoEl.textContent = "Carregando...";

  const nome = document.getElementById("fNome")?.value.trim() || "";
  const setor = document.getElementById("fSetor")?.value.trim() || "";
  const params = new URLSearchParams();
  if (nome) params.set("nome", nome);
  if (setor) params.set("setor", setor);

  const path =
    "/rh/treinamentos" + (params.toString() ? "?" + params.toString() : "");

  setLoading(true);
  try {
    const resp = await fetch(window.API_BASE + path, {
      headers: getHeaders(),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    listaCabecalhos = Array.isArray(data.cabecalhos) ? data.cabecalhos : [];
    renderTabela(listaCabecalhos);
    if (infoEl)
      infoEl.textContent = `Mostrando ${listaCabecalhos.length} registro(s)`;
  } catch (e) {
    console.error("[RH LIST][carregarTreinamentos]", e);
    tbody.innerHTML =
      '<tr><td colspan="7" class="rh-empty">Erro ao carregar dados. Tente novamente.</td></tr>';
    if (infoEl) infoEl.textContent = "Erro ao carregar";
  } finally {
    setLoading(false);
  }
}

// ================== RENDER TABELA ==================

function renderTabela(lista) {
  const tbody = document.getElementById("tbodyRh");
  if (!tbody) return;

  if (!lista.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="rh-empty">Nenhum registro encontrado.</td></tr>';
    return;
  }

  let html = "";
  for (const r of lista) {
    html += `
      <tr>
        <td>${escapeHtml(r.Id)}</td>
        <td title="${escapeHtml(r.NomeProfissional)}">${escapeHtml(
      r.NomeProfissional
    )}</td>
        <td>${escapeHtml(r.Setor)}</td>
        <td>${formatDate(r.DataInicioPeriodo)}</td>
        <td>${formatDate(r.DataFimPeriodo)}</td>
        <td><span class="${statusClass(r.Status)}">${statusLabel(
      r.Status
    )}</span></td>
        <td class="td-acoes">
          <button type="button" class="btn-acao btn-editar" data-id="${
            r.Id
          }" title="Editar">✏️</button>
          <button type="button" class="btn-acao btn-deletar" data-id="${
            r.Id
          }" title="Excluir">🗑️</button>
        </td>
      </tr>`;
  }

  tbody.innerHTML = html;

  tbody.querySelectorAll(".btn-editar").forEach((btn) => {
    btn.addEventListener("click", () => abrirEdicao(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll(".btn-deletar").forEach((btn) => {
    btn.addEventListener("click", () =>
      abrirModalDelete(Number(btn.dataset.id))
    );
  });
}

// ================== EDITAR → ABRE RELATÓRIO ==================

function abrirEdicao(idCabecalho) {
  const frame = window.parent?.document?.querySelector(".app-main-frame");
  const url =
    "rh_relatorio_treinamento.html?id=" + encodeURIComponent(idCabecalho);
  if (frame) {
    frame.src = url;
  } else {
    window.location.href = url;
  }
}

// ================== DELETE ==================

function abrirModalDelete(id) {
  deleteIdPendente = id;
  const msgEl = document.getElementById("modalDeleteMsg");
  const modal = document.getElementById("modalDelete");
  if (msgEl)
    msgEl.textContent = `Deseja remover o treinamento ID ${id}? Esta ação removerá também as atividades.`;
  if (modal) modal.style.display = "flex";
}

async function confirmarDelete() {
  if (!deleteIdPendente) return;

  setLoading(true);
  try {
    const resp = await fetch(
      `${window.API_BASE}/rh/treinamentos/${deleteIdPendente}`,
      {
        method: "DELETE",
        headers: getHeaders(),
      }
    );
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const modal = document.getElementById("modalDelete");
    if (modal) modal.style.display = "none";
    deleteIdPendente = null;
    await carregarTreinamentos();
  } catch (e) {
    console.error("[RH LIST][confirmarDelete]", e);
    alert("Erro ao excluir. Tente novamente.");
  } finally {
    setLoading(false);
  }
}