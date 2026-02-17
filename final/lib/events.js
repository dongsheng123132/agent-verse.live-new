import { dbQuery } from './db.js'

export async function logEvent(type, { x, y, blockSize, owner, message }) {
  try {
    await dbQuery(
      'INSERT INTO grid_events (event_type, x, y, block_size, owner, message) VALUES ($1,$2,$3,$4,$5,$6)',
      [type, x ?? null, y ?? null, blockSize ?? null, owner ?? null, message ?? null]
    )
  } catch (e) {
    console.error('[logEvent]', e?.message)
  }
}
