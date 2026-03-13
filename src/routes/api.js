import express from "express";

function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return fallback;
  }

  return n;
}

export function createApiRouter(alphaService) {
  const router = express.Router();

  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "railway-alpha-dashboard",
      timestamp: new Date().toISOString(),
    });
  });

  router.get("/tokens", async (req, res) => {
    try {
      const limit = parsePositiveInt(req.query.limit, 5000);
      const tokens = await alphaService.fetchTokenList();
      res.json({
        count: Math.min(tokens.length, limit),
        tokens: tokens.slice(0, limit),
      });
    } catch (error) {
      res.status(502).json({
        error: "Failed to fetch token list",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get("/overview", async (req, res) => {
    const symbol = String(req.query.symbol || "").trim();
    const interval = String(req.query.interval || "1h").trim();

    if (!symbol) {
      res.status(400).json({
        error: "Query param `symbol` is required",
      });
      return;
    }

    try {
      const overview = await alphaService.fetchOverview(symbol, interval);
      res.json(overview);
    } catch (error) {
      res.status(502).json({
        error: "Failed to fetch overview",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.get("/scan", async (req, res) => {
    const interval = String(req.query.interval || "1h").trim();
    const limit = parsePositiveInt(req.query.limit, alphaService.scanSymbolLimit || 100);

    try {
      const result = await alphaService.scanSymbols({ interval, limit });
      res.json(result);
    } catch (error) {
      res.status(502).json({
        error: "Failed to scan symbols",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return router;
}
