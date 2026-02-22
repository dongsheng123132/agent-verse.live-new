# 转售 UI 优化 + 地图工具栏重构 — Cursor 执行文档

> 核心原则：AgentVerse 是 **AI Agent 原生驱动**的产品。用户没有账户系统。上架转售、设置价格等操作由 AI Agent 通过 API Key 完成。前端只负责**展示转售状态**和**提供购买入口**。

---

## 一、转售展示与购买（前端改动）

### 1.1 设计理念

- AI Agent 通过 `PUT /api/cells/list-for-sale`（带 API Key）设置转售价格 → DB 写入 `is_for_sale=true, price_usdc=N`
- 前端从 `/api/grid` 和 `/api/cells` 拿到 `is_for_sale` + `price_usdc` 字段
- 前端只做两件事：①地图上显示"在售"标记 ②详情弹窗里显示价格+购买按钮
- 购买走 Coinbase Commerce，和新购买流程一致

### 1.2 地图上的在售标记（WorldMap.tsx）

**当前问题**：只在 `cellSize >= 12` 时右上角画一个小 `$` 符号，太不明显。

**改为**：
- 在售格子画一圈 **amber/金色细边框**（2px），无论缩放等级都能看到（只要 `cellSize >= 4`）
- 缩放较大时（`cellSize >= 16`），在格子底部叠加一个小标签显示价格，例如 `$5`
- 不要遮挡格子图片内容，边框即可

**实现位置**：`WorldMap.tsx` 的主绘制循环里，在绘制完格子内容（图片/头像）之后、绘制选中高亮之前，加入：

```js
// For-sale border highlight
if (cell?.is_for_sale && cell?.price_usdc > 0) {
    const borderWidth = Math.max(1, Math.min(3, cellSize * 0.1));
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)'; // amber
    ctx.lineWidth = borderWidth;
    ctx.strokeRect(
        screenX + borderWidth / 2,
        screenY + borderWidth / 2,
        drawW - borderWidth,
        drawH - borderWidth
    );
    // Price label when zoomed in
    if (cellSize >= 16) {
        const priceText = `$${cell.price_usdc}`;
        const fontSize = Math.max(8, Math.min(11, cellSize * 0.35));
        ctx.font = `bold ${fontSize}px monospace`;
        const tw = ctx.measureText(priceText).width;
        const labelH = fontSize + 4;
        const labelW = tw + 6;
        const lx = screenX + (drawW - labelW) / 2;
        const ly = screenY + drawH - labelH - 1;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
        ctx.fillRect(lx, ly, labelW, labelH);
        ctx.fillStyle = '#000';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(priceText, lx + labelW / 2, ly + labelH / 2);
    }
}
```

**同时删除旧的 `$` 符号绘制代码**（约 L232-L238 的 `ctx.fillText('$', ...)` 那段）。

### 1.3 详情弹窗中的转售区（AgentRoom.tsx）

**当前状态**：已有 `BuyResaleButton` 组件和 `FOR SALE` 徽章，基本 OK。

**优化点**：

1. **价格展示更突出**：把 `FOR SALE · $5 USDC` 徽章改为独立卡片样式，放在 header 下方、内容上方：

```tsx
{cell.is_for_sale && cell.price_usdc != null && cell.price_usdc > 0 && (
    <div className="mb-4 bg-amber-950/30 border border-amber-600/40 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
            <span className="text-amber-400 text-xs font-mono font-bold uppercase">For Sale</span>
            <span className="text-white text-lg font-bold font-mono">${cell.price_usdc} USDC</span>
        </div>
        <p className="text-amber-500/60 text-[10px] mb-3">
            This cell is listed for resale by its AI agent owner. Purchase to take ownership.
        </p>
        <BuyResaleButton x={cell.x} y={cell.y} priceUsdc={cell.price_usdc} refCode={null} />
    </div>
)}
```

2. **删除 header 区域里原来的小 `FOR SALE` 徽章**（L120-L122 那个 `<span>`），因为已经有独立卡片了，重复显示会冗余。

3. **删除 header 下方原来的 `BuyResaleButton` 调用**（L126-L130），移到上面的卡片里了。

### 1.4 转售购买后的回调

**当前状态**：`buy-resale` API 的 redirect URL 带了 `&resale=1` 参数，但 `page.tsx` 的 verify 逻辑没有特殊处理。

**需要确认**：`commerce/verify/route.js` 已经通过 `charge.metadata.resale` 来走转售逻辑了，所以前端不需要特殊处理 `resale=1` 参数。verify 返回的 `api_key` 就是新的格子密钥。**当前逻辑已经能正确工作，无需改动 page.tsx。**

### 1.5 BotConnect.tsx 中的 ListForSaleSection

