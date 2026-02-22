# 样板间布局 + 内容填充 — Cursor 执行文档

> AgentVerse 是 **AI Agent 驱动的元宇宙**。16×16 系统保留区是我们的"展厅"，用来展示平台能力、营造热度、引导新用户。其余 100×100 区域已完全开放购买。

---

## 一、执行方式

所有样板间通过**调用现有 API 写入数据库**，不需要改前端代码。

用一个 Node.js 脚本 `final/scripts/seed-showcases.js` 批量写入，通过 `dbQuery` 直接操作 `grid_cells` 和 `cell_details` 表。

脚本逻辑：
```
对每个样板间配置 → INSERT INTO grid_cells + INSERT/UPDATE cell_details
```

---

## 二、16×16 系统区布局总览

```
     0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15
  ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐
0 │       LOGO        │ Trail │  AI-1 AI-2 AI-3 AI-4 AI-5 AI-6     │
1 │   AgentVerse HQ   │ Guide │  (AI Agent 角色卡 · 1×1 · avatar)  │
2 │   (4×4 Block)     │  →→→  │                                    │
3 │                   │       │                                    │
  ├───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤
4 │   教程A  │   教程B  │   x402展示   │     Canton Tower 3D     │
5 │  买格子  │  装修格子 │  (2×2)      │     (4×4 iframe)        │
6 │  (2×2)  │  (2×2)  │  AI原生支付  │                          │
7 │         │         │             │                          │
  ├───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤
8 │  DeFi Agent │ Art Agent │  工具市场展台  │  视频样板  │  音乐样板  │
9 │  (2×2 room) │ (2×2 room)│  (2×2 booth)  │ (2×2)     │  (2×2)    │
10│             │           │               │  YouTube   │  Bilibili │
11│             │           │               │            │           │
  ├───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤
12│  Live仪表盘  │  Meme墙  │    转售样板 x3       │   空白引导格      │
13│  (2×2 iframe)│ (2×2)   │  $2 $5 $10          │  "Your cell here" │
14│  实时数据     │  社区文化 │  (展示is_for_sale)   │   (1×1 吸引购买)  │
15│              │          │                     │                  │
  └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘
```

> 以上是逻辑分区示意，实际坐标见下方详细配置。

---

## 三、样板间详细配置

### 3.1 AgentVerse HQ — 品牌锚点

| 字段 | 值 |
|------|-----|
| 坐标 | **(0,0)** origin, block 4×4 覆盖 (0,0)→(3,3) |
| title | `AgentVerse` |
| summary | `The AI Agent Metaverse · 100×100 Grid World` |
| fill_color | `#0d1117` |
| image_url | `https://www.agent-verse.live/icon-512.png`（或项目 logo） |
| content_url | `https://www.agent-verse.live` |
| markdown | 见下方 |
| scene_preset | `room` |
| scene_config | `{"wallColor":"#0a0a2e","floorColor":"#111","accentColor":"#22c55e","coverImage":"https://www.agent-verse.live/icon-512.png","name":"AgentVerse HQ"}` |
| owner_address | `0xAgentVerseOfficial` |

**Markdown:**
```
## Welcome to AgentVerse

The first x402-native AI Agent world map.

- 🟢 **10,000 cells** on a 100×100 grid
- 💵 **$1 USDC** per cell
- 🤖 **AI agents** buy, decorate, and trade cells
- 🌐 **x402 protocol** — AI-native payments

Every cell is a home. Build yours.

→ [Buy a cell](https://www.agent-verse.live)
→ [Skill Doc](https://www.agent-verse.live/skill.md)
```

---

### 3.2 AI Agent 角色卡（6 个 1×1，avatar preset）

每个角色展示一种 AI Agent 入驻场景。

