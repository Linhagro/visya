// app.js - APP Visya
const API_BASE = 'https://org-dash-api-e4epa4anfpguandz.canadacentral-01.azurewebsites.net/api/v1';
const POLLING_MS = 30000;

// ===== CONFIG FIREBASE (preencha apos criar projeto) =====
// Esses valores sao PUBLICOS (apareceriam no DevTools de qualquer forma).
// O segredo de verdade fica no service account no backend.
const FIREBASE_CONFIG = {
  apiKey:            window.__FIREBASE_API_KEY__            || "PREENCHA_AQUI",
  authDomain:        window.__FIREBASE_AUTH_DOMAIN__        || "PREENCHA_AQUI",
  projectId:         window.__FIREBASE_PROJECT_ID__         || "PREENCHA_AQUI",
  storageBucket:     window.__FIREBASE_STORAGE_BUCKET__     || "PREENCHA_AQUI",
  messagingSenderId: window.__FIREBASE_SENDER_ID__          || "PREENCHA_AQUI",
  appId:             window.__FIREBASE_APP_ID__             || "PREENCHA_AQUI"
};
const VAPID_KEY = window.__VAPID_KEY__ || "PREENCHA_AQUI";

const estado = {
  token: localStorage.getItem('visya-token') || null,
  usuario: JSON.parse(localStorage.getItem('visya-usuario') || 'null'),
  pedidos: [],
  pedidoAtual: null,
  itensSelecionados: new Set(),
  pollingTimer: null,
  fcmToken: localStorage.getItem('visya-fcm-token') || null
};

// ===== UTIL =====
const $ = id => document.getElementById(id);
const fmtMoeda = n => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};
const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(msg, tipo = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast is-visible ' + (tipo ? `is-${tipo}` : '');
  setTimeout(() => t.classList.remove('is-visible'), 3000);
}

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (estado.token) headers.Authorization = `Bearer ${estado.token}`;
  const resp = await fetch(API_BASE + path, { ...opts, headers });
  if (resp.status === 401) {
    logout();
    throw new Error('Sessao expirada');
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Erro ' + resp.status }));
    throw new Error(err.error || err.detail || 'Erro ' + resp.status);
  }
  return resp.json();
}

// ===== TELAS =====
function mostrarTela(qual) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(`screen-${qual}`).classList.add('active');
}

function mostrarTab(qual) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  $(`tab-${qual}`).classList.add('active');
  document.querySelector(`.nav-btn[data-tab="${qual}"]`).classList.add('active');
  $('appTitulo').textContent = qual === 'aprovacao' ? 'Pedidos pendentes' : 'Relatorios';
}

// ===== LOGIN =====
async function fazerLogin(email, senha) {
  const resp = await fetch(API_BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha })
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.error || err.message || 'Falha no login');
  }
  const data = await resp.json();
  estado.token = data.token;
  estado.usuario = data.usuario;
  localStorage.setItem('visya-token', data.token);
  localStorage.setItem('visya-usuario', JSON.stringify(data.usuario));
}

function logout() {
  estado.token = null;
  estado.usuario = null;
  localStorage.removeItem('visya-token');
  localStorage.removeItem('visya-usuario');
  pararPolling();
  mostrarTela('login');
}

// ===== APROVACAO =====
async function carregarPendentes() {
  try {
    const r = await api('/app/aprovacao/pendentes?pageSize=50');
    estado.pedidos = r.pedidos || [];
    renderPedidos();
    atualizarBadge();
  } catch (e) {
    if (e.message !== 'Sessao expirada') toast('Erro ao carregar: ' + e.message, 'error');
  }
}

function renderPedidos() {
  const el = $('listaPedidos');
  if (!estado.pedidos.length) {
    el.innerHTML = '<div class="empty-state">Nenhum pedido pendente. 🎉</div>';
    return;
  }
  el.innerHTML = estado.pedidos.map(p => `
    <div class="pedido-card" data-id="${escapeHtml(p.id)}">
      <div class="pedido-card-top">
        <span class="pedido-id">#${escapeHtml(p.id)}</span>
        <span class="pedido-valor">${fmtMoeda(p.valorTotalNota || p.valorTotalProdutos)}</span>
      </div>
      <div class="pedido-cliente">${escapeHtml(p.cliente)}</div>
      <div class="pedido-info">
        <span>${escapeHtml(p.vendedor || '—')}</span>
        <span>${fmtData(p.dataLancamento)}</span>
      </div>
    </div>
  `).join('');
  el.querySelectorAll('.pedido-card').forEach(card => {
    card.addEventListener('click', () => abrirDetalhe(card.dataset.id));
  });
}

function atualizarBadge() {
  const b = $('badgePendentes');
  if (estado.pedidos.length > 0) {
    b.textContent = estado.pedidos.length;
    b.style.display = 'flex';
  } else {
    b.style.display = 'none';
  }
}

