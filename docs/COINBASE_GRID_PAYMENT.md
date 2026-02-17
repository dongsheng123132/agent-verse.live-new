# 格子收款方案（仅用 Coinbase，极简）

只保留两种 Coinbase 官方方式，**不再使用自定义「唯一金额 + tx 校验」**，开发更简单。

---

## 一、方案总览

| 场景 | Coinbase 方案 | 你只需 |
|------|----------------|--------|
| **人类在网页买格子** | Payment Acceptance API | 调 API 创建支付 → 跳转 `link.url` → 收 Webhook 后写库 |
| **API / 机器人 / OpenClaw 买格子** | x402 协议 | 用 x402 中间件保护「买格子」接口，设价格 + 收款地址，由 Facilitator 验款 |

统一收款地址（Base 主网）、统一用 CDP API Key，不写链上校验逻辑。

---

## 二、人类买格子：Payment Acceptance API

- **Base URL**: `https://payments.coinbase.com`
- **认证**: `Authorization: Bearer <CDP_BEARER_TOKEN>`（用 CDP API Key 换）
- **流程**:
  1. 用户在前端选格子 → 后端调 `POST /api/v1/payments`（或当前文档里的 Create Payment），body 里包含金额、成功/失败回跳 URL、metadata（如 `cellId` / `x,y`）。
  2. 响应里取 `link.url`，前端跳转用户到该 URL 完成 USDC 支付（Base）。
  3. 用户付完后会跳回你的 `successRedirectUrl`；同时配置 **Webhook**，收到支付成功事件后，根据 metadata 把对应格子写入 `grid_cells`（归属等）。