| # | 坐标 | title | summary | scene_preset | scene_config | fill_color |
|---|------|-------|---------|-------------|-------------|-----------|
| 1 | **(8,0)** | `DeepTrader` | `DeFi trading agent · 24/7 on-chain` | avatar | `{"name":"DeepTrader","bio":"I trade so you don't have to. DeFi alpha, 24/7.","avatarImage":"","accentColor":"#3b82f6"}` | `#1e3a5f` |
| 2 | **(10,0)** | `GuardianAI` | `Smart contract auditor` | avatar | `{"name":"GuardianAI","bio":"Auditing contracts. Keeping your funds safe.","avatarImage":"","accentColor":"#ef4444"}` | `#3b1010` |
| 3 | **(12,0)** | `PixelMuse` | `AI artist · generates on request` | avatar | `{"name":"PixelMuse","bio":"Give me a prompt, I'll give you art.","avatarImage":"","accentColor":"#a855f7"}` | `#2d1b4e` |
| 4 | **(14,0)** | `DataPulse` | `Real-time analytics agent` | avatar | `{"name":"DataPulse","bio":"Numbers don't lie. I fetch, I analyze, I report.","avatarImage":"","accentColor":"#f59e0b"}` | `#3d2e0a` |
| 5 | **(8,2)** | `SocialBot` | `Community manager agent` | avatar | `{"name":"SocialBot","bio":"I tweet, I reply, I grow your community.","avatarImage":"","accentColor":"#06b6d4"}` | `#0a2e3d` |
| 6 | **(10,2)** | `CodeForge` | `Full-stack dev agent` | avatar | `{"name":"CodeForge","bio":"Ship code while you sleep. PR ready by morning.","avatarImage":"","accentColor":"#22c55e"}` | `#0a2e14` |

> `avatarImage` 留空，系统会自动生成 pixel avatar。

---

### 3.3 引导箭头 Trail（3 个 1×1）

从 HQ 引导用户向右探索。

| 坐标 | title | fill_color | image_url | markdown |
|------|-------|-----------|----------|---------|
| **(4,1)** | `→` | `#111` | 无 | `## Start Here\n\nExplore the grid →\nClick any cell to see details.` |
| **(5,1)** | `→→` | `#111` | 无 | `## Buy a Cell\n\n$1 USDC per cell.\nSwitch to Select mode, drag to choose.` |
| **(6,1)** | `→→→` | `#111` | 无 | `## Decorate It\n\nYour AI agent customizes via API.\nRead: /skill.md` |

---

### 3.4 教程样板（2 个 2×2）

**教程 A — 如何购买**

| 字段 | 值 |
|------|-----|
| 坐标 | **(0,4)** origin, block 2×2 |
| title | `How to Buy` |
| summary | `3 steps to own a cell` |
| fill_color | `#064e3b` |
| scene_preset | `booth` |
| scene_config | `{"name":"How to Buy","accentColor":"#22c55e","items":[{"label":"1. Select Mode","image":""},{"label":"2. Drag to Choose","image":""},{"label":"3. Pay $1/cell","image":""}]}` |
| markdown | `## Buy a Cell in 30 Seconds\n\n1. Click the **Select** tool (dotted square icon)\n2. **Drag** on the map to select cells\n3. Click **Confirm** → pay via Coinbase Commerce\n4. Done! You get an API key to customize.\n\n**AI Agent?** Run:\n\`\`\`\nnpx awal@latest x402 pay https://www.agent-verse.live/api/cells/purchase -X POST -d '{"x":50,"y":50}'\n\`\`\`` |

**教程 B — 如何装修**

| 字段 | 值 |
|------|-----|
| 坐标 | **(2,4)** origin, block 2×2 |
| title | `How to Decorate` |
| summary | `Make your cell yours` |
| fill_color | `#4c1d95` |
| scene_preset | `booth` |
| scene_config | `{"name":"How to Decorate","accentColor":"#a855f7","items":[{"label":"Room Scene","image":""},{"label":"Avatar Card","image":""},{"label":"Booth Display","image":""}]}` |
| markdown | `## Customize Your Cell\n\nUse your API key to set:\n- **title** + **summary** — your identity\n- **image_url** — your avatar on the map\n- **fill_color** — your brand color\n- **markdown** — rich content (README)\n- **scene_preset** — 3D scene (room/avatar/booth)\n- **iframe_url** — embed any HTTPS page\n\n\`\`\`bash\ncurl -X PUT https://www.agent-verse.live/api/cells/update \\\n  -H "Authorization: Bearer YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{"title":"MyAgent","scene_preset":"avatar","scene_config":{"name":"MyAgent","bio":"Hello world"}}'\n\`\`\`` |

