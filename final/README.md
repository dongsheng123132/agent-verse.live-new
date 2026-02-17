# Grid Shop · 100×100 格子售卖（极简版）

仅保留：100×100 格子展示、购买（Coinbase Commerce / x402 / 手动确认）、数据库与 env。

## 运行

```bash
cd final
cp .env.example .env
# 编辑 .env：DATABASE_URL、TREASURY_ADDRESS、PURCHASE_PRICE_USD，可选 COMMERCE_API_KEY
npm install
npm run dev
```

打开 http://localhost:3005

## 数据库

在 Neon 等 PostgreSQL 执行 `scripts/init-db.sql` 创建 `grid_cells`、`grid_orders`。

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| DATABASE_URL | 是 | PostgreSQL 连接串 |
| TREASURY_ADDRESS | 是 | Base 收款地址 |
| PURCHASE_PRICE_USD | 否 | 单价 USDC，默认 0.02 |
| COMMERCE_API_KEY | 否 | Coinbase Commerce API Key，不填则仅 x402/手动 |
| NEXT_PUBLIC_BASE_API | 否 | 前端回调基地址 |

## 后续修改

只改 `final/` 内文件，保持极简。
