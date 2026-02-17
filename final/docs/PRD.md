# Grid Shop MVP — 产品需求文档 (PRD)

## 一、产品概述

Grid Shop 是一个 100×100 像素格子售卖平台，用户可以购买格子并自定义内容（颜色、标题、图片、链接、Markdown 等）。类似经典的 "百万美元首页"，但基于 USDC 加密支付。

**目标用户**：Web3 用户、AI Agent、品牌推广者
**核心价值**：低门槛购买 + API Key 自主管理 + 方形块多格购买

---

## 二、核心功能

### 2.1 格子购买

| 功能 | 说明 |
|------|------|
| 方形块购买 | 支持 1×1、2×1、2×2、3×3、4×4 五种尺寸 |
| 递增定价 | 面积越大单价越高，防止囤积 |
| 区域检测 | 购买前检查目标区域是否有已售格子或越界 |
| 支付方式 | Coinbase Commerce（USDC）、x402 AI 付款 |

**定价表：**

| 尺寸 | 格子数 | 总价 USDC | 单价/格 |
|------|--------|-----------|---------|
| 1×1 | 1 | $0.02 | $0.020 |
| 2×1 | 2 | $0.05 | $0.025 |
| 2×2 | 4 | $0.12 | $0.030 |
| 3×3 | 9 | $0.36 | $0.040 |
| 4×4 | 16 | $0.80 | $0.050 |

### 2.2 格子管理（API Key 系统）

- 购买成功后自动生成 API Key（格式 `gk_<32hex>`）
- 用 Key 可通过 API 更新格子内容
- Key 丢失可通过 receipt_id 重新生成
- 方形块共享一个 Key，更新时批量修改所有块内格子

**可更新字段：**
- `fill_color` — 格子颜色（十六进制）
- `title` — 标题
- `summary` — 简介
- `image_url` — 展示图片 URL
- `content_url` — 链接 URL
- `markdown` — 自定义 Markdown 内容

### 2.3 格子详情

点击已售格子弹出详情弹窗，展示：
- 所有者地址（截断显示）
- 图片（如有）
- 标题、简介
- 链接（可点击跳转）
- Markdown 内容
- 更新时间

### 2.4 搜索

- 顶栏搜索框，支持回车/按钮触发
- 后端使用 PostgreSQL 全文搜索（FTS），降级为 ILIKE
- 搜索范围：markdown、title、summary、owner_address
- 结果以可点击按钮列表展示

### 2.5 通知栏

- 页面顶部横向滚动条（marquee）
- 展示最近 10 条事件
- 事件类型：purchase（购买）、update（更新）
- 格式示例：`🟢 (5,10) 2×2 被购买 · 0x1234...5678`

### 2.6 排名

点击"排名"按钮展开侧栏，包含两个榜单：
- **大户排名**：按持有格子数降序 TOP 10
- **最近活跃**：按最后更新时间降序 TOP 10

### 2.7 方形块渲染

- 块内所有格子同色显示
- 选择尺寸时在网格上实时预览高亮
- 有冲突区域显示红色

---

## 三、用户流程

### 3.1 购买流程

```
点击空格子 → 弹出购买弹窗
  → 选择尺寸（1×1 ~ 4×4）
  → 网格上预览目标区域
  → 点击"Coinbase 付款"
  → 跳转 Coinbase Commerce 支付页
  → 支付完成后重定向回来
  → 自动验证支付 → 写入数据库
  → 弹出 API Key 弹窗
  → 用户复制保存 Key
```

### 3.2 内容更新流程

```
curl -X PUT /api/cells/update \
  -H "Authorization: Bearer gk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"title":"My Cell","fill_color":"#ff6600","summary":"Hello!"}'
```

### 3.3 Key 恢复流程

```
curl -X POST /api/cells/regen-key \
  -H "Content-Type: application/json" \
  -d '{"x":5,"y":10,"receipt_id":"c_1234_abc"}'
```

---

## 四、非功能需求

- **性能**：10,000 格渲染 < 200ms，API 响应 < 500ms
- **安全**：API Key 存 SHA-256 哈希、SQL 参数化查询、无手动转账
- **部署**：Vercel + Neon PostgreSQL
- **兼容**：Chrome/Safari/Firefox 最新版，移动端可用
