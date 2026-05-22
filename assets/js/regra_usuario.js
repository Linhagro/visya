// ================== CONFIG / ESTADO ==================

if (!window.API_BASE) {
  window.API_BASE =
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}

let usuariosCache = [];        // lista completa de usuários
let usuarioSelecionadoId = null;
let permissoesAtuais = [];     // array mergeado: 1 item por tela { idTela, modulo, nomeTela, nivelAcesso... }
let modulosAbertos = new Set(); // módulos expandidos

const loaderOverlay = document.getElementById("loaderOverlay");
let loaderTimerId = null;

// ================== TOAST ==================

function toastRegras(msg, tipo = "") {
  const t = document.getElementById("regrasToast");
  if (!t) return;
  t.textContent = msg;
  t.className = "regras-toast is-visible" + (tipo ? " is-" + tipo : "");
  setTimeout(() => {
    t.classList.remove("is-visible");
  }, 3000);
}

// ================== LOADER ==================

function setLoadingRegras(isLoading) {
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

// ================== AUTENTICAÇÃO ==================

function getUsuarioObrigatorioRegras() {
  const user =
    typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
  if (!user || !user.email) {
    window.location.href = "/index.html";
    return null;
  }
  return user;
}

function getAuthHeadersRegras() {
  const user = getUsuarioObrigatorioRegras();
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
      console.warn("[REGRAS] Erro ao ler authToken:", e);
    }
  }

  headers["x-usuario-email"] = user.email;
  return headers;
}

async function apiGetRegras(path) {
  const base = window.API_BASE;
  if (!base) throw new Error("API base não configurada");
  const url = base + path;
  const headers = getAuthHeadersRegras();

  let resp;
  try {
    resp = await fetch(url, { method: "GET", headers });
  } catch (err) {
    console.error("[REGRAS][GET] Erro de rede/fetch:", err);
    throw new Error("Falha na comunicação com o servidor");
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("[REGRAS][GET] HTTP", resp.status, txt);
    throw new Error("HTTP " + resp.status + " ao chamar " + path);
  }
  return resp.json();
}

async function apiPutRegras(path, bodyObj) {
  const base = window.API_BASE;
  if (!base) throw new Error("API base não configurada");
  const url = base + path;
  const headers = getAuthHeadersRegras();

  let resp;
  try {
    resp = await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify(bodyObj || {}),
    });
  } catch (err) {
    console.error("[REGRAS][PUT] Erro de rede/fetch:", err);
    throw new Error("Falha na comunicação com o servidor");
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    console.error("[REGRAS][PUT] HTTP", resp.status, txt);
    throw new Error("HTTP " + resp.status + " ao chamar " + path);
  }
  return resp.json();
}

// ================== BOOTSTRAP ==================

window.addEventListener("DOMContentLoaded", () => {
  const user = getUsuarioObrigatorioRegras();
  if (!user) return;

  const nomeEl = document.getElementById("regrasUserNome");
  const emailEl = document.getElementById("regrasUserEmail");
  if (nomeEl) nomeEl.textContent = user.nome || "Usuário VISYA";
  if (emailEl) emailEl.textContent = user.email || "";

  // Busca de usuários
  const buscaUsuario = document.getElementById("buscaUsuario");
  if (buscaUsuario) {
    buscaUsuario.addEventListener("input", () => {
      renderListaUsuarios(buscaUsuario.value.trim().toLowerCase());
    });
  }

  // Busca de telas/módulos
  const buscaTela = document.getElementById("buscaTela");
  if (buscaTela) {
    buscaTela.addEventListener("input", () => {
      filtrarTelas(buscaTela.value.trim().toLowerCase());
    });
  }

  // Botões da toolbar
  const btnRecarregar = document.getElementById("btnRecarregar");
  if (btnRecarregar) {
    btnRecarregar.addEventListener("click", () => {
      if (usuarioSelecionadoId) carregarPermissoes();
    });
  }

  const btnSalvar = document.getElementById("btnSalvar");
  if (btnSalvar) btnSalvar.addEventListener("click", salvarPermissoes);

  const btnExpandir = document.getElementById("btnExpandirTodos");
  if (btnExpandir) btnExpandir.addEventListener("click", toggleExpandirTodos);

  const btnMarcar = document.getElementById("btnMarcarTodos");
  if (btnMarcar) btnMarcar.addEventListener("click", () => marcarTodos(true));

  const btnLimpar = document.getElementById("btnLimparTodos");
  if (btnLimpar) btnLimpar.addEventListener("click", () => marcarTodos(false));

  carregarUsuarios();
});

// ================== CARREGAR USUÁRIOS ==================

