// assets/js/estoque.js

// ================== CONFIG / ESTADO ==================

if (!window.API_BASE) {
  window.API_BASE =
    "https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1";
}

// "Lin@agro01" ofuscado
const PRECO_SENHA = (() => {
  const p1 = "Li";
  const p2 = "n@";
  const p3 = "ag";
  const p4 = "ro";
  const p5 = "01";
  return p1 + p2 + p3 + p4 + p5;
})();

let precoSenhaValidada = false;

let estoqueBruto = [];
let itensFiltrados = [];

// Filtro de estoque: "todos" | "com" | "sem"
let filtroEstoque = "todos";

// Guarda os valores calculados (pra alternar entre mascarado/revelado)
let valoresCalc = {
  valorEstoque: 0,
  valorDisponivel: 0,
};
let valoresMascarados = true;

const loaderOverlay = document.getElementById("loaderOverlay");
let loaderTimerId = null;

// Mostra o loader somente se a operação durar mais que 50 ms
function setLoadingEstoque(isLoading) {
  if (!loaderOverlay) return;

  if (isLoading) {
    if (loaderTimerId !== null) {
      clearTimeout(loaderTimerId);
    }
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

function getUsuarioObrigatorio() {
  const user =
    typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;

  if (!user || !user.email) {
    window.location.href = "/index.html";
    return null;
  }
  return user;
}

function getAuthHeadersEstoque() {
  const user = getUsuarioObrigatorio();
  if (!user) {
    return { "Content-Type": "application/json" };
  }

  let headers;

  if (typeof getAuthHeadersCalendario === "function") {
    headers = getAuthHeadersCalendario();
  } else {
    headers = {
      "Content-Type": "application/json",
    };

    try {
      const token =
        (window.sessionStorage && sessionStorage.getItem("authToken")) || null;
      if (token) {
        headers["Authorization"] = "Bearer " + token;
      }
    } catch (e) {
      console.warn("[ESTOQUE] Erro ao ler authToken:", e);
    }
  }

  headers["x-usuario-email"] = user.email;
  return headers;
}

async function apiGetLocal(path) {
  const base = window.API_BASE;
  if (!base) {
    throw new Error("API base não configurada");
  }

  const url = base + path;
  const headers = getAuthHeadersEstoque();

  let resp;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers,
    });
  } catch (err) {
    console.error("[ESTOQUE][apiGetLocal] Erro de rede/fetch:", err);
    throw new Error("Falha na comunicação com o servidor de estoque");
  }

  if (!resp.ok) {
    let bodyText = "";
    try {
      bodyText = await resp.text();
    } catch (err) {
      console.warn("[ESTOQUE][apiGetLocal] Erro ao ler corpo da resposta:", err);
    }

    console.error(
      "[ESTOQUE][apiGetLocal] Resposta não OK:",
      "status=",
      resp.status,
      "body=",
      bodyText
    );

    throw new Error("HTTP " + resp.status + " ao chamar " + path);
  }

  let json;
  try {
    json = await resp.json();
  } catch (err) {
    console.error("[ESTOQUE][apiGetLocal] Erro ao parsear JSON:", err);
    throw new Error("Erro ao interpretar resposta de estoque");
  }

  return json;
}

// ================== BOOTSTRAP ==================

window.addEventListener("DOMContentLoaded", () => {
  const user = getUsuarioObrigatorio();
  if (!user) return;

  const nomeEl = document.getElementById("estoqueUserNome");
  const emailEl = document.getElementById("estoqueUserEmail");
  if (nomeEl) nomeEl.textContent = user.nome || "Usuário VISYA";
  if (emailEl) emailEl.textContent = user.email || "";

  const btnBuscar = document.getElementById("btnBuscar");
  const btnLimpar = document.getElementById("btnLimpar");

  if (btnBuscar) btnBuscar.addEventListener("click", carregarEstoque);
  if (btnLimpar) btnLimpar.addEventListener("click", limparFiltros);

  document
    .getElementById("fEmpresaNome")
    ?.addEventListener("input", aplicarFiltroLocal);
  document
    .getElementById("fGrupoNome")
    ?.addEventListener("input", aplicarFiltroLocal);
  document
    .getElementById("fProdNome")
    ?.addEventListener("input", aplicarFiltroLocal);
  document
    .getElementById("fGrupoCod")
    ?.addEventListener("input", aplicarFiltroLocal);
  document
    .getElementById("fProdCod")
    ?.addEventListener("input", aplicarFiltroLocal);

  // Botões toggle de filtro de estoque
  document.querySelectorAll(".toggle-estoque-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      filtroEstoque = btn.dataset.filtro || "todos";
      document.querySelectorAll(".toggle-estoque-btn").forEach((b) => {
        b.classList.toggle("is-active", b === btn);
      });
      aplicarFiltroLocal();
    });
  });

  // Botão de olho dos cards de valor
  const btnVerValores = document.getElementById("btnVerValores");
  if (btnVerValores) btnVerValores.addEventListener("click", onClickVerValores);

  initPrecoModal();
  window.addEventListener("resize", ajustarAlturaTabela);

  carregarEstoque();
});

