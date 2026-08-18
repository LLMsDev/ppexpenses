/* =============================================
   PERSONAL EXPENSE TRACKER — App Controller
   Version 2.0
============================================= */
'use strict';

/* ── State ─────────────────────────────────── */
let state = {
  transactions: [],
  categories: [
    { id: 'food',  name: 'Food & Dining',    icon: '🍽️', cls: 'food' },
    { id: 'groc',  name: 'Groceries',         icon: '🛒', cls: 'groc' },
    { id: 'tran',  name: 'Transport',         icon: '🚗', cls: 'tran' },
    { id: 'shop',  name: 'Shopping',          icon: '🛍️', cls: 'shop' },
    { id: 'bill',  name: 'Bills & Utilities', icon: '📋', cls: 'bill' },
    { id: 'ent',   name: 'Entertainment',     icon: '😊', cls: 'ent'  },
    { id: 'hlth',  name: 'Health',            icon: '❤️', cls: 'hlth' },
    { id: 'edu',   name: 'Education',         icon: '🎓', cls: 'edu'  },
    { id: 'oth',   name: 'Others',            icon: '💬', cls: 'oth'  }
  ],
  profile: { name: 'Ram', currency: '₾' },
  balanceVisible: true,
  activeTxType: 'expense',
  activeCatId: null,
  filterType: 'all',
  txEditId: null,
  seeded: false
};

/* ── Persistence ────────────────────────────── */
function save() {
  localStorage.setItem('expense_tracker_v2', JSON.stringify(state));
  if (window.googleSync) {
    window.googleSync.autoSync();
  }
}
function load() {
  try {
    const raw = localStorage.getItem('expense_tracker_v2');
    if (raw) {
      const s = JSON.parse(raw);
      state.transactions = s.transactions || [];
      // Keep transactions pre-sorted by timestamp descending
      state.transactions.sort((a,b) => b.timestamp - a.timestamp);
      if (s.categories && s.categories.length) {
        state.categories = s.categories;
        // Auto-migrate to add groc category if missing from saved localStorage state
        if (!state.categories.some(c => c.id === 'groc')) {
          state.categories.splice(1, 0, { id: 'groc', name: 'Groceries', icon: '🛒', cls: 'groc' });
        }
      }
      if (s.profile) {
        state.profile = { ...state.profile, ...s.profile };
        // Auto-migrate old default '$' to GEL '₾'
        if (state.profile.currency === '$') {
          state.profile.currency = '₾';
        }
      }
      if (s.seeded !== undefined) {
        state.seeded = s.seeded;
      } else {
        state.seeded = (state.transactions.length > 0);
      }
      state.balanceVisible = s.balanceVisible !== undefined ? s.balanceVisible : true;
    }
  } catch(e) { console.warn('Load failed', e); }
}

/* ── Helpers ──────────────────────────────── */
function fmt(n) {
  const s = state.profile.currency;
  if (!state.balanceVisible) return s + '••••';
  return s + Math.abs(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function fmtSigned(n) {
  if (!state.balanceVisible) return (n >= 0 ? '+' : '-') + state.profile.currency + '••••';
  const sign = n >= 0 ? '+' : '-';
  return sign + state.profile.currency + Math.abs(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function fmtDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });
}
function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'});
}
function getCat(id) { return state.categories.find(c => c.id === id) || { name: 'Other', icon: '💬', cls: 'oth' }; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).substr(2,4); }
function getMonthKey(iso) { return iso ? iso.substring(0,7) : ''; }
function currentMonthKey() {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
}
const domCache = {};
function el(id) {
  if (!domCache[id]) {
    domCache[id] = document.getElementById(id);
  }
  return domCache[id];
}
function setText(id, txt) { const e = el(id); if(e) e.textContent = txt; }

function showToast(msg, type='success') {
  const t = el('toast');
  t.textContent = msg;
  t.style.background = type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#0f172a';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

/* ── Month Filter ──────────────────────────── */
function getFilterMonth() {
  return state.filterMonth || currentMonthKey();
}
function filteredTxs() {
  const m = getFilterMonth();
  let txs = state.transactions.filter(t => getMonthKey(t.date) === m);
  if (state.filterType !== 'all') txs = txs.filter(t => t.type === state.filterType);
  return txs;
}
function allMonthFilteredTxs() {
  const m = getFilterMonth();
  return state.transactions.filter(t => getMonthKey(t.date) === m);
}

/* ── Computed Totals ───────────────────────── */
function getTotals(txs) {
  let income = 0, expense = 0;
  txs.forEach(t => { if(t.type==='income') income += t.amount; else expense += t.amount; });
  return { income, expense, balance: income - expense };
}
function getCatBreakdown(txs) {
  const map = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    if(!map[t.categoryId]) map[t.categoryId] = 0;
    map[t.categoryId] += t.amount;
  });
  return Object.entries(map).sort((a,b)=>b[1]-a[1]);
}

