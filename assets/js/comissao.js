/* ====================================================================
   VISYA — Relatório de Comissão
   Consome a API:
     GET /comissoes/empresas      -> filtro empresa
     GET /comissoes/vendedores    -> filtro vendedor
     GET /comissoes/resumo        -> visão "resumo por vendedor" + cards
     GET /comissoes               -> visão "detalhado" (paginado)
   ==================================================================== */

let visaoAtual = "resumo"; // "resumo" | "detalhado"
let dadosAtuais = []; // linhas atualmente exibidas
let sortState = { coluna: null, dir: 1 };

// ============ HELPERS ============

function fmtMoeda(v) {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtNumero(v) {
  return (Number(v) || 0).toLocaleString("pt-BR");
}

// valida competência MM/AAAA; devolve a string limpa ou null
function competenciaValida(valor) {
  if (!valor) return null;
  const m = String(valor).trim().match(/^(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const mes = parseInt(m[1], 10);
  if (mes < 1 || mes > 12) return null;
  return m[1].padStart(2, "0") + "/" + m[2];
}

function mostrarToast(msg, erro) {
  const t = document.getElementById("toastComissao");
  if (!t) return;
  t.textContent = msg;
  t.classList.toggle("is-erro", !!erro);
  t.classList.add("is-visible");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("is-visible"), 3200);
}

function setLoading(on) {
  const ov = document.getElementById("loaderOverlay");
  if (ov) ov.setAttribute("aria-hidden", on ? "false" : "true");
}

// monta a query string com os filtros atuais
function getFiltrosQS() {
  const params = new URLSearchParams();

  const empresa = document.getElementById("fEmpresaCom")?.value || "";
  const vendedor = document.getElementById("fVendedorCom")?.value || "";
  const compIni = competenciaValida(document.getElementById("fCompInicioCom")?.value);
  const compFim = competenciaValida(document.getElementById("fCompFimCom")?.value);

  // empresa pode ser grupo (LINHAGRO/LITHOPLANT/OUTRA) ou CodEmp numérico.
  // O select guarda o valor como "grupo:LINHAGRO" ou "emp:30".
  if (empresa.startsWith("grupo:")) {
    params.set("grupoEmpresa", empresa.slice(6));
  } else if (empresa.startsWith("emp:")) {
    params.set("codEmp", empresa.slice(4));
  }

  if (vendedor) params.set("codVendUnif", vendedor);
  if (compIni) params.set("compInicio", compIni);
  if (compFim) params.set("compFim", compFim);

  return params;
}

// aplica máscara MM/AAAA enquanto digita: "012024" -> "01/2024"
function aplicarMascaraCompetencia(input) {
  let v = input.value.replace(/\D/g, ""); // só dígitos
  if (v.length > 6) v = v.slice(0, 6);
  if (v.length >= 3) {
    v = v.slice(0, 2) + "/" + v.slice(2);
  }
  input.value = v;
}

// ============ CARREGAR FILTROS (empresas e vendedores) ============

async function carregarOpcoesFiltro() {
  try {
    const [empResp, vendResp] = await Promise.all([
      apiGet("/comissoes/empresas"),
      apiGet("/comissoes/vendedores"),
    ]);

    // empresas: agrupa por GrupoEmpresaCalc + lista CodEmp individuais
    const selEmp = document.getElementById("fEmpresaCom");
    if (selEmp && empResp && Array.isArray(empResp.empresas)) {
      const grupos = new Set();
      empResp.empresas.forEach((e) => {
        if (e.GrupoEmpresaCalc) grupos.add(e.GrupoEmpresaCalc);
      });

      // opções por grupo
      grupos.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = "grupo:" + g;
        opt.textContent = "Grupo: " + g;
        selEmp.appendChild(opt);
      });

      // opções por empresa individual
      empResp.empresas
        .slice()
        .sort((a, b) => (a.CodEmp || 0) - (b.CodEmp || 0))
        .forEach((e) => {
          const opt = document.createElement("option");
          opt.value = "emp:" + e.CodEmp;
          opt.textContent = `Empresa ${e.CodEmp} (${e.GrupoEmpresaCalc || "—"})`;
          selEmp.appendChild(opt);
        });
    }

    // vendedores
    const selVend = document.getElementById("fVendedorCom");
    if (selVend && vendResp && Array.isArray(vendResp.vendedores)) {
      vendResp.vendedores
        .slice()
        .sort((a, b) => (a.Vendedor || "").localeCompare(b.Vendedor || ""))
        .forEach((v) => {
          const opt = document.createElement("option");
          opt.value = v.CodVendEfetivo;
          opt.textContent = `${v.Vendedor || "—"} (${v.CodVendEfetivo})`;
          selVend.appendChild(opt);
        });
    }
  } catch (e) {
    console.error("Erro ao carregar opções de filtro:", e);
    mostrarToast("Erro ao carregar filtros de empresa/vendedor.", true);
  }
}

