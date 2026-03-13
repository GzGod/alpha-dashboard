import { buildAnomalySignal, calculatePriceMovePct, calculateVolumeSpikePct } from "../lib/metrics.js";

const USER_AGENT = "binance-alpha/1.0.0 (Skill)";
const TOKEN_LIST_PATH = "/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list";
const TICKER_PATH = "/bapi/defi/v1/public/alpha-trade/ticker";
const AGG_TRADES_PATH = "/bapi/defi/v1/public/alpha-trade/agg-trades";
const KLINES_PATH = "/bapi/defi/v1/public/alpha-trade/klines";

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 2) {
  return Number(toNumber(value).toFixed(digits));
}

function unwrapData(payload) {
  if (payload && typeof payload === "object" && "data" in payload) {
    return payload.data;
  }

  return payload;
}

function extractArray(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (data && typeof data === "object") {
    const candidates = ["list", "rows", "items", "tokens", "data"];
    for (const key of candidates) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }
  }

  return [];
}

function selectScannableSymbols(tokens, limit) {
  const normalizedLimit = Math.max(1, Math.min(100, toNumber(limit, 20)));
  const seen = new Set();
  const allSymbols = [];

  for (const token of tokens) {
    if (!token || typeof token !== "object") {
      continue;
    }

    const symbol = String(token.symbol || token.tokenId || token.id || "").trim();
    if (!symbol || seen.has(symbol)) {
      continue;
    }

    seen.add(symbol);
    allSymbols.push(symbol);
  }

  const usdtSymbols = allSymbols.filter((symbol) => /USDT$/i.test(symbol));
  const selected = (usdtSymbols.length > 0 ? usdtSymbols : allSymbols).slice(0, normalizedLimit);

  return {
    symbols: selected,
    selectionMode: usdtSymbols.length > 0 ? "usdt-priority" : "fallback-all",
    tokenCount: allSymbols.length,
  };
}

function normalizeTokenList(data) {
  const rows = extractArray(data);
  const seen = new Set();
  const tokens = [];

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const symbol = String(row.symbol || row.pair || row.tokenSymbol || row.tokenId || row.id || "").trim();
    if (!symbol || seen.has(symbol)) {
      continue;
    }

    seen.add(symbol);
    tokens.push({
      symbol,
      name: String(row.name || row.tokenName || symbol),
      tokenId: String(row.tokenId || row.id || symbol),
    });
  }

  return tokens.sort((a, b) => a.symbol.localeCompare(b.symbol));
}

function normalizeTicker(data) {
  if (!data || typeof data !== "object") {
    return {
      symbol: "",
      lastPrice: 0,
      openPrice: 0,
      volume: 0,
      quoteVolume: 0,
      priceChangePct: 0,
    };
  }

  const symbol = String(data.symbol || data.s || "");
  const lastPrice = toNumber(data.lastPrice ?? data.close ?? data.c ?? data.price);
  const openPrice = toNumber(data.openPrice ?? data.open ?? data.o, lastPrice);
  const volume = toNumber(data.volume ?? data.v ?? data.baseVolume ?? data.totalVolume);
  const quoteVolume = toNumber(data.quoteVolume ?? data.qv ?? data.amount ?? data.turnover);

  const providedPct = data.priceChangePercent ?? data.p ?? data.changePercent;
  const priceChangePct =
    providedPct == null ? calculatePriceMovePct(openPrice, lastPrice) : round(toNumber(providedPct));

  return {
    symbol,
    lastPrice: round(lastPrice, 8),
    openPrice: round(openPrice, 8),
    volume: round(volume, 8),
    quoteVolume: round(quoteVolume, 8),
    priceChangePct,
  };
}

