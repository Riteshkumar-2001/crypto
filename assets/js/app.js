/* ──────────────────────────────────────
   UI RENDERING & THROTTLING
   Handles formatting and writing data to the DOM.
───────────────────────────────────────── */

let lastRenderTime = 0; // Tracks the last time the UI was updated

/**
 * Formats a number with commas and strict decimal places.
 * @param {Number|String} v - The value to format
 * @param {Number} d - Number of decimal digits (default is 2)
 * @returns {String} Formatted string or an em dash if null
 */
function fmt(v, d = 2) {
  return v == null ? "—" : Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

/**
 * Updates the global connection status badge in the header.
 * @param {String} s - Status string (e.g., 'live', 'reconnecting', 'down')
 */
function setConnState(s) {
  const el = document.getElementById("conn-status");
  if (!el) return;
  el.className = `conn-badge ${s}`; // Apply corresponding CSS class
  el.textContent = s.toUpperCase();
}

/**
 * Directly updates DOM elements for a specific symbol based on incoming tick data.
 * @param {String} sym - The symbol code (e.g., 'BTCUSDT')
 * @param {Object} t - The tick data object
 */
function renderTick(sym, t) {
  const midEl = document.getElementById("mid-" + sym);

  // ADD THIS LINE: Safely exit if the ticker UI isn't on the current page
  if (!midEl) return;

  midEl.textContent = fmt(t.mid);

  const prev = parseFloat(midEl.dataset.prev);
  if (!isNaN(prev) && t.mid !== prev) {
    midEl.classList.remove("tick-up", "tick-down");
    midEl.classList.add(t.mid > prev ? "tick-up" : "tick-down");
    setTimeout(() => midEl.classList.remove("tick-up", "tick-down"), 400);
  }
  midEl.dataset.prev = t.mid;

  if (typeof updateCandle === 'function') {
    updateCandle(sym, t);
  }

  // Wrap other elements in optional chaining or if-statements if they might be missing
  const bidEl = document.getElementById("bid-" + sym);
  if (bidEl) bidEl.textContent = fmt(t.bid);

  const askEl = document.getElementById("ask-" + sym);
  if (askEl) askEl.textContent = fmt(t.ask);

  const spreadEl = document.getElementById("spread-" + sym);
  if (spreadEl) spreadEl.textContent = fmt(t.spread);

  const highEl = document.getElementById("high-" + sym);
  if (highEl) highEl.textContent = fmt(t.high);

  const lowEl = document.getElementById("low-" + sym);
  if (lowEl) lowEl.textContent = fmt(t.low);

  const srcEl = document.getElementById("source-" + sym);
  if (srcEl) {
    srcEl.textContent = t.source || "MetaTrader 5 (Broker 1)";
    srcEl.className = "v text-muted";
  }

  const chgEl = document.getElementById("chg-" + sym);
  if (chgEl) {
    const closed = t.marketState === "closed" || t.stale;
    chgEl.textContent = closed ? "n/a (market closed)" : `${t.dayDiffPercent >= 0 ? "+" : ""}${(t.dayDiffPercent || 0).toFixed(2)}%`;
    chgEl.className = `v ${closed ? "text-muted" : t.dayDiffPercent >= 0 ? "text-success" : "text-danger"}`;
  }

  const timeEl = document.getElementById("time-" + sym);
  if (timeEl) timeEl.textContent = t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : "—";

  const stateEl = document.getElementById("state-" + sym);
  if (stateEl) {
    stateEl.textContent = t.marketState === "closed" ? "MARKET CLOSED — LAST PRICE" : "LIVE";
    stateEl.className = `state-line ${t.marketState === "closed" ? "text-muted" : "text-success"}`;
  }
}

/**
 * 1-SECOND THROTTLED RENDER
 * WebSocket ticks can arrive at a very high frequency (e.g., 50+ per second).
 * Writing to the DOM on every tick will freeze the browser. 
 * This function ensures the UI is only repainted once every ~1000ms.
 */
function tickThrottledRender() {
  const now = Date.now();
  // Exit if less than 900ms have passed since the last render
  if (now - lastRenderTime < 900) return;
  lastRenderTime = now;

  // Render the latest tick data stored in the shared state object
  ["BTCUSDT", "XAUUSD"].forEach(sym => {
    if (state.ticks[sym]) renderTick(sym, state.ticks[sym]);
  });
}

// ─── INITIALIZATION ───
// Start the throttled rendering loop once the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  setInterval(tickThrottledRender, 100); // Trigger check every second
});