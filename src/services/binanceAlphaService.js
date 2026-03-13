import { buildAnomalySignal, calculatePriceMovePct, calculateVolumeSpikePct } from "../lib/metrics.js";

const USER_AGENT = "binance-alpha/1.0.0 (Skill)";
const TOKEN_LIST_PATH = "/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list";
const TICKER_PATH = "/bapi/defi/v1/public/alpha-trade/ticker";
const AGG_TRADES_PATH = "/bapi/defi/v1/public/alpha-trade/agg-trades";
const KLINES_PATH = "/bapi/defi/v1/public/alpha-trade/klines";
const MAX_SCAN_SYMBOLS = 5000;
const CHAIN_SLUG_ALIASES = {
  arbitrum: "arbitrum",
  arb: "arbitrum",
  base: "base",
  bsc: "bsc",
  "bnb smart chain": "bsc",
  "binance smart chain": "bsc",
  ethereum: "ethereum",
  eth: "ethereum",
  linea: "linea",
  solana: "solana",
  sonic: "sonic",
  sui: "sui",
  tron: "tron",
  trx: "tron",
};
const CHAIN_ID_SLUG_ALIASES = {
  "1": "ethereum",
  "56": "bsc",
  "8453": "base",
  "42161": "arbitrum",
  "59144": "linea",
};
const SUPPORTED_WINDOWS = {
  "15m": {
    key: "15m",
    klineInterval: "1m",
    currentBars: 15,
    baselineBars: 60,
    fetchBars: 140,
  },
  "1h": {
    key: "1h",
    klineInterval: "5m",
    currentBars: 12,
    baselineBars: 48,
    fetchBars: 140,
  },
  "4h": {
    key: "4h",
    klineInterval: "15m",
    currentBars: 16,
    baselineBars: 64,
    fetchBars: 160,
  },
  "24h": {
    key: "24h",
    klineInterval: "1h",
    currentBars: 24,
    baselineBars: 96,
    fetchBars: 180,
  },
};

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

