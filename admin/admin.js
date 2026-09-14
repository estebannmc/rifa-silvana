/* Panel de Sil — confirmar transferencias, liberar, bloquear y anular */
(() => {
  'use strict';

  const MIN = 0;
  const MAX = 200;
  const PRICE_ONE = 6000;
  const PRICE_TWO = 10000;
  const REFRESH_MS = 30000;

  const $ = (sel, root = document) => root.querySelector(sel);
  const pad = (n) => (n < 100 ? String(n).padStart(2, '0') : String(n));
  const money = (n) => '$' + Number(n).toLocaleString('es-AR');
  const priceFor = (n) => Math.floor(n / 2) * PRICE_TWO + (n % 2) * PRICE_ONE;
  const byNum = (a, b) => a - b;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const METHOD = { mercadopago: 'Mercado Pago', transferencia: 'Transferencia', manual: 'Por fuera' };

  const state = { data: null, selected: new Set(), amountDirty: false };

  // ---------- API ----------
  async function api(path, body) {
    const opts = body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : { cache: 'no-store' };
    const r = await fetch(path, opts);
    const data = await r.json().catch(() => ({}));
    if (r.status === 401 && path !== '/api/admin/login') showLogin();
    return { ok: r.ok, status: r.status, data };
  }

  // ---------- vistas ----------
  function showLogin(message = '') {
    $('#appView').hidden = true;
    $('#loginView').hidden = false;
    $('#loginError').textContent = message;
  }

  function showApp() {
    $('#loginView').hidden = true;
    $('#appView').hidden = false;
  }

  async function load() {
    const btn = $('#refreshBtn');
    btn.classList.add('spin');
    try {
      const { ok, status, data } = await api('/api/admin/data');
      if (ok) {
        state.data = data;
        showApp();
        render();
      } else if (status !== 401 && !$('#appView').hidden) {
        toast('No se pudieron cargar los datos. Probá de nuevo.');
      }
    } catch {
      if (!$('#appView').hidden) toast('Sin conexión con el servidor.');
    } finally {
      btn.classList.remove('spin');
    }
  }

  // ---------- ingreso / salida ----------
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = $('#lUser').value.trim();
    const password = $('#lPass').value;
    if (!user || !password) {
      $('#loginError').textContent = 'Completá usuario y contraseña.';
      (!user ? $('#lUser') : $('#lPass')).focus();
      return;
    }
    const btn = $('#loginBtn');
    btn.disabled = true;
    $('#loginError').textContent = '';
    try {
      const { ok, status } = await api('/api/admin/login', { user, password });
      if (ok) {
        $('#lPass').value = '';
        await load();
        return;
      }
      $('#loginError').textContent =
        status === 401 ? 'Usuario o contraseña incorrectos.'
        : status === 429 ? 'Demasiados intentos. Esperá 15 minutos y probá de nuevo.'
        : status === 503 ? 'El panel todavía no está configurado (falta la contraseña en Vercel).'
        : 'No se pudo entrar. Probá de nuevo.';
    } catch {
      $('#loginError').textContent = 'Sin conexión con el servidor.';
    } finally {
      btn.disabled = false;
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/api/admin/logout', {}); } catch { /* igual salimos */ }
    state.data = null;
    showLogin();
  });

  $('#refreshBtn').addEventListener('click', load);

  // ---------- render ----------
  function setCount(sel, n) {
    const el = $(sel);
    el.textContent = n;
    el.toggleAttribute('data-zero', n === 0);
  }

  const chips = (nums) => nums.map((n) => `<span class="nchip nchip--static">${pad(n)}</span>`).join('');

  function contact(o) {
    const digits = String(o.telefono || '').replace(/\D/g, '');
    if (digits.length < 8) return '';
    const wa = digits.startsWith('54') ? digits : '549' + digits.replace(/^0/, '');
    return `<a href="tel:${digits}">${esc(o.telefono)}</a><a href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>`;
  }

  const when = (iso) => new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  function timeLeft(iso) {
    if (!iso) return '';
    const ms = new Date(iso) - Date.now();
    if (ms <= 0) return '<span class="late">reserva vencida</span>';
    const h = Math.floor(ms / 36e5);
    const m = Math.floor((ms % 36e5) / 6e4);
    return `${ms < 2 * 36e5 ? '<span class="late">' : '<span>'}vence en ${h ? `${h} h ` : ''}${m} min</span>`;
  }

  function card(o, { meta = '', actions = '', single = false } = {}) {
    return `<article class="ocard" data-id="${esc(o.id)}">
      <div class="ocard__top"><span class="ocard__name">${esc(o.nombre)}</span><span class="ocard__amount">${money(o.amount)}</span></div>
      <div class="ocard__meta"><span class="badge badge--${esc(o.method)}">${METHOD[o.method] || esc(o.method)}</span>${meta}${contact(o)}</div>
      ${o.note ? `<p class="ocard__note">${esc(o.note)}</p>` : ''}
      <div class="ocard__nums">${chips(o.numbers)}</div>
      ${actions ? `<div class="ocard__actions${single ? ' ocard__actions--single' : ''}">${actions}</div>` : ''}
    </article>`;
  }

  const transferCard = (o) => card(o, {
    meta: `<span>${when(o.created_at)}</span>${timeLeft(o.reserved_until)}`,
    actions: '<button type="button" class="btn btn-green" data-action="confirm">Confirmar pago</button>'
      + '<button type="button" class="btn btn-glass" data-action="release">Liberar</button>',
  });

  const mpCard = (o) => card(o, { meta: `<span>${when(o.created_at)} · pagando…</span>` });

  const saleCard = (o) => card(o, {
    meta: `<span>${when(o.paid_at || o.created_at)}</span>`,
    actions: '<button type="button" class="btn btn-danger" data-action="void">Anular venta</button>',
    single: true,
  });

  function render() {
    const d = state.data;
    $('#kSold').textContent = d.stats.sold;
    $('#kRes').textContent = d.stats.reserved;
    $('#kFree').textContent = d.stats.free;
    $('#kRaised').textContent = money(d.stats.raised);

    const transfers = [...d.pendingTransfers].reverse(); // las más viejas primero
    setCount('#trCount', transfers.length);
    $('#trList').innerHTML = transfers.length
      ? transfers.map(transferCard).join('')
      : '<p class="empty">No hay transferencias pendientes.</p>';

    const mp = d.pendingMp || [];
    $('#mpSection').hidden = mp.length === 0;
    setCount('#mpCount', mp.length);
    $('#mpList').innerHTML = mp.map(mpCard).join('');

    setCount('#salesCount', d.sales.length);
    $('#salesList').innerHTML = d.sales.length
      ? d.sales.map(saleCard).join('')
      : '<p class="empty">Todavía no hay ventas.</p>';

    paintGrid();
  }

  function findOrder(id) {
    const d = state.data;
    return [...d.pendingTransfers, ...(d.pendingMp || []), ...d.sales].find((o) => o.id === id);
  }

  // ---------- acciones sobre pedidos ----------
  $('#appView').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.closest('.ocard')?.dataset.id;
    const order = id && findOrder(id);
    if (!order) return;
    const action = btn.dataset.action;
    const nums = order.numbers.map(pad).join(', ');

    if (action === 'release' && !confirm(`¿Liberar ${nums} de ${order.nombre}? Vuelven a quedar disponibles en la web.`)) return;
    if (action === 'void' && !confirm(`¿Anular la venta de ${order.nombre} (${nums})? Los números vuelven a quedar disponibles.`)) return;

    btn.disabled = true;
    try {
      const { ok, status } = await api('/api/admin/action', { action, id });
      if (ok) {
        toast(action === 'confirm' ? `Pago confirmado: ${nums}` : action === 'release' ? `Liberados: ${nums}` : `Venta anulada: ${nums}`);
      } else if (status !== 401) {
        toast(status === 409 ? 'Ese pedido ya había cambiado. Actualicé la lista.' : 'No se pudo hacer. Probá de nuevo.');
      }
    } catch {
      toast('Sin conexión con el servidor.');
    } finally {
      btn.disabled = false;
      load();
    }
  });

  // ---------- grilla para bloquear ----------
  const grid = $('#adminGrid');
  const cells = [];
  for (let n = MIN; n <= MAX; n++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'num';
    b.dataset.n = n;
    b.textContent = pad(n);
    cells[n] = b;
    grid.append(b);
  }

  function paintGrid() {
    const sold = new Set(state.data?.sold || []);
    const reserved = new Set(state.data?.reserved || []);
    for (const n of [...state.selected]) if (sold.has(n) || reserved.has(n)) state.selected.delete(n);
    cells.forEach((b, n) => {
      const st = sold.has(n) ? 'sold' : reserved.has(n) ? 'reserved' : 'free';
      const sel = state.selected.has(n);
      b.classList.toggle('is-sold', st === 'sold');
      b.classList.toggle('is-reserved', st === 'reserved');
      b.setAttribute('aria-disabled', String(st !== 'free'));
      b.setAttribute('aria-pressed', String(sel));
      b.setAttribute('aria-label', `Número ${pad(n)}, ${st === 'sold' ? 'vendido' : st === 'reserved' ? 'reservado' : sel ? 'elegido' : 'disponible'}`);
    });
    updateBlockForm();
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.num');
    if (!b || b.getAttribute('aria-disabled') === 'true') return;
    const n = Number(b.dataset.n);
    if (state.selected.has(n)) state.selected.delete(n); else state.selected.add(n);
    b.setAttribute('aria-pressed', String(state.selected.has(n)));
    updateBlockForm();
  });

  function updateBlockForm() {
    const list = [...state.selected].sort(byNum);
    $('#blockSel').textContent = list.length
      ? `${list.length === 1 ? 'Número' : 'Números'}: ${list.map(pad).join(', ')}`
      : 'Tocá los números en la grilla';
    if (!state.amountDirty) $('#bAmount').value = list.length ? priceFor(list.length) : '';
    $('#blockBtn').disabled = list.length === 0;
  }

  $('#bAmount').addEventListener('input', () => { state.amountDirty = $('#bAmount').value !== ''; });

  $('#blockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const numbers = [...state.selected].sort(byNum);
    if (!numbers.length) return;
    const amount = Math.max(0, Math.round(Number($('#bAmount').value || 0)));
    const btn = $('#blockBtn');
    btn.disabled = true;
    $('#blockError').textContent = '';
    try {
      const { ok, status, data } = await api('/api/admin/action', {
        action: 'block', numbers, amount, nombre: $('#bNombre').value, telefono: $('#bTel').value,
      });
      if (ok) {
        toast(`Bloqueados: ${numbers.map(pad).join(', ')}`);
        state.selected.clear();
        state.amountDirty = false;
        $('#bNombre').value = '';
        $('#bTel').value = '';
        await load();
      } else if (status === 409) {
        const taken = (data.numbers || []).map(pad).join(', ');
        $('#blockError').textContent = `Ya estaban ocupados: ${taken || 'alguno de esos números'}. Actualicé la grilla.`;
        load();
      } else if (status !== 401) {
        $('#blockError').textContent = 'No se pudo bloquear. Probá de nuevo.';
      }
    } catch {
      $('#blockError').textContent = 'Sin conexión con el servidor.';
    } finally {
      btn.disabled = state.selected.size === 0;
    }
  });

  // ---------- toast ----------
  let toastTimer = 0;
  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.add('is-open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('is-open'), 3200);
  }

  // ---------- inicio ----------
  load();
  setInterval(() => {
    const typing = document.activeElement?.matches?.('input');
    if (!document.hidden && !$('#appView').hidden && !typing) load();
  }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#appView').hidden) load(); });
})();
