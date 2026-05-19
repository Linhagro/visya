// assets/js/cadastro_usuarios.js

const USUARIOS_API_BASE_PATH = "/usuarios";
let usuariosBruto = [];
let usuariosFiltrados = [];
let confirmCallback = null;
let resetSenhaUsuarioPendente = null;

const loaderOverlay = document.getElementById("loaderOverlay");
let loaderTimerId = null;

// ================== LOADER ==================

function setLoadingUsuarios(ativo) {
  if (!loaderOverlay) return;

  if (ativo) {
    if (loaderTimerId !== null) clearTimeout(loaderTimerId);
    loaderTimerId = setTimeout(() => {
      loaderOverlay.style.display = "flex";
      loaderOverlay.setAttribute("aria-hidden", "false");
    }, 50);
  } else {
    if (loaderTimerId !== null) {
      clearTimeout(loaderTimerId);
      loaderTimerId = null;
    }
    loaderOverlay.style.display = "none";
    loaderOverlay.setAttribute("aria-hidden", "true");
  }
}

// ================== TOAST ==================

function mostrarToastUsuarios(msg, isError = false) {
  const toast = document.getElementById("toastUsuarios");
  const span = document.getElementById("toastUsuariosMsg");
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

// ================== AUTH / API HELPERS ==================

function getAuthHeadersUsuarios() {
  try {
    const headers = { "Content-Type": "application/json" };
    const user =
      typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
    if (!user || !user.email) return headers;
    headers["x-usuario-email"] = user.email;
    try {
      const token =
        (window.sessionStorage && window.sessionStorage.getItem("authToken")) ||
        null;
      if (token) headers.Authorization = "Bearer " + token;
    } catch (e) {
      console.warn("[USUARIOS] erro ao ler token:", e);
    }
    return headers;
  } catch (e) {
    console.warn("[USUARIOS] erro ao montar headers:", e);
    return { "Content-Type": "application/json" };
  }
}

function getApiBaseUsuarios() {
  return (
    (window && (window.API_BASE || window.APIBASE)) ||
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1"
  );
}

async function apiGetUsuarios(path) {
  const url = getApiBaseUsuarios() + path;
  console.log("[USUARIOS] GET", url);
  const resp = await fetch(url, {
    method: "GET",
    headers: getAuthHeadersUsuarios(),
  });
  console.log("[USUARIOS] GET status:", resp.status);
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("[USUARIOS] GET erro body:", txt);
    throw new Error("GET " + path + " status " + resp.status);
  }
  return resp.json();
}

async function apiPostUsuarios(path, body) {
  const url = getApiBaseUsuarios() + path;
  console.log("[USUARIOS] POST", url, body);
  const resp = await fetch(url, {
    method: "POST",
    headers: getAuthHeadersUsuarios(),
    body: JSON.stringify(body),
  });
  console.log("[USUARIOS] POST status:", resp.status);
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("[USUARIOS] POST erro body:", txt);
    throw new Error("POST " + path + " status " + resp.status + " - " + txt);
  }
  return resp.json().catch(() => null);
}

async function apiPutUsuarios(path, body) {
  const url = getApiBaseUsuarios() + path;
  console.log("[USUARIOS] PUT", url, body);
  const resp = await fetch(url, {
    method: "PUT",
    headers: getAuthHeadersUsuarios(),
    body: JSON.stringify(body),
  });
  console.log("[USUARIOS] PUT status:", resp.status);
  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("[USUARIOS] PUT erro body:", txt);
    throw new Error("PUT " + path + " status " + resp.status + " - " + txt);
  }
  return resp.json().catch(() => null);
}

// ================== PROTEÇÃO PERFIL ADMIN ==================

