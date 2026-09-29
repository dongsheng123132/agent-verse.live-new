import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
  findAllSupportedUsdcAccepts,
  formatUsdcAmount,
  BASE_NETWORK,
  MONAD_NETWORK,
  BASE_USDC_ADDRESS,
  MONAD_USDC_ADDRESS,
} from '../../lib/market/x402'
import { probeCellService } from '../../lib/market/probe'
import { probeServiceAndEvidence } from '../../lib/market/service'
import { summarizeTransfers, deriveStatusFromSummary, parseTransferLog, planLogChunks, NETWORK_RPC } from '../../lib/market/rpc'

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

    expect(result.status).toBe('candidate')
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

describe('lib/market/service probeServiceAndEvidence — evidence grouped per network, status takes the best', () => {
  const BASE_RPC_URL = NETWORK_RPC[BASE_NETWORK].rpcUrl
  const savedEnvioToken = process.env.ENVIO_API_TOKEN

  beforeEach(() => {
    // Force the RPC short-window path (not HyperSync) regardless of the
    // ambient environment, so this test is deterministic.
    delete process.env.ENVIO_API_TOKEN
  })
  afterEach(() => {
    if (savedEnvioToken !== undefined) process.env.ENVIO_API_TOKEN = savedEnvioToken
  })

  function rpcJsonResponse(body: unknown) {
    return { status: 200, json: async () => body, text: async () => JSON.stringify(body) } as any
  }

  /**
   * Drives probeCellService's 402 GET plus the RPC short-window evidence
   * calls (getLatestBlockNumber + scanPayToEvidence) for BOTH networks in one
   * fetchImpl: Monad's eth_getLogs comes back empty (0 payers -> candidate
   * on its own), Base's eth_getLogs comes back with one non-self transfer (1
   * payer -> verified on its own) — proving the aggregate is 'verified'
   * (best-of-both) even though Monad alone would only be 'candidate'.
   */
  function buildFetchImpl(header: string) {
    return vi.fn(async (url: any, init?: any) => {
      const urlStr = String(url)
      if (urlStr === 'https://svc.example.com/multi-chain') {
        return {
          status: 402,
          headers: { get: (name: string) => (name === 'payment-required' ? header : null) },
          text: async () => '',
          arrayBuffer: async () => new ArrayBuffer(0),
        } as any
      }
      const body = JSON.parse(init.body)
      if (body.method === 'eth_blockNumber') {
        return rpcJsonResponse({ jsonrpc: '2.0', id: body.id, result: '0x64' })
      }
      if (body.method === 'eth_getLogs') {
        if (urlStr === BASE_RPC_URL) {
          return rpcJsonResponse({
            jsonrpc: '2.0',
            id: body.id,
            result: [
              {
                topics: ['0xTransfer', `0x${'0'.repeat(24)}${'a'.repeat(40)}`, `0x${'0'.repeat(24)}${'b'.repeat(40)}`],
                data: '0x',
                blockNumber: '0x10',
                transactionHash: '0xbasetx',
              },
            ],
          })
        }
        return rpcJsonResponse({ jsonrpc: '2.0', id: body.id, result: [] }) // Monad: 0 transfers
      }
      if (body.method === 'eth_getBlockByNumber') {
        return rpcJsonResponse({ jsonrpc: '2.0', id: body.id, result: { timestamp: '0x67aaaaaa' } })
      }
      throw new Error(`unexpected RPC call: ${body.method} -> ${urlStr}`)
    })
  }

  it('Base verified + Monad candidate -> overall verified, networks grouped, top-level evidence mirrors the best (Base) network', async () => {
    const header = v2Header([
      { scheme: 'exact', network: BASE_NETWORK, amount: '200000', asset: BASE_USDC_ADDRESS, payTo: '0xBasePay' },
      { scheme: 'exact', network: MONAD_NETWORK, amount: '10000', asset: MONAD_USDC_ADDRESS, payTo: '0xMonadPay' },
    ])
    const fetchImpl = buildFetchImpl(header)
    const result = await probeServiceAndEvidence('https://svc.example.com/multi-chain', 'GET', {
      fetchImpl: fetchImpl as any,
    })

    expect(result.status).toBe('verified')
    expect(result.network).toBe(MONAD_NETWORK) // main display network stays Monad regardless of which network verified
    expect(result.price_usdc).toBe('0.01')
    expect(result.pay_to).toBe('0xMonadPay')

    expect(result.networks).toHaveLength(2)
    const monadEntry = result.networks?.find((n) => n.network === MONAD_NETWORK)
    const baseEntry = result.networks?.find((n) => n.network === BASE_NETWORK)
    expect(monadEntry?.evidence?.payers_7d).toBe(0)
    expect(baseEntry?.evidence?.payers_7d).toBe(1)

    // Top-level evidence mirrors the best (Base) network, not Monad — so a
    // VERIFIED badge is never paired with a "0 payers" evidence number.
    expect(result.evidence?.payers_7d).toBe(1)
    expect(result.evidence?.last_tx).toBe('0xbasetx')
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
