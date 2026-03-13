import test from "node:test";
import assert from "node:assert/strict";

import { calculateVolumeSpikePct } from "../src/lib/metrics.js";
import { deriveVolumeSnapshot } from "../src/services/binanceAlphaService.js";

test("deriveVolumeSnapshot ignores unfinished candle and smooths current window", () => {
  const klines = [
    { openTime: 0, closeTime: 1000, volume: 100 },
    { openTime: 1000, closeTime: 2000, volume: 120 },
    { openTime: 2000, closeTime: 3000, volume: 110 },
    { openTime: 3000, closeTime: 4000, volume: 130 },
    { openTime: 4000, closeTime: 5200, volume: 0 }, // unfinished at nowMs=4500
  ];

  const snapshot = deriveVolumeSnapshot(klines, {
    nowMs: 4500,
    currentWindow: 3,
    baselineWindow: 5,
  });

  assert.equal(snapshot.currentVolume, 120);
  assert.equal(snapshot.baselineVolumeAvg, 100);
  assert.deepEqual(snapshot.baselineVolumes, [100]);

  const spikePct = calculateVolumeSpikePct(snapshot.currentVolume, snapshot.baselineVolumes);
  assert.equal(spikePct, 20);
});

test("deriveVolumeSnapshot falls back to latest candles when all are closed", () => {
  const klines = [
    { openTime: 0, closeTime: 1000, volume: 80 },
    { openTime: 1000, closeTime: 2000, volume: 100 },
    { openTime: 2000, closeTime: 3000, volume: 120 },
    { openTime: 3000, closeTime: 4000, volume: 160 },
  ];

  const snapshot = deriveVolumeSnapshot(klines, {
    nowMs: 9999,
    currentWindow: 2,
    baselineWindow: 2,
  });

  assert.equal(snapshot.currentVolume, 140);
  assert.equal(snapshot.baselineVolumeAvg, 90);
  assert.deepEqual(snapshot.baselineVolumes, [80, 100]);
});
