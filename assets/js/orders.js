/* ═══════════════════════════════════════════════════════
   ORDERS PAGE — JAVASCRIPT (Fixed Auto-Refresh Bug & Cancel Bug)
   ═══════════════════════════════════════════════════════ */

const openOrdersBody = document.getElementById('open-orders-body');
const openOrdersEmpty = document.getElementById('open-orders-empty');
const openOrdersCount = document.getElementById('open-orders-count');
const ordersBody = document.getElementById('orders-body');
const ordersEmpty = document.getElementById('orders-empty');
const ordersCount = document.getElementById('orders-count');
const btnClearHistory = document.getElementById('btn-clear-history');

// ── Live price helper ──
function getLiveMid(symbol) {
  if (typeof state !== 'undefined' && state.ticks && state.ticks[symbol]) {
    return state.ticks[symbol].mid || 0;
  }
  return 0;
}

// ── Render Open Orders (HTML Table Build - Only called once or when deleted) ──
function renderOpenOrders() {
  if (!openOrdersBody) return;

  const allPositions = JSON.parse(localStorage.getItem('positions') || '[]');
  const pendingLimits = JSON.parse(localStorage.getItem('pending_orders') || '[]');
  const openOrders = [];

  // 1. Gather active SL/TP orders from open positions
  allPositions.forEach(pos => {
    if (pos.sl) openOrders.push({ symbol: pos.symbol, side: pos.side, type: 'SL', price: pos.sl, relatedId: pos.id, lot: pos.lot, entry: pos.entry, timestamp: pos.timestamp });
    if (pos.tp) openOrders.push({ symbol: pos.symbol, side: pos.side, type: 'TP', price: pos.tp, relatedId: pos.id, lot: pos.lot, entry: pos.entry, timestamp: pos.timestamp });
  });

  // 2. Gather un-triggered Limit Entry Orders
  pendingLimits.forEach(limitOrder => {
    openOrders.push({
      symbol: limitOrder.symbol,
      side: limitOrder.side,
      type: 'LIMIT',
      price: limitOrder.entry, 
      relatedId: limitOrder.id,
      lot: limitOrder.lot,
      entry: 0, 
      timestamp: limitOrder.timestamp
    });
  });

  if (openOrdersCount) openOrdersCount.textContent = openOrders.length;

  if (openOrders.length === 0) {
    openOrdersBody.innerHTML = '';
    if (openOrdersEmpty) {
      openOrdersBody.appendChild(openOrdersEmpty);
      openOrdersEmpty.style.display = '';
    }
  } else {
    if (openOrdersEmpty) openOrdersEmpty.style.display = 'none';

    openOrdersBody.innerHTML = openOrders.map(order => {
      const sideClass = order.side === 'BUY' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger';
      
      let typeBg = 'bg-secondary-subtle text-secondary';
      if (order.type === 'SL') typeBg = 'bg-danger-subtle text-danger';
      else if (order.type === 'TP') typeBg = 'bg-success-subtle text-success';
      else if (order.type === 'LIMIT') typeBg = 'bg-warning-subtle text-warning';

      const mid = getLiveMid(order.symbol);
      let distance = '—';
      let distColor = 'text-muted';

      if (mid > 0) {
        const diff = mid - order.price;
        const pct = (diff / order.price) * 100;
        distance = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} (${diff >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
        distColor = diff >= 0 ? 'text-success' : 'text-danger';
      }

      const relatedText = order.type === 'LIMIT' 
        ? `Awaiting Entry` 
        : `pos #${order.relatedId} · ${order.entry.toFixed(2)}`;

      const uniqueRowId = `${order.type}-${order.relatedId}`;

      return `
        <tr data-pos-id="${order.relatedId}" data-type="${order.type}" data-price="${order.price}">
          <td class="col-symbol fw-semibold text-white">${order.symbol}</td>
          <td class="col-side"><span class="badge ${sideClass}" style="font-size:0.65rem">${order.side}</span></td>
          <td class="col-type"><span class="badge ${typeBg}" style="font-size:0.65rem">${order.type}</span></td>
          <td class="col-price text-white">${order.price.toFixed(2)}</td>
          <td class="col-related text-muted" style="font-size:0.75rem">${relatedText}</td>
          <td class="col-distance ${distColor}" id="dist-${uniqueRowId}" style="font-size:0.75rem">${distance}</td>
          <td class="col-status"><span class="badge rounded-pill bg-info-subtle text-info" style="font-size:0.65rem">Pending</span></td>
          <td class="col-action text-end">
            <button class="btn btn-xs btn-outline-danger btn-cancel-order" data-pos-id="${order.relatedId}" data-type="${order.type}" title="Cancel this order">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }
}

// ── Live Text Update Loop (Prevents Buttons from vanishing) ──
function updateLiveDistances() {
  if (!openOrdersBody) return;
  const rows = openOrdersBody.querySelectorAll('tr[data-pos-id]');
  
  rows.forEach(row => {
    const type = row.dataset.type;
    const posId = row.dataset.posId;
    const price = parseFloat(row.dataset.price);
    const symEl = row.querySelector('.col-symbol');
    
    if (!symEl) return;
    const symbol = symEl.textContent;

    const mid = getLiveMid(symbol);
    if (mid > 0) {
      const diff = mid - price;
      const pct = (diff / price) * 100;
      const distanceStr = `${diff >= 0 ? '+' : ''}${diff.toFixed(2)} (${diff >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
      const distColor = diff >= 0 ? 'text-success' : 'text-danger';

      const distEl = document.getElementById(`dist-${type}-${posId}`);
      if (distEl) {
        distEl.textContent = distanceStr;
        distEl.className = `col-distance ${distColor}`;
      }
    }
  });
}

// ── Event Delegation for Cancellation ──
if (openOrdersBody) {
  openOrdersBody.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-cancel-order');
    if (!btn) return;
    
    const posId = parseInt(btn.dataset.posId);
    const orderType = btn.dataset.type; // SL, TP, or LIMIT

    if (orderType === 'LIMIT') {
      let pendingLimits = JSON.parse(localStorage.getItem('pending_orders') || '[]');
      pendingLimits = pendingLimits.filter(p => p.id !== posId);
      localStorage.setItem('pending_orders', JSON.stringify(pendingLimits));
    } else {
      let allPositions = JSON.parse(localStorage.getItem('positions') || '[]');
      const pos = allPositions.find(p => p.id === posId);
      if (pos) {
        if (orderType === 'SL') pos.sl = null;
        else pos.tp = null;
        localStorage.setItem('positions', JSON.stringify(allPositions.map(p => p.id === posId ? pos : p)));
      }
    }

    // Sirf tabhi render karein jab delete ho chuka ho, taaki HTML update ho.
    renderOpenOrders();
  });
}

// ── Closed Order History ──
function loadOrders() {
  if (!ordersCount || !ordersBody) return;

  const history = JSON.parse(localStorage.getItem('pnl_history') || '[]');
  ordersCount.textContent = history.length;

  if (history.length === 0) {
    ordersBody.innerHTML = '';
    if(ordersEmpty) {
      ordersBody.appendChild(ordersEmpty);
      ordersEmpty.style.display = '';
    }
    if(btnClearHistory) btnClearHistory.disabled = true;
  } else {
    if(ordersEmpty) ordersEmpty.style.display = 'none';
    if(btnClearHistory) btnClearHistory.disabled = false;

    const reversed = [...history].reverse();

    ordersBody.innerHTML = reversed.map(order => {
      const isProfit = (order.pnl || 0) >= 0;
      const pnlClass = isProfit ? 'text-success' : 'text-danger';
      const sideClass = order.side === 'BUY' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger';

      const closedAt = order.closedAt
        ? new Date(order.closedAt).toLocaleString()
        : (order.date ? new Date(order.date).toLocaleString() : '—');

      const entryPrice = typeof order.entry === 'number' ? order.entry.toFixed(2) : '—';
      const exitPrice = typeof order.exitPrice === 'number' ? order.exitPrice.toFixed(2) : (order.exit ? order.exit.toFixed(2) : '—');
      const lot = order.lot || '0.01';
      const type = order.type || 'MARKET';
      const reason = order.reason || '';

      return `
        <tr>
          <td class="col-symbol fw-semibold text-white">${order.symbol || '—'}</td>
          <td class="col-side"><span class="badge ${sideClass}" style="font-size:0.65rem">${order.side || '—'}</span></td>
          <td class="col-type"><span class="badge bg-secondary-subtle text-secondary" style="font-size:0.65rem">${type}</span></td>
          <td class="col-size text-white">${lot}</td>
          <td class="col-entry text-white">${entryPrice}</td>
          <td class="col-exit text-info">${exitPrice}</td>
          <td class="col-pnl fw-bold ${pnlClass}">${isProfit ? '+' : ''}$${(order.pnl || 0).toFixed(2)}</td>
          <td class="col-pnl-pct ${pnlClass}">${isProfit ? '+' : ''}${(order.pnlPercent || 0).toFixed(2)}%</td>
          <td class="col-date" style="font-size:0.7rem">
            ${closedAt}
            ${reason ? `<br><span class="badge bg-dark-subtle text-muted" style="font-size:0.6rem">${reason}</span>` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  updateOrderStats(history);
}

function updateOrderStats(history) {
  const total = history.length;
  const wins = history.filter(o => (o.pnl || 0) > 0);
  const losses = history.filter(o => (o.pnl || 0) < 0);

  const profitSum = wins.reduce((acc, o) => acc + (o.pnl || 0), 0);
  const lossSum = Math.abs(losses.reduce((acc, o) => acc + (o.pnl || 0), 0));
  const netPnl = profitSum - lossSum;
  const winRate = total > 0 ? ((wins.length / total) * 100).toFixed(1) : '0.0';

  const setElText = (id, text, className) => {
    const el = document.getElementById(id);
    if(el) {
      el.textContent = text;
      if(className) el.className = className;
    }
  }

  setElText('stat-total-orders', total);
  setElText('stat-win-rate', `${winRate}%`);
  setElText('stat-net-pnl', `${netPnl >= 0 ? '+' : ''}$${netPnl.toFixed(2)}`, `stat-value ${netPnl >= 0 ? 'text-success' : 'text-danger'}`);
  setElText('stat-wins', wins.length);
  setElText('stat-profit-sum', `+$${profitSum.toFixed(2)}`);
  setElText('stat-losses', losses.length);
  setElText('stat-loss-sum', `-$${lossSum.toFixed(2)}`);
}

if (btnClearHistory) {
  btnClearHistory.addEventListener('click', () => {
    if (!confirm('Are you sure you want to clear your entire trade history? This cannot be undone.')) return;
    localStorage.setItem('pnl_history', '[]');
    loadOrders();
  });
}

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
  renderOpenOrders();
  loadOrders();
  // Instead of re-building the HTML every 500ms, just update the live text numbers
  setInterval(updateLiveDistances, 500); 
});