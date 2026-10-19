/* ═══════════════════════════════════════════════════════
   ECONOMIC CALENDAR (ACCURATE DATA + PREVIOUS/EXPECTED/ACTUAL)
   ═══════════════════════════════════════════════════════ */

let allCalendarEvents = [];
let currentMode = 'all'; // Default 'all' rakha hai taaki aaj ke Past aur Upcoming dono turant dikhein
let currentCountryFilter = 'ALL';

const countryMap = {
  "EU": { name: "EU", currency: "EUR" },
  "TR": { name: "Türkiye", currency: "TRY" },
  "US": { name: "US", currency: "USD" }
};

// Helper 1: Check if value is genuinely present (0 is valid!)
function hasValue(val) {
  return val !== null && val !== undefined && String(val).trim() !== '';
}

// Helper 2: Format figure with clean symbols (%, K, M, B) instead of words
function formatFigure(val, unit) {
  if (!hasValue(val)) return null;
  let strVal = String(val).trim();

  // Clean unit string from API
  let cleanUnit = String(unit || '').trim();
  const lowerUnit = cleanUnit.toLowerCase();

  if (lowerUnit === 'percent' || lowerUnit === 'percentage') {
    cleanUnit = '%';
  } else if (lowerUnit === 'none' || lowerUnit === 'null' || lowerUnit === 'undefined') {
    cleanUnit = '';
  }

  // Also clean if the value itself contains "percent" or "none"
  strVal = strVal.replace(/percent/gi, '%').replace(/none/gi, '').trim();

  if (cleanUnit && !strVal.endsWith(cleanUnit)) {
    return `${strVal}${cleanUnit}`;
  }
  return strVal;
}
// Helper 3: Check if event is PPI, CPI, JOBLESS, or FED INTEREST RATE (#089981 Green BG)
function isMajorGreenEvent(eventName) {
  if (!eventName) return false;
  const name = eventName.toUpperCase();
  return (
    name.includes('PPI') ||
    name.includes('PRODUCER PRICE') ||
    name.includes('CPI') ||
    name.includes('CONSUMER PRICE') ||
    name.includes('JOBLESS') ||
    name.includes('INITIAL CLAIMS') ||
    name.includes('UNEMPLOYMENT CLAIMS') ||
    name.includes('FED INTEREST RATE') ||
    name.includes('FEDERAL FUNDS RATE') ||
    name.includes('FOMC') ||
    (name.includes('FED') && name.includes('RATE'))
  );
}

// Helper 4: Check if event is 3-Star / High Importance (#f23645 Red BG)
function isThreeStarEvent(importance) {
  const imp = String(importance || '').toLowerCase();
  return imp === 'high' || imp === '3' || imp === 'high-impact';
}

// Helper 5: Convert importance to 3-star rating icons
function getImportanceStars(importance, isFaded) {
  const imp = String(importance || 'low').toLowerCase();
  const activeColor = isFaded ? 'text-secondary' : 'text-warning'; 
  
  if (imp === 'high' || imp === '3') {
    return `
      <i class="fa-solid fa-star ${activeColor}"></i>
      <i class="fa-solid fa-star ${activeColor}"></i>
      <i class="fa-solid fa-star ${activeColor}"></i>`;
  } else if (imp === 'medium' || imp === 'moderate' || imp === '2') {
    return `
      <i class="fa-solid fa-star ${activeColor}"></i>
      <i class="fa-solid fa-star ${activeColor}"></i>
      <i class="fa-regular fa-star text-secondary opacity-50"></i>`;
  } else {
    return `
      <i class="fa-solid fa-star ${activeColor}"></i>
      <i class="fa-regular fa-star text-secondary opacity-50"></i>
      <i class="fa-regular fa-star text-secondary opacity-50"></i>`;
  }
}