async function carregarUsuarios() {
  setLoadingRegras(true);
  try {
    const data = await apiGetRegras("/usuarios");
    usuariosCache = Array.isArray(data.usuarios) ? data.usuarios : [];
    renderListaUsuarios("");
  } catch (e) {
    console.error("[REGRAS][carregarUsuarios] Erro:", e);
    const lista = document.getElementById("usuariosLista");
    if (lista) {
      lista.innerHTML =
        '<div class="usuarios-empty">Erro ao carregar usuários.</div>';
    }
    toastRegras("Erro ao carregar lista de usuários.", "error");
  } finally {
    setLoadingRegras(false);
  }
}

function iniciaisDoNome(nome) {
  const partes = String(nome || "").trim().split(/\s+/);
  if (!partes.length || !partes[0]) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2);
  return (partes[0][0] || "") + (partes[partes.length - 1][0] || "");
}

function renderListaUsuarios(filtro) {
  const lista = document.getElementById("usuariosLista");
  if (!lista) return;

  let usuarios = usuariosCache.slice();
  if (filtro) {
    usuarios = usuarios.filter((u) => {
      const nome = String(u.Nome || "").toLowerCase();
      const email = String(u.Email || "").toLowerCase();
      return nome.includes(filtro) || email.includes(filtro);
    });
  }

  if (!usuarios.length) {
    lista.innerHTML =
      '<div class="usuarios-empty">Nenhum usuário encontrado.</div>';
    return;
  }

  let html = "";
  usuarios.forEach((u) => {
    const id = u.Id != null ? String(u.Id) : "";
    const nome = u.Nome || "Sem nome";
    const email = u.Email || "";
    const ativo = id === String(usuarioSelecionadoId) ? "is-active" : "";
    html += `
      <div class="usuario-item ${ativo}" data-id="${escapeHtml(id)}" data-nome="${escapeHtml(nome)}" data-email="${escapeHtml(email)}">
        <div class="usuario-avatar">${escapeHtml(iniciaisDoNome(nome))}</div>
        <div class="usuario-dados">
          <span class="usuario-nome">${escapeHtml(nome)}</span>
          <span class="usuario-email">${escapeHtml(email)}</span>
        </div>
      </div>
    `;
  });
  lista.innerHTML = html;

  lista.querySelectorAll(".usuario-item").forEach((item) => {
    item.addEventListener("click", () => {
      usuarioSelecionadoId = item.dataset.id || null;
      const nome = item.dataset.nome || "—";

      lista.querySelectorAll(".usuario-item").forEach((i) =>
        i.classList.toggle("is-active", i === item)
      );

      const nomeEl = document.getElementById("permUsuarioNome");
      if (nomeEl) nomeEl.textContent = nome;

      if (usuarioSelecionadoId) carregarPermissoes();
    });
  });
}

// ================== CARREGAR PERMISSÕES (MERGE) ==================

async function carregarPermissoes() {
  if (!usuarioSelecionadoId) return;

  const vazio = document.getElementById("permissoesVazio");
  const conteudo = document.getElementById("permissoesConteudo");
  if (vazio) vazio.style.display = "none";
  if (conteudo) conteudo.style.display = "flex";

  setLoadingRegras(true);
  try {
    const respTelas = await apiGetRegras("/telas");
    const telas = Array.isArray(respTelas.telas) ? respTelas.telas : [];

    const respPerm = await apiGetRegras(
      `/usuarios/${usuarioSelecionadoId}/telas-permissoes`
    );
    const permissoesUsuario = Array.isArray(respPerm.permissoes)
      ? respPerm.permissoes
      : [];

    const mapaPerm = new Map();
    permissoesUsuario.forEach((p) => mapaPerm.set(p.idTela, p));

    permissoesAtuais = telas.map((t) => {
      const perm = mapaPerm.get(t.Id);
      const nivelAcesso = perm ? (perm.nivelAcesso || "N") : "N";
      return {
        idTela: t.Id,
        modulo: t.Modulo || "SEM MÓDULO",
        nomeTela: t.NomeTela || "",
        codigoTela: t.CodigoTela,
        rota: t.Rota,
        nivelAcesso,
      };
    });

    renderModulos();
  } catch (e) {
    console.error("[REGRAS][carregarPermissoes] Erro:", e);
    const modulosLista = document.getElementById("modulosLista");
    if (modulosLista) {
      modulosLista.innerHTML =
        '<div class="usuarios-empty">Erro ao carregar permissões.</div>';
    }
    toastRegras("Erro ao carregar permissões.", "error");
  } finally {
    setLoadingRegras(false);
  }
}

// ================== RENDER MÓDULOS (ACCORDION + SWITCHES) ==================

