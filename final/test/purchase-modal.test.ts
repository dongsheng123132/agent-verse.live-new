import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PurchaseModal } from '../components/PurchaseModal'
import { AGENTVERSE_PAY_TO, MONEYSWITCH_URL } from '../lib/ai-purchase-prompt'
import { WALLET_PAY_ENABLED, WALLET_PAY_PAUSED_LABEL } from '../lib/wallet-pay/feature'

function render(cells: { x: number; y: number }[], extra: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    React.createElement(PurchaseModal, { selectedCells: cells, onClose: () => {}, onPurchased: () => {}, ...extra })
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
  it('the wallet switch is off by default', () => {
    expect(WALLET_PAY_ENABLED).toBe(false)
  })

  it('the browser-wallet button is rendered but disabled, with the paused wording', () => {
    const html = render([{ x: 61, y: 61 }])
    const tag = tagOf(html, 'wallet-pay')
    expect(tag).not.toBeNull()
    expect(tag).toMatch(/\sdisabled(=""|\s|>)/)
    expect(html).toContain(WALLET_PAY_PAUSED_LABEL)
    expect(WALLET_PAY_PAUSED_LABEL).toBe('钱包直付（暂停：钱包安全插件会把付款签名误报为风险）')
    // none of the live wallet UI is there
    expect(tagOf(html, 'net-monad')).toBeNull()
    expect(html).not.toContain('连接钱包付款')
    expect(html).not.toContain('选择付款网络')
  })

  it('the credit-card (Commerce) button is gone', () => {
    expect(render([{ x: 61, y: 61 }])).not.toContain('信用卡支付暂停')
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
    expect(pre).toContain('- body: {"x":61,"y":61}')
    expect(pre).toContain('- max_price: "0.10"')
    expect(pre).toContain('付款前先向我确认总价')
    expect(pre).toContain('/skill.md')
  })

  it('a referral code from the URL goes into the prompt body', () => {
    const html = render([{ x: 61, y: 61 }], { refCode: 'ref_10_20' })
    expect(unescapeHtml(html)).toContain('{"x":61,"y":61,"ref":"ref_10_20"}')
  })

  it('shows the "no AI wallet yet" help: MoneySwitch link and the awal alternative', () => {
    const html = render([{ x: 61, y: 61 }])
    expect(html).toContain('还没有 AI 钱包？')
    expect(html).toContain('MoneySwitch')
    expect(html).toContain(`href="${MONEYSWITCH_URL}"`)
    expect(html).toContain('大额付款需要你批准，私钥不交给 AI')
    expect(html).toContain('npx awal')
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

  it('when the switch is turned on the wallet UI comes back (network choice, no paused label)', () => {
    const html = render([{ x: 61, y: 61 }], { walletPayEnabled: true })
    expect(tagOf(html, 'net-monad')).not.toBeNull()
    expect(tagOf(html, 'net-base')).not.toBeNull()
    expect(html).toContain('选择付款网络')
    expect(html).not.toContain(WALLET_PAY_PAUSED_LABEL)
  })
})
