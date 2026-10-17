/* ============================================================
   SAV3R v2 - percent buckets + paycheck splitter
   - Make buckets (account labels) and give each a percent.
   - Type in a paycheck and see the exact amount for each bucket.
   - Everything is stored on the device (localStorage).
   - All icons come from the hard-coded sprite in index.html.
   - One delegated click handler, so every button works the same
     with a mouse, a finger, or a keyboard.
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'sav3r.v2';
  var OLD_KEY = 'sav3r.v1';
  var ICONS = ['wallet', 'piggy', 'home', 'car', 'gift', 'plane', 'heart', 'cap', 'star', 'target', 'calendar', 'coins'];
  var ICON_NAMES = {
    wallet: 'Wallet', piggy: 'Piggy bank', home: 'Home', car: 'Car', gift: 'Gift', plane: 'Trip',
    heart: 'Heart', cap: 'School', star: 'Star', target: 'Target', calendar: 'Event', coins: 'Coins'
  };
  var SEG = ['#2fc48d', '#8be8bc', '#1ea574', '#b4f0d5', '#4fd6a0', '#13805a', '#d3f8e6', '#3fdc9f'];
  var CURRENCIES = ['$', '€', '£', '¥', '₹', '₩', '₱', 'R$', 'C$', 'A$', 'MX$', 'kr', 'zł', 'Fr'];

  var memoryStore = null;
  var storageWarned = false;

  var state = load();
  var ui = { view: 'split', amount: state.lastAmount || '' };
  var modalEl = null;
  var pending = null;
  var lastFocus = null;
  var toastTimer = null;

  /* ---------- storage ---------- */
  function blank() {
    return { v: 2, settings: { theme: 'auto', currency: '$' }, lastAmount: '', buckets: [], paychecks: [] };
  }

  function isObj(x) { return x && typeof x === 'object'; }

  function clampPct(p) {
    p = Number(p);
    if (!isFinite(p) || p < 0) return 0;
    if (p > 100) p = 100;
    return Math.round(p * 100) / 100;
  }

  function cleanBucket(x) {
    return {
      id: String(x.id || uid()),
      name: String(x.name || 'Bucket').slice(0, 40),
      percent: clampPct(x.percent),
      icon: ICONS.indexOf(x.icon) >= 0 ? x.icon : 'wallet',
      target: Math.max(0, Number(x.target) || 0),
      saved: Math.max(0, Number(x.saved) || 0),
      date: typeof x.date === 'string' ? x.date : ''
    };
  }

  function readSettings(b, d) {
    if (isObj(d.settings)) {
      var t = d.settings.theme;
      if (t === 'light' || t === 'dark' || t === 'auto') b.settings.theme = t;
      var c = d.settings.currency;
      if (typeof c === 'string' && c.length > 0 && c.length <= 4) b.settings.currency = c;
    }
  }

  function normalize(d) {
    var b = blank();
    if (!isObj(d)) return b;
    readSettings(b, d);
    if (typeof d.lastAmount === 'string') b.lastAmount = d.lastAmount.slice(0, 20);
    if (Array.isArray(d.buckets)) b.buckets = d.buckets.filter(isObj).map(cleanBucket);
    if (Array.isArray(d.paychecks)) b.paychecks = d.paychecks.filter(isObj);
    return b;
  }

  /* v1 had goals + accounts. Goals become buckets at 0% so nothing is lost. */
  function migrate(d) {
    var b = blank();
    if (!isObj(d)) return b;
    readSettings(b, d);
    if (Array.isArray(d.goals)) {
      b.buckets = d.goals.filter(isObj).map(function (g) {
        return cleanBucket({ id: g.id, name: g.name, percent: 0, icon: g.icon, target: g.target, saved: g.saved, date: g.date });
      });
    }
    return b;
  }

  function load() {
    var raw = null;
    try { raw = window.localStorage.getItem(STORE_KEY); } catch (e) { raw = memoryStore; }
    if (raw) {
      try { return normalize(JSON.parse(raw)); } catch (e2) { /* fall through */ }
    }
    try {
      var old = window.localStorage.getItem(OLD_KEY);
      if (old) return migrate(JSON.parse(old));
    } catch (e3) { /* ignore */ }
    return blank();
  }

  function save() {
    var raw = JSON.stringify(state);
    try {
      window.localStorage.setItem(STORE_KEY, raw);
    } catch (e) {
      memoryStore = raw;
      if (!storageWarned) {
        storageWarned = true;
        toast('Heads up: this browser is blocking saving, so changes will be lost when you close it.');
      }
    }
  }

  /* ---------- helpers ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function num(v) {
    var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : NaN;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    n = Number(n) || 0;
    var neg = n < 0;
    n = Math.abs(n);
    var s;
    try { s = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
    catch (e) { s = n.toFixed(2); }
    return (neg ? '-' : '') + state.settings.currency + s;
  }
  function centsMoney(c) { return money(c / 100); }
  function pctText(p) { return (Math.round(p * 100) / 100) + '%'; }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function parseDate(s) {
    var p = String(s || '').split('-');
    if (p.length !== 3) return null;
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function fmtDate(s) {
    var d = parseDate(s);
    if (!d || isNaN(d.getTime())) return s || '';
    try { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch (e) { return s; }
  }
  function daysUntil(s) {
    var t = parseDate(s);
    if (!t || isNaN(t.getTime())) return null;
    var n = new Date();
    n = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    return Math.round((t - n) / 86400000);
  }
  function icon(name, cls) {
    var h = '#i-' + name;
    return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="' + h + '" xlink:href="' + h + '"></use></svg>';
  }
  function bIcon(b) { return ICONS.indexOf(b.icon) >= 0 ? b.icon : 'wallet'; }
  function fv(f, name) { return f.querySelector('[name="' + name + '"]'); }
  function segColor(i) { return SEG[i % SEG.length]; }

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ---------- theme ---------- */
  function effectiveTheme() {
    var t = state.settings.theme;
    if (t === 'light' || t === 'dark') return t;
    try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
    catch (e) { return 'light'; }
  }
  function applyTheme() {
    var t = effectiveTheme();
    document.documentElement.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'dark' ? '#0e1110' : '#f2fbf6');
  }

  /* ---------- the plan: percents + exact split math ---------- */
  function totalPercent(ignoreId) {
    var pb = 0;
    state.buckets.forEach(function (b) { if (b.id !== ignoreId) pb += Math.round(b.percent * 100); });
    return pb / 100;
  }

  /* Works in whole cents so the pieces always add up to the paycheck exactly. */
  function allocate(amount) {
    var cents = Math.round(amount * 100);
    var pbs = state.buckets.map(function (b) { return Math.round(b.percent * 100); });
    var totalPb = pbs.reduce(function (t, x) { return t + x; }, 0);
    var assigned = Math.floor((cents * totalPb + 5000) / 10000);
    var floors = [], fr = [], used = 0;
    pbs.forEach(function (pb, i) {
      var n = cents * pb;
      var f = Math.floor(n / 10000);
      floors.push(f);
      fr.push({ i: i, r: n % 10000 });
      used += f;
    });
    var left = assigned - used;
    fr.sort(function (a, b) { return (b.r - a.r) || (a.i - b.i); });
    for (var k = 0; k < left && k < fr.length; k++) floors[fr[k].i]++;
    return {
      cents: cents,
      totalPb: totalPb,
      assigned: assigned,
      unassigned: cents - assigned,
      rows: state.buckets.map(function (b, i) { return { bucket: b, index: i, cents: floors[i] }; })
    };
  }

  function stackBar(rows, totalPct) {
    var segs = rows.filter(function (r) { return r.bucket.percent > 0; }).map(function (r) {
      return '<i style="width:' + Math.min(100, r.bucket.percent) + '%;background:' + segColor(r.index) + '" title="' + esc(r.bucket.name) + '"></i>';
    }).join('');
    return '<div class="stack-bar' + (totalPct > 100 ? ' over' : '') + '" role="img" aria-label="Plan is ' + pctText(totalPct) + ' assigned">' + segs + '</div>';
  }

  /* ---------- modal ---------- */
  function openModal(title, bodyHtml) {
    closeModal(true);
    lastFocus = document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'backdrop';
    wrap.setAttribute('data-backdrop', '1');
    wrap.innerHTML =
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="sheet-head"><h2>' + esc(title) + '</h2>' +
        '<button type="button" class="icon-btn plain" data-action="close-modal" aria-label="Close">' + icon('close') + '</button></div>' +
        '<div class="sheet-body">' + bodyHtml + '</div></div>';
    document.body.appendChild(wrap);
    document.body.classList.add('modal-open');
    modalEl = wrap;
    if (!('ontouchstart' in window)) {
      var f = wrap.querySelector('input[type="text"],select');
      if (f) { try { f.focus(); } catch (e) {} }
    }
  }
  function closeModal(silent) {
    if (modalEl && modalEl.parentNode) modalEl.parentNode.removeChild(modalEl);
    modalEl = null;
    pending = null;
    document.body.classList.remove('modal-open');
    if (!silent && lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }
  function formError(f, msg) {
    var el = f.querySelector('.form-error');
    if (el) { el.textContent = msg; el.classList.add('show'); }
    else toast(msg);
  }
  function errBox() { return '<div class="form-error" role="alert"></div>'; }

  function confirmBox(text, btnLabel, fn) {
    pending = fn;
    openModal('Are you sure?',
      '<p class="confirm-text">' + esc(text) + '</p>' +
      '<div class="form-actions">' +
        '<button type="button" class="btn btn-line" data-action="close-modal">Cancel</button>' +
        '<button type="button" class="btn btn-solid-danger" data-action="confirm-yes">' + esc(btnLabel) + '</button>' +
      '</div>');
  }

  /* ---------- views ---------- */
  function empty(ic, title, text, btn) {
    return '<div class="card empty"><div class="badge">' + icon(ic) + '</div><h3>' + esc(title) + '</h3><p>' + esc(text) + '</p>' + (btn || '') + '</div>';
  }

  function emptyBuckets() {
    return empty('wallet', 'Make your first bucket',
      'A bucket is a label for where money goes - Rent, Savings, Fun, Trip Fund. Give each one a percent of your paycheck.',
      '<div class="btn-row center">' +
        '<button type="button" class="btn" data-action="new-bucket">' + icon('plus', 'ic-sm') + 'Add a bucket</button>' +
        '<button type="button" class="btn btn-ghost" data-action="template">' + icon('percent', 'ic-sm') + 'Use 50/30/20</button>' +
      '</div>');
  }

  function splitText(a, amount) {
    var lines = ['SAV3R split of ' + money(amount)];
    a.rows.forEach(function (r) {
      lines.push(r.bucket.name + ' (' + pctText(r.bucket.percent) + '): ' + centsMoney(r.cents));
    });
    if (a.unassigned > 0) lines.push('Not assigned: ' + centsMoney(a.unassigned));
    return lines.join('\n');
  }

  function resultsHtml() {
    if (!state.buckets.length) return emptyBuckets();
    var amount = num(ui.amount);
    if (!(amount > 0)) {
      return '<div class="card hint"><div class="badge">' + icon('percent') + '</div>' +
        '<p>Type your paycheck above and your exact split shows up here.</p></div>';
    }
    var a = allocate(amount);
    var totalPct = a.totalPb / 100;
    if (totalPct > 100.0001) {
      return '<div class="card warn-card"><div class="title">Your buckets add up to ' + pctText(totalPct) + '</div>' +
        '<p class="muted" style="margin:6px 0 12px">That is ' + pctText(r2(totalPct - 100)) + ' over 100%. Lower a percent and the split will show up.</p>' +
        '<button type="button" class="btn btn-sm" data-action="nav" data-view="buckets">Fix my buckets</button></div>';
    }
    var h = '<div class="card">' + stackBar(a.rows, totalPct) + '<div class="split-list2">';
    a.rows.forEach(function (r) {
      h += '<div class="split-row">' +
        '<span class="dot" style="background:' + segColor(r.index) + '"></span>' +
        '<div class="badge sm">' + icon(bIcon(r.bucket), 'ic-sm') + '</div>' +
        '<div class="grow"><div class="title">' + esc(r.bucket.name) + '</div>' +
        '<div class="sub">' + pctText(r.bucket.percent) + ' of your paycheck</div></div>' +
        '<div class="amt-col"><div class="amount big-amt">' + centsMoney(r.cents) + '</div><span class="chip">' + pctText(r.bucket.percent) + '</span></div></div>';
    });
    if (a.unassigned > 0) {
      h += '<div class="split-row unassigned"><span class="dot hollow"></span>' +
        '<div class="badge sm">' + icon('coins', 'ic-sm') + '</div>' +
        '<div class="grow"><div class="title">Not assigned</div><div class="sub">' + pctText(r2(100 - totalPct)) + ' has no bucket yet</div></div>' +
        '<div class="amt-col"><div class="amount big-amt">' + centsMoney(a.unassigned) + '</div><span class="chip warn">' + pctText(r2(100 - totalPct)) + '</span></div></div>';
    }
    h += '</div><div class="split-total"><span>Total</span><b>' + money(amount) + '</b></div></div>';
    h += '<div class="btn-row" style="margin-top:12px">' +
      '<button type="button" class="btn" data-action="log-form">' + icon('check', 'ic-sm') + 'Log this paycheck</button>' +
      '<button type="button" class="btn btn-ghost" data-action="copy-split">' + icon('copy', 'ic-sm') + 'Copy split</button></div>' +
      '<p class="muted small" style="margin-top:10px">Logging adds each amount to its bucket’s running total.</p>';
    return h;
  }

  function renderSplit() {
    var h = '<div class="view-head"><h1>Split</h1>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-action="nav" data-view="buckets">' + icon('sliders', 'ic-sm') + 'Edit plan</button></div>';
    h += '<section class="card amount-card"><label class="field" for="amount-input" style="margin:0"><span>Your last paycheck</span>' +
      '<div class="money-input"><b>' + esc(state.settings.currency) + '</b>' +
      '<input id="amount-input" type="text" inputmode="decimal" placeholder="0.00" autocomplete="off" value="' + esc(ui.amount) + '"></div></label></section>';
    h += '<div id="split-results" class="results">' + resultsHtml() + '</div>';
    return h;
  }

  function bucketCard(b, index) {
    var meta = '';
    var tip = '';
    var bar = '';
    if (b.target > 0) {
      var pct = Math.min(100, Math.round(b.saved / b.target * 100));
      var left = Math.max(0, r2(b.target - b.saved));
      bar = '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="goal-nums"><span><b>' + money(b.saved) + '</b> saved</span><span>goal <b>' + money(b.target) + '</b> · ' + pct + '%</span></div>';
      if (b.saved >= b.target) tip = 'Goal reached - nice work!';
      else if (b.date) {
        var d = daysUntil(b.date);
        if (d !== null && d > 0) {
          meta = d + (d === 1 ? ' day' : ' days') + ' to go · ' + fmtDate(b.date);
          tip = 'Save about ' + money(left / Math.max(1, Math.ceil(d / 7))) + ' a week to make it';
        } else if (d !== null) meta = 'Date passed · ' + fmtDate(b.date);
      }
    } else if (b.saved > 0) {
      bar = '<div class="goal-nums"><span>Running total <b>' + money(b.saved) + '</b></span></div>';
    }
    return '<article class="card"><div class="row">' +
      '<span class="dot" style="background:' + segColor(index) + '"></span>' +
      '<div class="badge">' + icon(bIcon(b), 'ic-lg') + '</div>' +
      '<div class="grow"><div class="goal-name">' + esc(b.name) + '</div>' +
      (meta ? '<div class="goal-meta">' + esc(meta) + '</div>' : '') + '</div>' +
      '<div class="goal-pct">' + pctText(b.percent) + '</div></div>' +
      bar + (tip ? '<div class="tip' + (b.saved >= b.target && b.target > 0 ? ' done' : '') + '">' + esc(tip) + '</div>' : '') +
      '<div class="card-actions"><span class="spacer"></span>' +
        '<button type="button" class="icon-btn" data-action="edit-bucket" data-id="' + b.id + '" aria-label="Edit ' + esc(b.name) + '">' + icon('edit', 'ic-sm') + '</button>' +
        '<button type="button" class="icon-btn danger" data-action="ask-delete" data-kind="bucket" data-id="' + b.id + '" aria-label="Delete ' + esc(b.name) + '">' + icon('trash', 'ic-sm') + '</button>' +
      '</div></article>';
  }

  function renderBuckets() {
    var h = '<div class="view-head"><h1>Buckets</h1>' +
      '<button type="button" class="btn" data-action="new-bucket">' + icon('plus', 'ic-sm') + 'Add bucket</button></div>';
    if (!state.buckets.length) return h + emptyBuckets();
    var tp = totalPercent();
    var free = r2(100 - tp);
    var rows = state.buckets.map(function (b, i) { return { bucket: b, index: i }; });
    var status = tp > 100.0001
      ? '<span class="warn-text">' + pctText(r2(tp - 100)) + ' over 100%</span>'
      : free > 0.0001 ? '<span>' + pctText(free) + ' not assigned yet</span>' : '<span class="ok-text">Perfect - 100% assigned</span>';
    h += '<section class="card"><div class="scope-head"><span>Your plan</span><b>' + pctText(tp) + '</b></div>' +
      stackBar(rows, tp) + '<div class="small muted">' + status + '</div></section>';
    h += '<div class="list" style="margin-top:12px">' + state.buckets.map(bucketCard).join('') + '</div>';
    return h;
  }

  function renderHistory() {
    var h = '<div class="view-head"><h1>History</h1></div>';
    if (!state.paychecks.length) {
      return h + empty('calendar', 'No paychecks logged yet', 'When you split a paycheck and tap "Log this paycheck", it is saved here.',
        '<button type="button" class="btn" data-action="nav" data-view="split">' + icon('coins', 'ic-sm') + 'Go to Split</button>');
    }
    h += '<div class="list">' + state.paychecks.map(function (p) {
      var chips = (p.splits || []).map(function (s) {
        return '<span class="chip">' + esc(s.name) + ' ' + money(s.amount) + '</span>';
      }).join('');
      if (p.unassigned > 0) chips += '<span class="chip warn">Not assigned ' + money(p.unassigned) + '</span>';
      return '<article class="card"><div class="row">' +
        '<div class="badge">' + icon('coins') + '</div>' +
        '<div class="grow"><div class="title">' + esc(p.label || 'Paycheck') + '</div><div class="sub">' + esc(fmtDate(p.date)) + '</div></div>' +
        '<div class="amount in">' + money(p.amount) + '</div>' +
        '<button type="button" class="icon-btn danger" data-action="ask-delete" data-kind="paycheck" data-id="' + p.id + '" aria-label="Delete paycheck">' + icon('trash', 'ic-sm') + '</button>' +
        '</div>' + (chips ? '<div class="chips">' + chips + '</div>' : '') + '</article>';
    }).join('') + '</div>';
    return h;
  }

  function renderSettings() {
    var t = state.settings.theme;
    var h = '<div class="view-head"><h1>Settings</h1></div>';
    h += '<section class="card"><div class="title" style="font-weight:800;margin-bottom:10px">Theme</div>' +
      '<div class="seg" role="group" aria-label="Theme">' +
        '<button type="button" data-action="set-theme" data-theme-val="light" aria-pressed="' + (t === 'light') + '">' + icon('sun', 'ic-sm') + 'Light</button>' +
        '<button type="button" data-action="set-theme" data-theme-val="dark" aria-pressed="' + (t === 'dark') + '">' + icon('moon', 'ic-sm') + 'Dark</button>' +
        '<button type="button" data-action="set-theme" data-theme-val="auto" aria-pressed="' + (t === 'auto') + '">Auto</button>' +
      '</div></section>';
    h += '<section class="card" style="margin-top:12px"><label class="field" style="margin:0"><span>Currency symbol</span>' +
      '<select id="currency-select" aria-label="Currency symbol">' +
      CURRENCIES.map(function (c) { return '<option value="' + esc(c) + '"' + (c === state.settings.currency ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') +
      '</select></label></section>';
    h += '<section class="card" style="margin-top:12px"><div class="title" style="font-weight:800;margin-bottom:4px">Your data</div>' +
      '<p class="muted small" style="margin-bottom:12px">Everything stays on this device. Make a backup file now and then.</p>' +
      '<div class="btn-row">' +
        '<button type="button" class="btn btn-ghost" data-action="export">' + icon('download', 'ic-sm') + 'Export backup</button>' +
        '<label class="btn btn-ghost" for="import-file" role="button" tabindex="0">' + icon('upload', 'ic-sm') + 'Import backup</label>' +
        '<input id="import-file" class="sr-only" type="file" accept="application/json,.json" tabindex="-1">' +
        '<button type="button" class="btn btn-danger" data-action="ask-delete" data-kind="everything" data-id="all">' + icon('trash', 'ic-sm') + 'Erase everything</button>' +
      '</div></section>';
    h += '<p class="muted small" style="text-align:center;margin-top:18px">SAV3R v2 · made to keep your money growing</p>';
    return h;
  }

  function render() {
    var el = document.getElementById('app');
    if (!el) return;
    var views = { split: renderSplit, buckets: renderBuckets, history: renderHistory, settings: renderSettings };
    var fn = views[ui.view] || renderSplit;
    el.innerHTML = fn();
    var btns = document.querySelectorAll('.nav button');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute('data-view') === ui.view) btns[i].setAttribute('aria-current', 'page');
      else btns[i].removeAttribute('aria-current');
    }
  }

  function go(view) {
    ui.view = view;
    render();
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  /* ---------- forms: open ---------- */
  function openBucketForm(id) {
    var b = id ? byId(state.buckets, id) : null;
    if (id && !b) return;
    var cur = b ? bIcon(b) : 'wallet';
    var free = r2(100 - totalPercent(b ? b.id : null));
    var picks = ICONS.map(function (n) {
      return '<label class="icon-pick"><input type="radio" name="icon" value="' + n + '"' + (n === cur ? ' checked' : '') + ' aria-label="' + esc(ICON_NAMES[n]) + '"><span>' + icon(n) + '</span></label>';
    }).join('');
    openModal(b ? 'Edit bucket' : 'New bucket',
      '<form data-form="bucket" novalidate>' + errBox() +
        '<input type="hidden" name="id" value="' + (b ? b.id : '') + '">' +
        '<label class="field"><span>Bucket name</span><input type="text" name="name" maxlength="40" placeholder="e.g. Rent, Savings, Beach Trip" autocomplete="off" value="' + esc(b ? b.name : '') + '"></label>' +
        '<label class="field"><span>Percent of each paycheck</span><input type="text" name="percent" inputmode="decimal" placeholder="e.g. 20" autocomplete="off" value="' + (b ? b.percent : '') + '"></label>' +
        '<p class="hint-line">' + (free > 0 ? pctText(free) + ' of your paycheck is still unassigned.' : 'All 100% is assigned - lower another bucket first.') + '</p>' +
        '<div class="field"><span>Pick an icon</span><div class="icon-grid">' + picks + '</div></div>' +
        '<details class="more"' + (b && (b.target > 0 || b.date) ? ' open' : '') + '><summary>Saving for something? (optional)</summary>' +
          '<div class="field-row" style="margin-top:12px">' +
            '<label class="field"><span>Goal amount</span><input type="text" name="target" inputmode="decimal" placeholder="0.00" autocomplete="off" value="' + (b && b.target > 0 ? b.target : '') + '"></label>' +
            '<label class="field"><span>Saved so far</span><input type="text" name="saved" inputmode="decimal" placeholder="0.00" autocomplete="off" value="' + (b && b.saved > 0 ? b.saved : '') + '"></label>' +
          '</div>' +
          '<label class="field"><span>Event date</span><input type="date" name="date" value="' + esc(b && b.date ? b.date : '') + '"></label>' +
        '</details>' +
        '<div class="form-actions"><button type="button" class="btn btn-line" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn">' + icon('check', 'ic-sm') + 'Save</button></div>' +
      '</form>');
  }

  function openLogForm() {
    var amount = num(ui.amount);
    if (!(amount > 0) || !state.buckets.length) return;
    openModal('Log this paycheck',
      '<form data-form="log" novalidate>' + errBox() +
        '<p class="muted small" style="margin-bottom:12px">Adds each amount to its bucket’s running total and saves it in History.</p>' +
        '<div class="split-box"><h3>PAYCHECK</h3><div class="split-free" style="border:0;margin:0;padding:0"><span>Amount</span><b>' + money(amount) + '</b></div></div>' +
        '<label class="field"><span>Label (optional)</span><input type="text" name="label" maxlength="40" placeholder="e.g. Oct 15 paycheck" autocomplete="off"></label>' +
        '<label class="field"><span>Date</span><input type="date" name="date" value="' + today() + '"></label>' +
        '<div class="form-actions"><button type="button" class="btn btn-line" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn">' + icon('check', 'ic-sm') + 'Log it</button></div>' +
      '</form>');
  }

  /* ---------- forms: submit ---------- */
  var FORMS = {
    bucket: function (f) {
      var id = fv(f, 'id').value;
      var name = fv(f, 'name').value.trim();
      var pc = num(fv(f, 'percent').value);
      var pick = f.querySelector('input[name="icon"]:checked');
      var ic = pick ? pick.value : 'wallet';
      var tRaw = fv(f, 'target').value.trim();
      var sRaw = fv(f, 'saved').value.trim();
      var target = tRaw === '' ? 0 : num(tRaw);
      var saved = sRaw === '' ? 0 : num(sRaw);
      var date = fv(f, 'date').value;
      if (!name) return formError(f, 'Give your bucket a name.');
      if (!(pc >= 0) || pc > 100 || isNaN(pc)) return formError(f, 'Enter a percent between 0 and 100.');
      pc = Math.round(pc * 100) / 100;
      var others = totalPercent(id || null);
      if (others + pc > 100.0001) {
        return formError(f, 'That makes ' + pctText(r2(others + pc)) + '. Only ' + pctText(r2(Math.max(0, 100 - others))) + ' is left to give out.');
      }
      if (isNaN(target) || target < 0) return formError(f, 'Goal amount must be zero or more.');
      if (isNaN(saved) || saved < 0) return formError(f, 'Saved so far must be zero or more.');
      if (id) {
        var b = byId(state.buckets, id);
        if (!b) return closeModal();
        b.name = name; b.percent = pc; b.icon = ic; b.target = r2(target); b.saved = r2(saved); b.date = date || '';
        toast('Bucket updated');
      } else {
        state.buckets.push({ id: uid(), name: name, percent: pc, icon: ic, target: r2(target), saved: r2(saved), date: date || '' });
        toast('Bucket added');
      }
      save(); closeModal(); render();
    },

    log: function (f) {
      var amount = num(ui.amount);
      if (!(amount > 0) || !state.buckets.length) return closeModal();
      var a = allocate(amount);
      if (a.totalPb > 10000) return formError(f, 'Your buckets add up to more than 100%.');
      var splits = [];
      a.rows.forEach(function (r) {
        var amt = r.cents / 100;
        splits.push({ bucketId: r.bucket.id, name: r.bucket.name, percent: r.bucket.percent, amount: amt });
        r.bucket.saved = r2((Number(r.bucket.saved) || 0) + amt);
      });
      state.paychecks.unshift({
        id: uid(),
        date: fv(f, 'date').value || today(),
        label: fv(f, 'label').value.trim(),
        amount: r2(a.cents / 100),
        unassigned: a.unassigned / 100,
        splits: splits
      });
      save(); closeModal(); render();
      toast('Paycheck logged');
    }
  };

  /* ---------- delete / reset / templates ---------- */
  function askDelete(kind, id) {
    if (kind === 'bucket') {
      var b = byId(state.buckets, id); if (!b) return;
      confirmBox('Delete the "' + b.name + '" bucket? Its ' + pctText(b.percent) + ' becomes unassigned. Past paychecks stay in History.', 'Delete bucket', function () {
        state.buckets = state.buckets.filter(function (x) { return x.id !== id; });
      });
    } else if (kind === 'paycheck') {
      var p = byId(state.paychecks, id); if (!p) return;
      confirmBox('Delete this ' + money(p.amount) + ' paycheck? Its amounts will be taken back out of the bucket totals.', 'Delete paycheck', function () {
        (p.splits || []).forEach(function (s) {
          var bk = byId(state.buckets, s.bucketId);
          if (bk) bk.saved = Math.max(0, r2((Number(bk.saved) || 0) - s.amount));
        });
        state.paychecks = state.paychecks.filter(function (x) { return x.id !== id; });
      });
    } else if (kind === 'everything') {
      confirmBox('Erase all buckets and history from this device? This cannot be undone.', 'Erase everything', function () {
        var keep = state.settings;
        state = blank();
        state.settings = keep;
        ui.amount = '';
      });
    }
  }

  function addTemplate() {
    if (state.buckets.length) return;
    state.buckets.push(
      { id: uid(), name: 'Needs', percent: 50, icon: 'home', target: 0, saved: 0, date: '' },
      { id: uid(), name: 'Wants', percent: 30, icon: 'star', target: 0, saved: 0, date: '' },
      { id: uid(), name: 'Savings', percent: 20, icon: 'piggy', target: 0, saved: 0, date: '' }
    );
    save(); render();
    toast('Added 50/30/20 - rename or change anything');
  }

  function fallbackCopy(t) {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(ta);
    ta.select();
    try { ta.setSelectionRange(0, 99999); document.execCommand('copy'); toast('Copied'); }
    catch (e) { toast('Could not copy on this device.'); }
    document.body.removeChild(ta);
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast('Copied'); }, function () { fallbackCopy(t); });
    } else fallbackCopy(t);
  }

  function exportData() {
    try {
      var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'sav3r-backup-' + today() + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 800);
      toast('Backup file created');
    } catch (e) {
      toast('Could not create the backup on this device.');
    }
  }

  function importData(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        if (!isObj(data)) throw new Error('bad file');
        if (Array.isArray(data.buckets)) state = normalize(data);
        else if (Array.isArray(data.goals)) state = migrate(data);
        else throw new Error('bad file');
        ui.amount = state.lastAmount || '';
        save(); applyTheme(); render();
        toast('Backup imported');
      } catch (e) {
        toast('That file is not a SAV3R backup.');
      }
    };
    reader.onerror = function () { toast('Could not read that file.'); };
    reader.readAsText(file);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('data-backdrop')) { closeModal(); return; }
    var el = t && t.closest ? t.closest('[data-action]') : null;
    if (!el) return;
    var a = el.getAttribute('data-action');
    var id = el.getAttribute('data-id');
    switch (a) {
      case 'nav': go(el.getAttribute('data-view') || 'split'); break;
      case 'toggle-theme':
        state.settings.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
        save(); applyTheme(); if (ui.view === 'settings') render();
        break;
      case 'set-theme':
        state.settings.theme = el.getAttribute('data-theme-val');
        save(); applyTheme(); render();
        break;
      case 'new-bucket': openBucketForm(); break;
      case 'edit-bucket': openBucketForm(id); break;
      case 'template': addTemplate(); break;
      case 'log-form': openLogForm(); break;
      case 'copy-split':
        var amt = num(ui.amount);
        if (amt > 0 && state.buckets.length) copyText(splitText(allocate(amt), amt));
        break;
      case 'ask-delete': askDelete(el.getAttribute('data-kind'), id); break;
      case 'confirm-yes':
        if (pending) {
          var fn = pending;
          pending = null;
          fn();
          save(); closeModal(true); render();
          toast('Done');
        }
        break;
      case 'close-modal': closeModal(); break;
      case 'export': exportData(); break;
    }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    var kind = f && f.getAttribute ? f.getAttribute('data-form') : null;
    if (!kind) return;
    e.preventDefault();
    if (FORMS[kind]) FORMS[kind](f);
  });

  function onFieldChange(e) {
    var t = e.target;
    if (!t) return;
    if (t.id === 'amount-input') {
      ui.amount = t.value;
      state.lastAmount = t.value.slice(0, 20);
      save();
      var box = document.getElementById('split-results');
      if (box) box.innerHTML = resultsHtml();
      return;
    }
    if (t.id === 'currency-select' && e.type === 'change') {
      state.settings.currency = t.value;
      save(); render();
      return;
    }
    if (t.id === 'import-file' && e.type === 'change') {
      importData(t.files && t.files[0]);
      t.value = '';
    }
  }
  document.addEventListener('input', onFieldChange);
  document.addEventListener('change', onFieldChange);

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modalEl) { closeModal(); return; }
    /* lets the Import label work from the keyboard */
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.getAttribute && e.target.getAttribute('for') === 'import-file') {
      e.preventDefault();
      var inp = document.getElementById('import-file');
      if (inp) inp.click();
    }
  });

  try {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onMq = function () { if (state.settings.theme === 'auto') applyTheme(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else if (mq.addListener) mq.addListener(onMq);
  } catch (e) {}

  /* ---------- go ---------- */
  applyTheme();
  render();
})();
