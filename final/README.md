# Grid Shop · 100×100 格子售卖（极简版）

仅保留：100×100 格子展示、三种购买方式、数据库与 env。后续修改只改本目录，保持极简。

---

## 一、功能定义

### 1.1 产品说明

- **形态**：一张 100×100 的格子图，每个格子可被购买并记录归属。
- **用户**：人类（网页点选）或 AI/Agent（通过 x402 或手动转账）。
- **目标**：用户选择坐标 (x, y)，支付 USDC 后，该格子写入数据库并显示为「已售」；支持三种支付方式，任选其一即可完成购买。

### 1.2 核心功能

| 功能 | 说明 |
|------|------|
| 格子展示 | 前端请求已售格子列表，绘制 100×100 网格；已售格子有颜色与描边，悬停显示「已售 (x,y)」。 |
| 已售统计 | 页面展示「已售 N 格」及前 20 个坐标列表，便于核对。 |
| 购买入口 | 点击任意格子弹出购买弹窗，提供三种方式：Coinbase Commerce、x402（AI）、手动转账。 |

### 1.3 三种购买方式

| 方式 | 适用 | 流程概要 |
|------|------|----------|
| **Coinbase Commerce** | 人类在网页付款 | 前端调 `POST /api/commerce/create` 拿 `hosted_url` → 跳转 Coinbase 托管页付 USDC → 回调或验单 `GET /api/commerce/verify` → 写库并更新格子归属。 |
| **x402（AI/机器人）** | Awal 等 x402 客户端 | 调用 `POST /api/cells/purchase`，未付时返回 402；客户端付 USDC 后重试，服务端用 CDP Facilitator 验款，通过后写 `grid_cells` 与 `grid_orders`。 |
| **手动转账** | 用户自己用钱包转 USDC | 按弹窗内 Recipient / Amount / Verification 在 Base 网络转 USDC，付完后调 `POST /api/grid-shop/confirm-cell` 传入 (x, y, owner_address) 写库。 |

价格由环境变量 `PURCHASE_PRICE_USD` 控制（默认 0.02 USDC）；Commerce 与 x402 使用同一价格，手动转账金额与验证码由前端按同一规则生成。

---

## 二、系统设计说明

### 2.1 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 14 (App Router) |
| 语言 | TypeScript + JavaScript |
| 样式 | Tailwind（CDN） |
| 数据库 | PostgreSQL（如 Neon） |
| 驱动 | pg |
| 支付 | Coinbase Commerce API、x402（@x402/next + CDP Facilitator） |
| 部署 | Vercel，Root Directory 设为 `final` |

### 2.2 目录与接口

```
final/
├── app/
│   ├── page.tsx              # 唯一页面：100×100 网格 + 购买弹窗
│   ├── layout.js             # 根布局
│   └── api/
│       ├── grid/route.js           # GET 已售格子列表（供前端绘图）
│       ├── commerce/create/route.js # POST 创建 Commerce 支付
│       ├── commerce/verify/route.js # GET 验单（receipt_id 或 charge_id）
│       ├── cells/purchase/route.ts  # POST x402 购买（402 + 验款写库）
│       └── grid-shop/
│           ├── confirm-cell/route.js # POST 手动确认归属
│           └── cell-status/route.js   # GET 某格子是否已售
├── lib/db.js                  # 数据库连接
├── scripts/init-db.sql        # 建表脚本
├── .env.example               # 环境变量示例
└── README.md                  # 本文档
```

### 2.3 数据库设计

- **grid_cells**：格子主表。`(id, x, y)` 唯一；`owner_address` 非空表示已售；`status`、`fill_color`、`title`、`summary`、`last_updated` 等用于展示与扩展。
- **grid_orders**：订单/支付记录。`receipt_id` 主键；`x, y` 格子坐标；`pay_method` 为 `commerce` | `x402` | `manual`；`status` 为 `pending` | `paid`；Commerce 时存 `commerce_charge_id`，便于用 `charge_id` 补验。

详见 `scripts/init-db.sql`。

### 2.4 支付与写库逻辑

- **Commerce**：创建 charge 时插入 `grid_orders`（status=pending）；验单通过后更新为 paid，并向 `grid_cells` 插入/更新对应 (x,y) 的 `owner_address`。支持仅用 `charge_id` 补验（无 receipt_id 时用 charge 的 metadata 中的 x,y 写库）。
- **x402**：Facilitator 验款通过后，在 `cells/purchase` 的 handler 内写 `grid_cells` 和一条 `grid_orders`（pay_method=x402, status=paid）。
- **手动**：`confirm-cell` 根据 (x, y, owner_address) 写/更新 `grid_cells`，并插入一条 `grid_orders`（pay_method=manual, status=paid）。

收款地址统一使用环境变量 `TREASURY_ADDRESS`（Base 主网）。

---

## 三、运行与部署

### 3.1 本地运行

```bash
cd final
cp .env.example .env
# 编辑 .env：DATABASE_URL、TREASURY_ADDRESS、PURCHASE_PRICE_USD，可选 COMMERCE_API_KEY
npm install
npm run dev
```

打开 http://localhost:3005

### 3.2 数据库

在 Neon 等 PostgreSQL 中执行 `scripts/init-db.sql`，创建 `grid_cells`、`grid_orders` 及索引。

