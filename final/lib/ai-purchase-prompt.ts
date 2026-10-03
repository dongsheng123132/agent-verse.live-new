/**
 * The "buy it with my AI" prompt: a pure text generator (no DOM, no server
 * imports) shared by the purchase modal and by public/skill.md.
 *
 * Product decision 2026-10-02: browser-wallet payment is paused (wallet
 * security plug-ins flag the EIP-3009 signature as malicious). A person picks
 * cells, says how they want them to look, copies this prompt to their own AI,
 * the AI buys and decorates over x402, and the person reviews the result.
 *
 * The prompt is deliberately short (a human reviews it in ~10 seconds): the goal,
 * the request, the decoration JSON, one api_key safety rule and what to report.
 * HOW to pay with x402 and what to do on errors lives in skill.md's "AI 购买"
 * section, which the last line points to. Chinese for the instructions, English
 * verbatim for every endpoint / header / field name. It never contains a key.
 */
import { PRICE_PER_CELL } from '../app/types'
import { fullRectangle, sortCells, type CellCoord } from './cell-block'
import { formatAtomicUsdc, totalAtomicForCells, usdcToAtomic } from './usdc-amount'
import { PAY_NETWORKS } from './networks'

/** Receiving address of every purchase (same value as PAY_TO_ADDRESS in lib/x402-flow.ts; a test fails if they drift). */
export const AGENTVERSE_PAY_TO = '0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6'

/** Used when the page origin is unknown (server render, tests). */
export const DEFAULT_ORIGIN = 'https://www.agent-verse.live'

/** MoneySwitch, the recommended way to give an AI a spending limit. */
export const MONEYSWITCH_URL = 'https://github.com/dongsheng123132/moneyswitch'

/** Name of the skill.md section the prompt's last line sends the AI to. */
export const SKILL_SECTION_NAME = 'AI 购买'

/** The bulk endpoint refuses more than this many cells in one payment. */
export const MAX_BULK_CELLS = 400

/** Above this many cells the goal line summarises instead of listing every coordinate (the body always lists all). */
const MAX_LISTED_COORDS = 30

export type Coord = CellCoord

/** The look the person wants. Every field is optional; empty / blank means "not specified". */
export interface AiDecorateFields {
  title: string
  summary: string
  fill_color: string
  iframe_url: string
  service_url: string
}

export const EMPTY_DECORATE: AiDecorateFields = { title: '', summary: '', fill_color: '', iframe_url: '', service_url: '' }

/** Order the fields appear in the PUT body (and in the form). */
export const DECORATE_ORDER: (keyof AiDecorateFields)[] = ['title', 'summary', 'fill_color', 'iframe_url', 'service_url']

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Trimmed, non-empty fields only, in DECORATE_ORDER. The PUT body must contain only what the person filled in. */
export function pickDecorateFields(input: Partial<AiDecorateFields> | null | undefined): Partial<AiDecorateFields> {
  const out: Partial<AiDecorateFields> = {}
  for (const k of DECORATE_ORDER) {
    const v = typeof input?.[k] === 'string' ? (input[k] as string).trim() : ''
    if (v) out[k] = v
  }
  return out
}

/** Per-field problems (Chinese), mirroring what PUT /api/cells/update rejects. Empty object = fine. */
export function validateDecorateFields(input: Partial<AiDecorateFields> | null | undefined): Partial<Record<keyof AiDecorateFields, string>> {
  const f = pickDecorateFields(input)
  const errors: Partial<Record<keyof AiDecorateFields, string>> = {}
  if (f.fill_color && !HEX_COLOR.test(f.fill_color)) errors.fill_color = '颜色要写成 #RRGGBB，例如 #7c3aed'
  if (f.iframe_url && !f.iframe_url.startsWith('https://')) errors.iframe_url = '必须以 https:// 开头'
  if (f.service_url && !f.service_url.startsWith('https://')) errors.service_url = '必须以 https:// 开头'
  return errors
}

export function unitPriceUsdc(): string {
  return formatAtomicUsdc(usdcToAtomic(PRICE_PER_CELL))
}

export function totalPriceUsdc(count: number): string {
  return formatAtomicUsdc(totalAtomicForCells(count))
}

