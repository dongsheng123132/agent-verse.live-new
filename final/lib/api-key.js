import crypto from 'crypto'
import { dbQuery } from './db.js'

export function generateApiKeyRaw() {
  const raw = crypto.randomBytes(16).toString('hex')
  return `gk_${raw}`
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export async function generateApiKey(x, y) {
  const plaintext = generateApiKeyRaw()
  const keyHash = hashKey(plaintext)
  await dbQuery(
    `INSERT INTO cell_api_keys (key_hash, x, y)
     VALUES ($1, $2, $3)
     ON CONFLICT (x, y) DO UPDATE SET key_hash = EXCLUDED.key_hash, created_at = NOW()`,
    [keyHash, x, y]
  )
  return plaintext
}

export async function verifyApiKey(token) {
  if (!token || !token.startsWith('gk_')) return null
  const keyHash = hashKey(token)
  const res = await dbQuery(
    'SELECT x, y FROM cell_api_keys WHERE key_hash = $1 LIMIT 1',
    [keyHash]
  )
  if (!res.rowCount) return null
  return { x: res.rows[0].x, y: res.rows[0].y }
}