// ============ VISÃO RESUMO (por vendedor) ============

async function carregarResumo() {
  setLoading(true);
  try {
    const params = getFiltrosQS();
    params.set("agruparPor", "vendedor");
    const data = await apiGet("/comissoes/resumo?" + params.toString());

    const linhas = Array.isArray(data.resumo) ? data.resumo : [];
    dadosAtuais = linhas;

    atualizarCards(linhas, data.totalGeral);
    renderTabelaResumo(linhas);

    document.getElementById("comissaoTableInfo").textContent =
      `${linhas.length} vendedor(es) • total ${fmtMoeda(data.totalGeral)}`;
  } catch (e) {
    console.error("Erro ao carregar resumo:", e);
    mostrarToast("Erro ao carregar o resumo de comissões.", true);
    renderVazio("Erro ao carregar dados.");
  } finally {
    setLoading(false);
  }
}

function atualizarCards(linhas, totalGeral) {
  const total = Number(totalGeral) || 0;
  const elTotal = document.getElementById("kpiTotal");
  elTotal.textContent = fmtMoeda(total);
  elTotal.classList.toggle("is-negativo", total < 0);

  document.getElementById("kpiVendedores").textContent = fmtNumero(linhas.length);

  const totalReg = linhas.reduce((acc, l) => acc + (Number(l.QtdeRegistros) || 0), 0);
  document.getElementById("kpiRegistros").textContent = fmtNumero(totalReg);

  // maior comissão
  let maior = null;
  linhas.forEach((l) => {
    if (maior === null || (Number(l.TotalComissao) || 0) > (Number(maior.TotalComissao) || 0)) {
      maior = l;
    }
  });
  if (maior) {
    document.getElementById("kpiMaior").textContent = fmtMoeda(maior.TotalComissao);
    document.getElementById("kpiMaiorSub").textContent = maior.Vendedor || "—";
  } else {
    document.getElementById("kpiMaior").textContent = fmtMoeda(0);
    document.getElementById("kpiMaiorSub").textContent = "—";
  }
}

function renderTabelaResumo(linhas) {
  const thead = document.getElementById("comissaoThead");
  const tbody = document.getElementById("comissaoTbody");

  thead.innerHTML = `
    <tr>
      <th data-key="CodVendEfetivo">Cód.</th>
      <th data-key="Vendedor">Vendedor</th>
      <th data-key="QtdeRegistros" class="num">Registros</th>
      <th data-key="TotalComissao" class="num">Total comissão</th>
    </tr>`;

  if (!linhas.length) {
    renderVazio("Nenhuma comissão encontrada para os filtros.");
    aplicarSortHandlers();
    return;
  }

  tbody.innerHTML = linhas
    .map((l, i) => {
      const val = Number(l.TotalComissao) || 0;
      return `
      <tr class="clicavel" data-idx="${i}" title="Ver detalhamento de ${l.Vendedor || ""}">
        <td>${l.CodVendEfetivo ?? "—"}</td>
        <td>${l.Vendedor || "—"}</td>
        <td class="num">${fmtNumero(l.QtdeRegistros)}</td>
        <td class="num ${val < 0 ? "valor-negativo" : ""}">${fmtMoeda(val)}</td>
      </tr>`;
    })
    .join("");

  // clique na linha abre o modal de detalhes do vendedor
  tbody.querySelectorAll("tr.clicavel").forEach((tr) => {
    tr.addEventListener("click", () => {
      const idx = parseInt(tr.dataset.idx, 10);
      const item = linhas[idx];
      if (item) abrirModalVendedor(item);
    });
  });

  aplicarSortHandlers();
}

// ============ VISÃO DETALHADA (linhas da tabela) ============

