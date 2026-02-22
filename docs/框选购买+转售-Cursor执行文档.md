# 框选购买 + 转售机制 — Cursor 执行文档

> 本文档供 Cursor AI 直接执行。包含三大功能：1) 固定 1 USDC 定价 2) 地图框选多格子购买 3) 转售机制。
> 桌面端和手机端都要支持。

---

## 项目关键信息

| 项目 | 值 |
|------|-----|
| 框架 | Next.js 14.2 App Router |
| 根目录 | `final/` |
| 网格 | 100×100, Canvas 渲染 |
| 常量 | CELL_PX=8, COLS=ROWS=100 |
| 数据库 | PostgreSQL (Neon) |
| 支付 | Coinbase Commerce + x402 |
| 样式 | Tailwind CDN (class 直接写) |

---

## 功能一：固定 1 USDC 定价（替换递增定价）

### 目标
去掉 BLOCK_SIZES 递增定价体系（0.5/1.25/3/9/20），改为每个格子固定 **1 USDC**。

### 改动文件

#### 1. `lib/pricing.js` — 完全重写

**当前代码：**
```js
export const BLOCK_SIZES = [
  { w: 1, h: 1, label: '1×1', price: 0.50 },
  { w: 2, h: 1, label: '2×1', price: 1.25 },
  ...
]
export function getBlockPrice(w, h) { ... }
export function getBlockLabel(w, h) { ... }
```

**改为：**
```js
export const PRICE_PER_CELL = 1.00  // 1 USDC per cell

export function calcTotalPrice(cellCount) {
  return cellCount * PRICE_PER_CELL
}

// 保留 legacy compat —— verify 路由还在用
export function getBlockLabel(w, h) {
  return `${w}×${h}`
}
export function getBlockPrice(w, h) {
  return w * h * PRICE_PER_CELL
}
```

#### 2. `app/types.ts` — 删除 BLOCK_SIZES，新增 PRICE_PER_CELL

**删除：**
```ts
export const BLOCK_SIZES = [
  { w: 1, h: 1, label: '1×1', price: 0.50 },
  ...
]
```

**新增：**
```ts
export const PRICE_PER_CELL = 1.00
```

#### 3. `app/api/cells/purchase/route.ts` — 更新 x402 价格

**当前：**
```ts
const priceUsd = process.env.PURCHASE_PRICE_USD || '0.50'
```

**改为：**
```ts
const priceUsd = process.env.PURCHASE_PRICE_USD || '1.00'
```

---

## 功能二：地图框选购买

### 目标
在地图上加一个模式切换工具栏（拖动/框选），框选模式下用户拖拽选择矩形区域，选中的空闲格子可以一次购买，总价 = 格子数 × 1 USDC。

### 交互设计

#### 工具栏
浮在地图左上角，两个按钮：
```
┌────────────────────┐
│ [✋ 拖动] [▢ 框选]  │
└────────────────────┘
```
- **拖动模式（默认）**：现有行为，鼠标拖拽平移地图，点击选中格子
- **框选模式**：鼠标拖拽画矩形选区，松手弹出购买弹窗

#### 桌面端交互

| 操作 | 拖动模式 | 框选模式 |
|------|---------|---------|
| 鼠标拖拽 | 平移地图 | 画矩形选区 |
| 鼠标单击 | 选中格子（已购→详情，空→购买） | 选中单个格子 |
| 滚轮 | 缩放 | 缩放 |

#### 手机端交互

| 操作 | 拖动模式 | 框选模式 |
|------|---------|---------|
| 单指拖 | 平移 | 画矩形选区 |
| 单指点 | 选中格子 | 选中单个格子 |
| 双指捏合 | 缩放 | 缩放 |

#### 选区渲染
- 半透明蓝紫色 `rgba(99, 102, 241, 0.2)` 覆盖选区
- 蓝紫色虚线边框 `#6366f1`
- 已购/保留格子标红 `rgba(239, 68, 68, 0.35)`
- 选区下方显示 label: `"12 cells · $12 USDC"`
- 框选完成后**自动切回拖动模式**

