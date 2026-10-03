import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// probeCellService() runs a real SSRF DNS check before fetching; mock node:dns
// so the "can_pay"/"failed" probe tests below are offline and deterministic
// (real network resolution of svc.example.com is neither available nor
// desirable in a unit test).
vi.mock('node:dns', () => ({
  default: { promises: { lookup: async () => [{ address: '93.184.216.34', family: 4 }] } },
  promises: { lookup: async () => [{ address: '93.184.216.34', family: 4 }] },
}))

import {
  parseX402Response,
  findSupportedUsdcAccept,
  findAllSupportedUsdcAccepts,
  formatUsdcAmount,
  BASE_NETWORK,
  MONAD_NETWORK,
  BASE_USDC_ADDRESS,
  MONAD_USDC_ADDRESS,
} from '../../lib/market/x402'
import { probeCellService } from '../../lib/market/probe'
import { fromStoredStatus, toStoredStatus } from '../../lib/market/types'

function v2Header(accepts: unknown[]): string {
  return Buffer.from(JSON.stringify({ x402Version: 2, accepts })).toString('base64')
}

describe('lib/market/x402 parseX402Response', () => {
  it('parses a v2 PAYMENT-REQUIRED header over a v1 body when both are present', () => {
    const header = v2Header([{ scheme: 'exact', network: MONAD_NETWORK, amount: '100000', asset: MONAD_USDC_ADDRESS, payTo: '0xabc' }])
    const parsed = parseX402Response(header, JSON.stringify({ x402Version: 1, accepts: [] }))
    expect(parsed?.x402Version).toBe(2)
    expect(parsed?.accepts[0].network).toBe(MONAD_NETWORK)
  })

  it('falls back to v1 body when there is no header', () => {
    const body = JSON.stringify({
      x402Version: 1,
      accepts: [{ scheme: 'exact', network: BASE_NETWORK, maxAmountRequired: '50000', asset: BASE_USDC_ADDRESS, payTo: '0xdef' }],
    })
    const parsed = parseX402Response(null, body)
    expect(parsed?.x402Version).toBe(1)
    expect(parsed?.accepts[0].amount).toBe('50000')
  })

  it('returns null for garbage input', () => {
    expect(parseX402Response(null, 'not json')).toBeNull()
    expect(parseX402Response('not-base64-json!!', 'also not json')).toBeNull()
  })
})

describe('lib/market/x402 findSupportedUsdcAccept', () => {
  it('finds a Base USDC accept', () => {
    const accept = findSupportedUsdcAccept([{ scheme: 'exact', network: BASE_NETWORK, amount: '1', asset: BASE_USDC_ADDRESS, payTo: '0x1' }])
    expect(accept?.network).toBe(BASE_NETWORK)
  })

  it('finds a Monad USDC accept (case-insensitive asset match)', () => {
    const accept = findSupportedUsdcAccept([
      { scheme: 'exact', network: MONAD_NETWORK, amount: '1', asset: MONAD_USDC_ADDRESS.toUpperCase(), payTo: '0x1' },
    ])
    expect(accept?.network).toBe(MONAD_NETWORK)
  })

  it('returns null when accepts has neither Base nor Monad USDC', () => {
    const accept = findSupportedUsdcAccept([{ scheme: 'exact', network: 'eip155:1', amount: '1', asset: '0xSomeOtherAsset', payTo: '0x1' }])
    expect(accept).toBeNull()
  })

  it('Monad wins over Base when a service accepts both (Monad-priority market)', () => {
    const accept = findSupportedUsdcAccept([
      { scheme: 'exact', network: BASE_NETWORK, amount: '1', asset: BASE_USDC_ADDRESS, payTo: '0xBase' },
      { scheme: 'exact', network: MONAD_NETWORK, amount: '1', asset: MONAD_USDC_ADDRESS, payTo: '0xMonad' },
    ])
    expect(accept?.network).toBe(MONAD_NETWORK)
    expect(accept?.payTo).toBe('0xMonad')
  })
})

