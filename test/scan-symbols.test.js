import test from "node:test";
import assert from "node:assert/strict";

import { BinanceAlphaService } from "../src/services/binanceAlphaService.js";

function createService() {
  const service = new BinanceAlphaService({
    baseUrl: "https://www.binance.com",
    demoMode: false,
  });

  service.fetchOverview = async (symbol, interval) => ({
    symbol,
    interval,
    signal: { score: 1, level: "low", reasons: [] },
    market: { priceChangePct: 0, volumeSpikePct: 0, tradeCount: 0 },
  });

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

test("scanSymbols should prioritize USDT symbols when available", async () => {
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
    ["BETA_402USDT", "GAMMA_008USDT"],
  );
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
  service.fetchOverview = async (symbol, interval) => {
    scannedSymbols.push(symbol);
    return {
      symbol,
      interval,
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
    },
  ];

  const result = await service.scanSymbols({ interval: "1m", limit: 20 });
  const first = result.results[0];

  assert.equal(first.symbol, "ALPHA_798USDT");
  assert.equal(first.displaySymbol, "SN3");
  assert.equal(first.tokenName, "Nebula3");
  assert.equal(first.alphaId, "ALPHA_798");
});
