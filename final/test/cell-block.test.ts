import { describe, expect, it } from 'vitest'
import { blockIdFor, fullRectangle, keyCellFor, sortCells } from '../lib/cell-block'

const grid = (x0: number, y0: number, w: number, h: number) =>
  Array.from({ length: w * h }, (_, i) => ({ x: x0 + (i % w), y: y0 + Math.floor(i / w) }))

describe('fullRectangle', () => {
  it('one cell is a 1x1 rectangle', () => {
    expect(fullRectangle([{ x: 5, y: 7 }])).toEqual({ ox: 5, oy: 7, w: 1, h: 1 })
  })
  it('a filled w x h area, in any order, gives its top-left origin', () => {
    const cells = grid(30, 70, 3, 2).reverse()
    expect(fullRectangle(cells)).toEqual({ ox: 30, oy: 70, w: 3, h: 2 })
  })
  it('a row and a column are rectangles', () => {
    expect(fullRectangle(grid(20, 20, 5, 1))).toEqual({ ox: 20, oy: 20, w: 5, h: 1 })
    expect(fullRectangle(grid(20, 20, 1, 4))).toEqual({ ox: 20, oy: 20, w: 1, h: 4 })
  })
  it('gaps, L shapes, scattered cells and duplicates are not rectangles', () => {
    expect(fullRectangle([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }])).toBeNull()
    expect(fullRectangle([{ x: 1, y: 1 }, { x: 3, y: 1 }])).toBeNull()
    expect(fullRectangle([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toBeNull()
    expect(fullRectangle([])).toBeNull()
  })
})

describe('keyCellFor / blockIdFor / sortCells', () => {
  it('rectangle -> origin; anything else -> the first cell as given', () => {
    expect(keyCellFor([{ x: 32, y: 71 }, { x: 30, y: 70 }, { x: 31, y: 70 }, { x: 32, y: 70 }, { x: 30, y: 71 }, { x: 31, y: 71 }])).toEqual({ x: 30, y: 70 })
    expect(keyCellFor([{ x: 9, y: 9 }, { x: 4, y: 4 }])).toEqual({ x: 9, y: 9 })
  })
  it('block id format matches the legacy block flow', () => {
    expect(blockIdFor({ ox: 30, oy: 70, w: 3, h: 2 })).toBe('blk_30_70_3x2')
    expect(blockIdFor({ ox: 5, oy: 7, w: 1, h: 1 })).toBe('blk_5_7_1x1')
  })
  it('sortCells is row-major and does not mutate', () => {
    const input = [{ x: 2, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 1 }]
    expect(sortCells(input)).toEqual([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }])
    expect(input[0]).toEqual({ x: 2, y: 1 })
  })
})
