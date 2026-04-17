// assets/js/rh_relatorio_treinamento.js

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

function getIdFromQueryString() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  return id ? parseInt(id, 10) : null;
}

let linhaCount = 0;
let modoEdicao = false;
let idCabecalhoAtual = null;

// ================== BOOTSTRAP ==================

window.addEventListener("DOMContentLoaded", () => {
  const user = getUsuario();
  if (!user) return;

  const nomeEl = document.getElementById("rhUserNome");
  const emailEl = document.getElementById("rhUserEmail");
  if (nomeEl) nomeEl.textContent = user.nome || "Usuário VISYA";
  if (emailEl) emailEl.textContent = user.email || "";

  document
    .getElementById("btnAdicionarLinha")
    ?.addEventListener("click", () => adicionarLinha());
  document.getElementById("btnSalvar")?.addEventListener("click", salvarRelatorio);
  document
    .getElementById("btnLimparForm")
    ?.addEventListener("click", limparForm);

  const idEdicao = getIdFromQueryString();
  if (idEdicao) {
    carregarTreinamento(idEdicao);
  } else {
    // inclusão
    adicionarLinha();
  }
});

// ================== CARREGAR TREINAMENTO (EDIÇÃO) ==================

async function carregarTreinamento(id) {
  const erroEl = document.getElementById("formErro");
  erroEl.textContent = "";
  setLoading(true);
  try {
    const resp = await fetch(`${window.API_BASE}/rh/treinamentos/${id}`, {
      headers: getHeaders(),
    });
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();

    modoEdicao = true;
    idCabecalhoAtual = data.cabecalho.Id;

    const titulo = document.querySelector(".rh-titulo");
    const subtitulo = document.querySelector(".rh-subtitulo");
    const btnSalvar = document.getElementById("btnSalvar");
    const btnLimpar = document.getElementById("btnLimparForm");

    if (titulo) titulo.textContent = "Editar Treinamento";
    if (subtitulo)
      subtitulo.textContent = "Editando registros de treinamento.";
    if (btnSalvar) btnSalvar.innerHTML = "<span>✔</span> Salvar Alterações";
    if (btnLimpar) btnLimpar.style.display = "none";

    const cab = data.cabecalho || {};

    document.getElementById("nomeProfissional").value =
      cab.NomeProfissional || "";
    document.getElementById("setor").value = cab.Setor || "";
    document.getElementById("responsavelSetor").value =
      cab.ResponsavelSetor || "";
    document.getElementById("dataInicioPeriodo").value = (cab.DataInicioPeriodo || "").substring(0, 10);
    document.getElementById("dataFimPeriodo").value = (cab.DataFimPeriodo || "").substring(0, 10);

    const statusSel = document.getElementById("statusTreinamento");
    if (statusSel) statusSel.value = String(cab.Status || 1);

    const tbody = document.getElementById("tbodyAtividades");
    tbody.innerHTML = "";
    linhaCount = 0;

    (data.atividades || []).forEach((a) => {
      adicionarLinha({
        id: a.Id,
        dataAtividade: (a.DataAtividade || "").substring(0, 10),
        atividade: a.Atividade,
        recebi: a.RecebiTreinamento,
        dominio: a.TenhoDominio,
        observacoes: a.Observacoes,
      });
    });
  } catch (e) {
    console.error("[RH RELATORIO][carregarTreinamento]", e);
    erroEl.textContent = "Erro ao carregar dados para edição.";
  } finally {
    setLoading(false);
  }
}

// ================== LINHAS DINÂMICAS ==================

function criarLinhaAtividade(dados = {}) {
  linhaCount++;
  const id = linhaCount;
  const tr = document.createElement("tr");
  tr.dataset.linhaId = id;
  if (dados.id) tr.dataset.idDetalhe = dados.id;

  tr.innerHTML = `
    <td><input type="date" id="dataAtividade_${id}" value="${escapeHtml(
      dados.dataAtividade || ""
    )}" /></td>
    <td><input type="text" id="atividade_${id}" value="${escapeHtml(
      dados.atividade || ""
    )}" placeholder="Descreva a atividade" /></td>
    <td>
      <select id="recebi_${id}">
        <option value="S" ${dados.recebi === "S" ? "selected" : ""}>Sim</option>
        <option value="N" ${dados.recebi !== "S" ? "selected" : ""}>Não</option>
      </select>
    </td>
    <td>
      <select id="dominio_${id}">
        <option value="S" ${dados.dominio === "S" ? "selected" : ""}>Sim</option>
        <option value="N" ${dados.dominio !== "S" ? "selected" : ""}>Não</option>
      </select>
    </td>
    <td><input type="text" id="obs_${id}" value="${escapeHtml(
      dados.observacoes || ""
    )}" placeholder="Opcional" /></td>
    <td style="text-align:center;">
      <button type="button" class="btn-remover-linha" style="
        background:transparent;border:1px solid #ef4444;color:#fecaca;
        border-radius:4px;padding:2px 6px;cursor:pointer;font-size:10px;font-family:inherit;
      ">✕</button>
    </td>
  `;

  tr
    .querySelector(".btn-remover-linha")
    .addEventListener("click", () => tr.remove());
  return tr;
}

