# Grid Shop MVP — 技术文档

## 一、技术栈

| 层 | 技术 |
|----|------|
| 框架 | Next.js 14.2 (App Router) |
| 语言 | TypeScript + JavaScript 混用 |
| 样式 | Tailwind CSS (CDN via Script) |
| 数据库 | PostgreSQL (Neon) |
| 支付 | Coinbase Commerce API + x402 协议 |
| 部署 | Vercel |

---

## 二、项目结构

```
final/
├── app/
│   ├── api/
│   │   ├── cells/
│   │   │   ├── route.js            # GET 格子详情
│   │   │   ├── purchase/route.ts   # POST x402 付款购买
│   │   │   ├── update/route.js     # PUT API Key 鉴权更新内容
│   │   │   └── regen-key/route.js  # POST 重新生成 API Key
│   │   ├── commerce/
│   │   │   ├── create/route.js     # POST 创建 Coinbase 支付
│   │   │   └── verify/route.js     # GET  验证支付状态
│   │   ├── events/route.js         # GET 事件通知列表
│   │   ├── grid/route.js           # GET 所有已售格子
│   │   ├── rankings/route.js       # GET 排名数据
│   │   └── search/route.js         # GET 全文搜索
│   ├── layout.js                   # 根布局
│   └── page.tsx                    # 主页面（客户端组件）
├── lib/
│   ├── db.js                       # PostgreSQL 连接池
│   ├── api-key.js                  # API Key 生成/验证
│   ├── events.js                   # 事件日志
│   └── pricing.js                  # 定价常量
├── scripts/
│   └── init-db.sql                 # 数据库初始化 + 迁移
├── .env                            # 环境变量
├── next.config.js
├── package.json
└── tsconfig.json
```

---

## 三、数据库 Schema

### 3.1 grid_cells — 格子主表

```sql
CREATE TABLE grid_cells (
  id              BIGINT PRIMARY KEY,      -- y * 1000 + x
  x               INTEGER NOT NULL,
  y               INTEGER NOT NULL,
  owner_address   TEXT,                     -- 钱包地址
  status          TEXT DEFAULT 'EMPTY',     -- 'EMPTY' | 'HOLDING'
  is_for_sale     BOOLEAN DEFAULT FALSE,
  price_usdc      NUMERIC(18, 6),
  fill_color      TEXT,                     -- 十六进制颜色 '#ff6600'
  title           TEXT,
  summary         TEXT,
  image_url       TEXT,                     -- 展示图片
  content_url     TEXT,                     -- 链接
  markdown        TEXT,                     -- 自定义内容
  block_id        TEXT,                     -- 方形块 ID: 'blk_5_10_2x2'
  block_w         INTEGER DEFAULT 1,        -- 块宽
  block_h         INTEGER DEFAULT 1,        -- 块高
  block_origin_x  INTEGER,                  -- 块左上角 x
  block_origin_y  INTEGER,                  -- 块左上角 y
  last_updated    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (x, y)
);
```

**Cell ID 计算**：`id = y * 1000 + x`，保证 1000×1000 网格内唯一。

**Block ID 格式**：`blk_{originX}_{originY}_{w}x{h}`，如 `blk_5_10_2x2`。

### 3.2 grid_orders — 订单表