function getUsuarioObrigatorio() {
  if (typeof getUsuarioAtual !== "function") {
    console.warn("[USUARIOS] getUsuarioAtual não definido.");
    window.location.href = "../../index.html";
    return null;
  }
  const user = getUsuarioAtual();
  if (!user || !user.email) {
    console.warn("[USUARIOS] Usuário inválido.");
    window.location.href = "../../index.html";
    return null;
  }
  const perfis = Array.isArray(user.perfis) ? user.perfis : user.perfis || [];
  const temAdmin =
    perfis.includes("ADMIN") ||
    perfis.includes("admin") ||
    perfis.includes("LOG_ADMIN");
  if (!temAdmin) {
    mostrarToastUsuarios(
      "Acesso restrito: apenas usuários ADMIN.",
      true
    );
    setTimeout(() => {
      window.location.href = "../../menu.html";
    }, 1800);
    return null;
  }
  return user;
}

// ================== INIT ==================

window.addEventListener("DOMContentLoaded", () => {
  console.log("[USUARIOS] DOMContentLoaded");

  const user = getUsuarioObrigatorio();
  if (!user) return;

  const nomeEl = document.getElementById("usuariosUserNome");
  const emailEl = document.getElementById("usuariosUserEmail");
  if (nomeEl) nomeEl.textContent = user.nome || "Usuário Admin";
  if (emailEl) emailEl.textContent = user.email || "";

  document
    .getElementById("fBuscaUsuario")
    ?.addEventListener("input", aplicarFiltroLocal);
  document
    .getElementById("fPerfil")
    ?.addEventListener("input", aplicarFiltroLocal);
  document
    .getElementById("fStatus")
    ?.addEventListener("change", aplicarFiltroLocal);

  document
    .getElementById("btnBuscarUsuarios")
    ?.addEventListener("click", carregarUsuarios);
  document
    .getElementById("btnLimparUsuarios")
    ?.addEventListener("click", limparFiltros);
  document
    .getElementById("btnNovoUsuario")
    ?.addEventListener("click", () => abrirModalUsuario(null));

  // modal usuario
  document
    .getElementById("btnFecharModalUsuario")
    ?.addEventListener("click", fecharModalUsuario);
  document
    .getElementById("btnCancelarUsuario")
    ?.addEventListener("click", fecharModalUsuario);
  document
    .getElementById("btnSalvarUsuario")
    ?.addEventListener("click", salvarUsuario);

  // modal confirmacao
  document
    .getElementById("btnFecharConfirmacao")
    ?.addEventListener("click", fecharModalConfirmacao);
  document
    .getElementById("btnConfirmCancelar")
    ?.addEventListener("click", fecharModalConfirmacao);
  document
    .getElementById("btnConfirmOk")
    ?.addEventListener("click", () => {
      if (typeof confirmCallback === "function") {
        const fn = confirmCallback;
        confirmCallback = null;
        fn();
      }
      fecharModalConfirmacao();
    });

  // modal reset senha
  document
    .getElementById("btnFecharResetSenha")
    ?.addEventListener("click", fecharModalResetSenha);
  document
    .getElementById("btnResetSenhaCancelar")
    ?.addEventListener("click", fecharModalResetSenha);
  document
    .getElementById("btnResetSenhaOk")
    ?.addEventListener("click", confirmarResetSenha);

  // backdrop fecha modais — usa mousedown+mouseup no MESMO backdrop pra evitar
  // que selecionar texto dentro do modal e soltar fora feche o modal
  function setupBackdropClose(modalId, fecharFn) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    let mouseDownInBackdrop = false;
    modal.addEventListener("mousedown", (e) => {
      mouseDownInBackdrop = e.target.id === modalId;
    });
    modal.addEventListener("mouseup", (e) => {
      if (mouseDownInBackdrop && e.target.id === modalId) {
        fecharFn();
      }
      mouseDownInBackdrop = false;
    });
  }

  setupBackdropClose("modalUsuario", fecharModalUsuario);
  setupBackdropClose("modalConfirmacao", fecharModalConfirmacao);
  setupBackdropClose("modalResetSenha", fecharModalResetSenha);

  // ESC fecha modais
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      fecharModalUsuario();
      fecharModalConfirmacao();
      fecharModalResetSenha();
    }
  });

  carregarUsuarios();
});

// ================== FILTROS / CARREGAMENTO ==================

