/**
 * Cell API keys (gk_…) remembered in this browser, keyed by cell coordinate.
 * The server shows a key exactly once (at purchase); this is what lets the same
 * browser decorate the cell later without pasting it again.
 *
 * Everything takes the Storage as a parameter so it is unit-testable; the app
 * passes `safeLocalStorage()`.
 */

export const CELL_KEYS_STORAGE_KEY = 'agentverse.cellKeys.v1'

export interface StoredCellKey {
  key: string
  savedAt: number
  /** Optional context shown nowhere sensitive: which chain / tx it was bought with. */
  network?: string
  txHash?: string
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** `gk_` + the random part the server generates (32 hex), but tolerate older/hand-made keys. */
export function isPlausibleCellKey(key: unknown): key is string {
  return typeof key === 'string' && /^gk_[A-Za-z0-9_-]{8,128}$/.test(key.trim())
}

export function cellKeyId(x: number, y: number): string {
  return `${x},${y}`
}

/** window.localStorage, or null when it is unavailable (SSR, privacy mode, blocked). */
export function safeLocalStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null
    const probe = '__av_probe__'
    window.localStorage.setItem(probe, '1')
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

function readAll(storage: StorageLike | null): Record<string, StoredCellKey> {
  if (!storage) return {}
  try {
    const raw = storage.getItem(CELL_KEYS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Record<string, StoredCellKey> = {}
    for (const [id, v] of Object.entries(parsed as Record<string, any>)) {
      if (v && isPlausibleCellKey(v.key)) {
        out[id] = { key: v.key, savedAt: Number(v.savedAt) || 0, network: v.network, txHash: v.txHash }
      }
    }
    return out
  } catch {
    return {}
  }
}

function writeAll(storage: StorageLike | null, all: Record<string, StoredCellKey>): boolean {
  if (!storage) return false
  try {
    storage.setItem(CELL_KEYS_STORAGE_KEY, JSON.stringify(all))
    return true
  } catch {
    return false
  }
}

export function getCellKey(storage: StorageLike | null, x: number, y: number): string | null {
  return readAll(storage)[cellKeyId(x, y)]?.key ?? null
}

/** Returns false when the key is malformed or the storage refused the write. */
export function saveCellKey(
  storage: StorageLike | null,
  x: number,
  y: number,
  key: string,
  meta: { network?: string; txHash?: string; now?: number } = {}
): boolean {
  const trimmed = key.trim()
  if (!isPlausibleCellKey(trimmed)) return false
  const all = readAll(storage)
  all[cellKeyId(x, y)] = { key: trimmed, savedAt: meta.now ?? Date.now(), network: meta.network, txHash: meta.txHash }
  return writeAll(storage, all)
}

export function removeCellKey(storage: StorageLike | null, x: number, y: number): boolean {
  const all = readAll(storage)
  if (!(cellKeyId(x, y) in all)) return true
  delete all[cellKeyId(x, y)]
  return writeAll(storage, all)
}

export function listCellKeys(storage: StorageLike | null): Array<{ x: number; y: number } & StoredCellKey> {
  return Object.entries(readAll(storage)).flatMap(([id, v]) => {
    const [xs, ys] = id.split(',')
    const x = Number(xs)
    const y = Number(ys)
    return Number.isInteger(x) && Number.isInteger(y) ? [{ x, y, ...v }] : []
  })
}
