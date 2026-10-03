/**
 * One purchase of several cells: when the cells form a FULL w x h rectangle they are stored as one block
 * (shared block_id, block_w / block_h, block_origin_x / block_origin_y = top-left), the single API key
 * belongs to the origin cell, and PUT /api/cells/update (which updates WHERE block_id = …) decorates the
 * whole block with that one key. Any other set of cells keeps the old behaviour: every cell is its own
 * 1x1 block and the key belongs to the first cell only.
 *
 * Pure and dependency-free: used by the server (bulk-purchase), the browser-wallet path and the prompt text.
 */

export interface CellCoord {
  x: number
  y: number
}

export interface BlockRect {
  /** top-left (origin) cell */
  ox: number
  oy: number
  w: number
  h: number
}

/** Row-major order (top to bottom, then left to right): the order cells are sent and listed in. */
export function sortCells<T extends CellCoord>(cells: readonly T[]): T[] {
  return [...cells].sort((a, b) => a.y - b.y || a.x - b.x)
}

/** The bounding rectangle when `cells` fills it completely (no gaps, no duplicates), else null. */
export function fullRectangle(cells: readonly CellCoord[]): BlockRect | null {
  if (cells.length === 0) return null
  const seen = new Set<string>()
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const c of cells) {
    if (!Number.isInteger(c.x) || !Number.isInteger(c.y)) return null
    seen.add(`${c.x},${c.y}`)
    if (c.x < minX) minX = c.x
    if (c.x > maxX) maxX = c.x
    if (c.y < minY) minY = c.y
    if (c.y > maxY) maxY = c.y
  }
  const w = maxX - minX + 1
  const h = maxY - minY + 1
  return seen.size === w * h && seen.size === cells.length ? { ox: minX, oy: minY, w, h } : null
}

export function blockIdFor(r: BlockRect): string {
  return `blk_${r.ox}_${r.oy}_${r.w}x${r.h}`
}

/** The cell the purchase's API key is stored for: the rectangle's origin, else the first cell. */
export function keyCellFor(cells: readonly CellCoord[]): CellCoord {
  const rect = fullRectangle(cells)
  if (rect) return { x: rect.ox, y: rect.oy }
  return { x: cells[0].x, y: cells[0].y }
}
