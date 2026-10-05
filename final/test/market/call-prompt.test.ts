import { describe, expect, it } from 'vitest'
import { buildCallPrompt } from '../../lib/market/call-prompt'

const origin = 'https://www.agent-verse.live'

describe('buildCallPrompt (the "copy for AI" text on /market and the cell service card)', () => {
  it('is wallet-neutral: names the method, URL, price, network and the cell link, and no MoneySwitch-only command', () => {
    const p = buildCallPrompt({
      url: 'https://monad-lingqian.vercel.app/qian',
      method: 'GET',
      priceUsdc: '0.01',
      networks: ['eip155:143'],
      cell: { x: 82, y: 40 },
      origin,
    })
    expect(p).toContain('any x402 client')
    expect(p).toContain('GET https://monad-lingqian.vercel.app/qian')
    expect(p).toContain('$0.01 USDC on Monad (eip155:143)')
    expect(p).toContain('Do not pay more than $0.01')
    expect(p).toContain('https://www.agent-verse.live/?x=82&y=40')
    expect(p).not.toContain('npx moneyswitch')
  })

  it('lists every network, asks before paying when the price is unknown, and flags POST bodies', () => {
    expect(buildCallPrompt({ url: 'https://a.example/x', priceUsdc: '0.05', networks: ['eip155:143', 'eip155:8453'], origin })).toContain(
      'on Monad (eip155:143) or Base (eip155:8453)'
    )
    const unknown = buildCallPrompt({ url: 'https://a.example/x', method: 'post', networks: [], origin })
    expect(unknown).toContain('POST https://a.example/x')
    expect(unknown).toContain('tell me before paying')
    expect(unknown).toContain('request body')
    expect(unknown).toContain('https://www.agent-verse.live/market')
  })
})
