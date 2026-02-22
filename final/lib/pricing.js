// Fixed 1 USDC per cell (legacy getBlockPrice/getBlockLabel kept for verify)
export const PRICE_PER_CELL = 1.0

export function calcTotalPrice(cellCount) {
  return cellCount * PRICE_PER_CELL
}

export function getBlockLabel(w, h) {
  return `${w}×${h}`
}

export function getBlockPrice(w, h) {
  return (w || 1) * (h || 1) * PRICE_PER_CELL
}
