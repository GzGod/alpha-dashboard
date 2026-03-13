const els = {
  symbolInput: document.querySelector("#symbolInput"),
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
  scanTableBody: document.querySelector("#scanTableBody"),
  volumeBars: document.querySelector("#volumeBars"),
};

let lastScanResult = null;

function fmtNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return "--";
  }
  return n.toFixed(digits);
}

function formatTime(iso) {
  if (!iso) {
    return "--";
  }
  const d = new Date(iso);
  return d.toLocaleString();
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

function renderSignal({ score, level, priceChangePct, volumeSpikePct, tradeCount }) {
  els.priceMoveStat.textContent = `${fmtNumber(priceChangePct)}%`;
  els.volumeSpikeStat.textContent = `${fmtNumber(volumeSpikePct)}%`;
  els.tradeCountStat.textContent = String(tradeCount ?? "--");
  els.scoreStat.textContent = String(score ?? "--");

  els.levelTag.textContent = String(level || "low").toUpperCase();
  els.levelTag.className = `level level-${level || "low"}`;
}

function renderVolumeBars(klines = []) {
  els.volumeBars.innerHTML = "";
  if (!klines.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "暂无 K 线数据";
    els.volumeBars.appendChild(empty);
    return;
  }

  const maxVolume = Math.max(...klines.map((k) => Number(k.volume) || 0), 1);

  for (const kline of klines) {
    const bar = document.createElement("div");
    bar.className = "bar";
    const pct = ((Number(kline.volume) || 0) / maxVolume) * 100;
    bar.style.height = `${Math.max(8, pct)}%`;
    bar.title = `time: ${new Date(kline.openTime).toLocaleTimeString()} | volume: ${fmtNumber(
      kline.volume,
      4,
    )}`;
    els.volumeBars.appendChild(bar);
  }
}

function renderScanTable(scanResult) {
  els.scanTableBody.innerHTML = "";
  const rows = scanResult?.results || [];

  for (const item of rows) {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.innerHTML = `
      <td>${item.symbol}</td>
      <td>${item.signal.score}</td>
      <td>${fmtNumber(item.market.priceChangePct)}</td>
      <td>${fmtNumber(item.market.volumeSpikePct)}</td>
      <td>${String(item.signal.level).toUpperCase()}</td>
    `;
    tr.addEventListener("click", () => {
      els.symbolInput.value = item.symbol;
      loadOverview(item.symbol, els.intervalSelect.value).catch(showError);
    });
    els.scanTableBody.appendChild(tr);
  }

  if (rows.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="5" class="muted">暂无扫描结果</td>`;
    els.scanTableBody.appendChild(tr);
  }
}

function showError(error) {
  const msg = error instanceof Error ? error.message : String(error);
  els.scanMeta.textContent = `错误: ${msg}`;
}

async function loadOverview(symbol, interval) {
  if (!symbol) {
    throw new Error("请输入 symbol");
  }

  const data = await getJson(
    `/api/overview?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}`,
  );

  renderSignal({
    score: data.signal?.score,
    level: data.signal?.level,
    priceChangePct: data.market?.priceChangePct,
    volumeSpikePct: data.market?.volumeSpikePct,
    tradeCount: data.market?.tradeCount,
  });
  renderVolumeBars(data.klines);

  els.modeChip.textContent = data.source === "demo" ? "DEMO 数据" : "LIVE 数据";
  els.symbolMeta.textContent = `${data.symbol} | ${data.interval}`;
  els.timeChip.textContent = formatTime(data.updatedAt);
}

async function runScan() {
  const interval = els.intervalSelect.value;
  const limit = Math.max(5, Math.min(100, Number(els.scanLimitInput.value) || 20));
  const result = await getJson(`/api/scan?interval=${encodeURIComponent(interval)}&limit=${limit}`);

  lastScanResult = result;
  renderScanTable(result);
  els.scanMeta.textContent = `扫描 ${result.scannedCount}，成功 ${result.successCount}，失败 ${result.failureCount}`;
  els.timeChip.textContent = formatTime(result.updatedAt);

  const top = result.results[0];
  if (top) {
    els.symbolInput.value = top.symbol;
    await loadOverview(top.symbol, interval);
  }
}

els.scanBtn.addEventListener("click", () => {
  runScan().catch(showError);
});

els.loadBtn.addEventListener("click", () => {
  loadOverview(els.symbolInput.value.trim(), els.intervalSelect.value).catch(showError);
});

els.intervalSelect.addEventListener("change", () => {
  if (lastScanResult) {
    runScan().catch(showError);
  }
});

runScan().catch(showError);