async function carregarDetalhado() {
  setLoading(true);
  try {
    const params = getFiltrosQS();
    params.set("page", "1");
    params.set("pageSize", "1000");
    const data = await apiGet("/comissoes?" + params.toString());

    const linhas = Array.isArray(data.comissoes) ? data.comissoes : [];
    dadosAtuais = linhas;

    // cards no detalhado: usa o total das linhas carregadas
    const totalGeral = linhas.reduce((a, l) => a + (Number(l.TotalComissao) || 0), 0);
    const vendUnicos = new Set(linhas.map((l) => l.CodVendEfetivo)).size;
    document.getElementById("kpiTotal").textContent = fmtMoeda(totalGeral);
    document.getElementById("kpiTotal").classList.toggle("is-negativo", totalGeral < 0);
    document.getElementById("kpiVendedores").textContent = fmtNumero(vendUnicos);
    document.getElementById("kpiRegistros").textContent =
      fmtNumero(data.pagination?.totalCount ?? linhas.length);
    let maior = null;
    linhas.forEach((l) => {
      if (maior === null || (Number(l.TotalComissao) || 0) > (Number(maior.TotalComissao) || 0)) maior = l;
    });
    document.getElementById("kpiMaior").textContent = maior ? fmtMoeda(maior.TotalComissao) : fmtMoeda(0);
    document.getElementById("kpiMaiorSub").textContent = maior ? (maior.Vendedor || "—") : "—";

    renderTabelaDetalhado(linhas);

    const totalCount = data.pagination?.totalCount ?? linhas.length;
    document.getElementById("comissaoTableInfo").textContent =
      `${linhas.length} de ${fmtNumero(totalCount)} registro(s)` +
      (totalCount > linhas.length ? " (mostrando os primeiros 1000)" : "");
  } catch (e) {
    console.error("Erro ao carregar detalhado:", e);
    mostrarToast("Erro ao carregar o detalhamento.", true);
    renderVazio("Erro ao carregar dados.");
  } finally {
    setLoading(false);
  }
}

function nomeGrupoClasse(grupo) {
  const g = (grupo || "").toUpperCase();
  if (g === "LITHOPLANT") return "lithoplant";
  if (g === "OUTRA") return "outra";
  return "";
}

function renderTabelaDetalhado(linhas) {
  const thead = document.getElementById("comissaoThead");
  const tbody = document.getElementById("comissaoTbody");

  thead.innerHTML = `
    <tr>
      <th data-key="Competencia">Competência</th>
      <th data-key="GrupoEmpresaCalc">Empresa</th>
      <th data-key="CodEmp" class="num">Cód. Emp.</th>
      <th data-key="CodVendEfetivo" class="num">Cód. Vend.</th>
      <th data-key="Vendedor">Vendedor</th>
      <th data-key="TotalComissao" class="num">Comissão</th>
    </tr>`;

  if (!linhas.length) {
    renderVazio("Nenhuma comissão encontrada para os filtros.");
    aplicarSortHandlers();
    return;
  }

  tbody.innerHTML = linhas
    .map((l) => {
      const val = Number(l.TotalComissao) || 0;
      const comp = l.Competencia ||
        (l.Mes && l.Ano ? String(l.Mes).padStart(2, "0") + "/" + l.Ano : "—");
      const cls = nomeGrupoClasse(l.GrupoEmpresaCalc);
      return `
      <tr>
        <td>${comp}</td>
        <td><span class="empresa-pill ${cls}">${l.GrupoEmpresaCalc || "—"}</span></td>
        <td class="num">${l.CodEmp ?? "—"}</td>
        <td class="num">${l.CodVendEfetivo ?? l.CodVend ?? "—"}</td>
        <td>${l.Vendedor || "—"}</td>
        <td class="num ${val < 0 ? "valor-negativo" : ""}">${fmtMoeda(val)}</td>
      </tr>`;
    })
    .join("");

  aplicarSortHandlers();
}

function renderVazio(msg) {
  document.getElementById("comissaoTbody").innerHTML =
    `<tr><td colspan="6"><div class="empty-state">${msg}</div></td></tr>`;
}

// ============ ORDENAÇÃO (clicando no cabeçalho) ============

function aplicarSortHandlers() {
  document.querySelectorAll("#comissaoThead th[data-key]").forEach((th) => {
    th.onclick = () => {
      const key = th.dataset.key;
      if (sortState.coluna === key) {
        sortState.dir *= -1;
      } else {
        sortState.coluna = key;
        sortState.dir = 1;
      }
      ordenarEReexibir();
      // marca visual
      document.querySelectorAll("#comissaoThead th").forEach((h) => {
        h.classList.remove("sorted-asc", "sorted-desc");
      });
      th.classList.add(sortState.dir === 1 ? "sorted-asc" : "sorted-desc");
    };
  });
}

function ordenarEReexibir() {
  const { coluna, dir } = sortState;
  if (!coluna) return;

  dadosAtuais.sort((a, b) => {
    let va = a[coluna];
    let vb = b[coluna];
    // numérico?
    const na = Number(va);
    const nb = Number(vb);
    if (!Number.isNaN(na) && !Number.isNaN(nb) && va !== "" && vb !== "") {
      return (na - nb) * dir;
    }
    return String(va ?? "").localeCompare(String(vb ?? "")) * dir;
  });

  if (visaoAtual === "resumo") renderTabelaResumo(dadosAtuais);
  else renderTabelaDetalhado(dadosAtuais);
}

