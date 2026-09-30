import { NextResponse } from 'next/server'
import { dbQuery } from '../../../lib/db.js'
import { ensureSchema } from '../../../lib/schema'
import { findShowcaseBlockAt, isInShowcaseBounds, isRealUserOwner, virtualCellDetail } from '../../../lib/showcase/index'
import { loadShowcase } from '../../../lib/showcase/server'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const x = Number(url.searchParams.get('x'))
    const y = Number(url.searchParams.get('y'))

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return NextResponse.json({ ok: false, error: 'invalid_request', message: 'x, y required' }, { status: 400 })
    }

    if (process.env.DATABASE_URL) {
      await ensureSchema()
    }

    const res = await dbQuery(
      `SELECT id, x, y, owner_address as owner, fill_color as color,
              title, summary, image_url, iframe_url, content_url, markdown,
              block_id, block_w, block_h, block_origin_x, block_origin_y,
              hit_count, last_updated, scene_preset, scene_config,
              is_for_sale, price_usdc,
              service_url, service_method, service_desc, service_category,
              probe_status, probe_accepts, probed_at, evidence
       FROM grid_cells WHERE x = $1 AND y = $2`,
      [x, y]
    )

    // Monad Metropolis showcase: a coordinate inside an active virtual block answers with the
    // block — unless a real user owns this very cell (real users always win). "Active" means
    // the block overlaps no real user's cell (lib/showcase/server.ts loadShowcase).
    if (process.env.DATABASE_URL && Number.isInteger(x) && Number.isInteger(y) && isInShowcaseBounds(x, y) && findShowcaseBlockAt(x, y)) {
      const dbRow = res.rows[0]
      if (!(dbRow && isRealUserOwner(dbRow.owner))) {
        const { active } = await loadShowcase()
        const block = findShowcaseBlockAt(x, y, active)
        if (block) return NextResponse.json({ ok: true, cell: virtualCellDetail(block, x, y) })
      }
    }

    if (!res.rowCount) {
      return NextResponse.json({ ok: true, cell: null })
    }

    // Fire-and-forget hit increment on block origin (or single cell)
    if (res.rows[0].owner) {
      const row = res.rows[0]
      const ox = row.block_origin_x ?? x
      const oy = row.block_origin_y ?? y
      dbQuery('UPDATE grid_cells SET hit_count = COALESCE(hit_count, 0) + 1 WHERE x = $1 AND y = $2', [ox, oy]).catch(() => {})
    }

    return NextResponse.json({ ok: true, cell: res.rows[0] })
  } catch (e) {
    console.error('[cells]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