/* ── Balance Visibility ──────────────────── */
function toggleBalanceVisibility() {
  state.balanceVisible = !state.balanceVisible;
  save();
  renderAll();
}

/* ── Month Selector ──────────────────────── */
function buildMonthOptions(selId) {
  const sel = el(selId);
  if (!sel) return;
  const months = new Set();
  months.add(currentMonthKey());
  state.transactions.forEach(t => months.add(getMonthKey(t.date)));
  const sorted = Array.from(months).sort().reverse();
  sel.innerHTML = '';
  sorted.forEach(m => {
    const [y,mo] = m.split('-');
    const label = new Date(+y, +mo-1, 1).toLocaleString('en-US',{month:'long', year:'numeric'});
    const opt = document.createElement('option');
    opt.value = m; opt.textContent = label;
    if (m === getFilterMonth()) opt.selected = true;
    sel.appendChild(opt);
  });
}
function filterByMonth(m) {
  state.filterMonth = m;
  renderAll();
}

/* ── Categories Grid ─────────────────────── */
function renderCatGrid(containerId, pickerId=false) {
  const el_ = el(containerId);
  if (!el_) return;
  el_.innerHTML = '';
  state.categories.forEach(cat => {
    const div = document.createElement('div');
    div.className = `cat-box ${cat.cls || 'oth'}${state.activeCatId === cat.id && pickerId ? ' selected' : ''}`;
    if (cat.color) div.style.cssText = `background:${cat.color}18;`;
    div.innerHTML = `<div class="cat-icon" style="${cat.color ? 'color:'+cat.color : ''}">${cat.icon}</div><div class="cat-name">${cat.name}</div>`;
    if (pickerId) {
      div.onclick = () => selectCat(cat.id, containerId);
    }
    el_.appendChild(div);
  });
}
function renderFormCatGrid(containerId) {
  const el_ = el(containerId);
  if (!el_) return;
  el_.innerHTML = '';
  state.categories.forEach(cat => {
    const div = document.createElement('div');
    div.className = `form-cat-box ${cat.cls || 'oth'}${state.activeCatId === cat.id ? ' selected' : ''}`;
    if (cat.color) div.style.cssText = `background:${cat.color}18;`;
    div.innerHTML = `<div class="cat-icon" style="${cat.color ? 'color:'+cat.color : ''}">${cat.icon}</div><div class="cat-name">${cat.name}</div>`;
    div.onclick = () => selectCat(cat.id, containerId);
    el_.appendChild(div);
  });
}
function selectCat(catId, containerId) {
  state.activeCatId = catId;
  renderFormCatGrid('m-cat-picker');
  renderFormCatGrid('d-cat-picker');
}

/* ── Donut Chart ─────────────────────────── */
const CAT_COLORS_ORDERED = [
  '#9333ea','#ea580c','#16a34a','#2563eb','#c026d3','#e11d48','#4f46e5','#475569',
  '#0891b2','#d97706','#059669','#7c3aed'
];
function renderDonut(svgId, totalId, legendId, txs) {
  const svg = el(svgId); const totEl = el(totalId); const legEl = el(legendId);
  if (!svg) return;
  const breakdown = getCatBreakdown(txs);
  const total = breakdown.reduce((s,[,v])=>s+v, 0);
  if (totEl) totEl.textContent = total > 0 ? state.profile.currency + total.toLocaleString('en-US',{maximumFractionDigits:0}) : state.profile.currency+'0';

  // Clear except base ring
  while (svg.children.length > 1) svg.removeChild(svg.lastChild);

  if (total === 0) {
    if (legEl) legEl.innerHTML = '<div style="font-size:.72rem;color:var(--muted);font-weight:600;">No expenses yet</div>';
    return;
  }

  const R = 38, CX = 50, CY = 50;
  const circ = 2 * Math.PI * R;
  let offset = -circ * 0.25; // start from top

  breakdown.forEach(([catId, val], i) => {
    const cat = getCat(catId);
    const color = cat.color || CAT_COLORS_ORDERED[i % CAT_COLORS_ORDERED.length];
    const pct = val / total;
    const dash = pct * circ;
    const gap = circ - dash;
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', CX); circle.setAttribute('cy', CY); circle.setAttribute('r', R);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', color);
    circle.setAttribute('stroke-width', '14');
    circle.setAttribute('stroke-dasharray', `${dash} ${gap}`);
    circle.setAttribute('stroke-dashoffset', offset);
    circle.setAttribute('stroke-linecap', 'butt');
    circle.style.transition = 'stroke-dasharray 0.5s ease';
    svg.appendChild(circle);
    offset -= dash;
  });

  if (legEl) {
    legEl.innerHTML = breakdown.map(([catId, val], i) => {
      const cat = getCat(catId);
      const color = cat.color || CAT_COLORS_ORDERED[i % CAT_COLORS_ORDERED.length];
      const pct = Math.round(val/total*100);
      return `<div class="legend-row">
        <div class="legend-left"><span class="legend-dot" style="background:${color}"></span><span class="legend-name">${cat.name}</span></div>
        <div class="legend-right"><span class="legend-val">${state.profile.currency}${val.toLocaleString('en-US',{maximumFractionDigits:0})}</span><span class="legend-pct">${pct}%</span></div>
      </div>`;
    }).join('');
  }
}

