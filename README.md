# Shop MVP（简洁版）

一个最小化的“线上 shop”示例，仅包含支付指令生成与到账校验接口，便于在 Vercel 快速部署测试。内含**百万格子**画布效果与白皮书入口，可整体部署到 GitHub（推荐 Vercel 连接仓库自动部署）。

## 页面
- **/** — 白皮书入口（愿景、三层架构），链接进入世界地图 / 百万格子 / 格子商店
- **/world** — 世界地图（SVG 网格，缩放平移，格子详情）
- **/grid** — 百万格子（Canvas 100×100 网格，支付配置侧栏，与根目录 `百万格子.html` 效果一致）
- **/grid-shop** — 格子商店 / 支付测试（选格、生成 Awal / AgentKit curl、校验）

## 功能
- 生成 Awal（x402 / Agentic Wallet）人工支付指令
- 生成 AgentKit 的后端购买 curl（POST /api/purchase）
- 生成到账校验链接（带 tx 或地址回溯）
- 两个 API：`/api/purchase` 与 `/api/purchase/verify`

## 部署到 GitHub
- 将本仓库（或仅 `shop-mvp` 目录）推送到 GitHub；在 Vercel 中 **Import Project** 选择该仓库，Root Directory 填 `shop-mvp`（若仓库根即为 shop-mvp 则留空），即可自动构建与部署。
- 支付相关接口（如 `/api/purchase`）需后端环境变量，见下方「部署」；纯前端展示（白皮书、世界地图、百万格子画布）在静态资源部署后也可用，格子数据来自 `/api/grid/state`（mock 或接真实后端）。

## 部署
1. 在 Vercel 导入该子目录作为项目（或在仓库根建立独立 repo）
2. 在 Project Settings → Environment Variables 填入：
   - TREASURY_ADDRESS：Base 主网收款地址
   - USDC_ADDRESS：Base USDC 合约（默认 0x8335…b8aF）
   - RPC_URL：稳定 Base RPC
   - CDP_API_KEY_ID、CDP_API_KEY_SECRET（AgentKit 模式可选）
   - NEXT_PUBLIC_BASE_API（如使用同域，留空）
3. 部署后访问首页生成指令并测试

## 使用
- 人工支付（Awal）
  - 安装 Awal：`npm install awal`
  - 登录与验证：`npx awal auth login you@example.com` → `npx awal auth verify <Flow_ID> <验证码>`
  - 查看地址与余额：`npx awal address`、`npx awal balance`
  - 发送 USDC：`npx awal send <amount_usdc> <treasury_address>`
- 后端购买（AgentKit curl）
  - 复制页面生成的 curl，调用 `/api/purchase`
- 到账校验
  - 带 tx：`/api/purchase/verify?amount_usdc=0.02&to=<treasury>&tx=<hash>`
  - 地址回溯：`/api/purchase/verify?amount_usdc=0.02&to=<treasury>&lookback=50000`

## 参考 Demo（可借鉴）
- Onchain commerce shop（OnchainKit，适合完整电商流程与 Vercel 部署）
- AgentKit（让客户自建 Agent 钱包与自动化）
- Mass Payments（Server Wallet v2，批量打款能力）

此示例聚焦最小闭环：指令生成 → 支付 → 校验。若需要站内 WalletConnect 弹窗签名或完整商品/订单系统，可在此基础上引入 OnchainKit 或 wagmi/web3modal 并扩展页面与 API。