// 1. Fetch Complete Data from Biquote API
async function fetchCalendar() {
  const tbody = document.getElementById('calendar-body');
  try {
    // High limit (500) ensures the entire week's events (including today's PPI/CPI/Jobless) are fetched
    const [allRes, highRes, upcomingRes] = await Promise.all([
      fetch('https://biquote.io/api/calendar?limit=500').catch(() => null),
      fetch('https://biquote.io/api/calendar?countries=US,EU,TR&importance=high&limit=200').catch(() => null),
      fetch('https://biquote.io/api/calendar/upcoming?limit=50').catch(() => null)
    ]);

    const allData = (allRes && allRes.ok) ? await allRes.json() : [];
    const highData = (highRes && highRes.ok) ? await highRes.json() : [];
    const upData = (upcomingRes && upcomingRes.ok) ? await upcomingRes.json() : [];

    // Normalize in case API wraps array in { data: [...] } or { events: [...] }
    const extractArray = (d) => Array.isArray(d) ? d : (d?.events || d?.data || []);

    const combined = [
      ...extractArray(allData),
      ...extractArray(highData),
      ...extractArray(upData)
    ];

    // Deduplicate events, preferring entries that have 'actual' or 'forecast' populated
    const uniqueMap = new Map();
    combined.forEach(e => {
      if (!e || !e.name || !e.time) return;
      const key = `${new Date(e.time).toISOString()}_${e.countryCode || ''}_${e.name.trim()}`;
      
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, e);
      } else {
        const existing = uniqueMap.get(key);
        // Merge to keep whichever object has actual/forecast populated
        uniqueMap.set(key, {
          ...existing,
          ...e,
          actual: hasValue(e.actual) ? e.actual : existing.actual,
          forecast: hasValue(e.forecast) ? e.forecast : existing.forecast,
          previous: hasValue(e.previous) ? e.previous : existing.previous
        });
      }
    });

    allCalendarEvents = Array.from(uniqueMap.values()).sort((a, b) => new Date(a.time) - new Date(b.time));

    // Debug log in console so you can inspect the exact raw API fields anytime
    console.log(`[Calendar] Loaded ${allCalendarEvents.length} unique events.`);

    renderCalendar();
  } catch (error) {
    console.error("Failed to load economic calendar:", error);
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-danger">
            <i class="fa-solid fa-triangle-exclamation mb-2"></i><br>
            Failed to load calendar data.
          </td>
        </tr>`;
    }
  }
}

// 2. Render Table
function renderCalendar() {
  const tbody = document.getElementById('calendar-body');
  if (!tbody) return;

  const currentTime = Date.now();

  // Filter by Mode (Upcoming / History / This Week)
  let modeFiltered = [];
  if (currentMode === 'upcoming') {
    modeFiltered = allCalendarEvents.filter(e => {
      const eventTime = new Date(e.time).getTime();
      return !hasValue(e.actual) && eventTime >= currentTime;
    });
    modeFiltered.sort((a, b) => new Date(a.time) - new Date(b.time));
  } else if (currentMode === 'history') {
    modeFiltered = allCalendarEvents.filter(e => {
      const eventTime = new Date(e.time).getTime();
      return hasValue(e.actual) || eventTime < currentTime;
    });
    // Latest released events first
    modeFiltered.sort((a, b) => new Date(b.time) - new Date(a.time));
  } else {
    // 'all' (This Week)
    modeFiltered = [...allCalendarEvents].sort((a, b) => new Date(a.time) - new Date(b.time));
  }

  // Filter by Country Pill
  const filteredEvents = currentCountryFilter === 'ALL'
    ? modeFiltered
    : modeFiltered.filter(e => e.countryCode === currentCountryFilter);

  if (filteredEvents.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-5 text-muted">
          <i class="fa-regular fa-calendar-xmark fs-3 mb-2 opacity-50"></i><br>
          No ${currentMode} events found for this selection.
        </td>
      </tr>`;
    return;
  }

  // Render rows
  tbody.innerHTML = filteredEvents.map(e => {
    const eventTime = new Date(e.time).getTime();
    const isActualPublished = hasValue(e.actual);
    const isPast = isActualPublished || (eventTime < currentTime);

    // ── Row Background Color Logic ──
    // Priority 1: PPI, CPI, Jobless, Fed Interest Rate -> #089981 Green BG
    // Priority 2: All other 3-Star news -> #f23645 Red BG
    let bgHighlightClass = '';
    if (isMajorGreenEvent(e.name)) {
      bgHighlightClass = 'cal-bg-green';
    } else if (isThreeStarEvent(e.importance)) {
      bgHighlightClass = 'cal-bg-red';
    }

    const fadeClass = (currentMode === 'all' && isPast) ? 'opacity-50' : '';
    const rowClass = `calendar-table-row ${bgHighlightClass} ${fadeClass}`.trim();

    // Format time explicitly in local timezone (IST)
    const timeFormatted = new Date(e.time).toLocaleString('en-IN', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const currency = countryMap[e.countryCode]?.currency || e.currency || '';
    const badgeHtml = currency 
      ? `<span class="badge bg-secondary-subtle text-secondary">${e.countryCode} <span class="opacity-50">| ${currency}</span></span>`
      : `<span class="badge bg-secondary-subtle text-secondary">${e.countryCode || '—'}</span>`;

    const starsHtml = getImportanceStars(e.importance, currentMode === 'all' && isPast);

    // ── Accurate Previous, Expected (Forecast), and Actual Extraction ──
    const unit = e.unit || '';
    const prevRaw = e.previous ?? e.prev ?? e.previousValue;
    const expRaw  = e.forecast ?? e.expected ?? e.consensus ?? e.forecastValue;
    const actRaw  = e.actual ?? e.actualValue;

    const prevFormatted = formatFigure(prevRaw, unit);
    const expFormatted  = formatFigure(expRaw, unit);
    const actFormatted  = formatFigure(actRaw, unit);

    const previousHtml = prevFormatted !== null
      ? `<span class="text-white-50 font-monospace">${prevFormatted}</span>`
      : `<span class="text-muted opacity-50">—</span>`;

    const expectedHtml = expFormatted !== null
      ? `<span class="text-light font-monospace">${expFormatted}</span>`
      : `<span class="text-muted opacity-50">—</span>`;

    let actualHtml = '';
    if (actFormatted === null) {
      if (eventTime < currentTime) {
        actualHtml = `<span class="badge bg-secondary-subtle text-secondary" style="font-size:0.65rem;">WAITING</span>`;
      } else {
        actualHtml = `<span class="badge bg-warning-subtle text-warning" style="font-size:0.65rem; letter-spacing:0.5px;">UPCOMING</span>`;
      }
    } else {
      actualHtml = `<span class="fw-bold text-white font-monospace">${actFormatted}</span>`;
    }

    return `
      <tr class="${rowClass}">
        <td class="text-light ps-4" style="white-space: nowrap;">${timeFormatted}</td>
        <td>${badgeHtml}</td>
        <td class="text-white fw-semibold">
          <div class="d-flex align-items-center gap-3">
            <span class="d-flex gap-1" style="font-size: 0.6rem;">${starsHtml}</span>
            <span>${e.name}</span>
          </div>
        </td>
        <td class="text-end">${previousHtml}</td>
        <td class="text-end">${expectedHtml}</td>
        <td class="text-end pe-4">${actualHtml}</td>
      </tr>
    `;
  }).join('');
}

// 3. Initialize & Bind Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  fetchCalendar();
  // Auto-refresh calendar every 60 seconds so live releases (like PPI at 6:00 PM IST) update automatically
  setInterval(fetchCalendar, 60000);

  // Mode Tabs (Upcoming / History / This Week)
  const modePills = document.querySelectorAll('#calendar-mode-pills button[data-bs-toggle="pill"]');
  modePills.forEach(btn => {
    btn.addEventListener('shown.bs.tab', (event) => {
      currentMode = event.target.getAttribute('data-mode');
      renderCalendar();
    });
  });

  // Country Tabs (ALL / US / EU / TR)
  const countryPills = document.querySelectorAll('#calendar-country-pills button[data-bs-toggle="pill"]');
  countryPills.forEach(btn => {
    btn.addEventListener('shown.bs.tab', (event) => {
      currentCountryFilter = event.target.getAttribute('data-country');
      renderCalendar();
    });
  });
});