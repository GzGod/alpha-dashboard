const MAX_SCAN_LIMIT = 2000;

const els = {
  tokenInput: document.querySelector("#tokenInput"),
  tokenOptions: document.querySelector("#tokenOptions"),
  intervalSelect: document.querySelector("#intervalSelect"),
  scanLimitInput: document.querySelector("#scanLimitInput"),
  scanBtn: document.querySelector("#scanBtn"),
  loadBtn: document.querySelector("#loadBtn"),
  modeChip: document.querySelector("#modeChip"),
  timeChip: document.querySelector("#timeChip"),
  priceMoveStat: document.querySelector("#priceMoveStat"),
  volumeSpikeStat: document.querySelector("#volumeSpikeStat"),
  tradeCountStat: document.querySelector("#tradeCountStat"),
  scoreStat: document.querySelector("#scoreStat"),
  levelTag: document.querySelector("#levelTag"),
  scanMeta: document.querySelector("#scanMeta"),
  symbolMeta: document.querySelector("#symbolMeta"),
  gainersList: document.querySelector("#gainersList"),
  losersList: document.querySelector("#losersList"),
  anomalyList: document.querySelector("#anomalyList"),
  volumeList: document.querySelector("#volumeList"),
  marketTableBody: document.querySelector("#marketTableBody"),
  topNavLinks: Array.from(document.querySelectorAll(".top-nav a[data-section]")),
};

const state = {
  tokens: [],
  lastScan: null,
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function fmtPct(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "--";
  }
  return `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

function fmtTime(iso) {
  if (!iso) {
    return "--";
  }
  return new Date(iso).toLocaleString();
}

function fmtCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "--";
  }

  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) {
    return `${(n / 1_000_000_000).toFixed(2)}B`;
  }
  if (abs >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(2)}M`;
  }
  if (abs >= 1_000) {
    return `${(n / 1_000).toFixed(2)}K`;
  }
  return n.toFixed(2);
}

function getTokenName(item) {
  return item.tokenName || item.name || item.displaySymbol || item.symbol || "--";
}

function getDisplaySymbol(item) {
  return item.displaySymbol || item.symbol || "";
}

function getTradeSymbol(item) {
  return item.tradeSymbol || item.symbol || "";
}

function getDisplayLine(item) {
  const parts = [];
  const display = getDisplaySymbol(item);
  const name = getTokenName(item);
  const trade = getTradeSymbol(item);

  if (display && display !== name) {
    parts.push(display);
  }
  if (trade) {
    parts.push(trade);
  }
  return parts.join(" · ");
}

function buildBinanceKlineUrl(item) {
  if (item?.klineUrl) {
    return item.klineUrl;
  }

  const alphaId = String(item?.alphaId || "").trim();
  if (alphaId) {
    return `https://www.binance.com/zh-CN/alpha/${encodeURIComponent(alphaId)}`;
  }

  const symbol = getTradeSymbol(item);
  if (symbol) {
    return `https://www.binance.com/zh-CN/trade/${encodeURIComponent(symbol)}?type=spot`;
  }

  return "https://www.binance.com/zh-CN/markets";
}

function setActiveTopNav(sectionId) {
  for (const link of els.topNavLinks) {
    const isActive = link.dataset.section === sectionId;
    link.classList.toggle("active", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");
  }
}

function initTopNav() {
  if (!els.topNavLinks.length) {
    return;
  }

  const sections = [];
  for (const link of els.topNavLinks) {
    const sectionId = link.dataset.section;
    const section = sectionId ? document.getElementById(sectionId) : null;
    if (section) {
      sections.push(section);
    }

    link.addEventListener("click", (event) => {
      if (!section) {
        return;
      }
      event.preventDefault();
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveTopNav(sectionId);
      if (history.replaceState) {
        history.replaceState(null, "", `#${sectionId}`);
      }
    });
  }

  if ("IntersectionObserver" in window && sections.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length) {
          setActiveTopNav(visible[0].target.id);
        }
      },
      {
        root: null,
        threshold: [0.35, 0.6],
        rootMargin: "-90px 0px -45% 0px",
      },
    );

    for (const section of sections) {
      observer.observe(section);
    }
  }

  const initialHash = window.location.hash.replace("#", "");
  if (initialHash) {
    setActiveTopNav(initialHash);
  } else {
    setActiveTopNav(els.topNavLinks[0].dataset.section || "");
  }
}

