# AgentVerse Grid · 100×100 格子广告地图

> 产品边界以仓库根目录的 [`PRODUCT.md`](../PRODUCT.md) 为准（2026-10-03 精简）。一句话：人**看**地图，AI 用 x402 **买**格子并装修，格子主人挂的 x402 服务进一张**给 AI 读**的索引。

---

## 一、只做三件事

| | 做什么 | 在哪 |
|---|---|---|
| 看 | 人在地图上看广告 | 地图（`app/page.tsx`、`components/WorldMap.tsx`）、格子详情（`components/AgentRoom.tsx`）、比武台 / 赞助商展示区（`lib/showcase/`）、搜索（`/api/search`） |
| 买 | AI 替人买格子、装修 | `POST /api/cells/purchase`（单格）、`POST /api/cells/bulk-purchase`（整块）、`PUT /api/cells/update`（装修）、`POST /api/cells/regen-key`（重置 key）。x402，Monad + Base，同一个收款地址；人只在购买弹窗里复制一段提示词 |
| 读 | AI 读说明、找服务 | `public/skill.md`、`public/llms.txt`、`GET /api/services`、`/llms-services.txt`、`/market`（只看「能不能付」） |

已经删掉的功能（Coinbase Commerce、浏览器钱包直付、二手转售、推荐返佣、排行榜 / 动态流、链上证据、`/docs` 页、service worker）见 `PRODUCT.md`；旧代码在 git tag `archive/pre-simplify-2026-10-03`。数据库表一律不删，只是不再读写。

### 价格与收款

0.10 USDC / 格，Monad（`eip155:143`，优先）或 Base（`eip155:8453`），收款地址只有一个（`lib/x402-flow.ts` 的 `PAY_TO_ADDRESS`）。一条链的结算服务（facilitator）挂了，另一条链照常卖：402 只列还活着的那条，挂掉的那条在后台按 2s / 4s / 8s … 最长 60s 的间隔重试；两条都挂才返回 503 `x402_unavailable`。

---

## 二、系统设计说明

### 2.1 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 14 (App Router)，TypeScript + JavaScript |
| 样式 | Tailwind（CDN） |
| 数据库 | PostgreSQL（如 Neon），驱动 pg；本地用 PGlite |
| 支付 | x402（`@x402/core` / `@x402/evm`），Monad facilitator 由 molandak.org 提供，Base 用 CDP facilitator |
| 部署 | Vercel，Root Directory 设为 `final` |

### 2.2 目录与接口

```
final/
├── app/
│   ├── page.tsx                  # 唯一页面：100×100 地图 + 购买弹窗 + 格子详情
│   ├── market/page.tsx           # /market：x402 服务索引（人看的版本）
│   ├── llms-services.txt/route.ts# 同一份索引的纯文本版
│   ├── .well-known/x402/route.ts # 本站自己的付费接口清单
│   └── api/
│       ├── grid/                 # GET 已售格子列表
│       ├── cells/                # GET 单格；purchase / bulk-purchase / regen-key（x402）；update（Bearer key）
│       ├── search/               # GET 全文搜索
│       ├── services/             # GET 服务索引（JSON）
│       └── admin/stats/          # GET 销售统计（ADMIN_KEY）
├── components/                   # WorldMap、AgentRoom、PurchaseModal、DecorateForm、BotConnect ...
├── lib/
│   ├── x402-flow.ts              # 双链 x402；一条链的 facilitator 挂了另一条照常
│   ├── ai-purchase-prompt.ts     # 「复制给我的 AI」提示词（纯函数，和 skill.md 一致由测试保证）
│   ├── cell-block.ts             # 多格 = 一整块的判定
│   ├── networks.ts / usdc-amount.ts / cell-key-store.ts
│   ├── market/                   # 服务索引：probe（只读 402 探测）、ssrf、x402 解析、seed.json
│   └── showcase/                 # 比武台 / 赞助商展示区（虚拟格子）
├── public/                       # skill.md、llms.txt、robots.txt、sw.js（自毁用）、manifest.json
├── scripts/                      # init-db.sql、local-db.mjs、dev-local.mjs、e2e-ai-purchase.mjs、taste-x402.mjs ...
└── test/                         # vitest
```

### 2.3 数据库

- **grid_cells**：格子主表。`(x, y)` 唯一；`owner_address` 非空表示已售；`block_*` 表示一整块；`service_*` / `probe_*` 是格子主人挂的 x402 服务和它的探测结果。
- **grid_orders**：订单记录（`pay_method` 为 `x402` / `x402-bulk`，`status` 为 `paid`，含 `tx_hash`、`network`、`payer_address`）。
- **cell_api_keys**（SHA-256 存 key）、**cell_reservations**（支付验证后到结算前占住格子）、**market_services**（官方收录服务的探测缓存）。
- 以下表 / 列保留但**不再读写**：`referrals`、`referral_rewards`、`grid_events`、`grid_orders.ref_code` / `commerce_charge_id`、`grid_cells.is_for_sale` / `price_usdc` / `evidence` / `evidence_by_network`。
- `grid_cells.probe_status` 有 CHECK 约束（`verified | candidate | failed | unprobed`），表不改，所以列里仍存这四个旧词；API 对外只说 `can_pay | failed | unchecked`，翻译只在 `lib/market/types.ts`（`fromStoredStatus` / `toStoredStatus`）。

