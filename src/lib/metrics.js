function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function calculatePriceMovePct(openPrice, lastPrice) {
  const open = toNumber(openPrice);
  const last = toNumber(lastPrice);

  if (open === 0) {
    return 0;
  }

  return Number((((last - open) / open) * 100).toFixed(2));
}

export function calculateVolumeSpikePct(currentVolume, baselineVolumes = []) {
  const current = toNumber(currentVolume);
  const cleanBaseline = baselineVolumes
    .map((v) => toNumber(v, NaN))
    .filter((v) => Number.isFinite(v) && v >= 0);

  if (cleanBaseline.length === 0) {
    return 0;
  }

  const avg = cleanBaseline.reduce((sum, item) => sum + item, 0) / cleanBaseline.length;

  if (avg <= 0) {
    return 0;
  }

  return Number((((current - avg) / avg) * 100).toFixed(2));
}

export function buildAnomalySignal({
  priceChangePct = 0,
  volumeSpikePct = 0,
  tradeCount = 0,
}) {
  const price = Math.abs(toNumber(priceChangePct));
  const volume = Math.max(0, toNumber(volumeSpikePct));
  const trades = Math.max(0, toNumber(tradeCount));

  const priceScore = Math.min(price / 8, 1) * 60;
  const volumeScore = Math.min(volume / 200, 1) * 35;
  const tradeScore = trades > 200 ? 5 : 0;
  const score = Math.round(priceScore + volumeScore + tradeScore);

  let level = "low";
  if (score >= 75) {
    level = "high";
  } else if (score >= 45) {
    level = "medium";
  }

  const reasons = [];
  if (price >= 3) {
    reasons.push("price-shift");
  }
  if (volume >= 50) {
    reasons.push("volume-spike");
  }
  if (trades > 200) {
    reasons.push("trade-burst");
  }

  return {
    score,
    level,
    reasons,
  };
}
