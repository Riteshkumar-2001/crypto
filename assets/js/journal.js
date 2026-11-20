/* ═══════════════════════════════════════════════════════
   JOURNAL PAGE — JAVASCRIPT (Month-Wise + Advanced Metrics)
   ═══════════════════════════════════════════════════════ */

const INITIAL_BALANCE = 1000;
let equityChartInstance = null;
let selectedMonth = 'all';

// DOM Elements
const journalBody = document.getElementById('journal-body');
const journalEmpty = document.getElementById('journal-empty');
const journalCount = document.getElementById('journal-count');
const monthFilter = document.getElementById('month-filter');
const monthlySummaryBody = document.getElementById('monthly-summary-body');

// ── Format Helpers ──
function formatMoney(value) {
  return (value >= 0 ? '$' : '-$') + Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getMonthKey(isoString) {
  const d = new Date(isoString || Date.now());
  if (isNaN(d.getTime())) return 'unknown';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`; // e.g., "2026-11"
}

function formatMonthLabel(monthKey) {
  if (monthKey === 'unknown') return 'Unknown Date';
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }); // e.g., "November 2026"
}

// ── Populate Month Dropdown ──
function populateMonthFilter(allTrades) {
  if (!monthFilter) return;
  const monthKeys = [...new Set(allTrades.map(t => getMonthKey(t.closedAt || t.date)))]
    .sort((a, b) => b.localeCompare(a)); // Newest month first

  const prevValue = selectedMonth;
  monthFilter.innerHTML = `<option value="all">All Months (${allTrades.length})</option>` +
    monthKeys.map(key => {
      const count = allTrades.filter(t => getMonthKey(t.closedAt || t.date) === key).length;
      return `<option value="${key}">${formatMonthLabel(key)} (${count})</option>`;
    }).join('');

  monthFilter.value = monthKeys.includes(prevValue) ? prevValue : 'all';
  selectedMonth = monthFilter.value;
}

// ── Render Monthly Performance Table ──
function renderMonthlySummary(allTrades) {
  if (!monthlySummaryBody) return;

  if (allTrades.length === 0) {
    monthlySummaryBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No monthly data yet</td></tr>`;
    return;
  }

  const groups = {};
  allTrades.forEach(t => {
    const key = getMonthKey(t.closedAt || t.date);
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });

  const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  monthlySummaryBody.innerHTML = sortedKeys.map(key => {
    const trades = groups[key];
    const wins = trades.filter(t => (t.pnl || 0) > 0).length;
    const losses = trades.filter(t => (t.pnl || 0) < 0).length;
    const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
    const netPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const isProfit = netPnl >= 0;
    const isActive = selectedMonth === key ? 'table-active' : '';

    return `
      <tr class="${isActive}" style="cursor: pointer;" onclick="selectMonth('${key}')" title="Click to filter by ${formatMonthLabel(key)}">
        <td class="fw-semibold text-white">${formatMonthLabel(key)}</td>
        <td class="text-end">${trades.length}</td>
        <td class="text-end">
          <span class="text-success">${wins}W</span> / <span class="text-danger">${losses}L</span>
        </td>
        <td class="text-end">${winRate.toFixed(1)}%</td>
        <td class="text-end fw-bold ${isProfit ? 'text-success' : 'text-danger'}">
          ${isProfit ? '+' : ''}${formatMoney(netPnl)}
        </td>
      </tr>
    `;
  }).join('');
}

window.selectMonth = function (key) {
  selectedMonth = (selectedMonth === key) ? 'all' : key;
  if (monthFilter) monthFilter.value = selectedMonth;
  loadJournal();
};