function renderModulos() {
  const cont = document.getElementById("modulosLista");
  if (!cont) return;

  if (!permissoesAtuais.length) {
    cont.innerHTML =
      '<div class="usuarios-empty">Nenhuma tela encontrada.</div>';
    atualizarStats();
    return;
  }

  // Agrupa por módulo
  const grupos = new Map();
  permissoesAtuais.forEach((p) => {
    if (!grupos.has(p.modulo)) grupos.set(p.modulo, []);
    grupos.get(p.modulo).push(p);
  });

  let html = "";
  grupos.forEach((telas, modulo) => {
    const total = telas.length;
    const comAcesso = telas.filter((t) => t.nivelAcesso !== "N").length;
    const aberto = modulosAbertos.has(modulo) ? "is-open" : "";
    const moduloKey = encodeURIComponent(modulo);

    html += `
      <div class="modulo-card ${aberto}" data-modulo="${escapeHtml(modulo)}">
        <div class="modulo-card-head" data-toggle="${escapeHtml(modulo)}">
          <span class="modulo-seta"><svg class="vicon vicon-sm" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"></polyline></svg></span>
          <span class="modulo-nome">${escapeHtml(modulo)}</span>
          <span class="modulo-contador ${comAcesso > 0 ? "tem-acesso" : ""}" data-contador="${escapeHtml(modulo)}">
            ${comAcesso}/${total}
          </span>
          <label class="switch" onclick="event.stopPropagation()">
            <input type="checkbox" class="switch-modulo" data-modulo-key="${moduloKey}" />
            <span class="switch-slider"></span>
          </label>
        </div>
        <div class="modulo-card-body">
    `;

    telas.forEach((t) => {
      const checked = t.nivelAcesso !== "N" ? "checked" : "";
      html += `
        <div class="tela-item" data-tela-nome="${escapeHtml((t.nomeTela || "").toLowerCase())}">
          <span class="tela-nome">${escapeHtml(t.nomeTela || "")}</span>
          <label class="switch">
            <input
              type="checkbox"
              class="switch-tela"
              data-tela-id="${t.idTela}"
              data-modulo-key="${moduloKey}"
              ${checked}
            />
            <span class="switch-slider"></span>
          </label>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  cont.innerHTML = html;

  // Toggle accordion
  cont.querySelectorAll(".modulo-card-head").forEach((head) => {
    head.addEventListener("click", () => {
      const modulo = head.dataset.toggle;
      const card = head.closest(".modulo-card");
      if (!card) return;
      const abrindo = !card.classList.contains("is-open");
      card.classList.toggle("is-open", abrindo);
      if (abrindo) modulosAbertos.add(modulo);
      else modulosAbertos.delete(modulo);
    });
  });

  // Switch de tela individual
  cont.querySelectorAll(".switch-tela").forEach((sw) => {
    sw.addEventListener("change", () => {
      const idTela = parseInt(sw.dataset.telaId, 10);
      const item = permissoesAtuais.find((p) => p.idTela === idTela);
      if (item) item.nivelAcesso = sw.checked ? "W" : "N";
      atualizarModuloSwitch(sw.dataset.moduloKey);
      atualizarStats();
    });
  });

  // Switch de módulo (controla todas as telas dele)
  cont.querySelectorAll(".switch-modulo").forEach((sw) => {
    sw.addEventListener("change", () => {
      const moduloKey = sw.dataset.moduloKey;
      const modulo = decodeURIComponent(moduloKey);
      const marcar = sw.checked;
      cont
        .querySelectorAll(`.switch-tela[data-modulo-key="${CSS.escape(moduloKey)}"]`)
        .forEach((telaSw) => {
          telaSw.checked = marcar;
          const idTela = parseInt(telaSw.dataset.telaId, 10);
          const item = permissoesAtuais.find((p) => p.idTela === idTela);
          if (item) item.nivelAcesso = marcar ? "W" : "N";
        });
      atualizarContadorModulo(modulo);
      atualizarStats();
    });
  });

  // Sincroniza estado inicial dos switches de módulo
  grupos.forEach((telas, modulo) => {
    atualizarModuloSwitch(encodeURIComponent(modulo));
  });

  atualizarStats();
}

// Atualiza o switch do módulo (checked/indeterminate) e o contador
function atualizarModuloSwitch(moduloKey) {
  const cont = document.getElementById("modulosLista");
  if (!cont) return;

  const filhos = Array.from(
    cont.querySelectorAll(`.switch-tela[data-modulo-key="${CSS.escape(moduloKey)}"]`)
  );
  const total = filhos.length;
  const marcados = filhos.filter((f) => f.checked).length;

  const swModulo = cont.querySelector(
    `.switch-modulo[data-modulo-key="${CSS.escape(moduloKey)}"]`
  );
  if (swModulo) {
    if (marcados === 0) {
      swModulo.checked = false;
      swModulo.indeterminate = false;
    } else if (marcados === total) {
      swModulo.checked = true;
      swModulo.indeterminate = false;
    } else {
      swModulo.checked = false;
      swModulo.indeterminate = true;
    }
  }

  atualizarContadorModulo(decodeURIComponent(moduloKey));
}

function atualizarContadorModulo(modulo) {
  const cont = document.getElementById("modulosLista");
  if (!cont) return;
  const contador = cont.querySelector(
    `[data-contador="${CSS.escape(modulo)}"]`
  );
  if (!contador) return;

  const doModulo = permissoesAtuais.filter((p) => p.modulo === modulo);
  const total = doModulo.length;
  const comAcesso = doModulo.filter((p) => p.nivelAcesso !== "N").length;
  contador.textContent = `${comAcesso}/${total}`;
  contador.classList.toggle("tem-acesso", comAcesso > 0);
}

// ================== STATS (CABEÇALHO) ==================

function atualizarStats() {
  const statsEl = document.getElementById("permStats");
  if (!statsEl) return;
  const total = permissoesAtuais.length;
  const comAcesso = permissoesAtuais.filter((p) => p.nivelAcesso !== "N").length;
  statsEl.innerHTML = `<strong>${comAcesso}</strong> de ${total} telas com acesso`;
}

// ================== BUSCA DE TELAS ==================

function filtrarTelas(termo) {
  const cont = document.getElementById("modulosLista");
  if (!cont) return;

  cont.querySelectorAll(".modulo-card").forEach((card) => {
    const itens = Array.from(card.querySelectorAll(".tela-item"));
    let visiveis = 0;

    itens.forEach((item) => {
      const nome = item.dataset.telaNome || "";
      const modulo = (card.dataset.modulo || "").toLowerCase();
      const bate = !termo || nome.includes(termo) || modulo.includes(termo);
      item.classList.toggle("tela-hidden", !bate);
      if (bate) visiveis++;
    });

    // Esconde o card inteiro se nenhuma tela bate
    card.classList.toggle("modulo-hidden", visiveis === 0);

    // Abre automaticamente os que têm match durante a busca
    if (termo && visiveis > 0) {
      card.classList.add("is-open");
    } else if (!termo) {
      const modulo = card.dataset.modulo;
      card.classList.toggle("is-open", modulosAbertos.has(modulo));
    }
  });
}

// ================== AÇÕES EM MASSA ==================

function toggleExpandirTodos() {
  const cont = document.getElementById("modulosLista");
  const btn = document.getElementById("btnExpandirTodos");
  if (!cont) return;

  const cards = Array.from(cont.querySelectorAll(".modulo-card"));
  const todosAbertos = cards.length > 0 && cards.every((c) => c.classList.contains("is-open"));
  const abrir = !todosAbertos;

  cards.forEach((card) => {
    card.classList.toggle("is-open", abrir);
    const modulo = card.dataset.modulo;
    if (abrir) modulosAbertos.add(modulo);
    else modulosAbertos.delete(modulo);
  });

  if (btn) btn.textContent = abrir ? "Recolher tudo" : "Expandir tudo";
}

function marcarTodos(marcar) {
  if (!permissoesAtuais.length) return;
  permissoesAtuais.forEach((p) => {
    p.nivelAcesso = marcar ? "W" : "N";
  });

  const cont = document.getElementById("modulosLista");
  if (cont) {
    cont.querySelectorAll(".switch-tela").forEach((sw) => {
      sw.checked = marcar;
    });
    cont.querySelectorAll(".switch-modulo").forEach((sw) => {
      atualizarModuloSwitch(sw.dataset.moduloKey);
    });
  }
  atualizarStats();
  toastRegras(marcar ? "Todas as telas marcadas." : "Todas as telas desmarcadas.");
}

// ================== SALVAR ==================

async function salvarPermissoes() {
  if (!usuarioSelecionadoId) {
    toastRegras("Selecione um usuário antes de salvar.", "error");
    return;
  }

  const permissoes = permissoesAtuais.map((p) => ({
    telaId: p.idTela,
    nivelAcesso: p.nivelAcesso === "N" ? "N" : "W",
  }));

  setLoadingRegras(true);
  try {
    await apiPutRegras(
      `/usuarios/${usuarioSelecionadoId}/telas-permissoes`,
      { permissoes }
    );
    toastRegras("Permissões salvas com sucesso.", "success");
    await carregarPermissoes();
  } catch (e) {
    console.error("[REGRAS][salvarPermissoes] Erro:", e);
    toastRegras("Erro ao salvar permissões. Veja o console.", "error");
  } finally {
    setLoadingRegras(false);
  }
}

// ================== UTILS ==================

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}