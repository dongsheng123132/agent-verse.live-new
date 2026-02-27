/**
 * seed-clawme.js — 在地图上放置 ClawMe 展示格
 * 用法: node scripts/seed-clawme.js
 */
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import pg from 'pg'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, '..', '.env')
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}

const { Pool } = pg
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const SYSTEM_OWNER = '0xAgentVerseOfficial'

const ORIGIN_X = 66
const ORIGIN_Y = 16
const BW = 8
const BH = 8
const BLOCK_ID = `brand_${ORIGIN_X}_${ORIGIN_Y}_${BW}x${BH}`

const cellData = {
  title: '🦞 ClawMe',
  summary: 'AI Agent Execution Layer · 替你动手，不替你做主',
  fill_color: '#FF6B35',
  image_url: 'https://www.agent-verse.live/logos/clawme.svg',
  content_url: 'https://www.clawme.net/',
  iframe_url: 'https://www.clawme.net/',
  markdown: `## 🦞 ClawMe — AI Agent 执行层

The Execution Layer for AI Agents.
替你动手，不替你做主。

### What is ClawMe?

ClawMe 是 AI Agent 与用户设备之间的桥梁。AI 发出指令，ClawMe 帮你执行。

### 7 种指令类型
- **remind** — 设置提醒
- **open_url** — 打开网页
- **compose_tweet** — 发推文
- **compose_email** — 写邮件
- **fill_form** — 填表单
- **click** — 点击操作
- **extract** — 提取内容

### 特点
- 🔌 Chrome 插件 + 手机 PWA
- 🔐 用户确认后执行，保留控制权
- 📋 多步骤工作流顺序执行
- 🌐 开源 (AGPL-3.0)

→ [Try ClawMe](https://www.clawme.net/)`,
}

function genKey() { return 'gk_' + crypto.randomBytes(16).toString('hex') }
function hashKey(key) { return crypto.createHash('sha256').update(key).digest('hex') }

async function main() {
  const client = await pool.connect()
  try {
    console.log(`Seeding ClawMe at (${ORIGIN_X},${ORIGIN_Y}) ${BW}×${BH}...`)

    for (let dy = 0; dy < BH; dy++) {
      for (let dx = 0; dx < BW; dx++) {
        const cx = ORIGIN_X + dx
        const cy = ORIGIN_Y + dy
        const cellId = cy * 100 + cx
        const isOrigin = dx === 0 && dy === 0

        await client.query(`
          INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, block_id, block_w, block_h, block_origin_x, block_origin_y,
            fill_color, title, summary, image_url, content_url, iframe_url, markdown, last_updated)
          VALUES ($1, $2, $3, $4, 'HOLDING', false, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, $16, NOW())
          ON CONFLICT (x, y) DO UPDATE SET
            owner_address = EXCLUDED.owner_address, block_id = EXCLUDED.block_id,
            block_w = EXCLUDED.block_w, block_h = EXCLUDED.block_h,
            block_origin_x = EXCLUDED.block_origin_x, block_origin_y = EXCLUDED.block_origin_y,
            fill_color = COALESCE(EXCLUDED.fill_color, grid_cells.fill_color),
            title = COALESCE(EXCLUDED.title, grid_cells.title),
            summary = COALESCE(EXCLUDED.summary, grid_cells.summary),
            image_url = COALESCE(EXCLUDED.image_url, grid_cells.image_url),
            content_url = COALESCE(EXCLUDED.content_url, grid_cells.content_url),
            iframe_url = COALESCE(EXCLUDED.iframe_url, grid_cells.iframe_url),
            markdown = COALESCE(EXCLUDED.markdown, grid_cells.markdown),
            last_updated = NOW()
        `, [
          cellId, cx, cy, SYSTEM_OWNER, BLOCK_ID, BW, BH, ORIGIN_X, ORIGIN_Y,
          isOrigin ? cellData.fill_color : null,
          isOrigin ? cellData.title : null,
          isOrigin ? cellData.summary : null,
          isOrigin ? cellData.image_url : null,
          isOrigin ? cellData.content_url : null,
          isOrigin ? cellData.iframe_url : null,
          isOrigin ? cellData.markdown : null,
        ])
      }
    }
    console.log(`✅ ${BW * BH} cells written`)

    const key = genKey()
    const hash = hashKey(key)
    await client.query(
      `INSERT INTO cell_api_keys (key_hash, x, y)
       VALUES ($1, $2, $3)
       ON CONFLICT (x, y) DO UPDATE SET key_hash = EXCLUDED.key_hash, created_at = NOW()`,
      [hash, ORIGIN_X, ORIGIN_Y]
    )
    console.log(`\n🔑 API Key: ${key}`)
    console.log(`   Origin: (${ORIGIN_X}, ${ORIGIN_Y})`)
    console.log(`   Size: ${BW}×${BH} = ${BW * BH} cells`)

  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1) })
