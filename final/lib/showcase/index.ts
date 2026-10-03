/**
 * Monad Metropolis showcase — logic over the static config in ./metropolis.ts.
 * Pure functions only (no DB, no Next); ./server.ts adds the one DB query.
 *
 * Rules:
 *  - The showcase is virtual: it is merged into API responses, never stored.
 *  - Real users always win. A block that overlaps a cell owned by a real user
 *    (anyone other than 0xRESERVED / 0xAgentVerseOfficial) is skipped whole and
 *    logged; all other blocks still show.
 *  - Cells covered by ANY configured block can never be bought
 *    (isShowcaseReserved is static: the union of all configured blocks).
 */
import { COLS, ROWS } from '../../app/types'
import type { Cell } from '../../app/types'
import { SHOWCASE_BLOCK_SPECS, SHOWCASE_ORIGIN, SHOWCASE_OWNER, type ShowcaseBlockSpec } from './metropolis'

export { SHOWCASE_OWNER } from './metropolis'

/** A configured block with absolute map coordinates. */
export interface ShowcaseBlock extends ShowcaseBlockSpec {
  x: number
  y: number
}

export const SHOWCASE_BLOCKS: ShowcaseBlock[] = SHOWCASE_BLOCK_SPECS.map((s) => ({
  ...s,
  x: SHOWCASE_ORIGIN.x + s.rx,
  y: SHOWCASE_ORIGIN.y + s.ry,
}))

