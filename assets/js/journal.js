/* ═══════════════════════════════════════════════════════
   JOURNAL PAGE — JAVASCRIPT (With Advanced Metrics)
   ═══════════════════════════════════════════════════════ */

const INITIAL_BALANCE = 1000;
let equityChartInstance = null;

// DOM Elements
const journalBody = document.getElementById('journal-body');
const journalEmpty = document.getElementById('journal-empty');
const journalCount = document.getElementById('journal-count');

// ── Format Helpers ──
function formatMoney(value) {
  return (value >= 0 ? '$' : '-$') + Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ── Main Load Function ──
function loadJournal() {
  const history = JSON.parse(localStorage.getItem('pnl_history') || '[]');
  journalCount.textContent = history.length;

  if (history.length === 0) {
    journalBody.innerHTML = '';
    if(journalEmpty) {
      journalBody.appendChild(journalEmpty);
      journalEmpty.style.display = '';
    }
    updateStats([], 1000, 0, 0);
    renderChart([1000], ['Start']);
    return;
  }

  if(journalEmpty) journalEmpty.style.display = 'none';

  // Sort Chronologically
  const chronHistory = [...history].sort((a, b) => new Date(a.closedAt || a.date) - new Date(b.closedAt || b.date));

  let currentBalance = INITIAL_BALANCE;
  let peakBalance = INITIAL_BALANCE;
  let maxDrawdown = 0;
  
  const chartData = [INITIAL_BALANCE];
  const chartLabels = ['Start'];
  
  // Track running balance and inject it into the data for the grid
  const enrichedHistory = chronHistory.map((trade, index) => {
    const pnl = trade.pnl || 0;
    currentBalance += pnl;
    
    // Drawdown Calc
    if (currentBalance > peakBalance) peakBalance = currentBalance;
    const currentDrawdown = peakBalance - currentBalance;
    if (currentDrawdown > maxDrawdown) maxDrawdown = currentDrawdown;

    // Chart Arrays
    chartData.push(currentBalance);
    chartLabels.push(`Trade ${index + 1}`);

    return { ...trade, runningBalance: currentBalance, tradeNum: index + 1 };
  });

  // Calculate overall stats
  const totalReturnPct = ((currentBalance - INITIAL_BALANCE) / INITIAL_BALANCE) * 100;
  updateStats(enrichedHistory, currentBalance, totalReturnPct, maxDrawdown);
  
  // Render Chart
  renderChart(chartData, chartLabels);

  // Render Grid (Reverse so newest trades show at the top of the list)
  const reversedHistory = enrichedHistory.reverse();

  journalBody.innerHTML = reversedHistory.map(trade => {
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
}

// ── Stats Updater (With Advanced Metrics) ──
function updateStats(history, finalBalance, returnPct, maxDrawdown) {
  const isOverallProfit = finalBalance >= INITIAL_BALANCE;
  const totalTrades = history.length;

  // Filter wins and losses
  const winningTrades = history.filter(t => (t.pnl || 0) > 0);
  const losingTrades = history.filter(t => (t.pnl || 0) < 0);
  
  const winCount = winningTrades.length;
  const lossCount = losingTrades.length;

  // Calculate Rates
  const winRate = totalTrades > 0 ? (winCount / totalTrades) * 100 : 0;
  const lossRate = totalTrades > 0 ? (lossCount / totalTrades) * 100 : 0;

  // Gross Profit / Loss
  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

  // Averages
  const avgWin = winCount > 0 ? (grossProfit / winCount) : 0;
  const avgLoss = lossCount > 0 ? (grossLoss / lossCount) : 0;

  // Profit Factor (Consistency)
  // If no losses, Profit Factor is theoretically infinite. We cap it or show 'Perfect'.
  let profitFactor = "0.00";
  let pfClass = "text-danger";
  
  if (grossLoss === 0 && grossProfit > 0) {
    profitFactor = "Perfect (No Losses)";
    pfClass = "text-success";
  } else if (grossLoss > 0) {
    const pfValue = (grossProfit / grossLoss);
    profitFactor = pfValue.toFixed(2);
    // Standard trading rules: PF > 1 is profitable, PF > 1.5 is very consistent.
    pfClass = pfValue >= 1 ? "text-success" : "text-danger";
  }

  // Inject into DOM
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
function renderChart(dataPoints, labels) {
  const ctx = document.getElementById('equityChart');
  if(!ctx) return;

  // Destroy old chart instance if redrawing
  if (equityChartInstance) {
    equityChartInstance.destroy();
  }

  // Determine line color based on final performance
  const finalBal = dataPoints[dataPoints.length - 1];
  const lineColor = finalBal >= INITIAL_BALANCE ? 'rgba(34, 197, 94, 1)' : 'rgba(239, 68, 68, 1)';
  const fillColor = finalBal >= INITIAL_BALANCE ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)';

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
        tension: 0.2 // Slight curve
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
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
            label: function(context) {
              return 'Equity: ' + formatMoney(context.parsed.y);
            }
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
            callback: function(value) { return '$' + value.toLocaleString(); }
          }
        }
      }
    }
  });
}

// ── Export JSON Function ──
window.exportJournalJSON = function() {
  const historyString = localStorage.getItem('pnl_history') || '[]';
  const historyData = JSON.parse(historyString);

  if (historyData.length === 0) {
    alert("Koi trade history nahi mili export karne ke liye.");
    return;
  }

  const blob = new Blob([JSON.stringify(historyData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `trade_journal_${dateStr}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ── Initialize ──
document.addEventListener('DOMContentLoaded', loadJournal); 