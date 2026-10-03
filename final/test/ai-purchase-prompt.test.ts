import { describe, expect, it } from 'vitest'
import {
  AGENTVERSE_PAY_TO,
  DEFAULT_ORIGIN,
  MAX_BULK_CELLS,
  SKILL_SECTION_NAME,
  buildAiPurchasePrompt,
  pickDecorateFields,
  purchaseBody,
  totalPriceUsdc,
  validateDecorateFields,
} from '../lib/ai-purchase-prompt'
import { PAY_NETWORKS } from '../lib/networks'
import * as flow from '../lib/x402-flow'

const ORIGIN = 'https://www.agent-verse.live'
const ONE = [{ x: 61, y: 61 }]
const FIELDS = { title: 'Moon Cafe', summary: 'A tiny cafe', fill_color: '#7c3aed', iframe_url: 'https://moon.example.com', service_url: 'https://api.moon.example.com/paid' }
// a full 3 x 2 rectangle, deliberately scrambled
const RECT = [{ x: 39, y: 15 }, { x: 37, y: 14 }, { x: 38, y: 14 }, { x: 39, y: 14 }, { x: 37, y: 15 }, { x: 38, y: 15 }]
// an L shape: not a rectangle
const ELL = [{ x: 37, y: 14 }, { x: 38, y: 14 }, { x: 37, y: 15 }]

function lines(p: string): string[] {
  return p.split('\n')
}

describe('single cell prompt', () => {
  const p = buildAiPurchasePrompt({ origin: ORIGIN, cells: ONE, decorate: FIELDS })

  it('is short enough to review in ~10 seconds: at most 15 lines, with and without decoration', () => {
    expect(lines(p).length).toBeLessThanOrEqual(15)
    expect(lines(buildAiPurchasePrompt({ origin: ORIGIN, cells: ONE })).length).toBeLessThanOrEqual(15)
  })

  it('names the cell and states the confirmed total as a hard cap, paying directly (no second confirmation)', () => {
    expect(p).toContain('格子 (61,61)')
    expect(p).toContain('总价 0.10 USDC 我已确认，直接付款；实际付款不得超过 0.10 USDC')
    expect(p).not.toContain('付款前先向我确认')
    expect(p).not.toContain('确认总价')
  })

  it('the request: method, url and body of the single-cell endpoint', () => {
    expect(p).toContain(`【请求】POST ${ORIGIN}/api/cells/purchase`)
    expect(p).toContain('body: {"x":61,"y":61}')
    expect(p).not.toContain('bulk-purchase')
  })

  it('payTo check and networks, Monad first', () => {
    expect(p).toContain(AGENTVERSE_PAY_TO)
    expect(p).toContain('payTo 不一致就先停下来问我')
    expect(p).toContain('Monad eip155:143 优先')
    expect(p.indexOf('eip155:143')).toBeLessThan(p.indexOf('eip155:8453'))
    expect(p).toContain('Base eip155:8453')
  })

  it('decoration: PUT with Bearer header and ONLY the filled-in JSON', () => {
    expect(p).toContain(`PUT ${ORIGIN}/api/cells/update`)
    expect(p).toContain('Authorization: Bearer <api_key>')
    expect(p).toContain('Content-Type: application/json')
    expect(lines(p)).toContain(JSON.stringify(FIELDS))
    expect(p).toContain('只提交这些字段')
  })

  it('one-line api_key safety rule: shown once, save safely and say where, never public; no key value inside', () => {
    const rule = lines(p).filter((l) => l.startsWith('【api_key】'))
    expect(rule).toHaveLength(1)
    expect(rule[0]).toContain('gk_ 开头，只返回一次')
    expect(rule[0]).toContain('保存在安全的位置并告诉我保存在哪')
    expect(rule[0]).toContain('不要贴到任何公开的地方')
    expect(p).not.toMatch(/gk_[0-9a-f]{8,}/i)
  })

  it('report-back: tx hash, both explorers, cell link, decoration result', () => {
    expect(p).toContain('交易哈希')
    expect(p).toContain('Monad：https://monadvision.com/tx/<hash>')
    expect(p).toContain('Base：https://basescan.org/tx/<hash>')
    expect(p).toContain(`格子链接 ${ORIGIN}/?x=61&y=61`)
    expect(p).toContain('装修是否成功')
  })

  it('the how-to-pay and error-handling content is NOT inlined: one closing line points at the skill.md section', () => {
    const last = lines(p)[lines(p).length - 1]
    expect(last).toBe(`怎么用 x402 付款（MoneySwitch / 其他 x402 钱包）、出错怎么处理：先读 ${ORIGIN}/skill.md 的「AI 购买」一节。`)
    expect(SKILL_SECTION_NAME).toBe('AI 购买')
    for (const gone of ['方式一', '方式二', '出现问题时', 'paid_fetch', '/v1/fetch', 'max_price', 'cell_taken', 'approval_id', 'settlement_failed']) {
      expect(p, gone).not.toContain(gone)
    }
  })

  it('no awal command anywhere, no claim about handing a private key to the AI', () => {
    expect(p).not.toContain('awal')
    expect(p).not.toContain('-X POST')
    expect(p).not.toContain('私钥')
  })

  it('with no fields filled in: no PUT call, the AI is told to skip decorating', () => {
    const bare = buildAiPurchasePrompt({ origin: ORIGIN, cells: ONE })
    expect(bare).not.toContain('PUT ')
    expect(bare).not.toContain('Authorization: Bearer')
    expect(bare).toContain('我这次没有指定装修内容，不要调用 /api/cells/update')
    expect(bare).toContain('买下了哪些格子')
    expect(bare).not.toContain('，并装修')
  })
})

