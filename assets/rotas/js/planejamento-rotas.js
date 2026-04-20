// assets/rotas/js/planejamento-rotas.js

(function () {
  console.log("[ROTAS-IA] planejamento-rotas.js carregado");

  if (typeof getPontosNaOrdemPainel !== "function") {
    console.warn(
      "[ROTAS-IA] getPontosNaOrdemPainel não encontrado; verifique a ordem de scripts."
    );
    return;
  }
  if (typeof apiFetch !== "function") {
    console.warn(
      "[ROTAS-IA] apiFetch não encontrado; não será possível chamar IA."
    );
  }

  var overlayEl = null;
  var listaRotasEl = null;
  var resumoEl = null;
  var rotaSelecionada = null;
  var carregandoIA = false;
  var caminhõesIA = [];

  window.__ROTAS_IA_LINK_MAPS__ = null;

  function criarOverlayIA() {
    if (overlayEl) return overlayEl;

    overlayEl = document.createElement("div");
    overlayEl.className = "rotas-ia-overlay";
    overlayEl.innerHTML = `
      <div class="rotas-ia-panel">
        <div class="rotas-ia-header">
          <div class="rotas-ia-title">Planejamento com IA</div>
          <button type="button" class="rota-header-btn" id="rotasIaFecharBtn">×</button>
        </div>
        <div class="rotas-ia-body">
          <div id="rotasIaResumoSelecionados" class="rotas-ia-resumo">
            Preparando dados para IA...
          </div>
          <div class="rotas-ia-lista-rotas" id="rotasIaListaRotas"></div>
        </div>
        <div class="rotas-ia-footer">
          <button type="button" class="uni-btn uni-btn-ghost uni-btn-sm" id="rotasIaCancelar">
            Cancelar
          </button>
          <button type="button" class="uni-btn uni-btn-secondary uni-btn-sm" id="rotasIaMaps">
            Abrir no Google Maps
          </button>
          <button type="button" class="uni-btn uni-btn-primary uni-btn-sm" id="rotasIaConfirmar">
            Aplicar sugestão da IA e ver carga 3D
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlayEl);

    var btnFechar   = overlayEl.querySelector("#rotasIaFecharBtn");
    var btnCancelar = overlayEl.querySelector("#rotasIaCancelar");
    var btnConfirmar = overlayEl.querySelector("#rotasIaConfirmar");
    var btnMaps     = overlayEl.querySelector("#rotasIaMaps");
    listaRotasEl    = overlayEl.querySelector("#rotasIaListaRotas");
    resumoEl        = overlayEl.querySelector("#rotasIaResumoSelecionados");

    btnFechar.addEventListener("click",   function () { fecharOverlay(); });
    btnCancelar.addEventListener("click", function () { fecharOverlay(); });
    btnConfirmar.addEventListener("click", onConfirmarRota);

    btnMaps.addEventListener("click", function () {
      if (window.__ROTAS_IA_LINK_MAPS__) {
        window.open(window.__ROTAS_IA_LINK_MAPS__, "_blank");
      } else {
        alert("Nenhum link do Google Maps disponível para esta sugestão. Confirme a rota ou tente novamente.");
      }
    });

    return overlayEl;
  }

  function setResumo(texto) {
    if (!resumoEl) return;
    resumoEl.textContent = texto;
  }

  function setCarregandoIA(flag) {
    carregandoIA = flag;
    if (!resumoEl) return;
    if (flag) resumoEl.textContent = "Chamando IA para sugerir rotas...";
  }

  async function montarPayloadIA() {
    var pontosPainel = getPontosNaOrdemPainel();
    if (!pontosPainel || !pontosPainel.length) return null;

    var base = [];
    if (typeof getCacheAtual === "function") {
      try { base = getCacheAtual() || []; } catch (e) {
        console.warn("[ROTAS-IA] getCacheAtual falhou:", e);
      }
    }

    var pedidos = [];
    var clientesSemPedido = [];

    pontosPainel.forEach(function (p) {
      var match = base.find(function (b) {
        return (
          String(b.id)     === String(p.id) ||
          String(b.codigo) === String(p.id) ||
          String(b.nunota) === String(p.id) ||
          String(b.NUNOTA) === String(p.id)
        );
      });

      var lat      = p.lat;
      var lng      = p.lng;
      var endereco = (match && match.endereco) || (lat.toFixed(5) + ", " + lng.toFixed(5));
      var pontoBase = match || {};
      var nunota   = pontoBase.nunota || pontoBase.NUNOTA || pontoBase.codigo || String(p.id);

      var itemBase = {
        nunota:      String(nunota),
        clienteId:   pontoBase.codparc      || pontoBase.clienteId  || "",
        clienteNome: pontoBase.nome         || pontoBase.nomecliente || "",
        endereco:    endereco,
        lat:         lat,
        lng:         lng,
        pesoKg:      pontoBase.pesoTotalKg  || pontoBase.pesoKg     || 0,
        volumeM3:    pontoBase.volumeTotalM3 || pontoBase.volumeM3   || 0
      };

      if (pontoBase.origemTipo === "pedido") {
        pedidos.push(itemBase);
      } else {
        clientesSemPedido.push(itemBase);
      }
    });

    var pontos = pedidos.concat(clientesSemPedido);

    var caminhoes = [];
    try {
      if (typeof apiFetch === "function") {
        var resp = await apiFetch("/caminhoes?ativo=true");
        if (resp.ok) {
          var data = await resp.json();
          caminhoes = (data || []).map(function (c) {
            return {
              id:                c.idCaminhao,
              placa:             c.placa,
              descricao:         c.descricao || c.placa,
              tipo:              c.tipo,
              capacidadePesoKg:  c.capacidadeKg   || 0,
              comprimentoM:      c.comprimentoM   || null,
              larguraM:          c.larguraM       || null,
              alturaM:           c.alturaM        || null,
              capacidadeVolumeM3: (c.comprimentoM && c.larguraM && c.alturaM)
                ? (c.comprimentoM * c.larguraM * c.alturaM)
                : null
            };
          });
        } else {
          console.warn("[ROTAS-IA] /caminhoes retornou HTTP", resp.status);
        }
      }
    } catch (e) {
      console.warn("[ROTAS-IA] Erro ao buscar caminhões reais:", e);
    }

    if (!caminhoes.length) {
      caminhoes = [
        {
          id: "M710", descricao: "Truck 3/4 Baú",
          capacidadePesoKg: 7000, capacidadeVolumeM3: 28,
          comprimentoM: 6, larguraM: 2.4, alturaM: 2.4
        },
        {
          id: "FH460", descricao: "FH 460 Carreta",
          capacidadePesoKg: 15000, capacidadeVolumeM3: 60,
          comprimentoM: 12, larguraM: 2.6, alturaM: 2.7
        }
      ];
    }

    caminhõesIA = caminhoes;

    var payload = {
      pontos:   pontos,
      caminhoes: caminhoes,
      config:   { numeroMaximoRotas: 2, priorizarMenorDistancia: true }
    };

    console.log("[ROTAS-IA] Payload enviado para /ia/planejar-rotas:", payload);
    return payload;
  }

  async function chamarIAPlanejarRotas() {
    if (carregandoIA) return;
    var payload = await montarPayloadIA();
    if (!payload || !payload.pontos.length) {
      setResumo("Nenhum ponto selecionado para planejar.");
      renderRotas([]);
      return;
    }

    if (typeof apiFetch !== "function") {
      console.warn("[ROTAS-IA] apiFetch indisponível, usando mock.");
      aplicarPlanoMock(payload);
      return;
    }

    setCarregandoIA(true);
    window.__ROTAS_IA_LINK_MAPS__ = null;

    var TIMEOUT_MS = 15000;
    var timeoutId;

    try {
      var controller = new AbortController();
      timeoutId = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

      var resp = await apiFetch("/ia/planejar-rotas", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
        signal:  controller.signal
      });

      clearTimeout(timeoutId);

      if (!resp.ok) {
        console.warn("[ROTAS-IA] /ia/planejar-rotas retornou HTTP", resp.status);
        setResumo("IA demorou ou falhou na resposta. Usando plano padrão com ordem atual.");
        aplicarPlanoMock(payload);
        return;
      }

      var data  = await resp.json();
      var rotas = Array.isArray(data.rotas) ? data.rotas : [];

      if (!rotas.length) {
        setResumo("IA respondeu, mas não sugeriu rotas. Usando ordem atual como fallback.");
        aplicarPlanoMock(payload);
        return;
      }

      window.__ROTAS_IA_LINK_MAPS__ = data.linkGoogleMaps || null;
      setResumo("IA sugeriu " + rotas.length + " rota(s). Você pode aplicar a sugestão ou continuar ajustando manualmente.");
      renderRotas(rotas);

    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === "AbortError") {
        console.warn("[ROTAS-IA] Timeout. Caindo para mock.");
        setResumo("IA demorou mais que o limite configurado. Usando plano padrão com ordem atual.");
      } else {
        console.error("[ROTAS-IA] Erro ao chamar /ia/planejar-rotas:", e);
        setResumo("Erro ao chamar IA. Usando plano padrão com ordem atual.");
      }
      aplicarPlanoMock(payload);
    } finally {
      setCarregandoIA(false);
    }
  }

  function aplicarPlanoMock(payload) {
    if (!payload || !payload.pontos || !payload.pontos.length) {
      setResumo("Nenhum ponto selecionado para planejar.");
      renderRotas([]);
      return;
    }
    setResumo("Usando rota mock com a ordem atual (IA indisponível ou sem sugestão). Você ainda pode ajustar manualmente.");

    var rotaMock = {
      id:         "rota-1",
      caminhaoId: "M710",
      pesoTotalKg: payload.pontos.reduce(function (acc, p) { return acc + (p.pesoKg || 0); }, 0),
      volumeTotalM3: payload.pontos.reduce(function (acc, p) { return acc + (p.volumeM3 || 0); }, 0),
      ordemNunota: payload.pontos.map(function (p) { return p.nunota || p.clienteId || ""; }),
      comentarios: "Rota mock baseada na ordem atual da tela."
    };

    renderRotas([rotaMock]);
  }

  function renderRotas(rotas) {
    listaRotasEl.innerHTML = "";
    rotaSelecionada = null;

    if (!rotas || !rotas.length) {
      var empty = document.createElement("div");
      empty.className = "rotas-ia-empty";
      empty.textContent = "Nenhuma rota sugerida. Ajuste a seleção de pontos ou tente novamente.";
      listaRotasEl.appendChild(empty);
      return;
    }

    rotas.forEach(function (rota, idx) {
      var card  = document.createElement("div");
      card.className  = "rotas-ia-rota-card";
      card.dataset.id = rota.id;

      var peso  = Number(rota.pesoTotalKg  || 0);
      var vol   = Number(rota.volumeTotalM3 || 0);
      var qtde  = Array.isArray(rota.ordemNunota) ? rota.ordemNunota.length : 0;

      card.innerHTML = `
        <div class="rotas-ia-rota-titulo">
          Rota ${idx + 1} – ${rota.caminhaoId || "Caminhão ?"}
        </div>
        <div class="rotas-ia-rota-meta">
          ${qtde} pedidos •
          Peso: ${peso.toFixed(1)} kg •
          Volume: ${vol.toFixed(1)} m³
        </div>
        ${rota.comentarios ? `<div class="rotas-ia-rota-meta">${rota.comentarios}</div>` : ""}
      `;

      card.addEventListener("click", function () {
        listaRotasEl.querySelectorAll(".rotas-ia-rota-card").forEach(function (el) {
          el.classList.remove("selecionada");
        });
        card.classList.add("selecionada");
        rotaSelecionada = rota;
      });

      if (idx === 0) {
        card.classList.add("selecionada");
        rotaSelecionada = rota;
      }

      listaRotasEl.appendChild(card);
    });
  }

  function aplicarOrdemDaIA(ordemNunota) {
    if (!Array.isArray(ordemNunota) || !ordemNunota.length) return;

    if (typeof getCacheAtual !== "function") {
      console.warn("[ROTAS-IA] getCacheAtual indisponível.");
      return;
    }

    var base         = getCacheAtual() || [];
    var pontosAtuais = getPontosNaOrdemPainel();
    var pontosPorNunota = new Map();
    var pontosOutros = [];

    pontosAtuais.forEach(function (p) {
      var match = base.find(function (b) {
        var nun = b.nunota || b.NUNOTA;
        return nun && String(nun) === String(p.id);
      });
      var nunotaChave = match ? String(match.nunota || match.NUNOTA) : null;
      if (nunotaChave) {
        pontosPorNunota.set(nunotaChave, p);
      } else {
        pontosOutros.push(p);
      }
    });

    var novaOrdem = [];
    ordemNunota.forEach(function (nunota) {
      var ponto = pontosPorNunota.get(String(nunota));
      if (ponto) { novaOrdem.push(ponto); pontosPorNunota.delete(String(nunota)); }
    });
    pontosPorNunota.forEach(function (p) { novaOrdem.push(p); });
    pontosOutros.forEach(function (p)    { novaOrdem.push(p); });

    var rotaListaDiv = document.getElementById("rotaListaPontos");
    if (!rotaListaDiv) { console.warn("[ROTAS-IA] rotaListaPontos não encontrado."); return; }

    rotaListaDiv.innerHTML = "";

    novaOrdem.forEach(function (ponto, idx) {
      var li = document.createElement("li");
      li.className = "rota-item";
      li.setAttribute("draggable", "true");
      li.dataset.tipo = ponto.tipo;
      li.dataset.id   = ponto.id;

      var handle = document.createElement("div");
      handle.className = "rota-item-handle";
      handle.innerHTML = "⋮⋮";

      var num = document.createElement("div");
      num.className   = "rota-item-num";
      num.textContent = String(idx + 1);

      var labelWrap = document.createElement("div");
      labelWrap.className = "rota-item-label";

      var main = document.createElement("div");
      main.className   = "rota-item-label-main";
      main.textContent = ponto.tipo === "cliente" ? ponto.label : "Manual: " + ponto.label;

      var sub = document.createElement("div");
      sub.className   = "rota-item-label-sub";
      sub.textContent = ponto.endereco + " (" + ponto.lat.toFixed(5) + ", " + ponto.lng.toFixed(5) + ")";

      labelWrap.appendChild(main);
      labelWrap.appendChild(sub);

      var remover = document.createElement("button");
      remover.className = "rota-item-remove";
      remover.type      = "button";
      remover.innerHTML = "&times;";
      remover.title     = "Remover ponto";
      remover.addEventListener("click", function (e) {
        e.stopPropagation();
        if (typeof removerPontoDaRota === "function") removerPontoDaRota(ponto);
      });

      li.appendChild(handle);
      li.appendChild(num);
      li.appendChild(labelWrap);
      li.appendChild(remover);
      rotaListaDiv.appendChild(li);
    });

    if (typeof configurarDragAndDropPainelRota === "function") {
      configurarDragAndDropPainelRota();
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // EMPACOTADOR 3D
  // Regras:
  //   • Montagem começa do FUNDO do baú (X = bauComprimento) → frente (X = 0)
  //   • Itens encostados uns nos outros (sem gap)
  //   • Itens assentados no chão (Y = 0)
  //   • Preenche a largura (Z) antes de avançar no comprimento (X)
  //   • Se não couber na largura atual, começa nova coluna Z (mesmo X)
  //   • Se não couber na altura da coluna, avança X (próxima fileira)
  //   • Itens maiores que o baú são escalados para caber
  // ─────────────────────────────────────────────────────────────────
  function empacotar(itens, bauComprimento, bauLargura, bauAltura) {
    // Cada célula do grid de empacotamento:
    // cursorX = posição X da borda traseira da fileira atual (começa no fundo)
    // cursorZ = posição Z da borda lateral do próximo item na fileira
    // cursorY = posição Y do próximo item na coluna Z atual
    // profFileira = maior profundidade (X) dos itens já colocados na fileira
    // alturaColunaZ = altura acumulada na coluna Z atual

    var resultado        = [];
    var cursorX          = bauComprimento; // fundo do baú
    var cursorZ          = 0;
    var cursorY          = 0;
    var profFileira      = 0;
    var alturaColunaZ    = 0;

    itens.forEach(function (item) {
      var p = Math.min(item.profundidadeM, bauComprimento);
      var l = Math.min(item.larguraM,      bauLargura);
      var a = Math.min(item.alturaM,       bauAltura);

      // Tenta encaixar na coluna Z atual (mesmo X, mesmo Y empilhado)
      if (cursorY + a <= bauAltura && cursorZ + l <= bauLargura) {
        // Cabe na coluna Z atual (empilha em Y)
        resultado.push({
          id:            item.id,
          x:             cursorX - p,
          y:             cursorY,
          z:             cursorZ,
          profundidadeM: p,
          larguraM:      l,
          alturaM:       a
        });
        cursorY       += a;
        profFileira    = Math.max(profFileira, p);
        alturaColunaZ  = Math.max(alturaColunaZ, cursorY);

      } else if (cursorZ + l <= bauLargura) {
        // Não cabe em Y mas cabe em Z → nova coluna Z (reseta Y)
        cursorZ       += l;  // avança na largura — mas na verdade o item atual começa aqui
        // recalcula: cursorZ foi o fim do item anterior; agora colocamos o novo item no início desta Z
        // correto: a coluna Z é definida pelo cursor anterior
        cursorY        = 0;
        resultado.push({
          id:            item.id,
          x:             cursorX - p,
          y:             cursorY,
          z:             cursorZ - l, // posição Z deste item
          profundidadeM: p,
          larguraM:      l,
          alturaM:       a
        });
        cursorY       += a;
        profFileira    = Math.max(profFileira, p);

      } else {
        // Não cabe em Z → nova fileira (avança X para trás)
        cursorX       -= profFileira;
        cursorZ        = 0;
        cursorY        = 0;
        profFileira    = p;
        alturaColunaZ  = 0;

        // Se não couber nem no X restante, descarta (não deve acontecer em uso real)
        if (cursorX - p < 0) {
          console.warn("[PACK] Item não coube no baú, ignorado:", item.id);
          return;
        }

        resultado.push({
          id:            item.id,
          x:             cursorX - p,
          y:             cursorY,
          z:             cursorZ,
          profundidadeM: p,
          larguraM:      l,
          alturaM:       a
        });
        cursorY       += a;
        cursorZ       += l;
      }
    });

    return resultado;
  }

  function montarCargaRealParaViewer(rota) {
    var ordem = Array.isArray(rota.ordemNunota) ? rota.ordemNunota : [];
    var base  = typeof getCacheAtual === "function" ? getCacheAtual() || [] : [];
    var mapaPorNunota = new Map();

    base.forEach(function (b) {
      var nun = b.nunota || b.NUNOTA || b.codigo;
      if (nun != null) mapaPorNunota.set(String(nun), b);
    });

    // Dimensões do caminhão
    var caminhaoId   = rota.caminhaoId;
    var caminhaoDesc = rota.caminhaoDescricao || "";
    var caminhaoReal = null;

    if (caminhõesIA && caminhõesIA.length) {
      caminhaoReal = caminhõesIA.find(function (c) {
        return String(c.id) === String(caminhaoId);
      }) || null;
    }

    var bauComprimento = 6;
    var bauLargura     = 2.4;
    var bauAltura      = 2.4;

    if (caminhaoReal) {
      bauComprimento = caminhaoReal.comprimentoM || bauComprimento;
      bauLargura     = caminhaoReal.larguraM     || bauLargura;
      bauAltura      = caminhaoReal.alturaM      || bauAltura;
      caminhaoDesc   = caminhaoDesc || caminhaoReal.descricao;
    } else {
      if (!caminhaoId) caminhaoId = "M710";
      if (caminhaoId === "FH460") {
        bauComprimento = 12; bauLargura = 2.6; bauAltura = 2.7;
        caminhaoDesc   = caminhaoDesc || "FH 460 Carreta";
      } else {
        caminhaoDesc = caminhaoDesc || "Truck 3/4 Baú";
      }
    }

    // Monta lista de itens com dimensões resolvidas
    var cores = [0x22c55e, 0x3b82f6, 0xf97316, 0xa855f7, 0xec4899, 0x14b8a6, 0xf59e0b, 0x6366f1];
    var itens = [];

    ordem.forEach(function (nunota, idx) {
      var chave = String(nunota);
      var b     = mapaPorNunota.get(chave) || {};

      var larguraM      = b.larguraM      || b.largura      || null;
      var alturaM       = b.alturaM       || b.altura       || null;
      var profundidadeM = b.profundidadeM || b.profundidade || b.comprimentoM || null;
      var volumeM3      = b.volumeTotalM3 || b.volumeM3     || 0.001;

      if (!larguraM || !alturaM || !profundidadeM) {
        var lado      = Math.cbrt(volumeM3);
        larguraM      = larguraM      || lado;
        alturaM       = alturaM       || lado;
        profundidadeM = profundidadeM || lado;
      }

      larguraM      = Math.max(Number(larguraM),      0.05);
      alturaM       = Math.max(Number(alturaM),       0.05);
      profundidadeM = Math.max(Number(profundidadeM), 0.05);
      volumeM3      = b.volumeTotalM3 || b.volumeM3 || (profundidadeM * larguraM * alturaM);

      itens.push({
        id:            "V" + (idx + 1),
        nunota:        b.nunota || b.NUNOTA || nunota,
        pedido:        b.nunota || b.NUNOTA || b.codigo || nunota,
        codprod:       b.codprod   || b.CODPROD   || "",
        descrprod:     b.descrprod || b.DESCRPROD || b.nomeprod || "",
        larguraM:      larguraM,
        alturaM:       alturaM,
        profundidadeM: profundidadeM,
        pesoKg:        b.pesoTotalKg || b.pesoKg || 0,
        volumeM3:      volumeM3,
        cor:           cores[idx % cores.length]
      });
    });

    // Aplica empacotador
    var posicoes   = empacotar(itens, bauComprimento, bauLargura, bauAltura);
    var posMap     = new Map(posicoes.map(function (p) { return [p.id, p]; }));

    var volumes = itens.map(function (item) {
      var pos = posMap.get(item.id) || { x: 0, y: 0, z: 0, profundidadeM: item.profundidadeM, larguraM: item.larguraM, alturaM: item.alturaM };
      return {
        id:            item.id,
        pedido:        item.pedido,
        nunota:        item.nunota,
        codprod:       item.codprod,
        descrprod:     item.descrprod,
        larguraM:      pos.larguraM,
        alturaM:       pos.alturaM,
        profundidadeM: pos.profundidadeM,
        x:             pos.x,
        y:             pos.y,
        z:             pos.z,
        cor:           item.cor,
        pesoKg:        item.pesoKg,
        volumeM3:      item.volumeM3
      };
    });

    return {
      caminhao: {
        id:            caminhaoId,
        descricao:     caminhaoDesc,
        comprimentoM:  bauComprimento,
        larguraM:      bauLargura,
        alturaM:       bauAltura
      },
      volumes: volumes
    };
  }

  function onConfirmarRota() {
    if (!rotaSelecionada) {
      alert("Selecione uma rota para aplicar a sugestão da IA.");
      return;
    }

    console.log("[ROTAS-IA] Rota confirmada:", rotaSelecionada);

    if (Array.isArray(rotaSelecionada.ordemNunota) && rotaSelecionada.ordemNunota.length) {
      try {
        aplicarOrdemDaIA(rotaSelecionada.ordemNunota);
      } catch (e) {
        console.error("[ROTAS-IA] Erro ao aplicar ordem da IA:", e);
        alert("Não foi possível aplicar a ordem sugerida pela IA. Mantendo ordem atual.");
      }
    }

    if (typeof gerarRotaAuto === "function") gerarRotaAuto();

    try {
      var carga = montarCargaRealParaViewer(rotaSelecionada);

      window.__VISYA_CARGA_ATUAL__ = carga;

      try {
        sessionStorage.setItem("__VISYA_CARGA_ATUAL__", JSON.stringify(carga));
      } catch (e) {
        console.warn("[ROTAS-IA] Não foi possível salvar no sessionStorage:", e);
      }

      window.open("../rotas/html/viewer3d.html", "_blank");
    } catch (e) {
      console.error("[ROTAS-IA] Erro ao abrir viewer 3D:", e);
    }

    fecharOverlay();
  }

  function abrirOverlayIA() {
    var overlay = criarOverlayIA();
    overlay.classList.add("show");
    chamarIAPlanejarRotas();
  }

  function fecharOverlay() {
    if (!overlayEl) return;
    overlayEl.classList.remove("show");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var btnPlanejarIA = document.getElementById("btnPlanejarIA");
    if (!btnPlanejarIA) {
      console.warn("[ROTAS-IA] btnPlanejarIA não encontrado no DOM.");
      return;
    }
    btnPlanejarIA.addEventListener("click", function () { abrirOverlayIA(); });
  });
})();