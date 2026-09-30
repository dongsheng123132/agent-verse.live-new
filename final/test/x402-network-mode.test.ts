import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from './helpers/pglite-db'
import { createMockFacilitator } from './helpers/facilitator'

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
})
afterAll(async () => {
  await testDb.close()
})
beforeEach(async () => {
  await testDb.reset()
})

const savedMode = process.env.X402_NETWORK_MODE
afterEach(() => {
  if (savedMode === undefined) delete process.env.X402_NETWORK_MODE
  else process.env.X402_NETWORK_MODE = savedMode
})

const { NextRequest } = await import('next/server')
const flow = await import('../lib/x402-flow')
const { purchaseHandler } = await import('../app/api/cells/purchase/handler')

const PAY_TO = '0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6'

async function unpaid402(x: number, y: number) {
  const req = new NextRequest('http://localhost/api/cells/purchase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ x, y }),
  })
  const res = await purchaseHandler(req)
  expect(res.status).toBe(402)
  const header = res.headers.get('PAYMENT-REQUIRED')
  expect(header).toBeTruthy()
  return JSON.parse(Buffer.from(header as string, 'base64').toString()) as { accepts: any[] }
}

/** Build a fresh shared resource server for the mode currently in process.env, with mock facilitators. */
async function buildSharedServer(base: string, monad: string) {
  flow.resetSharedX402Server()
  await flow.getSharedX402Server(async () => ({
    base: createMockFacilitator(base),
    monad: createMockFacilitator(monad),
  }))
}

describe('getNetworkMode', () => {
  it('defaults to mainnet when the variable is unset or empty', () => {
    expect(flow.getNetworkMode({})).toBe('mainnet')
    expect(flow.getNetworkMode({ X402_NETWORK_MODE: '' })).toBe('mainnet')
  })
  it('only "testnet" (case/whitespace-insensitive) switches to testnet; anything else stays mainnet', () => {
    expect(flow.getNetworkMode({ X402_NETWORK_MODE: 'testnet' })).toBe('testnet')
    expect(flow.getNetworkMode({ X402_NETWORK_MODE: ' TestNet ' })).toBe('testnet')
    expect(flow.getNetworkMode({ X402_NETWORK_MODE: 'mainnet' })).toBe('mainnet')
    expect(flow.getNetworkMode({ X402_NETWORK_MODE: 'sepolia' })).toBe('mainnet')
  })
})

describe('usdcToAtomic', () => {
  it('converts decimal USDC to 6-decimal atomic units exactly', () => {
    expect(flow.usdcToAtomic(0.1)).toBe('100000')
    expect(flow.usdcToAtomic('0.10')).toBe('100000')
    expect(flow.usdcToAtomic(1.5)).toBe('1500000')
    expect(flow.usdcToAtomic(0.3)).toBe('300000')
  })
})

describe('buildDualNetworkAccepts', () => {
  it('mainnet (explicit and default): Base 8453 + Monad 143, unchanged', () => {
    delete process.env.X402_NETWORK_MODE
    for (const accepts of [flow.buildDualNetworkAccepts(0.1), flow.buildDualNetworkAccepts(0.1, 'mainnet')]) {
      expect(accepts).toEqual([
        { scheme: 'exact', price: '$0.10', network: 'eip155:8453', payTo: PAY_TO },
        { scheme: 'exact', price: '$0.10', network: 'eip155:143', payTo: PAY_TO },
      ])
    }
  })
  it('testnet: Base Sepolia 84532 + Monad testnet 10143, same price and payTo', () => {
    const explicit = flow.buildDualNetworkAccepts(0.1, 'testnet')
    expect(explicit).toEqual([
      { scheme: 'exact', price: '$0.10', network: 'eip155:84532', payTo: PAY_TO },
      { scheme: 'exact', price: '$0.10', network: 'eip155:10143', payTo: PAY_TO },
    ])
    process.env.X402_NETWORK_MODE = 'testnet'
    expect(flow.buildDualNetworkAccepts(0.1)).toEqual(explicit)
  })
})

describe('defaultFacilitatorClients (testnet)', () => {
  it('uses the public x402.org facilitator for Base Sepolia and molandak for Monad testnet, no CDP needed', async () => {
    const { base, monad } = (await flow.defaultFacilitatorClients('testnet')) as any
    expect(base.url).toBe('https://x402.org/facilitator')
    expect(monad.url).toBe('https://x402-facilitator.molandak.org')
  })
})

describe('402 PAYMENT-REQUIRED from POST /api/cells/purchase', () => {
  it('mainnet (default): accepts use the SDK default USDC on Base and Monad', async () => {
    delete process.env.X402_NETWORK_MODE
    await buildSharedServer('eip155:8453', 'eip155:143')
    const decoded = await unpaid402(60, 60)
    const byNet = Object.fromEntries(decoded.accepts.map((a) => [a.network, a]))
    expect(Object.keys(byNet).sort()).toEqual(['eip155:143', 'eip155:8453'])
    expect(byNet['eip155:8453'].asset.toLowerCase()).toBe('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913')
    expect(byNet['eip155:143'].asset.toLowerCase()).toBe('0x754704bc059f8c67012fed69bc8a327a5aafb603')
    expect(byNet['eip155:8453'].amount).toBe('100000')
    expect(byNet['eip155:143'].amount).toBe('100000')
    expect(byNet['eip155:8453'].payTo).toBe(PAY_TO)
    expect(byNet['eip155:143'].payTo).toBe(PAY_TO)
  })

  it('testnet: accepts are Monad testnet + Base Sepolia with the registered testnet USDC and EIP-712 domain', async () => {
    process.env.X402_NETWORK_MODE = 'testnet'
    await buildSharedServer('eip155:84532', 'eip155:10143')
    const decoded = await unpaid402(61, 60)
    const byNet = Object.fromEntries(decoded.accepts.map((a) => [a.network, a]))
    expect(Object.keys(byNet).sort()).toEqual(['eip155:10143', 'eip155:84532'])

    const monad = byNet['eip155:10143']
    expect(monad.scheme).toBe('exact')
    expect(monad.asset).toBe('0x534b2f3A21130d7a60830c2Df862319e593943A3')
    expect(monad.amount).toBe('100000')
    expect(monad.payTo).toBe(PAY_TO)
    expect(monad.extra).toMatchObject({ name: 'USDC', version: '2' })

    const baseSepolia = byNet['eip155:84532']
    expect(baseSepolia.scheme).toBe('exact')
    expect(baseSepolia.asset).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e')
    expect(baseSepolia.amount).toBe('100000')
    expect(baseSepolia.payTo).toBe(PAY_TO)
    expect(baseSepolia.extra).toMatchObject({ name: 'USDC', version: '2' })
  })

  it('switching back to mainnet after a testnet build (fresh server) restores the mainnet accepts', async () => {
    process.env.X402_NETWORK_MODE = 'testnet'
    await buildSharedServer('eip155:84532', 'eip155:10143')
    await unpaid402(62, 60)
    delete process.env.X402_NETWORK_MODE
    await buildSharedServer('eip155:8453', 'eip155:143')
    const decoded = await unpaid402(62, 60)
    expect(decoded.accepts.map((a) => a.network).sort()).toEqual(['eip155:143', 'eip155:8453'])
  })
})