**保留但简化**：这个 section 是给了解 API 的高级用户/开发者用的。保留现有实现即可，不需要改动。AI Agent 主要通过 API 直接调用，这个 UI 只是辅助。

---

## 二、地图工具栏重构（左侧垂直栏）

### 2.1 设计目标

参考 x402wall 的左侧垂直工具栏，将地图控制整合到一个统一的、紧凑的垂直栏中。

**桌面端**：左侧垂直悬浮栏，5 个按钮
**移动端**：底部左下角水平小条，同样的按钮但更紧凑

### 2.2 工具栏内容（从上到下）

| 序号 | 图标 | 功能 | 说明 |
|------|------|------|------|
| 1 | `Hand` | Pan 模式 | 拖拽平移地图（默认激活） |
| 2 | `SquareDashedMousePointer` | Select 模式 | 框选购买格子 |
| 3 | `Plus` | 放大 | zoom += 0.5 |
| 4 | `Minus` | 缩小 | zoom -= 0.5 |
| 5 | `Maximize` | 全屏适配 | zoom = 1, pan 居中 |

### 2.3 实现方案

**新建组件** `final/components/MapToolbar.tsx`：

```tsx
import React from 'react';
import { Hand, SquareDashedMousePointer, Plus, Minus, Maximize } from 'lucide-react';

interface MapToolbarProps {
    mode: 'pan' | 'select';
    onModeChange: (mode: 'pan' | 'select') => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFitScreen: () => void;
}

export const MapToolbar: React.FC<MapToolbarProps> = ({
    mode, onModeChange, onZoomIn, onZoomOut, onFitScreen
}) => {
    const btnBase = "flex items-center justify-center transition-all";
    // Desktop: 40x40, Mobile: 36x36
    const btnSize = "w-10 h-10 md:w-9 md:h-9";

    const modeBtn = (m: 'pan' | 'select', icon: React.ReactNode) => (
        <button
            onClick={() => onModeChange(m)}
            className={`${btnBase} ${btnSize} rounded-lg ${
                mode === m
                    ? m === 'select'
                        ? 'bg-indigo-500 text-white shadow shadow-indigo-500/30'
                        : 'bg-white text-black shadow'
                    : 'text-white/60 hover:text-white hover:bg-white/10 active:bg-white/20'
            }`}
        >
            {icon}
        </button>
    );

    const actionBtn = (onClick: () => void, icon: React.ReactNode) => (
        <button
            onClick={onClick}
            className={`${btnBase} ${btnSize} rounded-lg text-white/60 hover:text-white hover:bg-white/10 active:bg-white/20`}
        >
            {icon}
        </button>
    );

    return (
        <>
            {/* Desktop: 左侧垂直栏 */}
            <div className="hidden md:flex absolute top-3 left-3 z-20 flex-col gap-1 bg-black/70 backdrop-blur-sm rounded-xl p-1.5 border border-[#333]">
                {modeBtn('pan', <Hand size={18} />)}
                {modeBtn('select', <SquareDashedMousePointer size={18} />)}
                <div className="w-full h-px bg-[#333] my-0.5" />
                {actionBtn(onZoomIn, <Plus size={18} />)}
                {actionBtn(onZoomOut, <Minus size={18} />)}
                <div className="w-full h-px bg-[#333] my-0.5" />
                {actionBtn(onFitScreen, <Maximize size={18} />)}
            </div>

            {/* Mobile: 左下角水平栏 */}
            <div className="md:hidden absolute bottom-4 left-3 z-20 flex gap-1 bg-black/70 backdrop-blur-sm rounded-xl p-1 border border-[#333]">
                {modeBtn('pan', <Hand size={18} />)}
                {modeBtn('select', <SquareDashedMousePointer size={18} />)}
                <div className="w-px h-8 bg-[#333] self-center mx-0.5" />
                {actionBtn(onZoomIn, <Plus size={18} />)}
                {actionBtn(onZoomOut, <Minus size={18} />)}
                {actionBtn(onFitScreen, <Maximize size={16} />)}
            </div>
        </>
    );
};
```

### 2.4 page.tsx 改动

1. **导入 MapToolbar**：
```tsx
import { MapToolbar } from '../components/MapToolbar'
```

2. **删除旧的顶部工具栏**（L508-L521，即 `Map Mode Toolbar` 那个 `<div>`）

3. **删除旧的右下角缩放按钮**（L535-L547，即 `Plus` / `Minus` / `Maximize` 那三个 `<button>`）

4. **在地图区域内添加 MapToolbar**，放在 `WorldMap` 组件之后、`Minimap` 之前：

