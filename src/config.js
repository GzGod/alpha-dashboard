function parseIntEnv(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolEnv(value, fallback = false) {
  if (value == null) {
    return fallback;
  }

  return String(value).trim().toLowerCase() === "true";
}

export const config = {
  host: process.env.HOST || "0.0.0.0",
  port: parseIntEnv(process.env.PORT, 3000),
  alphaBaseUrl: process.env.ALPHA_BASE_URL || "https://www.binance.com",
  alphaTimeoutMs: parseIntEnv(process.env.ALPHA_TIMEOUT_MS, 12000),
  scanSymbolLimit: parseIntEnv(process.env.SCAN_SYMBOL_LIMIT, 20),
  demoMode: parseBoolEnv(process.env.DEMO_MODE, false),
};