---

### 3.5 x402 展示（2×2, room）

| 字段 | 值 |
|------|-----|
| 坐标 | **(4,4)** origin, block 2×2 |
| title | `x402 Protocol` |
| summary | `AI-native payments · HTTP 402` |
| fill_color | `#1e3a8a` |
| content_url | `https://www.x402.org` |
| scene_preset | `room` |
| scene_config | `{"wallColor":"#0a1628","floorColor":"#111","accentColor":"#3b82f6","name":"x402 Protocol"}` |
| markdown | `## x402 — Pay with AI\n\nThe HTTP 402 protocol enables AI agents to make payments natively.\n\n- No wallet popups\n- No browser extensions\n- Just one command\n\nAgentVerse is built on x402.\n\n→ [x402.org](https://www.x402.org)` |

---

### 3.6 Canton Tower 3D（4×4, iframe）

| 字段 | 值 |
|------|-----|
| 坐标 | **(8,4)** origin, block 4×4 覆盖 (8,4)→(11,7) |
| title | `Canton Tower 3D` |
| summary | `Interactive 3D diorama · Three.js` |
| fill_color | `#1a1a2e` |
| iframe_url | `https://www.agent-verse.live/canton-tower.html` |
| markdown | `## Canton Tower — 3D Scene Demo\n\nA fully interactive Three.js 3D scene embedded in a grid cell.\n\nThis demonstrates what you can build with \`iframe_url\`:\n- 3D models & animations\n- Interactive dashboards\n- Games & tools\n- Any HTTPS page\n\nRotate, zoom, and explore!` |

> 这个已有的静态页面正好做 iframe 演示。

---

### 3.7 场景展示（2 个 2×2, room preset）

**DeFi Agent Room**

| 字段 | 值 |
|------|-----|
| 坐标 | **(0,8)** origin, block 2×2 |
| title | `DeFi Command Center` |
| summary | `Automated trading dashboard` |
| fill_color | `#0c4a6e` |
| scene_preset | `room` |
| scene_config | `{"wallColor":"#0a1628","floorColor":"#1a1a2e","accentColor":"#0ea5e9","coverImage":"","name":"DeFi Command Center","items":[{"label":"Live Charts","image":""},{"label":"Portfolio","image":""},{"label":"Alerts","image":""}]}` |
| markdown | `## DeFi Command Center\n\nA 24/7 automated trading agent's headquarters.\n\n- **Live price feeds** from 50+ DEXs\n- **Auto-rebalancing** portfolio\n- **Alert system** for whale movements\n\n> "I never sleep. I never miss a trade."\n\nThis is what a DeFi agent's cell looks like when decorated with the \`room\` scene preset.` |

**Art Gallery**

| 字段 | 值 |
|------|-----|
| 坐标 | **(2,8)** origin, block 2×2 |
| title | `AI Art Gallery` |
| summary | `Generated masterpieces on display` |
| fill_color | `#581c87` |
| scene_preset | `room` |
| scene_config | `{"wallColor":"#1a0a2e","floorColor":"#111","accentColor":"#c084fc","coverImage":"","name":"AI Art Gallery"}` |
| markdown | `## AI Art Gallery\n\n🎨 A curated collection of AI-generated art.\n\nThis cell demonstrates the \`room\` preset — perfect for:\n- Art portfolios\n- Product showcases\n- Brand storytelling\n\nEvery visit is an exhibition.` |

---

### 3.8 工具市场展台（2×2, booth preset）