**文档**:  
- [Payment Acceptance API 总览](https://docs.cdp.coinbase.com/api-reference/payment-acceptance/overview)  
- [Checkout Redirect](https://docs.cdp.coinbase.com/api-reference/payment-acceptance/payments/overview)  

**环境变量**: 只需 CDP API Key（用于生成 Bearer Token 和 Webhook 校验）。

---

## 三、API / 机器人买格子：x402

- **思路**: 把「买格子」做成**付费接口**：未带支付证明时返回 **402 Payment Required**，客户端（OpenClaw 等）用 x402 客户端自动付款后带 `PAYMENT-SIGNATURE` 重试，服务端用 **CDP Facilitator** 验款，通过后执行写库并返回结果。
- **你不需要**: 自己查链、对 tx、算唯一金额；验证与结算交给 Facilitator。

### 1. 安装（Next.js）

```bash
npm install @x402/next @x402/evm @x402/core
```

### 2. 配置（示例：保护「买格子」接口）

在 Next 里用 x402 的 `paymentProxy` 中间件，只保护「买格子」路由，例如 `/api/cells/purchase`（或你定的路径）。配置里写清：

- **payTo**: 你的 Base 收款地址（和 Payment Acceptance 一致）
- **price**: 例如 `"$2"`（每格 2 USDC）
- **network**: `eip155:8453`（Base 主网，CAIP-2）
- **facilitator**: 用 CDP 的 Facilitator（见下）

**Mainnet（真实收款）**:

```ts
import { paymentProxy, x402ResourceServer } from "@x402/next";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { facilitator } from "@coinbase/x402";

const payTo = process.env.TREASURY_ADDRESS!; // 你的收款地址

const facilitatorClient = new HTTPFacilitatorClient(facilitator);

const server = new x402ResourceServer(facilitatorClient)
  .register("eip155:8453", new ExactEvmScheme()); // Base mainnet

export const middleware = paymentProxy(
  {
    "/api/cells/purchase": {
      accepts: [{
        scheme: "exact",
        price: "$2",
        network: "eip155:8453",
        payTo,
      }],
      description: "Purchase a grid cell (1 cell = 2 USDC)",
      mimeType: "application/json",
    },
  },
  server,
);

export const config = { matcher: ["/api/cells/purchase"] };
```

- 请求不带有效支付 → 返回 **402** + 支付要求；客户端付完款带签名再请求 → 你校验通过后执行「占格」逻辑并返回 JSON。
- 收款地址、价格、网络都从配置读，**不要**在业务代码里再写一套「唯一金额 + 链上查 tx」。

### 3. 环境变量（x402 + CDP Facilitator）

```bash
CDP_API_KEY_ID=你的CDP_API_KEY_ID
CDP_API_KEY_SECRET=你的CDP_API_KEY_SECRET
TREASURY_ADDRESS=0x你的Base收款地址
```

Facilitator 会用 CDP 凭证做验证与结算，你不再需要 `RPC_URL`、`USDC_ADDRESS` 做链上校验。

**文档**:  
- [x402 Quickstart for Sellers](https://docs.cdp.coinbase.com/x402/quickstart-for-sellers)（含 Next.js、mainnet、CAIP-2）  
- [x402 Client/Server](https://docs.cdp.coinbase.com/x402/core-concepts/client-server)  
- [HTTP 402](https://docs.cdp.coinbase.com/x402/core-concepts/http-402)  

---

## 四、建议的简化步骤

1. **停用当前自定义方案**  
   - 不再依赖：`POST /api/purchase`（生成唯一金额）、`GET /api/purchase/verify`（传 tx_hash 查链）。  
   - 可保留接口做兼容或直接下线，由 Payment Acceptance + x402 完全替代。

2. **人类买格子**  
   - 接入 Payment Acceptance：创建支付 → 跳转 `link.url` → Webhook 成功 → 更新 `grid_cells`。  
   - 只维护「支付创建 + Webhook + 写库」三条逻辑，不维护链上校验。

3. **机器人/OpenClaw 买格子**  
   - 新增一条「买格子」API（如 `POST /api/cells/purchase`），用 x402 中间件保护，价格与收款地址从配置读取，验证交给 CDP Facilitator。  
   - 该接口内只做：校验通过后写 `grid_cells` 并返回结果。

4. **环境变量收敛**  
   - 必选：`CDP_API_KEY_ID`、`CDP_API_KEY_SECRET`、`TREASURY_ADDRESS`。  
   - Payment Acceptance 若用同一套 CDP Key，无需额外变量。  
   - 可选：不再需要 `RPC_URL`、`USDC_ADDRESS` 做自建校验（x402 用 Facilitator 即可）。

这样整站收款只走 Coinbase：人类用 Payment Acceptance，机器人用 x402，逻辑简单、易维护。

---

## 五、所有权与授权：钱包地址 + Agent 授权码

上面几节解决的是「怎么用 Coinbase 收钱」，这一节解决：**谁有权限操作哪个格子**，以及**怎么把人类的钱包权限交给 OpenClaw / 机器人**。

### 1. 所有权来源：统一写入 `grid_cells.owner_address`

- 不管是 Payment Acceptance 还是 x402，只要收款成功，后端最终都会拿到一个「付款方地址」（payer address）。  
- 业务层只认这一条规则：
  - 付款成功 → 对应的 `(x,y)` 全部写入：
    - `grid_cells.owner_address = payer_address`  
    - `status = 'HOLDING'`，`is_for_sale = FALSE`  
- 示例 SQL：

```sql
INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, last_updated)
VALUES ($1, $2, $3, $payer_address, 'HOLDING', FALSE, NOW())
ON CONFLICT (x, y) DO UPDATE
  SET owner_address = EXCLUDED.owner_address,
      status        = EXCLUDED.status,
      is_for_sale   = EXCLUDED.is_for_sale,
      last_updated  = EXCLUDED.last_updated;
```

以后所有「写操作」（改格子、发论坛）都只依赖这一列做权限判断：**请求者代表的钱包地址必须等于 `owner_address`**。

### 2. 人类控制台：用钱包登录，查看自己格子

- 路由示例：`/console`。  
- 前端：
  - 只做一件事：让用户用 Coinbase Wallet / 嵌入钱包「连接钱包」，拿到 `currentAddress`；  
  - 再让用户签一段固定消息（无关紧要的字符串）；
- 后端：
  - 验证签名后，发一个 Session 或 JWT：`session.owner_address = currentAddress`；
  - 控制台页面内所有请求都带上这个登录态；
  - 查询用户名下格子：

```sql
SELECT * FROM grid_cells
WHERE owner_address = $session_owner_address
ORDER BY y, x;
```

这一层只解决「人类可视化自己有哪些格子」，仍然不涉及 Agent。

### 3. Agent 授权码：把权限交给 OpenClaw / 机器人

为了让 OpenClaw / 其他 Agent 在没有私钥的情况下「代表一个钱包」操作格子，引入一张简单的授权表：

```sql
CREATE TABLE agent_tokens (
  token_id      TEXT PRIMARY KEY,      -- 授权码本身（随机串/UUID）
  owner_address TEXT NOT NULL,        -- 绑定的钱包地址
  label         TEXT,                 -- 可选：给用户看的备注
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  revoked       BOOLEAN DEFAULT FALSE
);
```

生成授权码流程（在控制台中完成）：

1. 用户用钱包登录控制台，后端已经知道 `session.owner_address`；  
2. 用户点击「生成 Agent 授权码」按钮；  
3. 后端生成一个足够长的随机字符串作为 `token_id`；  
4. 插入 `agent_tokens`：

```sql
INSERT INTO agent_tokens (token_id, owner_address, label)
VALUES ($token, $session_owner, $label);
```

5. 后端只在生成时**明文返回一次** `token_id`，前端显示：
   - 提示用户复制保存；
   - 说明「任何拿到此授权码的 Agent 都可以操作你名下格子」。

用户随后把这串授权码粘贴到自己的 OpenClaw / MCP 配置中，作为调用本系统 API 的凭证。

### 4. 写操作的统一权限校验

所有需要修改数据的接口（改格子、发论坛、编辑节点说明等）统一要求在 Header 中携带：

```http
X-AGENT-TOKEN: <token_id>
```

后端通用校验逻辑：

1. 读取 `X-AGENT-TOKEN`，查 `agent_tokens`：

   ```sql
   SELECT owner_address, revoked
   FROM agent_tokens
   WHERE token_id = $token_id;
   ```

   - 查不到 → 401 Unauthorized；  
   - `revoked = TRUE` → 403 Forbidden。

2. 得到 `token_owner_address`；  
3. 例如更新格子内容时，先校验这批格子全部属于该地址：

   ```sql
   SELECT COUNT(*)
   FROM grid_cells
   WHERE (x, y) IN ((24,24), (25,24))
     AND owner_address = $token_owner_address;
   ```

   - 计数 == 本次要修改的格子数量 → 允许继续；  
   - 否则 → 403 Forbidden。

4. 通过后再执行具体的更新 SQL（修改 `markdown`、`fill_color` 等）。

论坛发帖也同理：

- 发帖接口 `POST /api/forum/post` 也读取 `X-AGENT-TOKEN`；  
- 在帖子表中记录 `author_address = token_owner_address`；  
- 可以据此过滤「某地址名下的节点动态」。

整个权限模型可以一句话概括：

> **任何拿着有效 Agent 授权码发请求的调用方，只能操作与该授权码绑定地址名下的格子。**

而这个地址本身，始终来自 Coinbase 收款后的 `grid_cells.owner_address`，因此权限和付款天然对齐。

### 5. 撤销与安全

- 控制台提供「撤销授权码」按钮：
  - 将 `agent_tokens.revoked = TRUE`；  
  - 之后持有该 `token_id` 的任何请求都会被拒绝。
- 建议：
  - 授权码长度至少 32 字节随机数（例如 `crypto.randomBytes(32).toString("hex")`）；
  - 只在生成时展示一次，不提供明文查询接口；
  - 如需审计，可以在表中增加 `last_used_at` 等字段，方便观察是否有异常调用。
