import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";

import { config } from "./config.js";
import { createApiRouter } from "./routes/api.js";
import { BinanceAlphaService } from "./services/binanceAlphaService.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

const alphaService = new BinanceAlphaService({
  baseUrl: config.alphaBaseUrl,
  timeoutMs: config.alphaTimeoutMs,
  scanSymbolLimit: config.scanSymbolLimit,
  demoMode: config.demoMode,
});

app.use(express.json());
app.use("/api", createApiRouter(alphaService));
app.use(express.static(publicDir));

app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const server = app.listen(config.port, config.host, () => {
  const mode = config.demoMode ? "DEMO" : "LIVE";
  console.log(`[alpha-dashboard] listening on http://${config.host}:${config.port} (${mode})`);
});

export default server;
