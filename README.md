# Grid Shop（极简版）

仅保留 **final/**：100×100 格子展示与购买（Coinbase Commerce / x402 / 手动确认）。其余代码不提交。

## 本地运行

```bash
npm run dev
```
或 `cd final && npm install && npm run dev`，打开 http://localhost:3005

## 上传 GitHub

仓库内只有根目录的 `package.json`、`README.md`、`.gitignore` 和 **final/** 目录。无 backup、无旧版代码。

## 部署 Vercel（只显示极简版）

1. 在 Vercel 项目 **Settings → General → Root Directory** 设为 **`final`**，保存。
2. 环境变量在 Vercel 里配置（与本地一致）：`DATABASE_URL`、`TREASURY_ADDRESS`、`PURCHASE_PRICE_USD`、可选 `COMMERCE_API_KEY`。数据库连接串不变，沿用你原来的 Neon 等配置即可。
3. 重新部署。之后 Vercel 只构建并展示 final 下的极简版。
