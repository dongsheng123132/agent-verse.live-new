/**
 * The "buy it with my AI" prompt: a pure text generator (no DOM, no server
 * imports) shared by the purchase modal and by public/skill.md.
 *
 * Product decision 2026-10-02: browser-wallet payment is paused (wallet
 * security plug-ins flag the EIP-3009 signature as malicious). A person picks
 * cells, says how they want them to look, copies this prompt to their own AI,
 * the AI buys and decorates over x402, and the person reviews the result.
 *
 * The text is Chinese for the instructions and English, verbatim, for every
 * endpoint / header / field name an AI has to type. Keep it free of anything
 * secret: it must never contain an API key.
 */
import { PRICE_PER_CELL } from '../app/types'
import { formatAtomicUsdc, totalAtomicForCells, usdcToAtomic } from './wallet-pay/amount'
import { PAY_NETWORKS } from './wallet-pay/networks'

/** Receiving address of every purchase (same value as PAY_TO_ADDRESS in lib/x402-flow.ts; a test fails if they drift). */
export const AGENTVERSE_PAY_TO = '0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6'

/** Used when the page origin is unknown (server render, tests). */
export const DEFAULT_ORIGIN = 'https://www.agent-verse.live'

/** MoneySwitch, the recommended way to give an AI a spending limit. */
export const MONEYSWITCH_URL = 'https://github.com/dongsheng123132/moneyswitch'

/** The bulk endpoint refuses more than this many cells in one payment. */
export const MAX_BULK_CELLS = 400

/** Above this many cells the goal section summarises instead of listing every coordinate (the body always lists all). */
const MAX_LISTED_COORDS = 30

export interface Coord {
  x: number
  y: number
}

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
/** Referral codes look like ref_61_61; anything else is dropped rather than pasted into a prompt. */
const SAFE_REF = /^[A-Za-z0-9_-]{1,64}$/

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
  /** Referral code from ?ref= — only passed on when it looks like a code. */
  refCode?: string | null
}

function coordLabel(c: Coord): string {
  return `(${c.x},${c.y})`
}

/** The request body, compact JSON — exactly what goes after -d / into paid_fetch's body. */
export function purchaseBody(cells: Coord[], refCode?: string | null): string {
  const ref = refCode && SAFE_REF.test(refCode) ? { ref: refCode } : {}
  if (cells.length === 1) return JSON.stringify({ x: cells[0].x, y: cells[0].y, ...ref })
  return JSON.stringify({ cells: cells.map((c) => ({ x: c.x, y: c.y })), ...ref })
}

export function purchasePath(count: number): string {
  return count === 1 ? '/api/cells/purchase' : '/api/cells/bulk-purchase'
}

export function buildAiPurchasePrompt(input: AiPromptInput): string {
  const origin = (input.origin || DEFAULT_ORIGIN).replace(/\/+$/, '')
  const cells = input.cells
  if (cells.length === 0) throw new Error('buildAiPurchasePrompt: no cells')
  const count = cells.length
  const single = count === 1
  const unit = unitPriceUsdc()
  const total = totalPriceUsdc(count)
  const url = `${origin}${purchasePath(count)}`
  const body = purchaseBody(cells, input.refCode)
  const first = cells[0]
  const monad = PAY_NETWORKS.mainnet.monad
  const base = PAY_NETWORKS.mainnet.base
  const fields = pickDecorateFields(input.decorate)
  const hasFields = Object.keys(fields).length > 0

  let cellLine: string
  if (single) {
    cellLine = `要买的格子：${coordLabel(first)}（共 1 格）`
  } else if (count <= MAX_LISTED_COORDS) {
    cellLine = `要买的格子（共 ${count} 格）：${cells.map(coordLabel).join(' ')}`
  } else {
    const xs = cells.map((c) => c.x)
    const ys = cells.map((c) => c.y)
    cellLine = `要买的格子：共 ${count} 格，范围 (${Math.min(...xs)},${Math.min(...ys)}) 到 (${Math.max(...xs)},${Math.max(...ys)})，完整坐标见下面的 body`
  }

  const lines: string[] = [
    `请帮我在 AgentVerse（${origin}）买下 ${count} 个格子${hasFields ? '，并按我的要求装修' : ''}。全程用 x402（USDC）付款。`,
    ``,
    `【目标】`,
    `- ${cellLine}`,
    `- 单价 ${unit} USDC/格，总价 ${total} USDC。`,
    `- 付款前先向我确认总价，得到我的确认再付款；实际付款不得超过总价 ${total} USDC。`,
    `- 收款地址：${AGENTVERSE_PAY_TO}（402 响应里的 payTo 应是这个地址，不一致就先停下来问我）`,
    `- 支持网络：Monad（${monad.caip2}，优先）、Base（${base.caip2}）。`,
    ``,
    `【方式一（推荐：你有 MoneySwitch）】`,
    `用 paid_fetch 工具（或 MoneySwitch REST：POST /v1/fetch）调用：`,
    `- url: ${url}`,
    `- method: POST`,
    `- body: ${body}`,
    `- max_price: "${total}"`,
    `优先选 Monad 网络（${monad.caip2}）；Monad 付不了再用 Base（${base.caip2}）。`,
    ``,
    `【方式二（没有 MoneySwitch，但有自己的 x402 钱包）】`,
    `例如：`,
    `npx awal@latest x402 pay ${url} -X POST -d '${body}'`,
    `提醒：这种方式等于把钱包私钥交给 AI，注意额度。`,
    ``,
    `【买到之后】`,
    `1. 返回里的 api_key（gk_ 开头）只返回这一次。请把它保存在安全的位置，并告诉我保存在哪；不要把它贴到任何公开的地方（公开聊天、issue、截图、日志、代码仓库）。`,
  ]
  if (!single) {
    lines.push(`   多格购买只返回一把 api_key，它只对应 body 里的第一格 ${coordLabel(first)}，下面的装修也只会改这一格。`)
  }
  if (hasFields) {
    lines.push(
      `2. 装修：PUT ${origin}/api/cells/update`,
      `   Header: Authorization: Bearer <api_key>`,
      `   Header: Content-Type: application/json`,
      `   JSON: ${JSON.stringify(fields)}`,
      `   只提交上面这些字段，不要加我没写的字段。`
    )
  } else {
    lines.push(
      `2. 装修：我这次没有指定装修内容，先不要调用 /api/cells/update；买到后告诉我格子链接，装修由我之后再定（接口说明见文末的文档）。`
    )
  }
  lines.push(
    `3. 回报给我：`,
    `   - 交易哈希，以及浏览器链接（Monad：https://monadvision.com/tx/<hash>；Base：https://basescan.org/tx/<hash>）`,
    `   - 格子链接：${origin}/?x=${first.x}&y=${first.y}${single ? '' : `（其余格子同样格式：${origin}/?x=<x>&y=<y>）`}`,
    `   - ${hasFields ? '装修是否成功（PUT 返回的结果）' : '买下了哪些格子'}`,
    ``,
    `【出现问题时】`,
    `- 409 cell_taken（多格是 cells_taken）：格子已经有主人了。换成附近的空格之前先问我，不要自己改坐标重买。`,
    `- 403 reserved / reserved_showcase：这是保留区或展示位，不能买。告诉我，不要重试。`,
    `- 再次返回 402，或结算失败（settlement_failed）：不要重复付款，把完整的错误和交易信息报告给我。`,
    `- MoneySwitch 返回 approval_required（需要审批）：等我批准后，用同一个 approval_id、同样的 url / method / body 重试。`,
    ``,
    `说明文档：${origin}/skill.md`
  )
  return lines.join('\n')
}