describe('lib/market/x402 findAllSupportedUsdcAccepts', () => {
  // A 402 fixture with 12 chains in `accepts` (mirrors the real
  // agent402.tools/api/uuid response shape this fix is for): Base and Monad
  // USDC (both supported) plus 10 other unsupported chains.
  const OTHER_CHAINS = Array.from({ length: 10 }, (_, i) => ({
    scheme: 'exact',
    network: `eip155:${1000 + i}`,
    amount: '99999',
    asset: `0xOtherChainAsset${i}`,
    payTo: '0xOther',
  }))

  it('returns Monad first, then Base, ignoring the other 10 unsupported chains — regardless of accepts order', () => {
    const accepts = [
      ...OTHER_CHAINS.slice(0, 5),
      { scheme: 'exact', network: BASE_NETWORK, amount: '200000', asset: BASE_USDC_ADDRESS, payTo: '0xBasePay' },
      ...OTHER_CHAINS.slice(5),
      { scheme: 'exact', network: MONAD_NETWORK, amount: '10000', asset: MONAD_USDC_ADDRESS, payTo: '0xMonadPay' },
    ]
    const matches = findAllSupportedUsdcAccepts(accepts)
    expect(matches).toHaveLength(2)
    expect(matches[0]).toMatchObject({ network: MONAD_NETWORK, amount: '10000', payTo: '0xMonadPay' })
    expect(matches[1]).toMatchObject({ network: BASE_NETWORK, amount: '200000', payTo: '0xBasePay' })
  })

  it('returns just the one supported network when only Base is present', () => {
    const matches = findAllSupportedUsdcAccepts([
      ...OTHER_CHAINS,
      { scheme: 'exact', network: BASE_NETWORK, amount: '5000', asset: BASE_USDC_ADDRESS, payTo: '0xBasePay' },
    ])
    expect(matches).toEqual([{ scheme: 'exact', network: BASE_NETWORK, amount: '5000', asset: BASE_USDC_ADDRESS, payTo: '0xBasePay' }])
  })

  it('returns an empty array when none of the 12 chains are supported', () => {
    expect(findAllSupportedUsdcAccepts(OTHER_CHAINS)).toEqual([])
  })
})

describe('lib/market/x402 formatUsdcAmount', () => {
  it('formats base units to human-readable USDC', () => {
    expect(formatUsdcAmount('100000')).toBe('0.1')
    expect(formatUsdcAmount('10000000')).toBe('10')
    expect(formatUsdcAmount('1')).toBe('0.000001')
  })
  it('rejects non-numeric amounts', () => {
    expect(formatUsdcAmount('not-a-number')).toBeNull()
    expect(formatUsdcAmount(null)).toBeNull()
  })
})

describe('lib/market/probe probeCellService', () => {
  it('never fetches a POST-method service (unchecked, no network call)', async () => {
    const fetchImpl = vi.fn()
    const result = await probeCellService({ url: 'https://example.com/pay', method: 'POST' }, { fetchImpl: fetchImpl as any })
    expect(result.status).toBe('unchecked')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a private-IP GET target before ever calling fetch (SSRF)', async () => {
    const fetchImpl = vi.fn()
    const result = await probeCellService({ url: 'https://127.0.0.1/pay', method: 'GET' }, { fetchImpl: fetchImpl as any })
    expect(result.status).toBe('failed')
    expect(result.note).toMatch(/SSRF/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('marks can_pay when GET returns a v2 402 with a matching Base/Monad USDC accept', async () => {
    const header = v2Header([{ scheme: 'exact', network: MONAD_NETWORK, amount: '50000', asset: MONAD_USDC_ADDRESS, payTo: '0xPayTo' }])
    const fetchImpl = vi.fn(async () => ({
      status: 402,
      headers: { get: (name: string) => (name === 'payment-required' ? header : null) },
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    }))
    const result = await probeCellService({ url: 'https://svc.example.com/api', method: 'GET' }, { fetchImpl: fetchImpl as any })
    expect(result.status).toBe('can_pay')
    expect(result.network).toBe(MONAD_NETWORK)
    expect(result.price_usdc).toBe('0.05')
    expect(result.payTo).toBe('0xPayTo')
  })

  it('marks failed when 402 accepts do not include Base or Monad USDC', async () => {
    const header = v2Header([{ scheme: 'exact', network: 'eip155:1', amount: '50000', asset: '0xSomethingElse', payTo: '0xPayTo' }])
    const fetchImpl = vi.fn(async () => ({
      status: 402,
      headers: { get: (name: string) => (name === 'payment-required' ? header : null) },
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    }))
    const result = await probeCellService({ url: 'https://svc.example.com/api', method: 'GET' }, { fetchImpl: fetchImpl as any })
    expect(result.status).toBe('failed')
  })

  it('picks Monad as the main network and lists both networks when a 402 accepts 12 chains including Monad + Base USDC', async () => {
    // Mirrors the real https://agent402.tools/api/uuid 402 response shape:
    // accepts lists many chains; the service happens to put Base BEFORE
    // Monad in the array, and 10 other unrelated chains around them.
    const otherChains = Array.from({ length: 10 }, (_, i) => ({
      scheme: 'exact',
      network: `eip155:${2000 + i}`,
      amount: '1',
      asset: `0xOther${i}`,
      payTo: '0xOther',
    }))
    const header = v2Header([
      ...otherChains.slice(0, 4),
      { scheme: 'exact', network: BASE_NETWORK, amount: '200000', asset: BASE_USDC_ADDRESS, payTo: '0xBasePay' },
      ...otherChains.slice(4),
      { scheme: 'exact', network: MONAD_NETWORK, amount: '10000', asset: MONAD_USDC_ADDRESS, payTo: '0xMonadPay' },
    ])
    const fetchImpl = vi.fn(async () => ({
      status: 402,
      headers: { get: (name: string) => (name === 'payment-required' ? header : null) },
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    }))
    const result = await probeCellService({ url: 'https://agent402.tools/api/uuid', method: 'GET' }, { fetchImpl: fetchImpl as any })

    expect(result.status).toBe('can_pay')
    // Main display network is Monad (Monad-priority market), even though
    // Base appeared first in accepts and Monad appeared last.
    expect(result.network).toBe(MONAD_NETWORK)
    expect(result.price_usdc).toBe('0.01')
    expect(result.payTo).toBe('0xMonadPay')
    expect(result.asset?.toLowerCase()).toBe(MONAD_USDC_ADDRESS.toLowerCase())

    expect(result.networks).toEqual([
      { network: MONAD_NETWORK, price_usdc: '0.01', payTo: '0xMonadPay', asset: MONAD_USDC_ADDRESS },
      { network: BASE_NETWORK, price_usdc: '0.2', payTo: '0xBasePay', asset: BASE_USDC_ADDRESS },
    ])
    // The other 10 chains never show up.
    expect(result.networks?.some((n) => n.network.startsWith('eip155:2'))).toBe(false)
  })

  it('marks failed when the response is not a 402', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 200,
      headers: { get: () => null },
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    }))
    const result = await probeCellService({ url: 'https://svc.example.com/api', method: 'GET' }, { fetchImpl: fetchImpl as any })
    expect(result.status).toBe('failed')
  })
})

