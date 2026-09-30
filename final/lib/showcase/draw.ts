/**
 * Canvas drawing for the Monad Metropolis showcase blocks (client only; used by
 * components/WorldMap.tsx). Text + colours only — no images.
 *
 * drawShowcaseBlock() paints the static look of one block on the base canvas and
 * appends animated items to `glow`; paintGlow() draws those on the overlay canvas
 * (arena breathing outline, street-lamp halos, and the old brand-block glow), so
 * the base canvas only repaints when the map actually changes.
 */
import type { Cell } from '../../app/types'

export const SHOWCASE_FONT = '"Segoe UI", "Microsoft YaHei", system-ui, sans-serif'

const PURPLE = '#6E54FF'
const GOLD = '#F5C542'
const LAMP = '#FBBF24'

export interface GlowItem {
  /** brand = old large-block glow with scan line + sparkle; breath = arena outline; lamp = street-lamp halo. */
  kind: 'brand' | 'breath' | 'lamp'
  x: number
  y: number
  w: number
  h: number
  color: string
  /** lamp radius in px. */
  r?: number
}

function font(px: number, weight = 'bold') {
  return `${weight} ${px}px ${SHOWCASE_FONT}`
}

/** '#RRGGBB' + alpha 0..1 -> '#RRGGBBAA'. */
export function withAlpha(hex: string, a: number): string {
  const aa = Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0')
  return `${hex}${aa}`
}

/** Largest font size <= maxPx at which `text` fits maxW; 0 when even minPx does not fit. Text width is linear in font size. */
export function fitFontPx(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxPx: number, minPx: number, weight = 'bold'): number {
  ctx.font = font(100, weight)
  const w = ctx.measureText(text).width
  if (w <= 0) return maxPx
  const px = Math.min(maxPx, (maxW / w) * 100)
  return px >= minPx ? px : 0
}

function centredText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, px: number, color: string, weight = 'bold') {
  ctx.font = font(px, weight)
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy)
}

/** Split "A B C" into two balanced lines at a space (null when there is no space). */
function splitTwoLines(text: string): [string, string] | null {
  const idx: number[] = []
  for (let i = 0; i < text.length; i++) if (text[i] === ' ') idx.push(i)
  if (idx.length === 0) return null
  const mid = text.length / 2
  const best = idx.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a))
  return [text.slice(0, best), text.slice(best + 1)]
}

/**
 * Draw `text` centred in a box: one line if it fits at a readable size, else two
 * lines split at a space. Returns false when nothing readable fits.
 */
function nameInBox(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, boxW: number, boxH: number, maxPx: number, minPx: number, color: string): boolean {
  const one = fitFontPx(ctx, text, boxW, Math.min(maxPx, boxH * 0.8), minPx)
  const two = splitTwoLines(text)
  if (two) {
    const longer = two[0].length >= two[1].length ? two[0] : two[1]
    const px2 = fitFontPx(ctx, longer, boxW, Math.min(maxPx, boxH * 0.42), minPx)
    if (px2 > 0 && px2 > one * 1.15) {
      centredText(ctx, two[0], cx, cy - px2 * 0.55, px2, color)
      centredText(ctx, two[1], cx, cy + px2 * 0.55, px2, color)
      return true
    }
  }
  if (one > 0) {
    centredText(ctx, text, cx, cy, one, color)
    return true
  }
  return false
}

