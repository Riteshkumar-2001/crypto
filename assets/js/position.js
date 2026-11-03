/* ═══════════════════════════════════════════════════════
   POSITIONS PAGE — JS
   Fixes: notification popup, partial booking, math syntax
   Updates: Partial booking works on ANY lot size
   ═══════════════════════════════════════════════════════ */

// ── State ──
let positions = JSON.parse(localStorage.getItem('positions') || '[]');
let pendingOrders = JSON.parse(localStorage.getItem('pending_orders') || '[]');
let pnlHistory = JSON.parse(localStorage.getItem('pnl_history') || '[]');
let posCounter = parseInt(localStorage.getItem('posCounter') || '1');
let currentFilter = 'all';
let targetPosId = null;
let editingPosId = null;
let partialPosId = null;
let usdInrRate = 83.50; // Fallback rate

const positionsBody = document.getElementById('positions-body');
const positionsEmpty = document.getElementById('positions-empty');
const positionsCount = document.getElementById('positions-count');
const btnCloseAll = document.getElementById('btn-close-all');
const btnConfirmClose = document.getElementById('btn-confirm-close');
const closeModal = new bootstrap.Modal(document.getElementById('close-modal'));
const editModal = new bootstrap.Modal(document.getElementById('edit-tpsl-modal'));
const partialModal = new bootstrap.Modal(document.getElementById('partial-modal'));

// ── Helpers ──
const roundSize = (n) => parseFloat(Number(n).toFixed(4)); // Supports small decimals like 0.005
const lotMult = (symbol) => (symbol === 'XAUUSD' ? 1000 : 1);
const pctBase = (symbol) => (symbol === 'XAUUSD' ? 10 : 0.1);

function getLivePrice(symbol, type = 'mid') {
  if (typeof state !== 'undefined' && state.ticks && state.ticks[symbol]) {
    return state.ticks[symbol][type] || 0;
  }
  return 0;
}

// P&L for a given lot size (defaults to the full position lot)
function calculatePnL(pos, markPrice, lot = pos.lot) {
  if (!markPrice || markPrice === 0) return 0;
  const diff = pos.side === 'BUY' ? (markPrice - pos.entry) : (pos.entry - markPrice);
  return diff * lot * lotMult(pos.symbol);
}

function calcPnlPercent(pos, pnl, lot = pos.lot) {
  return pos.entry ? (pnl / (pos.entry * lot * pctBase(pos.symbol))) * 100 : 0;
}

// ── UI Form Helpers ──
window.toggleOrderType = function () {
  const type = document.getElementById('pos-type').value;
  const entryInput = document.getElementById('pos-entry');
  if (type === 'MARKET') {
    entryInput.value = '';
    entryInput.disabled = true;
    entryInput.placeholder = 'Auto (Live Price)';
  } else {
    entryInput.disabled = false;
    entryInput.placeholder = '0.00';
  }
};

function updateLotCalc(symbol) {
  const pipEl = document.getElementById('lot-pip');
  if (pipEl) pipEl.textContent = symbol === 'XAUUSD' ? '$10.00 / pip' : '$0.01 / pip';
}

const posSymEl = document.getElementById('pos-symbol');
if (posSymEl) posSymEl.addEventListener('change', (e) => updateLotCalc(e.target.value));

// ── Auto exit on TP / SL ──
function checkAutoExit(pos) {
  const markPrice = getLivePrice(pos.symbol, 'mid');
  if (!markPrice || markPrice === 0) return false;

  let hit = false;
  let reason = '';

  if (pos.side === 'BUY') {
    if (pos.tp && pos.tp > 0 && markPrice >= pos.tp) {
      hit = true;
      reason = 'Take Profit';
    } else if (pos.sl && pos.sl > 0 && markPrice <= pos.sl) {
      hit = true;
      reason = 'Stop Loss';
    }
  } else if (pos.side === 'SELL') {
    if (pos.tp && pos.tp > 0 && markPrice <= pos.tp) {
      hit = true;
      reason = 'Take Profit';
    } else if (pos.sl && pos.sl > 0 && markPrice >= pos.sl) {
      hit = true;
      reason = 'Stop Loss';
    }
  }

  if (hit) {
    closePositionAtMarket(pos.id, `Auto-exit (${reason})`);
    return true;
  }

  return false;
}