async function abrirDetalhe(pedidoId) {
  $('modalPedidoId').textContent = pedidoId;
  $('modalCorpo').innerHTML = '<div class="empty-state">Carregando...</div>';
  $('modalPedido').classList.add('is-open');
  estado.pedidoAtual = pedidoId;
  estado.itensSelecionados.clear();

  try {
    const detalhe = await api('/app/aprovacao/' + pedidoId);
    renderDetalhe(detalhe);
  } catch (e) {
    $('modalCorpo').innerHTML = `<div class="empty-state" style="color:var(--danger);">${e.message}</div>`;
  }
}

function renderDetalhe(d) {
  const html = `
    <div class="detalhe-secao">
      <div class="detalhe-label">Cliente</div>
      <div class="detalhe-valor">${escapeHtml(d.cliente?.nomeRazaoSocial || d.cliente?.nomeFantasia || '—')}</div>
    </div>
    <div class="detalhe-grid">
      <div class="detalhe-secao">
        <div class="detalhe-label">Valor total</div>
        <div class="detalhe-valor" style="color:var(--accent);font-weight:700;">${fmtMoeda(d.valorTotalPedido)}</div>
      </div>
      <div class="detalhe-secao">
        <div class="detalhe-label">Itens pendentes</div>
        <div class="detalhe-valor">${d.totalItensPendentes}</div>
      </div>
    </div>
    ${d.cliente?.limiteDisponivel != null ? `
      <div class="detalhe-secao">
        <div class="detalhe-label">Limite disponivel</div>
        <div class="detalhe-valor">${fmtMoeda(d.cliente.limiteDisponivel)}</div>
      </div>` : ''}
    <div class="detalhe-secao">
      <div class="detalhe-label">Itens (toque pra selecionar)</div>
      ${(d.itens || []).map(it => `
        <div class="item-pedido" data-indice="${it.indice}">
          <div class="item-pedido-check" data-indice="${it.indice}"></div>
          <div class="item-pedido-info">
            <div class="item-pedido-desc">${escapeHtml(it.descricao)}</div>
            <div class="item-pedido-meta">
              Qtd: ${it.qtd} × ${fmtMoeda(it.valor)}
              ${it.desconto > 0 ? ` • Desc: ${fmtMoeda(it.desconto)}` : ''}
            </div>
            ${it.regra ? `<div class="item-pedido-meta" style="color:var(--warn);margin-top:3px;">⚠ ${escapeHtml(it.regra)}</div>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
  $('modalCorpo').innerHTML = html;

  document.querySelectorAll('.item-pedido-check').forEach(c => {
    c.addEventListener('click', e => {
      e.stopPropagation();
      const i = Number(c.dataset.indice);
      if (estado.itensSelecionados.has(i)) {
        estado.itensSelecionados.delete(i);
        c.classList.remove('is-checked');
        c.textContent = '';
      } else {
        estado.itensSelecionados.add(i);
        c.classList.add('is-checked');
        c.textContent = '✓';
      }
      $('btnAprovar').textContent = estado.itensSelecionados.size > 0
        ? `✅ Aprovar ${estado.itensSelecionados.size} item(ns)`
        : '✅ Aprovar tudo';
    });
  });
}

function fecharModal() {
  $('modalPedido').classList.remove('is-open');
  estado.pedidoAtual = null;
  estado.itensSelecionados.clear();
}

async function aprovar() {
  if (!estado.pedidoAtual) return;
  const btn = $('btnAprovar');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = '⏳ Aprovando...';

  try {
    let path, body = {};
    if (estado.itensSelecionados.size > 0) {
      path = `/app/aprovacao/${estado.pedidoAtual}/itens/aprovar`;
      body = { indices: [...estado.itensSelecionados] };
    } else {
      path = `/app/aprovacao/${estado.pedidoAtual}/aprovar`;
    }
    await api(path, { method: 'POST', body: JSON.stringify(body) });
    toast('Pedido aprovado com sucesso', 'success');
    fecharModal();
    carregarPendentes();
  } catch (e) {
    toast('Erro: ' + e.message, 'error');
    btn.disabled = false;
    btn.textContent = original;
  }
}

function abrirMotivoReprovacao() {
  if (!estado.pedidoAtual) return;
  $('inputMotivo').value = '';
  $('modalMotivo').classList.add('is-open');
}

async function confirmarReprovacao() {
  const motivo = $('inputMotivo').value.trim();
  if (!motivo) {
    toast('Informe o motivo da reprovacao', 'error');
    return;
  }
  const btn = $('btnConfirmarReprovar');
  btn.disabled = true;
  btn.textContent = '⏳ Reprovando...';

  try {
    let path, body = { motivo };
    if (estado.itensSelecionados.size > 0) {
      path = `/app/aprovacao/${estado.pedidoAtual}/itens/reprovar`;
      body.indices = [...estado.itensSelecionados];
    } else {
      path = `/app/aprovacao/${estado.pedidoAtual}/reprovar`;
    }
    await api(path, { method: 'POST', body: JSON.stringify(body) });
    toast('Pedido reprovado', 'success');
    $('modalMotivo').classList.remove('is-open');
    fecharModal();
    carregarPendentes();
  } catch (e) {
    toast('Erro: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar reprovacao';
  }
}

// ===== POLLING =====
function iniciarPolling() {
  pararPolling();
  estado.pollingTimer = setInterval(() => {
    if (!document.hidden) carregarPendentes();
  }, POLLING_MS);
}
function pararPolling() {
  if (estado.pollingTimer) clearInterval(estado.pollingTimer);
  estado.pollingTimer = null;
}

// ===== INIT =====
function init() {
  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/assets/js/aprovacao-sw.js', { scope: '/assets/' }).catch(e => console.error('SW:', e));
  }

  // Login form
  $('formLogin').addEventListener('submit', async e => {
    e.preventDefault();
    const erro = $('loginErro');
    erro.textContent = '';
    const btn = $('btnLogin');
    btn.disabled = true;
    btn.textContent = 'ENTRANDO...';
    try {
      await fazerLogin($('loginEmail').value, $('loginSenha').value);
      iniciarApp();
    } catch (e) {
      erro.textContent = e.message;
    } finally {
      btn.disabled = false;
      btn.textContent = 'ENTRAR';
    }
  });

  // App
  $('btnLogout').addEventListener('click', logout);
  $('btnRefresh').addEventListener('click', () => { carregarPendentes(); toast('Atualizado'); });
  $('btnFecharModal').addEventListener('click', fecharModal);
  $('btnAprovar').addEventListener('click', aprovar);
  $('btnReprovar').addEventListener('click', abrirMotivoReprovacao);
  $('btnFecharMotivo').addEventListener('click', () => $('modalMotivo').classList.remove('is-open'));
  $('btnCancelarMotivo').addEventListener('click', () => $('modalMotivo').classList.remove('is-open'));
  $('btnConfirmarReprovar').addEventListener('click', confirmarReprovacao);

  document.querySelectorAll('.nav-btn').forEach(b => {
    b.addEventListener('click', () => mostrarTab(b.dataset.tab));
  });

  document.querySelectorAll('.rel-card').forEach(c => {
    c.addEventListener('click', () => toast(`Relatorio "${c.dataset.rel}" em desenvolvimento`));
  });

  // Auto-login se tem token salvo
  if (estado.token) {
    iniciarApp();
  } else {
    mostrarTela('login');
  }
}

function iniciarApp() {
  mostrarTela('app');
  mostrarTab('aprovacao');
  carregarPendentes();
  iniciarPolling();
  setupPush(); // FASE 3: pede permissao e registra token FCM
}

// ============================================================
// PUSH NOTIFICATIONS (FASE 3 - Firebase Cloud Messaging)
// ============================================================
async function setupPush() {
  if (FIREBASE_CONFIG.apiKey === 'PREENCHA_AQUI') {
    console.warn('[PUSH] Firebase nao configurado ainda. Pulando.');
    return;
  }
  if (!('serviceWorker' in navigator)) {
    console.warn('[PUSH] Service worker nao suportado.');
    return;
  }
  if (!('PushManager' in window)) {
    console.warn('[PUSH] PushManager nao suportado (iOS < 16.4?).');
    return;
  }

  try {
    // Lazy-load Firebase SDK (so quando precisar)
    const [{ initializeApp }, { getMessaging, getToken, onMessage }] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging.js')
    ]);

    const fbApp = initializeApp(FIREBASE_CONFIG);
    const messaging = getMessaging(fbApp);

    // Registra o service worker dedicado do Firebase
    const swReg = await navigator.serviceWorker.register('/assets/js/firebase-messaging-sw.js');
    console.log('[PUSH] Firebase SW registrado:', swReg.scope);

    // Pede permissao
    const permissao = await Notification.requestPermission();
    if (permissao !== 'granted') {
      console.log('[PUSH] Permissao negada/dispensada.');
      return;
    }

    // Pega o token FCM
    const fcmToken = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (!fcmToken) {
      console.warn('[PUSH] Nao recebi token FCM.');
      return;
    }

    console.log('[PUSH] FCM token obtido (primeiros 20):', fcmToken.slice(0, 20) + '...');

    // Manda pro backend se for novo ou diferente
    if (fcmToken !== estado.fcmToken) {
      try {
        await api('/app/push/register-token', {
          method: 'POST',
          body: JSON.stringify({ token: fcmToken, plataforma: 'web' })
        });
        estado.fcmToken = fcmToken;
        localStorage.setItem('visya-fcm-token', fcmToken);
        toast('Notificacoes ativadas', 'success');
      } catch (e) {
        console.error('[PUSH] Erro ao registrar token no backend:', e.message);
      }
    }

    // Recebe push quando o app esta ABERTO em primeiro plano
    onMessage(messaging, (payload) => {
      console.log('[PUSH] Mensagem em foreground:', payload);
      const notif = payload.notification || {};
      toast(`🔔 ${notif.title || 'Nova notificacao'}`);
      // Atualiza a lista
      carregarPendentes();
    });

  } catch (err) {
    console.error('[PUSH] Erro no setup:', err);
  }
}

window.addEventListener('DOMContentLoaded', init);
