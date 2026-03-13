import test from "node:test";
import assert from "node:assert/strict";

import { BinanceAlphaService } from "../src/services/binanceAlphaService.js";

function createService() {
  const service = new BinanceAlphaService({
    baseUrl: "https://www.binance.com",
    demoMode: false,
  });

  const snapshotStub = async (symbol, interval) => ({
    symbol,
    interval,
    ticker: { quoteVolume: 100, volume: 100 },
    signal: { score: 1, level: "low", reasons: [] },
    market: { priceChangePct: 0, volumeSpikePct: 0, tradeCount: 0 },
  });
  service.fetchOverview = snapshotStub;
  service.fetchScanSnapshot = snapshotStub;

  return service;
}

test("scanSymbols should still scan when token symbols do not contain USDT", async () => {
  const service = createService();
  service.fetchTokenList = async () => [{ symbol: "ALPHA_175" }, { symbol: "BETA_402" }];

  const result = await service.scanSymbols({ interval: "1m", limit: 20 });

  assert.equal(result.scannedCount, 2);
  assert.equal(result.successCount, 2);
  assert.equal(result.failureCount, 0);
});

test("scanSymbols should keep original token order when applying limit", async () => {
  const service = createService();
  service.fetchTokenList = async () => [
    { symbol: "ALPHA_175" },
    { symbol: "BETA_402USDT" },
    { symbol: "GAMMA_008USDT" },
  ];

  const result = await service.scanSymbols({ interval: "1m", limit: 2 });

  assert.equal(result.scannedCount, 2);
  assert.deepEqual(
    result.results.map((item) => item.symbol).sort(),
    ["ALPHA_175", "BETA_402USDT"],
  );
});

test("scanSymbols should skip offline/hidden tokens from rankings", async () => {
  const service = createService();
  service.fetchTokenList = async () => [
    { symbol: "ACTIVE_1USDT", name: "ActiveOne" },
    { symbol: "OFFLINE_1USDT", name: "OfflineOne", offline: true },
    { symbol: "HIDDEN_1USDT", name: "HiddenOne", cexOffDisplay: true },
  ];

  const result = await service.scanSymbols({ interval: "1h", limit: 100 });

  assert.equal(result.scannedCount, 1);
  assert.equal(result.successCount, 1);
  assert.deepEqual(result.results.map((item) => item.symbol), ["ACTIVE_1USDT"]);
});

test("scanSymbols should use alphaId + USDT as trading symbol when provided", async () => {
  const service = new BinanceAlphaService({
    baseUrl: "https://www.binance.com",
    demoMode: false,
  });

  const scannedSymbols = [];
  service.fetchTokenList = async () => [
    {
      symbol: "SN3",
      alphaId: "ALPHA_798",
    },
  ];
  service.fetchScanSnapshot = async (symbol, interval) => {
    scannedSymbols.push(symbol);
    return {
      symbol,
      interval,
      ticker: { quoteVolume: 100, volume: 100 },
      signal: { score: 1, level: "low", reasons: [] },
      market: { priceChangePct: 0, volumeSpikePct: 0, tradeCount: 0 },
    };
  };

  const result = await service.scanSymbols({ interval: "1m", limit: 20 });

  assert.equal(result.scannedCount, 1);
  assert.deepEqual(scannedSymbols, ["ALPHA_798USDT"]);
});

test("scanSymbols should include token display metadata in results", async () => {
  const service = createService();
  service.fetchTokenList = async () => [
    {
      symbol: "SN3",
      name: "Nebula3",
      alphaId: "ALPHA_798",
      chainName: "BSC",
      contractAddress: "0xf758cfb1467a227516d73d87da7d36e7cb6f71f1",
    },
  ];

  const result = await service.scanSymbols({ interval: "1m", limit: 20 });
  const first = result.results[0];

  assert.equal(first.symbol, "ALPHA_798USDT");
  assert.equal(first.displaySymbol, "SN3");
  assert.equal(first.tokenName, "Nebula3");
  assert.equal(first.alphaId, "ALPHA_798");
  assert.equal(first.chainName, "BSC");
  assert.equal(first.contractAddress, "0xf758cfb1467a227516d73d87da7d36e7cb6f71f1");
  assert.equal(
    first.klineUrl,
    "https://www.binance.com/zh-CN/alpha/bsc/0xf758cfb1467a227516d73d87da7d36e7cb6f71f1?_from=markets",
  );
});

test("scanSymbols should cap single request size at configured maximum", async () => {
  const service = new BinanceAlphaService({
    baseUrl: "https://www.binance.com",
    demoMode: false,
  });

  const symbols = new Array(600).fill(0).map((_, i) => ({
    symbol: `ALPHA_${1000 + i}USDT`,
  }));
  service.fetchTokenList = async () => symbols;
  service.fetchScanSnapshot = async (symbol, interval) => ({
    symbol,
    interval,
    ticker: { quoteVolume: 100, volume: 100 },
    signal: { score: 1, level: "low", reasons: [] },
    market: { priceChangePct: 0, volumeSpikePct: 0, tradeCount: 0 },
  });

  const result = await service.scanSymbols({ interval: "1h", limit: 9999 });

  assert.equal(result.requestedLimit, 9999);
  assert.equal(result.effectiveLimit, 5000);
  assert.equal(result.scannedCount, 600);
});

test("fetchScanSnapshot should use ticker 24h priceChangePct for 24h interval", async () => {
  const service = new BinanceAlphaService({
    baseUrl: "https://www.binance.com",
    demoMode: false,
  });

  service.fetchTicker = async () => ({
    symbol: "TESTUSDT",
    lastPrice: 1,
    openPrice: 2,
    volume: 1000,
    quoteVolume: 2000,
    tradeCount24h: 100,
    priceChangePct: -50,
  });
  service.fetchKlines = async () =>
    new Array(24).fill(0).map((_, i) => ({
      openTime: i * 3600000,
      closeTime: (i + 1) * 3600000 - 1,
      open: 1,
      close: 1.2,
      high: 1.2,
      low: 1,
      volume: 100,
      tradeCount: 10,
    }));

  const snapshot = await service.fetchScanSnapshot("TESTUSDT", "24h");

  assert.equal(snapshot.interval, "24h");
  assert.equal(snapshot.market.priceChangePct, -50);
});