describe('multi-cell prompt', () => {
  it('full rectangle: bulk endpoint, row-major body, whole block decorated together under the top-left key', () => {
    const p = buildAiPurchasePrompt({ origin: ORIGIN, cells: RECT, decorate: { title: 'Billboard' } })
    expect(p).toContain(`【请求】POST ${ORIGIN}/api/cells/bulk-purchase`)
    expect(p).toContain('body: {"cells":[{"x":37,"y":14},{"x":38,"y":14},{"x":39,"y":14},{"x":37,"y":15},{"x":38,"y":15},{"x":39,"y":15}]}')
    expect(p).toContain('总价 0.60 USDC 我已确认，直接付款；实际付款不得超过 0.60 USDC')
    expect(p).toContain('多格是一整块 3×2：api_key 对应左上角 (37,14)，一次装修整块一起变')
    expect(p).not.toContain('只对应第一格')
    expect(p).toContain(`格子链接 ${ORIGIN}/?x=37&y=14`)
    expect(p).toContain('6 个格子 (37,14) (38,14) (39,14) (37,15) (38,15) (39,15)')
    expect(lines(p).length).toBeLessThanOrEqual(15)
  })

  it('not a rectangle: the old note, the key only covers the first cell', () => {
    const p = buildAiPurchasePrompt({ origin: ORIGIN, cells: ELL, decorate: { title: 'x' } })
    expect(p).toContain('这些格子拼不成完整矩形：只返回一把 api_key，只对应第一格 (37,14)，装修也只改这一格')
    expect(p).not.toContain('一整块')
    expect(p).toContain('总价 0.30 USDC')
  })

  it('totals are exact (no floating point drift): 7 cells = 0.70, 11 = 1.10, 100 = 10.00', () => {
    expect(totalPriceUsdc(7)).toBe('0.70')
    expect(totalPriceUsdc(11)).toBe('1.10')
    expect(totalPriceUsdc(100)).toBe('10.00')
    const seven = Array.from({ length: 7 }, (_, i) => ({ x: 20 + i, y: 20 }))
    const p = buildAiPurchasePrompt({ origin: ORIGIN, cells: seven })
    expect(p).toContain('总价 0.70 USDC 我已确认')
    expect(p).toContain('多格是一整块 7×1')
  })

  it('a big selection is summarised in the goal line but the body still carries every cell', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ x: 20 + (i % 10), y: 30 + Math.floor(i / 10) }))
    const big = buildAiPurchasePrompt({ origin: ORIGIN, cells: many })
    expect(big).toContain('100 个格子，范围 (20,30) 到 (29,39)，完整坐标见 body')
    expect(big).toContain('总价 10.00 USDC')
    expect(big).toContain('多格是一整块 10×10')
    const body = big.split('\n').find((l) => l.startsWith('body: '))!
    expect(JSON.parse(body.slice('body: '.length)).cells).toHaveLength(100)
    expect(big).not.toContain('(20,30) (21,30)')
  })

  it('MAX_BULK_CELLS matches the server limit documented in skill.md', () => {
    expect(MAX_BULK_CELLS).toBe(400)
  })
})