function normalizeKlines(data) {
  const rows = extractArray(data);

  return rows
    .map((row) => {
      if (Array.isArray(row)) {
        return {
          openTime: toNumber(row[0]),
          open: toNumber(row[1]),
          high: toNumber(row[2]),
          low: toNumber(row[3]),
          close: toNumber(row[4]),
          volume: toNumber(row[5]),
          closeTime: toNumber(row[6]),
          quoteVolume: toNumber(row[7]),
        };
      }

      if (!row || typeof row !== "object") {
        return null;
      }

      return {
        openTime: toNumber(row.openTime ?? row.t),
        open: toNumber(row.open ?? row.o),
        high: toNumber(row.high ?? row.h),
        low: toNumber(row.low ?? row.l),
        close: toNumber(row.close ?? row.c),
        volume: toNumber(row.volume ?? row.v),
        closeTime: toNumber(row.closeTime ?? row.T),
        quoteVolume: toNumber(row.quoteVolume ?? row.qv),
      };
    })
    .filter(Boolean)
    .filter((item) => item.openTime > 0)
    .sort((a, b) => a.openTime - b.openTime);
}

function normalizeAggTrades(data) {
  const rows = extractArray(data);

  return rows
    .map((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }

      return {
        id: toNumber(row.a ?? row.id),
        price: toNumber(row.p ?? row.price),
        qty: toNumber(row.q ?? row.qty ?? row.quantity),
        timestamp: toNumber(row.T ?? row.time ?? row.timestamp),
      };
    })
    .filter(Boolean);
}

function mapWithConcurrency(items, concurrency, mapper) {
  const limit = Math.max(1, Math.floor(concurrency));
  const queue = [...items];
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    const workerResult = [];

    while (queue.length > 0) {
      const nextItem = queue.shift();
      if (nextItem == null) {
        break;
      }

      workerResult.push(await mapper(nextItem));
    }

    return workerResult;
  });

  return Promise.all(workers).then((chunks) => chunks.flat());
}

function buildDemoOverview(symbol, interval) {
  const hash = [...symbol].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const priceChangePct = round(((hash % 180) - 90) / 10);
  const volumeSpikePct = round((hash * 7) % 220);
  const tradeCount = 30 + (hash % 320);

  const signal = buildAnomalySignal({
    priceChangePct,
    volumeSpikePct,
    tradeCount,
  });

  const basePrice = 1 + (hash % 50) / 10;
  const now = Date.now();
  const klines = new Array(20).fill(0).map((_, i) => {
    const drift = (i - 10) * 0.003;
    const close = round(basePrice * (1 + drift + (priceChangePct / 100) * (i / 25)), 6);
    return {
      openTime: now - (20 - i) * 60000,
      open: round(close * 0.99, 6),
      high: round(close * 1.01, 6),
      low: round(close * 0.98, 6),
      close,
      volume: round(1000 + i * 120 + volumeSpikePct * 5, 3),
      closeTime: now - (19 - i) * 60000,
      quoteVolume: round((1000 + i * 120) * close, 3),
    };
  });

  return {
    symbol,
    interval,
    ticker: {
      symbol,
      lastPrice: klines[klines.length - 1].close,
      openPrice: klines[0].open,
      volume: round(50000 + volumeSpikePct * 130),
      quoteVolume: round(150000 + volumeSpikePct * 210),
      priceChangePct,
    },
    market: {
      priceChangePct,
      volumeSpikePct,
      tradeCount,
      currentVolume: klines[klines.length - 1].volume,
      baselineVolumeAvg: round(
        klines.slice(0, -1).reduce((sum, item) => sum + item.volume, 0) / (klines.length - 1),
      ),
    },
    signal,
    klines,
    source: "demo",
    updatedAt: new Date().toISOString(),
  };
}

export class BinanceAlphaService {
  constructor({
    baseUrl,
    timeoutMs = 12000,
    scanSymbolLimit = 20,
    demoMode = false,
  }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
    this.scanSymbolLimit = scanSymbolLimit;
    this.demoMode = demoMode;
    this.tokenCache = null;
    this.tokenCacheExpiresAt = 0;
    this.overviewCache = new Map();
  }