```sql
CREATE TABLE grid_orders (
  receipt_id          TEXT PRIMARY KEY,   -- 订单号
  x, y                INTEGER,
  amount_usdc         NUMERIC(18, 6),
  unique_amount       NUMERIC(18, 6),
  pay_method          TEXT,              -- 'commerce' | 'x402'
  status              TEXT DEFAULT 'pending',  -- 'pending' | 'paid'
  treasury_address    TEXT,
  commerce_charge_id  TEXT,
  tx_hash             TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.3 cell_api_keys — API Key 表

```sql
CREATE TABLE cell_api_keys (
  id         SERIAL PRIMARY KEY,
  key_hash   TEXT NOT NULL,         -- SHA-256(明文 Key)
  x          INTEGER NOT NULL,      -- 块左上角 x
  y          INTEGER NOT NULL,      -- 块左上角 y
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (x, y)
);
```

- 只存哈希，明文不入库
- 每个坐标只保留一个 key（UPSERT 覆盖）
- 方形块只在 origin 坐标存一条

### 3.4 grid_events — 事件表

```sql
CREATE TABLE grid_events (
  id         SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,    -- 'purchase' | 'update' | 'system'
  x, y       INTEGER,
  block_size TEXT,             -- '1×1', '2×2' 等
  owner      TEXT,
  message    TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3.5 索引

```sql
idx_grid_cells_owner   — owner_address (部分索引, WHERE NOT NULL)
idx_grid_orders_status — status
idx_cell_api_keys_hash — key_hash (Key 查找)
idx_grid_events_created — created_at DESC (时间线查询)
idx_grid_cells_fts     — GIN(to_tsvector('simple', markdown)) 全文搜索
```

---

## 四、API 接口文档

### 4.1 GET /api/grid

返回所有已售格子列表，用于前端渲染网格。

**响应**：
```json
[
  {
    "id": 510,
    "x": 10, "y": 5,
    "owner": "0x1234...5678",
    "color": "#ff6600",
    "title": "My Cell",
    "summary": "Hello",
    "image_url": "https://...",
    "block_id": "blk_10_5_2x2",
    "block_w": 2, "block_h": 2,
    "block_origin_x": 10, "block_origin_y": 5
  }
]
```

### 4.2 GET /api/cells?x={x}&y={y}

返回单个格子完整详情。

**响应**：
```json
{
  "ok": true,
  "cell": {
    "id": 510, "x": 10, "y": 5,
    "owner": "0x1234...",
    "color": "#ff6600",
    "title": "My Cell",
    "summary": "Hello",
    "image_url": "https://...",
    "content_url": "https://...",
    "markdown": "# Hello\nWorld",
    "block_id": "blk_10_5_1x1",
    "block_w": 1, "block_h": 1,
    "block_origin_x": 10, "block_origin_y": 5,
    "last_updated": "2026-02-17T10:30:00Z"
  }
}
```

### 4.3 POST /api/commerce/create

创建 Coinbase Commerce 支付。

**请求**：
```json
{
  "x": 10, "y": 5,
  "block_w": 2, "block_h": 2,
  "return_path": ""
}
```

**响应**：
```json
{
  "ok": true,
  "receiptId": "c_1708000000_abc123",
  "charge_id": "xxx",
  "hosted_url": "https://commerce.coinbase.com/charges/xxx",
  "price": 0.12,
  "block": { "w": 2, "h": 2, "label": "2×2" }
}
```

**错误码**：
- `invalid_block_size` (400) — 不支持的尺寸
- `out_of_bounds` (400) — 块超出网格范围
- `cells_taken` (409) — 目标区域有已售格子

### 4.4 GET /api/commerce/verify?receipt_id={id}

验证 Coinbase Commerce 支付状态。支付成功时自动写入格子 + 生成 API Key。

**响应**：
```json
{
  "ok": true,
  "paid": true,
  "status": "COMPLETED",
  "api_key": "gk_a1b2c3d4e5f6...",    // 仅首次支付成功时返回
  "charge": { ... }
}
```

### 4.5 POST /api/cells/purchase

x402 协议付款，仅支持 1×1。需要 x402 客户端。

**请求**：
```json
{ "x": 10, "y": 5 }
```

**响应**：
```json
{
  "ok": true,
  "cell": { "x": 10, "y": 5 },
  "owner": "0x...",
  "receipt_id": "x402_1708000000_abc",
  "api_key": "gk_a1b2c3..."
}
```

### 4.6 PUT /api/cells/update

API Key 鉴权，更新格子内容。方形块自动批量更新。

**请求头**：`Authorization: Bearer gk_xxx`

**请求体**（所有字段可选）：
```json
{
  "fill_color": "#ff6600",
  "title": "My Cell",
  "summary": "Hello world",
  "image_url": "https://example.com/img.png",
  "content_url": "https://example.com",
  "markdown": "# Hello\nThis is my cell."
}
```

**响应**：
```json
{ "ok": true, "updated": 4 }   // updated = 受影响行数
```

**错误码**：
- `unauthorized` (401) — 缺少或无效 API Key
- `no_fields` (400) — 没有可更新字段

### 4.7 POST /api/cells/regen-key

通过 receipt_id 验证身份，重新生成 API Key。

**请求**：
```json
{
  "x": 10, "y": 5,
  "receipt_id": "c_1708000000_abc123"
}
```

**响应**：
```json
{ "ok": true, "api_key": "gk_newkey..." }
```

### 4.8 GET /api/search?q={query}

全文搜索格子内容。

**响应**：
```json
{
  "ok": true,
  "count": 3,
  "results": [
    { "x": 10, "y": 5, "owner": "0x...", "title": "...", "summary": "..." }
  ]
}
```

### 4.9 GET /api/events?limit={n}

获取最近事件。

**响应**：
```json
{
  "ok": true,
  "events": [
    {
      "id": 1,
      "event_type": "purchase",
      "x": 10, "y": 5,
      "block_size": "2×2",
      "owner": "0x...",
      "message": "2×2 block purchased at (10,5)",
      "created_at": "2026-02-17T10:30:00Z"
    }
  ]
}
```

### 4.10 GET /api/rankings

获取排名数据。

**响应**：
```json
{
  "ok": true,
  "holders": [
    { "owner": "0x...", "cell_count": "16" }
  ],
  "recent": [
    { "owner": "0x...", "x": 10, "y": 5, "title": "...", "last_updated": "..." }
  ]
}
```

---

## 五、核心模块说明

### 5.1 lib/api-key.js

```
generateApiKey(x, y)
  → 生成 gk_<32hex 随机> 明文
  → SHA-256 哈希存入 cell_api_keys（UPSERT）
  → 返回明文（仅此一次）

verifyApiKey(token)
  → SHA-256(token) 查 cell_api_keys
  → 匹配返回 { x, y }，否则 null
```

### 5.2 lib/pricing.js

```
BLOCK_SIZES = [
  { w: 1, h: 1, label: '1×1', price: 0.02 },
  { w: 2, h: 1, label: '2×1', price: 0.05 },
  ...
]

getBlockPrice(w, h)  → number | null
getBlockLabel(w, h)  → string
```

### 5.3 lib/events.js

```
logEvent(type, { x, y, blockSize, owner, message })
  → INSERT INTO grid_events
  → 静默失败（不影响主流程）
```

### 5.4 方形块写入逻辑

购买 block_w × block_h 的块时：
1. 生成 `block_id = blk_{x}_{y}_{w}x{h}`
2. 循环 block 内每个格子 `(x+dx, y+dy)`：
   - 计算 `cell_id = (y+dy) * 1000 + (x+dx)`
   - UPSERT grid_cells，共享 block_id / block_w / block_h / block_origin_x / block_origin_y
3. 只在左上角 origin `(x, y)` 生成 API Key
4. 更新时通过 `WHERE block_id = $1` 批量更新

---

## 六、环境变量

```bash
DATABASE_URL=postgresql://user:pass@host/db     # 必须
TREASURY_ADDRESS=0x...                           # 收款地址
COMMERCE_API_KEY=xxx                             # Coinbase Commerce API Key
PURCHASE_PRICE_USD=2                             # x402 单格价格（美元）
X402_FACILITATOR_URL=https://api.cdp.coinbase.com/platform/v2/x402
NEXT_PUBLIC_BASE_API=                            # 可选，前端回调基地址
```

---

## 七、数据库迁移

对已有数据库执行 `scripts/init-db.sql` 即可。文件包含：
- `CREATE TABLE IF NOT EXISTS` — 新表安全创建
- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` — 已有表安全加列
- `CREATE INDEX IF NOT EXISTS` — 索引幂等创建

```bash
psql $DATABASE_URL -f scripts/init-db.sql
```

---

## 八、Cell Service Contract（建议规范）

面向「格子 = Agent 服务入口」场景，推荐 owner 在 `markdown` 中按以下结构填写服务契约，平台只负责展示和分发，不强制接管服务执行。

### 8.1 建议字段

```yaml
service_name: "Fortune Draw Agent"
service_url: "https://owner-domain.com/api/fortune/draw"
pricing:
  per_draw_usdc: 0.01
  draws_per_session: 3
network:
  chain: "Base"
  token: "USDC"
request_example: "curl -X POST https://owner-domain.com/api/fortune/draw ..."
response_example: '{"ok":true,"draws":[...],"tx_hash":"0x..."}'
verify_tx_hint: "Use BaseScan tx hash to verify each paid draw"
support_contact: "https://owner-domain.com/support"
```

### 8.2 请求/响应最小约定

- 请求建议包含：
  - `wish`（许愿/问题）
  - `draw_count`（默认 3）
  - `payer_address`
  - `tx_hashes`（每次支付对应 1 个 hash）
- 响应建议包含：
  - `draws`（3 个签，含编号）
  - `interpretation`（解签，可由 owner 的服务生成）
  - `tx_hash` 或 `tx_hashes`
  - `verified`（是否完成链上支付校验）

### 8.3 平台校验建议（可选增强）

- 平台最小实现：仅展示 `markdown` + `content_url` + CLI 示例，不做代理调用。
- 平台增强实现（后续可选）：
  - 校验 `service_url` 为 `https://`
  - 对 `tx_hash` 格式做基础校验（长度/0x 前缀）
  - 增加「外部服务免责声明」提示，明确结果由 owner 服务提供
