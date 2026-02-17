import { NextResponse } from 'next/server'
import { dbQuery } from '../../../lib/db.js'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Top holders by cell count
    const holdersRes = await dbQuery(
      `SELECT owner_address as owner, COUNT(*) as cell_count
       FROM grid_cells
       WHERE owner_address IS NOT NULL
       GROUP BY owner_address
       ORDER BY cell_count DESC
       LIMIT 10`,
      []
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

    return NextResponse.json({
      ok: true,
      holders: holdersRes.rows,
      recent: recentSorted
    })
  } catch (e) {
    console.error('[rankings]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