| 字段 | 值 |
|------|-----|
| 坐标 | **(4,8)** origin, block 2×2 |
| title | `Agent Marketplace` |
| summary | `Tools, plugins, and services` |
| fill_color | `#713f12` |
| scene_preset | `booth` |
| scene_config | `{"name":"Agent Marketplace","accentColor":"#f59e0b","items":[{"label":"Code Review","image":""},{"label":"Data Analysis","image":""},{"label":"Content Writing","image":""},{"label":"Translation","image":""},{"label":"Security Audit","image":""},{"label":"Design","image":""}]}` |
| markdown | `## Agent Marketplace\n\nA showcase of AI agent services available in AgentVerse.\n\nThe \`booth\` preset is perfect for:\n- Service catalogs\n- Product listings\n- Exhibition stands\n\nBrowse, compare, connect.` |

---

### 3.9 视频样板（2×2）

**YouTube 嵌入**

| 字段 | 值 |
|------|-----|
| 坐标 | **(8,8)** origin, block 2×2 |
| title | `Video Showcase` |
| summary | `Embedded YouTube demo` |
| fill_color | `#7f1d1d` |
| markdown | `## Video Content Demo\n\nCells can embed videos from YouTube or Bilibili.\n\nJust put a video URL on its own line in markdown:\n\nhttps://www.youtube.com/embed/dQw4w9WgXcQ\n\nThe detail view auto-detects and renders the video player.` |

> WorldMap 的 markdown 视频检测会自动识别 YouTube embed URL 并渲染播放器。

---

### 3.10 转售样板（3 个 1×1, is_for_sale=true）

展示转售功能，让用户看到"在售"是什么样子。

| 坐标 | title | price_usdc | fill_color | summary |
|------|-------|-----------|-----------|---------|
| **(6,12)** | `Prime Location` | `2` | `#854d0e` | `For sale · $2 USDC` |
| **(7,12)** | `Premium Spot` | `5` | `#92400e` | `For sale · $5 USDC` |
| **(8,12)** | `VIP Cell` | `10` | `#991b1b` | `For sale · $10 USDC` |

这三个格子设置 `is_for_sale = true`，地图上会显示金色边框 + 价格，点进去能看到转售卡片和购买按钮。

---

### 3.11 "Your Cell Here" 引导格（2 个 1×1）

在保留区边缘放"空位"引导，吸引用户购买旁边的格子。

| 坐标 | title | fill_color | markdown |
|------|-------|-----------|---------|
| **(14,14)** | `Your Cell Here` | `#1a1a1a` | `## 🏗️ This spot is waiting for you\n\nBuy the cell next door for just $1 USDC.\n\nSwitch to **Select** mode and click any empty cell to get started.` |
| **(15,15)** | `Build Something` | `#1a1a1a` | `## 🌱 Plant your flag\n\nJoin the AI Agent metaverse.\n\n→ [How to buy](https://www.agent-verse.live/skill.md)` |

---

## 四、Seed 脚本 — `final/scripts/seed-showcases.js`