function adicionarLinha(dados = {}) {
  const tbody = document.getElementById("tbodyAtividades");
  if (!tbody) return;
  tbody.appendChild(criarLinhaAtividade(dados));
}

// ================== LIMPAR (MODO INCLUSÃO) ==================

function limparForm() {
  modoEdicao = false;
  idCabecalhoAtual = null;
  document.getElementById("nomeProfissional").value = "";
  document.getElementById("setor").value = "";
  document.getElementById("responsavelSetor").value = "";
  document.getElementById("dataInicioPeriodo").value = "";
  document.getElementById("dataFimPeriodo").value = "";
  const statusSel = document.getElementById("statusTreinamento");
  if (statusSel) statusSel.value = "1";
  document.getElementById("formErro").textContent = "";
  document.getElementById("tbodyAtividades").innerHTML = "";
  linhaCount = 0;

  const titulo = document.querySelector(".rh-titulo");
  const subtitulo = document.querySelector(".rh-subtitulo");
  const btnSalvar = document.getElementById("btnSalvar");
  const btnLimpar = document.getElementById("btnLimparForm");
  if (titulo) titulo.textContent = "Relatório de Treinamento";
  if (subtitulo)
    subtitulo.textContent =
      "Inserção de novo formulário de treinamento por profissional.";
  if (btnSalvar) btnSalvar.innerHTML = "<span>✔</span> Salvar Treinamentos";
  if (btnLimpar) btnLimpar.style.display = "";

  adicionarLinha();
}

// ================== SALVAR (POST / PUT) ==================

async function salvarRelatorio() {
  const erroEl = document.getElementById("formErro");
  erroEl.textContent = "";

  const nomeProfissional =
    document.getElementById("nomeProfissional").value.trim();
  const setor = document.getElementById("setor").value.trim();
  const responsavelSetor =
    document.getElementById("responsavelSetor").value.trim() || null;
  const dataInicioPeriodo =
    document.getElementById("dataInicioPeriodo").value || null;
  const dataFimPeriodo =
    document.getElementById("dataFimPeriodo").value || null;
  const statusSel = document.getElementById("statusTreinamento");
  const status = statusSel ? parseInt(statusSel.value, 10) || 1 : 1;

  if (!nomeProfissional) {
    erroEl.textContent = "Profissional é obrigatório.";
    return;
  }
  if (!setor) {
    erroEl.textContent = "Setor é obrigatório.";
    return;
  }

  const linhas = document.querySelectorAll(
    "#tbodyAtividades tr[data-linha-id]"
  );
  const atividades = [];

  for (const tr of linhas) {
    const lid = tr.dataset.linhaId;
    const idDetalhe = tr.dataset.idDetalhe
      ? Number(tr.dataset.idDetalhe)
      : null;
    const dataAtiv =
      document.getElementById(`dataAtividade_${lid}`)?.value || "";
    const atividade =
      document.getElementById(`atividade_${lid}`)?.value.trim() || "";
    const recebi =
      document.getElementById(`recebi_${lid}`)?.value || "N";
    const dominio =
      document.getElementById(`dominio_${lid}`)?.value || "N";
    const obs =
      document.getElementById(`obs_${lid}`)?.value.trim() || null;

    if (!dataAtiv && !atividade) continue;

    if (!dataAtiv) {
      erroEl.textContent = `Linha ${lid}: data da atividade é obrigatória.`;
      return;
    }
    if (!atividade) {
      erroEl.textContent = `Linha ${lid}: descrição da atividade é obrigatória.`;
      return;
    }

    atividades.push({
      id: idDetalhe, // null para novas
      dataAtividade: dataAtiv,
      atividade,
      recebiTreinamento: recebi,
      tenhoDominio: dominio,
      observacoes: obs,
      _acao: idDetalhe ? "manter" : "novo",
    });
  }

  if (!atividades.length) {
    erroEl.textContent = "Informe ao menos uma atividade válida.";
    return;
  }

  const payload = {
    nomeProfissional,
    setor,
    responsavelSetor,
    dataInicioPeriodo,
    dataFimPeriodo,
    status,
    atividades,
  };

  setLoading(true);
  try {
    if (modoEdicao && idCabecalhoAtual) {
      const resp = await fetch(
        `${window.API_BASE}/rh/treinamentos/${idCabecalhoAtual}`,
        {
          method: "PUT",
          headers: getHeaders(),
          body: JSON.stringify(payload),
        }
      );
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      alert("Treinamento atualizado com sucesso!");
      const frame = window.parent?.document?.querySelector(".app-main-frame");
      if (frame) {
        frame.src = "rh_listagem_treinamentos.html";
      } else {
        window.location.href = "rh_listagem_treinamentos.html";
      }
    } else {
      const resp = await fetch(`${window.API_BASE}/rh/treinamentos`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      alert(`${atividades.length} atividade(s) salva(s) com sucesso!`);
      limparForm();
    }
  } catch (e) {
    console.error("[RH RELATORIO][salvarRelatorio]", e);
    erroEl.textContent = "Erro ao salvar: " + e.message;
  } finally {
    setLoading(false);
  }
}