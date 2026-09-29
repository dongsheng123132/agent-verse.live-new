import { describe, expect, it, vi } from 'vitest'

// probeCellService() runs a real SSRF DNS check before fetching; mock node:dns
// so the "candidate"/"failed" probe tests below are offline and deterministic
// (real network resolution of svc.example.com is neither available nor
// desirable in a unit test).
vi.mock('node:dns', () => ({
  default: { promises: { lookup: async () => [{ address: '93.184.216.34', family: 4 }] } },
  promises: { lookup: async () => [{ address: '93.184.216.34', family: 4 }] },
}))

import {
  parseX402Response,
  findSupportedUsdcAccept,
  formatUsdcAmount,
  BASE_NETWORK,
  MONAD_NETWORK,
  BASE_USDC_ADDRESS,
  MONAD_USDC_ADDRESS,
} from '../../lib/market/x402'
import { probeCellService } from '../../lib/market/probe'
import { summarizeTransfers, deriveStatusFromSummary, parseTransferLog, planLogChunks } from '../../lib/market/rpc'

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
  it('never fetches a POST-method service (unprobed, no network call)', async () => {
    const fetchImpl = vi.fn()
    const result = await probeCellService({ url: 'https://example.com/pay', method: 'POST' }, { fetchImpl: fetchImpl as any })
    expect(result.status).toBe('unprobed')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a private-IP GET target before ever calling fetch (SSRF)', async () => {
    const fetchImpl = vi.fn()
    const result = await probeCellService({ url: 'https://127.0.0.1/pay', method: 'GET' }, { fetchImpl: fetchImpl as any })
    expect(result.status).toBe('failed')
    expect(result.note).toMatch(/SSRF/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('marks candidate when GET returns 402 with a matching Base/Monad USDC accept', async () => {
    const header = v2Header([{ scheme: 'exact', network: MONAD_NETWORK, amount: '50000', asset: MONAD_USDC_ADDRESS, payTo: '0xPayTo' }])
    const fetchImpl = vi.fn(async () => ({
      status: 402,
      headers: { get: (name: string) => (name === 'payment-required' ? header : null) },
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    }))
    const result = await probeCellService({ url: 'https://svc.example.com/api', method: 'GET' }, { fetchImpl: fetchImpl as any })
    expect(result.status).toBe('candidate')
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

describe('lib/market/rpc evidence grading', () => {
  it('parseTransferLog + summarizeTransfers: distinctPayers excludes self-transfers to payTo', () => {
    const payTo = `0x${'b'.repeat(40)}`
    const log1 = parseTransferLog({
      topics: ['0x0', `0x${'0'.repeat(24)}${'a'.repeat(40)}`, `0x${'0'.repeat(24)}${'b'.repeat(40)}`],
      data: '0x',
      blockNumber: '0x10',
      transactionHash: '0xtx1',
    })!
    const selfLog = parseTransferLog({
      topics: ['0x0', `0x${'0'.repeat(24)}${'b'.repeat(40)}`, `0x${'0'.repeat(24)}${'b'.repeat(40)}`],
      data: '0x',
      blockNumber: '0x11',
      transactionHash: '0xtx2',
    })!
    const summary = summarizeTransfers([log1, selfLog], payTo)
    expect(summary.transfers).toBe(2)
    expect(summary.distinctPayers).toBe(1) // self-transfer doesn't count
    expect(summary.lastTransfer?.transactionHash).toBe('0xtx2')
  })

  it('deriveStatusFromSummary: >=1 non-self payer -> verified, 0 -> candidate', () => {
    expect(deriveStatusFromSummary({ transfers: 1, distinctPayers: 1, lastTransfer: null })).toBe('verified')
    expect(deriveStatusFromSummary({ transfers: 0, distinctPayers: 0, lastTransfer: null })).toBe('candidate')
    expect(deriveStatusFromSummary({ transfers: 3, distinctPayers: 0, lastTransfer: null })).toBe('candidate')
  })

  it('planLogChunks respects the per-network chunk range and max-chunks cap', () => {
    const plans = planLogChunks(1000, 100, 6)
    expect(plans.length).toBe(6)
    expect(plans[0]).toEqual({ fromBlock: 900, toBlock: 1000 })
    expect(plans[5].toBlock).toBe(495) // each chunk's `to` is the previous chunk's `from - 1` (no overlap)
  })

  it('planLogChunks stops early when it reaches block 0', () => {
    const plans = planLogChunks(50, 100, 6)
    expect(plans).toEqual([{ fromBlock: 0, toBlock: 50 }])
  })
})