### 3.3 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| DATABASE_URL | 是 | PostgreSQL 连接串 |
| TREASURY_ADDRESS | 是 | Base 收款地址 |
| PURCHASE_PRICE_USD | 否 | 单价 USDC，默认 0.02 |
| COMMERCE_API_KEY | 否 | Coinbase Commerce API Key，不填则仅 x402/手动 |
| NEXT_PUBLIC_BASE_API | 否 | 前端回调基地址（如部署域名） |

### 3.4 Vercel

在项目 **Settings → General → Root Directory** 设为 **`final`**，环境变量同上；部署后即为本极简版线上环境。

---

## 四、后续修改

只改 `final/` 内文件，保持极简；如需扩展功能，优先在现有 API 与表结构上增加字段或路由，避免引入多余依赖与页面。

---

## 五、浏览器钱包付款与装修（2026-10）

> **2026-10-02 起默认是「AI 原生购买」，浏览器钱包直付已暂停**（钱包安全插件会把 x402 的 EIP-3009 付款签名误报为恶意）。购买弹窗现在是：人选格子、填想要的样子 → 复制一段提示词给自己的 AI → AI 全程用 x402 购买并装修 → 人审核结果，见本节末「AI 原生购买」。钱包直付的代码（`lib/wallet-pay/`）原样保留，由 `lib/wallet-pay/feature.ts` 里的 `WALLET_PAY_ENABLED` 控制（默认关，弹窗里只剩一个灰色禁用按钮）；本地调试 / 跑钱包 e2e 时用环境变量 `NEXT_PUBLIC_WALLET_PAY_ENABLED=1` 打开。下面「付款」「本地端到端」两条描述的是开关打开时的钱包路径；「信用卡支付暂停」按钮已从弹窗移除。

- **付款**：购买弹窗主按钮「连接钱包付款」（有 `window.ethereum` 时显示），网络二选一 Monad（默认）/ Base。付款前用只读 RPC 查 USDC 余额，不够就提示、不发起签名；只需要 USDC，gas 由 facilitator 代付。底层是官方 `@x402/fetch` + `@x402/evm` exact 客户端，且只使用用户所选网络的那条 accepts（`lib/wallet-pay/`）。单格 `POST /api/cells/purchase`，多格 `POST /api/cells/bulk-purchase`。Commerce 已不可用，按钮置灰为「信用卡支付暂停」。
- **测试网模式**：构建时 `NEXT_PUBLIC_X402_NETWORK_MODE=testnet`，或服务端下发的 402 accepts 里出现 10143 / 84532 即自动按测试网处理。
- **key**：买完后页面显示一次 `gk_…`，并按坐标存在浏览器 localStorage（`agentverse.cellKeys.v1`），随后直接打开「装修」表单（`PUT /api/cells/update`，Bearer key）。没有本机 key 时点「我有 key」手动粘贴。多格购买时 key 只对应所选范围的左上角那一格（服务端 bulk-purchase 现状）。
- **本地端到端（不碰生产）**：
  ```bash
  npm run db:local -- --no-sync                      # 本地 PGlite，不从线上同步
  X402_NETWORK_MODE=testnet X402_FACILITATOR_MOCK=1 npm run dev:local
  node scripts/e2e-wallet-buy.mjs                    # Playwright + mock 钱包，截图存系统临时目录
  ```
  `X402_FACILITATOR_MOCK=1` 只在 `NODE_ENV !== 'production'` 且测试网模式下生效（本地签名校验、不上链）；生产构建里整段代码被剔除，`npm run build && node scripts/check-no-mock-in-build.mjs` 可验证。

- **AI 原生购买（默认）**：弹窗顶部显示所选格子、格数、总价（0.1 USDC/格）、收款地址和支持网络（Monad `eip155:143` 优先，Base `eip155:8453`）；「想要的样子」可选填 title / summary / fill_color（取色器）/ iframe_url（https）/ service_url（https，x402 服务），只有填了的字段才会出现在提示词里的 `PUT /api/cells/update` JSON 中；「复制给我的 AI」生成提示词（`lib/ai-purchase-prompt.ts`，纯函数，单测在 `test/ai-purchase-prompt.test.ts`）：先向人确认总价、MoneySwitch `paid_fetch`（`max_price` = 总价）或 `npx awal@latest x402 pay` 两种付款方式、api_key 只返回一次要妥善保存并告知位置、装修、回报交易哈希/浏览器链接/格子链接、409/403/再次 402/审批等异常处理。多格购买只返回一把 key，对应 body 里的第一格。同一份模板也写在 `public/skill.md`（「人类给 AI 的购买提示词」一节，有测试保证与弹窗输出一致）。「我让 AI 买完了」刷新地图和所选格子；买到了就关闭弹窗并打开该格详情，人可以在那里点「我有 key」手动装修（装修表单不变）。
- **本地端到端（AI 弹窗）**：`npm run db:local -- --no-sync`，`npm run dev:local`（端口被占用时 `LOCAL_APP_PORT=3006`，并给脚本 `E2E_BASE_URL=http://localhost:3006`），然后 `node scripts/e2e-ai-purchase.mjs`：填字段、复制提示词（真实剪贴板）、拖选 3×2 多格、用本地库 INSERT 模拟「AI 买完了」后点刷新，截图和提示词 txt 存系统临时目录。