// ── Pending limit orders ──
function checkPendingOrders() {
  if (pendingOrders.length === 0) return;
  const triggered = [];

  pendingOrders.forEach(order => {
    const markPrice = getLivePrice(order.symbol, 'mid');
    if (!markPrice) return;

    const isTriggered =
      (order.side === 'BUY' && markPrice <= order.entry) ||
      (order.side === 'SELL' && markPrice >= order.entry);

    if (isTriggered) {
      order.status = 'open';
      order.timestamp = new Date().toISOString();
      positions.push(order);
      triggered.push(order.id);
      showNotification('Limit Order Filled', `${order.symbol} ${order.side} executed at ${order.entry}`, 'success');
    }
  });

  if (triggered.length > 0) {
    pendingOrders = pendingOrders.filter(o => !triggered.includes(o.id));
    localStorage.setItem('pending_orders', JSON.stringify(pendingOrders));
    localStorage.setItem('positions', JSON.stringify(positions));
    renderPositions();
    triggerGlobalUIUpdate();
  }
}

// ── Open position (Market or Limit) ──
window.openPosition = function (side) {
  const symbol = document.getElementById('pos-symbol').value;
  const type = document.getElementById('pos-type').value;
  const lot = parseFloat(document.getElementById('pos-lot').value);
  const sl = parseFloat(document.getElementById('pos-sl').value);
  const tp = parseFloat(document.getElementById('pos-tp').value);
  let entry = parseFloat(document.getElementById('pos-entry').value);

  if (isNaN(lot) || lot <= 0) {
    alert('Please enter a valid Lot Size.');
    return;
  }

  const base = {
    id: posCounter++,
    symbol, side, type, lot,
    sl: isNaN(sl) ? null : sl,
    tp: isNaN(tp) ? null : tp,
    timestamp: new Date().toISOString()
  };

  if (type === 'MARKET') {
    entry = getLivePrice(symbol, side === 'BUY' ? 'ask' : 'bid');
    if (!entry || entry <= 0) {
      posCounter--;
      alert('Live prices are currently unavailable or $0.00. Please wait for the feed to connect.');
      return;
    }
    positions.push({ ...base, entry, status: 'open' });
    localStorage.setItem('positions', JSON.stringify(positions));
    showNotification('Market Order Filled', `${symbol} ${side} filled at ${entry.toFixed(2)}`, 'success');
  } else {
    if (isNaN(entry) || entry <= 0) {
      posCounter--;
      alert('Please enter a valid Entry Price greater than 0.');
      return;
    }
    const livePrice = getLivePrice(symbol, 'mid');
    if (livePrice > 0) {
      if (side === 'BUY' && entry >= livePrice) {
        posCounter--;
        alert(`BUY Limit price (${entry}) must be below current price (${livePrice})`);
        return;
      }
      if (side === 'SELL' && entry <= livePrice) {
        posCounter--;
        alert(`SELL Limit price (${entry}) must be above current price (${livePrice})`);
        return;
      }
    }
    pendingOrders.push({ ...base, entry, status: 'pending' });
    localStorage.setItem('pending_orders', JSON.stringify(pendingOrders));
    showNotification('Limit Order Placed', `Waiting for ${symbol} to reach ${entry.toFixed(2)}`, 'success');
  }

  localStorage.setItem('posCounter', posCounter.toString());
  renderPositions();
  triggerGlobalUIUpdate();

  document.getElementById('pos-lot').value = '';
  document.getElementById('pos-sl').value = '';
  document.getElementById('pos-tp').value = '';
  if (type === 'LIMIT') document.getElementById('pos-entry').value = '';
};

// ── Full close (modal) ──
window.closePosition = function (id) {
  targetPosId = id;
  const pos = positions.find(p => p.id === id);
  if (!pos) return;
  document.getElementById('close-modal-text').textContent =
    `Close ${pos.symbol} ${pos.side} (${pos.lot} lots) at market?`;
  closeModal.show();
};

if (btnConfirmClose) {
  btnConfirmClose.addEventListener('click', () => {
    if (targetPosId === null) return;
    closePositionAtMarket(targetPosId, 'Manual close');
    closeModal.hide();
    targetPosId = null;
  });
}

