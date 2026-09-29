import { describe, expect, it } from 'vitest'
import { groupSellers } from '../../lib/market/market'
import type { MarketEntry, MarketEvidence, MarketStatus } from '../../lib/market/types'

/**
 * groupSellers() 分组逻辑的纯函数测试——不需要数据库，直接手工搭 MarketEntry
 * 夹具。原型场景见任务描述：agent402 的 15 个工具共用同一个收款地址
 * （0xaBF4FAbd…），本测试用 3 个来代表"好几个接口共享一份证据"。
 */
function makeEvidence(network: string, payers: number): MarketEvidence {
  return {
    network,
    payers,
    transfers: payers > 0 ? payers * 10 : 0,
    last_tx: payers > 0 ? '0x985c4a' : null,
    last_at: payers > 0 ? '2026-09-28T00:00:00.000Z' : null,
    source: 'rpc-short-window',
    window: { blocks: 12006, human: '约 6.7 小时' },
    payers_7d: payers,
    transfers_7d: payers > 0 ? payers * 10 : 0,
    window_blocks: 12006,
  }
}

function makeEntry(overrides: Partial<MarketEntry> & { name: string; url: string }): MarketEntry {
  return {
    name: overrides.name,
    url: overrides.url,
    method: 'GET',
    description: null,
    category: null,
    network: 'eip155:8453',
    price_usdc: '0.01',
    pay_to: '0xaBF4FAbd0000000000000000000000000000000',
    networks: [
      { network: 'eip155:143', price_usdc: '0.01', payTo: '0xaBF4FAbd0000000000000000000000000000000', asset: '0xMonadUsdc' },
      { network: 'eip155:8453', price_usdc: '0.01', payTo: '0xaBF4FAbd0000000000000000000000000000000', asset: '0xBaseUsdc' },
    ],
    status: 'verified',
    status_by_network: { 'eip155:143': 'candidate', 'eip155:8453': 'verified' },
    status_label: null,
    evidence: makeEvidence('eip155:8453', 8),
    evidence_by_network: { 'eip155:143': makeEvidence('eip155:143', 0), 'eip155:8453': makeEvidence('eip155:8453', 8) },
    source: 'official',
    origin: 'seed',
    cell: null,
    probed_at: '2026-09-30T00:00:00.000Z',
    note: '',
    seller_id: 'eip155:8453:0xabf4fabd0000000000000000000000000000000',
    ...overrides,
  }
}

describe('lib/market/market groupSellers — grouping + sort', () => {
  it('groups multiple interfaces sharing the same seller_id into one group (agent402-style shared payTo)', () => {
    const entries: MarketEntry[] = [
      makeEntry({ name: 'agent402 tool 1', url: 'https://agent402.tools/api/uuid' }),
      makeEntry({ name: 'agent402 tool 2', url: 'https://agent402.tools/api/quote' }),
      makeEntry({ name: 'agent402 tool 3', url: 'https://agent402.tools/api/weather' }),
      makeEntry({
        name: 'unrelated shop',
        url: 'https://myshop.example.com/api',
        seller_id: 'origin:myshop.example.com',
        pay_to: '0xSomeoneElse',
        status: 'candidate',
        status_by_network: { 'eip155:8453': 'candidate' },
        evidence: null,
        evidence_by_network: null,
      }),
    ]

    const groups = groupSellers(entries)
    expect(groups).toHaveLength(2)

    const agent402Group = groups.find((g) => g.seller_id === 'eip155:8453:0xabf4fabd0000000000000000000000000000000')
    expect(agent402Group?.service_count).toBe(3)
    expect(agent402Group?.services.map((s) => s.name)).toEqual(['agent402 tool 1', 'agent402 tool 2', 'agent402 tool 3'])

    const shopGroup = groups.find((g) => g.seller_id === 'origin:myshop.example.com')
    expect(shopGroup?.service_count).toBe(1)
  })

  it('without a network filter, a group\'s status is its best "any network" status — verified because Base is verified', () => {
    const entries: MarketEntry[] = [makeEntry({ name: 'agent402 tool', url: 'https://agent402.tools/api/uuid' })]
    const groups = groupSellers(entries)
    expect(groups[0].status).toBe('verified')
  })

  it('2026-09-30 honesty fix: filtered by network=eip155:143 (Monad), the SAME group is only candidate — Base evidence does not count', () => {
    const entries: MarketEntry[] = [
      makeEntry({ name: 'agent402 tool 1', url: 'https://agent402.tools/api/uuid' }),
      makeEntry({ name: 'agent402 tool 2', url: 'https://agent402.tools/api/quote' }),
    ]
    const groups = groupSellers(entries, 'eip155:143')
    expect(groups).toHaveLength(1)
    expect(groups[0].status).toBe('candidate')
  })

  it('sorts verified groups before candidate groups; ties broken by service_count descending', () => {
    const verifiedSmall = makeEntry({
      name: 'verified-1-interface',
      url: 'https://a.example.com/x',
      seller_id: 'origin:a.example.com',
      status: 'verified',
      status_by_network: { 'eip155:8453': 'verified' },
    })
    const candidateBig1 = makeEntry({
      name: 'candidate-a',
      url: 'https://b.example.com/x',
      seller_id: 'origin:b.example.com',
      status: 'candidate',
      status_by_network: { 'eip155:8453': 'candidate' },
      evidence: null,
      evidence_by_network: null,
    })
    const candidateBig2 = makeEntry({
      name: 'candidate-b',
      url: 'https://b.example.com/y',
      seller_id: 'origin:b.example.com',
      status: 'candidate',
      status_by_network: { 'eip155:8453': 'candidate' },
      evidence: null,
      evidence_by_network: null,
    })
    const groups = groupSellers([candidateBig1, candidateBig2, verifiedSmall])
    expect(groups.map((g) => g.seller_id)).toEqual(['origin:a.example.com', 'origin:b.example.com'])
  })

  it('an empty entries array produces no groups', () => {
    expect(groupSellers([])).toEqual([])
  })
})
