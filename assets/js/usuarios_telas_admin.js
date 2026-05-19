// assets/js/usuarios_telas_admin.js

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
  if (auth && auth.usuario && auth.usuario.email) {
    headers["x-usuario-email"] = auth.usuario.email;
  }
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

function mostrarToast(msg, isError = false) {
  const toast = document.getElementById("toastTela");
  const span = document.getElementById("toastTelaMsg");
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

let listaTelas = [];
let modoEdicao = false;
let idEdicaoAtual = null;
let togglePendente = null; // { id, novoAtivo, nome }

// ================== BOOTSTRAP ==================

window.addEventListener("DOMContentLoaded", () => {
  const user = getUsuario();
  if (!user) return;

  const nomeEl = document.getElementById("utUserNome");
  const emailEl = document.getElementById("utUserEmail");
  if (nomeEl) nomeEl.textContent = user.nome || "Usuário VISYA";
  if (emailEl) emailEl.textContent = user.email || "";

  document.getElementById("btnAplicar")?.addEventListener("click", carregarTelas);
  document.getElementById("btnLimpar")?.addEventListener("click", () => {
    ["fModulo", "fCodigoTela", "fNomeTela", "fRota"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    const fAtivo = document.getElementById("fAtivo");
    if (fAtivo) fAtivo.value = "";
    carregarTelas();
  });

  document.getElementById("btnNova")?.addEventListener("click", abrirModalNova);

  ["fModulo", "fCodigoTela", "fNomeTela", "fRota"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") carregarTelas();
    });
  });

  // Modal form
  document.getElementById("btnFormCancelar")?.addEventListener("click", fecharModalForm);
  document.getElementById("btnFormCancelar2")?.addEventListener("click", fecharModalForm);
  document.getElementById("btnFormSalvar")?.addEventListener("click", salvarTela);

  document.getElementById("modalForm")?.addEventListener("click", (e) => {
    if (e.target.id === "modalForm") fecharModalForm();
  });

  // Modal toggle (ativar/inativar)
  document.getElementById("btnToggleCancelar")?.addEventListener("click", fecharModalToggle);
  document.getElementById("btnToggleCancelar2")?.addEventListener("click", fecharModalToggle);
  document.getElementById("btnToggleConfirmar")?.addEventListener("click", confirmarToggle);

  document.getElementById("modalToggle")?.addEventListener("click", (e) => {
    if (e.target.id === "modalToggle") fecharModalToggle();
  });

  // ESC fecha modais
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fecharModalForm();
      fecharModalToggle();
    }
  });

  carregarTelas();
});

// ================== CARREGAR LISTA ==================

async function carregarTelas() {
  const tbody = document.getElementById("tbodyTelas");
  const infoEl = document.getElementById("infoRegistros");
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" class="ut-empty">Carregando...</td></tr>';
  if (infoEl) infoEl.textContent = "Carregando...";

  const modulo = document.getElementById("fModulo")?.value.trim() || "";
  const codigoTela = document.getElementById("fCodigoTela")?.value.trim() || "";
  const nomeTela = document.getElementById("fNomeTela")?.value.trim() || "";
  const rota = document.getElementById("fRota")?.value.trim() || "";
  const ativo = document.getElementById("fAtivo")?.value || "";

  const params = new URLSearchParams();
  if (modulo) params.set("modulo", modulo);
  if (codigoTela) params.set("codigoTela", codigoTela);
  if (nomeTela) params.set("nomeTela", nomeTela);
  if (rota) params.set("rota", rota);
  if (ativo !== "") params.set("ativo", ativo);

  const path =
    "/telas-admin" + (params.toString() ? "?" + params.toString() : "");

  setLoading(true);
  try {
    const resp = await fetch(window.API_BASE + path, {
      headers: getHeaders(),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.error || "HTTP " + resp.status);
    }
    const data = await resp.json();
    listaTelas = Array.isArray(data.telas) ? data.telas : [];
    renderTabela(listaTelas);
    if (infoEl) {
      const qtd = listaTelas.length;
      infoEl.textContent = qtd === 1 ? "1 tela" : `${qtd.toLocaleString("pt-BR")} telas`;
    }
  } catch (e) {
    console.error("[TELAS][carregarTelas]", e);
    tbody.innerHTML = `<tr><td colspan="7" class="ut-empty">${escapeHtml(e.message || "Erro ao carregar")}</td></tr>`;
    if (infoEl) infoEl.textContent = "Erro ao carregar";
    mostrarToast(e.message || "Erro ao carregar telas.", true);
  } finally {
    setLoading(false);
  }
}