// ── Core close routine ──
function closePositionAtMarket(id, label, closeLot = null) {
  const pos = positions.find(p => p.id === id);
  if (!pos) return;

  const markPrice = getLivePrice(pos.symbol, 'mid');
  let lotToClose = closeLot === null ? pos.lot : roundSize(closeLot);
  if (lotToClose >= pos.lot) lotToClose = pos.lot;     // full close
  const isPartial = lotToClose < pos.lot;

  const pnl = calculatePnL(pos, markPrice, lotToClose);
  const pnlSign = pnl >= 0 ? '+' : '-';
  const pnlStr = `$${Math.abs(pnl).toFixed(2)}`;

  pnlHistory.push({
    id: isPartial ? posCounter++ : pos.id,   
    parentId: pos.id,
    partial: isPartial,
    symbol: pos.symbol,
    side: pos.side,
    type: pos.type || 'MARKET',
    lot: lotToClose,
    entry: pos.entry,
    exitPrice: markPrice,
    pnl,
    pnlPercent: calcPnlPercent(pos, pnl, lotToClose),
    openedAt: pos.timestamp,
    closedAt: new Date().toISOString()
  });

  if (isPartial) {
    pos.lot = roundSize(pos.lot - lotToClose);
    localStorage.setItem('posCounter', posCounter.toString());
  } else {
    positions = positions.filter(p => p.id !== id);
  }

  localStorage.setItem('positions', JSON.stringify(positions));
  localStorage.setItem('pnl_history', JSON.stringify(pnlHistory));

  const reasonTag = label ? `<b>(${label})</b>` : '';
  const isProfit = pnl >= 0;
  const title = isPartial
    ? `Partial Close ${isProfit ? '✓' : '✗'}`
    : `Position Closed ${isProfit ? '✓' : '✗'}`;
  const lotInfo = isPartial ? ` — ${lotToClose} lots, ${pos.lot} remaining` : '';

  showNotification(
    title,
    `${pos.symbol} ${pos.side}${lotInfo}<br/>Entry ${pos.entry.toFixed(2)} → Exit ${markPrice.toFixed(2)}<br/><b>P&L: ${pnlSign}${pnlStr}</b> ${reasonTag}`,
    isProfit ? 'success' : 'danger'
  );

  renderPositions();
  triggerGlobalUIUpdate();
}

// ── Partial booking ──
function updatePartialEstimate() {
  const pos = positions.find(p => p.id === partialPosId);
  const est = document.getElementById('partial-est');
  if (!pos || !est) return;
  const lot = parseFloat(document.getElementById('partial-lot').value);
  const mark = getLivePrice(pos.symbol, 'mid');
  if (isNaN(lot) || lot <= 0 || !mark) { est.textContent = 'Est. P&L: —'; est.className = 'partial-est mt-3'; return; }
  const pnl = calculatePnL(pos, mark, Math.min(lot, pos.lot));
  est.textContent = `Est. P&L: ${pnl >= 0 ? '+' : '-'}$${Math.abs(pnl).toFixed(2)} @ ${mark.toFixed(2)}`;
  est.className = `partial-est mt-3 ${pnl >= 0 ? 'text-success' : 'text-danger'}`;
}

window.partialClose = function (id) {
  const pos = positions.find(p => p.id === id);
  if (!pos) return;
  
  partialPosId = id;
  document.getElementById('partial-info').textContent = `${pos.symbol} ${pos.side} — ${pos.lot} lots open`;
  
  const input = document.getElementById('partial-lot');
  input.max = pos.lot; 
  input.value = roundSize(pos.lot / 2); // Default to exactly 50%
  updatePartialEstimate();
  partialModal.show();
};

document.querySelectorAll('#partial-modal [data-pct]').forEach(btn => {
  btn.addEventListener('click', () => {
    const pos = positions.find(p => p.id === partialPosId);
    if (!pos) return;
    const lot = roundSize(pos.lot * parseInt(btn.dataset.pct, 10) / 100);
    document.getElementById('partial-lot').value = Math.min(lot, pos.lot);
    updatePartialEstimate();
  });
});