// ============ EXPORTAR EXCEL ============

function exportarExcel() {
  if (!dadosAtuais.length) {
    mostrarToast("Nada para exportar.", true);
    return;
  }

  let cabecalho, linhas;
  if (visaoAtual === "resumo") {
    cabecalho = ["Cod Vendedor", "Vendedor", "Registros", "Total Comissao"];
    linhas = dadosAtuais.map((l) => [
      l.CodVendEfetivo ?? "",
      l.Vendedor || "",
      l.QtdeRegistros ?? 0,
      (Number(l.TotalComissao) || 0).toFixed(4),
    ]);
  } else {
    cabecalho = ["Competencia", "Grupo Empresa", "Cod Emp", "Cod Vendedor", "Vendedor", "Comissao"];
    linhas = dadosAtuais.map((l) => [
      l.Competencia || (l.Mes && l.Ano ? String(l.Mes).padStart(2, "0") + "/" + l.Ano : ""),
      l.GrupoEmpresaCalc || "",
      l.CodEmp ?? "",
      l.CodVendEfetivo ?? l.CodVend ?? "",
      l.Vendedor || "",
      (Number(l.TotalComissao) || 0).toFixed(4),
    ]);
  }

  // CSV (abre no Excel). Usa ; como separador (padrão BR) e BOM p/ acentos.
  const sep = ";";
  const escapa = (c) => {
    const s = String(c ?? "");
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const conteudo =
    "\uFEFF" +
    [cabecalho, ...linhas].map((linha) => linha.map(escapa).join(sep)).join("\n");

  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const hoje = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `comissoes_${visaoAtual}_${hoje}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  mostrarToast("Exportação gerada.");
}

// ============ TROCA DE VISÃO ============

function trocarVisao(novaVisao) {
  if (novaVisao === visaoAtual) return;
  visaoAtual = novaVisao;
  sortState = { coluna: null, dir: 1 };

  document.querySelectorAll("#segVisao button").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.visao === novaVisao);
  });

  if (novaVisao === "resumo") carregarResumo();
  else carregarDetalhado();
}

// ============ APLICAR / LIMPAR FILTROS ============

function aplicarFiltros() {
  if (visaoAtual === "resumo") carregarResumo();
  else carregarDetalhado();
}

function limparFiltros() {
  document.getElementById("fEmpresaCom").value = "";
  document.getElementById("fVendedorCom").value = "";
  document.getElementById("fCompInicioCom").value = "";
  document.getElementById("fCompFimCom").value = "";
  aplicarFiltros();
}

// ============ MODAL DE DETALHES DO VENDEDOR ============

async function abrirModalVendedor(vendedor) {
  const modal = document.getElementById("comModal");
  const titulo = document.getElementById("comModalTitulo");
  const sub = document.getElementById("comModalSub");
  const body = document.getElementById("comModalBody");
  const qtdeEl = document.getElementById("comModalQtde");
  const totalEl = document.getElementById("comModalTotal");

  const codVend = vendedor.CodVendEfetivo;
  titulo.textContent = vendedor.Vendedor || "Vendedor";
  sub.textContent = `Código ${codVend} • ${fmtMoeda(vendedor.TotalComissao)} no período`;
  qtdeEl.textContent = "Carregando...";
  totalEl.textContent = "";
  body.innerHTML = '<div class="com-modal-loading">Carregando registros...</div>';

  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");

  try {
    // busca todos os registros desse vendedor, respeitando os filtros de
    // empresa/competência que estiverem ativos na tela
    const params = getFiltrosQS();
    params.set("codVendUnif", codVend);
    params.set("page", "1");
    params.set("pageSize", "2000");
    const data = await apiGet("/comissoes?" + params.toString());
    const registros = Array.isArray(data.comissoes) ? data.comissoes : [];

    if (!registros.length) {
      body.innerHTML = '<div class="com-modal-loading">Nenhum registro encontrado.</div>';
      qtdeEl.textContent = "0 registro(s)";
      totalEl.textContent = fmtMoeda(0);
      return;
    }

    // ordena por competência (ano/mês) desc
    registros.sort((a, b) => {
      const ka = (a.Ano || 0) * 100 + (a.Mes || 0);
      const kb = (b.Ano || 0) * 100 + (b.Mes || 0);
      return kb - ka;
    });

    const total = registros.reduce((acc, r) => acc + (Number(r.TotalComissao) || 0), 0);

    body.innerHTML = `
      <table class="com-modal-table">
        <thead>
          <tr>
            <th>Competência</th>
            <th>Empresa</th>
            <th class="num">Cód. Emp.</th>
            <th class="num">Comissão</th>
          </tr>
        </thead>
        <tbody>
          ${registros
            .map((r) => {
              const val = Number(r.TotalComissao) || 0;
              const comp =
                r.Competencia ||
                (r.Mes && r.Ano ? String(r.Mes).padStart(2, "0") + "/" + r.Ano : "—");
              const cls = nomeGrupoClasse(r.GrupoEmpresaCalc);
              return `
              <tr>
                <td>${comp}</td>
                <td><span class="empresa-pill ${cls}">${r.GrupoEmpresaCalc || "—"}</span></td>
                <td class="num">${r.CodEmp ?? "—"}</td>
                <td class="num ${val < 0 ? "valor-negativo" : ""}">${fmtMoeda(val)}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>`;

    qtdeEl.textContent = `${registros.length} registro(s)`;
    totalEl.textContent = fmtMoeda(total);
  } catch (e) {
    console.error("Erro ao carregar detalhes do vendedor:", e);
    body.innerHTML = '<div class="com-modal-loading">Erro ao carregar registros.</div>';
    qtdeEl.textContent = "—";
    totalEl.textContent = "";
  }
}

function fecharModalVendedor() {
  const modal = document.getElementById("comModal");
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

// ============ BLOQUEIO POR SENHA ============
// Senha ofuscada em base64 (Lin@agro01). Lembrando: senha no frontend é uma
// tranca leve (evita acesso casual), não segurança real — quem abrir o
// DevTools consegue ver. Para proteção de verdade, o controle teria que ser
// na API.
const COM_SENHA_B64 = "TGluQGFncm8wMQ==";

let comissaoIniciada = false;

function desbloquearComissao() {
  const input = document.getElementById("comLockInput");
  const erro = document.getElementById("comLockErro");
  const lock = document.getElementById("comLock");

  const digitada = (input.value || "").trim();
  let correta = "";
  try {
    correta = atob(COM_SENHA_B64);
  } catch (_) {
    correta = "";
  }

  if (digitada === correta) {
    lock.classList.add("is-unlocked");
    erro.textContent = "";
    iniciarComissao();
  } else {
    erro.textContent = "Senha incorreta.";
    input.classList.add("shake");
    input.value = "";
    setTimeout(() => input.classList.remove("shake"), 450);
    input.focus();
  }
}

// Carrega os dados da tela — só chamado após desbloquear (não bate na API antes)
async function iniciarComissao() {
  if (comissaoIniciada) return;
  comissaoIniciada = true;
  await carregarOpcoesFiltro();
  await carregarResumo();
}

// ============ INIT ============

document.addEventListener("DOMContentLoaded", async () => {
  // dados do usuário no header
  try {
    const u = typeof getUsuarioAtual === "function" ? getUsuarioAtual() : null;
    if (u) {
      document.getElementById("comissaoUserNome").textContent = u.nome || "—";
      document.getElementById("comissaoUserEmail").textContent = u.email || "—";
    }
  } catch (_) {}

  // botões
  document.getElementById("btnAplicarCom")?.addEventListener("click", aplicarFiltros);
  document.getElementById("btnLimparCom")?.addEventListener("click", limparFiltros);
  document.getElementById("btnExportCom")?.addEventListener("click", exportarExcel);

  document.querySelectorAll("#segVisao button").forEach((b) => {
    b.addEventListener("click", () => trocarVisao(b.dataset.visao));
  });

  // Enter nos campos de competência aplica + máscara automática MM/AAAA
  ["fCompInicioCom", "fCompFimCom"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => aplicarMascaraCompetencia(el));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") aplicarFiltros();
    });
  });

  // modal de detalhes: fechar pelo X, pelo backdrop e por ESC
  document.getElementById("comModalClose")?.addEventListener("click", fecharModalVendedor);
  document.getElementById("comModalBackdrop")?.addEventListener("click", fecharModalVendedor);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") fecharModalVendedor();
  });

  // bloqueio por senha: liga os eventos e foca no campo. Os dados só são
  // carregados (carregarOpcoesFiltro/carregarResumo) após desbloquear.
  const lockInput = document.getElementById("comLockInput");
  const lockBtn = document.getElementById("comLockBtn");
  lockBtn?.addEventListener("click", desbloquearComissao);
  lockInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") desbloquearComissao();
  });
  if (lockInput) lockInput.focus();
});