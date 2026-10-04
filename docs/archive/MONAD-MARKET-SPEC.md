# AgentVerse → Monad x402 服务市场：改造规格

2026-09-29，主会话起草。实现以本文件为准；做不到的地方要报告，不要自行改设计。

## 0. 定位

**Monad 上第一个 x402 服务市场。** 人看格子地图（百万格子，是广告位），AI 看文字版索引并直接调用。Base 和 Monad 都支持。

- **两条链收款地址相同**：`0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6`（Base 主网 eip155:8453 和 Monad 主网 eip155:143 共用）。在代码里只读一个环境变量 `PAY_TO_ADDRESS`，默认值就是这个地址，不再用老的 `TREASURY_ADDRESS`。
- **价格**：0.1 USDC / 格。10×10 的广告区共 100 格，10 USDC。以后可能涨到 0.5，所以单价只在一处常量里定义。
- **P0 / P1**（安全修复、双链收款）已经在做，本文件从 P2 开始写。

## P2：格子挂服务

- **格子新增字段**（只加不改，`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`）：
  - 服务信息：`service_url`、`service_method`（GET / POST）、`service_desc`、`service_category`
  - 探测结果：`probe_status`（verified / candidate / failed / unprobed）、`probe_accepts`（JSONB）、`probed_at`
  - 链上证据：`evidence`（JSONB，包含 payers_7d、transfers_7d、last_tx、last_at、source）
- **挂服务**：格子主人用自己的 API key 调 `PUT /api/cells/update`，可以写入上面这些服务字段。
  - 保存后立刻探测一次：只发 GET、不付款，POST 服务不探测。解析 402 响应：包含 eip155:143 或 8453，且资产是对应链的 USDC，记为 `candidate`。
  - 链上证据只要有 1 笔「付款人 ≠ 收款地址」的付款，就记为 `verified`（点亮）。
  - URL 必须是 https。发起探测前要做 SSRF 检查：拒绝私网地址、元数据地址、localhost。
- **格子 UI**：
  - 地图上 `verified` 的格子有灯笼式的微光，`candidate` 的格子有暗色标记。
  - 格子详情（AgentRoom）加一张「服务卡」：名称、价格、网络、验证状态、最近 7 天付款人数、最后一笔交易的浏览器链接。
  - 服务卡上有「复制给 AI」按钮，复制 MoneySwitch 的 `paid_fetch` 提示词，里面带上 URL 和最高价格。
- **广告区**：沿用 bulk-purchase，一次买 10×10。整块可以挂同一个服务，地图上合并显示成一块招牌。

## P3：文字版市场（像 agent402.tools，给人和 AI 同时看）

- **页面 `/market`**：服务列表，可搜索、可筛选（网络、类别、价格上限）、可排序（点亮的排前面）。
  - 每条显示：名称、描述、价格、网络、状态、7 日付款人数、来源（官方收录 / 格子挂牌）、「复制给 AI」按钮。
- **数据有两个来源**：
  1. **官方收录**：种子列表，照搬 `C:\1mineyswitch\repos\lantern-city\service\seed.json`；再加上 Coinbase Bazaar 里 `network=eip155:143` 的同步结果。
  2. **客户挂牌**：所有填了 `service_url` 的格子。
- **探测和证据的实现**：从 `C:\1mineyswitch\repos\lantern-city\service\src\`（x402.ts、probe.ts、rpc.ts、hypersync.ts、bazaar.ts）照抄改写到 `final/lib/market/`，不要跨仓库 import。
  - 有 `ENVIO_API_TOKEN` 时，证据用 Envio HyperSync 查 7 天；没有时退回 RPC 短窗口。
  - 出站请求跟随代理：本地开发时需要，Vercel 上不需要。
- **缓存**：新表 `market_services`（主键 url，存探测结果和证据，带 `probed_at`）。请求时发现数据超过 30 分钟就后台刷新，不阻塞响应。不依赖 cron。
- **给 AI 的接口**：
  - `GET /api/services?q=&network=&max_price=&category=&status=`：返回 JSON。
  - `GET /llms.txt`：服务索引加上「怎么付款」，写明 x402 流程，以及用 MoneySwitch 一条命令付款。
  - `GET /.well-known/x402`：列出本站自己的付费接口（买格子、整块购买、换 key），附价格和网络。
  - `/skill.md`：新增一节「找服务、调服务」。

## P4：视觉

- **地图性能**：
  - WorldMap 画布要按 DPR 缩放（上限 2），否则高分屏发虚。
  - 去掉每 50ms 一次的全量重绘，改成有变化才重绘。
  - 滚轮缩放要能用：用非 passive 的监听。
- **Tailwind**：从 CDN 运行时版改成构建时编译。
- **视觉语言**（参考 `C:\1mineyswitch\repos\lantern-city` 的美术）：
  - 保留百万格子的地图主体；夜色底加灯笼暖光的点缀。
  - 点亮的服务格子像一盏盏灯。
  - Monad 紫只用在「链上可验证」的元素上。
- **灵签**：中心那块「新春算命馆」（16,16，2×2 区块）的 iframe 改成 `https://monad-lingqian.vercel.app`，同时挂上它的 x402 服务 `/qian`，作为示范摊位。

## P5：上线

- **数据库变更只能加、不能删改**：只允许 `CREATE TABLE IF NOT EXISTS` 和 `ADD COLUMN IF NOT EXISTS`。
  - 程序首次访问时自动执行，可以重复执行，结果不变。
  - 不许删改已有的表、列和数据，不许重写已有格子。
  - 原因：预览环境和生产环境共用同一个 Neon 库。
- **上线顺序**：推 `monad` 分支 → Vercel 自动生成预览 → 冒烟测试（只读接口、两条链的 402 内容、`/market`、`/llms.txt`）→ 合并到 main 上生产。
- **真实购买测试**（0.1 USDC）由用户自己执行，不在自动化范围内。
- **Base 老数据**：全部保留。现有的 1061 格照常显示。其中 `0xRESERVED` 和 `0xAgentVerseOfficial` 两类官方展示位，后续可以腾出一部分给「官方收录」服务做示范位（这一条之后再定）。