const partialLotEl = document.getElementById('partial-lot');
if (partialLotEl) partialLotEl.addEventListener('input', updatePartialEstimate);

const btnConfirmPartial = document.getElementById('btn-confirm-partial');
if (btnConfirmPartial) {
  btnConfirmPartial.addEventListener('click', () => {
    const pos = positions.find(p => p.id === partialPosId);
    if (!pos) return;
    const lot = parseFloat(document.getElementById('partial-lot').value);

    if (isNaN(lot) || lot <= 0) { alert('Enter a valid lot size to close.'); return; }
    if (lot >= pos.lot) { alert(`Use Close for the full position.`); return; }
    if (!getLivePrice(pos.symbol, 'mid')) { alert('Live price unavailable. Please wait for the feed.'); return; }

    closePositionAtMarket(partialPosId, 'Partial booking', lot);
    partialModal.hide();
    partialPosId = null;
  });
}

// ── Close all ──
if (btnCloseAll) {
  btnCloseAll.addEventListener('click', () => {
    if (positions.length === 0 || !confirm(`Close all ${positions.length} positions?`)) return;
    [...positions].forEach(pos => closePositionAtMarket(pos.id, 'Close all'));
  });
}

// ── Edit TP/SL ──
window.editTPSL = function (id) {
  const pos = positions.find(p => p.id === id);
  if (!pos) return;
  editingPosId = id;
  document.getElementById('edit-pos-id').value = id;
  document.getElementById('edit-tp').value = pos.tp || '';
  document.getElementById('edit-sl').value = pos.sl || '';
  editModal.show();
};

const btnSaveEdit = document.getElementById('btn-save-edit-tpsl');
if (btnSaveEdit) {
  btnSaveEdit.addEventListener('click', () => {
    if (editingPosId === null) return;
    const pos = positions.find(p => p.id === editingPosId);
    if (!pos) return;

    const tpVal = document.getElementById('edit-tp').value;
    const slVal = document.getElementById('edit-sl').value;
    pos.tp = tpVal ? parseFloat(tpVal) : null;
    pos.sl = slVal ? parseFloat(slVal) : null;

    localStorage.setItem('positions', JSON.stringify(positions));
    renderPositions();
    triggerGlobalUIUpdate();
    editModal.hide();
    editingPosId = null;
  });
}

const btnCancelEdit = document.getElementById('btn-cancel-edit-tpsl');
if (btnCancelEdit) {
  btnCancelEdit.addEventListener('click', () => {
    editModal.hide();
    editingPosId = null;
  });
}

// ── Render positions ──
function renderPositions() {
  if (!positionsCount || !positionsBody) return;
  positionsCount.textContent = positions.length;

  const filtered = currentFilter === 'all'
    ? positions
    : positions.filter(p => p.side.toLowerCase() === currentFilter);

  if (filtered.length === 0) {
    positionsBody.innerHTML = '';
    if (positionsEmpty) {
      positionsBody.appendChild(positionsEmpty);
      positionsEmpty.style.display = '';
    }
    if (btnCloseAll) btnCloseAll.disabled = true;
  } else {
    if (positionsEmpty) positionsEmpty.style.display = 'none';
    if (btnCloseAll) btnCloseAll.disabled = false;

    positionsBody.innerHTML = filtered.map(pos => {
      const markPrice = getLivePrice(pos.symbol, 'mid');
      const pnl = calculatePnL(pos, markPrice);
      const isProfit = pnl >= 0;
      const pnlClass = isProfit ? 'text-success' : 'text-danger';
      const sideClass = pos.side === 'BUY' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger';
      const pnlPercent = calcPnlPercent(pos, pnl);
      const opened = new Date(pos.timestamp).toLocaleTimeString();
      const hasSlTp = pos.sl || pos.tp;

      return `
        <div class="list-row" data-id="${pos.id}">
          <div data-label="Symbol" class="list-col fw-semibold text-white">${pos.symbol}</div>
          <div data-label="Side" class="list-col"><span class="badge ${sideClass}" style="font-size:0.7rem">${pos.side}</span></div>
          <div data-label="Size" class="list-col num text-white">${pos.lot}</div>
          <div data-label="Entry" class="list-col num text-white">${pos.entry.toFixed(2)}</div>
          <div data-label="Mark" class="list-col num fw-semibold text-info" id="mark-${pos.id}">${markPrice > 0 ? markPrice.toFixed(2) : '—'}</div>
          <div data-label="P&L" class="list-col num ${pnlClass}" id="pnl-${pos.id}">${isProfit ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}</div>
          <div data-label="P&L %" class="list-col num ${pnlClass}" id="pnl-pct-${pos.id}">${isProfit ? '+' : ''}${pnlPercent.toFixed(2)}%</div>
          <div data-label="SL / TP" class="list-col num text-white d-flex align-items-center gap-1" style="font-size:0.8rem">
            ${hasSlTp ? `<span>${pos.sl ? 'SL:' + pos.sl.toFixed(2) : ''}${pos.tp ? ' TP:' + pos.tp.toFixed(2) : ''}</span>` : '<span class="text-muted small">—</span>'}
            <button class="btn btn-xs btn-tpsl-edit" onclick="editTPSL(${pos.id})" title="Edit TP/SL">
              <i class="fa-solid fa-gear"></i>
            </button>
          </div>
          <div data-label="Opened" class="list-col d-none d-xl-block text-muted" style="font-size:0.8rem">${opened}</div>
          <div class="list-col text-end row-actions">
            <button class="btn btn-sm btn-outline-warning" onclick="partialClose(${pos.id})" title="Book partial profit/loss">
              <i class="fa-solid fa-scissors"></i> Partial
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="closePosition(${pos.id})">Close</button>
          </div>
        </div>
      `;
    }).join('');
  }

  updateSummary();
}

