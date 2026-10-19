/* ═══════════════════════════════════════════════════════
   LIVE CANDLESTICK CHARTS WITH HISTORICAL DATA & POSITIONS
   ═══════════════════════════════════════════════════════ */

const charts = {};
const series = {};
const candleData = { BTCUSDT: {}, XAUUSD: {} };
const historyLoaded = { BTCUSDT: false, XAUUSD: false };

// Active price lines ko store karne ke liye array (taaki unhe update/remove kiya ja sake)
const activePriceLines = { BTCUSDT: [], XAUUSD: [] };

// Timeframe: 1 Minute candles (standard timeframe)
const CANDLE_INTERVAL_MS = 60000; 

function initCharts() {
  const chartOptions = {
    layout: { 
      textColor: '#8b949e', 
      background: { type: 'solid', color: '#0a0a0a' } 
    },
    grid: { 
      vertLines: { color: 'rgba(255, 255, 255, 0.03)' }, 
      horzLines: { color: 'rgba(255, 255, 255, 0.03)' } 
    },
    crosshair: { 
      mode: LightweightCharts.CrosshairMode.Normal 
    },
    timeScale: { 
      timeVisible: true, 
      secondsVisible: false 
    },
    rightPriceScale: {
      borderColor: 'rgba(255, 255, 255, 0.1)',
    }
  };

  ['BTCUSDT', 'XAUUSD'].forEach(sym => {
    const container = document.getElementById(`chart-${sym}`);
    if (!container) return;

    charts[sym] = LightweightCharts.createChart(container, chartOptions);
    
    // API Fix: Using addSeries() for Lightweight Charts v5 compatibility
    series[sym] = charts[sym].addSeries(LightweightCharts.CandlestickSeries, {
      upColor: '#089981',
      downColor: '#f23645',
      borderVisible: false,
      wickUpColor: '#089981',
      wickDownColor: '#f23645'
    });
    
    window.addEventListener('resize', () => {
      charts[sym].applyOptions({ width: container.clientWidth });
    });
  });

  // Chart par lines draw karne wala loop start karein (har 500ms mein update hoga)
  setInterval(syncPositionsToCharts, 500);
}

// ── Chart Controls (Zoom & Reset) ──
window.zoomChart = function(sym, zoomIn) {
  if (!charts[sym]) return;
  const timeScale = charts[sym].timeScale();
  const currentRange = timeScale.getVisibleLogicalRange();
  
  if (currentRange) {
    const bars = currentRange.to - currentRange.from;
    const direction = zoomIn ? -1 : 1;
    // Zoom by 20% chunks, anchoring to the right (most recent data)
    const newRangeBars = bars * 0.2 * direction + bars;
    
    timeScale.setVisibleLogicalRange({
      to: currentRange.to,
      from: currentRange.to - newRangeBars,
    });
  }
};

window.resetChart = function(sym) {
  if (!charts[sym]) return;
  charts[sym].timeScale().fitContent(); // Automatically fits all data into view
};

// ── Historical Data Logic ──
async function fetchBinanceHistory() {
  try {
    const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=60');
    const data = await res.json();
    return data.map(d => ({
      time: Math.floor(d[0] / 1000), // Convert MS to Seconds
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4])
    }));
  } catch (e) {
    console.error('Binance history fetch failed', e);
    return [];
  }
}

function generateSyntheticHistory(basePrice) {
  const history = [];
  let currentPrice = basePrice || 2600; 
  const nowSec = Math.floor(Date.now() / CANDLE_INTERVAL_MS) * (CANDLE_INTERVAL_MS / 1000);
  
  // Build 60 minutes of history backwards
  for (let i = 60; i >= 1; i--) {
    const time = nowSec - (i * 60);
    const open = currentPrice;
    const close = open + (Math.random() - 0.5) * 1.5; 
    const high = Math.max(open, close) + Math.random() * 0.8;
    const low = Math.min(open, close) - Math.random() * 0.8;
    history.push({ time, open, high, low, close });
    currentPrice = close;
  }
  return history;
}