function drawArena(ctx: CanvasRenderingContext2D, cell: Cell, x: number, y: number, w: number, h: number, cellSize: number, glow: GlowItem[]) {
  const purple = cell.color || PURPLE
  const gold = cell.showcase_accent || GOLD
  ctx.fillStyle = '#0a0616'
  ctx.fillRect(x, y, w, h)
  const g = ctx.createRadialGradient(x + w / 2, y + h * 0.45, 0, x + w / 2, y + h * 0.45, Math.max(w, h) * 0.6)
  g.addColorStop(0, withAlpha(purple, 0.4))
  g.addColorStop(1, 'rgba(10,6,22,0)')
  ctx.fillStyle = g
  ctx.fillRect(x, y, w, h)
  // Monad purple border, gold outline outside it
  const b = Math.max(2, cellSize * 0.26)
  ctx.strokeStyle = purple
  ctx.lineWidth = b
  ctx.strokeRect(x + b / 2, y + b / 2, w - b, h - b)
  const o = Math.max(1.5, cellSize * 0.11)
  ctx.strokeStyle = gold
  ctx.lineWidth = o
  ctx.strokeRect(x + o / 2, y + o / 2, w - o, h - o)
  // gold corner brackets
  const c = Math.min(w, h) * 0.16
  ctx.lineWidth = Math.max(2, o * 1.6)
  ctx.beginPath()
  ctx.moveTo(x + b, y + b + c); ctx.lineTo(x + b, y + b); ctx.lineTo(x + b + c, y + b)
  ctx.moveTo(x + w - b - c, y + b); ctx.lineTo(x + w - b, y + b); ctx.lineTo(x + w - b, y + b + c)
  ctx.moveTo(x + b, y + h - b - c); ctx.lineTo(x + b, y + h - b); ctx.lineTo(x + b + c, y + h - b)
  ctx.moveTo(x + w - b - c, y + h - b); ctx.lineTo(x + w - b, y + h - b); ctx.lineTo(x + w - b, y + h - b - c)
  ctx.stroke()

  const title = cell.title || ''
  const cut = title.lastIndexOf(' ')
  const l1 = cut > 0 ? title.slice(0, cut) : title
  const l2 = cut > 0 ? title.slice(cut + 1) : ''
  const innerW = w * 0.84
  if (cellSize >= 3) {
    const p1 = fitFontPx(ctx, l1, innerW, h * 0.2, 5)
    const p2 = l2 ? fitFontPx(ctx, l2, innerW, h * 0.32, 5) : 0
    if (p1 > 0) centredText(ctx, l1, x + w / 2, y + h * 0.3, p1, gold)
    if (p2 > 0) centredText(ctx, l2, x + w / 2, y + h * 0.56, p2, '#FFE9A8')
    if (cellSize >= 12 && cell.summary) {
      const p3 = fitFontPx(ctx, cell.summary, w * 0.86, h * 0.085, 5, 'normal')
      if (p3 > 0) centredText(ctx, cell.summary, x + w / 2, y + h * 0.82, p3, 'rgba(255,255,255,0.78)', 'normal')
    }
  }
  glow.push({ kind: 'breath', x, y, w, h, color: gold })
}

function drawStreetBanner(ctx: CanvasRenderingContext2D, cell: Cell, x: number, y: number, w: number, h: number, cellSize: number) {
  const purple = cell.color || PURPLE
  const gold = cell.showcase_accent || GOLD
  ctx.fillStyle = '#0d0820'
  ctx.fillRect(x, y, w, h)
  const b = Math.max(1.5, cellSize * 0.16)
  ctx.strokeStyle = purple
  ctx.lineWidth = b
  ctx.strokeRect(x + b / 2, y + b / 2, w - b, h - b)
  if (cellSize >= 3) {
    const title = cell.title || ''
    const p1 = fitFontPx(ctx, title, w * 0.88, h * 0.34, 5)
    if (p1 > 0) centredText(ctx, title, x + w / 2, y + h * (cell.showcase_tag && cellSize >= 10 ? 0.36 : 0.5), p1, gold)
    if (cell.showcase_tag && cellSize >= 10) {
      const p2 = fitFontPx(ctx, cell.showcase_tag, w * 0.8, h * 0.22, 5, 'normal')
      if (p2 > 0) centredText(ctx, cell.showcase_tag, x + w / 2, y + h * 0.7, p2, withAlpha('#FFFFFF', 0.7), 'normal')
    }
  }
}

