import { BLOCK_SIZES } from '../app/types.ts'

export { BLOCK_SIZES }

export function getBlockPrice(w, h) {
  const entry = BLOCK_SIZES.find(s => s.w === w && s.h === h)
  return entry ? entry.price : null
}

export function getBlockLabel(w, h) {
  const entry = BLOCK_SIZES.find(s => s.w === w && s.h === h)
  return entry ? entry.label : `${w}×${h}`
}