/* ── Line Sparkline ────────────────────────── */
function renderSparkline(svgId, txs, type) {
  const svg = el(svgId);
  if (!svg) return;
  svg.innerHTML = '';
  const color = type === 'income' ? '#10b981' : '#f87171';
  const days = 7;
  const data = [];
  for (let i = days-1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().substring(0,10);
    const sum = txs.filter(t => t.date === key && t.type === type).reduce((s,t)=>s+t.amount,0);
    data.push(sum);
  }
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (days-1)) * 200;
    const y = 48 - (v/max) * 40 - 4;
    return `${x},${y}`;
  });
  // Area fill
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const linePts = pts.join(' L ');
  area.setAttribute('d', `M ${pts[0]} L ${linePts} L 200,48 L 0,48 Z`);
  area.setAttribute('fill', color + '20'); area.setAttribute('stroke', 'none');
  svg.appendChild(area);
  // Line
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', `M ${linePts}`);
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '2.5'); path.setAttribute('stroke-linecap', 'round');
  svg.appendChild(path);
  // End dot
  const [lx, ly] = pts[pts.length-1].split(',');
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', lx); dot.setAttribute('cy', ly); dot.setAttribute('r', '4');
  dot.setAttribute('fill', color);
  svg.appendChild(dot);
}

/* ── Transaction Items ────────────────────── */
function txItemHTML(tx) {
  const cat = getCat(tx.categoryId);
  const sign = tx.type === 'income' ? '+' : '-';
  const amtClass = tx.type === 'income' ? 'inc' : 'exp';
  const catColor = cat.color || (tx.type === 'income' ? '#10b981' : '#f87171');
  return `<div class="tx-item" data-id="${tx.id}">
    <div class="tx-left">
      <div class="tx-icon" style="background:${catColor}20;color:${catColor};">${cat.icon}</div>
      <div class="tx-info">
        <div class="tx-title">${tx.description || cat.name}</div>
        <div class="tx-meta">${fmtTime(tx.timestamp)} • ${cat.name}</div>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;">
      <div class="tx-amount ${amtClass}">${sign}${fmt(tx.amount)}</div>
      <button onclick="editTx('${tx.id}')" style="color:var(--subtle);font-size:.85rem;padding:4px;border-radius:6px;transition:var(--ease);display:flex;align-items:center;justify-content:center;" title="Edit" onmouseenter="this.style.background='var(--primary-light)';this.style.color='var(--primary)';" onmouseleave="this.style.background='';this.style.color='var(--subtle)';">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button onclick="deleteTx('${tx.id}')" style="color:var(--subtle);font-size:.85rem;padding:4px;border-radius:6px;transition:var(--ease);display:flex;align-items:center;justify-content:center;" title="Delete" onmouseenter="this.style.background='var(--expense-bg)';this.style.color='var(--expense-dark)';" onmouseleave="this.style.background='';this.style.color='var(--subtle)';">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1-2-2h4a2 2 0 0 1-2 2v2"/></svg>
      </button>
    </div>
  </div>`;
}

function groupTxsByDate(txs) {
  const groups = {};
  txs.forEach(tx => {
    if (!groups[tx.date]) groups[tx.date] = [];
    groups[tx.date].push(tx);
  });
  return Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0]));
}

let desktopTxLimit = 25;
let mobileTxLimit = 25;

function loadMoreTxs(viewType) {
  if (viewType === 'desktop') {
    desktopTxLimit += 25;
    renderDesktopTx();
  } else {
    mobileTxLimit += 25;
    renderMobileTxs();
  }
}
window.loadMoreTxs = loadMoreTxs;

