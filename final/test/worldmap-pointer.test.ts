import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// WorldMap decides pan vs box-select per gesture from PointerEvent.pointerType (touch = pan, mouse / pen = select).
// The behaviour itself is exercised in a real browser by scripts/e2e-ai-purchase.mjs; this guards the source against
// going back to a per-device guess (navigator.maxTouchPoints > 0 is true on touch-screen laptops).
const raw = fs.readFileSync(path.join(__dirname, '..', 'components', 'WorldMap.tsx'), 'utf8')
// code only: the explanatory comments are allowed to name maxTouchPoints
const NL = String.fromCharCode(10)
const src = raw.split(NL).filter((l) => !l.trim().startsWith('//')).join(NL)

describe('WorldMap gesture mode', () => {
  it('no longer guesses from the device', () => {
    expect(src).not.toContain('maxTouchPoints')
    expect(src).not.toContain("'ontouchstart' in window")
    expect(src).not.toMatch(/const mode\b/)
  })

  it('records the pointer type on pointerdown and only touch pans on the mouse-event path', () => {
    expect(src).toContain('onPointerDown={(e) => { pointerTypeRef.current = e.pointerType; }}')
    expect(src).toContain("if (pointerTypeRef.current !== 'touch') {")
  })

  it('the touch handlers never start a box selection (a finger pans, a tap selects one cell)', () => {
    const touchStart = src.slice(src.indexOf('const handleTouchStart'), src.indexOf('const handleTouchMove'))
    expect(touchStart).toContain('setIsDragging(true)')
    expect(touchStart).not.toContain('setIsSelecting(true)')
    expect(touchStart).not.toContain('setSelectGridStart')
  })
})