function drawSponsor(ctx: CanvasRenderingContext2D, cell: Cell, x: number, y: number, w: number, h: number, cellSize: number) {
  const brand = cell.color || '#888888'
  ctx.fillStyle = '#0c0c14'
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = withAlpha(brand, 0.16)
  ctx.fillRect(x, y, w, h)
  const stripe = Math.max(2, cellSize * 0.3)
  ctx.fillStyle = brand
  ctx.fillRect(x, y, w, stripe)
  ctx.strokeStyle = withAlpha(brand, 0.75)
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  if (cellSize < 5) return
  const bodyY = y + stripe
  const bodyH = h - stripe
  const showTag = cellSize >= 14 && !!cell.showcase_tag
  const nameCy = bodyY + bodyH * (showTag ? 0.4 : 0.5)
  const nameBoxH = bodyH * (showTag ? 0.52 : 0.8)
  nameInBox(ctx, cell.title || '', x + w / 2, nameCy, w * 0.9, nameBoxH, Math.max(8, cellSize * 0.8), 5, '#FFFFFF')
  if (showTag) {
    const px = fitFontPx(ctx, cell.showcase_tag!, w * 0.86, Math.min(cellSize * 0.62, bodyH * 0.28), 5)
    if (px > 0) centredText(ctx, cell.showcase_tag!, x + w / 2, bodyY + bodyH * 0.8, px, GOLD)
  }
}

function serviceLabel(title: string): [string, string | null] {
  const i = title.indexOf(' · ')
  return i > 0 ? [title.slice(0, i), title.slice(i + 3)] : [title, null]
}

function drawService(ctx: CanvasRenderingContext2D, cell: Cell, x: number, y: number, w: number, h: number, cellSize: number, glow: GlowItem[]) {
  ctx.fillStyle = '#0b0b16'
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = withAlpha(cell.color || PURPLE, 0.7)
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  if (cellSize >= 12) {
    const [a, b] = serviceLabel(cell.title || '')
    const boxW = w * 0.9
    if (b && cellSize >= 16) {
      const pa = fitFontPx(ctx, a, boxW, h * 0.2, 5)
      const pb = fitFontPx(ctx, b, boxW, h * 0.17, 5, 'normal')
      if (pa > 0) centredText(ctx, a, x + w / 2, y + h * 0.4, pa, '#FFFFFF')
      if (pb > 0) centredText(ctx, b, x + w / 2, y + h * 0.58, pb, 'rgba(255,255,255,0.7)', 'normal')
    } else {
      const pa = fitFontPx(ctx, a, boxW, h * 0.24, 5)
      if (pa > 0) centredText(ctx, a, x + w / 2, y + h * 0.48, pa, '#FFFFFF')
    }
    if (cellSize >= 20 && cell.showcase_tag) {
      const pt = fitFontPx(ctx, cell.showcase_tag, w * 0.7, h * 0.17, 5)
      if (pt > 0) centredText(ctx, cell.showcase_tag, x + w / 2, y + h * 0.82, pt, GOLD)
    }
  }
  // street lamp: small lit dot in the top-right corner (halo breathes on the overlay canvas)
  if (cellSize >= 3) {
    const r = Math.max(1.6, Math.min(4.5, cellSize * 0.2))
    const lx = x + w - r - Math.max(2, cellSize * 0.18)
    const ly = y + r + Math.max(2, cellSize * 0.18)
    ctx.fillStyle = cell.showcase_accent || LAMP
    ctx.beginPath()
    ctx.arc(lx, ly, r, 0, Math.PI * 2)
    ctx.fill()
    glow.push({ kind: 'lamp', x: lx, y: ly, w: 0, h: 0, r, color: cell.showcase_accent || LAMP })
  }
}

function drawCta(ctx: CanvasRenderingContext2D, cell: Cell, x: number, y: number, w: number, h: number, cellSize: number) {
  const gold = cell.showcase_accent || GOLD
  ctx.fillStyle = '#0d0a1c'
  ctx.fillRect(x, y, w, h)
  ctx.save()
  ctx.strokeStyle = withAlpha(gold, 0.8)
  ctx.lineWidth = 1.5
  ctx.setLineDash([Math.max(3, cellSize * 0.3), Math.max(2, cellSize * 0.2)])
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4)
  ctx.restore()
  if (cellSize >= 4) {
    const showTag = cellSize >= 10 && !!cell.showcase_tag
    nameInBox(ctx, cell.title || '', x + w / 2, y + h * (showTag ? 0.4 : 0.5), w * 0.86, h * (showTag ? 0.4 : 0.6), Math.max(9, cellSize * 0.9), 5, gold)
    if (showTag) {
      const px = fitFontPx(ctx, cell.showcase_tag!, w * 0.7, h * 0.2, 5, 'normal')
      if (px > 0) centredText(ctx, cell.showcase_tag!, x + w / 2, y + h * 0.74, px, 'rgba(255,255,255,0.75)', 'normal')
    }
  }
}

