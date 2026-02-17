# Grid Shop MVP — 开发计划

## 一、已完成功能 ✅

### Phase 1：基础售卖
- [x] 100×100 格子网格渲染
- [x] Coinbase Commerce 支付（create → redirect → verify）
- [x] x402 AI 付款接口
- [x] 格子写入数据库（grid_cells + grid_orders）
- [x] 前端实时显示已售格子

### Phase 2：完整功能升级（当前版本）
- [x] 方形块多格购买（1×1 ~ 4×4）
- [x] 递增定价（面积越大单价越高）
- [x] API Key 系统（购买后生成，用于管理格子）
- [x] 格子内容更新 API（PUT /api/cells/update）
- [x] API Key 重新生成（POST /api/cells/regen-key）
- [x] 格子详情查看（GET /api/cells + 前端弹窗）
- [x] 全文搜索（FTS + ILIKE 降级）
- [x] 事件通知栏（页面顶部 marquee 滚动）
- [x] 排名系统（大户 + 最近活跃）
- [x] 删除手动转账（无鉴权风险）
- [x] 购买时区域冲突检测 + 预览高亮

---

## 二、待开发功能 🔲

### Phase 3：用户体验优化

- [ ] **格子图片渲染**：已售格子如有 image_url，在网格上按 block 尺寸渲染缩略图（Canvas 或 CSS background-image）
- [ ] **Minimap 小地图**：右下角固定小地图，高亮已售区域，点击可跳转
- [ ] **拖拽选区购买**：拖拽选择矩形区域代替点击+选尺寸
- [ ] **移动端优化**：双指缩放、触摸滚动、响应式弹窗
- [ ] **暗色/亮色主题切换**
- [ ] **格子颜色随机分配**：购买时自动分配随机色，而非默认绿色

### Phase 4：社交与互动

- [ ] **格子评论系统**：其他用户可对已售格子留言
- [ ] **格子点赞/收藏**
- [ ] **格子广播**：owner 可发 "公告"，出现在通知栏
- [ ] **邻居通知**：周围格子被购买时通知
- [ ] **论坛/动态流**：按时间线展示所有格子内容更新

### Phase 5：交易与经济

- [ ] **二级市场**：格子转售、挂单/撮合
- [ ] **价格曲线**：根据已售比例动态调价（如 bonding curve）
- [ ] **批量购买折扣**：一次买多个不相邻格子
- [ ] **格子到期续费**：超过一定时间未更新的格子回收
- [ ] **广告位竞拍**：特殊位置（中心、边角）拍卖

### Phase 6：AI Agent 集成

- [ ] **Agent 自动购买**：AI Agent 通过 x402 自动购买格子并发布内容
- [ ] **Agent 格子内容自动更新**：定时通过 API Key 更新格子内容
- [ ] **Agent 对话入口**：格子可嵌入 Agent 对话按钮
- [ ] **MCP Server**：提供 MCP 工具让 Claude 等 AI 直接操作格子
- [ ] **Agent 生态看板**：展示活跃 Agent 的格子和互动数据

### Phase 7：技术升级

- [ ] **WebSocket 实时更新**：替代轮询，购买/更新实时推送
- [ ] **CDN 缓存格子图片**：image_url 通过 CDN 代理
- [ ] **SSR/ISR 优化**：首屏格子数据走 ISR 缓存
- [ ] **Webhook 回调**：购买/更新时回调外部系统
- [ ] **Rate Limiting**：API 限流防刷
- [ ] **监控告警**：错误率、支付失败率告警

---

## 三、当前架构限制

| 限制 | 影响 | 建议解决 |
|------|------|----------|
| Tailwind CDN | 生产环境性能差，无 tree-shaking | 安装 tailwindcss 依赖 |
| 10000 格子 DOM 节点 | 大量格子时滚动卡顿 | Canvas 渲染或虚拟化 |
| 单次全量加载 | GET /api/grid 返回所有格子 | 分区加载或 viewport 查询 |
| 无认证系统 | 只有 API Key，无用户登录 | 接入钱包签名 / OAuth |
| x402 只支持 1×1 | 协议限制固定价格 | 按尺寸创建多个 x402 endpoint |
| 无测试 | 全部手动测试 | 添加 Jest / Playwright |

---

## 四、文件变更速查

需要修改某个功能时，查找对应文件：

| 需求 | 文件 |
|------|------|
| 修改定价 | `lib/pricing.js` — BLOCK_SIZES 数组 |
| 修改支付流程 | `app/api/commerce/create/route.js` + `verify/route.js` |
| 修改格子字段 | `scripts/init-db.sql` (加列) + `app/api/grid/route.js` (SELECT) + `app/api/cells/route.js` (详情) + `app/api/cells/update/route.js` (更新) |
| 修改前端 UI | `app/page.tsx` |
| 修改 API Key 逻辑 | `lib/api-key.js` |
| 添加新事件类型 | `lib/events.js` + 调用处 |
| 修改搜索逻辑 | `app/api/search/route.js` |
| 修改排名算法 | `app/api/rankings/route.js` |
| 修改数据库连接 | `lib/db.js` |
| 修改部署配置 | `vercel.json` + `next.config.js` |

---

## 五、本地开发

```bash
# 安装依赖
cd final && npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 填入 DATABASE_URL, COMMERCE_API_KEY 等

# 初始化数据库
psql $DATABASE_URL -f scripts/init-db.sql

# 启动开发服务器
npm run dev
# → http://localhost:3005

# 构建
npm run build
```

---

## 六、测试要点

```bash
# 1. 购买 1×1 格子（Coinbase Commerce）
# → 确认返回 api_key，数据库有 grid_cells + grid_orders + grid_events 记录

# 2. 购买 2×2 格子
# → 确认 4 个格子都写入，共享 block_id

# 3. 用 API Key 更新格子
curl -X PUT http://localhost:3005/api/cells/update \
  -H "Authorization: Bearer gk_xxx" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","fill_color":"#ff0000"}'

# 4. 查看格子详情
curl "http://localhost:3005/api/cells?x=10&y=5"

# 5. 搜索
curl "http://localhost:3005/api/search?q=test"

# 6. 事件列表
curl "http://localhost:3005/api/events?limit=5"

# 7. 排名
curl "http://localhost:3005/api/rankings"

# 8. 重新生成 Key
curl -X POST http://localhost:3005/api/cells/regen-key \
  -H "Content-Type: application/json" \
  -d '{"x":10,"y":5,"receipt_id":"c_xxx"}'
```