function limparFiltros() {
  const empresaNome = document.getElementById("fEmpresaNome");
  const grupoCod = document.getElementById("fGrupoCod");
  const grupoNome = document.getElementById("fGrupoNome");
  const prodCod = document.getElementById("fProdCod");
  const prodNome = document.getElementById("fProdNome");

  if (empresaNome) empresaNome.value = "";
  if (grupoCod) grupoCod.value = "";
  if (grupoNome) grupoNome.value = "";
  if (prodCod) prodCod.value = "";
  if (prodNome) prodNome.value = "";

  // Reseta o toggle pra "todos"
  filtroEstoque = "todos";
  document.querySelectorAll(".toggle-estoque-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.filtro === "todos");
  });

  carregarEstoque();
}

// ================== CARGA DO ESTOQUE ==================

async function carregarEstoque() {
  const tbody = document.getElementById("tbodyEstoque");
  const cardEstoqueTotal = document.getElementById("cardEstoqueTotal");
  const cardReservadoTotal = document.getElementById("cardReservadoTotal");
  const cardDisponivelTotal = document.getElementById("cardDisponivelTotal");
  const cardQtdeGrupos = document.getElementById("cardQtdeGrupos");
  const infoRegistros = document.getElementById("infoRegistros");

  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="10" class="estoque-empty">
        Carregando dados de estoque...
      </td>
    </tr>
  `;
  if (infoRegistros) infoRegistros.textContent = "Carregando...";

  const grupoCodRaw =
    document.getElementById("fGrupoCod")?.value.trim() || "";
  const grupoCod = grupoCodRaw ? grupoCodRaw : "";
  const grupoNomeFiltro =
    document.getElementById("fGrupoNome")?.value.trim() || "";
  const codprodRaw =
    document.getElementById("fProdCod")?.value.trim() || "";
  const codprod = codprodRaw ? parseInt(codprodRaw, 10) : null;

  const params = new URLSearchParams();
  if (grupoCod) params.set("grupo", grupoCod);
  else if (grupoNomeFiltro) params.set("grupo", grupoNomeFiltro);
  if (codprod && !Number.isNaN(codprod)) params.set("codprod", String(codprod));

  const path = "/estoque" + (params.toString() ? "?" + params.toString() : "");

  setLoadingEstoque(true);

  try {
    const data = await apiGetLocal(path);

    estoqueBruto = data && Array.isArray(data.estoque) ? data.estoque : [];

    if (estoqueBruto.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10" class="estoque-empty">
            Nenhum registro encontrado para os filtros atuais.
          </td>
        </tr>
      `;
      if (cardEstoqueTotal) cardEstoqueTotal.textContent = "0,00";
      if (cardReservadoTotal) cardReservadoTotal.textContent = "0,00";
      if (cardDisponivelTotal) cardDisponivelTotal.textContent = "0,00";
      if (cardQtdeGrupos) cardQtdeGrupos.textContent = "0";
      valoresCalc = { valorEstoque: 0, valorDisponivel: 0 };
      atualizarCardsValor();
      if (infoRegistros)
        infoRegistros.textContent = "Mostrando 0 de 0 registros";
      return;
    }

    aplicarFiltroLocal();
  } catch (e) {
    console.error("[ESTOQUE][carregarEstoque] Erro ao carregar estoque:", e);

    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="estoque-empty">
          Erro ao carregar dados de estoque. Tente novamente mais tarde.
        </td>
      </tr>
    `;
    if (cardEstoqueTotal) cardEstoqueTotal.textContent = "—";
    if (cardReservadoTotal) cardReservadoTotal.textContent = "—";
    if (cardDisponivelTotal) cardDisponivelTotal.textContent = "—";
    if (cardQtdeGrupos) cardQtdeGrupos.textContent = "—";
    valoresCalc = { valorEstoque: 0, valorDisponivel: 0 };
    atualizarCardsValor();
    if (infoRegistros) {
      infoRegistros.textContent =
        "Erro ao carregar (detalhes no console do navegador)";
    }
  } finally {
    setLoadingEstoque(false);
  }
}

function aplicarFiltroLocal() {
  const tbody = document.getElementById("tbodyEstoque");
  const cardEstoqueTotal = document.getElementById("cardEstoqueTotal");
  const cardReservadoTotal = document.getElementById("cardReservadoTotal");
  const cardDisponivelTotal = document.getElementById("cardDisponivelTotal");
  const cardQtdeGrupos = document.getElementById("cardQtdeGrupos");
  const infoRegistros = document.getElementById("infoRegistros");

  if (!tbody) return;

  const nomeEmpresaFiltro =
    (document.getElementById("fEmpresaNome")?.value || "").toLowerCase();
  const nomeProdFiltro =
    (document.getElementById("fProdNome")?.value || "").toLowerCase();
  const nomeGrupoFiltro =
    (document.getElementById("fGrupoNome")?.value || "").toLowerCase();
  const grupoCodFiltroRaw =
    (document.getElementById("fGrupoCod")?.value || "").trim();
  const prodCodFiltroRaw =
    (document.getElementById("fProdCod")?.value || "").trim();

  const grupoCodFiltro = grupoCodFiltroRaw || null;
  const prodCodFiltro = prodCodFiltroRaw || null;

  let itens = estoqueBruto.slice();

  if (nomeEmpresaFiltro) {
    itens = itens.filter((r) => {
      const nomeEmpBruto = String(
        r.NomeEmpresa ?? r.nomeEmpresa ?? ""
      );
      const base = nomeEmpBruto.split("-")[0].trim();
      return base.toLowerCase().includes(nomeEmpresaFiltro);
    });
  }

  if (nomeGrupoFiltro) {
    itens = itens.filter((r) => {
      const grp = String(
        r.NomeGrupoProduto ?? r.nomeGrupoProduto ?? ""
      ).toLowerCase();
      return grp.includes(nomeGrupoFiltro);
    });
  }

  if (grupoCodFiltro) {
    itens = itens.filter((r) => {
      const codGrupo = String(
        r.CODGRUPOPROD ?? r.codgrupoprod ?? ""
      ).trim();
      return codGrupo === grupoCodFiltro;
    });
  }

  if (nomeProdFiltro) {
    itens = itens.filter((r) => {
      const nome = String(
        r.NomeProduto ?? r.nomeProduto ?? ""
      ).toLowerCase();
      return nome.includes(nomeProdFiltro);
    });
  }

  if (prodCodFiltro) {
    itens = itens.filter((r) => {
      const cod = String(r.CODPROD ?? r.codprod ?? "").trim();
      return cod === prodCodFiltro;
    });
  }

  // Filtro de estoque (toggle): com / sem estoque
  if (filtroEstoque === "com") {
    itens = itens.filter((r) => {
      const estoque = Number(r.ESTOQUE ?? r.estoque ?? 0);
      return estoque > 0;
    });
  } else if (filtroEstoque === "sem") {
    itens = itens.filter((r) => {
      const estoque = Number(r.ESTOQUE ?? r.estoque ?? 0);
      return estoque <= 0;
    });
  }

  itensFiltrados = itens;

  if (!itensFiltrados.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="estoque-empty">
          Nenhum registro após aplicar os filtros.
        </td>
      </tr>
    `;
    if (cardEstoqueTotal) cardEstoqueTotal.textContent = "0,00";
    if (cardReservadoTotal) cardReservadoTotal.textContent = "0,00";
    if (cardDisponivelTotal) cardDisponivelTotal.textContent = "0,00";
    if (cardQtdeGrupos) cardQtdeGrupos.textContent = "0";
    valoresCalc = { valorEstoque: 0, valorDisponivel: 0 };
    atualizarCardsValor();
    if (infoRegistros)
      infoRegistros.textContent = "Mostrando 0 de 0 registros";
    return;
  }

  let html = "";
  let totalEstoque = 0;
  let totalReservado = 0;
  let totalValorEstoque = 0;
  let totalValorDisponivel = 0;
  const gruposSet = new Set();

  // Primeiro passo: totais (incluindo valores)
  for (const r of itensFiltrados) {
    const estoque = Number(r.ESTOQUE ?? r.estoque ?? 0);
    const reservado = Number(r.RESERVADO ?? r.reservado ?? 0);
    const disponivel = Number(
      r.EstoqueDisponivel ?? r.estoquedisponivel ?? estoque - reservado
    );
    const preco = Number(r.PrecoVenda ?? r.precoVenda ?? 0);

    totalEstoque += estoque;
    totalReservado += reservado;
    totalValorEstoque += estoque * preco;
    totalValorDisponivel += disponivel * preco;

    const grupoNomeFull = r.NomeGrupoProduto ?? r.nomeGrupoProduto ?? "";
    if (grupoNomeFull) gruposSet.add(grupoNomeFull);
  }

  // Segundo passo: linhas da tabela
  for (const r of itensFiltrados) {
    const estoque = Number(r.ESTOQUE ?? r.estoque ?? 0);
    const reservado = Number(r.RESERVADO ?? r.reservado ?? 0);
    const disponivel = Number(
      r.EstoqueDisponivel ??
        r.estoquedisponivel ??
        estoque - reservado
    );

    const grupoNome = r.NomeGrupoProduto ?? r.nomeGrupoProduto ?? "";

    const nomeEmpresaBruto = r.NomeEmpresa ?? r.nomeEmpresa ?? "";
    let nomeEmpresaBase = nomeEmpresaBruto.split("-")[0].trim();
    nomeEmpresaBase = nomeEmpresaBase
      .replace(/\s+FILIAL\s+\d+$/i, "")
      .trim();
    const nomeEmpresa = nomeEmpresaBase;

    const codProd = r.CODPROD ?? r.codprod ?? "";
    const nomeProdutoBruto = r.NomeProduto ?? r.nomeProduto ?? "";
    let nomeProdutoLimpo = nomeProdutoBruto.substring(0, 26);
    if (nomeProdutoBruto.length > 26) {
      nomeProdutoLimpo = nomeProdutoLimpo.trimEnd() + "…";
    }

    const estoqueNum = Number(estoque);
    const reservadoNum = Number(reservado);
    const disponivelNum = Number(disponivel);

    const statusClass = getStatusClass(estoqueNum, reservadoNum);
    const statusLabel = getStatusLabel(estoqueNum, reservadoNum);

    const precoVenda = Number(r.PrecoVenda ?? r.precoVenda ?? 0);
    const precoFormatado = precoVenda
      ? precoVenda.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "***,**";

    html += `
      <tr data-codprod="${escapeHtml(String(codProd))}">
        <td>${escapeHtml(r.CODEMP ?? r.codemp ?? "")}</td>
        <td><span class="badge-empresa">${escapeHtml(
          nomeEmpresa
        )}</span></td>
        <td>${escapeHtml(grupoNome)}</td>
        <td title="${escapeHtml(
          codProd + " - " + nomeProdutoBruto
        )}">
          ${escapeHtml(codProd + " - " + nomeProdutoLimpo)}
        </td>
        <td class="num">${formatNumber(estoqueNum)}</td>
        <td class="num">${formatNumber(reservadoNum)}</td>
        <td class="num">${formatNumber(disponivelNum)}</td>
        <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
        <td class="num preco-cell"
            data-preco-loaded="${precoVenda ? "true" : "false"}"
            data-preco-real="${precoVenda ? precoFormatado : ""}"
            data-preco-mascarado="true">
          ***,**
        </td>
        <td class="preco-eye-cell">
          <button
            type="button"
            class="btn-preco-eye"
            title="Ver preço (senha necessária)"
          >
            👁
          </button>
        </td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
  ajustarAlturaTabela();

  tbody.querySelectorAll(".btn-preco-eye").forEach((btn) => {
    btn.addEventListener("click", onClickVerPreco);
  });

  const totalDisponivel = totalEstoque - totalReservado;

  if (cardEstoqueTotal) cardEstoqueTotal.textContent = formatNumber(totalEstoque);
  if (cardReservadoTotal)
    cardReservadoTotal.textContent = formatNumber(totalReservado);
  if (cardDisponivelTotal)
    cardDisponivelTotal.textContent = formatNumber(totalDisponivel);
  if (cardQtdeGrupos) cardQtdeGrupos.textContent = String(gruposSet.size);

  // Guarda os valores calculados e atualiza os cards de valor (respeitando máscara)
  valoresCalc = {
    valorEstoque: totalValorEstoque,
    valorDisponivel: totalValorDisponivel,
  };
  atualizarCardsValor();

  if (infoRegistros) {
    infoRegistros.textContent =
      "Total filtrado: " + itensFiltrados.length + " registros";
  }
}

// ================== CARDS DE VALOR (OCULTOS) ==================

function formatMoeda(v) {
  const n = Number(v || 0);
  return (
    "R$ " +
    n.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function atualizarCardsValor() {
  const cardValorEstoque = document.getElementById("cardValorEstoque");
  const cardValorDisponivel = document.getElementById("cardValorDisponivel");
  const btnVerValores = document.getElementById("btnVerValores");

  // Se a senha já foi validada e o usuário pediu pra revelar, mostra
  const revelar = precoSenhaValidada && !valoresMascarados;

  if (cardValorEstoque) {
    cardValorEstoque.textContent = revelar
      ? formatMoeda(valoresCalc.valorEstoque)
      : "R$ ***";
  }
  if (cardValorDisponivel) {
    cardValorDisponivel.textContent = revelar
      ? formatMoeda(valoresCalc.valorDisponivel)
      : "R$ ***";
  }
  if (btnVerValores) {
    btnVerValores.textContent = revelar ? "🙈" : "👁";
    btnVerValores.title = revelar
      ? "Ocultar valores"
      : "Ver valores (senha necessária)";
  }
}

function onClickVerValores() {
  // Se ainda não validou a senha, abre o modal
  if (!precoSenhaValidada) {
    abrirPrecoModal(() => {
      // callback após validar senha: revela
      valoresMascarados = false;
      atualizarCardsValor();
    });
    return;
  }

  // Já validou: só alterna
  valoresMascarados = !valoresMascarados;
  atualizarCardsValor();
}

// ================== VISUAL / UTILS ==================

function ajustarAlturaTabela() {
  // usa o flex da wrapper, não precisa de cálculo manual
}

function formatNumber(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getStatusClass(estoque, reservado) {
  const disp = estoque - reservado;
  if (estoque <= 0) return "status-critico";
  if (disp <= 0) return "status-alerta";
  return "status-ok";
}

function getStatusLabel(estoque, reservado) {
  const disp = estoque - reservado;
  if (estoque <= 0) return "Sem estoque";
  if (disp <= 0) return "Sem disponível";
  return "OK";
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ================== MODAL SENHA / PREÇO ==================

let precoModalCallback = null;

function initPrecoModal() {
  const modal = document.getElementById("precoSenhaModal");
  const input = document.getElementById("precoSenhaInput");
  const btnCancelar = document.getElementById("precoSenhaCancelar");
  const btnConfirmar = document.getElementById("precoSenhaConfirmar");
  const erroEl = document.getElementById("precoSenhaErro");

  if (!modal || !input || !btnCancelar || !btnConfirmar || !erroEl) {
    console.warn("[PRECO] Elementos do modal de senha não encontrados.");
    return;
  }

  btnCancelar.addEventListener("click", () => {
    modal.style.display = "none";
    input.value = "";
    erroEl.textContent = "";
    precoModalCallback = null;
  });

  btnConfirmar.addEventListener("click", () => {
    const senha = input.value;
    if (senha === PRECO_SENHA) {
      precoSenhaValidada = true;
      modal.style.display = "none";
      input.value = "";
      erroEl.textContent = "";
      // Executa callback se houver (ex: revelar valores)
      if (typeof precoModalCallback === "function") {
        const cb = precoModalCallback;
        precoModalCallback = null;
        cb();
      }
    } else {
      erroEl.textContent = "Senha inválida.";
      precoSenhaValidada = false;
    }
  });

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      btnConfirmar.click();
    } else if (ev.key === "Escape") {
      btnCancelar.click();
    }
  });
}

function abrirPrecoModal(callback) {
  const modal = document.getElementById("precoSenhaModal");
  const input = document.getElementById("precoSenhaInput");
  const erroEl = document.getElementById("precoSenhaErro");
  if (!modal || !input || !erroEl) return;
  precoModalCallback = typeof callback === "function" ? callback : null;
  erroEl.textContent = "";
  input.value = "";
  modal.style.display = "flex";
  input.focus();
}

function onClickVerPreco(event) {
  const btn = event.currentTarget;
  const tr = btn.closest("tr");
  if (!tr) return;

  const precoCell = tr.querySelector(".preco-cell");
  if (!precoCell) return;

  const jaCarregado =
    precoCell.getAttribute("data-preco-loaded") === "true";
  const mascarado =
    precoCell.getAttribute("data-preco-mascarado") === "true";

  if (!precoSenhaValidada) {
    abrirPrecoModal();
    return;
  }

  if (jaCarregado) {
    if (mascarado) {
      const real = precoCell.getAttribute("data-preco-real") || "***,**";
      precoCell.textContent = real;
      precoCell.setAttribute("data-preco-mascarado", "false");
      btn.textContent = "🙈";
    } else {
      precoCell.textContent = "***,**";
      precoCell.setAttribute("data-preco-mascarado", "true");
      btn.textContent = "👁";
    }
  } else {
    precoCell.textContent = "—";
    precoCell.setAttribute("data-preco-loaded", "true");
    precoCell.setAttribute("data-preco-mascarado", "false");
  }
}