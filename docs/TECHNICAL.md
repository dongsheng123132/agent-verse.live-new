# AgentVerse - 技术文档

**收款方案（推荐）**：仅用 Coinbase，不维护自定义链上校验。详见 [格子收款方案（Coinbase）](COINBASE_GRID_PAYMENT.md)：人类用 **Payment Acceptance API**，机器人用 **x402**。

## 1. 项目结构

```
shop-mvp/
├── app/                    # Next.js App Router
│   ├── api/               # API 路由
│   │   ├── grid-v3/       # 格子数据 API
│   │   ├── purchase/      # 购买相关 API
│   │   └── health/        # 健康检查
│   ├── grid-v3/           # 主应用页面
│   │   ├── components/    # React 组件
│   │   │   ├── AgentGrid.tsx    # 主容器
│   │   │   ├── WorldMap.tsx     # Canvas 地图
│   │   │   ├── DetailModal.tsx  # 详情弹窗
│   │   │   └── ...
│   │   ├── constants.ts   # 常量定义
│   │   ├── types.ts       # TypeScript 类型
│   │   └── page.tsx       # 页面入口
│   ├── grid-shop/         # 商店页面
│   ├── world/             # 世界页面
│   └── page.tsx           # 首页 (重定向到 grid-v3)
├── lib/                   # 工具库
│   └── db.js             # PostgreSQL 连接
├── backup/               # 备份文件
├── scripts/              # 数据库脚本
├── docs/                 # 文档
└── public/               # 静态资源
```

## 2. 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 14 (App Router) |
| 语言 | TypeScript |
| 样式 | Tailwind CSS |
| 数据库 | PostgreSQL (Neon) |
| ORM | pg (原生驱动) |
| 图标 | lucide-react |
| 部署 | Vercel |

## 3. 数据库 Schema

### grid_cells 表
```sql
CREATE TABLE grid_cells (
    id SERIAL PRIMARY KEY,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    owner_address VARCHAR(42),
    price_usdc NUMERIC(20,6) DEFAULT 2.0,
    is_for_sale BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'EMPTY',
    fill_color VARCHAR(7) DEFAULT '#10b981',
    image_url TEXT,
    title VARCHAR(100),
    summary TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    last_updated TIMESTAMP DEFAULT NOW(),
    UNIQUE(x, y)
);
```

### purchases 表
```sql
CREATE TABLE purchases (
    id SERIAL PRIMARY KEY,
    cell_id INTEGER REFERENCES grid_cells(id),
    buyer_address VARCHAR(42) NOT NULL,
    amount_usdc NUMERIC(20,6) NOT NULL,
    tx_hash VARCHAR(66),
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW()
);
```

## 4. API 端点

### GET /api/grid-v3
返回所有已购买的格子。

**Response:**
```json
[
  {
    "id": "1234",
    "x": 34,
    "y": 12,
    "owner": "0x1234...",
    "price": "2.000000",
    "isForSale": false,
    "status": "HOLDING",
    "color": "#10b981",
    "image": null,
    "title": "My Agent",
    "summary": "AI service"
  }
]
```

### POST /api/purchase
创建购买订单。

**Body:**
```json
{
  "x": 10,
  "y": 20,
  "amount_usdc": 2.0034,
  "buyer_address": "0x..."
}
```

## 5. Canvas 渲染逻辑

### WorldMap 组件
- 使用 HTML5 Canvas API
- 只渲染 viewport 内的格子
- 坐标计算: `screenX = cell.x * CELL_SIZE * zoom + pan.x`

### 性能优化
- 跳过屏幕外的格子
- 图片缓存 (imageCache ref)
- 使用 requestAnimationFrame

## 6. 环境变量

```bash
# 数据库
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require

# 区块链
RPC_URL=https://base-mainnet.g.alchemy.com/v2/xxx
USDC_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
TREASURY_ADDRESS=0x5C5869bceB4C4eb3fA1DCDEeBd84e9890DbC01aF
```

**Base 链 USDC 参考链接：**
- Token（原生 USDC）: https://basescan.org/token/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913
- 示例交易: https://basescan.org/tx/0xc52b70127bc2a793d169e0884bb5dc1333164ce864c3c7236d5b81b2faca1e93

## 7. 部署

### Vercel 部署
```bash
# 1. 推送到 GitHub
git push origin main

# 2. Vercel 自动部署
# 3. 配置环境变量
```

### 本地开发
```bash
npm install
npm run dev
# 访问 http://localhost:3005
```