function limparFiltros() {
  const fBusca = document.getElementById("fBuscaUsuario");
  const fPerfil = document.getElementById("fPerfil");
  const fStatus = document.getElementById("fStatus");
  if (fBusca) fBusca.value = "";
  if (fPerfil) fPerfil.value = "";
  if (fStatus) fStatus.value = "";
  aplicarFiltroLocal();
}

async function carregarUsuarios() {
  console.log("[USUARIOS] carregarUsuarios()");
  const tbody = document.getElementById("tbodyUsuarios");
  const info = document.getElementById("infoUsuarios");
  if (!tbody) return;

  tbody.innerHTML =
    '<tr><td colspan="6" class="ut-empty">Carregando usuários...</td></tr>';
  if (info) info.textContent = "Carregando usuários...";

  const user = getUsuarioObrigatorio();
  if (!user) return;

  setLoadingUsuarios(true);
  try {
    const data = await apiGetUsuarios(USUARIOS_API_BASE_PATH);
    usuariosBruto = Array.isArray(data.usuarios) ? data.usuarios : [];
    aplicarFiltroLocal();
  } catch (e) {
    console.error("Erro ao carregar usuários:", e);
    tbody.innerHTML =
      '<tr><td colspan="6" class="ut-empty">Erro ao carregar usuários. Tente novamente.</td></tr>';
    if (info) info.textContent = "Erro ao carregar usuários.";
    mostrarToastUsuarios("Erro ao carregar usuários.", true);
  } finally {
    setLoadingUsuarios(false);
  }
}

function aplicarFiltroLocal() {
  const tbody = document.getElementById("tbodyUsuarios");
  const info = document.getElementById("infoUsuarios");
  if (!tbody) return;

  const busca = (document.getElementById("fBuscaUsuario")?.value || "")
    .toLowerCase()
    .trim();
  const perfilFiltro = (document.getElementById("fPerfil")?.value || "")
    .trim()
    .toUpperCase();
  const statusFiltro = (document.getElementById("fStatus")?.value || "").trim();

  let itens = usuariosBruto.slice();

  if (busca) {
    itens = itens.filter((u) => {
      const nome = String(u.Nome || "").toLowerCase();
      const email = String(u.Email || "").toLowerCase();
      const empresas = String(u.Empresas || "").toLowerCase();
      const vendedorCrm = String(u.IdVendedorCrm || "").toLowerCase();
      const vendedorErp = String(u.IdVendedorErp || "").toLowerCase();
      return (
        nome.includes(busca) ||
        email.includes(busca) ||
        empresas.includes(busca) ||
        vendedorCrm.includes(busca) ||
        vendedorErp.includes(busca)
      );
    });
  }

  if (perfilFiltro) {
    itens = itens.filter((u) => {
      const perfis = String(u.Perfis || "").toUpperCase();
      return perfis.split(",").map((p) => p.trim()).includes(perfilFiltro);
    });
  }

  if (statusFiltro) {
    itens = itens.filter((u) => {
      const ativo = Number(u.Ativo ?? 1) === 1;
      const st = ativo ? "ativo" : "inativo";
      return st === statusFiltro;
    });
  }

  usuariosFiltrados = itens;

  if (!itens.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="ut-empty">Nenhum usuário encontrado.</td></tr>';
    if (info) info.textContent = "0 usuários";
    return;
  }

  let html = "";
  let ativos = 0;
  let admins = 0;
  let inativos = 0;

  for (const u of itens) {
    const id = u.Id;
    const nome = u.Nome || "sem nome";
    const email = u.Email || "";
    const ativo = Number(u.Ativo ?? 1) === 1;
    const empresasStr = u.Empresas || "";
    const perfisStr = u.Perfis || "";

    if (ativo) ativos++;
    else inativos++;

    const perfisArr = perfisStr
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (perfisArr.includes("ADMIN")) admins++;

    const statusClass = ativo ? "ativo" : "inativo";
    const perfisHtml = perfisArr.length
      ? perfisArr
          .map(
            (p) =>
              `<span class="perfil-tag ${p === "ADMIN" ? "perfil-admin" : ""}">${encodeHtml(p)}</span>`
          )
          .join("")
      : "—";

    html += `
      <tr data-id="${encodeHtml(String(id))}">
        <td title="${encodeHtml(nome)}">${encodeHtml(nome)}</td>
        <td class="cell-email" title="${encodeHtml(email)}">${encodeHtml(email)}</td>
        <td><div class="td-perfis">${perfisHtml}</div></td>
        <td title="${encodeHtml(empresasStr)}">${encodeHtml(empresasStr) || "—"}</td>
        <td>
          <span class="pill-status ${statusClass}">
            <span class="pill-status-dot"></span>
            ${ativo ? "Ativo" : "Inativo"}
          </span>
        </td>
        <td>
          <div class="td-acoes">
            <button type="button" class="btn-acao" data-acao="editar">Editar</button>
            <button type="button" class="btn-acao ${ativo ? "btn-acao-warn" : ""}" data-acao="toggle">
              ${ativo ? "Desativar" : "Reativar"}
            </button>
            <button type="button" class="btn-acao" data-acao="reset">Senha</button>
          </div>
        </td>
      </tr>`;
  }

  tbody.innerHTML = html;

  tbody
    .querySelectorAll("button[data-acao]")
    .forEach((btn) => btn.addEventListener("click", onClickAcaoUsuario));

  if (info) {
    info.textContent = `${itens.length} usuários — ${ativos} ativos · ${admins} admins · ${inativos} inativos`;
  }
}

