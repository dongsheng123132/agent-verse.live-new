/**
 * seed-brands.js — 在 100×100 地图中放置品牌 Logo 展示
 * 用法: node scripts/seed-brands.js
 * 环境: DATABASE_URL（.env）; OVERWRITE=1 覆盖已有格子
 *
 * 布局 (保留区 0-15, showcase 区 42-57, 品牌区 20-80):
 *   AgentVerse 8×8  (30,20)   — 中心大展位
 *   Monad      6×6  (40,20)   — 右侧
 *   Coinbase   6×6  (20,20)   — 左侧
 *   OpenBuild  4×4  (48,20)   — 右上
 *   Base       4×4  (48,26)   — 右下
 *   x402       4×4  (20,28)   — 左下
 *   USDC       3×3  (54,20)   — 远右
 *   Neon DB    3×3  (54,24)   — 远右下
 *   Vercel     3×3  (54,28)   — 远右下
 */
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import pg from 'pg'

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
const OVERWRITE = process.env.OVERWRITE !== '0'

const brands = [
  // === AgentVerse 主场 8×8 ===
  {
    x: 30, y: 20, bw: 8, bh: 8,
    title: 'AgentVerse',
    summary: 'The AI Agent Metaverse · 100×100 Grid World',
    fill_color: '#22c55e',
    image_url: 'https://www.agent-verse.live/icon-512.png',
    content_url: 'https://www.agent-verse.live',
    markdown: `## Welcome to AgentVerse

The first x402-native AI Agent world map.

- **10,000 cells** on a 100×100 grid
- **$0.10 USDC** per cell
- **AI agents** buy, decorate, and trade cells
- **x402 protocol** — AI-native payments

Every cell is a home. Build yours.

→ [Buy a cell](https://www.agent-verse.live)
→ [Skill Doc](https://www.agent-verse.live/skill.md)`,
  },
  // === Monad 6×6 — 右侧 ===
  {
    x: 40, y: 20, bw: 6, bh: 6,
    title: 'Monad',
    summary: 'High-performance L1 blockchain',
    fill_color: '#682FFF',
    image_url: 'https://docs.monad.xyz/img/monad-logo.png',
    content_url: 'https://monad.xyz',
    markdown: `## Monad

High-performance EVM-compatible Layer 1 blockchain.

- **10,000 TPS** — parallel execution
- **1 second** block time
- **EVM compatible** — deploy existing Solidity contracts

→ [Learn more](https://monad.xyz)`,
  },
  // === Coinbase 6×6 — 左侧 ===
  {
    x: 22, y: 20, bw: 6, bh: 6,
    title: 'Coinbase',
    summary: 'Build the future of finance',
    fill_color: '#0052FF',
    image_url: 'https://www.coinbase.com/favicon.ico',
    content_url: 'https://www.coinbase.com/developer-platform',
    markdown: `## Coinbase Developer Platform

Build on-chain with confidence.

- **Base** — fast, low-cost L2
- **x402** — AI-native payment protocol
- **CDP SDK** — wallets, payments, commerce
- **AgentKit** — build AI agents that transact

→ [Developer Platform](https://www.coinbase.com/developer-platform)`,
  },
  // === OpenBuild 4×4 — 右上 ===
  {
    x: 48, y: 20, bw: 4, bh: 4,
    title: 'OpenBuild',
    summary: 'Web3 Builder Community & Education',
    fill_color: '#0E76FD',
    image_url: 'https://openbuild.xyz/favicon.ico',
    content_url: 'https://openbuild.xyz',
    markdown: `## OpenBuild

The Open-Source Web3 Builder Community.

- **Learn** Web3 development
- **Build** with bounties and hackathons
- **Connect** with developers worldwide

→ [Join OpenBuild](https://openbuild.xyz)`,
  },
  // === Base 4×4 — 右下 ===
  {
    x: 48, y: 26, bw: 4, bh: 4,
    title: 'Base',
    summary: 'Ethereum L2 · Built by Coinbase',
    fill_color: '#0052FF',
    image_url: 'https://www.base.org/favicon.ico',
    content_url: 'https://www.base.org',
    markdown: `## Base

Ethereum L2, incubated by Coinbase.

- **Low cost** — <$0.01 transactions
- **Fast** — 2 second block times
- **Secure** — built on Ethereum

→ [Build on Base](https://www.base.org)`,
  },
  // === x402 Protocol 4×4 — 左下 ===
  {
    x: 22, y: 28, bw: 4, bh: 4,
    title: 'x402 Protocol',
    summary: 'AI-native payment protocol',
    fill_color: '#f59e0b',
    image_url: '',
    content_url: 'https://www.x402.org',
    markdown: `## x402 Protocol

The HTTP payment standard for AI agents.

→ [x402.org](https://www.x402.org)`,
  },
  // === USDC 3×3 ===
  {
    x: 54, y: 20, bw: 3, bh: 3,
    title: 'USDC on Base',
    summary: 'Digital dollar on Ethereum L2',
    fill_color: '#2775ca',
    image_url: '',
    content_url: 'https://www.circle.com/usdc',
    markdown: `## USDC\n\nThe world's most trusted stablecoin.\n\n→ [circle.com/usdc](https://www.circle.com/usdc)`,
  },
  // === Neon DB 3×3 ===
  {
    x: 54, y: 24, bw: 3, bh: 3,
    title: 'Neon DB',
    summary: 'Serverless Postgres',
    fill_color: '#00e5a0',
    image_url: '',
    content_url: 'https://neon.tech',
    markdown: `## Neon\n\nServerless Postgres — branch, scale, and query.\n\n→ [neon.tech](https://neon.tech)`,
  },
  // === Vercel 3×3 ===
  {
    x: 54, y: 28, bw: 3, bh: 3,
    title: 'Vercel',
    summary: 'Frontend cloud platform',
    fill_color: '#ffffff',
    image_url: '',
    content_url: 'https://vercel.com',
    markdown: `## Vercel\n\nDeploy web projects with zero configuration.\n\n→ [vercel.com](https://vercel.com)`,
  },
]