function buildRankingsClient(results, topN = 10) {
  const cap = Math.max(1, Math.min(50, Number(topN) || 10));
  const list = Array.isArray(results) ? results : [];

  const gainers = [...list]
    .sort((a, b) => toNumber(b.market?.priceChangePct, -999999) - toNumber(a.market?.priceChangePct, -999999))
    .slice(0, cap);
  const losers = [...list]
    .sort((a, b) => toNumber(a.market?.priceChangePct, 999999) - toNumber(b.market?.priceChangePct, 999999))
    .slice(0, cap);
  const anomaly = [...list]
    .sort((a, b) => toNumber(b.signal?.score, -1) - toNumber(a.signal?.score, -1))
    .slice(0, cap);
  const volume = [...list]
    .sort((a, b) => toNumber(b.ticker?.quoteVolume ?? b.ticker?.volume, -1) - toNumber(a.ticker?.quoteVolume ?? a.ticker?.volume, -1))
    .slice(0, cap);

  return { gainers, losers, anomaly, volume };
}

function normalizeQuery(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveTokenQuery(input) {
  const query = normalizeQuery(input);
  if (!query) {
    return null;
  }

  const exact = state.tokens.find((token) => {
    const candidates = [token.name, token.symbol, token.tradeSymbol, token.alphaId, `${token.name} ${token.symbol}`];
    return candidates.map(normalizeQuery).includes(query);
  });
  if (exact) {
    return exact;
  }

  return (
    state.tokens.find((token) => normalizeQuery(token.name).includes(query)) ||
    state.tokens.find((token) => normalizeQuery(token.symbol).includes(query)) ||
    state.tokens.find((token) => normalizeQuery(token.tradeSymbol).includes(query)) ||
    null
  );
}

function isTradeSymbolLike(value) {
  const s = String(value || "").trim().toUpperCase();
  return /USDT$|USDC$|FDUSD$|BUSD$/.test(s) || /^ALPHA_\d+/.test(s);
}

function resolveSymbolFromInput(rawInput) {
  const input = String(rawInput || "").trim();
  if (!input) {
    throw new Error("请输入代币名称");
  }

  if (isTradeSymbolLike(input)) {
    return input.toUpperCase();
  }

  const token = resolveTokenQuery(input);
  if (!token?.tradeSymbol) {
    throw new Error("未找到该代币，请输入完整名称或简称");
  }
  return token.tradeSymbol;
}

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    const detail = body.detail ? `: ${body.detail}` : "";
    throw new Error(`${body.error || "Request failed"}${detail}`);
  }
  return body;
}

function renderSignal({ score, level, priceChangePct, volumeSpikePct, tradeCount, label }) {
  els.priceMoveStat.textContent = fmtPct(priceChangePct);
  els.volumeSpikeStat.textContent = fmtPct(volumeSpikePct);
  els.tradeCountStat.textContent = String(tradeCount ?? "--");
  els.scoreStat.textContent = score == null ? "--" : String(score);
  const levelKey = String(level || "").toLowerCase();
  const safeLevel = levelKey || "low";
  els.levelTag.textContent = (levelKey ? levelKey : "--").toUpperCase();
  els.levelTag.className = `level level-${safeLevel}`;
  els.symbolMeta.textContent = label || "--";
}

function renderEmptyList(listEl, text = "暂无数据") {
  listEl.innerHTML = `<li class="rank-row"><div class="rank-name"><div class="rank-title neutral">${escapeHtml(text)}</div></div></li>`;
}

function createTokenTitleHtml(item) {
  const tokenName = getTokenName(item);
  const url = buildBinanceKlineUrl(item);
  return `<a class="token-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(tokenName)}</a>`;
}

function bindRowInteractions(rowEl, item) {
  rowEl.querySelectorAll("a.token-link").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.stopPropagation();
    });
  });

  const tradeSymbol = getTradeSymbol(item);
  if (!tradeSymbol) {
    return;
  }

  rowEl.addEventListener("click", () => {
    els.tokenInput.value = getTokenName(item);
    loadOverviewBySymbol(tradeSymbol, els.intervalSelect.value).catch(showError);
  });
}