function resolveWindowConfig(windowKey) {
  const key = String(windowKey || "").trim();
  if (SUPPORTED_WINDOWS[key]) {
    return SUPPORTED_WINDOWS[key];
  }

  const legacy = {
    "1m": "15m",
    "5m": "1h",
    "15m": "15m",
    "1h": "1h",
    "4h": "4h",
    "1d": "24h",
  };
  const normalized = legacy[key] || "1h";
  return SUPPORTED_WINDOWS[normalized];
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

function toTradeSymbol(tokenLike) {
  if (!tokenLike || typeof tokenLike !== "object") {
    return "";
  }

  const direct = String(
    tokenLike.tradeSymbol || tokenLike.tradingSymbol || tokenLike.symbolForTrade || "",
  ).trim();
  if (direct) {
    return direct;
  }

  const alphaId = String(tokenLike.alphaId || "").trim();
  if (alphaId) {
    if (/(USDT|USDC|FDUSD|BUSD)$/i.test(alphaId)) {
      return alphaId;
    }
    return `${alphaId}USDT`;
  }

  const symbol = String(tokenLike.symbol || tokenLike.pair || tokenLike.tokenSymbol || "").trim();
  if (symbol && /(USDT|USDC|FDUSD|BUSD)$/i.test(symbol)) {
    return symbol;
  }

  return symbol;
}

function normalizeChainSlug({ chainName, chainId }) {
  const normalizedName = String(chainName || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (normalizedName) {
    if (CHAIN_SLUG_ALIASES[normalizedName]) {
      return CHAIN_SLUG_ALIASES[normalizedName];
    }
    return normalizedName
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+/g, "")
      .replace(/-+$/g, "");
  }

  const normalizedId = String(chainId || "").trim();
  return CHAIN_ID_SLUG_ALIASES[normalizedId] || "";
}

function buildBinanceKlineUrl({ chainName, chainId, contractAddress, alphaId, tradeSymbol, symbol }) {
  const normalizedChain = normalizeChainSlug({ chainName, chainId });
  const normalizedContractAddress = String(contractAddress || "").trim();
  if (normalizedChain && normalizedContractAddress) {
    return `https://www.binance.com/zh-CN/alpha/${encodeURIComponent(normalizedChain)}/${encodeURIComponent(normalizedContractAddress)}?_from=markets`;
  }

  const pair = String(tradeSymbol || symbol || "").trim();
  if (pair) {
    return `https://www.binance.com/zh-CN/trade/${encodeURIComponent(pair)}?type=spot`;
  }

  const normalizedAlphaId = String(alphaId || "").trim();
  if (normalizedAlphaId) {
    return `https://www.binance.com/zh-CN/alpha/${encodeURIComponent(normalizedAlphaId)}`;
  }

  return "https://www.binance.com/zh-CN/markets";
}

function byNumberDesc(selector) {
  return (a, b) => toNumber(selector(b)) - toNumber(selector(a));
}

function byNumberAsc(selector) {
  return (a, b) => toNumber(selector(a)) - toNumber(selector(b));
}

function average(values) {
  const clean = values
    .map((item) => toNumber(item, NaN))
    .filter((item) => Number.isFinite(item) && item >= 0);

  if (!clean.length) {
    return 0;
  }

  return clean.reduce((sum, item) => sum + item, 0) / clean.length;
}

export function buildRankings(results, topN = 10) {
  const list = Array.isArray(results) ? results : [];
  const cap = Math.max(1, Math.min(50, toNumber(topN, 10)));

  const gainers = [...list]
    .sort(byNumberDesc((item) => item?.market?.priceChangePct))
    .slice(0, cap);

  const losers = [...list]
    .sort(byNumberAsc((item) => item?.market?.priceChangePct))
    .slice(0, cap);

  const anomaly = [...list]
    .sort(byNumberDesc((item) => item?.signal?.score))
    .slice(0, cap);

  const volume = [...list]
    .sort(byNumberDesc((item) => item?.ticker?.quoteVolume ?? item?.ticker?.volume))
    .slice(0, cap);

  return {
    gainers,
    losers,
    anomaly,
    volume,
  };
}

export function deriveVolumeSnapshot(
  klines,
  { nowMs = Date.now(), currentWindow = 3, baselineWindow = 20 } = {},
) {
  const rows = Array.isArray(klines) ? [...klines] : [];
  const sorted = rows
    .map((row) => ({
      ...row,
      openTime: toNumber(row?.openTime),
      closeTime: toNumber(row?.closeTime),
      volume: toNumber(row?.volume, NaN),
    }))
    .filter((row) => Number.isFinite(row.openTime) && Number.isFinite(row.volume) && row.volume >= 0)
    .sort((a, b) => a.openTime - b.openTime);

  if (!sorted.length) {
    return {
      currentVolume: 0,
      baselineVolumes: [],
      baselineVolumeAvg: 0,
    };
  }

  const closed = sorted.filter((row) => row.closeTime > 0 && row.closeTime <= nowMs);
  const source = closed.length >= 2 ? closed : sorted;

  const currentSize = Math.max(1, Math.min(10, toNumber(currentWindow, 3)));
  const baselineSize = Math.max(1, Math.min(300, toNumber(baselineWindow, 20)));

  const currentCandles = source.slice(-currentSize);
  const currentRawVolumes = currentCandles.map((row) => row.volume).filter((v) => Number.isFinite(v) && v >= 0);
  const currentNonZeroVolumes = currentRawVolumes.filter((v) => v > 0);
  const currentVolume = average(currentNonZeroVolumes.length > 0 ? currentNonZeroVolumes : currentRawVolumes);

  let baselineVolumes = source
    .slice(-(currentSize + baselineSize), -currentSize)
    .map((row) => row.volume)
    .filter((v) => Number.isFinite(v) && v > 0);

  if (baselineVolumes.length === 0) {
    baselineVolumes = source
      .slice(0, Math.max(0, source.length - currentSize))
      .map((row) => row.volume)
      .filter((v) => Number.isFinite(v) && v > 0);
  }

  return {
    currentVolume: round(currentVolume, 8),
    baselineVolumes,
    baselineVolumeAvg: round(average(baselineVolumes), 8),
  };
}

function getClosedKlines(klines, nowMs = Date.now()) {
  const rows = Array.isArray(klines) ? klines : [];
  const closed = rows.filter(
    (row) =>
      Number.isFinite(toNumber(row?.openTime, NaN)) &&
      Number.isFinite(toNumber(row?.closeTime, NaN)) &&
      toNumber(row.closeTime) <= nowMs,
  );

  if (closed.length >= 2) {
    return closed;
  }

  return rows;
}

function derivePriceChangePct(klines, currentBars, nowMs = Date.now()) {
  const source = getClosedKlines(klines, nowMs);
  if (!source.length) {
    return 0;
  }

  const size = Math.max(1, Math.min(400, toNumber(currentBars, 1)));
  const currentCandles = source.slice(-size);
  if (!currentCandles.length) {
    return 0;
  }

  const first = currentCandles[0];
  const last = currentCandles[currentCandles.length - 1];
  const startPrice = toNumber(first.open, toNumber(first.close));
  const endPrice = toNumber(last.close, toNumber(last.open));

  return calculatePriceMovePct(startPrice, endPrice);
}

function deriveWindowTradeCount(klines, currentBars, nowMs = Date.now()) {
  const source = getClosedKlines(klines, nowMs);
  const size = Math.max(1, Math.min(400, toNumber(currentBars, 1)));

  return source
    .slice(-size)
    .reduce((sum, row) => sum + Math.max(0, toNumber(row?.tradeCount, 0)), 0);
}

function selectScannableSymbols(tokens, limit) {
  const normalizedLimit = Math.max(1, Math.min(10000, toNumber(limit, 100)));
  const seen = new Set();
  const allTokens = [];

  for (const token of tokens) {
    if (!token || typeof token !== "object") {
      continue;
    }

    const tradeSymbol = toTradeSymbol(token) || String(token.symbol || token.tokenId || token.id || "").trim();
    if (!tradeSymbol || seen.has(tradeSymbol)) {
      continue;
    }

    seen.add(tradeSymbol);
    const displaySymbol = String(token.symbol || token.tokenSymbol || token.alphaId || tradeSymbol).trim();
    allTokens.push({
      symbol: displaySymbol || tradeSymbol,
      tradeSymbol,
      name: String(token.name || token.tokenName || displaySymbol || tradeSymbol),
      tokenId: String(token.tokenId || token.id || displaySymbol || tradeSymbol),
      alphaId: String(token.alphaId || ""),
      chainName: String(token.chainName || ""),
      chainId: String(token.chainId || ""),
      contractAddress: String(token.contractAddress || token.address || ""),
      price: toNumber(token.price, NaN),
      percentChange24h: toNumber(token.percentChange24h, NaN),
      volume24h: toNumber(token.volume24h, NaN),
      count24h: toNumber(token.count24h, NaN),
      marketCap: toNumber(token.marketCap, NaN),
      klineUrl: buildBinanceKlineUrl({
        chainName: token.chainName,
        chainId: token.chainId,
        contractAddress: token.contractAddress || token.address,
        alphaId: token.alphaId,
        tradeSymbol,
        symbol: displaySymbol || tradeSymbol,
      }),
    });
  }

  const selectedTokens = allTokens.slice(0, normalizedLimit);

  return {
    symbols: selectedTokens.map((token) => token.tradeSymbol),
    selectedTokens,
    selectionMode: "all",
    tokenCount: allTokens.length,
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

    const displaySymbol = String(row.symbol || row.pair || row.tokenSymbol || row.tokenId || row.id || "").trim();
    const tradeSymbol = toTradeSymbol(row) || displaySymbol;
    const symbol = displaySymbol || tradeSymbol;
    if (!symbol || seen.has(symbol)) {
      continue;
    }

    seen.add(symbol);
    tokens.push({
      symbol,
      tradeSymbol,
      name: String(row.name || row.tokenName || symbol),
      tokenId: String(row.tokenId || row.id || symbol),
      alphaId: String(row.alphaId || ""),
      chainName: String(row.chainName || ""),
      chainId: String(row.chainId || ""),
      contractAddress: String(row.contractAddress || row.address || ""),
      price: toNumber(row.price, NaN),
      percentChange24h: toNumber(row.percentChange24h, NaN),
      volume24h: toNumber(row.volume24h, NaN),
      count24h: toNumber(row.count24h, NaN),
      marketCap: toNumber(row.marketCap, NaN),
      klineUrl: buildBinanceKlineUrl({
        chainName: row.chainName,
        chainId: row.chainId,
        contractAddress: row.contractAddress || row.address,
        alphaId: row.alphaId,
        tradeSymbol,
        symbol,
      }),
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
      tradeCount24h: 0,
      priceChangePct: 0,
    };
  }

  const symbol = String(data.symbol || data.s || "");
  const lastPrice = toNumber(data.lastPrice ?? data.close ?? data.c ?? data.price);
  const openPrice = toNumber(data.openPrice ?? data.open ?? data.o, lastPrice);
  const volume = toNumber(data.volume ?? data.v ?? data.baseVolume ?? data.totalVolume);
  const quoteVolume = toNumber(data.quoteVolume ?? data.qv ?? data.amount ?? data.turnover);
  const tradeCount24h = toNumber(data.count ?? data.tradeCount ?? data.n);

  const providedPct = data.priceChangePercent ?? data.p ?? data.changePercent;
  const priceChangePct =
    providedPct == null ? calculatePriceMovePct(openPrice, lastPrice) : round(toNumber(providedPct));

  return {
    symbol,
    lastPrice: round(lastPrice, 8),
    openPrice: round(openPrice, 8),
    volume: round(volume, 8),
    quoteVolume: round(quoteVolume, 8),
    tradeCount24h,
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
          tradeCount: toNumber(row[8]),
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
        tradeCount: toNumber(row.tradeCount ?? row.n),
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
    tradeSymbol: symbol,
    displaySymbol: symbol,
    tokenName: symbol,
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
    klineUrl: buildBinanceKlineUrl({ tradeSymbol: symbol, symbol }),
    updatedAt: new Date().toISOString(),
  };
}

export class BinanceAlphaService {
  constructor({
    baseUrl,
    timeoutMs = 12000,
    scanSymbolLimit = 100,
    volumeCurrentWindow = 3,
    volumeBaselineWindow = 20,
    demoMode = false,
  }) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
    this.scanSymbolLimit = scanSymbolLimit;
    this.volumeCurrentWindow = Math.max(1, Math.min(10, toNumber(volumeCurrentWindow, 3)));
    this.volumeBaselineWindow = Math.max(1, Math.min(300, toNumber(volumeBaselineWindow, 20)));
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
        {
          symbol: "SN3",
          tradeSymbol: "ALPHA_798USDT",
          alphaId: "ALPHA_798",
          name: "Nebula3",
          tokenId: "alpha-798",
          price: 0.0072,
          percentChange24h: -35.41,
          volume24h: 27675749.98,
          count24h: 54032,
          marketCap: 2657077.69,
          klineUrl: "https://www.binance.com/zh-CN/alpha/ALPHA_798",
        },
        {
          symbol: "URO",
          tradeSymbol: "ALPHA_175USDT",
          alphaId: "ALPHA_175",
          name: "URO",
          tokenId: "alpha-175",
          price: 0.022,
          percentChange24h: 18.65,
          volume24h: 17640000,
          count24h: 32020,
          marketCap: 23210000,
          klineUrl: "https://www.binance.com/zh-CN/alpha/ALPHA_175",
        },
        {
          symbol: "BETA",
          tradeSymbol: "ALPHA_402USDT",
          alphaId: "ALPHA_402",
          name: "BETA",
          tokenId: "alpha-402",
          price: 0.18,
          percentChange24h: 3.72,
          volume24h: 9280000,
          count24h: 14022,
          marketCap: 67090000,
          klineUrl: "https://www.binance.com/zh-CN/alpha/ALPHA_402",
        },
        {
          symbol: "GAMMA",
          tradeSymbol: "ALPHA_008USDT",
          alphaId: "ALPHA_008",
          name: "GAMMA",
          tokenId: "alpha-008",
          price: 0.55,
          percentChange24h: -7.46,
          volume24h: 728470,
          count24h: 2780,
          marketCap: 21850000,
          klineUrl: "https://www.binance.com/zh-CN/alpha/ALPHA_008",
        },
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

  async fetchScanSnapshot(symbol, interval = "1h") {
    if (this.demoMode) {
      return buildDemoOverview(symbol, interval);
    }

    const windowConfig = resolveWindowConfig(interval);

    const [ticker, klines] = await Promise.all([
      this.fetchTicker(symbol),
      this.fetchKlines(symbol, windowConfig.klineInterval, windowConfig.fetchBars),
    ]);

    const volumeSnapshot = deriveVolumeSnapshot(klines, {
      currentWindow: windowConfig.currentBars,
      baselineWindow: windowConfig.baselineBars,
    });

    const currentVolume = volumeSnapshot.currentVolume;
    const baselineVolumes = volumeSnapshot.baselineVolumes;
    const baselineVolumeAvg = volumeSnapshot.baselineVolumeAvg;
    const priceFromWindow = derivePriceChangePct(klines, windowConfig.currentBars);
    const priceChangePct =
      Math.abs(priceFromWindow) > 0
        ? priceFromWindow
        : windowConfig.key === "24h"
          ? ticker.priceChangePct
          : 0;
    const volumeSpikePct = calculateVolumeSpikePct(currentVolume, baselineVolumes);
    const tradeCount = deriveWindowTradeCount(klines, windowConfig.currentBars) || ticker.tradeCount24h || 0;

    const signal = buildAnomalySignal({
      priceChangePct,
      volumeSpikePct,
      tradeCount,
    });

    return {
      symbol,
      interval: windowConfig.key,
      ticker,
      market: {
        priceChangePct: round(priceChangePct, 2),
        volumeSpikePct: round(volumeSpikePct, 2),
        tradeCount: round(tradeCount, 0),
        currentVolume: round(currentVolume, 8),
        baselineVolumeAvg: round(baselineVolumeAvg, 8),
      },
      signal,
      klines: klines.slice(-20),
      source: "binance",
      updatedAt: new Date().toISOString(),
    };
  }

  async fetchOverview(symbol, interval = "1h") {
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

    const baseSnapshot = await this.fetchScanSnapshot(symbol, interval);
    let tradeCount = baseSnapshot.market.tradeCount;

    try {
      const aggTrades = await this.fetchAggTrades(symbol, 250);
      if (aggTrades.length > 0) {
        tradeCount = aggTrades.length;
      }
    } catch (_error) {
      // Keep snapshot trade count if agg-trades request fails.
    }

    const signal = buildAnomalySignal({
      priceChangePct: baseSnapshot.market.priceChangePct,
      volumeSpikePct: baseSnapshot.market.volumeSpikePct,
      tradeCount,
    });

    const overview = {
      ...baseSnapshot,
      market: {
        ...baseSnapshot.market,
        tradeCount,
      },
      signal,
    };

    this.overviewCache.set(key, {
      value: overview,
      expiresAt: Date.now() + 15 * 1000,
    });

    return overview;
  }

  async scanSymbols({
    interval = "1h",
    limit = this.scanSymbolLimit,
  } = {}) {
    const requestedLimit = Math.max(1, toNumber(limit, this.scanSymbolLimit));
    const effectiveLimit = Math.max(1, Math.min(MAX_SCAN_SYMBOLS, requestedLimit));

    const tokens = await this.fetchTokenList();
    const { symbols, selectedTokens, selectionMode, tokenCount } = selectScannableSymbols(
      tokens,
      effectiveLimit,
    );
    const tokenByTradeSymbol = new Map(
      selectedTokens.map((token) => [token.tradeSymbol, token]),
    );

    const scanned = await mapWithConcurrency(symbols, 8, async (symbol) => {
      const tokenMeta = tokenByTradeSymbol.get(symbol);
      try {
        const overview = await this.fetchScanSnapshot(symbol, interval);
        return { ok: true, symbol, tokenMeta, overview };
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
      .map((item) => ({
        ...item.overview,
        symbol: item.overview.symbol || item.symbol,
        tradeSymbol: item.tokenMeta?.tradeSymbol || item.overview.symbol || item.symbol,
        displaySymbol: item.tokenMeta?.symbol || item.overview.symbol || item.symbol,
        tokenName:
          item.tokenMeta?.name || item.tokenMeta?.symbol || item.overview.symbol || item.symbol,
        alphaId: item.tokenMeta?.alphaId || "",
        chainName: item.tokenMeta?.chainName || "",
        chainId: item.tokenMeta?.chainId || "",
        contractAddress: item.tokenMeta?.contractAddress || "",
        tokenId: item.tokenMeta?.tokenId || "",
        percentChange24h: item.tokenMeta?.percentChange24h,
        volume24h: item.tokenMeta?.volume24h,
        marketCap: item.tokenMeta?.marketCap,
        klineUrl:
          item.tokenMeta?.klineUrl ||
          buildBinanceKlineUrl({
            chainName: item.tokenMeta?.chainName,
            chainId: item.tokenMeta?.chainId,
            contractAddress: item.tokenMeta?.contractAddress,
            alphaId: item.tokenMeta?.alphaId,
            tradeSymbol: item.tokenMeta?.tradeSymbol || item.overview.symbol || item.symbol,
            symbol: item.tokenMeta?.symbol || item.overview.symbol || item.symbol,
          }),
      }))
      .sort((a, b) => b.signal.score - a.signal.score);

    const failures = scanned.filter((item) => !item.ok).map((item) => ({
      symbol: item.symbol,
      error: item.error,
    }));

    const rankings = buildRankings(results, 10);

    return {
      interval,
      requestedLimit,
      effectiveLimit,
      maxScanLimit: MAX_SCAN_SYMBOLS,
      tokenCount,
      selectionMode,
      scannedCount: symbols.length,
      successCount: results.length,
      failureCount: failures.length,
      failures,
      results,
      rankings,
      updatedAt: new Date().toISOString(),
    };
  }
}
