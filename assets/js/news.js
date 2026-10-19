(() => {
  "use strict";

  const BASE = "https://biquote.io/api/news/hn";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const searchInput = $("#searchInput");
  const searchBtn   = $("#searchBtn");
  const resetBtn    = $("#resetBtn");
  const storiesList = $("#storiesList");
  const loader      = $("#loader");
  const errorBox    = $("#errorBox");
  const errorMsg    = $("#errorMsg");
  const storyCount  = $("#storyCount");

  let currentQuery = "";
  let debounceTimer = null;

  /* ── Fetch ─────────────────────────────── */
  async function fetchStories(q = "", maxResults = 20) {
    loader.classList.remove("d-none");
    errorBox.classList.add("d-none");
    storiesList.innerHTML = "";

    const url = q
      ? `${BASE}?q=${encodeURIComponent(q)}&maxResults=${maxResults}`
      : `${BASE}?maxResults=${maxResults}`;

    try {
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        storiesList.innerHTML = `
          <div class="text-center py-5 text-muted">
            <i class="bi bi-inbox fs-1 d-block mb-3"></i>
            No stories found.
          </div>`;
        storyCount.textContent = "0 stories";
        return;
      }

      renderStories(data);

      const label = q ? `"${q}"` : "Front Page";
      storyCount.textContent = `${data.length} stories · ${label}`;
    } catch (err) {
      errorMsg.textContent = `Failed to load stories: ${err.message}. Please try again.`;
      errorBox.classList.remove("d-none");
    } finally {
      loader.classList.add("d-none");
    }
  }

  /* ── Render ────────────────────────────── */
  function renderStories(stories) {
    storiesList.innerHTML = stories
      .map(
        (item, idx) => `
      <div class="story-card">
        <div class="story-rank">${idx + 1}</div>

        <div class="story-title">
          <a href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(item.title)}
          </a>
        </div>

        <div class="story-desc">
          ${escapeHtml(item.description || "No description available.")}
        </div>

        <div class="story-meta">
          <span><i class="bi bi-newspaper"></i> ${escapeHtml(item.publisher || "Hacker News")}</span>
          <span><i class="bi bi-calendar3"></i> ${formatDate(item.publishedDate)}</span>
          ${item.imageUrl
            ? `<span><i class="bi bi-image"></i> Image</span>`
            : ""}
        </div>
      </div>`
      )
      .join("");
  }

  /* ── Helpers ───────────────────────────── */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  /* ── Events ────────────────────────────── */
  function doSearch() {
    const q = searchInput.value.trim();
    currentQuery = q;
    searchBtn.classList.toggle("d-none", !!q);
    resetBtn.classList.toggle("d-none", !q);
    fetchStories(q);
  }

  searchBtn.addEventListener("click", doSearch);

  resetBtn.addEventListener("click", () => {
    searchInput.value = "";
    currentQuery = "";
    searchBtn.classList.remove("d-none");
    resetBtn.classList.add("d-none");
    fetchStories();
  });

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = searchInput.value.trim();
      if (q !== currentQuery) {
        currentQuery = q;
        searchBtn.classList.toggle("d-none", !!q);
        resetBtn.classList.toggle("d-none", !q);
        fetchStories(q);
      }
    }, 600);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(debounceTimer);
      doSearch();
    }
  });

  /* ── Init ──────────────────────────────── */
  fetchStories();
})();