export interface AiPromptInput {
  /** Page origin, e.g. https://www.agent-verse.live. Blank falls back to DEFAULT_ORIGIN. */
  origin?: string
  cells: Coord[]
  decorate?: Partial<AiDecorateFields> | null
}

function coordLabel(c: Coord): string {
  return `(${c.x},${c.y})`
}

/** The request body, compact JSON, cells in row-major order. */
export function purchaseBody(cells: Coord[]): string {
  if (cells.length === 1) return JSON.stringify({ x: cells[0].x, y: cells[0].y })
  return JSON.stringify({ cells: sortCells(cells).map((c) => ({ x: c.x, y: c.y })) })
}

export function purchasePath(count: number): string {
  return count === 1 ? '/api/cells/purchase' : '/api/cells/bulk-purchase'
}

export function buildAiPurchasePrompt(input: AiPromptInput): string {
  const origin = (input.origin || DEFAULT_ORIGIN).replace(/\/+$/, '')
  if (input.cells.length === 0) throw new Error('buildAiPurchasePrompt: no cells')
  const cells = sortCells(input.cells)
  const count = cells.length
  const single = count === 1
  const total = totalPriceUsdc(count)
  const body = purchaseBody(cells)
  const first = cells[0]
  const rect = fullRectangle(cells)
  const monad = PAY_NETWORKS.mainnet.monad
  const base = PAY_NETWORKS.mainnet.base
  const fields = pickDecorateFields(input.decorate)
  const hasFields = Object.keys(fields).length > 0

  let cellLine: string
  if (single) {
    cellLine = `格子 ${coordLabel(first)}`
  } else if (count <= MAX_LISTED_COORDS) {
    cellLine = `${count} 个格子 ${cells.map(coordLabel).join(' ')}`
  } else {
    const xs = cells.map((c) => c.x)
    const ys = cells.map((c) => c.y)
    cellLine = `${count} 个格子，范围 (${Math.min(...xs)},${Math.min(...ys)}) 到 (${Math.max(...xs)},${Math.max(...ys)})，完整坐标见 body`
  }

  const lines: string[] = [
    `请帮我在 AgentVerse（${origin}）买下 ${count} 个格子${hasFields ? '，并装修' : ''}。`,
    ``,
    `【目标】${cellLine}。总价 ${total} USDC 我已确认，直接付款；实际付款不得超过 ${total} USDC。`,
    `收款地址 ${AGENTVERSE_PAY_TO}（402 响应里的 payTo 不一致就先停下来问我）；网络 Monad ${monad.caip2} 优先，Base ${base.caip2} 也行。`,
    `【请求】POST ${origin}${purchasePath(count)}`,
    `body: ${body}`,
  ]
  if (hasFields) {
    lines.push(
      `【装修】买到后 PUT ${origin}/api/cells/update，Header: Authorization: Bearer <api_key>、Content-Type: application/json，JSON（只提交这些字段）：`,
      JSON.stringify(fields)
    )
  } else {
    lines.push(`【装修】我这次没有指定装修内容，不要调用 /api/cells/update；买到后告诉我格子链接，装修由我之后再定。`)
  }
  lines.push(`【api_key】gk_ 开头，只返回一次：保存在安全的位置并告诉我保存在哪，不要贴到任何公开的地方。`)
  if (!single) {
    lines.push(
      rect
        ? `多格是一整块 ${rect.w}×${rect.h}：api_key 对应左上角 ${coordLabel({ x: rect.ox, y: rect.oy })}，一次装修整块一起变。`
        : `这些格子拼不成完整矩形：只返回一把 api_key，只对应第一格 ${coordLabel(first)}，装修也只改这一格。`
    )
  }
  const keyCell = rect ? { x: rect.ox, y: rect.oy } : first
  lines.push(
    `【回报】交易哈希 + 浏览器链接（Monad：https://monadvision.com/tx/<hash>；Base：https://basescan.org/tx/<hash>）、格子链接 ${origin}/?x=${keyCell.x}&y=${keyCell.y}、${hasFields ? '装修是否成功' : '买下了哪些格子'}。`,
    ``,
    `怎么用 x402 付款（MoneySwitch / 其他 x402 钱包）、出错怎么处理：先读 ${origin}/skill.md 的「${SKILL_SECTION_NAME}」一节。`
  )
  return lines.join('\n')
}