describe('lib/market/probe — can_pay means a valid x402 v2 402', () => {
  const okAccept = { scheme: 'exact', network: MONAD_NETWORK, amount: '50000', asset: MONAD_USDC_ADDRESS, payTo: '0xPayTo' }

  function res402(opts: { header?: string | null; body?: string }) {
    return vi.fn(async () => ({
      status: 402,
      headers: { get: (name: string) => (name === 'payment-required' ? opts.header ?? null : null) },
      text: async () => opts.body ?? '',
      arrayBuffer: async () => new ArrayBuffer(0),
    }))
  }

  it('an x402 v1 402 (body only, x402Version 1) is failed, even when its accepts name Monad USDC', async () => {
    const fetchImpl = res402({ body: JSON.stringify({ x402Version: 1, accepts: [okAccept] }) })
    const result = await probeCellService({ url: 'https://svc.example.com/api', method: 'GET' }, { fetchImpl: fetchImpl as any })
    expect(result.status).toBe('failed')
    expect(result.note).toContain('v1')
  })

  it('a v2 402 carried in the body (no header) is can_pay', async () => {
    const fetchImpl = res402({ body: JSON.stringify({ x402Version: 2, accepts: [okAccept] }) })
    const result = await probeCellService({ url: 'https://svc.example.com/api', method: 'GET' }, { fetchImpl: fetchImpl as any })
    expect(result.status).toBe('can_pay')
    expect(result.networks?.map((n) => n.network)).toEqual([MONAD_NETWORK])
  })

  it('can_pay never carries on-chain evidence fields', async () => {
    const fetchImpl = res402({ header: v2Header([okAccept]) })
    const result = await probeCellService({ url: 'https://svc.example.com/api', method: 'GET' }, { fetchImpl: fetchImpl as any })
    expect(Object.keys(result)).not.toContain('evidence')
    expect(Object.keys(result)).not.toContain('evidence_by_network')
  })
})

describe('lib/market/types status vocabulary (the DB column keeps the old words)', () => {
  it('maps the stored words to the probe-only ones; verified and candidate both read as can_pay', () => {
    expect(fromStoredStatus('candidate')).toBe('can_pay')
    expect(fromStoredStatus('verified')).toBe('can_pay')
    expect(fromStoredStatus('failed')).toBe('failed')
    expect(fromStoredStatus('unprobed')).toBe('unchecked')
    expect(fromStoredStatus(null)).toBe('unchecked')
    expect(fromStoredStatus(undefined)).toBe('unchecked')
    expect(fromStoredStatus('anything else')).toBe('unchecked')
  })

  it('writes the words grid_cells_probe_status_check allows, and round-trips', () => {
    const allowed = ['verified', 'candidate', 'failed', 'unprobed']
    for (const s of ['can_pay', 'failed', 'unchecked'] as const) {
      expect(allowed).toContain(toStoredStatus(s))
      expect(fromStoredStatus(toStoredStatus(s))).toBe(s)
    }
  })
})
