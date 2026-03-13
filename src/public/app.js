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

function fmtFixed(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "--";
  }
  return n.toFixed(digits);
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
  const n = toNumber(value);
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
  return item.tokenName || item.displaySymbol || item.symbol || "--";
}

function getDisplayLine(item) {
  const parts = [];
  if (item.displaySymbol && item.displaySymbol !== item.tokenName) {
    parts.push(item.displaySymbol);
  }
  if (item.tradeSymbol || item.symbol) {
    parts.push(item.tradeSymbol || item.symbol);
  }
  return parts.join(" · ");
}

function buildRankingsClient(results, topN = 10) {
  const cap = Math.max(1, Math.min(50, Number(topN) || 10));
  const list = Array.isArray(results) ? results : [];

  const gainers = [...list]
    .sort((a, b) => toNumber(b.market?.priceChangePct) - toNumber(a.market?.priceChangePct))
    .slice(0, cap);
  const losers = [...list]
    .sort((a, b) => toNumber(a.market?.priceChangePct) - toNumber(b.market?.priceChangePct))
    .slice(0, cap);
  const anomaly = [...list]
    .sort((a, b) => toNumber(b.signal?.score) - toNumber(a.signal?.score))
    .slice(0, cap);
  const volume = [...list]
    .sort((a, b) => toNumber(b.ticker?.quoteVolume ?? b.ticker?.volume) - toNumber(a.ticker?.quoteVolume ?? a.ticker?.volume))
    .slice(0, cap);

  return {
    gainers,
    losers,
    anomaly,
    volume,
  };
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
  els.scoreStat.textContent = String(score ?? "--");
  els.levelTag.textContent = String(level || "low").toUpperCase();
  els.levelTag.className = `level level-${level || "low"}`;
  els.symbolMeta.textContent = label || "--";
}

function renderEmptyList(listEl, text = "暂无数据") {
  listEl.innerHTML = `<li class="rank-row"><div class="rank-name"><div class="rank-title neutral">${escapeHtml(text)}</div></div></li>`;
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
      const pct = toNumber(item.market?.priceChangePct);
      valueText = fmtPct(pct);
      valueClass = pct > 0 ? "up" : pct < 0 ? "down" : "neutral";
    } else if (type === "anomaly") {
      valueText = `${toNumber(item.signal?.score, 0)}`;
      valueClass = "up";
    } else if (type === "volume") {
      valueText = fmtCompact(item.ticker?.quoteVolume ?? item.ticker?.volume);
      valueClass = "neutral";
    }

    const li = document.createElement("li");
    li.className = "rank-row";
    li.innerHTML = `
      <div class="rank-name">
        <div class="rank-title">${escapeHtml(getTokenName(item))}</div>
        <div class="rank-sub">${escapeHtml(getDisplayLine(item))}</div>
      </div>
      <div class="rank-value ${valueClass}">${escapeHtml(valueText)}</div>
    `;
    li.addEventListener("click", () => {
      const tradeSymbol = item.tradeSymbol || item.symbol;
      if (tradeSymbol) {
        els.tokenInput.value = getTokenName(item);
        loadOverviewBySymbol(tradeSymbol, els.intervalSelect.value).catch(showError);
      }
    });
    listEl.appendChild(li);
  }
}

function renderBoards(rankings) {
  renderRankList(els.gainersList, rankings?.gainers || [], "gainers");
  renderRankList(els.losersList, rankings?.losers || [], "losers");
  renderRankList(els.anomalyList, rankings?.anomaly || [], "anomaly");
  renderRankList(els.volumeList, rankings?.volume || [], "volume");
}

function renderMarketTable(rows) {
  els.marketTableBody.innerHTML = "";
  const list = Array.isArray(rows) ? rows : [];

  if (!list.length) {
    els.marketTableBody.innerHTML = '<tr><td colspan="5" class="muted">暂无扫描结果</td></tr>';
    return;
  }

  for (const item of list) {
    const pct = toNumber(item.market?.priceChangePct);
    const level = String(item.signal?.level || "low").toUpperCase();
    const levelClass = String(item.signal?.level || "low").toLowerCase();
    const tradeSymbol = item.tradeSymbol || item.symbol;

    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.innerHTML = `
      <td class="token-cell">
        <div class="token-title">${escapeHtml(getTokenName(item))}</div>
        <div class="token-sub">${escapeHtml(getDisplayLine(item))}</div>
      </td>
      <td class="${pct > 0 ? "up" : pct < 0 ? "down" : "neutral"}">${escapeHtml(fmtPct(pct))}</td>
      <td>${escapeHtml(String(toNumber(item.signal?.score, 0)))}</td>
      <td>${escapeHtml(fmtCompact(item.ticker?.quoteVolume ?? item.ticker?.volume))}</td>
      <td><span class="level level-${escapeHtml(levelClass)}">${escapeHtml(level)}</span></td>
    `;
    tr.addEventListener("click", () => {
      if (tradeSymbol) {
        els.tokenInput.value = getTokenName(item);
        loadOverviewBySymbol(tradeSymbol, els.intervalSelect.value).catch(showError);
      }
    });
    els.marketTableBody.appendChild(tr);
  }
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
    const candidates = [
      token.name,
      token.symbol,
      token.tradeSymbol,
      token.alphaId,
      `${token.name} ${token.symbol}`,
    ];
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

function decorateOverview(overview) {
  const tradeSymbol = overview.symbol || "";
  const token = state.tokens.find((item) => item.tradeSymbol === tradeSymbol);
  return {
    ...overview,
    tradeSymbol,
    tokenName: token?.name || overview.tokenName || overview.displaySymbol || tradeSymbol,
    displaySymbol: token?.symbol || overview.displaySymbol || tradeSymbol,
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
  const result = await getJson("/api/tokens?limit=1000");
  state.tokens = Array.isArray(result.tokens) ? result.tokens : [];

  const options = state.tokens
    .slice(0, 350)
    .map((token) => {
      const value = `${token.name || token.symbol} ${token.symbol || ""}`.trim();
      const label = `${token.name || token.symbol} · ${token.symbol || "--"} · ${token.tradeSymbol || "--"}`;
      return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
    })
    .join("");
  els.tokenOptions.innerHTML = options;
}

function showError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  els.scanMeta.textContent = `错误: ${msg}`;
}

async function runScan() {
  const interval = els.intervalSelect.value;
  const limit = Math.max(5, Math.min(100, Number(els.scanLimitInput.value) || 20));
  const result = await getJson(`/api/scan?interval=${encodeURIComponent(interval)}&limit=${limit}`);

  state.lastScan = result;
  const rankings = result.rankings || buildRankingsClient(result.results || [], 10);

  renderBoards(rankings);
  renderMarketTable(result.results || []);
  els.scanMeta.textContent = `扫描 ${result.scannedCount} / 成功 ${result.successCount} / 失败 ${result.failureCount}`;
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

Promise.all([loadTokens(), runScan()]).catch(showError);