// ── Global UI sync hook ──
function triggerGlobalUIUpdate() {
  if (typeof syncPositionsToCharts === 'function') syncPositionsToCharts();
  if (typeof renderOpenOrders === 'function') renderOpenOrders();
  if (typeof loadOrders === 'function') loadOrders();
}

// ── Live price loop ──
function updateLivePrices() {
  checkPendingOrders();
  if (positions.length === 0) return;

  let needsSummaryUpdate = false;

  [...positions].forEach(pos => {
    const markEl = document.getElementById(`mark-${pos.id}`);
    if (!markEl) return;

    const markPrice = getLivePrice(pos.symbol, 'mid');
    if (markPrice === 0) return;

    if (checkAutoExit(pos)) return;

    needsSummaryUpdate = true;
    const pnl = calculatePnL(pos, markPrice);
    const isProfit = pnl >= 0;
    const pnlClass = isProfit ? 'text-success' : 'text-danger';
    const pnlPercent = calcPnlPercent(pos, pnl);

    markEl.textContent = markPrice.toFixed(2);

    const pnlEl = document.getElementById(`pnl-${pos.id}`);
    if (pnlEl) {
      pnlEl.textContent = `${isProfit ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`;
      pnlEl.className = `list-col num ${pnlClass}`;
    }
    const pctEl = document.getElementById(`pnl-pct-${pos.id}`);
    if (pctEl) {
      pctEl.textContent = `${isProfit ? '+' : ''}${pnlPercent.toFixed(2)}%`;
      pctEl.className = `list-col num ${pnlClass}`;
    }
  });

  if (needsSummaryUpdate) updateSummary();
  if (partialPosId !== null) updatePartialEstimate();
}

