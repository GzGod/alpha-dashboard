# Railway Alpha Dashboard MVP

Binance Alpha 交易量异动看板 MVP。  
包含：

- `GET /api/scan` 扫描并排序异动标的
- `GET /api/overview` 单币详情（价格偏移、量能异动、成交笔数、评分）
- 前端可视化看板（静态页面 + 自动轮询）
- Railway 一键部署配置

## 1. 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

如果你的网络访问 Binance 受限，可先用演示模式：

```bash
# PowerShell
$env:DEMO_MODE='true'; npm run dev
```

## 2. 环境变量

复制 `.env.example` 到 `.env` 并按需修改：

- `HOST`：默认 `0.0.0.0`
- `PORT`：默认 `3000`（Railway 会自动注入）
- `ALPHA_BASE_URL`：默认 `https://www.binance.com`
- `ALPHA_TIMEOUT_MS`：默认 `12000`
- `SCAN_SYMBOL_LIMIT`：默认 `20`
- `DEMO_MODE`：`true/false`

## 3. Railway 部署

1. 把该目录推到 GitHub 仓库。
2. 在 Railway 新建 Project，选择该仓库。
3. Railway 会自动识别 `railway.json`，使用 `npm start` 启动。
4. 在 Railway Variables 配置：
   - `DEMO_MODE=false`
   - 如有需要再补 `ALPHA_TIMEOUT_MS=15000` 等。
5. 部署完成后打开生成的 Public Domain 即可访问。

## 4. API 示例

```bash
curl "http://localhost:3000/api/scan?interval=1m&limit=20"
curl "http://localhost:3000/api/overview?symbol=ALPHA_175USDT&interval=1m"
curl "http://localhost:3000/api/tokens?limit=30"
```

## 5. 测试

```bash
npm test
```