### 改动文件

#### 1. `components/WorldMap.tsx`

**新增 prop：**
```ts
interface WorldMapProps {
    // ...现有 props 不变
    mode: 'pan' | 'select'  // 新增
}
```

**新增内部状态（替换旧的 selectionRect）：**
```ts
// 用网格坐标记录选区，而不是屏幕坐标
const [selectGridStart, setSelectGridStart] = useState<{col: number, row: number} | null>(null)
const [selectGridEnd, setSelectGridEnd] = useState<{col: number, row: number} | null>(null)
```

**用 useMemo 计算选区信息：**
```ts
const selectionInfo = useMemo(() => {
    if (!selectGridStart || !selectGridEnd) return null
    const minCol = Math.max(0, Math.min(selectGridStart.col, selectGridEnd.col))
    const maxCol = Math.min(COLS - 1, Math.max(selectGridStart.col, selectGridEnd.col))
    const minRow = Math.max(0, Math.min(selectGridStart.row, selectGridEnd.row))
    const maxRow = Math.min(ROWS - 1, Math.max(selectGridStart.row, selectGridEnd.row))
    let validCount = 0, ownedCount = 0
    for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
            const cell = cellMap.get(`${c},${r}`)
            if (!cell?.owner && !isReserved(c, r)) validCount++
            if (cell?.owner) ownedCount++
        }
    }
    return { minCol, maxCol, minRow, maxRow, validCount, ownedCount }
}, [selectGridStart, selectGridEnd, cellMap])
```

**handleMouseDown 改为：**
```ts
if (mode === 'select') {
    // 获取网格坐标作为起点
    const gc = getGridCoord(mouseX, mouseY)
    setSelectGridStart({ col: gc.x, row: gc.y })
    setSelectGridEnd({ col: gc.x, row: gc.y })
    setIsSelecting(true)
} else {
    setIsDragging(true)  // 现有拖拽逻辑
}
```

**handleMouseMove — 框选模式下更新终点：**
```ts
if (isSelecting && mode === 'select') {
    const gc = getGridCoord(mouseX, mouseY)
    setSelectGridEnd({ col: gc.x, row: gc.y })
    return
}
// 其余保持现有逻辑
```

**handleMouseUp — 框选完成后收集格子：**
```ts
if (isSelecting && mode === 'select' && selectionInfo) {
    if (moveDist < 5) {
        // 微小移动 → 当作单击
        // ... 选中单个格子
    } else {
        // 收集选区内空闲格子
        const newSelection = []
        for (let r = selectionInfo.minRow; r <= selectionInfo.maxRow; r++) {
            for (let c = selectionInfo.minCol; c <= selectionInfo.maxCol; c++) {
                const cell = cellMap.get(`${c},${r}`)
                if (!isReserved(c, r) && !cell?.owner) {
                    newSelection.push(cell || { id: r * COLS + c, x: c, y: r, owner: null })
                }
            }
        }
        if (newSelection.length > 0) onSelectCells(newSelection)
    }
}
```

**Touch 事件同理：** `handleTouchStart` / `handleTouchMove` / `handleTouchEnd` 在 `mode === 'select'` 时走框选逻辑，否则走现有的平移逻辑。双指捏合缩放始终可用。

