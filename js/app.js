/* ============================================================
   SAV3R v1 - app logic
   - Everything is stored on the device (localStorage).
   - All icons come from the hard-coded sprite in index.html.
   - One delegated click handler, so every button works the same
     with a mouse, a finger, or a keyboard.
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'sav3r.v1';
  var ICONS = ['piggy', 'plane', 'gift', 'home', 'car', 'heart', 'cap', 'star', 'target', 'calendar'];
  var ICON_NAMES = {
    piggy: 'Piggy bank', plane: 'Trip', gift: 'Gift', home: 'Home', car: 'Car',
    heart: 'Heart', cap: 'School', star: 'Star', target: 'Target', calendar: 'Event'
  };
  var CURRENCIES = ['$', '€', '£', '¥', '₹', '₩', '₱', 'R$', 'C$', 'A$', 'MX$', 'kr', 'zł', 'Fr'];
  var ACCOUNT_TYPES = ['Checking', 'Savings', 'Cash', 'Other'];

  var memoryStore = null;
  var storageWarned = false;

  var state = load();
  var ui = { view: 'home' };
  var modalEl = null;
  var pending = null;
  var lastFocus = null;
  var toastTimer = null;

  /* ---------- storage ---------- */
  function blank() {
    return {
      v: 1,
      settings: { theme: 'auto', currency: '$' },
      accounts: [], goals: [], rules: [], paychecks: [], activity: []
    };
  }

  function normalize(d) {
    var b = blank();
    if (!d || typeof d !== 'object') return b;
    if (d.settings && typeof d.settings === 'object') {
      var t = d.settings.theme;
      if (t === 'light' || t === 'dark' || t === 'auto') b.settings.theme = t;
      var c = d.settings.currency;
      if (typeof c === 'string' && c.length > 0 && c.length <= 4) b.settings.currency = c;
    }
    ['accounts', 'goals', 'rules', 'paychecks', 'activity'].forEach(function (k) {
      if (Array.isArray(d[k])) b[k] = d[k].filter(function (x) { return x && typeof x === 'object'; });
    });
    return b;
  }

  function load() {
    var raw = null;
    try { raw = window.localStorage.getItem(STORE_KEY); } catch (e) { raw = memoryStore; }
    if (raw) {
      try { return normalize(JSON.parse(raw)); } catch (e2) { /* fall through */ }
    }
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
  function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
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
  function pctText(p) { return (Math.round(p * 100) / 100) + '%'; }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function sumBy(list, key) {
    return list.reduce(function (t, x) { return t + (Number(x[key]) || 0); }, 0);
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
  function fmtTs(ts) {
    var d = new Date(ts);
    try { return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    catch (e) { return ''; }
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
  function goalIcon(g) { return ICONS.indexOf(g.icon) >= 0 ? g.icon : 'target'; }
  function fv(f, name) { return f.querySelector('[name="' + name + '"]'); }

  function log(text, amount, kind) {
    state.activity.unshift({ id: uid(), ts: Date.now(), text: text, amount: amount || 0, kind: kind || 'info' });
    if (state.activity.length > 60) state.activity.length = 60;
  }

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

  /* ---------- savings rules ---------- */
  function rulesFor(accountId) {
    return state.rules.filter(function (r) { return r.source === 'all' || r.source === accountId; });
  }
  function scopeTotal(accountId) {
    return rulesFor(accountId).reduce(function (t, r) { return t + (Number(r.percent) || 0); }, 0);
  }
  function splitsFor(amount, accountId) {
    var out = [];
    rulesFor(accountId).forEach(function (r) {
      var g = byId(state.goals, r.goalId);
      if (!g) return;
      var a = r2(amount * (Number(r.percent) || 0) / 100);
      if (a > 0) out.push({ goalId: g.id, goalName: g.name, amount: a, percent: r.percent });
    });
    return out;
  }
  function scopeName(source) {
    if (source === 'all') return 'All paychecks';
    var a = byId(state.accounts, source);
    return a ? a.name : 'Removed account';
  }
  /* Returns the scope that would go over 100%, or null if fine. */
  function ruleOverflow(candidate, ignoreId) {
    var rules = state.rules.filter(function (r) { return r.id !== ignoreId; }).concat([candidate]);
    var scopes;
    if (candidate.source === 'all') {
      scopes = state.accounts.length ? state.accounts.map(function (a) { return a.id; }) : ['all'];
    } else {
      scopes = [candidate.source];
    }
    for (var i = 0; i < scopes.length; i++) {
      var sc = scopes[i];
      var total = rules.filter(function (r) { return r.source === 'all' || r.source === sc; })
        .reduce(function (t, r) { return t + (Number(r.percent) || 0); }, 0);
      if (total > 100.0001) return sc;
    }
    return null;
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

  function goalCard(g, compact) {
    var target = Number(g.target) || 0;
    var saved = Number(g.saved) || 0;
    var pct = target > 0 ? Math.min(100, Math.round(saved / target * 100)) : 0;
    var left = Math.max(0, r2(target - saved));
    var done = target > 0 && saved >= target;
    var meta = '';
    var tip = '';
    if (g.date) {
      var d = daysUntil(g.date);
      if (d !== null) {
        if (d < 0) meta = 'Was ' + fmtDate(g.date);
        else if (d === 0) meta = 'Today!';
        else meta = d + (d === 1 ? ' day' : ' days') + ' to go · ' + fmtDate(g.date);
        if (!done && d > 0) {
          var weeks = Math.max(1, Math.ceil(d / 7));
          tip = 'Save about ' + money(left / weeks) + ' a week to make it';
        }
      }
    }
    if (done) tip = 'Goal reached - nice work!';
    var html =
      '<article class="card goal">' +
        '<div class="goal-top">' +
          '<div class="badge">' + icon(goalIcon(g), 'ic-lg') + '</div>' +
          '<div class="grow"><div class="goal-name">' + esc(g.name) + '</div>' +
          (meta ? '<div class="goal-meta">' + esc(meta) + '</div>' : '') + '</div>' +
          '<div class="goal-pct">' + pct + '%</div>' +
        '</div>' +
        '<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="goal-nums"><span><b>' + money(saved) + '</b> saved</span><span>of <b>' + money(target) + '</b></span></div>' +
        (tip ? '<div class="tip' + (done ? ' done' : '') + '">' + esc(tip) + '</div>' : '');
    if (!compact) {
      html +=
        '<div class="card-actions">' +
          '<button type="button" class="btn btn-sm" data-action="goal-money" data-mode="add" data-id="' + g.id + '">' + icon('plus', 'ic-sm') + 'Add</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" data-action="goal-money" data-mode="take" data-id="' + g.id + '">' + icon('minus', 'ic-sm') + 'Take out</button>' +
          '<span class="spacer"></span>' +
          '<button type="button" class="icon-btn" data-action="edit-goal" data-id="' + g.id + '" aria-label="Edit ' + esc(g.name) + '">' + icon('edit', 'ic-sm') + '</button>' +
          '<button type="button" class="icon-btn danger" data-action="ask-delete" data-kind="goal" data-id="' + g.id + '" aria-label="Delete ' + esc(g.name) + '">' + icon('trash', 'ic-sm') + '</button>' +
        '</div>';
    }
    return html + '</article>';
  }

  function renderHome() {
    var total = sumBy(state.accounts, 'balance');
    var set = sumBy(state.goals, 'saved');
    var free = r2(total - set);
    var h = '';
    h += '<section class="card hero">' +
      '<p class="eyebrow">Free to spend</p>' +
      '<p class="big">' + money(free) + '</p>' +
      '<div class="hero-row">' +
        '<div><span>In accounts</span><b>' + money(total) + '</b></div>' +
        '<div><span>Set aside for goals</span><b>' + money(set) + '</b></div>' +
      '</div></section>';
    h += '<div class="quick">' +
      '<button type="button" data-action="paycheck-form">' + icon('coins', 'ic-lg') + 'Log paycheck</button>' +
      '<button type="button" data-action="new-goal">' + icon('target', 'ic-lg') + 'New goal</button>' +
      '<button type="button" data-action="new-account">' + icon('wallet', 'ic-lg') + 'Add account</button>' +
      '</div>';

    h += '<div class="section-title"><h2>Your goals</h2>' +
      (state.goals.length > 3 ? '<button type="button" class="btn btn-sm btn-ghost" data-action="nav" data-view="goals">See all</button>' : '') + '</div>';
    if (!state.goals.length) {
      h += empty('piggy', 'No goals yet', 'Name something you are saving for - a trip, a concert, a new laptop.',
        '<button type="button" class="btn" data-action="new-goal">' + icon('plus', 'ic-sm') + 'Create a goal</button>');
    } else {
      h += '<div class="list">' + state.goals.slice(0, 3).map(function (g) { return goalCard(g, true); }).join('') + '</div>';
    }

    h += '<div class="section-title"><h2>Recent activity</h2></div>';
    if (!state.activity.length) {
      h += '<div class="card"><p class="muted">Nothing yet. Log a paycheck or add money to a goal and it shows up here.</p></div>';
    } else {
      h += '<div class="card"><ul class="activity">' + state.activity.slice(0, 6).map(activityItem).join('') + '</ul></div>';
    }
    return h;
  }

  function activityItem(a) {
    var out = a.kind === 'out';
    var ic = a.kind === 'in' ? 'arrow-down' : out ? 'arrow-up' : 'sparkle';
    var amt = a.amount ? '<span class="amount ' + (out ? 'out' : 'in') + '">' + (out ? '-' : '+') + money(a.amount) + '</span>' : '';
    return '<li><div class="badge ' + (out ? 'out' : '') + '">' + icon(ic, 'ic-sm') + '</div>' +
      '<div class="grow"><div class="title">' + esc(a.text) + '</div><div class="sub">' + esc(fmtTs(a.ts)) + '</div></div>' + amt + '</li>';
  }

  function renderGoals() {
    var h = '<div class="view-head"><h1>Goals</h1>' +
      '<button type="button" class="btn" data-action="new-goal">' + icon('plus', 'ic-sm') + 'New goal</button></div>';
    if (!state.goals.length) {
      h += empty('piggy', 'Start your first goal', 'Give it any name you like - Beach Weekend, Concert Night, Emergency Fund.',
        '<button type="button" class="btn" data-action="new-goal">' + icon('plus', 'ic-sm') + 'Create a goal</button>');
    } else {
      h += '<div class="list">' + state.goals.map(function (g) { return goalCard(g, false); }).join('') + '</div>';
    }
    return h;
  }

  function renderAccounts() {
    var h = '<div class="view-head"><h1>Accounts</h1>' +
      '<button type="button" class="btn" data-action="new-account">' + icon('plus', 'ic-sm') + 'Add account</button></div>';
    if (!state.accounts.length) {
      return h + empty('wallet', 'No accounts yet', 'Add a checking, savings or cash account to start tracking.',
        '<button type="button" class="btn" data-action="new-account">' + icon('plus', 'ic-sm') + 'Add an account</button>');
    }
    var total = sumBy(state.accounts, 'balance');
    h += '<div class="card" style="margin-bottom:12px"><div class="row"><div class="grow"><div class="sub">Total in all accounts</div></div><div class="amount">' + money(total) + '</div></div></div>';
    h += '<div class="list">' + state.accounts.map(function (a) {
      var bal = Number(a.balance) || 0;
      return '<article class="card"><div class="row">' +
        '<div class="badge">' + icon('wallet') + '</div>' +
        '<div class="grow"><div class="title">' + esc(a.name) + '</div><div class="sub">' + esc(a.type || 'Account') + '</div></div>' +
        '<div class="amount' + (bal < 0 ? ' neg' : '') + '">' + money(bal) + '</div></div>' +
        '<div class="card-actions"><span class="spacer"></span>' +
          '<button type="button" class="icon-btn" data-action="edit-account" data-id="' + a.id + '" aria-label="Edit ' + esc(a.name) + '">' + icon('edit', 'ic-sm') + '</button>' +
          '<button type="button" class="icon-btn danger" data-action="ask-delete" data-kind="account" data-id="' + a.id + '" aria-label="Delete ' + esc(a.name) + '">' + icon('trash', 'ic-sm') + '</button>' +
        '</div></article>';
    }).join('') + '</div>';
    return h;
  }

  function renderPay() {
    var h = '<div class="view-head"><h1>Paychecks</h1>' +
      '<button type="button" class="btn" data-action="paycheck-form">' + icon('plus', 'ic-sm') + 'Log paycheck</button></div>';

    /* rules */
    h += '<div class="section-title"><h2>Savings rules</h2>' +
      '<button type="button" class="btn btn-sm btn-ghost" data-action="new-rule">' + icon('percent', 'ic-sm') + 'Add rule</button></div>';
    if (!state.rules.length) {
      h += empty('percent', 'No rules yet', 'Pick a percent of every paycheck - or of one account’s paychecks - to send to a goal automatically.',
        '<button type="button" class="btn" data-action="new-rule">' + icon('plus', 'ic-sm') + 'Add a rule</button>');
    } else {
      h += '<div class="list">' + state.rules.map(function (r) {
        var g = byId(state.goals, r.goalId);
        return '<article class="card"><div class="row">' +
          '<div class="badge">' + icon(g ? goalIcon(g) : 'target') + '</div>' +
          '<div class="grow"><div class="title">' + esc(g ? g.name : 'Removed goal') + '</div><div class="sub">' + esc(scopeName(r.source)) + '</div></div>' +
          '<div class="amount in">' + pctText(Number(r.percent) || 0) + '</div>' +
          '<button type="button" class="icon-btn" data-action="edit-rule" data-id="' + r.id + '" aria-label="Edit rule">' + icon('edit', 'ic-sm') + '</button>' +
          '<button type="button" class="icon-btn danger" data-action="ask-delete" data-kind="rule" data-id="' + r.id + '" aria-label="Delete rule">' + icon('trash', 'ic-sm') + '</button>' +
        '</div></article>';
      }).join('') + '</div>';

      var scopes = state.accounts.length ? state.accounts.map(function (a) { return { id: a.id, name: a.name }; }) : [{ id: 'all', name: 'All paychecks' }];
      h += '<div class="card" style="margin-top:12px"><div class="small muted" style="margin-bottom:8px;font-weight:800">HOW EACH PAYCHECK SPLITS</div>' +
        scopes.map(function (s) {
          var t = scopeTotal(s.id);
          var w = Math.min(100, t);
          return '<div class="scope"><div class="scope-head"><span>' + esc(s.name) + '</span><span class="' + (t > 100 ? 'warn-text' : '') + '">' + pctText(t) + ' saved · ' + pctText(Math.max(0, 100 - t)) + ' free</span></div>' +
            '<div class="bar' + (t > 100 ? ' over' : '') + '"><i style="width:' + w + '%"></i></div></div>';
        }).join('') + '</div>';
    }

    /* history */
    h += '<div class="section-title"><h2>Paycheck history</h2></div>';
    if (!state.paychecks.length) {
      h += '<div class="card"><p class="muted">No paychecks logged yet.</p></div>';
    } else {
      h += '<div class="list">' + state.paychecks.map(function (p) {
        var chips = (p.splits || []).map(function (s) {
          return '<span class="chip">' + esc(s.goalName) + ' ' + money(s.amount) + '</span>';
        }).join('');
        var acc = byId(state.accounts, p.accountId);
        return '<article class="card"><div class="row">' +
          '<div class="badge">' + icon('coins') + '</div>' +
          '<div class="grow"><div class="title">' + esc(p.label || 'Paycheck') + '</div><div class="sub">' + esc(fmtDate(p.date)) + ' · ' + esc(acc ? acc.name : (p.accountName || 'Removed account')) + '</div></div>' +
          '<div class="amount in">' + money(p.amount) + '</div>' +
          '<button type="button" class="icon-btn danger" data-action="ask-delete" data-kind="paycheck" data-id="' + p.id + '" aria-label="Delete paycheck">' + icon('trash', 'ic-sm') + '</button>' +
        '</div>' + (chips ? '<div class="chips">' + chips + '</div>' : '') + '</article>';
      }).join('') + '</div>';
    }
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
        '<button type="button" class="btn btn-line" data-action="sample">' + icon('sparkle', 'ic-sm') + 'Add sample data</button>' +
        '<button type="button" class="btn btn-danger" data-action="ask-delete" data-kind="everything" data-id="all">' + icon('trash', 'ic-sm') + 'Erase everything</button>' +
      '</div></section>';
    h += '<p class="muted small" style="text-align:center;margin-top:18px">SAV3R v1 · made to keep your money growing</p>';
    return h;
  }

  function render() {
    var el = document.getElementById('app');
    if (!el) return;
    var views = { home: renderHome, goals: renderGoals, accounts: renderAccounts, pay: renderPay, settings: renderSettings };
    var fn = views[ui.view] || renderHome;
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
  function openGoalForm(id) {
    var g = id ? byId(state.goals, id) : null;
    if (id && !g) return;
    var cur = g ? goalIcon(g) : 'piggy';
    var picks = ICONS.map(function (n) {
      return '<label class="icon-pick"><input type="radio" name="icon" value="' + n + '"' + (n === cur ? ' checked' : '') + ' aria-label="' + esc(ICON_NAMES[n]) + '"><span>' + icon(n) + '</span></label>';
    }).join('');
    openModal(g ? 'Edit goal' : 'New goal',
      '<form data-form="goal" novalidate>' + errBox() +
        '<input type="hidden" name="id" value="' + (g ? g.id : '') + '">' +
        '<label class="field"><span>Goal name</span><input type="text" name="name" maxlength="40" placeholder="e.g. Beach Weekend" autocomplete="off" value="' + esc(g ? g.name : '') + '"></label>' +
        '<div class="field-row">' +
          '<label class="field"><span>Target amount</span><input type="text" name="target" inputmode="decimal" placeholder="0.00" autocomplete="off" value="' + (g ? g.target : '') + '"></label>' +
          '<label class="field"><span>Saved so far</span><input type="text" name="saved" inputmode="decimal" placeholder="0.00" autocomplete="off" value="' + (g ? g.saved : '') + '"></label>' +
        '</div>' +
        '<label class="field"><span>Event date (optional)</span><input type="date" name="date" value="' + esc(g && g.date ? g.date : '') + '"></label>' +
        '<div class="field"><span>Pick an icon</span><div class="icon-grid">' + picks + '</div></div>' +
        '<div class="form-actions"><button type="button" class="btn btn-line" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn">' + icon('check', 'ic-sm') + 'Save</button></div>' +
      '</form>');
  }

  function openGoalMoney(id, mode) {
    var g = byId(state.goals, id);
    if (!g) return;
    var add = mode !== 'take';
    openModal((add ? 'Add to ' : 'Take from ') + g.name,
      '<form data-form="goal-money" novalidate>' + errBox() +
        '<input type="hidden" name="id" value="' + g.id + '"><input type="hidden" name="mode" value="' + (add ? 'add' : 'take') + '">' +
        '<p class="muted small" style="margin-bottom:12px">Currently saved: <b>' + money(g.saved) + '</b></p>' +
        '<label class="field"><span>Amount</span><input type="text" name="amount" inputmode="decimal" placeholder="0.00" autocomplete="off"></label>' +
        '<div class="form-actions"><button type="button" class="btn btn-line" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn">' + icon(add ? 'plus' : 'minus', 'ic-sm') + (add ? 'Add' : 'Take out') + '</button></div>' +
      '</form>');
  }

  function openAccountForm(id) {
    var a = id ? byId(state.accounts, id) : null;
    if (id && !a) return;
    var curType = a ? a.type : 'Checking';
    openModal(a ? 'Edit account' : 'Add account',
      '<form data-form="account" novalidate>' + errBox() +
        '<input type="hidden" name="id" value="' + (a ? a.id : '') + '">' +
        '<label class="field"><span>Account name</span><input type="text" name="name" maxlength="40" placeholder="e.g. Main Checking" autocomplete="off" value="' + esc(a ? a.name : '') + '"></label>' +
        '<label class="field"><span>Type</span><select name="type">' +
          ACCOUNT_TYPES.map(function (t) { return '<option' + (t === curType ? ' selected' : '') + '>' + t + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="field"><span>Current balance</span><input type="text" name="balance" inputmode="decimal" placeholder="0.00" autocomplete="off" value="' + (a ? a.balance : '') + '"></label>' +
        '<div class="form-actions"><button type="button" class="btn btn-line" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn">' + icon('check', 'ic-sm') + 'Save</button></div>' +
      '</form>');
  }

  function openPaycheckForm() {
    if (!state.accounts.length) {
      toast('Add an account first, then log your paycheck.');
      openAccountForm();
      return;
    }
    openModal('Log a paycheck',
      '<form data-form="paycheck" novalidate>' + errBox() +
        '<label class="field"><span>Label (optional)</span><input type="text" name="label" maxlength="40" placeholder="e.g. Work paycheck" autocomplete="off"></label>' +
        '<div class="field-row">' +
          '<label class="field"><span>Amount</span><input type="text" name="amount" inputmode="decimal" placeholder="0.00" autocomplete="off"></label>' +
          '<label class="field"><span>Date</span><input type="date" name="date" value="' + today() + '"></label>' +
        '</div>' +
        '<label class="field"><span>Deposit into</span><select name="account">' +
          state.accounts.map(function (a) { return '<option value="' + a.id + '">' + esc(a.name) + '</option>'; }).join('') +
        '</select></label>' +
        '<div class="split-box"><h3>AUTO SPLIT</h3><div id="pay-preview"></div></div>' +
        '<div class="form-actions"><button type="button" class="btn btn-line" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn">' + icon('check', 'ic-sm') + 'Log it</button></div>' +
      '</form>');
    var f = modalEl && modalEl.querySelector('form');
    if (f) updatePaycheckPreview(f);
  }

  function updatePaycheckPreview(f) {
    var box = f.querySelector('#pay-preview');
    if (!box) return;
    var amt = num(fv(f, 'amount').value);
    var acc = fv(f, 'account').value;
    if (!(amt > 0)) { box.innerHTML = '<p class="muted small">Enter an amount to see how it splits.</p>'; return; }
    var sp = splitsFor(amt, acc);
    var tot = r2(sp.reduce(function (t, s) { return t + s.amount; }, 0));
    var rows = sp.map(function (s) {
      return '<li><span>' + esc(s.goalName) + ' <em>' + pctText(Number(s.percent)) + '</em></span><b>' + money(s.amount) + '</b></li>';
    }).join('');
    box.innerHTML = (rows ? '<ul class="split-list">' + rows + '</ul>' : '<p class="muted small">No savings rules apply yet, so all of it stays free.</p>') +
      '<div class="split-free"><span>Stays free to spend</span><b>' + money(r2(amt - tot)) + '</b></div>';
  }

  function openRuleForm(id) {
    if (!state.goals.length) {
      toast('Create a goal first, then add a rule for it.');
      openGoalForm();
      return;
    }
    var r = id ? byId(state.rules, id) : null;
    if (id && !r) return;
    openModal(r ? 'Edit rule' : 'New savings rule',
      '<form data-form="rule" novalidate>' + errBox() +
        '<input type="hidden" name="id" value="' + (r ? r.id : '') + '">' +
        '<label class="field"><span>Send money to</span><select name="goal">' +
          state.goals.map(function (g) { return '<option value="' + g.id + '"' + (r && r.goalId === g.id ? ' selected' : '') + '>' + esc(g.name) + '</option>'; }).join('') +
        '</select></label>' +
        '<label class="field"><span>Percent of each paycheck</span><input type="text" name="percent" inputmode="decimal" placeholder="e.g. 10" autocomplete="off" value="' + (r ? r.percent : '') + '"></label>' +
        '<label class="field"><span>Applies to</span><select name="source">' +
          '<option value="all"' + (!r || r.source === 'all' ? ' selected' : '') + '>All paychecks</option>' +
          state.accounts.map(function (a) { return '<option value="' + a.id + '"' + (r && r.source === a.id ? ' selected' : '') + '>Paychecks into ' + esc(a.name) + '</option>'; }).join('') +
        '</select></label>' +
        '<div class="form-actions"><button type="button" class="btn btn-line" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn">' + icon('check', 'ic-sm') + 'Save</button></div>' +
      '</form>');
  }

  /* ---------- forms: submit ---------- */
  var FORMS = {
    goal: function (f) {
      var id = fv(f, 'id').value;
      var name = fv(f, 'name').value.trim();
      var target = num(fv(f, 'target').value);
      var savedRaw = fv(f, 'saved').value.trim();
      var saved = savedRaw === '' ? 0 : num(savedRaw);
      var date = fv(f, 'date').value;
      var pick = f.querySelector('input[name="icon"]:checked');
      var ic = pick ? pick.value : 'piggy';
      if (!name) return formError(f, 'Give your goal a name.');
      if (!(target > 0)) return formError(f, 'Enter a target amount above zero.');
      if (isNaN(saved) || saved < 0) return formError(f, 'Saved so far must be zero or more.');
      if (id) {
        var g = byId(state.goals, id);
        if (!g) return closeModal();
        g.name = name; g.target = r2(target); g.saved = r2(saved); g.date = date || ''; g.icon = ic;
        toast('Goal updated');
      } else {
        state.goals.push({ id: uid(), name: name, target: r2(target), saved: r2(saved), date: date || '', icon: ic });
        log('Created goal "' + name + '"', 0, 'info');
        toast('Goal created');
      }
      save(); closeModal(); render();
    },

    'goal-money': function (f) {
      var g = byId(state.goals, fv(f, 'id').value);
      if (!g) return closeModal();
      var add = fv(f, 'mode').value === 'add';
      var amt = num(fv(f, 'amount').value);
      if (!(amt > 0)) return formError(f, 'Enter an amount above zero.');
      amt = r2(amt);
      if (!add && amt > g.saved) return formError(f, 'You only have ' + money(g.saved) + ' in this goal.');
      g.saved = r2(g.saved + (add ? amt : -amt));
      log((add ? 'Added to ' : 'Took from ') + g.name, amt, add ? 'in' : 'out');
      save(); closeModal(); render();
      toast(add ? 'Added ' + money(amt) : 'Took out ' + money(amt));
    },

    account: function (f) {
      var id = fv(f, 'id').value;
      var name = fv(f, 'name').value.trim();
      var type = fv(f, 'type').value;
      var balRaw = fv(f, 'balance').value.trim();
      var bal = balRaw === '' ? 0 : num(balRaw);
      if (!name) return formError(f, 'Give the account a name.');
      if (isNaN(bal)) return formError(f, 'Enter the balance as a number.');
      if (id) {
        var a = byId(state.accounts, id);
        if (!a) return closeModal();
        a.name = name; a.type = type; a.balance = r2(bal);
        toast('Account updated');
      } else {
        state.accounts.push({ id: uid(), name: name, type: type, balance: r2(bal) });
        log('Added account "' + name + '"', 0, 'info');
        toast('Account added');
      }
      save(); closeModal(); render();
    },

    paycheck: function (f) {
      var amt = num(fv(f, 'amount').value);
      var accId = fv(f, 'account').value;
      var acc = byId(state.accounts, accId);
      var date = fv(f, 'date').value || today();
      var label = fv(f, 'label').value.trim();
      if (!(amt > 0)) return formError(f, 'Enter the paycheck amount.');
      if (!acc) return formError(f, 'Pick an account to deposit into.');
      amt = r2(amt);
      var splits = splitsFor(amt, acc.id);
      acc.balance = r2((Number(acc.balance) || 0) + amt);
      splits.forEach(function (s) {
        var g = byId(state.goals, s.goalId);
        if (g) g.saved = r2((Number(g.saved) || 0) + s.amount);
      });
      state.paychecks.unshift({
        id: uid(), date: date, label: label, amount: amt,
        accountId: acc.id, accountName: acc.name, splits: splits
      });
      var tot = r2(splits.reduce(function (t, s) { return t + s.amount; }, 0));
      log((label || 'Paycheck') + ' into ' + acc.name + (tot > 0 ? ' (' + money(tot) + ' saved)' : ''), amt, 'in');
      save(); closeModal(); render();
      toast(tot > 0 ? 'Logged! ' + money(tot) + ' went to your goals' : 'Paycheck logged');
    },

    rule: function (f) {
      var id = fv(f, 'id').value;
      var goalId = fv(f, 'goal').value;
      var pc = num(fv(f, 'percent').value);
      var source = fv(f, 'source').value;
      if (!byId(state.goals, goalId)) return formError(f, 'Pick a goal.');
      if (!(pc > 0) || pc > 100) return formError(f, 'Percent must be more than 0 and at most 100.');
      pc = Math.round(pc * 100) / 100;
      var cand = { id: id || uid(), goalId: goalId, percent: pc, source: source };
      var over = ruleOverflow(cand, id || null);
      if (over) {
        return formError(f, 'That would add up to more than 100% for ' + scopeName(over) + '. Lower a percent first.');
      }
      if (id) {
        var r = byId(state.rules, id);
        if (!r) return closeModal();
        r.goalId = goalId; r.percent = pc; r.source = source;
        toast('Rule updated');
      } else {
        state.rules.push(cand);
        toast('Rule added');
      }
      save(); closeModal(); render();
    }
  };

  /* ---------- delete / reset ---------- */
  function askDelete(kind, id) {
    if (kind === 'goal') {
      var g = byId(state.goals, id); if (!g) return;
      confirmBox('Delete "' + g.name + '" and its savings rules? The money stays in your accounts.', 'Delete goal', function () {
        state.goals = state.goals.filter(function (x) { return x.id !== id; });
        state.rules = state.rules.filter(function (r) { return r.goalId !== id; });
        log('Deleted goal "' + g.name + '"', 0, 'info');
      });
    } else if (kind === 'account') {
      var a = byId(state.accounts, id); if (!a) return;
      confirmBox('Delete the account "' + a.name + '" and the rules that point to it? Past paychecks stay in your history.', 'Delete account', function () {
        state.accounts = state.accounts.filter(function (x) { return x.id !== id; });
        state.rules = state.rules.filter(function (r) { return r.source !== id; });
        log('Deleted account "' + a.name + '"', 0, 'info');
      });
    } else if (kind === 'rule') {
      confirmBox('Delete this savings rule?', 'Delete rule', function () {
        state.rules = state.rules.filter(function (x) { return x.id !== id; });
      });
    } else if (kind === 'paycheck') {
      var p = byId(state.paychecks, id); if (!p) return;
      confirmBox('Delete this ' + money(p.amount) + ' paycheck? It will be taken back out of the account and the goals it fed.', 'Delete paycheck', function () {
        var acc = byId(state.accounts, p.accountId);
        if (acc) acc.balance = r2((Number(acc.balance) || 0) - p.amount);
        (p.splits || []).forEach(function (s) {
          var g2 = byId(state.goals, s.goalId);
          if (g2) g2.saved = Math.max(0, r2((Number(g2.saved) || 0) - s.amount));
        });
        state.paychecks = state.paychecks.filter(function (x) { return x.id !== id; });
      });
    } else if (kind === 'everything') {
      confirmBox('Erase all accounts, goals, rules and history from this device? This cannot be undone.', 'Erase everything', function () {
        var keep = state.settings;
        state = blank();
        state.settings = keep;
      });
    }
  }

  function addSampleData() {
    var chk = { id: uid(), name: 'Main Checking', type: 'Checking', balance: 1250 };
    var sav = { id: uid(), name: 'Rainy Day Savings', type: 'Savings', balance: 3400 };
    var g1 = { id: uid(), name: 'Beach Weekend', target: 1500, saved: 420, date: addDays(75), icon: 'plane' };
    var g2 = { id: uid(), name: 'Concert Night', target: 250, saved: 90, date: addDays(30), icon: 'star' };
    var g3 = { id: uid(), name: 'Emergency Fund', target: 5000, saved: 1800, date: '', icon: 'heart' };
    state.accounts.push(chk, sav);
    state.goals.push(g1, g2, g3);
    state.rules.push(
      { id: uid(), goalId: g3.id, percent: 10, source: 'all' },
      { id: uid(), goalId: g1.id, percent: 8, source: 'all' },
      { id: uid(), goalId: g2.id, percent: 5, source: chk.id }
    );
    log('Added sample data', 0, 'info');
    save(); render();
    toast('Sample data added');
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
        if (!data || typeof data !== 'object' || !Array.isArray(data.accounts) || !Array.isArray(data.goals)) {
          throw new Error('bad file');
        }
        state = normalize(data);
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
      case 'nav': go(el.getAttribute('data-view') || 'home'); break;
      case 'toggle-theme':
        state.settings.theme = effectiveTheme() === 'dark' ? 'light' : 'dark';
        save(); applyTheme(); if (ui.view === 'settings') render();
        break;
      case 'set-theme':
        state.settings.theme = el.getAttribute('data-theme-val');
        save(); applyTheme(); render();
        break;
      case 'new-goal': openGoalForm(); break;
      case 'edit-goal': openGoalForm(id); break;
      case 'goal-money': openGoalMoney(id, el.getAttribute('data-mode')); break;
      case 'new-account': openAccountForm(); break;
      case 'edit-account': openAccountForm(id); break;
      case 'paycheck-form': openPaycheckForm(); break;
      case 'new-rule': openRuleForm(); break;
      case 'edit-rule': openRuleForm(id); break;
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
      case 'sample': addSampleData(); break;
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
    if (t.id === 'currency-select' && e.type === 'change') {
      state.settings.currency = t.value;
      save(); render();
      return;
    }
    if (t.id === 'import-file' && e.type === 'change') {
      importData(t.files && t.files[0]);
      t.value = '';
      return;
    }
    var f = t.form;
    if (f && f.getAttribute('data-form') === 'paycheck') updatePaycheckPreview(f);
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
