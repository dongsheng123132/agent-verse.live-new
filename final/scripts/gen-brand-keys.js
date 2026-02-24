/**
 * gen-brand-keys.js — 为品牌 showcase 格子生成 API Key
 * 用法: node scripts/gen-brand-keys.js
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

function genKey() {
  return 'gk_' + crypto.randomBytes(16).toString('hex')
}
function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

const origins = [
  { name: 'AgentVerse (8×8)',      x: 30, y: 20 },
  { name: 'Monad (6×6)',           x: 40, y: 20 },
  { name: 'Coinbase (6×6)',        x: 22, y: 20 },
  { name: 'OpenBuild (4×4)',       x: 48, y: 20 },
  { name: 'Base (4×4)',            x: 48, y: 26 },
  { name: 'x402 Protocol (4×4)',   x: 22, y: 28 },
  { name: 'USDC on Base (3×3)',    x: 54, y: 20 },
  { name: 'Neon DB (3×3)',         x: 54, y: 24 },
  { name: 'Vercel (3×3)',          x: 54, y: 28 },
]

const client = await pool.connect()
try {
  console.log('=== API Keys for Brand Cells ===\n')
  for (const o of origins) {
    const key = genKey()
    const hash = hashKey(key)
    await client.query(
      `INSERT INTO cell_api_keys (key_hash, x, y)
       VALUES ($1, $2, $3)
       ON CONFLICT (x, y) DO UPDATE SET key_hash = EXCLUDED.key_hash, created_at = NOW()`,
      [hash, o.x, o.y]
    )
    console.log(`${o.name} (${o.x},${o.y}): ${key}`)
  }
  console.log('\n=== Done ===')
} finally {
  client.release()
  await pool.end()
}
