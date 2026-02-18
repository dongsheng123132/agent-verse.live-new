import { NextResponse } from 'next/server'
import { dbQuery } from '../../../lib/db.js'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const q = (url.searchParams.get('q') || '').trim()

    if (!q) {
      return NextResponse.json({ ok: false, error: 'missing_query' }, { status: 400 })
    }

    // Try FTS first, fallback to ILIKE
    let rows = []
    try {
      const ftsRes = await dbQuery(
        `SELECT x, y, owner_address as owner, fill_color as color, title, summary, image_url,
                block_id, block_w, block_h, block_origin_x, block_origin_y,
                hit_count,
                ts_rank(to_tsvector('simple', COALESCE(markdown,'')), plainto_tsquery('simple', $1)) as rank
         FROM grid_cells
         WHERE owner_address IS NOT NULL
           AND to_tsvector('simple', COALESCE(markdown,'')) @@ plainto_tsquery('simple', $1)
         ORDER BY rank DESC LIMIT 50`,
        [q]
      )
      rows = ftsRes.rows
    } catch {
      // FTS index may not exist yet
    }

    // ILIKE fallback if FTS returned nothing
    if (rows.length === 0) {
      const pattern = `%${q}%`
      const likeRes = await dbQuery(
        `SELECT x, y, owner_address as owner, fill_color as color, title, summary, image_url,
                block_id, block_w, block_h, block_origin_x, block_origin_y,
                hit_count
         FROM grid_cells
         WHERE owner_address IS NOT NULL
           AND (title ILIKE $1 OR summary ILIKE $1 OR markdown ILIKE $1 OR owner_address ILIKE $1)
         ORDER BY last_updated DESC LIMIT 50`,
        [pattern]
      )
      rows = likeRes.rows
    }

    return NextResponse.json({ ok: true, results: rows, count: rows.length })
  } catch (e) {
    console.error('[search]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
