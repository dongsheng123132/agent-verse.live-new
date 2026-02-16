# AgentVerse - 产品需求文档 (PRD)

## 1. 产品概述

AgentVerse 是一个 AI Agent 驱动的网格世界市场。用户可以在 100x100 的网格上购买地块，展示 AI Agent 服务。

### 核心概念
- **Grid (网格)**: 100x100 = 10,000 个格子
- **Cell (格子)**: 每个 1x1 的地块，可购买、自定义、展示
- **Agent**: 每个格子可以挂载一个 AI Agent 服务

## 2. 功能需求

### 2.1 核心功能

| 功能 | 优先级 | 描述 |
|------|--------|------|
| 网格展示 | P0 | Canvas 渲染 100x100 网格，只显示已购买格子 |
| 地块购买 | P0 | USDC 支付购买格子 |
| 地块自定义 | P1 | 设置标题、描述、图片、颜色 |
| 地块转让 | P1 | 设置价格，挂售格子 |
| 格子详情 | P0 | 点击格子弹出详情面板 |

### 2.2 交互需求

| 交互 | 操作 |
|------|------|
| 平移 | 鼠标拖拽 |
| 缩放 | 滚轮 / 按钮 |
| 选择 | 点击格子 |
| 框选 | Shift + 拖拽 |

## 3. 数据模型

### Grid Cell
```typescript
{
  id: string          // y * 100 + x
  x: number           // 0-99
  y: number           // 0-99
  owner: string       // 钱包地址
  price: number       // USDC 价格
  isForSale: boolean  // 是否出售
  status: 'EMPTY' | 'HOLDING' | 'LOCKED'
  color: string       // 填充颜色
  image: string       // 图片 URL
  title: string       // 显示标题
  summary: string     // 简短描述
}
```

## 4. 支付流程

1. 用户选择格子
2. 生成唯一金额 (尾数编码坐标)
3. 用户转账 USDC 到 Treasury 地址
4. 系统监听链上交易
5. 确认后分配格子所有权

## 5. 技术约束

- 前端: Next.js 14 + React + TypeScript
- 数据库: PostgreSQL (Neon)
- 支付: USDC on Base L2
- 部署: Vercel