详见 `scripts/init-db.sql`。

### 2.4 服务索引的状态（只看「能不能付」）

- `can_pay`：这个网址刚被只读 GET 探测过，返回了合法的 x402 v2 402，在 `networks` 列出的网络上收 USDC（没有付款）。
- `failed`：没有拿到这样的 402（连不上、不是 402、x402 v1、没有 Monad/Base USDC、SSRF 检查没过）。
- `unchecked`：POST 接口需要 body，我们不探测；或还没探测过。

不查链上付款记录，不抓 Bazaar；官方收录只有 `lib/market/seed.json`，加上格子主人自己填的 `service_url`。

---

## 三、运行与部署

### 3.1 本地运行

```bash
cd final
cp .env.example .env     # 编辑 DATABASE_URL 等
npm install
npm run dev              # http://localhost:3005
```

### 3.2 数据库

在 Neon 等 PostgreSQL 中执行 `scripts/init-db.sql`。

### 3.3 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| DATABASE_URL | 是 | PostgreSQL 连接串 |
| ADMIN_KEY | 否 | `GET /api/admin/stats` 的口令 |
| PAY_TO_ADDRESS | 否 | 收款地址，默认见 `lib/x402-flow.ts` |
| MONAD_FACILITATOR_URL | 否 | Monad facilitator，默认 `https://x402-facilitator.molandak.org` |
| CDP_API_KEY_ID / CDP_API_KEY_SECRET | 否 | Base 主网 CDP facilitator 的鉴权；不填走 `@coinbase/x402` 默认 |
| X402_NETWORK_MODE | 否 | `testnet` = Monad 测试网 + Base Sepolia；默认主网 |

### 3.4 Vercel

**Settings → General → Root Directory** 设为 **`final`**，环境变量同上。预览环境和生产**共用数据库**：不要在预览上做真实购买。

---

## 四、本地端到端（不碰生产库）

```bash
npm run db:local -- --no-sync                      # 本地 PGlite（端口 5433），不从线上同步
X402_NETWORK_MODE=testnet X402_FACILITATOR_MOCK=1 npm run dev:local
node scripts/e2e-ai-purchase.mjs                   # Playwright，截图存系统临时目录
```

`X402_FACILITATOR_MOCK=1` 只在 `NODE_ENV !== 'production'` 且测试网模式下生效（本地签名校验、不上链）；生产构建里整段代码被剔除，`npm run build && node scripts/check-no-mock-in-build.mjs` 可验证。

- **AI 原生购买**：弹窗显示所选格子、格数、总价（0.1 USDC/格）、收款地址和支持网络；「想要的样子」可选填 title / summary / fill_color / iframe_url（https）/ service_url（https，x402 服务），只有填了的字段才进提示词里的 `PUT /api/cells/update` JSON；「复制给我的 AI」生成提示词（`lib/ai-purchase-prompt.ts`，单测 `test/ai-purchase-prompt.test.ts`）；同一份模板也在 `public/skill.md`（有测试保证与弹窗输出一致）。「我让 AI 买完了」刷新地图；买到了就关闭弹窗并打开该格详情，人可以在那里点「我有 key」手动装修。
- **多格 = 一整块**：所选格子恰好是一个完整的 w×h 矩形时，服务端写成一整块（`block_id` `blk_<x>_<y>_<w>x<h>`，origin = 左上角），key 存在左上角那一格，一把 key 一次 `PUT /api/cells/update` 装修整块；响应带 `key_cell` 和 `block`。拼不成矩形则每格各自 1×1，key 只对应第一格。
- **地图手势**：`WorldMap` 按每次手势的 `PointerEvent.pointerType` 决定——手指 = 平移，鼠标 / 触控笔 = 框选。
- **体验「传统 x402」**：`npm run taste`（真实 Monad 测试网，要一点测试网 USDC）或 `npm run taste -- --mock`（假 facilitator，不上链）。一条命令讲完：挑空格 → 把 402 解码成账单 → 签 EIP-3009 授权 → 重试 → 交易哈希 → 用 gk_ key 装修。钱包在 `%USERPROFILE%\.agentverse-taste\wallet.json`（仓库之外）；只给 `eip155:10143` / `eip155:84532` 签名、不超过 1 USDC。

---

## 五、后续修改

只改 `final/` 内文件。加新功能前先答 `PRODUCT.md` 里的三个问题。