**draw() 末尾 — 绘制选区矩形：**
```ts
if (selectionInfo && isSelecting) {
    const { minCol, maxCol, minRow, maxRow, validCount } = selectionInfo
    const sx = Math.floor(minCol * cellSize + pan.x)
    const sy = Math.floor(minRow * cellSize + pan.y)
    const sw = Math.ceil((maxCol - minCol + 1) * cellSize)
    const sh = Math.ceil((maxRow - minRow + 1) * cellSize)

    // 选区填充
    ctx.fillStyle = 'rgba(99, 102, 241, 0.2)'
    ctx.fillRect(sx, sy, sw, sh)
    ctx.strokeStyle = '#6366f1'
    ctx.lineWidth = 2
    ctx.setLineDash([6, 3])
    ctx.strokeRect(sx, sy, sw, sh)
    ctx.setLineDash([])

    // 标红已购/保留格子
    for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
            const cell = cellMap.get(`${c},${r}`)
            if (cell?.owner || isReserved(c, r)) {
                ctx.fillStyle = 'rgba(239, 68, 68, 0.35)'
                ctx.fillRect(
                    Math.floor(c * cellSize + pan.x),
                    Math.floor(r * cellSize + pan.y),
                    Math.ceil(cellSize), Math.ceil(cellSize)
                )
            }
        }
    }

    // 数量+价格标签
    if (validCount > 0) {
        const label = `${validCount} cells · $${validCount} USDC`
        // ... 绘制 label（黑底白字 pill，居中在选区下方）
    }
}
```

**Canvas cursor class 改为：**
```ts
const cursorClass = mode === 'select' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
```

**删除旧的：**
- `selectionStart` ref（屏幕坐标版）
- `selectionRect` state（屏幕坐标版）
- 旧的 Shift+Drag 逻辑（不再需要 Shift 触发）
- 旧的 `selectionRect` 渲染代码（Section 4 的绿色虚线框）

#### 2. `app/page.tsx`

**import 改动：**
```ts
// 删除
import { BLOCK_SIZES } from './types'
// 新增
import { PRICE_PER_CELL } from './types'
import { Hand, SquareDashedMousePointer } from 'lucide-react'
```

**新增 state：**
```ts
const [mapMode, setMapMode] = useState<'pan' | 'select'>('pan')
```

**删除 state：**
```ts
// 删除这两行
const [blockSize, setBlockSize] = useState(BLOCK_SIZES[0])
// 删除 hasConflict 和 blockConflict
```

**修改 handleSelectCells：**
```ts
const handleSelectCells = (cells: Cell[]) => {
    setSelectedCells(cells)
    if (cells.length === 0) {
        setDetailCell(null)
        setShowPurchaseModal(false)
        return
    }
    // 单个已购格子 → 查看详情
    if (cells.length === 1 && cells[0].owner) {
        setDetailLoading(true)
        setDetailCell(cells[0])
        fetch(`/api/cells?x=${cells[0].x}&y=${cells[0].y}`)...
        return
    }
    // 过滤掉已购/保留，打开购买弹窗
    const valid = cells.filter(c => !c.owner && !isReserved(c.x, c.y))
    if (valid.length > 0) {
        setSelectedCells(valid)
        setShowPurchaseModal(true)
        setPayError(null)
        setMapMode('pan')  // 框选完自动切回拖动
    }
}
```

**修改 handlePay：**
```ts
const handlePay = async () => {
    if (selectedCells.length === 0) return
    setPayError(null)
    setPayLoading(true)
    try {
        const res = await fetch('/api/commerce/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cells: selectedCells.map(c => ({ x: c.x, y: c.y })),
                ref: refCode || undefined
            }),
        })
        const data = await res.json()
        if (data?.hosted_url) { window.location.href = data.hosted_url; return }
        setPayError(data?.message || data?.error || 'Payment creation failed')
    } catch (e: any) { setPayError(e?.message || 'Request failed') }
    finally { setPayLoading(false) }
}
```

**WorldMap 组件加 mode prop：**
```tsx
<WorldMap ... mode={mapMode} />
```