/** Inclusive bounding box of every configured block. */
export const SHOWCASE_BOUNDS = SHOWCASE_BLOCKS.reduce(
  (b, blk) => ({
    x0: Math.min(b.x0, blk.x),
    y0: Math.min(b.y0, blk.y),
    x1: Math.max(b.x1, blk.x + blk.w - 1),
    y1: Math.max(b.y1, blk.y + blk.h - 1),
  }),
  { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
)

/** Owners whose cells a showcase block may cover (official placeholders, not people). */
const OVERRIDABLE_OWNERS = new Set(['0xreserved', '0xagentverseofficial'])

export function isRealUserOwner(owner: string | null | undefined): boolean {
  return !!owner && !OVERRIDABLE_OWNERS.has(owner.toLowerCase())
}

export function blockContains(b: ShowcaseBlock, x: number, y: number): boolean {
  return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h
}

export function isInShowcaseBounds(x: number, y: number): boolean {
  return x >= SHOWCASE_BOUNDS.x0 && x <= SHOWCASE_BOUNDS.x1 && y >= SHOWCASE_BOUNDS.y0 && y <= SHOWCASE_BOUNDS.y1
}

export function findShowcaseBlockAt(x: number, y: number, blocks: ShowcaseBlock[] = SHOWCASE_BLOCKS): ShowcaseBlock | undefined {
  if (blocks === SHOWCASE_BLOCKS && !isInShowcaseBounds(x, y)) return undefined
  return blocks.find((b) => blockContains(b, x, y))
}

/**
 * The single "may this coordinate be bought?" test for the showcase: true for
 * every cell covered by any configured block, whether or not the block is
 * currently displayed. Static and synchronous, so purchase routes can use it
 * before they ever issue a 402.
 */
export function isShowcaseReserved(x: number, y: number): boolean {
  return findShowcaseBlockAt(x, y) !== undefined
}

// ---------------------------------------------------------------------------
// Runtime validation against real users
// ---------------------------------------------------------------------------

export interface OwnedCellLike {
  x: number
  y: number
  owner?: string | null
}

export interface ResolvedShowcase {
  active: ShowcaseBlock[]
  skipped: { block: ShowcaseBlock; conflicts: { x: number; y: number }[] }[]
}

/**
 * Split the configured blocks into those safe to show and those that overlap a
 * real user's cell. `owned` may contain any owned cells (only real users'
 * count; 0xRESERVED / 0xAgentVerseOfficial rows are ignored — blocks may cover them).
 */
export function resolveShowcase(owned: readonly OwnedCellLike[], blocks: ShowcaseBlock[] = SHOWCASE_BLOCKS): ResolvedShowcase {
  const users = new Set<string>()
  for (const c of owned) {
    if (isRealUserOwner(c.owner)) users.add(`${c.x},${c.y}`)
  }
  const active: ShowcaseBlock[] = []
  const skipped: ResolvedShowcase['skipped'] = []
  for (const block of blocks) {
    const conflicts: { x: number; y: number }[] = []
    for (let dy = 0; dy < block.h; dy++) {
      for (let dx = 0; dx < block.w; dx++) {
        if (users.has(`${block.x + dx},${block.y + dy}`)) conflicts.push({ x: block.x + dx, y: block.y + dy })
      }
    }
    if (conflicts.length === 0) active.push(block)
    else skipped.push({ block, conflicts })
  }
  return { active, skipped }
}

const loggedSkips = new Set<string>()

/** Log each skipped block once per distinct conflict set (not once per request). */
export function logSkippedShowcase(skipped: ResolvedShowcase['skipped'], log: (msg: string) => void = console.warn): void {
  for (const { block, conflicts } of skipped) {
    const sig = `${block.id}|${conflicts.map((c) => `${c.x},${c.y}`).join(';')}`
    if (loggedSkips.has(sig)) continue
    loggedSkips.add(sig)
    const sample = conflicts.slice(0, 3).map((c) => `(${c.x},${c.y})`).join(' ')
    log(
      `[showcase] skipping block "${block.id}" at (${block.x},${block.y}) ${block.w}x${block.h}: ` +
        `overlaps ${conflicts.length} real-user cell(s), e.g. ${sample}`
    )
  }
}

/** Test hook: forget which skips were already logged. */
export function resetShowcaseSkipLog(): void {
  loggedSkips.clear()
}

// ---------------------------------------------------------------------------
// Virtual cells
// ---------------------------------------------------------------------------

function baseCell(block: ShowcaseBlock, x: number, y: number): Cell {
  const isOrigin = x === block.x && y === block.y
  const cell: Cell = {
    id: y * COLS + x,
    x,
    y,
    owner: SHOWCASE_OWNER,
    color: block.color,
    title: block.title,
    block_id: `showcase:${block.id}`,
    block_w: block.w,
    block_h: block.h,
    block_origin_x: block.x,
    block_origin_y: block.y,
    showcase: true,
    showcase_kind: block.kind,
  }
  if (isOrigin) {
    cell.summary = block.summary
    if (block.tag) cell.showcase_tag = block.tag
    if (block.accent) cell.showcase_accent = block.accent
  }
  return cell
}

/** One row per covered cell, shaped like /api/grid rows (owner set, block_* filled in). */
export function virtualGridCells(active: ShowcaseBlock[]): Cell[] {
  const out: Cell[] = []
  for (const block of active) {
    for (let dy = 0; dy < block.h; dy++) {
      for (let dx = 0; dx < block.w; dx++) {
        out.push(baseCell(block, block.x + dx, block.y + dy))
      }
    }
  }
  return out
}

/**
 * /api/cells payload for a showcase coordinate. The origin cell carries the full
 * detail (markdown, links, iframe, service fields); other cells of the block
 * carry only block info, like real multi-cell blocks (the client re-fetches the origin).
 */
export function virtualCellDetail(block: ShowcaseBlock, x: number, y: number): Cell {
  const cell = baseCell(block, x, y)
  if (x !== block.x || y !== block.y) return cell
  cell.markdown = block.markdown
  cell.content_url = block.content_url
  cell.iframe_url = block.iframe_url
  cell.scene_preset = 'none'
  cell.showcase_links = block.links
  cell.showcase_footnote = block.footnote
  if (block.service) {
    cell.service_url = block.service.url
    cell.service_method = block.service.method
    cell.service_desc = block.service.desc
    cell.service_category = block.service.category
    cell.probe_status = 'unchecked'
    cell.probe_accepts = null
    cell.probed_at = null
    cell.showcase_listing = block.service.listing
  }
  return cell
}

/**
 * Merge the active blocks into a list of owned-cell rows (what /api/grid returns).
 * Rows at covered coordinates are replaced by the virtual cells — only
 * 0xRESERVED / 0xAgentVerseOfficial rows can be there, because a real user's
 * cell would have made the block skip; a real user's row is kept regardless.
 */
export function mergeShowcaseIntoGrid<T extends OwnedCellLike>(rows: T[], resolved: ResolvedShowcase): Array<T | Cell> {
  const kept = rows.filter((r) => isRealUserOwner(r.owner) || !findShowcaseBlockAt(r.x, r.y, resolved.active))
  return [...kept, ...virtualGridCells(resolved.active)]
}

/** resolve + log + merge in one call, for routes that already hold every owned cell. */
export function applyShowcaseToGridRows<T extends OwnedCellLike>(rows: T[]): Array<T | Cell> {
  const resolved = resolveShowcase(rows)
  logSkippedShowcase(resolved.skipped)
  return mergeShowcaseIntoGrid(rows, resolved)
}

/** Sanity bounds used by tests: is the whole footprint on the map? */
export function showcaseFitsMap(): boolean {
  return SHOWCASE_BOUNDS.x0 >= 0 && SHOWCASE_BOUNDS.y0 >= 0 && SHOWCASE_BOUNDS.x1 < COLS && SHOWCASE_BOUNDS.y1 < ROWS
}
