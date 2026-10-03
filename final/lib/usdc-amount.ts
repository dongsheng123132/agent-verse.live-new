import { PRICE_PER_CELL } from '../app/types'

/** USDC has 6 decimals on every chain we support. */
export const USDC_DECIMALS = 6

/** Decimal USDC -> atomic units (bigint), no floating-point drift. 0.1 -> 100000n. */
export function usdcToAtomic(amount: number | string): bigint {
  const [whole, frac = ''] = Number(amount).toFixed(USDC_DECIMALS).split('.')
  return BigInt(whole + frac)
}

/** Atomic USDC -> "1.50" style string (at least 2 decimals, trailing zeros trimmed down to 2). */
export function formatAtomicUsdc(atomic: bigint): string {
  const neg = atomic < 0n
  const abs = neg ? -atomic : atomic
  const s = abs.toString().padStart(USDC_DECIMALS + 1, '0')
  const whole = s.slice(0, -USDC_DECIMALS)
  let frac = s.slice(-USDC_DECIMALS).replace(/0+$/, '')
  if (frac.length < 2) frac = frac.padEnd(2, '0')
  return `${neg ? '-' : ''}${whole}.${frac}`
}

/** Atomic USDC the server will ask for `count` cells (count x PRICE_PER_CELL). */
export function totalAtomicForCells(count: number): bigint {
  return usdcToAtomic(PRICE_PER_CELL) * BigInt(count)
}

/** Display price for `count` cells, e.g. 3 -> 0.3, 100 -> 10. */
export function totalUsdcForCells(count: number): number {
  return Number(formatAtomicUsdc(totalAtomicForCells(count)))
}
