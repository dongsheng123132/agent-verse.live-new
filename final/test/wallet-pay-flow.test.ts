import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from './helpers/pglite-db'
// @ts-expect-error plain .mjs helper shared with scripts/e2e-wallet-buy.mjs
import { createMockWallet } from './helpers/mock-wallet.mjs'

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../lib/db.js', () => ({
  dbQuery: (text: string, params?: unknown[]) => dbHolder.db.dbQuery(text, params),
  withTransaction: (fn: any) => dbHolder.db.withTransaction(fn),
}))

let testDb: TestDb

beforeAll(async () => {
  testDb = await createTestDb()
  dbHolder.db = testDb
  process.env.DATABASE_URL = 'postgres://test-fake-not-used'
  // Testnet shape + the in-repo mock facilitator (real EIP-3009 signature check, no chain).
  process.env.X402_NETWORK_MODE = 'testnet'
  process.env.X402_FACILITATOR_MOCK = '1'
  const flow = await import('../lib/x402-flow')
  flow.resetSharedX402Server()
})
afterAll(async () => {
  delete process.env.X402_FACILITATOR_MOCK
  process.env.X402_NETWORK_MODE = 'mainnet'
  const flow = await import('../lib/x402-flow')
  flow.resetSharedX402Server()
  await testDb.close()
})
beforeEach(async () => {
  await testDb.reset()
})

const { NextRequest } = await import('next/server')
const { purchaseHandler } = await import('../app/api/cells/purchase/handler')
const { bulkPurchaseHandler } = await import('../app/api/cells/bulk-purchase/handler')
const { payForCells } = await import('../lib/wallet-pay/pay')
const { PayError, describeHttpFailure, isUserRejection, toPayError } = await import('../lib/wallet-pay/errors')
const { PAY_NETWORKS, buildAddChainParams } = await import('../lib/wallet-pay/networks')
const { assertEnoughUsdc, ensureChain } = await import('../lib/wallet-pay/wallet')
const { encodePaymentRequiredHeader, decodePaymentRequiredHeader } = await import('@x402/core/http')

const ORIGIN = 'http://localhost:3005'

/** fetch that serves the two purchase routes in-process. `tamper` may rewrite a 402 before the client sees it. */
function makeFetch(tamper?: (accepts: any[]) => any[]) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const req = input instanceof Request ? input : new Request(input, init)
    const url = new URL(req.url)
    const body = await req.clone().text()
    const nreq = new NextRequest(req.url, { method: req.method, headers: req.headers, body: body || undefined })
    const res =
      url.pathname === '/api/cells/purchase'
        ? await purchaseHandler(nreq)
        : url.pathname === '/api/cells/bulk-purchase'
          ? await bulkPurchaseHandler(nreq)
          : new Response('not found', { status: 404 })
    if (tamper && res.status === 402 && res.headers.get('PAYMENT-REQUIRED')) {
      const pr = decodePaymentRequiredHeader(res.headers.get('PAYMENT-REQUIRED')!) as any
      pr.accepts = tamper(pr.accepts)
      const headers = new Headers(res.headers)
      headers.set('PAYMENT-REQUIRED', encodePaymentRequiredHeader(pr))
      return new Response(await res.text(), { status: 402, headers })
    }
    return res
  }
}

function rpcFetch(balanceAtomic: bigint | 'down'): typeof fetch {
  return (async (_url: any, init?: RequestInit) => {
    if (balanceAtomic === 'down') throw new TypeError('Failed to fetch')
    const { id } = JSON.parse(String(init?.body))
    return new Response(JSON.stringify({ jsonrpc: '2.0', id, result: '0x' + balanceAtomic.toString(16).padStart(64, '0') }), { status: 200 })
  }) as typeof fetch
}

async function owner(x: number, y: number) {
  const r = await testDb.dbQuery('SELECT owner_address FROM grid_cells WHERE x=$1 AND y=$2', [x, y])
  return r.rows[0]?.owner_address ?? null
}

