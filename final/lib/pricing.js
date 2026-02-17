export const BLOCK_SIZES = [
  { w: 1, h: 1, label: '1×1', price: 0.50 },
  { w: 2, h: 1, label: '2×1', price: 1.25 },
  { w: 2, h: 2, label: '2×2', price: 3.00 },
  { w: 3, h: 3, label: '3×3', price: 9.00 },
  { w: 4, h: 4, label: '4×4', price: 20.00 },
]

export function getBlockPrice(w, h) {
  const entry = BLOCK_SIZES.find(s => s.w === w && s.h === h)
  return entry ? entry.price : null
}

export function getBlockLabel(w, h) {
  const entry = BLOCK_SIZES.find(s => s.w === w && s.h === h)
  return entry ? entry.label : `${w}×${h}`
}