// ── Main Load Function ──
function loadJournal() {
  const history = JSON.parse(localStorage.getItem('pnl_history') || '[]');

  // Sort ALL trades chronologically first to keep running balance accurate
  const chronAll = [...history].sort((a, b) => new Date(a.closedAt || a.date) - new Date(b.closedAt || b.date));

  let runningBal = INITIAL_BALANCE;
  const enrichedAll = chronAll.map((trade, index) => {
    runningBal += (trade.pnl || 0);
    return {
      ...trade,
      runningBalance: runningBal,
      tradeNum: index + 1,
      monthKey: getMonthKey(trade.closedAt || trade.date)
    };
  });

  populateMonthFilter(enrichedAll);
  renderMonthlySummary(enrichedAll);

  // Filter by selected month
  const filtered = selectedMonth === 'all'
    ? enrichedAll
    : enrichedAll.filter(t => t.monthKey === selectedMonth);

  journalCount.textContent = filtered.length;

  if (filtered.length === 0) {
    journalBody.innerHTML = '';
    if (journalEmpty) {
      journalBody.appendChild(journalEmpty);
      journalEmpty.style.display = '';
    }
    updateStats([], INITIAL_BALANCE, 0, 0);
    renderChart([INITIAL_BALANCE], ['Start']);
    return;
  }

  if (journalEmpty) journalEmpty.style.display = 'none';

  // Starting balance for the selected period
  const firstTrade = filtered[0];
  const periodStartBalance = selectedMonth === 'all'
    ? INITIAL_BALANCE
    : (firstTrade.runningBalance - (firstTrade.pnl || 0));

  let currentBalance = periodStartBalance;
  let peakBalance = periodStartBalance;
  let maxDrawdown = 0;

  const chartData = [periodStartBalance];
  const chartLabels = ['Start'];

  filtered.forEach((trade, i) => {
    currentBalance += (trade.pnl || 0);
    if (currentBalance > peakBalance) peakBalance = currentBalance;
    const dd = peakBalance - currentBalance;
    if (dd > maxDrawdown) maxDrawdown = dd;

    chartData.push(currentBalance);
    chartLabels.push(`#${trade.tradeNum}`);
  });

  const totalReturnPct = periodStartBalance > 0
    ? ((currentBalance - periodStartBalance) / periodStartBalance) * 100
    : 0;

  updateStats(filtered, currentBalance, totalReturnPct, maxDrawdown, periodStartBalance);
  renderChart(chartData, chartLabels, periodStartBalance);

  // Group trades month-wise (newest month & newest trade first)
  const reversed = [...filtered].reverse();
  const groupedByMonth = {};
  reversed.forEach(trade => {
    if (!groupedByMonth[trade.monthKey]) groupedByMonth[trade.monthKey] = [];
    groupedByMonth[trade.monthKey].push(trade);
  });

  const monthKeysDesc = Object.keys(groupedByMonth).sort((a, b) => b.localeCompare(a));

  journalBody.innerHTML = monthKeysDesc.map(key => {
    const trades = groupedByMonth[key];
    const monthPnl = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const isMonthProfit = monthPnl >= 0;

    const headerHtml = `
      <div class="d-flex justify-content-between align-items-center px-3 py-2 border-bottom border-secondary"
           style="background: rgba(255, 255, 255, 0.04); font-size: 0.8rem;">
        <span class="fw-semibold text-white">
          <i class="fa-regular fa-calendar me-1 text-info"></i> ${formatMonthLabel(key)}
          <span class="badge rounded-pill bg-secondary ms-1">${trades.length}</span>
        </span>
        <span class="fw-bold ${isMonthProfit ? 'text-success' : 'text-danger'}">
          Month Net: ${isMonthProfit ? '+' : ''}${formatMoney(monthPnl)}
        </span>
      </div>
    `;

    const rowsHtml = trades.map(trade => {
      const isProfit = (trade.pnl || 0) >= 0;
      const pnlClass = isProfit ? 'text-success' : 'text-danger';
      const sideClass = trade.side === 'BUY' ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger';

      return `
        <div class="list-row">
          <div class="list-col text-muted">#${trade.tradeNum}</div>
          <div class="list-col fw-semibold text-white">${trade.symbol || '—'}</div>
          <div class="list-col"><span class="badge ${sideClass}">${trade.side || '—'}</span></div>
          <div class="list-col num text-white">${trade.lot || '0.01'}</div>
          <div class="list-col num text-white">${typeof trade.entry === 'number' ? trade.entry.toFixed(2) : '—'}</div>
          <div class="list-col num text-info">${typeof trade.exitPrice === 'number' ? trade.exitPrice.toFixed(2) : (trade.exit ? trade.exit.toFixed(2) : '—')}</div>
          <div class="list-col num fw-bold ${pnlClass}">${isProfit ? '+' : ''}${formatMoney(trade.pnl || 0)}</div>
          <div class="list-col num text-white">${formatMoney(trade.runningBalance)}</div>
          <div class="list-col text-muted" style="font-size:0.75rem">${formatDate(trade.openedAt || trade.date)}</div>
          <div class="list-col text-muted" style="font-size:0.75rem">${formatDate(trade.closedAt || trade.date)}</div>
        </div>
      `;
    }).join('');

    return headerHtml + rowsHtml;
  }).join('');
}

