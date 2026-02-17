# Agent 打款说明 · 发给 AI 执行

本文档可直接复制给 Claude CLI、Kimi CLI、Cursor 等 AI，让其代为执行格子购买付款。

---

## 一、前提：Awal 注册/登录（纯 CLI，无需浏览器）

Awal 支持**纯终端认证**，使用邮箱 OTP，**不需要打开浏览器**。Claude CLI、Kimi CLI 等可直接执行。

### 1. 注册/登录流程（两步 OTP）

```bash
# 第 1 步：发起登录，系统发 6 位 OTP 到邮箱
npx awal@latest auth login 你的邮箱@example.com
# 终端输出 flowId，记下

# 第 2 步：验证 OTP（把 flowId 和邮箱里的 6 位码换上）
npx awal@latest auth verify <flowId> <6位验证码>
```

**文档**：[Coinbase Authenticate](https://docs.cdp.coinbase.com/agentic-wallet/skills/authenticate)

### 2. 确认登录与余额

```bash
npx awal@latest status
npx awal@latest balance
```

余额需有足够 USDC（Base 网络）。若无余额，可先 Buy/Swap 入 USDC。

### 3. 替代方案（若不想用 Awal）

- **方案 A**：用「用 Coinbase 付款」按钮，跳转 Commerce 托管页人类付款
- **方案 B**：用「手动 Agent 打款」——MetaMask / Coinbase Wallet 转 USDC 到 Recipient，金额填 Amount，付完后调用 `POST /api/grid-shop/confirm-cell` 确认归属

---

## 二、打款方式一：aw send（推荐，简单）

直接用 Agentic Wallet 把 USDC 打到指定地址，金额填「格子说明」里的 Amount。

### 执行命令（AI 可按下面模板执行）

```
任务：购买格子 (x, y)，按下方参数打款。

Recipient: 0xe6EA7c31A85A1f42DFAc6C49155bE90722246890
Amount: <见格子弹窗，如 0.0944> USDC
Verification: <见格子弹窗，如 .0944>

请执行：
npx awal@latest send <Amount> 0xe6EA7c31A85A1f42DFAc6C49155bE90722246890 --chain base
```

**示例**（购买某格，Amount=0.0944）：

```bash
npx awal@latest send 0.0944 0xe6EA7c31A85A1f42DFAc6C49155bE90722246890 --chain base
```

### 金额格式

- 支持 `0.0944`、`$0.0944`、`1`（表示 1 USDC）
- 必须与格子说明中的 Amount **完全一致**（含小数）

### 打款后

- 钱包会从 Agent 地址转 USDC 到 Recipient
- 网站需**手动确认归属**：调用 `POST /api/grid-shop/confirm-cell`，或站内人工根据链上记录标记

---

## 三、打款方式二：x402 pay-for-service（自动验款）★ 推荐

格子接口支持 x402，Agent 调用后系统自动收 USDC 并验款，付完即写库，无需人工确认。

### 1. 在 grid-shop 页复制 AI Skill

打开 **http://你的域名/grid-shop**，点击任意格子 → 弹窗内**「x402 AI Skill · 复制给 AI 执行」**区块 → 点 **[复制整段给 AI]**，粘贴给 Claude / Kimi / Cursor 等执行即可。

- 金额、坐标、API 地址会自动生成，无需手填
- 设 `.env` 中 `PURCHASE_PRICE_USD=0.02` 可与 grid-shop 测试价一致

### 2. 手动执行命令

```bash
npx awal@latest x402 pay https://你的域名/api/cells/purchase -X POST -d '{"x":24,"y":19}'
```

- 首次请求返回 402，Agent 自动付 USDC 后重试
- 价格由 `.env` 的 `PURCHASE_PRICE_USD` 决定（默认 0.02）

---

## 四、发给 AI 的完整执行模板

复制以下内容发给 Claude / Kimi / Cursor 等：

```
请帮我用 Coinbase Agentic Wallet 购买格子 (24, 19)。

付款参数：
- Recipient: 0xe6EA7c31A85A1f42DFAc6C49155bE90722246890
- Amount: 0.0944 USDC（必须精确）
- 网络: Base

步骤：
1. 若未登录，执行 npx awal@latest auth login 我的邮箱，完成 OTP 验证。
2. 执行打款：
   npx awal@latest send 0.0944 0xe6EA7c31A85A1f42DFAc6C49155bE90722246890 --chain base
3. 确认交易成功，把 tx hash 或结果告诉我。
```

**每次购买不同格子时**：把 `(24, 19)` 和 `Amount` 换成该格子的实际坐标和金额。

---

## 五、Claude CLI / Kimi CLI 能否执行？

- **能**：Awal 支持纯 CLI 认证（邮箱 OTP，无需浏览器），Claude CLI、Kimi CLI 等可直接执行 `auth login`、`auth verify`、`send`、`x402 pay`。
- **流程**：AI 执行 `auth login 邮箱` → 用户收 OTP 后告知 AI 或 AI 读邮箱 → AI 执行 `auth verify flowId 6位码` → 再执行 `x402 pay` 或 `send`。

---

## 六、Awal 何时可以成功支付？

- **可支付**：Awal 已 `auth login` + `auth verify` 成功，钱包有 USDC 余额，API 地址（如 `/api/cells/purchase`）可访问，且 Coinbase Facilitator（CDP x402 服务）返回正常 JSON。
- **常见失败**：返回 HTML 而非 JSON，通常是 Coinbase 服务异常、网络问题、或本地 localhost 在云端 AI 不可达。此时请用「手动转账」或「Commerce 人类付款」。

---

## 七、官方文档（复制给 AI 自查）

- 认证（auth login/verify）：https://docs.cdp.coinbase.com/agentic-wallet/skills/authenticate
- x402 pay 命令：https://docs.cdp.coinbase.com/agentic-wallet/skills/pay-for-service
- x402 协议概览：https://docs.cdp.coinbase.com/x402/welcome
- Agentic Wallet 介绍：https://docs.cdp.coinbase.com/agentic-wallet/welcome