function renderTxGroups(groups, limit, viewType) {
  if (!groups.length) return '<div style="text-align:center;padding:28px;color:var(--muted);font-size:.8rem;font-weight:600;">No transactions found.</div>';
  
  let count = 0;
  let html = '';
  let hasMore = false;
  
  for (const [date, txs] of groups) {
    if (count >= limit) {
      hasMore = true;
      break;
    }
    
    const visibleTxs = [];
    for (const tx of txs) {
      if (count < limit) {
        visibleTxs.push(tx);
        count++;
      } else {
        hasMore = true;
      }
    }
    
    if (visibleTxs.length > 0) {
      html += `
        <div class="tx-group">
          <div class="tx-date-label">${fmtDate(date)}</div>
          <div class="tx-list">${visibleTxs.map(txItemHTML).join('')}</div>
        </div>`;
    }
  }
  
  if (hasMore) {
    html += `
      <div style="text-align:center;padding:12px 0;">
        <button class="btn btn-secondary btn-sm" onclick="loadMoreTxs('${viewType}')" style="font-size:.7rem;padding:6px 12px;display:inline-flex;">Show More Transactions</button>
      </div>`;
  }
  
  return html;
}

/* ── Search Debounce Implementation ─────── */
let searchDebounceTimer = null;
function debouncedSearchDesktop() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    // Reset limit on search
    desktopTxLimit = 25;
    renderDesktopTx();
  }, 150);
}
function debouncedSearchMobile() {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    // Reset limit on search
    mobileTxLimit = 25;
    renderMobileTxs();
  }, 150);
}
window.debouncedSearchDesktop = debouncedSearchDesktop;
window.debouncedSearchMobile = debouncedSearchMobile;

/* ── Render Desktop ──────────────────────── */
function renderDesktopTx() {
  const query = (el('d-tx-search')?.value||'').toLowerCase();
  const monthTxs = allMonthFilteredTxs();
  let txs = monthTxs;
  if (query) txs = txs.filter(t => (t.description||'').toLowerCase().includes(query) || getCat(t.categoryId).name.toLowerCase().includes(query));
  const wrap = el('d-all-txs-wrap');
  if (wrap) wrap.innerHTML = renderTxGroups(groupTxsByDate(txs), desktopTxLimit, 'desktop');

  // Recent (top 5 - O(1) slice since pre-sorted!)
  const recent5 = state.transactions.slice(0,5);
  const recWrap = el('d-recent-txs');
  if (recWrap) recWrap.innerHTML = recent5.length ? '<div class="tx-list">'+recent5.map(txItemHTML).join('')+'</div>' : '<div style="text-align:center;padding:20px;color:var(--muted);font-size:.8rem;font-weight:600;">No transactions yet.</div>';
}

function renderMobileTxs() {
  const query = (el('m-tx-search')?.value||'').toLowerCase();
  let txs = allMonthFilteredTxs();
  if (state.filterType !== 'all') txs = txs.filter(t => t.type === state.filterType);
  if (query) txs = txs.filter(t => (t.description||'').toLowerCase().includes(query) || getCat(t.categoryId).name.toLowerCase().includes(query));
  const wrap = el('m-all-txs-wrap');
  if (wrap) wrap.innerHTML = renderTxGroups(groupTxsByDate(txs), mobileTxLimit, 'mobile');
}

function filterTxType(type) {
  state.filterType = type;
  ['all','income','expense'].forEach(t => {
    const btn = el('tt-'+t);
    if (btn) btn.classList.toggle('active', t === type);
  });
  renderMobileTxs();
}

/* ── Render Settings Cat List ────────────── */
function renderSettingsCatList() {
  const wrap = el('s-cat-list');
  if (!wrap) return;
  wrap.innerHTML = state.categories.map(cat => `
    <div class="settings-item">
      <div class="settings-item-left">
        <span>${cat.icon}</span><span>${cat.name}</span>
      </div>
      ${!['food','groc','tran','shop','bill','ent','hlth','edu','oth'].includes(cat.id) ?
        `<button class="del-btn" onclick="deleteCat('${cat.id}')">Remove</button>` :
        '<span style="font-size:.7rem;color:var(--subtle);">Built-in</span>'}
    </div>`).join('');
}

/* ── Full Render ─────────────────────────── */
// Screen state detection
let isCurrentlyDesktop = window.innerWidth >= 1024;
window.addEventListener('resize', () => {
  const desktop = window.innerWidth >= 1024;
  if (desktop !== isCurrentlyDesktop) {
    isCurrentlyDesktop = desktop;
    renderAll();
  }
});