  async fetchJson(path, query = {}) {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchTokenList() {
    if (this.demoMode) {
      return [
        { symbol: "ALPHA_175USDT", name: "ALPHA 175", tokenId: "alpha-175" },
        { symbol: "BETA_402USDT", name: "BETA 402", tokenId: "beta-402" },
        { symbol: "GAMMA_008USDT", name: "GAMMA 008", tokenId: "gamma-008" },
        { symbol: "OMEGA_999USDT", name: "OMEGA 999", tokenId: "omega-999" },
      ];
    }

    const now = Date.now();
    if (this.tokenCache && now < this.tokenCacheExpiresAt) {
      return this.tokenCache;
    }

    const payload = await this.fetchJson(TOKEN_LIST_PATH);
    const tokens = normalizeTokenList(unwrapData(payload));

    if (!tokens.length) {
      throw new Error("Token list is empty");
    }

    this.tokenCache = tokens;
    this.tokenCacheExpiresAt = now + 5 * 60 * 1000;

    return tokens;
  }

  async fetchTicker(symbol) {
    const payload = await this.fetchJson(TICKER_PATH, { symbol });
    const raw = unwrapData(payload);
    const row = Array.isArray(raw) ? raw[0] : raw;
    return normalizeTicker(row);
  }

  async fetchKlines(symbol, interval = "1m", limit = 30) {
    const payload = await this.fetchJson(KLINES_PATH, { symbol, interval, limit });
    return normalizeKlines(unwrapData(payload));
  }

  async fetchAggTrades(symbol, limit = 250) {
    const payload = await this.fetchJson(AGG_TRADES_PATH, { symbol, limit });
    return normalizeAggTrades(unwrapData(payload));
  }

  async fetchOverview(symbol, interval = "1m") {
    const key = `${symbol}:${interval}`;
    const cached = this.overviewCache.get(key);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    if (this.demoMode) {
      const demo = buildDemoOverview(symbol, interval);
      this.overviewCache.set(key, {
        value: demo,
        expiresAt: Date.now() + 15 * 1000,
      });
      return demo;
    }

    const [ticker, klines, aggTrades] = await Promise.all([
      this.fetchTicker(symbol),
      this.fetchKlines(symbol, interval, 40),
      this.fetchAggTrades(symbol, 250),
    ]);

    const latestKline = klines[klines.length - 1];
    const baselineVolumes = klines.slice(0, -1).map((item) => item.volume);
    const currentVolume = latestKline?.volume ?? ticker.volume;
    const baselineVolumeAvg =
      baselineVolumes.length > 0
        ? baselineVolumes.reduce((sum, item) => sum + item, 0) / baselineVolumes.length
        : 0;

    const priceChangePct =
      ticker.priceChangePct || calculatePriceMovePct(ticker.openPrice, ticker.lastPrice);
    const volumeSpikePct = calculateVolumeSpikePct(currentVolume, baselineVolumes);
    const tradeCount = aggTrades.length;

    const signal = buildAnomalySignal({
      priceChangePct,
      volumeSpikePct,
      tradeCount,
    });

    const overview = {
      symbol,
      interval,
      ticker,
      market: {
        priceChangePct,
        volumeSpikePct,
        tradeCount,
        currentVolume: round(currentVolume, 8),
        baselineVolumeAvg: round(baselineVolumeAvg, 8),
      },
      signal,
      klines: klines.slice(-20),
      source: "binance",
      updatedAt: new Date().toISOString(),
    };

    this.overviewCache.set(key, {
      value: overview,
      expiresAt: Date.now() + 15 * 1000,
    });

    return overview;
  }

  async scanSymbols({
    interval = "1m",
    limit = this.scanSymbolLimit,
  } = {}) {
    const tokens = await this.fetchTokenList();
    const { symbols, selectionMode, tokenCount } = selectScannableSymbols(
      tokens,
      toNumber(limit, this.scanSymbolLimit),
    );

    const scanned = await mapWithConcurrency(symbols, 4, async (symbol) => {
      try {
        const overview = await this.fetchOverview(symbol, interval);
        return { ok: true, symbol, overview };
      } catch (error) {
        return {
          ok: false,
          symbol,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    });

    const results = scanned
      .filter((item) => item.ok)
      .map((item) => item.overview)
      .sort((a, b) => b.signal.score - a.signal.score);

    const failures = scanned.filter((item) => !item.ok).map((item) => ({
      symbol: item.symbol,
      error: item.error,
    }));

    return {
      interval,
      tokenCount,
      selectionMode,
      scannedCount: symbols.length,
      successCount: results.length,
      failureCount: failures.length,
      failures,
      results,
      updatedAt: new Date().toISOString(),
    };
  }
}