// ── Stats Updater ──
function updateStats(history, finalBalance, returnPct, maxDrawdown, baseBalance = INITIAL_BALANCE) {
  const isOverallProfit = finalBalance >= baseBalance;
  const totalTrades = history.length;

  const winningTrades = history.filter(t => (t.pnl || 0) > 0);
  const losingTrades = history.filter(t => (t.pnl || 0) < 0);

  const winCount = winningTrades.length;
  const lossCount = losingTrades.length;

  const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
  const lossRate = totalTrades > 0 ? (lossCount / totalTrades) * 100 : 0;

  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

  const avgWin = winCount > 0 ? (grossProfit / winCount) : 0;
  const avgLoss = lossCount > 0 ? (grossLoss / lossCount) : 0;

  let profitFactor = '0.00';
  let pfClass = 'text-danger';

  if (grossLoss === 0 && grossProfit > 0) {
    profitFactor = 'Perfect (No Losses)';
    pfClass = 'text-success';
  } else if (grossLoss > 0) {
    const pfValue = grossProfit / grossLoss;
    profitFactor = pfValue.toFixed(2);
    pfClass = pfValue >= 1 ? 'text-success' : 'text-danger';
  }

  const setElText = (id, text, className) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = text;
      if (className) el.className = className;
    }
  };

  setElText('journal-equity', formatMoney(finalBalance), `stat-value ${isOverallProfit ? 'text-success' : 'text-danger'}`);
  setElText('journal-return', `${isOverallProfit && returnPct > 0 ? '+' : ''}${returnPct.toFixed(2)}%`, `stat-value ${isOverallProfit ? 'text-success' : 'text-danger'}`);
  setElText('journal-drawdown', `-${formatMoney(maxDrawdown)}`);

  setElText('journal-win-rate', `${winRate.toFixed(1)}%`);
  setElText('journal-loss-rate', `${lossRate.toFixed(1)}%`);
  setElText('journal-win-loss-count', `${winCount} Wins / ${lossCount} Losses`);

  setElText('journal-avg-win', `+${formatMoney(avgWin)}`);
  setElText('journal-avg-loss', `-${formatMoney(avgLoss)}`);

  setElText('journal-profit-factor', profitFactor, `stat-value ${pfClass}`);
}

// ── Chart.js Setup ──
function renderChart(dataPoints, labels, baseBalance = INITIAL_BALANCE) {
  const ctx = document.getElementById('equityChart');
  if (!ctx) return;

  if (equityChartInstance) {
    equityChartInstance.destroy();
  }

  const finalBal = dataPoints[dataPoints.length - 1];
  const lineColor = finalBal >= baseBalance ? 'rgba(34, 197, 94, 1)' : 'rgba(239, 68, 68, 1)';
  const fillColor = finalBal >= baseBalance ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';

  equityChartInstance = new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Account Equity',
        data: dataPoints,
        borderColor: lineColor,
        backgroundColor: fillColor,
        borderWidth: 2,
        pointBackgroundColor: '#080b10',
        pointBorderColor: lineColor,
        pointBorderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10, 14, 20, 0.9)',
          titleColor: '#8b949e',
          bodyColor: '#fff',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (context) => 'Equity: ' + formatMoney(context.parsed.y)
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
          ticks: { color: '#8b949e', maxTicksLimit: 10 }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)', drawBorder: false },
          ticks: {
            color: '#8b949e',
            callback: (value) => '$' + value.toLocaleString()
          }
        }
      }
    }
  });
}

// ── Export JSON Function ──
window.exportJournalJSON = function () {
  const historyData = JSON.parse(localStorage.getItem('pnl_history') || '[]');
  const exportData = selectedMonth === 'all'
    ? historyData
    : historyData.filter(t => getMonthKey(t.closedAt || t.date) === selectedMonth);

  if (exportData.length === 0) {
    alert('Koi trade history nahi mili export karne ke liye.');
    return;
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const suffix = selectedMonth === 'all' ? new Date().toISOString().slice(0, 10) : selectedMonth;
  const a = document.createElement('a');
  a.href = url;
  a.download = `trade_journal_${suffix}.json`;
  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ── Initialize ──
if (monthFilter) {
  monthFilter.addEventListener('change', (e) => {
    selectedMonth = e.target.value;
    loadJournal();
  });
}

document.addEventListener('DOMContentLoaded', loadJournal);