// Fixed 0.1 USDC per cell (legacy getBlockPrice/getBlockLabel kept for verify)
export const PRICE_PER_CELL = 0.1

export function calcTotalPrice(cellCount: number): number {
  return cellCount * PRICE_PER_CELL
}

export function getBlockLabel(w: number, h: number): string {
  return `${w}×${h}`
}

export function getBlockPrice(w?: number, h?: number): number {
  return (w || 1) * (h || 1) * PRICE_PER_CELL
}