**在地图区域内加工具栏（在 WorldMap 下方、Map Controls 上方）：**
```tsx
{/* Map Mode Toolbar */}
<div className="absolute top-3 left-3 z-20 flex gap-1 bg-black/70 backdrop-blur-sm rounded-lg p-1 border border-[#333]">
    <button onClick={() => setMapMode('pan')}
        className={`px-3 py-2 md:py-1.5 rounded text-xs font-mono font-medium transition-all flex items-center gap-1.5
            ${mapMode === 'pan' ? 'bg-white text-black shadow' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
        <Hand size={14} /> {lang === 'zh' ? '拖动' : 'Pan'}
    </button>
    <button onClick={() => setMapMode('select')}
        className={`px-3 py-2 md:py-1.5 rounded text-xs font-mono font-medium transition-all flex items-center gap-1.5
            ${mapMode === 'select' ? 'bg-indigo-500 text-white shadow shadow-indigo-500/30' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
        <SquareDashedMousePointer size={14} /> {lang === 'zh' ? '框选' : 'Select'}
    </button>
</div>
```

**修改 PurchaseModal 调用：**
```tsx
{showPurchaseModal && selectedCells.length > 0 && (
    <PurchaseModal
        selectedCells={selectedCells.map(c => ({ x: c.x, y: c.y }))}
        onPay={handlePay}
        onClose={() => { setShowPurchaseModal(false); setSelectedCells([]) }}
        loading={payLoading}
        error={payError}
        refCode={refCode}
    />
)}
```

#### 3. `components/PurchaseModal.tsx` — 完全重写

**新的 Props：**
```ts
interface PurchaseModalProps {
    selectedCells: { x: number; y: number }[]
    onPay: () => void
    onClose: () => void
    loading: boolean
    error: string | null
    refCode?: string | null
}
```

**显示内容：**
- 已选格子数量
- 坐标范围 `(minX,minY) → (maxX,maxY)`
- 单价 $1 × 数量 = 总价
- 确认购买按钮
- AI Agent x402 命令（多个格子时展示多条命令）

**删除的旧内容：**
- Block Size 选择器 UI
- `checkConflict` / `hasConflict` props
- `blockSize` / `setBlockSize` props

#### 4. `app/api/commerce/create/route.js` — 改为接收 cells 数组

**新接口：**
```
POST /api/commerce/create
Body: { cells: [{x, y}, ...], ref? }
```

**核心改动：**
```js
const { cells, ref } = await req.json()

// 验证
if (!cells || !Array.isArray(cells) || cells.length === 0) return error 400
if (cells.length > 100) return error 400 // 单次最多 100 个

// 每个格子检查范围 + 保留
for (const cell of cells) { ... }

// 数据库检查已购
const placeholders = cells.map((c, i) => `($${i*2+1}::int, $${i*2+2}::int)`)
const params = cells.flatMap(c => [c.x, c.y])
const res = await dbQuery(
    `SELECT x, y FROM grid_cells WHERE owner_address IS NOT NULL AND (x, y) IN (VALUES ${placeholders.join(',')})`,
    params
)

// 计算价格
const totalPrice = cells.length * 1.00

// 创建 charge
const payload = {
    name: `${cells.length} Grid Cells`,
    description: `Purchase ${cells.length} cells on AgentVerse`,
    pricing_type: 'fixed_price',
    local_price: { amount: totalPrice.toFixed(2), currency: 'USD' },
    redirect_url: `${origin}/?paid=1&x=${cells[0].x}&y=${cells[0].y}&receipt_id=${receiptId}`,
    cancel_url: `${origin}/?paid=0`,
    metadata: { receipt_id: receiptId, cells: JSON.stringify(cells), ref: ref || '' },
}

// 记录订单 — 新增 cells_json 字段
await dbQuery(
    `INSERT INTO grid_orders (receipt_id, x, y, amount_usdc, unique_amount, pay_method, status, commerce_charge_id, ref_code, cells_json)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [receiptId, cells[0].x, cells[0].y, totalPrice, 0, 'commerce', 'pending', chargeId, ref || null, JSON.stringify(cells)]
)
```

#### 5. `app/api/commerce/verify/route.js` — 批量写入格子

**核心改动 — 从 metadata 或订单读取 cells：**
```js
// 从订单或 charge metadata 获取 cells 列表
let cellsList = []
if (orderRow?.cells_json) {
    cellsList = JSON.parse(orderRow.cells_json)
} else if (charge?.metadata?.cells) {
    cellsList = JSON.parse(charge.metadata.cells)
} else {
    // Legacy 兼容：旧订单用 x, y + block_w, block_h
    const blockW = Number(charge?.metadata?.block_w) || 1
    const blockH = Number(charge?.metadata?.block_h) || 1
    for (let dy = 0; dy < blockH; dy++) {
        for (let dx = 0; dx < blockW; dx++) {
            cellsList.push({ x: cellX + dx, y: cellY + dy })
        }
    }
}

// 批量插入（每个格子独立 1×1，不再有 block 概念）
for (const cell of cellsList) {
    const cid = cell.y * 100 + cell.x
    await dbQuery(
        `INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, block_w, block_h, block_origin_x, block_origin_y, last_updated)
         VALUES ($1,$2,$3,$4,'HOLDING',false,1,1,$2,$3,NOW())
         ON CONFLICT (x,y) DO UPDATE SET owner_address = EXCLUDED.owner_address, status = 'HOLDING', is_for_sale = false,
           block_w = 1, block_h = 1, block_origin_x = $2, block_origin_y = $3, last_updated = NOW()`,
        [cid, cell.x, cell.y, owner]
    )
}

// 为第一个格子生成 API key（返回给用户）
apiKey = await generateApiKey(cellsList[0].x, cellsList[0].y)

// 为每个额外格子也生成 key（用户可通过 regen-key 获取）
for (let i = 1; i < cellsList.length; i++) {
    try { await generateApiKey(cellsList[i].x, cellsList[i].y) } catch {}
}
```

#### 6. 数据库迁移

在 `scripts/init-db.sql` 末尾追加：
```sql
-- Multi-cell purchase support
ALTER TABLE grid_orders ADD COLUMN IF NOT EXISTS cells_json JSONB;
-- 格式: [{"x":5,"y":10}, {"x":5,"y":11}, ...]
```

---

## 功能三：转售机制

### 目标
格子主人可以挂售自己的格子，设定价格，其他人可以直接购买。

### 数据库
grid_cells 表已有字段，无需加列：
- `is_for_sale BOOLEAN DEFAULT FALSE`
- `price_usdc NUMERIC(18, 6)`

需要新增一个 `sale_price` 索引：
```sql
CREATE INDEX IF NOT EXISTS idx_grid_cells_for_sale ON grid_cells (is_for_sale) WHERE is_for_sale = true;
```

### 新增 API

#### 1. `app/api/cells/list-for-sale/route.ts` — 挂售/取消挂售

```
PUT /api/cells/list-for-sale
Headers: Authorization: Bearer gk_xxx
Body: { x, y, price_usdc: number } — 挂售
Body: { x, y, price_usdc: 0 } 或 { x, y, cancel: true } — 取消
```

**逻辑：**
1. 验证 API key 对应 (x, y)
2. 如果 price_usdc > 0：设 `is_for_sale = true, price_usdc = price`
3. 如果 cancel 或 price_usdc <= 0：设 `is_for_sale = false, price_usdc = NULL`
4. 记录 event

#### 2. `app/api/cells/buy-resale/route.ts` — 购买转售格子

```
POST /api/cells/buy-resale
Body: { x, y, ref? }
```

这是一个 Coinbase Commerce 支付流程（和新购一样），但：
- 价格从 `grid_cells.price_usdc` 读取（卖家设的价）
- 支付成功后：
  - `owner_address` 改为买家
  - `is_for_sale = false, price_usdc = NULL`
  - 旧 API key 删除，为新 owner 生成新 key
  - 记录 `resale` event
  - 日后可加：卖家收到款（需要 escrow 或分账，当前简化版先不做，改为平台收款）

#### 3. `app/api/cells/for-sale/route.ts` — 获取所有在售格子

```
GET /api/cells/for-sale
Response: { cells: [{ x, y, price_usdc, owner, title, image_url, ... }] }
```

```js
const res = await dbQuery(
    `SELECT x, y, owner_address as owner, title, image_url, fill_color, price_usdc, summary
     FROM grid_cells WHERE is_for_sale = true AND price_usdc > 0
     ORDER BY price_usdc ASC LIMIT 100`
)
```

### 前端改动

#### 1. 格子详情弹窗 (`AgentRoom.tsx`)

在已购格子的详情中：
- 如果 `is_for_sale && price_usdc > 0`，显示价格标签："FOR SALE · $X USDC"
- 如果非当前用户拥有：显示 "购买" 按钮
- 如果是当前用户拥有（怎么判断？暂不做 wallet connect，改为在 BotConnect 页提供挂售入口）

#### 2. BotConnect 页面或独立入口

在 `BotConnect` 组件中（或新增一个 Tab），加一个 "挂售管理" 区域：
```
API Key: [gk_xxx]
格子坐标: [x] [y]
挂售价格: [    ] USDC
[挂售]  [取消挂售]
```

#### 3. 地图渲染 (`WorldMap.tsx`)

在售格子可以在 Canvas 上加一个小标记（当 cellSize >= 12 时）：
- 右上角画一个小绿色 `$` 标签
- 或者格子边框用特殊颜色（如金色 `#f59e0b`）

#### 4. Sidebar 或 MobileFeed

可以加一个 "For Sale" 板块，展示在售格子列表，用户点击跳转到地图位置。

### grid_cells 新增字段

types.ts 的 Cell 类型新增：
```ts
is_for_sale?: boolean
price_usdc?: number
```

grid API (`/api/grid/route.js`) 的 SELECT 语句加上 `is_for_sale, price_usdc`。

---

## 需要删除/清理的旧代码

| 位置 | 删除内容 |
|------|---------|
| `app/types.ts` | `BLOCK_SIZES` 数组 |
| `lib/pricing.js` | `BLOCK_SIZES` 数组 |
| `components/PurchaseModal.tsx` | Block Size 选择器 UI、`checkConflict` prop |
| `app/page.tsx` | `blockSize` state、`setBlockSize`、`BLOCK_SIZES` import、`blockConflict` 函数、`hasConflict` 计算 |
| `app/api/commerce/create/route.js` | `block_w`, `block_h` 参数处理（保留向后兼容即可） |

---

## 不改动的部分

- 格子内容编辑 (`api/cells/update`) — 不变
- 排行榜/事件流 — 不变（新增 resale event 类型即可）
- 推荐系统 (referral) — 不变
- API Key 系统 — 不变
- Minimap — 不变
- 旧 block 数据的渲染兼容 — 不变
- 保留格子逻辑 (isReserved) — 不变

---

## 执行顺序建议

1. **定价改动** — pricing.js + types.ts + x402 route（最简单，先做）
2. **数据库迁移** — 加 cells_json 列 + for_sale 索引
3. **后端 API** — commerce/create 改多格子 → commerce/verify 改批量写入
4. **WorldMap 框选** — 新增 mode prop + 框选逻辑 + 选区渲染
5. **page.tsx + PurchaseModal** — 工具栏 + 新弹窗 + handlePay 改造
6. **转售后端** — list-for-sale + buy-resale + for-sale API
7. **转售前端** — AgentRoom 价格展示 + 购买按钮 + 挂售管理入口
8. **测试** — 桌面框选/手机框选/购买/转售 全流程

---

## 关键文件路径速查

```
final/lib/pricing.js                          # 定价逻辑
final/app/types.ts                            # 类型 + 常量
final/components/WorldMap.tsx                 # Canvas 地图
final/components/PurchaseModal.tsx            # 购买弹窗
final/app/page.tsx                            # 主页
final/app/api/commerce/create/route.js        # 创建支付
final/app/api/commerce/verify/route.js        # 验证支付
final/app/api/cells/purchase/route.ts         # x402 支付
final/app/api/grid/route.js                   # 获取网格数据
final/components/AgentRoom.tsx                # 格子详情弹窗
final/components/BotConnect.tsx               # Bot/API管理
final/scripts/init-db.sql                     # 数据库 schema
```
