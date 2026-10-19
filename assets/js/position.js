/* ═══════════════════════════════════════════════════════
   POSITIONS PAGE — JAVASCRIPT (Fixed Auto-Refresh, Input, INR & Limit Orders)
   ═══════════════════════════════════════════════════════ */

// ── State ──
let positions = JSON.parse(localStorage.getItem('positions') || '[]');
let pendingOrders = JSON.parse(localStorage.getItem('pending_orders') || '[]'); // Nayi array for Limit Orders
let pnlHistory = JSON.parse(localStorage.getItem('pnl_history') || '[]');
let posCounter = parseInt(localStorage.getItem('posCounter') || '1');
let currentFilter = 'all';
let targetPosId = null;
let editingPosId = null; 
let usdInrRate = 83.50; // Fallback rate

const positionsBody = document.getElementById('positions-body');
const positionsEmpty = document.getElementById('positions-empty');
const positionsCount = document.getElementById('positions-count');
const btnCloseAll = document.getElementById('btn-close-all');
const btnConfirmClose = document.getElementById('btn-confirm-close');
const closeModal = new bootstrap.Modal(document.getElementById('close-modal'));
const editModal = new bootstrap.Modal(document.getElementById('edit-tpsl-modal'));

// ── Live Price Fetcher ──
function getLivePrice(symbol, type = 'mid') {
  if (typeof state !== 'undefined' && state.ticks && state.ticks[symbol]) {
    return state.ticks[symbol][type] || 0;
  }
  return 0;
}

// ── Calculate P&L ──
function calculatePnL(pos, markPrice) {
  if (!markPrice || markPrice === 0) return 0;
  const diff = pos.side === 'BUY' ? (markPrice - pos.entry) : (pos.entry - markPrice);
  return diff * pos.lot * (pos.symbol === 'XAUUSD' ? 1000 : 1);
}

// ── UI Form Helpers ──
window.toggleOrderType = function() {
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
}

function updateLotCalc(symbol) {
  const pipEl = document.getElementById('lot-pip');
  if (pipEl) pipEl.textContent = symbol === 'XAUUSD' ? '$10.00 / pip' : '$0.01 / pip';
}

const posSymEl = document.getElementById('pos-symbol');
if (posSymEl) {
  posSymEl.addEventListener('change', (e) => updateLotCalc(e.target.value));
}

// ── Check if TP or SL was hit → auto-exit ──
function checkAutoExit(pos) {
  const markPrice = getLivePrice(pos.symbol, 'mid');
  if (!markPrice || markPrice === 0) return false;

  let hit = false;

  if (pos.side === 'BUY') {
    if (pos.tp && markPrice >= pos.tp) hit = true;
    else if (pos.sl && markPrice <= pos.sl) hit = true;
  } else {
    if (pos.tp && markPrice <= pos.tp) hit = true;
    else if (pos.sl && markPrice >= pos.sl) hit = true;
  }

  if (hit) {
    closePositionAtMarket(pos.id, 'Auto-exit (TP/SL)');
    return true;
  }
  return false;
}

// ── Check if Pending Limit Order is Hit ──
function checkPendingOrders() {
  if (pendingOrders.length === 0) return;

  const triggeredOrders = [];

  pendingOrders.forEach(order => {
    const markPrice = getLivePrice(order.symbol, 'mid');
    if (!markPrice || markPrice === 0) return;

    let isTriggered = false;

    // BUY Limit: triggers when live price drops to or below the limit price
    if (order.side === 'BUY' && markPrice <= order.entry) {
      isTriggered = true;
    }
    // SELL Limit: triggers when live price rises to or above the limit price
    else if (order.side === 'SELL' && markPrice >= order.entry) {
      isTriggered = true;
    }

    if (isTriggered) {
      // 1. Move to active positions
      order.status = 'open';
      order.timestamp = new Date().toISOString();
      positions.push(order);
      triggeredOrders.push(order.id);

      // 2. Notification
      if (typeof showNotification === 'function') {
        showNotification(
          'Limit Order Filled',
          `${order.symbol} ${order.side} executed at ${order.entry}`,
          'success'
        );
      }
    }
  });

  if (triggeredOrders.length > 0) {
    // Remove triggered orders from pending list
    pendingOrders = pendingOrders.filter(o => !triggeredOrders.includes(o.id));
    
    // Save state
    localStorage.setItem('pending_orders', JSON.stringify(pendingOrders));
    localStorage.setItem('positions', JSON.stringify(positions));
    
    renderPositions();
    triggerGlobalUIUpdate();
  }
}

