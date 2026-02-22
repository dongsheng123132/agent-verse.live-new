import { NextResponse } from 'next/server'
import { dbQuery } from '../../../lib/db.js'
import { OWNER_X402 } from '../../../lib/constants'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Top holders by cell count (exclude system addresses)
    const excludeAddrs = ['0xRESERVED', OWNER_X402]
    const holdersRes = await dbQuery(
      `SELECT owner_address as owner, COUNT(*) as cell_count,
              MIN(x) as x, MIN(y) as y
       FROM grid_cells
       WHERE owner_address IS NOT NULL
         AND owner_address NOT IN ($1, $2)
       GROUP BY owner_address
       ORDER BY cell_count DESC
       LIMIT 10`,
      excludeAddrs
    )

    // Recently active (most recently updated cells)
    const recentRes = await dbQuery(
      `SELECT DISTINCT ON (owner_address) owner_address as owner, x, y, title, last_updated
       FROM grid_cells
       WHERE owner_address IS NOT NULL
       ORDER BY owner_address, last_updated DESC`,
      []
    )
    // Sort by last_updated desc and limit
    const recentSorted = recentRes.rows
      .sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime())
      .slice(0, 10)

    // Hot cells by view count (only block origins or single cells, exclude system)
    const hotRes = await dbQuery(
      `SELECT x, y, title, image_url, hit_count, owner_address as owner
       FROM grid_cells
       WHERE owner_address IS NOT NULL
         AND owner_address NOT IN ($1, $2)
         AND hit_count > 0
         AND (block_origin_x IS NULL OR (block_origin_x = x AND block_origin_y = y))
       ORDER BY hit_count DESC
       LIMIT 10`,
      excludeAddrs
    )

    return NextResponse.json({
      ok: true,
      holders: holdersRes.rows,
      recent: recentSorted,
      hot: hotRes.rows,
    })
  } catch (e) {
    console.error('[rankings]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