// ── Summary stats ──
function updateSummary() {
  const profit = pnlHistory.filter(p => p.pnl > 0).reduce((s, p) => s + p.pnl, 0);
  const loss = Math.abs(pnlHistory.filter(p => p.pnl < 0).reduce((s, p) => s + p.pnl, 0));
  const realized = profit - loss;
  const balance = 1000;

  const unrealized = positions.reduce((s, p) => s + calculatePnL(p, getLivePrice(p.symbol, 'mid')), 0);
  const equity = balance + realized + unrealized;

  const marginUsed = positions.reduce((s, p) => {
    const contractSize = p.symbol === 'XAUUSD' ? 100 : 1;
    return s + ((p.entry * p.lot * contractSize) / 100);
  }, 0);

  const setElText = (id, text, className) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text;
      if (className) el.className = className;
    }
  };

  setElText('pnl-profit', `$${profit.toFixed(2)}`);
  setElText('pnl-loss', `$${loss.toFixed(2)}`);
  setElText('pnl-net', `${realized >= 0 ? '+' : '-'}$${Math.abs(realized).toFixed(2)}`, `pnl-value ${realized >= 0 ? 'profit' : 'loss'}`);

  setElText('sum-balance', `$${(balance + realized).toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  setElText('sum-equity', `$${equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
  setElText('sum-upl', `${unrealized >= 0 ? '+' : '-'}$${Math.abs(unrealized).toFixed(2)}`, `stat-value ${unrealized >= 0 ? 'text-success' : 'text-danger'}`);
  setElText('sum-upl-pct', `${((unrealized / balance) * 100).toFixed(2)}%`);
  setElText('sum-realized', `$${realized.toFixed(2)}`);
  setElText('sum-trades', pnlHistory.length);
  setElText('sum-margin', `$${marginUsed.toFixed(2)}`);
  setElText('sum-free', `$${(equity - marginUsed).toFixed(2)}`);

  setElText('sum-equity-inr', formatInr(equity));
  setElText('sum-upl-inr', formatInr(unrealized), `stat-sub mt-1 ${unrealized >= 0 ? 'text-success' : 'text-danger'}`);
  setElText('sum-realized-inr', formatInr(realized));
  setElText('sum-margin-inr', formatInr(marginUsed));
  setElText('pnl-profit-inr', formatInr(profit));
  setElText('pnl-loss-inr', formatInr(loss));
  setElText('pnl-net-inr', formatInr(realized));
}

// ── Filter binding ──
document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderPositions();
  });
});

/* ═══════════════ NOTIFICATIONS ═══════════════ */
let notifTimeout = null;
let notifHideTimeout = null;

let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  return audioCtx;
}
['pointerdown', 'keydown', 'touchstart'].forEach(evt =>
  window.addEventListener(evt, () => {
    const ctx = getAudioCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }, { once: true, passive: true })
);

function beep(type = 'success') {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const notes = type === 'success' ? [880, 1320] : [520, 330];
  const t0 = ctx.currentTime;
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = t0 + i * 0.16;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  });
}

function playNotificationSound(type = 'success') {
  try {
    const audio = new Audio('assets/css/notification.mp3');
    audio.volume = 0.8;
    audio.addEventListener('error', () => beep(type));
    audio.play().catch(() => beep(type));
  } catch (e) {
    beep(type);
  }
}

window.showNotification = function (title, body, type = 'success') {
  const bar = document.getElementById('notification-bar');
  if (!bar) { console.warn('#notification-bar not found in DOM'); return; }

  clearTimeout(notifTimeout);
  clearTimeout(notifHideTimeout);

  document.getElementById('notif-title').innerHTML = title;
  document.getElementById('notif-body').innerHTML = body;

  bar.className = `notification-bar ${type}`;
  const iconBox = document.getElementById('notif-icon-box');
  if (iconBox) {
    iconBox.innerHTML = type === 'success'
      ? '<i class="fa-solid fa-check"></i>'
      : '<i class="fa-solid fa-exclamation"></i>';
  }

  playNotificationSound(type);
  notifTimeout = setTimeout(hideNotification, 5000);
};

window.hideNotification = function () {
  const bar = document.getElementById('notification-bar');
  if (!bar) return;
  clearTimeout(notifTimeout);
  clearTimeout(notifHideTimeout);
  bar.classList.add('slide-out');
  notifHideTimeout = setTimeout(() => bar.classList.add('d-none'), 250);
};

/* ═══════════════ INR rate ═══════════════ */
async function fetchInrRate() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    if (data && data.rates && data.rates.INR) usdInrRate = data.rates.INR;
  } catch (error) { }
}
fetchInrRate();
setInterval(fetchInrRate, 3600000);

function formatInr(usdValue) {
  const inrValue = usdValue * usdInrRate;
  const sign = inrValue >= 0 ? '' : '-';
  return `${sign}₹${Math.abs(inrValue).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  if (typeof toggleOrderType === 'function') toggleOrderType();
  if (posSymEl) updateLotCalc(posSymEl.value);
  renderPositions();
  setInterval(updateLivePrices, 250);
});