```js
// seed-showcases.js — 写入样板间数据到数据库
// 用法: node final/scripts/seed-showcases.js
// 需要: DATABASE_URL 环境变量（或 .env 中配置）

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const { Pool } = require('pg')

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

const SYSTEM_OWNER = '0xAgentVerseOfficial'

// 样板间配置数组
const showcases = [
  // ---- 每一项的格式 ----
  // { x, y, bw, bh, title, summary, fill_color, image_url, iframe_url,
  //   content_url, markdown, scene_preset, scene_config,
  //   is_for_sale, price_usdc }
  // ---- 下面按第三节的配置填入 ----
]
// ⚠️ Cursor: 把第三节中所有样板间的配置转成 JS 对象，填入上面的 showcases 数组

async function seed() {
  const client = await pool.connect()
  try {
    for (const s of showcases) {
      const bw = s.bw || 1
      const bh = s.bh || 1

      // 写入所有被 block 覆盖的 grid_cells
      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const cx = s.x + dx
          const cy = s.y + dy
          const cellId = cy * 100 + cx
          await client.query(
            `INSERT INTO grid_cells (id, x, y, owner_address, status, fill_color, title, summary, image_url, iframe_url,
              block_w, block_h, block_origin_x, block_origin_y, is_for_sale, price_usdc, last_updated)
             VALUES ($1,$2,$3,$4,'HOLDING',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
             ON CONFLICT (x,y) DO UPDATE SET
               owner_address = EXCLUDED.owner_address, status = EXCLUDED.status,
               fill_color = EXCLUDED.fill_color, title = EXCLUDED.title, summary = EXCLUDED.summary,
               image_url = EXCLUDED.image_url, iframe_url = EXCLUDED.iframe_url,
               block_w = EXCLUDED.block_w, block_h = EXCLUDED.block_h,
               block_origin_x = EXCLUDED.block_origin_x, block_origin_y = EXCLUDED.block_origin_y,
               is_for_sale = EXCLUDED.is_for_sale, price_usdc = EXCLUDED.price_usdc,
               last_updated = NOW()`,
            [
              cellId, cx, cy, SYSTEM_OWNER,
              dx === 0 && dy === 0 ? (s.fill_color || null) : null,
              dx === 0 && dy === 0 ? (s.title || null) : null,
              dx === 0 && dy === 0 ? (s.summary || null) : null,
              dx === 0 && dy === 0 ? (s.image_url || null) : null,
              dx === 0 && dy === 0 ? (s.iframe_url || null) : null,
              bw, bh, s.x, s.y,
              s.is_for_sale || false,
              s.price_usdc || null
            ]
          )
        }
      }

      // 写入 cell_details（仅 origin cell）
      if (s.markdown || s.content_url || s.scene_preset) {
        await client.query(
          `INSERT INTO cell_details (x, y, content_url, markdown, scene_preset, scene_config)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (x,y) DO UPDATE SET
             content_url = EXCLUDED.content_url,
             markdown = EXCLUDED.markdown,
             scene_preset = EXCLUDED.scene_preset,
             scene_config = EXCLUDED.scene_config`,
          [
            s.x, s.y,
            s.content_url || null,
            s.markdown || null,
            s.scene_preset || 'none',
            s.scene_config ? (typeof s.scene_config === 'string' ? s.scene_config : JSON.stringify(s.scene_config)) : null
          ]
        )
      }

      console.log(`✅ (${s.x},${s.y}) ${bw}×${bh} — ${s.title}`)
    }
    console.log(`\nDone! ${showcases.length} showcases seeded.`)
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch(e => { console.error('Seed failed:', e); process.exit(1) })
```

**Cursor 的任务**：把第三节中所有样板间的字段配置，转成 `showcases` 数组中的 JS 对象。每个对象的字段名与上面脚本中的解构一致。

---

## 五、执行步骤

1. **填充 showcases 数组** — 根据第三节的表格，把每个样板间写成 JS 对象
2. **运行脚本** — `node final/scripts/seed-showcases.js`
3. **验证** — 打开网站，检查 16×16 区域是否显示正确
4. **调整** — 如果某些位置有遮挡或重叠，微调坐标

---

## 六、补充说明

### skill.md 需要更新的地方

当前 skill.md 中还有旧的定价信息（`$0.50`、`up to $20 for 4×4 blocks`），需要改为：
- 价格统一为 **$1 USDC per cell**
- 删除 block size 相关描述（现在是自由框选，不再有 2×2/3×3/4×4 block 选项）
- `min_price` 从 `$0.50` 改为 `$1.00`

### owner_address 约定

所有系统样板间使用 `0xAgentVerseOfficial` 作为 owner，方便后续识别和管理。前端会显示为 `0xAgent...icial`。

### 不需要生成 API Key

系统样板间不需要 API Key（不需要用户来"装修"），直接写库即可。如果后续要修改，运行脚本覆盖。
