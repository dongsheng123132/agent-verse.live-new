import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PurchaseModal } from '../components/PurchaseModal'
import { AGENTVERSE_PAY_TO, MONEYSWITCH_URL } from '../lib/ai-purchase-prompt'

function render(cells: { x: number; y: number }[], extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    React.createElement(PurchaseModal, { selectedCells: cells, onClose: () => {}, ...extra })
  )
}

function unescapeHtml(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/** The opening tag of the first element carrying this data-testid. */
function tagOf(html: string, testId: string): string | null {
  const m = html.match(new RegExp(`<(button|input|pre|span|div|details)[^>]*data-testid="${testId}"[^>]*>`))
  return m ? m[0] : null
}

describe('PurchaseModal (AI-first)', () => {
  it('there is no browser-wallet payment UI at all (button, network picker, credit card)', () => {
    const html = render([{ x: 61, y: 61 }])
    expect(tagOf(html, 'wallet-pay')).toBeNull()
    expect(tagOf(html, 'net-monad')).toBeNull()
    expect(html).not.toContain('钱包直付')
    expect(html).not.toContain('连接钱包付款')
    expect(html).not.toContain('选择付款网络')
    expect(html).not.toContain('信用卡支付')
  })

  it('shows the chosen cell, count, total, receiving address and both networks (Monad first)', () => {
    const html = render([{ x: 61, y: 61 }])
    expect(html).toContain('(61, 61)')
    expect(html).toMatch(/data-testid="total-price"[^>]*>\$0\.10 USDC</)
    expect(html).toContain('0.10 ×')
    expect(html).toContain(AGENTVERSE_PAY_TO)
    expect(html.indexOf('eip155:143')).toBeGreaterThan(-1)
    expect(html.indexOf('eip155:143')).toBeLessThan(html.indexOf('eip155:8453'))
  })

  it('several cells: total is count x 0.10 and every coordinate is listed (up to 8)', () => {
    const cells = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }]
    const html = render(cells)
    expect(html).toMatch(/data-testid="total-price"[^>]*>\$0\.30 USDC</)
    expect(html).toContain('(1,1) (2,1) (3,1)')
    expect(html).toContain('3 cells')
  })

  it('has the optional look inputs: title, summary, fill_color (colour picker), iframe_url, service_url', () => {
    const html = render([{ x: 61, y: 61 }])
    for (const id of ['ai-title', 'ai-summary', 'ai-fill-color', 'ai-iframe', 'ai-service-url']) {
      expect(tagOf(html, id), id).not.toBeNull()
    }
    expect(html).toContain('type="color"')
    expect(html).toContain('想要的样子（可选')
  })

  it('primary button is 复制给我的 AI and enabled when nothing is wrong', () => {
    const html = render([{ x: 61, y: 61 }])
    const tag = tagOf(html, 'copy-for-ai')
    expect(tag).not.toBeNull()
    expect(tag).not.toMatch(/\sdisabled(=""|\s|>)/)
    expect(html).toContain('复制给我的 AI')
  })

  it('the prompt preview is the generated prompt for these cells', () => {
    const html = render([{ x: 61, y: 61 }])
    const pre = unescapeHtml(html.match(/<pre[^>]*data-testid="ai-prompt"[^>]*>([\s\S]*?)<\/pre>/)![1])
    expect(pre).toContain('/api/cells/purchase')
    expect(pre).toContain('body: {"x":61,"y":61}')
    expect(pre).toContain('总价 0.10 USDC 我已确认，直接付款')
    expect(pre).not.toContain('付款前先向我确认')
    expect(pre).toContain('/skill.md 的「AI 购买」一节')
    expect(pre.split(String.fromCharCode(10)).length).toBeLessThanOrEqual(15)
  })

  it('a referral code from the URL goes into the prompt body', () => {
    const html = render([{ x: 61, y: 61 }], { refCode: 'ref_10_20' })
    expect(unescapeHtml(html)).toContain('{"x":61,"y":61,"ref":"ref_10_20"}')
  })

  it('the helper text under the button says the AI pays the confirmed total directly, never more', () => {
    const html = render([{ x: 61, y: 61 }])
    const helper = html.match(/data-testid="ai-helper"[^>]*>([\s\S]*?)<\/p>/)![1]
    expect(helper).toContain('总价')
    expect(helper).toContain('0.10 USDC')
    expect(helper).toContain('AI 直接付款')
    expect(helper).toContain('不会超过')
    expect(helper).not.toContain('先向你确认')
    expect(helper).not.toContain('你同意后才付款')
  })

  it('"还没有 AI 钱包？" lists exactly three options with the right facts', () => {
    const html = render([{ x: 61, y: 61 }])
    expect(html).toContain('还没有 AI 钱包？')
    const box = html.match(/data-testid="no-ai-wallet"[\s\S]*?<\/ul>/)![0]
    expect((box.match(/<li /g) || []).length).toBe(3)
    // MoneySwitch: budgets / approval, the AI never holds the private key
    expect(box).toContain('MoneySwitch')
    expect(box).toContain(`href="${MONEYSWITCH_URL}"`)
    expect(box).toContain('有额度、大额要你批准，AI 拿不到私钥')
    // awal: Coinbase, email login, Base only
    expect(box).toContain('awal')
    expect(box).toContain('Coinbase')
    expect(box).toContain('邮箱登录')
    expect(box).toContain('只支持 Base')
    // raw private key + x402 client: the whole wallet goes to the AI
    expect(box).toContain('私钥 + x402 客户端')
    expect(box).toContain('等于把整个钱包交给 AI，里面只放小额')
    // the old, wrong claim about awal is gone everywhere
    expect(html).not.toContain('等于把钱包私钥交给 AI')
    expect(html).not.toContain('npx awal')
    expect(html).not.toContain('-X POST')
  })

  it('has the "我让 AI 买完了" button (disabled only if the page gave no refresh handler)', () => {
    expect(tagOf(render([{ x: 61, y: 61 }]), 'ai-done')).toMatch(/\sdisabled(=""|\s|>)/)
    const withHandler = render([{ x: 61, y: 61 }], { onAiDone: async () => ({ owned: 0, total: 1 }) })
    expect(tagOf(withHandler, 'ai-done')).not.toMatch(/\sdisabled(=""|\s|>)/)
    expect(withHandler).toContain('我让 AI 买完了')
  })

  it('too many cells (> 400): warns and disables the copy button', () => {
    const many = Array.from({ length: 401 }, (_, i) => ({ x: i % 100, y: 20 + Math.floor(i / 100) }))
    const html = render(many)
    expect(html).toContain('data-testid="too-many"')
    expect(tagOf(html, 'copy-for-ai')).toMatch(/\sdisabled(=""|\s|>)/)
  })
})