function renderAll() {
  const isDesktop = window.innerWidth >= 1024;
  const monthTxs = allMonthFilteredTxs();
  const allTotals = getTotals(monthTxs);
  const { income, expense, balance } = allTotals;

  // Month badge
  const [y,m] = getFilterMonth().split('-');
  const mbadge = new Date(+y,+m-1,1).toLocaleString('en-US',{month:'long'});

  // Profile/name
  const name = state.profile.name;
  
  if (isDesktop) {
    // Render Desktop elements ONLY
    setText('d-user-name', `Hello, ${name}`);
    setText('d-month-badge', mbadge);
    
    const balStr = fmt(balance);
    setText('d-total-balance', balStr);
    setText('d-total-income', fmt(income));
    setText('d-total-expense', fmt(expense));

    // Stat cards
    setText('d-inc-amount', fmt(income)); 
    setText('d-exp-amount', fmt(expense));

    // Summary
    setText('d-sum-income', fmt(income)); 
    setText('d-sum-expense', fmt(expense));

    // Trend (simple vs previous month)
    const prevKey = getPrevMonthKey(getFilterMonth());
    const prevTxs = state.transactions.filter(t => getMonthKey(t.date) === prevKey);
    const prevTotals = getTotals(prevTxs);
    const incTrend = prevTotals.income > 0 ? Math.round((income - prevTotals.income)/prevTotals.income*100) : 0;
    const expTrend = prevTotals.expense > 0 ? Math.round((expense - prevTotals.expense)/prevTotals.expense*100) : 0;
    const incTrendTxt = (incTrend >= 0 ? '↑ ' : '↓ ') + Math.abs(incTrend) + '% from last month';
    const expTrendTxt = (expTrend >= 0 ? '↑ ' : '↓ ') + Math.abs(expTrend) + '% from last month';
    setText('d-sum-inc-trend', incTrendTxt); 
    setText('d-sum-exp-trend', expTrendTxt);

    // Report panel
    setText('d-rep-income', fmt(income));
    setText('d-rep-expense', fmt(expense));
    setText('d-rep-balance', fmt(balance));

    // Sparklines
    renderSparkline('d-inc-chart', state.transactions, 'income');
    renderSparkline('d-exp-chart', state.transactions, 'expense');

    // Donuts
    renderDonut('d-donut-chart',      'd-donut-total',        'd-donut-legend',        monthTxs);
    renderDonut('d-donut-right',      'd-donut-right-total',  'd-right-legend',        monthTxs);

    // Categories
    renderCatGrid('d-categories-grid', false);

    // Month selectors
    buildMonthOptions('d-month-sel');

    // Transactions
    renderDesktopTx();
  } else {
    // Render Mobile elements ONLY
    setText('m-page-title', `Hello, ${name} 👋`);
    setText('settings-name-display', name);
    setText('m-month-badge', mbadge);

    const balStr = fmt(balance);
    setText('m-total-balance', balStr);
    setText('m-total-income', fmt(income));
    setText('m-total-expense', fmt(expense));

    // Summary
    setText('m-sum-income', fmt(income)); 
    setText('m-sum-expense', fmt(expense));

    // Trend (simple vs previous month)
    const prevKey = getPrevMonthKey(getFilterMonth());
    const prevTxs = state.transactions.filter(t => getMonthKey(t.date) === prevKey);
    const prevTotals = getTotals(prevTxs);
    const incTrend = prevTotals.income > 0 ? Math.round((income - prevTotals.income)/prevTotals.income*100) : 0;
    const expTrend = prevTotals.expense > 0 ? Math.round((expense - prevTotals.expense)/prevTotals.expense*100) : 0;
    const incTrendTxt = (incTrend >= 0 ? '↑ ' : '↓ ') + Math.abs(incTrend) + '% from last month';
    const expTrendTxt = (expTrend >= 0 ? '↑ ' : '↓ ') + Math.abs(expTrend) + '% from last month';
    setText('m-sum-inc-trend', incTrendTxt);
    setText('m-sum-exp-trend', expTrendTxt);

    // Report panel
    setText('m-rep-income', fmt(income));
    setText('m-rep-expense', fmt(expense));
    setText('m-rep-balance', fmt(balance));

    // Donuts
    renderDonut('m-donut',            'm-donut-total',        'm-donut-legend',        monthTxs);
    renderDonut('m-donut-report',     'm-donut-report-total', 'm-donut-report-legend', monthTxs);

    // Categories
    renderSettingsCatList();

    // Month selectors
    buildMonthOptions('m-month-sel');

    // Transactions
    renderMobileTxs();

    // Mobile recent (O(1) slice since pre-sorted!)
    const recent5 = state.transactions.slice(0,5);
    const mRec = el('m-recent-txs');
    if (mRec) mRec.innerHTML = recent5.length
      ? recent5.map(txItemHTML).join('')
      : '<div style="text-align:center;padding:18px;color:var(--muted);font-size:.78rem;font-weight:600;">No transactions yet. Tap + to add one.</div>';
  }
}

function getPrevMonthKey(key) {
  const [y,m] = key.split('-').map(Number);
  if (m === 1) return `${y-1}-12`;
  return `${y}-${String(m-1).padStart(2,'0')}`;
}