// ── Open Position (Market or Limit) ──
window.openPosition = function(side) {
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

  if (type === 'MARKET') {
    entry = getLivePrice(symbol, side === 'BUY' ? 'ask' : 'bid');
    if (!entry || entry <= 0) {
      alert('Live prices are currently unavailable or $0.00. Please wait for the feed to connect.');
      return;
    }

    // Market Orders go straight to Positions
    const pos = {
      id: posCounter++,
      symbol,
      side,
      type,
      entry,
      lot,
      sl: isNaN(sl) ? null : sl,
      tp: isNaN(tp) ? null : tp,
      status: 'open',
      timestamp: new Date().toISOString()
    };
    
    positions.push(pos);
    localStorage.setItem('positions', JSON.stringify(positions));
    if (typeof showNotification === 'function') {
      showNotification('Market Order Filled', `${symbol} ${side} filled at ${entry.toFixed(2)}`, 'success');
    }

  } else {
    // LIMIT ORDERS
    if (isNaN(entry) || entry <= 0) {
      alert('Please enter a valid Entry Price greater than 0.');
      return;
    }
    
    const livePrice = getLivePrice(symbol, 'mid');
    if (livePrice > 0) {
      // Validate Limit Logic (Buy limit must be below current price, Sell limit above)
      if (side === 'BUY' && entry >= livePrice) {
        alert(`BUY Limit price (${entry}) must be below current price (${livePrice})`);
        return;
      }
      if (side === 'SELL' && entry <= livePrice) {
        alert(`SELL Limit price (${entry}) must be above current price (${livePrice})`);
        return;
      }
    }

    const pendingOrder = {
      id: posCounter++,
      symbol,
      side,
      type,
      entry,
      lot,
      sl: isNaN(sl) ? null : sl,
      tp: isNaN(tp) ? null : tp,
      status: 'pending',
      timestamp: new Date().toISOString()
    };

    pendingOrders.push(pendingOrder);
    localStorage.setItem('pending_orders', JSON.stringify(pendingOrders));
    if (typeof showNotification === 'function') {
      showNotification('Limit Order Placed', `Waiting for ${symbol} to reach ${entry.toFixed(2)}`, 'success');
    }
  }

  localStorage.setItem('posCounter', posCounter.toString());
  
  renderPositions();
  triggerGlobalUIUpdate();

  // Reset form inputs
  document.getElementById('pos-lot').value = '';
  document.getElementById('pos-sl').value = '';
  document.getElementById('pos-tp').value = '';
  if (type === 'LIMIT') document.getElementById('pos-entry').value = '';
}

// ── Manual Close Request (Triggers Modal) ──
window.closePosition = function(id) {
  targetPosId = id;
  const pos = positions.find(p => p.id === id);
  if (!pos) return;
  document.getElementById('close-modal-text').textContent = `Close ${pos.symbol} ${pos.side} (${pos.lot} lots) at market?`;
  closeModal.show();
};

if(btnConfirmClose) {
  btnConfirmClose.addEventListener('click', () => {
    if (targetPosId === null) return;
    closePositionAtMarket(targetPosId, 'Manual close');
    closeModal.hide();
    targetPosId = null;
  });
}

// ── Close Position Execution & Notification ──
function closePositionAtMarket(id, label) {
  const pos = positions.find(p => p.id === id);
  if (!pos) return;

  const markPrice = getLivePrice(pos.symbol, 'mid');
  const pnl = calculatePnL(pos, markPrice);
  const pnlSign = pnl >= 0 ? '+' : '';
  const pnlStr = `$${Math.abs(pnl).toFixed(2)}`;

  pnlHistory.push({
    id: pos.id,
    symbol: pos.symbol,
    side: pos.side,
    type: pos.type || 'MARKET',
    lot: pos.lot,
    entry: pos.entry,
    exitPrice: markPrice,
    pnl: pnl,
    pnlPercent: pos.entry ? (pnl / (pos.entry * pos.lot * (pos.symbol === 'XAUUSD' ? 10 : 0.1))) * 100 : 0,
    openedAt: pos.timestamp,
    closedAt: new Date().toISOString()
  });

  positions = positions.filter(p => p.id !== id);
  localStorage.setItem('positions', JSON.stringify(positions));
  localStorage.setItem('pnl_history', JSON.stringify(pnlHistory));

  const reasonTag = label ? `<b>(${label})</b>` : '';
  const isProfit = pnl >= 0;
  const notifType = isProfit ? 'success' : 'danger';
  const titleHtml = `Position Closed ${isProfit ? '✓' : '✗'}`;
  
  if(typeof showNotification === 'function') {
    showNotification(
      titleHtml,
      `${pos.symbol} ${pos.side} — Entry ${pos.entry.toFixed(2)} → Exit ${markPrice.toFixed(2)} <br/> <b>P&L: ${pnlSign}${pnlStr}</b> ${reasonTag}`,
      notifType
    );
  }

  renderPositions();
  triggerGlobalUIUpdate();
}