```tsx
{containerSize.width > 0 && (
    <WorldMap ... />
)}

<MapToolbar
    mode={mapMode}
    onModeChange={setMapMode}
    onZoomIn={() => setZoom(z => Math.min(6, z + 0.5))}
    onZoomOut={() => setZoom(z => Math.max(0.1, z - 0.5))}
    onFitScreen={() => {
        const cellSize = CELL_PX * 1;
        const targetX = 16 * cellSize;
        const targetY = 16 * cellSize;
        const cx = (containerSize.width / 2) - targetX;
        const cy = (containerSize.height / 2) - targetY;
        setPan(clampPan({ x: cx, y: cy }, 1, containerSize));
        setZoom(1);
    }}
/>
```

5. **Minimap 保留在右下角**（桌面端），但简化外层 wrapper：

```tsx
{/* Minimap: 只在桌面端显示，右下角 */}
<div className="hidden lg:block absolute bottom-6 right-6 z-20">
    <Minimap
        grid={cells}
        pan={pan}
        zoom={zoom}
        viewport={containerSize}
        onNavigate={handleNavigate}
        onPanTo={handlePanTo}
    />
</div>
```

---

## 三、不需要改动的部分

| 模块 | 说明 |
|------|------|
| `list-for-sale/route.js` | API 已完成，AI Agent 通过 API Key 调用 |
| `buy-resale/route.js` | API 已完成，创建 Commerce charge |
| `for-sale/route.js` | API 已完成，列出所有在售格子 |
| `commerce/verify/route.js` | 已支持 resale 验证逻辑 |
| `commerce/create/route.js` | 新购买流程无需改动 |
| `pricing.js` / `types.ts` | 已是 $1/cell 定价 |
| `PurchaseModal.tsx` | 新购买弹窗无需改动 |

---

## 四、改动清单摘要

| 文件 | 改动类型 | 内容 |
|------|---------|------|
| `components/MapToolbar.tsx` | **新建** | 统一地图工具栏组件 |
| `components/WorldMap.tsx` | 修改 | 在售格子金色边框 + 价格标签，删除旧 `$` 标记 |
| `components/AgentRoom.tsx` | 修改 | 转售卡片样式优化，整合 badge + button 为独立卡片 |
| `app/page.tsx` | 修改 | 引入 MapToolbar，删除旧工具栏和缩放按钮，调整 Minimap 位置 |

总共改 3 个文件 + 新建 1 个文件，非常精简。

---

## 五、视觉效果参考

### 桌面端布局：
```
┌──────────────────────────────────────────────┐
│ HEADER                                        │
├──┬───────────────────────────────────────┬────┤
│  │                                       │ S  │
│T │                                       │ I  │
│O │          WORLD MAP                    │ D  │
│O │                                       │ E  │
│L │                                       │ B  │
│B │                                       │ A  │
│A │                                  ┌────┤ R  │
│R │                                  │MINI│    │
│  │                                  │MAP │    │
├──┴──────────────────────────────────┴────┴────┤
```

### 移动端布局：
```
┌──────────────────────┐
│ HEADER               │
├──────────────────────┤
│                      │
│     WORLD MAP        │
│                      │
│                      │
│ ┌──────────────┐     │
│ │ 🤚 ▫ │+ - ⛶│     │
│ └──────────────┘     │
├──────────────────────┤
│   MAP  FEED  ME      │
└──────────────────────┘
```

### 在售格子详情弹窗：
```
┌──────────────────────────────┐
│ Cell Title           (x,y)   │
│ owner: 0xabc...              │
│                              │
│ ┌──────────────────────────┐ │
│ │ FOR SALE         $5 USDC │ │
│ │ Listed by AI agent owner │ │
│ │ [■■■ Buy this cell ■■■]  │ │
│ └──────────────────────────┘ │
│                              │
│ [Cell content / iframe etc]  │
│                              │
│ [Copy for AI]      [Skill]   │
└──────────────────────────────┘
```

---

## 六、手续费说明（已实现，无需改动）

转售购买走 `commerce/verify` → `metadata.resale=true` 分支：
- 买家支付卖家设定的价格（全额走 Coinbase Commerce）
- 平台手续费通过 Coinbase Commerce 的平台分成设置（需在 Coinbase Commerce 后台配置），或者后续通过 webhook 扣除
- 当前代码中**没有显式抽佣逻辑**，如果需要平台抽 5-10%，有两个选项：
  1. **简单方案**：在 `buy-resale/route.js` 创建 charge 时，`local_price.amount` 设为 `price * 1.05`（买家多付 5%），metadata 记录平台费
  2. **标准方案**：Coinbase Commerce 后台设置 Application Fee，平台自动获得分成

> 这个抽佣逻辑不在本次前端优化范围内。后续可单独实现。
