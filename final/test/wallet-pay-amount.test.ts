import { describe, expect, it } from 'vitest'
import { formatAtomicUsdc, totalAtomicForCells, totalUsdcForCells, usdcToAtomic } from '../lib/wallet-pay/amount'
import { PRICE_PER_CELL } from '../app/types'
import { usdcToAtomic as serverUsdcToAtomic } from '../lib/x402-flow'

describe('amount = cells x 0.1 USDC', () => {
  it('unit price is 0.1 USDC = 100000 atomic units', () => {
    expect(PRICE_PER_CELL).toBe(0.1)
    expect(usdcToAtomic(PRICE_PER_CELL)).toBe(100000n)
  })

  it.each([
    [1, 100000n, 0.1],
    [2, 200000n, 0.2],
    [3, 300000n, 0.3], // 3 * 0.1 is 0.30000000000000004 in floating point
    [7, 700000n, 0.7],
    [10, 1_000_000n, 1],
    [100, 10_000_000n, 10], // a full 10x10 ad block
    [400, 40_000_000n, 40], // bulk-purchase upper limit
  ])('%i cells -> %s atomic / %s USDC', (count, atomic, usdc) => {
    expect(totalAtomicForCells(count)).toBe(atomic)
    expect(totalUsdcForCells(count)).toBe(usdc)
  })

  it('matches how the server prices a bulk request (toFixed(2) of the rounded total)', () => {
    for (const count of [1, 3, 7, 33, 100, 399]) {
      const serverUsd = Math.round(count * PRICE_PER_CELL * 100) / 100
      expect(totalAtomicForCells(count)).toBe(BigInt(serverUsdcToAtomic(serverUsd)))
    }
  })

  it('usdcToAtomic equals the server helper', () => {
    for (const v of [0.1, 0.3, 1, 10, '0.05', 12.34]) {
      expect(usdcToAtomic(v)).toBe(BigInt(serverUsdcToAtomic(v)))
    }
  })

  it('formatAtomicUsdc: at least 2 decimals, no float noise', () => {
    expect(formatAtomicUsdc(100000n)).toBe('0.10')
    expect(formatAtomicUsdc(300000n)).toBe('0.30')
    expect(formatAtomicUsdc(10_000_000n)).toBe('10.00')
    expect(formatAtomicUsdc(1_234_567n)).toBe('1.234567')
    expect(formatAtomicUsdc(0n)).toBe('0.00')
    expect(formatAtomicUsdc(5n)).toBe('0.000005')
  })
})