// ================== RENDER TABELA ==================

function renderTabela(lista) {
  const tbody = document.getElementById("tbodyTelas");
  if (!tbody) return;

  if (!lista.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="ut-empty">Nenhuma tela encontrada.</td></tr>';
    return;
  }

  let html = "";
  for (const t of lista) {
    const ativo = Number(t.Ativo) === 1;
    html += `
      <tr>
        <td>${escapeHtml(t.Id)}</td>
        <td>${escapeHtml(t.Modulo)}</td>
        <td class="cell-codigo">${escapeHtml(t.CodigoTela)}</td>
        <td title="${escapeHtml(t.NomeTela)}">${escapeHtml(t.NomeTela)}</td>
        <td class="cell-rota">${escapeHtml(t.Rota)}</td>
        <td>
          <span class="pill-status ${ativo ? "ativo" : "inativo"}">${ativo ? "Ativo" : "Inativo"}</span>
        </td>
        <td>
          <div class="td-acoes">
            <button type="button" class="btn-acao btn-editar" data-id="${t.Id}">
              Editar
            </button>
            <button type="button" class="btn-acao ${ativo ? "btn-acao-warn" : ""} btn-toggle" data-id="${t.Id}" data-ativo="${ativo ? 1 : 0}">
              ${ativo ? "Inativar" : "Ativar"}
            </button>
          </div>
        </td>
      </tr>`;
  }

  tbody.innerHTML = html;

  tbody.querySelectorAll(".btn-editar").forEach((btn) => {
    btn.addEventListener("click", () => abrirModalEditar(Number(btn.dataset.id)));
  });
  tbody.querySelectorAll(".btn-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = Number(btn.dataset.id);
      const ativoAtual = Number(btn.dataset.ativo) === 1;
      abrirModalToggle(id, ativoAtual);
    });
  });
}

// ================== MODAL FORM (NOVA / EDITAR) ==================

function abrirModalNova() {
  modoEdicao = false;
  idEdicaoAtual = null;

  document.getElementById("modalFormTitulo").textContent = "Nova Tela";
  document.getElementById("fmModulo").value = "";
  document.getElementById("fmCodigoTela").value = "";
  document.getElementById("fmNomeTela").value = "";
  document.getElementById("fmRota").value = "";
  document.getElementById("fmAtivo").value = "1";
  document.getElementById("formErro").textContent = "";

  const modal = document.getElementById("modalForm");
  if (modal) {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }
  setTimeout(() => document.getElementById("fmModulo")?.focus(), 80);
}

function abrirModalEditar(id) {
  const t = listaTelas.find((x) => Number(x.Id) === id);
  if (!t) {
    mostrarToast("Tela não encontrada na lista.", true);
    return;
  }

  modoEdicao = true;
  idEdicaoAtual = id;

  document.getElementById("modalFormTitulo").textContent = `Editar Tela #${id}`;
  document.getElementById("fmModulo").value = t.Modulo || "";
  document.getElementById("fmCodigoTela").value = t.CodigoTela || "";
  document.getElementById("fmNomeTela").value = t.NomeTela || "";
  document.getElementById("fmRota").value = t.Rota || "";
  document.getElementById("fmAtivo").value = String(Number(t.Ativo) || 0);
  document.getElementById("formErro").textContent = "";

  const modal = document.getElementById("modalForm");
  if (modal) {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }
  setTimeout(() => document.getElementById("fmNomeTela")?.focus(), 80);
}

