import { describe, expect, it } from 'vitest'
import {
  CELL_KEYS_STORAGE_KEY,
  getCellKey,
  isPlausibleCellKey,
  listCellKeys,
  removeCellKey,
  saveCellKey,
  type StorageLike,
} from '../lib/cell-key-store'

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v)
    },
    removeItem: (k) => {
      delete data[k]
    },
  }
}

const KEY_A = 'gk_' + 'a'.repeat(32)
const KEY_B = 'gk_' + 'b'.repeat(32)

describe('cell key store (localStorage, by coordinate)', () => {
  it('saves and reads back a key by x,y', () => {
    const s = memoryStorage()
    expect(saveCellKey(s, 22, 40, KEY_A, { network: 'eip155:143', txHash: '0xabc', now: 1 })).toBe(true)
    expect(getCellKey(s, 22, 40)).toBe(KEY_A)
    expect(getCellKey(s, 40, 22)).toBeNull() // x,y are not interchangeable
  })

  it('keeps several cells apart and overwrites the same cell', () => {
    const s = memoryStorage()
    saveCellKey(s, 1, 2, KEY_A)
    saveCellKey(s, 3, 4, KEY_B)
    expect(getCellKey(s, 1, 2)).toBe(KEY_A)
    expect(getCellKey(s, 3, 4)).toBe(KEY_B)
    saveCellKey(s, 1, 2, KEY_B)
    expect(getCellKey(s, 1, 2)).toBe(KEY_B)
    expect(listCellKeys(s).map((e) => `${e.x},${e.y}`).sort()).toEqual(['1,2', '3,4'])
  })

  it('trims whitespace around a pasted key', () => {
    const s = memoryStorage()
    expect(saveCellKey(s, 5, 5, `  ${KEY_A}\n`)).toBe(true)
    expect(getCellKey(s, 5, 5)).toBe(KEY_A)
  })

  it('refuses anything that is not a gk_ key and stores nothing', () => {
    const s = memoryStorage()
    for (const bad of ['', 'abc', 'sk_' + 'a'.repeat(32), 'gk_', 'gk_short', 'gk_' + 'a'.repeat(300), 'gk_has space inside']) {
      expect(saveCellKey(s, 1, 1, bad)).toBe(false)
    }
    expect(s.data[CELL_KEYS_STORAGE_KEY]).toBeUndefined()
    expect(isPlausibleCellKey(KEY_A)).toBe(true)
    expect(isPlausibleCellKey(undefined)).toBe(false)
  })

  it('removeCellKey deletes just that cell', () => {
    const s = memoryStorage()
    saveCellKey(s, 1, 2, KEY_A)
    saveCellKey(s, 3, 4, KEY_B)
    expect(removeCellKey(s, 1, 2)).toBe(true)
    expect(getCellKey(s, 1, 2)).toBeNull()
    expect(getCellKey(s, 3, 4)).toBe(KEY_B)
  })

  it('survives corrupt / foreign data in the slot', () => {
    expect(getCellKey(memoryStorage({ [CELL_KEYS_STORAGE_KEY]: '{not json' }), 1, 1)).toBeNull()
    expect(getCellKey(memoryStorage({ [CELL_KEYS_STORAGE_KEY]: '[1,2]' }), 1, 1)).toBeNull()
    expect(getCellKey(memoryStorage({ [CELL_KEYS_STORAGE_KEY]: JSON.stringify({ '1,1': { key: 'nope' }, '2,2': { key: KEY_A } }) }), 2, 2)).toBe(KEY_A)
  })

  it('a null storage (blocked / SSR) never throws', () => {
    expect(getCellKey(null, 1, 1)).toBeNull()
    expect(saveCellKey(null, 1, 1, KEY_A)).toBe(false)
    expect(listCellKeys(null)).toEqual([])
  })

  it('a storage that throws on write (quota / private mode) reports failure instead of throwing', () => {
    const s: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }
    expect(saveCellKey(s, 1, 1, KEY_A)).toBe(false)
  })
})
