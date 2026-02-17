import { NextResponse } from 'next/server'
import { dbQuery } from '../../../lib/db.js'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100)

    const res = await dbQuery(
      'SELECT id, event_type, x, y, block_size, owner, message, created_at FROM grid_events ORDER BY created_at DESC LIMIT $1',
      [limit]
    )

    return NextResponse.json({ ok: true, events: res.rows })
  } catch (e) {
    console.error('[events]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