function fecharModalForm() {
  const modal = document.getElementById("modalForm");
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
  modoEdicao = false;
  idEdicaoAtual = null;
}

async function salvarTela() {
  const erroEl = document.getElementById("formErro");
  erroEl.textContent = "";

  const Modulo = document.getElementById("fmModulo").value.trim();
  const CodigoTela = document.getElementById("fmCodigoTela").value.trim();
  const NomeTela = document.getElementById("fmNomeTela").value.trim();
  const Rota = document.getElementById("fmRota").value.trim();
  const Ativo = parseInt(document.getElementById("fmAtivo").value, 10);

  if (!Modulo || !CodigoTela || !NomeTela || !Rota) {
    erroEl.textContent = "Preencha todos os campos obrigatórios.";
    return;
  }

  if (!Rota.startsWith("/")) {
    erroEl.textContent = 'A Rota precisa começar com "/".';
    return;
  }

  if (![0, 1].includes(Ativo)) {
    erroEl.textContent = "Status inválido.";
    return;
  }

  const payload = { Modulo, CodigoTela, NomeTela, Rota, Ativo };

  setLoading(true);
  try {
    let url = `${window.API_BASE}/telas-admin`;
    let method = "POST";
    if (modoEdicao && idEdicaoAtual) {
      url = `${window.API_BASE}/telas-admin/${idEdicaoAtual}`;
      method = "PUT";
    }

    const resp = await fetch(url, {
      method,
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      throw new Error(data.error || "HTTP " + resp.status);
    }

    fecharModalForm();
    mostrarToast(modoEdicao ? "Tela atualizada." : "Tela criada.");
    await carregarTelas();
  } catch (e) {
    console.error("[TELAS][salvarTela]", e);
    erroEl.textContent = e.message || "Erro ao salvar.";
    mostrarToast(e.message || "Erro ao salvar tela.", true);
  } finally {
    setLoading(false);
  }
}

// ================== MODAL ATIVAR / INATIVAR ==================

function abrirModalToggle(id, ativoAtual) {
  const t = listaTelas.find((x) => Number(x.Id) === id);
  const nome = t ? t.NomeTela : `ID ${id}`;
  const acao = ativoAtual ? "inativar" : "ativar";

  togglePendente = { id, novoAtivo: ativoAtual ? 0 : 1, nome };

  document.getElementById("modalToggleTitulo").textContent =
    `Confirmar ${acao}`;
  document.getElementById("modalToggleMsg").textContent =
    `Deseja ${acao} a tela "${nome}"? Esta ação altera o status de exibição da tela.`;

  const btn = document.getElementById("btnToggleConfirmar");
  if (btn) btn.textContent = ativoAtual ? "Inativar" : "Ativar";

  const modal = document.getElementById("modalToggle");
  if (modal) {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }
}

function fecharModalToggle() {
  const modal = document.getElementById("modalToggle");
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
  togglePendente = null;
}

async function confirmarToggle() {
  if (!togglePendente) return;
  const { id, novoAtivo, nome } = togglePendente;

  setLoading(true);
  try {
    const acao = novoAtivo === 1 ? "ativar" : "inativar";
    const resp = await fetch(`${window.API_BASE}/telas-admin/${id}/${acao}`, {
      method: "PATCH",
      headers: getHeaders(),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || "HTTP " + resp.status);

    fecharModalToggle();
    mostrarToast(`Tela "${nome}" ${novoAtivo === 1 ? "ativada" : "inativada"}.`);
    await carregarTelas();
  } catch (e) {
    console.error("[TELAS][confirmarToggle]", e);
    mostrarToast(e.message || "Erro ao alterar status.", true);
  } finally {
    setLoading(false);
  }
}