async function loadHistory(sym, currentTickPrice) {
  if (historyLoaded[sym]) return;
  historyLoaded[sym] = true;

  let history = [];
  if (sym === 'BTCUSDT') {
    history = await fetchBinanceHistory();
  } else if (sym === 'XAUUSD') {
    history = generateSyntheticHistory(currentTickPrice);
  }

  if (history.length > 0) {
    series[sym].setData(history);
    const lastCandle = history[history.length - 1];
    candleData[sym][lastCandle.time] = lastCandle;
  }
}

// ── Live Stream Hook ──
function updateCandle(sym, tick) {
  if (!series[sym] || !tick.mid) return;
  const price = parseFloat(tick.mid);

  if (!historyLoaded[sym]) {
    loadHistory(sym, price);
    return;
  }
  
  const timeSeconds = Math.floor(Date.now() / CANDLE_INTERVAL_MS) * (CANDLE_INTERVAL_MS / 1000);

  if (!candleData[sym][timeSeconds]) {
    candleData[sym][timeSeconds] = { 
      time: timeSeconds, 
      open: price, 
      high: price, 
      low: price, 
      close: price 
    };
  } else {
    const c = candleData[sym][timeSeconds];
    c.high = Math.max(c.high, price);
    c.low = Math.min(c.low, price);
    c.close = price;
  }
  
  series[sym].update(candleData[sym][timeSeconds]);
}

// ── POSITIONS ON CHART LOGIC ──

// Helper: Calculate live PNL for the chart label
function calculateChartPnl(pos, currentPrice) {
  if (!currentPrice) return 0;
  const diff = pos.side === 'BUY' ? (currentPrice - pos.entry) : (pos.entry - currentPrice);
  return diff * pos.lot * (pos.symbol === 'XAUUSD' ? 1000 : 1);
}

// Main function to draw Entry, SL, and TP lines
function syncPositionsToCharts() {
  const positions = JSON.parse(localStorage.getItem('positions') || '[]');

  ['BTCUSDT', 'XAUUSD'].forEach(sym => {
    if (!series[sym]) return;

    // Har cycle mein purani lines clear karein taaki duplicate na bane
    if (activePriceLines[sym]) {
      activePriceLines[sym].forEach(line => series[sym].removePriceLine(line));
    }
    activePriceLines[sym] = [];

    // Is chart ke liye open positions filter karein
    const chartPositions = positions.filter(p => p.symbol === sym);
    
    // Live price fetch karein from state object
    const currentPrice = (typeof state !== 'undefined' && state.ticks && state.ticks[sym]) 
                         ? parseFloat(state.ticks[sym].mid) 
                         : null;

    chartPositions.forEach(pos => {
      // P&L calculation
      const pnl = calculateChartPnl(pos, currentPrice);
      const isProfit = pnl >= 0;
      const pnlText = pnl !== 0 ? ` [${isProfit ? '+' : ''}$${pnl.toFixed(2)}]` : '';
      const color = pos.side === 'BUY' ? '#089981' : '#f23645'; // Green for BUY, Red for SELL

      // 1. ENTRY PRICE LINE
      const entryLine = series[sym].createPriceLine({
        price: pos.entry,
        color: color,
        lineWidth: 2,
        lineStyle: LightweightCharts.LineStyle.Solid,
        axisLabelVisible: true,
        title: `${pos.side} ${pos.lot} ${pnlText}`
      });
      activePriceLines[sym].push(entryLine);

      // 2. STOP LOSS (SL) LINE
      if (pos.sl) {
        const slLine = series[sym].createPriceLine({
          price: pos.sl,
          color: '#f23645', // Red
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'SL'
        });
        activePriceLines[sym].push(slLine);
      }

      // 3. TAKE PROFIT (TP) LINE
      if (pos.tp) {
        const tpLine = series[sym].createPriceLine({
          price: pos.tp,
          color: '#089981', // Green
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          axisLabelVisible: true,
          title: 'TP'
        });
        activePriceLines[sym].push(tpLine);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", initCharts);