// ── Close All ──
if(btnCloseAll) {
  btnCloseAll.addEventListener('click', () => {
    if (positions.length === 0 || !confirm(`Close all ${positions.length} positions?`)) return;
    const positionsToClose = [...positions];
    positionsToClose.forEach(pos => {
      closePositionAtMarket(pos.id, 'Close all');
    });
  });
}

// ── Edit TP/SL ──
window.editTPSL = function(id) {
  const pos = positions.find(p => p.id === id);
  if (!pos) return;
  editingPosId = id;
  document.getElementById('edit-pos-id').value = id;
  document.getElementById('edit-tp').value = pos.tp || '';
  document.getElementById('edit-sl').value = pos.sl || '';
  editModal.show();
}

const btnSaveEdit = document.getElementById('btn-save-edit-tpsl');
if(btnSaveEdit) {
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
if(btnCancelEdit) {
  btnCancelEdit.addEventListener('click', () => {
    editModal.hide();
    editingPosId = null;
  });
}

// ── Render Positions ──
function renderPositions() {
  if (!positionsCount || !positionsBody) return;
  positionsCount.textContent = positions.length;

  const filtered = currentFilter === 'all'
    ? positions
    : positions.filter(p => p.side.toLowerCase() === currentFilter);

  if (filtered.length === 0) {
    positionsBody.innerHTML = '';
    if(positionsEmpty) {
      positionsBody.appendChild(positionsEmpty);
      positionsEmpty.style.display = '';
    }
    if(btnCloseAll) btnCloseAll.disabled = true;
  } else {
    if(positionsEmpty) positionsEmpty.style.display = 'none';
    if(btnCloseAll) btnCloseAll.disabled = false;

    positionsBody.innerHTML = filtered.map(pos => {
      const markPrice = getLivePrice(pos.symbol, 'mid');
      const pnl = calculatePnL(pos, markPrice);
      const isProfit = pnl >= 0;
      const pnlClass = isProfit ? 'text-success' : 'text-danger';
      const sideClass = pos.side === 'BUY' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger';
      const pnlPercent = pos.entry ? (pnl / (pos.entry * pos.lot * (pos.symbol === 'XAUUSD' ? 10 : 0.1))) * 100 : 0;
      const opened = new Date(pos.timestamp).toLocaleTimeString();
      const hasSlTp = pos.sl || pos.tp;

      return `
        <div class="list-row" data-id="${pos.id}">
          <div class="list-col fw-semibold text-white">${pos.symbol}</div>
          <div class="list-col"><span class="badge ${sideClass}" style="font-size:0.7rem">${pos.side}</span></div>
          <div class="list-col num text-white">${pos.lot}</div>
          <div class="list-col num text-white">${pos.entry.toFixed(2)}</div>
          <div class="list-col num fw-semibold text-info" id="mark-${pos.id}">${markPrice > 0 ? markPrice.toFixed(2) : '—'}</div>
          <div class="list-col num ${pnlClass}" id="pnl-${pos.id}">${isProfit ? '+' : ''}$${Math.abs(pnl).toFixed(2)}</div>
          <div class="list-col num ${pnlClass}" id="pnl-pct-${pos.id}">${isProfit ? '+' : ''}${pnlPercent.toFixed(2)}%</div>
          <div class="list-col num text-white d-flex align-items-center gap-1" style="font-size:0.8rem">
            ${hasSlTp ? `<span>${pos.sl ? 'SL:' + pos.sl.toFixed(2) + (pos.tp ? ' TP:' + pos.tp.toFixed(2) : '') : ''}</span>` : '<span class="text-muted small">—</span>'}
            <button class="btn btn-xs btn-tpsl-edit" onclick="editTPSL(${pos.id})" title="Edit TP/SL">
              <i class="fa-solid fa-gear"></i>
            </button>
          </div>
          <div class="list-col d-none d-xl-block text-muted" style="font-size:0.8rem">${opened}</div>
          <div class="list-col text-end">
            <button class="btn btn-sm btn-outline-danger" onclick="closePosition(${pos.id})">Close</button>
          </div>
        </div>
      `;
    }).join('');
  }

  updateSummary();
}

// ── Global UI Sync Hook ──
function triggerGlobalUIUpdate() {
  if (typeof syncPositionsToCharts === 'function') syncPositionsToCharts();
  if (typeof renderOpenOrders === 'function') renderOpenOrders();
  if (typeof loadOrders === 'function') loadOrders();
}

// ── Live Price Update Loop ──
function updateLivePrices() {
  // First, check if any pending limit orders got hit
  checkPendingOrders();

  if (positions.length === 0) return;

  let needsSummaryUpdate = false;

  positions.forEach(pos => {
    const markEl = document.getElementById(`mark-${pos.id}`);
    if (!markEl) return;

    const markPrice = getLivePrice(pos.symbol, 'mid');
    if (markPrice === 0) return;

    checkAutoExit(pos);

    needsSummaryUpdate = true;
    const pnl = calculatePnL(pos, markPrice);
    const isProfit = pnl >= 0;
    const pnlClass = isProfit ? 'text-success' : 'text-danger';
    const pnlPercent = pos.entry ? (pnl / (pos.entry * pos.lot * (pos.symbol === 'XAUUSD' ? 10 : 0.1))) * 100 : 0;

    markEl.textContent = markPrice.toFixed(2);

    const pnlEl = document.getElementById(`pnl-${pos.id}`);
    if (pnlEl) {
      pnlEl.textContent = `${isProfit ? '+' : ''}$${Math.abs(pnl).toFixed(2)}`;
      pnlEl.className = `list-col num ${pnlClass}`;
    }

    const pctEl = document.getElementById(`pnl-pct-${pos.id}`);
    if (pctEl) {
      pctEl.textContent = `${isProfit ? '+' : ''}${pnlPercent.toFixed(2)}%`;
      pctEl.className = `list-col num ${pnlClass}`;
    }
  });

  if (needsSummaryUpdate) updateSummary();
}

// ── Update Statistics ──
function updateSummary() {
  const profit = pnlHistory.filter(p => p.pnl > 0).reduce((sum, p) => sum + p.pnl, 0);
  const loss = Math.abs(pnlHistory.filter(p => p.pnl < 0).reduce((sum, p) => sum + p.pnl, 0));
  const realized = profit - loss;
  const balance = 1000;

  const unrealized = positions.reduce((sum, p) => sum + calculatePnL(p, getLivePrice(p.symbol, 'mid')), 0);
  const equity = balance + realized + unrealized;

  const marginUsed = positions.reduce((sum, p) => {
    const contractSize = p.symbol === 'XAUUSD' ? 100 : 1;
    return sum + ((p.entry * p.lot * contractSize) / 100);
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
  setElText('pnl-net', `${realized >= 0 ? '+' : ''}$${Math.abs(realized).toFixed(2)}`, `pnl-value ${realized >= 0 ? 'profit' : 'loss'}`);
  
  setElText('sum-balance', `$${(balance + realized).toLocaleString('en-US', {minimumFractionDigits: 2})}`);
  setElText('sum-equity', `$${equity.toLocaleString('en-US', {minimumFractionDigits: 2})}`);
  setElText('sum-upl', `${unrealized >= 0 ? '+' : ''}$${Math.abs(unrealized).toFixed(2)}`, `stat-value ${unrealized >= 0 ? 'text-success' : 'text-danger'}`);
  setElText('sum-upl-pct', `${((unrealized / balance) * 100).toFixed(2)}%`);
  setElText('sum-realized', `$${realized.toFixed(2)}`);
  
  const sumTrades = document.getElementById('sum-trades');
  if(sumTrades) sumTrades.textContent = pnlHistory.length;
  
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

// ── Filter Binding ──
document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderPositions();
  });
});

