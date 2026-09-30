/** Server-only: the one DB query the showcase needs (kept out of index.ts so that stays pure/client-safe). */
import { dbQuery } from '../db.js'
import { SHOWCASE_BOUNDS, logSkippedShowcase, resolveShowcase, type ResolvedShowcase } from './index'

/**
 * Which blocks are safe to show right now: looks up every owned cell inside the
 * showcase footprint, skips (and logs) any block that overlaps a real user's cell.
 */
export async function loadShowcase(): Promise<ResolvedShowcase> {
  const { x0, y0, x1, y1 } = SHOWCASE_BOUNDS
  const res = await dbQuery(
    `SELECT x, y, owner_address AS owner FROM grid_cells
     WHERE owner_address IS NOT NULL AND x BETWEEN $1 AND $2 AND y BETWEEN $3 AND $4`,
    [x0, x1, y0, y1]
  )
  const resolved = resolveShowcase(res.rows)
  logSkippedShowcase(resolved.skipped)
  return resolved
}