describe('decorate fields', () => {
  it('only the filled-in fields go into the PUT body, in a fixed order, trimmed', () => {
    const p = buildAiPurchasePrompt({ origin: ORIGIN, cells: ONE, decorate: { title: '  My Shop ', fill_color: '#7c3aed', summary: '   ', iframe_url: '' } })
    expect(lines(p)).toContain('{"title":"My Shop","fill_color":"#7c3aed"}')
    expect(p).not.toContain('"summary"')
    expect(p).not.toContain('"iframe_url"')
    expect(p).not.toContain('"service_url"')
  })

  it('all five fields, service_url included', () => {
    const p = buildAiPurchasePrompt({ origin: ORIGIN, cells: ONE, decorate: FIELDS })
    expect(lines(p)).toContain(JSON.stringify(FIELDS))
    expect(p).toContain('，并装修')
  })

  it('values with quotes / newlines are JSON-escaped and cannot break out of the one-line JSON', () => {
    const p = buildAiPurchasePrompt({ origin: ORIGIN, cells: ONE, decorate: { title: 'say "hi"\nnew line', summary: "it's" } })
    const json = lines(p).find((l) => l.startsWith('{"title"'))!
    expect(JSON.parse(json)).toEqual({ title: 'say "hi"\nnew line', summary: "it's" })
  })

  it('pickDecorateFields drops blanks and non-strings', () => {
    expect(pickDecorateFields(null)).toEqual({})
    expect(pickDecorateFields({ title: ' ', summary: 'x' })).toEqual({ summary: 'x' })
    expect(pickDecorateFields({ title: 5 as unknown as string })).toEqual({})
  })

  it('validateDecorateFields mirrors the server: #RRGGBB colour, https for iframe_url and service_url', () => {
    expect(validateDecorateFields({})).toEqual({})
    expect(validateDecorateFields({ fill_color: '#7c3aed', iframe_url: 'https://x.example', service_url: 'https://y.example' })).toEqual({})
    const bad = validateDecorateFields({ fill_color: 'purple', iframe_url: 'http://x.example', service_url: 'ftp://y' })
    expect(Object.keys(bad).sort()).toEqual(['fill_color', 'iframe_url', 'service_url'])
    expect(validateDecorateFields({ fill_color: '#fff' }).fill_color).toBeTruthy()
  })
})

describe('origin', () => {
  it('every URL follows the given origin; a trailing slash is dropped; the production host does not leak in', () => {
    const p = buildAiPurchasePrompt({ origin: 'http://localhost:3005/', cells: ELL, decorate: { title: 'x' } })
    expect(p).toContain('（http://localhost:3005）')
    expect(p).toContain('【请求】POST http://localhost:3005/api/cells/bulk-purchase')
    expect(p).toContain('PUT http://localhost:3005/api/cells/update')
    expect(p).toContain('格子链接 http://localhost:3005/?x=37&y=14')
    expect(p).toContain('先读 http://localhost:3005/skill.md 的「AI 购买」一节')
    expect(p).not.toContain('agent-verse.live')
  })

  it('a blank origin falls back to the production host', () => {
    expect(buildAiPurchasePrompt({ origin: '', cells: ONE })).toContain(`先读 ${DEFAULT_ORIGIN}/skill.md`)
    expect(buildAiPurchasePrompt({ cells: ONE })).toContain(`【请求】POST ${DEFAULT_ORIGIN}/api/cells/purchase`)
  })

  it('the request body is only the cell coordinates (no referral or any other field)', () => {
    expect(purchaseBody(ONE)).toBe('{"x":61,"y":61}')
    expect(buildAiPurchasePrompt({ origin: ORIGIN, cells: ELL })).toContain('{"x":37,"y":15}]}')
    expect(buildAiPurchasePrompt({ origin: ORIGIN, cells: ONE })).not.toContain('"ref"')
  })
})

describe('guards and consistency with the rest of the repo', () => {
  it('refuses an empty selection', () => {
    expect(() => buildAiPurchasePrompt({ origin: ORIGIN, cells: [] })).toThrow()
  })

  it('both networks and their explorers match the lib/networks tables', () => {
    expect(PAY_NETWORKS.mainnet.monad.caip2).toBe('eip155:143')
    expect(PAY_NETWORKS.mainnet.base.caip2).toBe('eip155:8453')
    const p = buildAiPurchasePrompt({ origin: ORIGIN, cells: ONE })
    expect(p).toContain(`${PAY_NETWORKS.mainnet.monad.explorerUrl}/tx/<hash>`)
    expect(p).toContain(`${PAY_NETWORKS.mainnet.base.explorerUrl}/tx/<hash>`)
  })

  it.skipIf(!!process.env.PAY_TO_ADDRESS)('AGENTVERSE_PAY_TO equals the server default PAY_TO_ADDRESS in lib/x402-flow.ts', () => {
    expect(AGENTVERSE_PAY_TO).toBe(flow.PAY_TO_ADDRESS)
  })
})