describe('payForCells — full client+server path (mock wallet, mock facilitator, real handlers)', () => {
  it('single cell on Monad: adds + switches the chain, signs for chain 10143 only, server records a Monad order', async () => {
    const wallet = createMockWallet() // starts on chain 1, knows only chain 1
    const statuses: string[] = []
    const r = await payForCells({
      provider: wallet,
      networkKey: 'monad',
      cells: [{ x: 40, y: 40 }],
      origin: ORIGIN,
      fetchImpl: makeFetch(),
      rpcFetchImpl: rpcFetch(5_000_000n),
      onStatus: (s) => statuses.push(s),
    })

    expect(r.kind).toBe('single')
    expect(r.keyCell).toEqual({ x: 40, y: 40 })
    expect(r.apiKey).toMatch(/^gk_[0-9a-f]{32}$/)
    expect(r.txHash).toMatch(/^0x[0-9a-f]{64}$/)
    expect(r.txUrl).toBe(`https://testnet.monadvision.com/tx/${r.txHash}`)
    expect(r.network.caip2).toBe('eip155:10143')
    expect(r.mode).toBe('testnet')
    expect(r.totalUsdc).toBe('0.10')
    expect(statuses).toEqual(['quoting', 'connecting', 'switching', 'checking_balance', 'signing'])

    // wallet side
    expect(wallet.state.switched).toEqual(['0x279f']) // tried to switch first ...
    expect(wallet.state.added).toHaveLength(1) // ... got 4902, so it added the chain
    expect(wallet.state.added[0]).toEqual(buildAddChainParams(PAY_NETWORKS.testnet.monad))
    expect(wallet.state.chainId).toBe(10143)
    expect(wallet.state.signCalls).toBe(1)
    expect(wallet.state.signed[0].domain.chainId).toBe(10143)
    expect(wallet.state.signed[0].domain.verifyingContract.toLowerCase()).toBe(PAY_NETWORKS.testnet.monad.usdc.address.toLowerCase())
    expect(wallet.state.signed[0].message.value).toBe('100000')

    // server side
    expect((await owner(40, 40))?.toLowerCase()).toBe(wallet.address.toLowerCase())
    const order = await testDb.dbQuery('SELECT network, tx_hash FROM grid_orders WHERE x=40 AND y=40')
    expect(order.rows[0].network).toBe('eip155:10143')
    expect(order.rows[0].tx_hash).toBe(r.txHash)
  })

  it('choosing Base pays on Base Sepolia (84532) — and choosing Monad is not the first accept (Base is listed first)', async () => {
    const wallet = createMockWallet({ knownChainIds: [1, 84532, 10143] })
    const r = await payForCells({
      provider: wallet,
      networkKey: 'base',
      cells: [{ x: 41, y: 40 }],
      origin: ORIGIN,
      fetchImpl: makeFetch(),
      rpcFetchImpl: rpcFetch(5_000_000n),
    })
    expect(r.network.caip2).toBe('eip155:84532')
    expect(r.txUrl).toBe(`https://sepolia.basescan.org/tx/${r.txHash}`)
    expect(wallet.state.signed[0].domain.chainId).toBe(84532)
    expect(wallet.state.added).toHaveLength(0) // chain was already known: plain switch
    const order = await testDb.dbQuery('SELECT network FROM grid_orders WHERE x=41 AND y=40')
    expect(order.rows[0].network).toBe('eip155:84532')
  })

  it('bulk: 4 cells -> one payment of 0.4 USDC to /bulk-purchase, key belongs to the top-left cell', async () => {
    const wallet = createMockWallet({ knownChainIds: [1, 10143] })
    const r = await payForCells({
      provider: wallet,
      networkKey: 'monad',
      cells: [{ x: 51, y: 51 }, { x: 50, y: 50 }, { x: 51, y: 50 }, { x: 50, y: 51 }],
      origin: ORIGIN,
      fetchImpl: makeFetch(),
      rpcFetchImpl: rpcFetch(5_000_000n),
    })
    expect(r.kind).toBe('bulk')
    expect(r.keyCell).toEqual({ x: 50, y: 50 })
    expect(r.totalUsdc).toBe('0.40')
    expect(wallet.state.signed[0].message.value).toBe('400000')
    expect(wallet.state.signCalls).toBe(1)
    for (const [x, y] of [[50, 50], [51, 50], [50, 51], [51, 51]]) {
      expect((await owner(x, y))?.toLowerCase()).toBe(wallet.address.toLowerCase())
    }
  })

  it('insufficient USDC: tells the person (no gas needed) and asks for NO signature', async () => {
    const wallet = createMockWallet({ knownChainIds: [1, 10143] })
    const err = await payForCells({
      provider: wallet,
      networkKey: 'monad',
      cells: [{ x: 60, y: 60 }, { x: 61, y: 60 }],
      origin: ORIGIN,
      fetchImpl: makeFetch(),
      rpcFetchImpl: rpcFetch(50_000n), // 0.05 USDC, needs 0.20
    }).catch((e) => e)
    expect(err).toBeInstanceOf(PayError)
    expect(err.code).toBe('insufficient_usdc')
    expect(err.message).toContain('0.05')
    expect(err.message).toContain('0.20')
    expect(err.message).toContain('不需要 gas')
    expect(err.message).toContain('facilitator')
    expect(wallet.state.signCalls).toBe(0)
    expect(await owner(60, 60)).toBeNull()
  })

  it('public RPC unreachable: falls back to asking the wallet for the balance', async () => {
    const wallet = createMockWallet({ knownChainIds: [1, 10143], usdcBalance: 10_000n }) // 0.01 USDC
    const err = await payForCells({
      provider: wallet,
      networkKey: 'monad',
      cells: [{ x: 62, y: 60 }],
      origin: ORIGIN,
      fetchImpl: makeFetch(),
      rpcFetchImpl: rpcFetch('down'),
    }).catch((e) => e)
    expect(err.code).toBe('insufficient_usdc')
    expect(wallet.state.requests).toContain('eth_call')
    expect(wallet.state.signCalls).toBe(0)
  })

  it('user rejects the signature: friendly message, nothing bought', async () => {
    const wallet = createMockWallet({ knownChainIds: [1, 10143] })
    wallet.state.rejectNextSign = true
    const err = await payForCells({
      provider: wallet,
      networkKey: 'monad',
      cells: [{ x: 63, y: 60 }],
      origin: ORIGIN,
      fetchImpl: makeFetch(),
      rpcFetchImpl: rpcFetch(5_000_000n),
    }).catch((e) => e)
    expect(err.code).toBe('user_rejected')
    expect(err.message).toContain('拒绝')
    expect(await owner(63, 60)).toBeNull()
  })

  it('cell already owned -> 409 before any wallet popup', async () => {
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, status, block_id, block_w, block_h, block_origin_x, block_origin_y)
       VALUES (6464, 64, 64, '0xSomeoneElse', 'HOLDING', 'blk_64_64_1x1', 1, 1, 64, 64)`
    )
    const wallet = createMockWallet({ knownChainIds: [1, 10143] })
    const err = await payForCells({
      provider: wallet,
      networkKey: 'monad',
      cells: [{ x: 64, y: 64 }],
      origin: ORIGIN,
      fetchImpl: makeFetch(),
      rpcFetchImpl: rpcFetch(5_000_000n),
    }).catch((e) => e)
    expect(err.code).toBe('cell_taken')
    expect(err.message).toContain('被别人买走')
    expect(wallet.state.requests).not.toContain('eth_requestAccounts')
    expect(wallet.state.signCalls).toBe(0)
  })

  it('reserved zone -> 403 with a Chinese message, no wallet popup', async () => {
    const wallet = createMockWallet({ knownChainIds: [1, 10143] })
    const err = await payForCells({
      provider: wallet,
      networkKey: 'monad',
      cells: [{ x: 3, y: 3 }],
      origin: ORIGIN,
      fetchImpl: makeFetch(),
      rpcFetchImpl: rpcFetch(5_000_000n),
    }).catch((e) => e)
    expect(err.code).toBe('reserved')
    expect(err.message).toContain('展示区')
    expect(wallet.state.requests).not.toContain('eth_requestAccounts')
  })

  it('refuses to sign when the server quotes a different amount than cells x 0.1', async () => {
    const wallet = createMockWallet({ knownChainIds: [1, 10143] })
    const err = await payForCells({
      provider: wallet,
      networkKey: 'monad',
      cells: [{ x: 65, y: 60 }],
      origin: ORIGIN,
      fetchImpl: makeFetch((accepts) => accepts.map((a) => ({ ...a, amount: '9000000' }))),
      rpcFetchImpl: rpcFetch(50_000_000n),
    }).catch((e) => e)
    expect(err.code).toBe('price_mismatch')
    expect(wallet.state.signCalls).toBe(0)
  })

  it('refuses to sign when the quoted asset is not that chain’s USDC', async () => {
    const wallet = createMockWallet({ knownChainIds: [1, 10143] })
    const err = await payForCells({
      provider: wallet,
      networkKey: 'monad',
      cells: [{ x: 66, y: 60 }],
      origin: ORIGIN,
      fetchImpl: makeFetch((accepts) => accepts.map((a) => ({ ...a, asset: '0x000000000000000000000000000000000000dEaD' }))),
      rpcFetchImpl: rpcFetch(50_000_000n),
    }).catch((e) => e)
    expect(err.code).toBe('price_mismatch')
    expect(wallet.state.signCalls).toBe(0)
  })

  it('server does not offer the chosen chain: error, never a silent switch to the other chain', async () => {
    const wallet = createMockWallet({ knownChainIds: [1, 10143, 84532] })
    const err = await payForCells({
      provider: wallet,
      networkKey: 'monad',
      cells: [{ x: 67, y: 60 }],
      origin: ORIGIN,
      fetchImpl: makeFetch((accepts) => accepts.filter((a) => a.network !== 'eip155:10143')),
      rpcFetchImpl: rpcFetch(5_000_000n),
    }).catch((e) => e)
    expect(err.code).toBe('network_not_offered')
    expect(wallet.state.signCalls).toBe(0)
  })
})

describe('ensureChain / assertEnoughUsdc / error mapping', () => {
  it('already on the right chain: no switch request at all', async () => {
    const w = createMockWallet({ initialChainId: 143, knownChainIds: [143] })
    await ensureChain(w, PAY_NETWORKS.mainnet.monad)
    expect(w.state.requests).toEqual(['eth_chainId'])
  })

  it('wallet that answers -32603 "unrecognized chain" still gets the add flow', async () => {
    const calls: string[] = []
    let chain = '0x1'
    const provider = {
      request: async ({ method, params }: any) => {
        calls.push(method)
        if (method === 'eth_chainId') return chain
        if (method === 'wallet_switchEthereumChain') {
          if (calls.filter((c) => c === 'wallet_addEthereumChain').length === 0) throw Object.assign(new Error('Unrecognized chain ID "0x8f"'), { code: -32603 })
          chain = params[0].chainId
          return null
        }
        if (method === 'wallet_addEthereumChain') return null // does NOT auto-switch
        throw new Error('unexpected ' + method)
      },
    }
    await ensureChain(provider, PAY_NETWORKS.mainnet.monad)
    expect(calls).toEqual(['eth_chainId', 'wallet_switchEthereumChain', 'wallet_addEthereumChain', 'eth_chainId', 'wallet_switchEthereumChain', 'eth_chainId'])
  })

  it('user declining the add-chain prompt is a rejection, not a crash', async () => {
    const w = createMockWallet()
    const orig = w.request
    w.request = async (a: any) => {
      if (a.method === 'wallet_addEthereumChain') throw Object.assign(new Error('User rejected the request.'), { code: 4001 })
      return orig(a)
    }
    const err = await ensureChain(w, PAY_NETWORKS.mainnet.monad).catch((e) => e)
    expect(isUserRejection(err)).toBe(true)
    expect(toPayError(err).code).toBe('user_rejected')
  })

  it('assertEnoughUsdc: unknown balance passes, short balance throws, equal passes', () => {
    const n = PAY_NETWORKS.mainnet.monad
    expect(() => assertEnoughUsdc(null, 100000n, n)).not.toThrow()
    expect(() => assertEnoughUsdc(100000n, 100000n, n)).not.toThrow()
    expect(() => assertEnoughUsdc(99999n, 100000n, n)).toThrow(PayError)
  })

  it('describeHttpFailure covers the cases a buyer can hit', () => {
    expect(describeHttpFailure(409, { error: 'cell_taken' }).code).toBe('cell_taken')
    expect(describeHttpFailure(409, { error: 'cells_taken', message: 'already owned: (1,1)' }).message).toContain('(1,1)')
    const anomaly = describeHttpFailure(409, { error: 'settlement_anomaly', tx: '0xdead' })
    expect(anomaly.code).toBe('settlement_anomaly')
    expect(anomaly.message).toContain('0xdead')
    expect(describeHttpFailure(403, { error: 'reserved_showcase' }).code).toBe('reserved')
    expect(describeHttpFailure(402, { error: 'settlement_failed', message: 'boom' }).code).toBe('settlement_failed')
    expect(describeHttpFailure(402, {}, { paymentRequiredError: 'insufficient_funds' }).message).toContain('insufficient_funds')
    expect(describeHttpFailure(502, { error: 'FACILITATOR_ERROR' }).code).toBe('facilitator_down')
    expect(describeHttpFailure(503, { error: 'database_unavailable' }).code).toBe('service_unavailable')
    expect(describeHttpFailure(418, null).code).toBe('unknown')
  })

  it('toPayError recognises wallet rejections in all their spellings and network failures', () => {
    expect(isUserRejection({ code: 4001 })).toBe(true)
    expect(isUserRejection({ name: 'UserRejectedRequestError' })).toBe(true)
    expect(isUserRejection({ message: 'MetaMask Message Signature: User denied message signature.' })).toBe(true)
    expect(isUserRejection({ message: 'insufficient funds' })).toBe(false)
    expect(isUserRejection(new Error('wrapped', { cause: { code: 4001 } }))).toBe(true)
    expect(toPayError(new TypeError('Failed to fetch')).code).toBe('network_error')
    expect(toPayError(new Error('weird')).code).toBe('unknown')
  })
})