/* ── Transaction CRUD ────────────────────── */
function saveTransaction(context) {
  // Determine if it is desktop based on parameter or active overlay modal
  const isDesktop = context === 'desktop' || (context !== 'mobile' && el('add-tx-modal')?.classList.contains('open'));
  
  const prefix = isDesktop ? 'd-' : 'm-';
  const amountEl = el(prefix + 'amount');
  const descEl   = el(prefix + 'description');
  const dateEl   = el(prefix + 'date');
  const noteEl   = el(prefix + 'note');

  const amount = parseFloat(amountEl?.value);
  if (!amount || amount <= 0) { showToast('Please enter a valid amount', 'error'); return; }
  if (!state.activeCatId) { showToast('Please select a category', 'warning'); return; }
  if (!dateEl?.value) { showToast('Please select a date', 'warning'); return; }

  let tx;
  if (state.txEditId) {
    // Update existing transaction
    tx = state.transactions.find(t => t.id === state.txEditId);
    if (tx) {
      tx.type = state.activeTxType;
      tx.amount = amount;
      tx.categoryId = state.activeCatId;
      tx.description = descEl?.value?.trim() || '';
      tx.date = dateEl.value;
      tx.note = noteEl?.value?.trim() || '';
      tx.timestamp = new Date(dateEl.value + 'T00:00:00').getTime();
    }
    state.txEditId = null;
    // Re-sort transactions by timestamp descending
    state.transactions.sort((a,b) => b.timestamp - a.timestamp);
    showToast(`Transaction updated!`);
  } else {
    // Add new transaction
    tx = {
      id: uid(),
      type: state.activeTxType,
      amount,
      categoryId: state.activeCatId,
      description: descEl?.value?.trim() || '',
      date: dateEl.value,
      note: noteEl?.value?.trim() || '',
      timestamp: new Date(dateEl.value + 'T00:00:00').getTime() + (Date.now() % 86400000)
    };
    // Keep transactions sorted in memory by timestamp descending
    let insertIdx = 0;
    while (insertIdx < state.transactions.length && state.transactions[insertIdx].timestamp > tx.timestamp) {
      insertIdx++;
    }
    state.transactions.splice(insertIdx, 0, tx);
    showToast(`${tx.type === 'income' ? 'Income' : 'Expense'} added! ${state.profile.currency}${amount.toFixed(2)}`);
  }
  
  save();

  // Reset form
  if (amountEl) amountEl.value = '';
  if (descEl) descEl.value = '';
  if (noteEl) noteEl.value = '';
  state.activeCatId = null;
  renderFormCatGrid('m-cat-picker');
  renderFormCatGrid('d-cat-picker');

  // Reset button labels
  const mBtn = el('m-save-tx-btn');
  if (mBtn) mBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Save Transaction`;
  const dBtn = el('d-save-tx-btn');
  if (dBtn) dBtn.textContent = 'Save Transaction';

  if (isDesktop) {
    closeModal('add-tx-modal');
  } else {
    switchView('v-home');
  }
  renderAll();
}

function editTx(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  state.txEditId = id;
  
  const isMobile = window.innerWidth < 1024;
  const prefix = isMobile ? 'm-' : 'd-';
  
  // Populate input elements
  const amountEl = el(prefix + 'amount');
  const descEl   = el(prefix + 'description');
  const dateEl   = el(prefix + 'date');
  const noteEl   = el(prefix + 'note');
  
  if (amountEl) amountEl.value = tx.amount;
  if (descEl) descEl.value = tx.description;
  if (dateEl) dateEl.value = tx.date;
  if (noteEl) noteEl.value = tx.note || '';
  
  state.activeCatId = tx.categoryId;
  setTxType(tx.type);
  
  if (isMobile) {
    switchView('v-add');
    setText('m-page-title', 'Edit Transaction');
    // Change button label
    const btn = el('m-save-tx-btn');
    if (btn) {
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Update Transaction`;
    }
  } else {
    openModal('add-tx-modal');
    setText('add-tx-modal-title', 'Edit Transaction');
    // Change button label
    const btn = el('d-save-tx-btn');
    if (btn) btn.textContent = 'Update Transaction';
    renderFormCatGrid('d-cat-picker');
  }
}

function deleteTx(id) {
  state.transactions = state.transactions.filter(t => t.id !== id);
  save();
  showToast('Transaction deleted', 'error');
  renderAll();
}

function clearAllData() {
  if (!confirm('⚠️ This will delete ALL transactions and categories. Are you sure?')) return;
  state.transactions = [];
  state.categories = state.categories.filter(c => ['food','groc','tran','shop','bill','ent','hlth','edu','oth'].includes(c.id));
  state.seeded = true;
  save();
  showToast('All data cleared');
  renderAll();
}