function renderRankList(listEl, items, type) {
  listEl.innerHTML = "";
  const rows = Array.isArray(items) ? items.slice(0, 8) : [];
  if (!rows.length) {
    renderEmptyList(listEl);
    return;
  }

  for (const item of rows) {
    let valueText = "--";
    let valueClass = "neutral";
    if (type === "gainers" || type === "losers") {
      const pct = Number(item?.market?.priceChangePct);
      valueText = Number.isFinite(pct) ? fmtPct(pct) : "--";
      valueClass = pct > 0 ? "up" : pct < 0 ? "down" : "neutral";
    } else if (type === "anomaly") {
      const score = Number(item?.signal?.score);
      valueText = Number.isFinite(score) ? String(Math.round(score)) : "--";
      valueClass = "up";
    } else if (type === "volume") {
      valueText = fmtCompact(item?.ticker?.quoteVolume ?? item?.ticker?.volume);
      valueClass = "neutral";
    }

    const li = document.createElement("li");
    li.className = "rank-row";
    li.innerHTML = `
      <div class="rank-name">
        <div class="rank-title">${createTokenTitleHtml(item)}</div>
        <div class="rank-sub">${escapeHtml(getDisplayLine(item))}</div>
      </div>
      <div class="rank-value ${valueClass}">${escapeHtml(valueText)}</div>
    `;

    bindRowInteractions(li, item);
    listEl.appendChild(li);
  }
}

function renderBoards(rankings) {
  renderRankList(els.gainersList, rankings?.gainers || [], "gainers");
  renderRankList(els.losersList, rankings?.losers || [], "losers");
  renderRankList(els.anomalyList, rankings?.anomaly || [], "anomaly");
  renderRankList(els.volumeList, rankings?.volume || [], "volume");
}

function buildLibraryRows(tokens, scanResults, interval) {
  const scanMap = new Map(
    (Array.isArray(scanResults) ? scanResults : []).map((item) => [getTradeSymbol(item), item]),
  );

  return (Array.isArray(tokens) ? tokens : []).map((token) => {
    const tradeSymbol = getTradeSymbol(token);
    const scanned = tradeSymbol ? scanMap.get(tradeSymbol) : null;
    if (scanned) {
      return scanned;
    }

    const fallbackPct = interval === "24h" ? Number(token.percentChange24h) : NaN;
    return {
      symbol: tradeSymbol || token.symbol,
      tradeSymbol: tradeSymbol || token.symbol,
      displaySymbol: token.symbol || tradeSymbol || "--",
      tokenName: token.name || token.symbol || tradeSymbol || "--",
      alphaId: token.alphaId || "",
      klineUrl: token.klineUrl || buildBinanceKlineUrl(token),
      ticker: {
        quoteVolume: Number(token.volume24h),
        volume: Number(token.volume24h),
      },
      market: {
        priceChangePct: fallbackPct,
        volumeSpikePct: NaN,
        tradeCount: Number(token.count24h),
      },
      signal: {
        score: null,
        level: "",
        reasons: [],
      },
      source: "token-list",
    };
  });
}

function renderMarketTable(rows) {
  els.marketTableBody.innerHTML = "";
  const list = Array.isArray(rows) ? rows : [];

  if (!list.length) {
    els.marketTableBody.innerHTML = '<tr><td colspan="5" class="muted">暂无数据</td></tr>';
    return;
  }

  for (const item of list) {
    const pct = Number(item?.market?.priceChangePct);
    const score = Number(item?.signal?.score);
    const levelKey = String(item?.signal?.level || "").toLowerCase();
    const levelText = levelKey ? levelKey.toUpperCase() : "--";
    const pctClass = Number.isFinite(pct) ? (pct > 0 ? "up" : pct < 0 ? "down" : "neutral") : "neutral";
    const levelClass = levelKey || "low";

    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.innerHTML = `
      <td class="token-cell">
        <div class="token-title">${createTokenTitleHtml(item)}</div>
        <div class="token-sub">${escapeHtml(getDisplayLine(item))}</div>
      </td>
      <td class="${pctClass}">${escapeHtml(Number.isFinite(pct) ? fmtPct(pct) : "--")}</td>
      <td>${escapeHtml(Number.isFinite(score) ? String(Math.round(score)) : "--")}</td>
      <td>${escapeHtml(fmtCompact(item?.ticker?.quoteVolume ?? item?.ticker?.volume))}</td>
      <td><span class="level level-${escapeHtml(levelClass)}">${escapeHtml(levelText)}</span></td>
    `;

    bindRowInteractions(tr, item);
    els.marketTableBody.appendChild(tr);
  }
}