// ================== AÇÕES POR LINHA ==================

function onClickAcaoUsuario(ev) {
  const btn = ev.currentTarget;
  const tr = btn.closest("tr");
  if (!tr) return;

  const id = tr.getAttribute("data-id");
  const acao = btn.getAttribute("data-acao");
  const usuario = usuariosBruto.find((u) => String(u.Id) === String(id));
  if (!usuario) return;

  if (acao === "editar") {
    abrirModalUsuario(usuario);
  } else if (acao === "toggle") {
    const ativo = Number(usuario.Ativo ?? 1) === 1;
    const novoAtivo = !ativo;
    abrirConfirmacao(
      novoAtivo ? "Reativar usuário" : "Desativar usuário",
      `Confirma ${novoAtivo ? "reativar" : "desativar"} o usuário "${
        usuario.Nome || usuario.Email || ""
      }"?`,
      () => alterarStatusUsuario(usuario, novoAtivo)
    );
  } else if (acao === "reset") {
    abrirModalResetSenha(usuario);
  }
}

// ================== MODAL USUÁRIO ==================

function setSelectMultipleValues(selectEl, valores) {
  if (!selectEl) return;
  const set = new Set((valores || []).map(String));
  Array.from(selectEl.options).forEach((opt) => {
    opt.selected = set.has(String(opt.value));
  });
}