/* ── Category CRUD ───────────────────────── */
function addCategory() {
  const name = el('new-cat-name')?.value?.trim();
  const icon = el('new-cat-icon')?.value?.trim() || '📌';
  const color = el('new-cat-color')?.value || '#4f46e5';
  if (!name) { showToast('Enter a category name', 'warning'); return; }
  const id = 'cat_' + name.toLowerCase().replace(/\s+/g,'_') + '_' + uid();
  state.categories.push({ id, name, icon, cls: 'oth', color });
  save();
  el('new-cat-name').value = '';
  el('new-cat-icon').value = '';
  closeModal('add-cat-modal');
  showToast(`Category "${name}" added!`);
  renderAll();
}

function deleteCat(id) {
  state.categories = state.categories.filter(c => c.id !== id);
  save();
  showToast('Category removed');
  renderAll();
}

/* ── Profile ─────────────────────────────── */
function saveProfile() {
  const name = el('profile-name-inp')?.value?.trim() || 'Ram';
  const cur  = el('profile-currency')?.value || '$';
  state.profile = { name, currency: cur };
  save();
  closeModal('profile-modal');
  showToast('Profile saved!');
  renderAll();
}

/* ── Add TX Type ─────────────────────────── */
function setTxType(type) {
  state.activeTxType = type;
  // mobile toggles
  const mExp = el('toggle-exp'), mInc = el('toggle-inc');
  const dExp = el('d-toggle-exp'), dInc = el('d-toggle-inc');
  if (type === 'expense') {
    if(mExp){mExp.className='toggle-btn active-exp';} if(mInc){mInc.className='toggle-btn';}
    if(dExp){dExp.className='toggle-btn active-exp';} if(dInc){dInc.className='toggle-btn';}
  } else {
    if(mExp){mExp.className='toggle-btn';} if(mInc){mInc.className='toggle-btn active-inc';}
    if(dExp){dExp.className='toggle-btn';} if(dInc){dInc.className='toggle-btn active-inc';}
  }
  const title = el('add-tx-modal-title');
  if (title) title.textContent = type === 'income' ? 'Add Income' : 'Add Expense';
}