function showError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  els.scanMeta.textContent = `错误: ${msg}`;
}

function decorateOverview(overview) {
  const tradeSymbol = overview.symbol || "";
  const token = state.tokens.find((item) => item.tradeSymbol === tradeSymbol);
  return {
    ...overview,
    tradeSymbol,
    tokenName: token?.name || overview.tokenName || overview.displaySymbol || tradeSymbol,
    displaySymbol: token?.symbol || overview.displaySymbol || tradeSymbol,
    alphaId: token?.alphaId || overview.alphaId || "",
    klineUrl: token?.klineUrl || overview.klineUrl || buildBinanceKlineUrl({ alphaId: token?.alphaId, tradeSymbol }),
  };
}

async function loadOverviewBySymbol(symbol, interval) {
  const data = await getJson(
    `/api/overview?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,
  );
  const view = decorateOverview(data);

  renderSignal({
    score: view.signal?.score,
    level: view.signal?.level,
    priceChangePct: view.market?.priceChangePct,
    volumeSpikePct: view.market?.volumeSpikePct,
    tradeCount: view.market?.tradeCount,
    label: `${view.tokenName} (${view.displaySymbol}) · ${view.tradeSymbol}`,
  });

  els.modeChip.textContent = view.source === "demo" ? "DEMO" : "LIVE";
  els.timeChip.textContent = fmtTime(view.updatedAt);
}

async function loadFromInput() {
  const symbol = resolveSymbolFromInput(els.tokenInput.value);
  await loadOverviewBySymbol(symbol, els.intervalSelect.value);
}

async function loadTokens() {
  const result = await getJson("/api/tokens?limit=5000");
  state.tokens = Array.isArray(result.tokens) ? result.tokens : [];

  const options = state.tokens
    .slice(0, 1000)
    .map((token) => {
      const value = `${token.name || token.symbol} ${token.symbol || ""}`.trim();
      const label = `${token.name || token.symbol} · ${token.symbol || "--"} · ${token.tradeSymbol || "--"}`;
      return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  els.tokenOptions.innerHTML = options;

  if (state.tokens.length > 0) {
    const fullLimit = Math.min(state.tokens.length, MAX_SCAN_LIMIT);
    els.scanLimitInput.value = String(fullLimit);
  }
}

async function runScan() {
  const interval = els.intervalSelect.value;
  const limit = Math.max(5, Math.min(MAX_SCAN_LIMIT, Number(els.scanLimitInput.value) || state.tokens.length || 100));
  const result = await getJson(`/api/scan?interval=${encodeURIComponent(interval)}&limit=${limit}`);

  state.lastScan = result;
  const rankings = result.rankings || buildRankingsClient(result.results || [], 10);
  const libraryRows = buildLibraryRows(state.tokens, result.results || [], interval);

  renderBoards(rankings);
  renderMarketTable(libraryRows);

  els.scanMeta.textContent = `扫描 ${result.scannedCount} / 成功 ${result.successCount} / 失败 ${result.failureCount} / 代币库 ${state.tokens.length}`;
  els.timeChip.textContent = fmtTime(result.updatedAt);

  const top = rankings.anomaly?.[0] || result.results?.[0];
  if (top?.symbol) {
    els.tokenInput.value = getTokenName(top);
    await loadOverviewBySymbol(top.symbol, interval);
  }
}

els.scanBtn.addEventListener("click", () => {
  runScan().catch(showError);
});

els.loadBtn.addEventListener("click", () => {
  loadFromInput().catch(showError);
});

els.tokenInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    loadFromInput().catch(showError);
  }
});

els.intervalSelect.addEventListener("change", () => {
  runScan().catch(showError);
});

initTopNav();

loadTokens()
  .then(() => runScan())
  .catch(showError);
