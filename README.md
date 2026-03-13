# Railway Alpha Dashboard MVP

Binance Alpha dashboard MVP with:

- multi-window rankings (`15m`, `1h`, `4h`, `24h`)
- full token library table (all tokens from Alpha token list)
- anomaly score, gainers, losers, and volume boards
- token click-through to Binance official K-line page
- Railway-ready deployment setup

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

If Binance access is restricted in your network:

```powershell
$env:DEMO_MODE='true'; npm run dev
```

## Environment variables

Copy `.env.example` to `.env` and adjust:

- `HOST` default `0.0.0.0`
- `PORT` default `3000` (Railway injects this automatically)
- `ALPHA_BASE_URL` default `https://www.binance.com`
- `ALPHA_TIMEOUT_MS` default `12000`
- `SCAN_SYMBOL_LIMIT` default `100`
- `VOLUME_CURRENT_WINDOW` default `3`
- `VOLUME_BASELINE_WINDOW` default `20`
- `DEMO_MODE` `true/false`

## Railway deploy

1. Push this folder to GitHub.
2. Create a Railway project from the repo.
3. Railway uses `railway.json` and starts with `npm start`.
4. Set variables in Railway:
   - `DEMO_MODE=false`
   - optionally tune timeout/window variables

## API examples

```bash
curl "http://localhost:3000/api/scan?interval=1h&limit=100"
curl "http://localhost:3000/api/overview?symbol=ALPHA_798USDT&interval=4h"
curl "http://localhost:3000/api/tokens?limit=5000"
```

Notes:
- token library is full list from `/api/tokens`, independent from scan size
- single scan request is capped to `300` symbols for responsiveness

## Tests

```bash
npm test
```
