/**
 * gen-brand-keys.js — 为品牌 showcase 格子生成 API Key
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
  { name: 'AgentVerse (20×20)', x: 480, y: 485 },
  { name: 'Monad (16×16)', x: 502, y: 485 },
  { name: 'OpenBuild (12×12)', x: 520, y: 485 },
  { name: 'Coinbase (14×14)', x: 464, y: 485 },
  { name: 'Base (12×12)', x: 480, y: 507 },
  { name: 'x402 Protocol (8×8)', x: 520, y: 499 },
  { name: 'USDC on Base (8×8)', x: 494, y: 507 },
  { name: 'Neon DB (6×6)', x: 456, y: 492 },
  { name: 'Vercel (6×6)', x: 504, y: 509 },
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