// ── Notifications & Audio ──
let notifAudioCtx = null;
function playNotificationSound(isSuccess = true) {
  try {
    const audio = new Audio('assets/css/notification.mp3');
    audio.play().catch(err => console.warn("Browser blocked audio autoplay:", err));
  } catch (e) {
    console.error("Audio playback error:", e);
  }
}

const notifBar = document.getElementById('notification-bar');
let notifTimeout = null;

window.showNotification = function(title, body, type = 'success') {
  if (!notifBar) return;
  if (notifTimeout) {
    clearTimeout(notifTimeout);
    notifBar.classList.remove('slide-out');
  }

  document.getElementById('notif-title').innerHTML = title;
  document.getElementById('notif-body').innerHTML = body;

  notifBar.className = `notification-bar ${type}`;
  const iconBox = document.getElementById('notif-icon-box');
  if(iconBox) iconBox.innerHTML = type === 'success' ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-exclamation"></i>';

  notifBar.classList.remove('d-none');
  playNotificationSound();
  notifTimeout = setTimeout(() => hideNotification(), 5000);
}

window.hideNotification = function() {
  if (!notifBar || !notifTimeout) return;
  clearTimeout(notifTimeout);
  notifBar.classList.add('slide-out');
  setTimeout(() => notifBar.classList.add('d-none'), 250);
}

// ── Fetch Live USD to INR Rate ──
async function fetchInrRate() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    if (data && data.rates && data.rates.INR) {
      usdInrRate = data.rates.INR;
    }
  } catch (error) {}
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
  if (posSymEl && typeof updateLotCalc === 'function') updateLotCalc(posSymEl.value);
  
  renderPositions();
  setInterval(updateLivePrices, 250);
});