async function main() {
  const client = await pool.connect()
  try {
    // Clean up old brand data from previous run
    console.log('Cleaning up old brand cells...')
    await client.query(
      "DELETE FROM grid_cells WHERE owner_address = $1 AND block_id LIKE 'brand_%'",
      [SYSTEM_OWNER]
    )
    console.log('✓ Old brand cells removed\n')

    for (const brand of brands) {
      const { x, y, bw, bh } = brand
      const blockId = `brand_${x}_${y}_${bw}x${bh}`

      console.log(`\n--- ${brand.title} at (${x},${y}) ${bw}×${bh} ---`)

      for (let dy = 0; dy < bh; dy++) {
        for (let dx = 0; dx < bw; dx++) {
          const cx = x + dx
          const cy = y + dy
          const cellId = cy * 100 + cx
          const isOrigin = dx === 0 && dy === 0

          // Check existing
          if (!OVERWRITE) {
            const check = await client.query(
              'SELECT owner_address FROM grid_cells WHERE x = $1 AND y = $2 AND owner_address IS NOT NULL',
              [cx, cy]
            )
            if (check.rowCount > 0) {
              console.log(`  skip (${cx},${cy}) — already owned`)
              continue
            }
          }

          const fill_color = isOrigin ? (brand.fill_color || null) : null
          const title = isOrigin ? (brand.title || null) : null
          const summary = isOrigin ? (brand.summary || null) : null
          const image_url = isOrigin ? (brand.image_url || null) : null
          const content_url = isOrigin ? (brand.content_url || null) : null
          const markdown = isOrigin ? (brand.markdown || null) : null

          await client.query(`
            INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, block_id, block_w, block_h, block_origin_x, block_origin_y,
              fill_color, title, summary, image_url, content_url, markdown, last_updated)
            VALUES ($1, $2, $3, $4, 'HOLDING', false, $5, $6, $7, $8, $9,
              $10, $11, $12, $13, $14, $15, NOW())
            ON CONFLICT (x, y) DO UPDATE SET
              owner_address = EXCLUDED.owner_address, block_id = EXCLUDED.block_id,
              block_w = EXCLUDED.block_w, block_h = EXCLUDED.block_h,
              block_origin_x = EXCLUDED.block_origin_x, block_origin_y = EXCLUDED.block_origin_y,
              fill_color = COALESCE(EXCLUDED.fill_color, grid_cells.fill_color),
              title = COALESCE(EXCLUDED.title, grid_cells.title),
              summary = COALESCE(EXCLUDED.summary, grid_cells.summary),
              image_url = COALESCE(EXCLUDED.image_url, grid_cells.image_url),
              content_url = COALESCE(EXCLUDED.content_url, grid_cells.content_url),
              markdown = COALESCE(EXCLUDED.markdown, grid_cells.markdown),
              last_updated = NOW()
          `, [cellId, cx, cy, SYSTEM_OWNER, blockId, bw, bh, x, y,
              fill_color, title, summary, image_url, content_url, markdown])
        }
      }
      console.log(`  ✓ ${bw * bh} cells written`)
    }

    console.log('\n✅ All brands seeded!')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => { console.error('❌ Error:', e); process.exit(1) })
