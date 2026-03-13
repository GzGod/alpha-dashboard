import test from "node:test";
import assert from "node:assert/strict";

import { buildRankings } from "../src/services/binanceAlphaService.js";

function row({
  symbol,
  tokenName,
  priceChangePct,
  score,
  quoteVolume,
}) {
  return {
    symbol,
    tokenName,
    market: {
      priceChangePct,
      volumeSpikePct: 0,
      tradeCount: 0,
    },
    signal: {
      score,
      level: "low",
      reasons: [],
    },
    ticker: {
      quoteVolume,
      volume: quoteVolume,
    },
  };
}

test("buildRankings sorts gainers, losers, anomaly and volume boards", () => {
  const results = [
    row({ symbol: "A", tokenName: "Alpha", priceChangePct: 12, score: 45, quoteVolume: 200 }),
    row({ symbol: "B", tokenName: "Beta", priceChangePct: -18, score: 60, quoteVolume: 500 }),
    row({ symbol: "C", tokenName: "Gamma", priceChangePct: 4, score: 90, quoteVolume: 150 }),
    row({ symbol: "D", tokenName: "Delta", priceChangePct: -3, score: 30, quoteVolume: 900 }),
  ];

  const rankings = buildRankings(results, 3);

  assert.deepEqual(
    rankings.gainers.map((item) => item.symbol),
    ["A", "C", "D"],
  );
  assert.deepEqual(
    rankings.losers.map((item) => item.symbol),
    ["B", "D", "C"],
  );
  assert.deepEqual(
    rankings.anomaly.map((item) => item.symbol),
    ["C", "B", "A"],
  );
  assert.deepEqual(
    rankings.volume.map((item) => item.symbol),
    ["D", "B", "A"],
  );
});