/** Paint one showcase block (called for the block's origin cell; x/y/w/h are screen px of the whole block). */
export function drawShowcaseBlock(ctx: CanvasRenderingContext2D, cell: Cell, x: number, y: number, w: number, h: number, cellSize: number, glow: GlowItem[]): void {
  switch (cell.showcase_kind) {
    case 'arena': return drawArena(ctx, cell, x, y, w, h, cellSize, glow)
    case 'street': return drawStreetBanner(ctx, cell, x, y, w, h, cellSize)
    case 'sponsor': return drawSponsor(ctx, cell, x, y, w, h, cellSize)
    case 'service': return drawService(ctx, cell, x, y, w, h, cellSize, glow)
    case 'cta': return drawCta(ctx, cell, x, y, w, h, cellSize)
    default: {
      ctx.fillStyle = '#0c0c14'
      ctx.fillRect(x, y, w, h)
    }
  }
}

/**
 * Animated pass on the transparent overlay canvas. `t` is seconds. `dpr` scales
 * shadowBlur, which (unlike geometry) is not affected by the canvas transform.
 */
export function paintGlow(ctx: CanvasRenderingContext2D, items: GlowItem[], t: number, dpr: number): void {
  ctx.save()
  for (const it of items) {
    if (it.kind === 'brand') {
      // Breathing glow — pulse between min and max
      const pulse = 0.5 + 0.5 * Math.sin(t * 2 + it.x * 0.01)
      const glowSize = Math.max(6, Math.min(20, it.w * 0.08)) * (0.8 + pulse * 0.6)
      ctx.shadowColor = it.color
      ctx.shadowBlur = glowSize * dpr
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
      ctx.strokeStyle = withAlpha(it.color, (80 + pulse * 60) / 255)
      ctx.lineWidth = 1.5 + pulse
      ctx.strokeRect(it.x, it.y, it.w, it.h)
      // Scan line — horizontal light sweep
      ctx.shadowBlur = 0
      const scanY = it.y + ((t * 40 + it.x) % it.h)
      const scanGrad = ctx.createLinearGradient(it.x, scanY - 3, it.x, scanY + 3)
      scanGrad.addColorStop(0, 'rgba(255,255,255,0)')
      scanGrad.addColorStop(0.5, `rgba(255,255,255,${0.06 + pulse * 0.04})`)
      scanGrad.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = scanGrad
      ctx.fillRect(it.x + 2, scanY - 3, it.w - 4, 6)
      // Corner sparkle — rotating highlight on corners
      const sparkleAlpha = 0.3 + 0.3 * Math.sin(t * 3 + it.y * 0.02)
      const sparkleR = Math.max(3, it.w * 0.03)
      ctx.fillStyle = `rgba(255,255,255,${sparkleAlpha})`
      const corners = [
        [it.x + 4, it.y + 4],
        [it.x + it.w - 4, it.y + 4],
        [it.x + 4, it.y + it.h - 4],
        [it.x + it.w - 4, it.y + it.h - 4],
      ]
      const active = Math.floor((t * 2) % 4)
      ctx.beginPath()
      ctx.arc(corners[active][0], corners[active][1], sparkleR, 0, Math.PI * 2)
      ctx.fill()
    } else if (it.kind === 'breath') {
      // Arena: slow gold breathing outline (about 4s per breath)
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.6)
      ctx.shadowColor = it.color
      ctx.shadowBlur = (6 + pulse * 14) * dpr
      ctx.strokeStyle = withAlpha(it.color, 0.35 + pulse * 0.4)
      ctx.lineWidth = 1.5
      ctx.strokeRect(it.x - 1, it.y - 1, it.w + 2, it.h + 2)
      ctx.shadowBlur = 0
    } else {
      // Street lamp halo
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 + it.x * 0.05 + it.y * 0.03)
      const r = (it.r || 2) * (2.2 + pulse * 1.2)
      const g = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, r)
      g.addColorStop(0, withAlpha(it.color, 0.55 + pulse * 0.25))
      g.addColorStop(1, withAlpha(it.color, 0))
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(it.x, it.y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}
