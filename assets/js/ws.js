/* ──────────────────────────────────────
   NETWORK, SIGNALR & STATE MANAGEMENT
────────────────────────────────────── */

const HUB_URL = "https://biquote.io/hubs/tick"; 
const API_BASE = "https://biquote.io";          
const SYMBOLS = ["BTCUSDT", "XAUUSD"]; // Native UI symbols   

const state = { 
  conn: null,          
  ticks: {},           
  subStates: {},       
  wsConnected: false,  
  wasEverOpen: false,  
  seedDone: false,     
  firstOpenTime: 0     
};

function renderSubStates(states) {
  states.forEach(s => {
    state.subStates[s.symbol] = s;
    const el = document.getElementById("state-" + s.symbol);
    if (el) {
      el.textContent = s.state === "unknown" ? "UNKNOWN SYMBOL" : s.state === "closed" ? "MARKET CLOSED — LAST PRICE" : "LIVE";
      el.className = `state-line ${s.state === "unknown" ? "text-danger" : s.state === "closed" ? "text-muted" : "text-success"}`;
    }
  });
}

function loadSignalR() {
  if (typeof window.signalR !== "undefined") return Promise.resolve(window.signalR);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@microsoft/signalr@8.0.7/dist/browser/signalr.min.js";
    s.onload = () => resolve(window.signalR);
    s.onerror = () => reject(new Error("Failed to load SignalR"));
    document.head.appendChild(s);
  });
}

async function seed() {
  if (state.seedDone) return;
  state.seedDone = true;
  try {
    const qs = SYMBOLS.map(s => `symbols=${s}`).join("&");
    const res = await fetch(`${API_BASE}/api/latest?${qs}`);
    const data = await res.json();
    
    SYMBOLS.forEach(sym => { 
      if (data[sym]) { 
        state.ticks[sym] = data[sym]; 
        if (typeof renderTick === 'function') renderTick(sym, data[sym]); 
      } 
    });
  } catch (e) { 
    console.error("REST Seed failed:", e); 
  }
}

function connect(signalRLib) {
  const conn = new signalRLib.HubConnectionBuilder()
    .withUrl(HUB_URL, { withCredentials: false }) 
    .withAutomaticReconnect() 
    .build();

  conn.on("ReceiveTick", t => { 
    if (SYMBOLS.includes(t.symbol)) state.ticks[t.symbol] = t; 
  });
  
  conn.on("ReceiveSubscriptionState", renderSubStates);

  const handleLive = () => { 
    state.wsConnected = true; 
    state.wasEverOpen = true; 
    state.firstOpenTime = Date.now(); 
    setConnState("live"); 
  };

  conn.onclose(() => { 
    if (state.wasEverOpen && Date.now() - state.firstOpenTime > 2000) { 
      state.wsConnected = false; 
      setConnState("down"); 
    } 
  });
  
  conn.onreconnecting(() => setConnState("reconnecting"));
  
  conn.onreconnected(() => { 
    handleLive(); 
    conn.invoke("Subscribe", SYMBOLS).catch(console.error); 
  });

  conn.start()
    .then(() => conn.invoke("Subscribe", SYMBOLS))
    .then(handleLive)
    .catch(() => setConnState(state.wasEverOpen ? "down" : "reconnecting"));

  state.conn = conn;
}

document.addEventListener("DOMContentLoaded", () => {
  seed(); 
  loadSignalR().then(connect).catch(() => setConnState("down"));
});