/* Rifa a beneficio — lógica de la landing (vanilla JS, sin build) */
(() => {
  'use strict';

  const CONFIG = {
    MIN: 0,
    MAX: 200,
    PRICE_ONE: 6000,
    PRICE_TWO: 10000,
    MAX_PER_ORDER: 10,
    WHATSAPP: '5493426390374',
    HOLDER: 'Silvana Nadin Córdoba',
    BANK: 'Banco Santander',
    CBU: '0720273788000003810718',
    ALIAS: 'estudios.scn.26',
    DRAW_DAY: [2026, 9, 8], // año, mes (0 = enero), día → jueves 8 de octubre
    REFRESH_MS: 30000,
    DEMO_SOLD: [8, 27],
  };

  const RANGES = { all: [0, 200], a: [0, 49], b: [50, 99], c: [100, 149], d: [150, 200] };

  const METHOD_UI = {
    transferencia: {
      title: 'Pagás por transferencia',
      submit: 'Ver datos para transferir',
      busy: 'Reservando tus números…',
      note: 'Tus números quedan reservados 12 h a tu nombre hasta que Sil confirme la transferencia.',
    },
    reserva: {
      title: 'Reservás tu número',
      submit: 'Reservar 24 horas',
      busy: 'Reservando tu número…',
      note: 'Tu número queda bloqueado 24 h a tu nombre. Avisale a Sil y transferí dentro de ese plazo para confirmarlo.',
    },
  };

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const pad = (n) => (n < 100 ? String(n).padStart(2, '0') : String(n));
  const money = (n) => '$' + Number(n).toLocaleString('es-AR');
  const priceFor = (n) => Math.floor(n / 2) * CONFIG.PRICE_TWO + (n % 2) * CONFIG.PRICE_ONE;
  const sortNum = (a, b) => a - b;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const params = new URLSearchParams(location.search);
  const waLink = (text) => `https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent(text)}`;

  // ---------- almacenamiento local (conveniencia, puede fallar) ----------
  const store = {
    get(key, fallback = null) {
      try { const v = localStorage.getItem('rifa:' + key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('rifa:' + key, JSON.stringify(value)); } catch { /* sin storage */ }
    },
  };

  const state = {
    sold: new Set(),
    reserved: new Set(),
    selected: new Set(),
    range: 'all',
    method: 'transferencia',
    demo: params.has('demo'),
    loaded: false,
    sheetOpen: false,
  };

  const selectedList = () => [...state.selected].sort(sortNum);

  // ---------- grilla ----------
  const grid = $('#grid');
  const cells = [];

  function buildGrid() {
    const frag = document.createDocumentFragment();
    for (let n = CONFIG.MIN; n <= CONFIG.MAX; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'num';
      b.dataset.n = n;
      b.textContent = pad(n);
      cells[n] = b;
      frag.append(b);
    }
    grid.append(frag);
  }

  function statusOf(n) {
    if (state.sold.has(n)) return 'sold';
    if (state.reserved.has(n)) return 'reserved';
    return 'free';
  }

  function paintCell(n) {
    const b = cells[n];
    const st = statusOf(n);
    const sel = state.selected.has(n);
    b.classList.toggle('is-sold', st === 'sold');
    b.classList.toggle('is-reserved', st === 'reserved');
    b.setAttribute('aria-disabled', String(st !== 'free'));
    b.setAttribute('aria-pressed', String(sel));
    const label = st === 'sold' ? 'vendido' : st === 'reserved' ? 'reservado' : sel ? 'elegido' : 'disponible';
    b.setAttribute('aria-label', `Número ${pad(n)}, ${label}`);
  }

  function paintAll() {
    for (let n = CONFIG.MIN; n <= CONFIG.MAX; n++) paintCell(n);
    updateStats();
    updateDock();
  }

  function shake(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function toggleNumber(n) {
    const st = statusOf(n);
    if (st !== 'free') {
      shake(cells[n]);
      toast(st === 'sold' ? `El ${pad(n)} ya está vendido 💔` : `El ${pad(n)} está reservado por otra persona`);
      return;
    }
    if (state.selected.has(n)) {
      state.selected.delete(n);
    } else {
      if (state.selected.size >= CONFIG.MAX_PER_ORDER) {
        shake(cells[n]);
        toast(`Podés elegir hasta ${CONFIG.MAX_PER_ORDER} números por compra`);
        return;
      }
      state.selected.add(n);
      navigator.vibrate?.(8);
    }
    paintCell(n);
    updateDock();
    saveSelection();
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.num');
    if (b) toggleNumber(Number(b.dataset.n));
  });

  function saveSelection() {
    store.set('sel', [...state.selected]);
  }

  // ---------- filtro por rango (segmented control) ----------
  const seg = $('#seg');

  function moveThumb() {
    const active = $('button[aria-pressed="true"]', seg);
    if (!active) return;
    seg.style.setProperty('--x', active.offsetLeft + 'px');
    seg.style.setProperty('--w', active.offsetWidth + 'px');
  }

  function setRange(key) {
    state.range = key;
    const [lo, hi] = RANGES[key];
    cells.forEach((b, n) => { b.hidden = n < lo || n > hi; });
    $$('button', seg).forEach((btn) => btn.setAttribute('aria-pressed', String(btn.dataset.range === key)));
    moveThumb();
  }

  seg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-range]');
    if (btn) setRange(btn.dataset.range);
  });

  // ---------- número al azar ----------
  $('#randomBtn').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    if (state.selected.size >= CONFIG.MAX_PER_ORDER) {
      toast(`Podés elegir hasta ${CONFIG.MAX_PER_ORDER} números por compra`);
      return;
    }
    const [lo, hi] = RANGES[state.range];
    const pool = [];
    for (let n = lo; n <= hi; n++) if (statusOf(n) === 'free' && !state.selected.has(n)) pool.push(n);
    if (!pool.length) { toast('No quedan números libres en este rango'); return; }
    const n = pool[Math.floor(Math.random() * pool.length)];
    btn.classList.remove('rolling'); void btn.offsetWidth; btn.classList.add('rolling');
    toggleNumber(n);
    cells[n].scrollIntoView({ block: 'center', behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    cells[n].classList.remove('flash'); void cells[n].offsetWidth; cells[n].classList.add('flash');
    setTimeout(() => cells[n].classList.remove('flash'), 1300);
    toast(`¡Te tocó el ${pad(n)}! 🎲`);
  });

  // ---------- estadísticas ----------
  function updateStats() {
    const total = CONFIG.MAX - CONFIG.MIN + 1;
    let free = 0;
    for (let n = CONFIG.MIN; n <= CONFIG.MAX; n++) if (!state.sold.has(n) && !state.reserved.has(n)) free++;
    $('#statFree').textContent = free;
    $('#statTotal').textContent = total;
    $('#statBar').style.setProperty('--p', ((total - free) / total * 100).toFixed(1) + '%');
  }

  // ---------- dock flotante ----------
  const dock = $('#dock');
  let lastTotal = 0;

  function updateDock() {
    const n = state.selected.size;
    dock.classList.toggle('is-open', n > 0);
    dock.setAttribute('aria-hidden', String(n === 0));
    dock.inert = n === 0;
    document.body.classList.toggle('has-dock', n > 0);
    if (!n) { lastTotal = 0; return; }
    const total = priceFor(n);
    $('#dockCount').textContent = n === 1 ? '1 número' : `${n} números`;
    $('#dockList').textContent = selectedList().map(pad).join(' · ');
    $('#dockHint').textContent = n % 2 === 1 && n < CONFIG.MAX_PER_ORDER
      ? `Sumá otro por solo ${money(priceFor(n + 1) - total)}`
      : '';
    const totalEl = $('#dockTotal');
    totalEl.textContent = money(total);
    if (total !== lastTotal) { totalEl.classList.remove('bump'); void totalEl.offsetWidth; totalEl.classList.add('bump'); }
    lastTotal = total;
  }

  $('#dockGo').addEventListener('click', () => openSheet());

  // ---------- datos del servidor ----------
  async function loadNumbers() {
    if (state.demo) {
      applyNumbers({ sold: CONFIG.DEMO_SOLD, reserved: [] });
      $('#demoBadge').hidden = false;
      return;
    }
    try {
      const r = await fetch('/api/numbers', { cache: 'no-store', headers: { accept: 'application/json' } });
      const ct = r.headers.get('content-type') || '';
      if (!r.ok || !ct.includes('json')) throw new Error('api-no-disponible');
      applyNumbers(await r.json());
    } catch (err) {
      if (!state.loaded) {
        console.info('[rifa] API no disponible, se usa el modo demo.', err.message);
        state.demo = true;
        $('#demoBadge').hidden = false;
        applyNumbers({ sold: CONFIG.DEMO_SOLD, reserved: [] });
      }
    }
  }

  function applyNumbers({ sold = [], reserved = [] }) {
    state.sold = new Set(sold);
    state.reserved = new Set(reserved.filter((n) => !state.sold.has(n)));
    const lost = [...state.selected].filter((n) => statusOf(n) !== 'free');
    lost.forEach((n) => state.selected.delete(n));
    if (lost.length && state.loaded) {
      toast(`Se ocupó el ${lost.map(pad).join(', ')}. Lo sacamos de tu selección.`);
    }
    state.loaded = true;
    paintAll();
    saveSelection();
    if (state.sheetOpen && sheet.dataset.step !== 'transfer') {
      if (state.selected.size) fillSheet(); else closeSheet();
    }
  }

  // ---------- pop-up de compra ----------
  const sheet = $('#sheet');
  const scrim = $('#scrim');
  let lastFocus = null;

  function breakdown(n) {
    const pairs = Math.floor(n / 2);
    const parts = [];
    if (pairs) parts.push(`${pairs} promo${pairs > 1 ? 's' : ''} de 2 × ${money(CONFIG.PRICE_TWO)}`);
    if (n % 2) parts.push(`1 × ${money(CONFIG.PRICE_ONE)}`);
    return parts.join(' + ');
  }

  /** Pinta los números y el total del pop-up. locked = sin botón para quitar (ya reservados). */
  function fillSheet(list = selectedList(), { locked = false } = {}) {
    $('#sheetChips').replaceChildren(...list.map((n) => {
      const chip = document.createElement('span');
      if (locked) {
        chip.className = 'nchip nchip--static';
        chip.textContent = pad(n);
        return chip;
      }
      chip.className = 'nchip';
      chip.innerHTML = `${pad(n)}<button type="button" aria-label="Quitar el ${pad(n)}"><svg><use href="#i-close"/></svg></button>`;
      chip.querySelector('button').addEventListener('click', () => {
        toggleNumber(n);
        if (!state.selected.size) closeSheet(); else fillSheet();
      });
      return chip;
    }));
    $('#sheetTitle').textContent = list.length === 1 ? 'Tu número' : 'Tus números';
    $('#sheetBreakdown').textContent = breakdown(list.length);
    $('#sheetTotal').textContent = money(priceFor(list.length));
  }

  function setStep(step) {
    sheet.dataset.step = step;
    $('#formError').textContent = '';
    sheet.scrollTop = 0;
  }

  function formError(text) {
    $('#formError').textContent = text;
  }

  function lockScroll(on) {
    document.documentElement.classList.toggle('lock', on);
  }

  function openSheet() {
    if (!state.selected.size) return;
    setStep('method');
    fillSheet();
    lastFocus = document.activeElement;
    scrim.hidden = false;
    requestAnimationFrame(() => scrim.classList.add('is-open'));
    sheet.inert = false;
    sheet.setAttribute('aria-hidden', 'false');
    sheet.classList.add('is-open');
    state.sheetOpen = true;
    lockScroll(true);
    setTimeout(() => $('#sheetTitle').focus({ preventScroll: true }), 60);
  }

  function closeSheet() {
    if (!state.sheetOpen) return;
    state.sheetOpen = false;
    sheet.classList.remove('is-open');
    sheet.setAttribute('aria-hidden', 'true');
    sheet.inert = true;
    scrim.classList.remove('is-open');
    setTimeout(() => { if (!state.sheetOpen) scrim.hidden = true; }, 350);
    lockScroll(false);
    lastFocus?.focus?.({ preventScroll: true });
  }

  $('#sheetClose').addEventListener('click', closeSheet);
  scrim.addEventListener('click', closeSheet);

  // arrastrar hacia abajo para cerrar
  const grab = $('#sheetGrab');
  let drag = null;
  grab.addEventListener('pointerdown', (e) => {
    drag = { y: e.clientY, t: performance.now(), dy: 0 };
    sheet.style.transition = 'none';
    grab.setPointerCapture(e.pointerId);
  });
  grab.addEventListener('pointermove', (e) => {
    if (!drag) return;
    drag.dy = Math.max(0, e.clientY - drag.y);
    sheet.style.transform = `translateY(${drag.dy}px)`;
  });
  const endDrag = () => {
    if (!drag) return;
    const velocity = drag.dy / Math.max(1, performance.now() - drag.t);
    sheet.style.transition = '';
    sheet.style.transform = '';
    if (drag.dy > 110 || velocity > 0.6) closeSheet();
    drag = null;
  };
  grab.addEventListener('pointerup', endDrag);
  grab.addEventListener('pointercancel', endDrag);

  // paso 1 → elegir medio de pago
  function chooseMethod(method) {
    state.method = method;
    const ui = METHOD_UI[method];
    $('#formTitle').textContent = ui.title;
    $('#formSubmitLabel').textContent = ui.submit;
    $('#formNote').textContent = ui.note;
    setStep('form');
    $('#formTitle').focus({ preventScroll: true });
  }

  $$('.pay-option').forEach((btn) => btn.addEventListener('click', () => chooseMethod(btn.dataset.method)));
  $('#stepBack').addEventListener('click', () => setStep('method'));

  // paso 2 → datos de quien compra
  const fNombre = $('#fNombre');
  const fTel = $('#fTel');

  function readForm() {
    const nombre = fNombre.value.trim().replace(/\s+/g, ' ');
    const telefono = fTel.value.trim();
    const badName = nombre.length < 3;
    const badTel = telefono.replace(/\D/g, '').length < 8;
    fNombre.setAttribute('aria-invalid', String(badName));
    fTel.setAttribute('aria-invalid', String(badTel));
    if (badName || badTel) {
      formError(badName ? 'Contanos tu nombre y apellido.' : 'Ingresá un celular válido (con código de área).');
      (badName ? fNombre : fTel).focus();
      return null;
    }
    formError('');
    store.set('buyer', { nombre, telefono });
    return { nombre, telefono };
  }

  function setBusy(btn, busy, label) {
    if (busy) {
      btn.dataset.label = btn.innerHTML;
      btn.setAttribute('aria-busy', 'true');
      btn.innerHTML = `<span class="spinner" aria-hidden="true"></span>${label}`;
    } else if (btn.dataset.label) {
      btn.removeAttribute('aria-busy');
      btn.innerHTML = btn.dataset.label;
      delete btn.dataset.label;
    }
  }

  async function checkout() {
    const method = state.method;
    const buyer = readForm();
    if (!buyer) return;
    const numbers = selectedList();
    if (!numbers.length) { closeSheet(); return; }

    if (state.demo) {
      formError('El pago todavía no está habilitado. Probá de nuevo en un ratito 🙏');
      return;
    }

    const btn = $('#formSubmit');
    setBusy(btn, true, METHOD_UI[method].busy);
    try {
      const r = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ numbers, ...buyer, method }),
      });
      const data = await r.json().catch(() => ({}));

      if (r.status === 409) {
        const taken = Array.isArray(data.numbers) ? data.numbers : [];
        taken.forEach((n) => { state.selected.delete(n); state.reserved.add(n); });
        saveSelection();
        paintAll();
        loadNumbers();
        if (!state.selected.size) {
          closeSheet();
          toast('Tus números se acaban de ocupar. Elegí otros 🙏');
          return;
        }
        fillSheet();
        formError(taken.length
          ? `Uy, el ${taken.map(pad).join(', ')} se acaba de ocupar y lo sacamos. Revisá el total y volvé a intentar.`
          : 'Alguno de tus números se acaba de ocupar. Revisá tu selección.');
        return;
      }
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);

      showTransfer({ orderId: data.orderId, numbers, amount: data.amount || priceFor(numbers.length), method, ...buyer });
    } catch (err) {
      console.error('[rifa] checkout', err);
      formError('No pudimos reservar tus números. Probá de nuevo en un ratito.');
    } finally {
      setBusy(btn, false);
    }
  }

  $('#buyForm').addEventListener('submit', (e) => {
    e.preventDefault();
    checkout();
  });

  // paso 3 → datos para transferir o confirmación de reserva
  function showTransfer(t) {
    t.numbers.forEach((n) => { state.selected.delete(n); state.reserved.add(n); });
    saveSelection();
    paintAll();
    fillSheet(t.numbers, { locked: true });
    $('#transferAmount').textContent = money(t.amount);
    const label = t.numbers.length === 1 ? 'el número' : 'los números';
    const nums = t.numbers.map(pad).join(', ');
    const isReserva = t.method === 'reserva';
    $('#transferTitle').textContent = isReserva ? '¡Tu reserva quedó lista! 🎟️' : '¡Tus números quedaron reservados! 🎟️';
    $('#transferLead').textContent = isReserva ? 'Tenés 24 h para transferir' : 'Transferí';
    $('#transferNote').textContent = isReserva
      ? 'Avisale a Sil que reservaste y mandale la captura cuando hagas la transferencia.'
      : 'Mandale a Sil la captura de pantalla cuando hayas hecho la transferencia.';
    $('#transferFineprint').textContent = isReserva
      ? 'Quedan reservados 24 h a tu nombre. Pasado ese tiempo, se liberan solos.'
      : 'Quedan reservados 12 h a tu nombre hasta que Sil confirme la transferencia.';
    const msg = isReserva
      ? `¡Hola Sil! Soy ${t.nombre}. Reservé ${label} ${nums} de la rifa 🎟️ Te transfiero ${money(t.amount)} dentro de las próximas 24 h.`
      : `¡Hola Sil! Soy ${t.nombre}. Te transferí ${money(t.amount)} por ${label} ${nums} de la rifa 🎟️ Te mando la captura 👇`;
    $('#waBtn').href = waLink(msg);
    setStep('transfer');
    $('#transferTitle').focus({ preventScroll: true });
    confetti();
  }

  $('#transferDone').addEventListener('click', closeSheet);

  $('#holderText').textContent = CONFIG.HOLDER;
  $('#bankText').textContent = CONFIG.BANK;
  $('#cbuText').textContent = CONFIG.CBU;
  $('#aliasText').textContent = CONFIG.ALIAS;
  $$('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy === 'cbu' ? CONFIG.CBU : CONFIG.ALIAS;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.append(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      btn.textContent = '¡Copiado!';
      btn.classList.add('ok');
      navigator.vibrate?.(8);
      setTimeout(() => { btn.textContent = 'Copiar'; btn.classList.remove('ok'); }, 1600);
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.sheetOpen) closeSheet();
  });

  // ---------- toast ----------
  const toastEl = $('#toast');
  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('is-open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-open'), 3200);
  }

  // ---------- confetti pastel ----------
  function confetti() {
    if (reduceMotion.matches) return;
    const c = $('#confetti');
    const ctx = c.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = innerWidth, H = innerHeight;
    c.width = W * dpr; c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ['#E3A796', '#C9D3BF', '#F2D3BF', '#9A4A38', '#4A5A48', '#FFFFFF'];
    const parts = Array.from({ length: 150 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 120,
      y: H * 0.38,
      vx: (Math.random() - 0.5) * 13,
      vy: -Math.random() * 13 - 4,
      r: 5 + Math.random() * 6,
      c: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 0.3,
      rect: Math.random() > 0.45,
    }));
    const start = performance.now();
    c.hidden = false;
    (function frame(t) {
      const el = t - start;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0, 1 - el / 3400);
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        if (p.rect) ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        else { ctx.beginPath(); ctx.arc(0, 0, p.r / 2.4, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      if (el < 3400) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, W, H); c.hidden = true; }
    })(start);
  }

  // ---------- cuenta regresiva ----------
  function countdown() {
    const [y, m, d] = CONFIG.DRAW_DAY;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const days = Math.round((new Date(y, m, d) - today) / 864e5);
    const text = days > 1 ? `Faltan ${days} días para el sorteo`
      : days === 1 ? '¡Mañana es el sorteo!'
      : days === 0 ? '¡Hoy es el sorteo!'
      : 'El sorteo ya se realizó';
    $$('[data-countdown]').forEach((el) => { el.textContent = text; });
  }

  // ---------- topbar + revelado ----------
  const topbar = $('#topbar');
  const onScroll = () => topbar.classList.toggle('is-scrolled', window.scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true });

  function setupReveal() {
    const els = $$('[data-reveal]');
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach((el) => io.observe(el));
  }

  // ---------- inicio ----------
  function init() {
    buildGrid();
    (store.get('sel', []) || []).forEach((n) => {
      if (Number.isInteger(n) && n >= CONFIG.MIN && n <= CONFIG.MAX) state.selected.add(n);
    });
    const buyer = store.get('buyer');
    if (buyer) { fNombre.value = buyer.nombre || ''; fTel.value = buyer.telefono || ''; }
    $('#footerWa').href = waLink('¡Hola Sil! Tengo una consulta sobre la rifa 🎟️');

    setRange('all');
    paintAll();
    countdown();
    onScroll();
    setupReveal();
    document.fonts?.ready.then(moveThumb);
    addEventListener('resize', moveThumb);

    loadNumbers();
    setInterval(() => { if (!document.hidden && !state.sheetOpen) loadNumbers(); }, CONFIG.REFRESH_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadNumbers(); });
  }

  init();
})();