/* ── Modal ───────────────────────────────── */
function openModal(id) {
  const m = el(id);
  if (m) { m.classList.add('open'); document.body.style.overflow='hidden'; }
}
function closeModal(id) {
  const m = el(id);
  if (m) { m.classList.remove('open'); document.body.style.overflow=''; }
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
  if (e.target.classList.contains('drawer-overlay')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

function openAddTx(type) {
  state.txEditId = null;
  const btn = el('d-save-tx-btn');
  if (btn) btn.textContent = 'Save Transaction';
  const dTitle = el('add-tx-modal-title');
  if (dTitle) dTitle.textContent = type === 'income' ? 'Add Income' : 'Add Expense';
  
  setTxType(type);
  state.activeCatId = null;
  renderFormCatGrid('d-cat-picker');
  // Set today as default date
  const today = new Date().toISOString().substring(0,10);
  const dDate = el('d-date'); if(dDate) dDate.value = today;
  openModal('add-tx-modal');
}

/* ── Mobile View Switching ───────────────── */
const NAV_MAP = {
  'v-home': 'nav-home',
  'v-transactions': 'nav-transactions',
  'v-add': 'nav-add',
  'v-reports': 'nav-reports',
  'v-settings': 'nav-settings'
};

/* ── Mobile Sidebar Drawer ───────────────── */
function openDrawer() {
  const dr = el('mobile-drawer');
  if (dr) {
    setText('drawer-user-name', state.profile.name);
    dr.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeDrawer() {
  const dr = el('mobile-drawer');
  if (dr) {
    dr.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function handleDrawerNav(viewId) {
  closeDrawer();
  if (viewId === 'v-add') {
    openMobileAddTx();
  } else {
    switchView(viewId);
  }
}

function openMobileAddTx() {
  state.txEditId = null;
  const btn = el('m-save-tx-btn');
  if (btn) {
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Save Transaction`;
  }
  setTxType('expense');
  state.activeCatId = null;
  switchView('v-add');
}
const TITLES = {
  'v-home': 'Hello, '+state.profile.name+' 👋',
  'v-transactions': 'Transactions',
  'v-add': 'Add Transaction',
  'v-reports': 'Reports',
  'v-settings': 'Settings'
};

function switchView(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const view = el(viewId);
  if (view) view.classList.add('active');
  const navBtn = el(NAV_MAP[viewId]);
  if (navBtn) navBtn.classList.add('active');

  // Update active class in drawer
  document.querySelectorAll('.drawer-item').forEach(i => i.classList.remove('active'));
  const drItem = el('dr-' + viewId.replace('v-', ''));
  if (drItem) drItem.classList.add('active');

  // Update title
  if (viewId === 'v-add') {
    setText('m-page-title', 'Add Transaction');
    // Set date to today
    const today = new Date().toISOString().substring(0,10);
    const mDate = el('m-date'); if(mDate) mDate.value = today;
    // Render cat picker
    renderFormCatGrid('m-cat-picker');
  } else {
    setText('m-page-title', viewId === 'v-home' ? `Hello, ${state.profile.name} 👋` : (TITLES[viewId]||''));
  }
  // Scroll to top
  const sc = el('m-screen-content');
  if (sc) sc.scrollTop = 0;
}

function scrollToTx() {
  const sec = el('all-tx-section');
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Export ──────────────────────────────── */
function exportData(format) {
  const monthTxs = allMonthFilteredTxs();
  if (!monthTxs.length) { showToast('No transactions to export', 'warning'); return; }
  let content, filename, type;
  if (format === 'csv') {
    const headers = 'Date,Type,Category,Description,Amount,Note';
    const rows = monthTxs.map(t =>
      [t.date, t.type, getCat(t.categoryId).name, t.description||'', t.amount.toFixed(2), t.note||'']
      .map(v => `"${String(v).replace(/"/g,'""')}"`)
      .join(',')
    );
    content = [headers, ...rows].join('\n');
    filename = `expenses_${getFilterMonth()}.csv`;
    type = 'text/csv';
  } else {
    content = JSON.stringify({ month: getFilterMonth(), transactions: monthTxs, categories: state.categories }, null, 2);
    filename = `expenses_${getFilterMonth()}.json`;
    type = 'application/json';
  }
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${filename}`);
}

/* ── Seed Data (first run) ───────────────── */
function seedIfEmpty() {
  if (state.seeded || state.transactions.length > 0) return;
  const today = new Date().toISOString().substring(0,10);
  const [y,m] = today.split('-');
  const prevDate = `${y}-${m}-${String(Math.max(1, new Date().getDate()-3)).padStart(2,'0')}`;
  const prev2 = `${y}-${m}-${String(Math.max(1, new Date().getDate()-7)).padStart(2,'0')}`;
  const seeds = [
    { type:'income',  amount:2650, categoryId:'oth',  description:'Monthly Salary',    date: prev2, note:'August paycheck' },
    { type:'expense', amount:45.5, categoryId:'groc', description: 'Grocery Shopping',  date: today, note:'' },
    { type:'expense', amount:1.5,  categoryId:'tran', description:'Bus Fare',          date: today, note:'' },
    { type:'expense', amount:120,  categoryId:'shop', description:'Clothes Shopping',  date: prevDate, note:'Sale at mall' },
    { type:'expense', amount:68,   categoryId:'food', description:'Restaurant Dinner', date: prevDate, note:'Family dinner' },
    { type:'expense', amount:14.5, categoryId:'ent',  description:'Netflix',           date: prev2, note:'Monthly subscription' },
    { type:'expense', amount:60,   categoryId:'bill', description:'Electricity Bill',  date: prev2, note:'' }
  ];
  seeds.forEach(s => {
    state.transactions.push({ ...s, id: uid(), timestamp: new Date(s.date).getTime() + Math.random()*86400000 });
  });
  state.transactions.sort((a,b) => b.timestamp - a.timestamp);
  state.seeded = true;
  save();
}

/* ── Google Sync Handlers ── */
function toggleSetupGuide() {
  const body = el('setup-guide-body');
  const arrow = el('setup-guide-arrow');
  if (body && arrow) {
    const isShown = body.classList.toggle('show');
    arrow.textContent = isShown ? '▲' : '▼';
  }
}
window.toggleSetupGuide = toggleSetupGuide;

/* ── Init ────────────────────────────────── */
function init() {
  load();
  seedIfEmpty();
  // Set today for date inputs
  const today = new Date().toISOString().substring(0,10);
  ['m-date','d-date'].forEach(id => { const e = el(id); if(e) e.value = today; });
  // Build cat pickers
  renderFormCatGrid('m-cat-picker');
  renderFormCatGrid('d-cat-picker');
  // Load profile fields
  const pname = el('profile-name-inp'); if(pname) pname.value = state.profile.name;
  const pcur = el('profile-currency'); if(pcur) pcur.value = state.profile.currency;
  
  // Initialize Google Workspace Sync
  if (window.googleSync) {
    window.googleSync.init();
    if (window.googleSync.isReady()) {
      window.googleSync.pullFromDrive(true); // Silent sync on load
    }
  }

  // Initial render
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