function abrirModalUsuario(u) {
  const modal = document.getElementById("modalUsuario");
  if (!modal) return;

  const titulo = document.getElementById("modalUsuarioTitulo");
  const idInput = document.getElementById("usuarioId");
  const nomeInput = document.getElementById("usuarioNome");
  const emailInput = document.getElementById("usuarioEmail");
  const senhaInput = document.getElementById("usuarioSenha");
  const perfisSelect = document.getElementById("usuarioPerfisSelect");
  const empresasSelect = document.getElementById("usuarioEmpresasSelect");
  const vendedorCrmInput = document.getElementById("usuarioVendedorCrm");
  const vendedorErpInput = document.getElementById("usuarioVendedorErp");
  const erroEl = document.getElementById("usuarioErro");
  const grupoSenha = document.getElementById("grupoSenha");

  if (!titulo || !idInput || !nomeInput || !emailInput) return;

  if (u) {
    titulo.textContent = `Editar Usuário #${u.Id}`;
    idInput.value = u.Id;
    nomeInput.value = u.Nome || "";
    emailInput.value = u.Email || "";

    const arrPerfis = String(u.Perfis || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const arrEmpresas = String(u.Empresas || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setSelectMultipleValues(perfisSelect, arrPerfis);
    setSelectMultipleValues(empresasSelect, arrEmpresas);

    if (vendedorCrmInput) {
      vendedorCrmInput.value =
        u.IdVendedorCrm !== null && u.IdVendedorCrm !== undefined
          ? u.IdVendedorCrm
          : "";
    }

    if (vendedorErpInput) {
      vendedorErpInput.value =
        u.IdVendedorErp !== null && u.IdVendedorErp !== undefined
          ? u.IdVendedorErp
          : "";
    }

    const ativo = Number(u.Ativo ?? 1) === 1;
    const radio = document.querySelector(
      `input[name="usuarioStatus"][value="${ativo ? "ativo" : "inativo"}"]`
    );
    if (radio) radio.checked = true;

    if (grupoSenha) grupoSenha.style.display = "none";
    if (senhaInput) senhaInput.value = "";
    if (erroEl) erroEl.textContent = "";
  } else {
    titulo.textContent = "Novo Usuário";
    idInput.value = "";
    nomeInput.value = "";
    emailInput.value = "";

    setSelectMultipleValues(perfisSelect, []);
    setSelectMultipleValues(empresasSelect, []);

    if (vendedorCrmInput) vendedorCrmInput.value = "";
    if (vendedorErpInput) vendedorErpInput.value = "";

    if (senhaInput) senhaInput.value = "";
    const radioAtivo = document.querySelector(
      'input[name="usuarioStatus"][value="ativo"]'
    );
    if (radioAtivo) radioAtivo.checked = true;
    if (grupoSenha) grupoSenha.style.display = "";
    if (erroEl) erroEl.textContent = "";
  }

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => nomeInput?.focus(), 80);
}

function fecharModalUsuario() {
  const modal = document.getElementById("modalUsuario");
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
}

// ================== SALVAR USUÁRIO ==================

function getSelectMultipleValues(selectEl) {
  if (!selectEl) return [];
  return Array.from(selectEl.selectedOptions).map((opt) => opt.value);
}

async function salvarUsuario() {
  const id = document.getElementById("usuarioId")?.value;
  const nome = document.getElementById("usuarioNome")?.value.trim();
  const email = document.getElementById("usuarioEmail")?.value.trim();
  const senha = document.getElementById("usuarioSenha")?.value;
  const perfisSelect = document.getElementById("usuarioPerfisSelect");
  const empresasSelect = document.getElementById("usuarioEmpresasSelect");
  const vendedorCrmRaw = document.getElementById("usuarioVendedorCrm")?.value.trim();
  const vendedorErpRaw = document.getElementById("usuarioVendedorErp")?.value.trim();
  const erroEl = document.getElementById("usuarioErro");
  const status = document.querySelector(
    'input[name="usuarioStatus"]:checked'
  )?.value;

  if (erroEl) erroEl.textContent = "";

  if (!nome || !email) {
    if (erroEl) erroEl.textContent = "Nome e e-mail são obrigatórios.";
    return;
  }

  const criando = !id;
  if (criando && !senha) {
    if (erroEl)
      erroEl.textContent = "Defina uma senha inicial para o novo usuário.";
    return;
  }

  const perfisCodigos = getSelectMultipleValues(perfisSelect);
  const empresasCodigos = getSelectMultipleValues(empresasSelect);
  const ativo = status === "ativo";

  const idVendedorCrm =
    vendedorCrmRaw === "" ? null : Number(vendedorCrmRaw);
  const idVendedorErp = vendedorErpRaw === "" ? null : vendedorErpRaw;

  if (vendedorCrmRaw !== "" && Number.isNaN(idVendedorCrm)) {
    if (erroEl) erroEl.textContent = "Vendedor CRM deve ser numérico.";
    return;
  }

  const payload = {
    nome,
    email,
    ativo,
    empresasCodigos,
    perfisCodigos,
    idVendedorCrm,
    idVendedorErp,
  };
  if (criando) payload.senha = senha;

  const user = getUsuarioObrigatorio();
  if (!user) return;

  setLoadingUsuarios(true);
  try {
    if (criando) {
      await apiPostUsuarios(USUARIOS_API_BASE_PATH, payload);
      mostrarToastUsuarios("Usuário criado.");
    } else {
      await apiPutUsuarios(
        `${USUARIOS_API_BASE_PATH}/${encodeURIComponent(id)}`,
        payload
      );
      mostrarToastUsuarios("Usuário atualizado.");
    }
    fecharModalUsuario();
    await carregarUsuarios();
  } catch (e) {
    console.error("Erro ao salvar usuário:", e);
    if (erroEl)
      erroEl.textContent =
        "Erro ao salvar. Verifique os dados e tente novamente.";
    mostrarToastUsuarios("Erro ao salvar usuário.", true);
  } finally {
    setLoadingUsuarios(false);
  }
}

// ================== STATUS ==================

async function alterarStatusUsuario(usuario, novoAtivo) {
  const user = getUsuarioObrigatorio();
  if (!user) return;

  const path = `${USUARIOS_API_BASE_PATH}/${encodeURIComponent(
    usuario.Id
  )}/ativo`;
  setLoadingUsuarios(true);
  try {
    await apiPutUsuarios(path, { ativo: novoAtivo });
    mostrarToastUsuarios(
      `Usuário ${novoAtivo ? "reativado" : "desativado"}.`
    );
    await carregarUsuarios();
  } catch (e) {
    console.error("Erro ao alterar status:", e);
    mostrarToastUsuarios("Erro ao alterar status.", true);
  } finally {
    setLoadingUsuarios(false);
  }
}

// ================== MODAL RESET SENHA ==================

function abrirModalResetSenha(usuario) {
  resetSenhaUsuarioPendente = usuario;
  const modal = document.getElementById("modalResetSenha");
  const msg = document.getElementById("resetSenhaUsuarioNome");
  const input = document.getElementById("novaSenhaInput");
  const erro = document.getElementById("resetSenhaErro");
  if (!modal) return;

  if (msg) {
    msg.textContent = `Informe a nova senha para "${
      usuario.Nome || usuario.Email || ""
    }".`;
  }
  if (input) input.value = "";
  if (erro) erro.textContent = "";

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  setTimeout(() => input?.focus(), 80);
}

function fecharModalResetSenha() {
  const modal = document.getElementById("modalResetSenha");
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
  resetSenhaUsuarioPendente = null;
}

async function confirmarResetSenha() {
  if (!resetSenhaUsuarioPendente) return;

  const input = document.getElementById("novaSenhaInput");
  const erro = document.getElementById("resetSenhaErro");
  const novaSenha = input?.value || "";

  if (erro) erro.textContent = "";

  if (!novaSenha || novaSenha.length < 4) {
    if (erro) erro.textContent = "Senha deve ter pelo menos 4 caracteres.";
    return;
  }

  const user = getUsuarioObrigatorio();
  if (!user) return;

  const usuario = resetSenhaUsuarioPendente;
  const path = `${USUARIOS_API_BASE_PATH}/${encodeURIComponent(
    usuario.Id
  )}/senha`;

  setLoadingUsuarios(true);
  try {
    await apiPutUsuarios(path, { novaSenha });
    mostrarToastUsuarios("Senha alterada com sucesso.");
    fecharModalResetSenha();
  } catch (e) {
    console.error("Erro ao alterar senha:", e);
    if (erro) erro.textContent = "Erro ao alterar senha. Tente novamente.";
    mostrarToastUsuarios("Erro ao alterar senha.", true);
  } finally {
    setLoadingUsuarios(false);
  }
}

// ================== MODAL CONFIRMAÇÃO ==================

function abrirConfirmacao(titulo, mensagem, callback) {
  const modal = document.getElementById("modalConfirmacao");
  const tit = document.getElementById("confirmTitulo");
  const msg = document.getElementById("confirmMensagem");
  if (!modal || !tit || !msg) return;

  tit.textContent = titulo || "Confirmar ação";
  msg.textContent = mensagem || "Tem certeza?";
  confirmCallback = callback;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
}

function fecharModalConfirmacao() {
  const modal = document.getElementById("modalConfirmacao");
  if (modal) {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  }
  confirmCallback = null;
}

// ================== HELPERS ==================

function encodeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}