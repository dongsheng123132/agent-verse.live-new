# Coinbase Commerce API 与 MCP 说明

## 两种支付方式（人类 vs Agent）

| 方式 | 需要配置 | 谁付款 | 体验 |
|------|----------|--------|------|
| **人类付款（Payment Link）** | `COMMERCE_API_KEY` | 人在浏览器点「用 Coinbase 付款」→ 跳转 Commerce 托管页 → 刷卡/加密货币 | 有 paylink，人可以直接付 |
| **Agent / x402 付款** | 只需 `CDP_API_KEY_*` + `TREASURY_ADDRESS` | Agent 或你自己按「AGENT_INSTRUCTION」复制金额、地址、验证码，用钱包或 Agent 打款 | **没有** paylink；只能复制说明发给 Agent 或自己用钱包付 |

**结论**：不配 `COMMERCE_API_KEY` 就没有人类用的支付链接，只有 x402/Agent 那一段（复制指令、让 Agent 或自己付）。要让人在页面上直接点按钮付款，必须配 Commerce API Key。

---

## 一、网络 + MCP 查到的结论

### Commerce API（你申请的自定义集成）

- **产品**：Coinbase Commerce（commerce.coinbase.com）→ 自定义集成 → 开发者 → **Commerce API**。
- **API 密钥**：在 Commerce 后台拿到的密钥（如 `a7033ac8-····-····-····-········e686`）**可以**用来生成支付。
- **认证方式**：请求头 `X-CC-Api-Key: <你的Commerce_API_Key>`。
- **创建支付**：
  - 端点：`POST https://api.commerce.coinbase.com/charges`
  - Body 示例：`name`, `description`, `pricing_type: 'fixed_price'`, `local_price: { amount, currency }`, `redirect_url`, `cancel_url`, `metadata`。
  - 响应里有 `data.hosted_url`，前端跳转该 URL 即可完成付款。
- **文档**：commerce.coinbase.com/docs、Commerce API 文档（CDP 文档里 Commerce 部分有 404，以 commerce.coinbase.com 为准）；官方 Node 库参考：coinbase-commerce-node（已归档）、commerce-node。

### MCP（Model Context Protocol）

- **Coinbase Developer MCP**：给 AI（如 Cursor）查 Coinbase 官方文档用，不能代替你的后端调 Commerce/CDP 接口，也不能代替 API Key。
- **Payments MCP**：文档里还提到 Payments MCP（x402/agent 支付），和「人类用 Commerce 付款」是不同能力。

### Commerce 与 CDP Payment Link 区别

| 项目       | Commerce API（你有的）     | CDP Business Payment Link（项目另一套） |
|------------|---------------------------|-----------------------------------------|
| 后台       | commerce.coinbase.com     | CDP Portal (portal.cdp.coinbase.com)    |
| 认证       | `X-CC-Api-Key`            | `Authorization: Bearer <JWT>`（CDP Key 换） |
| 创建支付   | `POST .../charges`        | `POST business.coinbase.com/.../payment-links` |
| 密钥来源   | Commerce 自定义集成       | CDP API 密钥 + Payment Link 权限        |

---

## 二、用你的 Commerce API 密钥在本项目里生成 payment

项目**已经接好了** Commerce API：

- **接口**：`POST /api/commerce/create`  
  Body：`{ x, y, amount_usd? }`（可选 `amount_usd`，默认 2）  
  返回：`{ ok: true, hosted_url, charge_id, receiptId }` → 前端跳转 `hosted_url` 完成支付。
- **验单**：`GET /api/commerce/verify?charge_id=xxx` 或 `?receipt_id=xxx`。

你只需要：

1. 在项目根目录 `.env` 里配置：
   ```bash
   COMMERCE_API_KEY=a7033ac8-你的完整密钥（不要带空格）
   ```
2. 重启本地或部署环境，再调用 `POST /api/commerce/create` 即可用该密钥**生成 payment**（即创建一个 Charge 并拿到 `hosted_url`）。

`.env.example` 里已增加 `COMMERCE_API_KEY` 的说明，可对照填写。
