import test from "node:test";
import assert from "node:assert/strict";

import {
  calculatePriceMovePct,
  calculateVolumeSpikePct,
  buildAnomalySignal,
} from "../src/lib/metrics.js";

test("calculatePriceMovePct computes directional pct change", () => {
  assert.equal(calculatePriceMovePct(100, 107), 7);
  assert.equal(calculatePriceMovePct(100, 92), -8);
});

test("calculateVolumeSpikePct compares current volume against baseline average", () => {
  const baseline = [100, 120, 80, 100, 100];
  assert.equal(calculateVolumeSpikePct(180, baseline), 80);
});

test("buildAnomalySignal returns high level for sharp move + strong volume", () => {
  const signal = buildAnomalySignal({
    priceChangePct: 6.4,
    volumeSpikePct: 140,
    tradeCount: 260,
  });

  assert.equal(signal.level, "high");
  assert.ok(signal.score >= 75);
  assert.deepEqual(signal.reasons.sort(), ["price-shift", "trade-burst", "volume-spike"]);
});

test("buildAnomalySignal returns low level for normal market action", () => {
  const signal = buildAnomalySignal({
    priceChangePct: 0.9,
    volumeSpikePct: 8,
    tradeCount: 30,
  });

  assert.equal(signal.level, "low");
  assert.ok(signal.score < 45);
  assert.deepEqual(signal.reasons, []);
});