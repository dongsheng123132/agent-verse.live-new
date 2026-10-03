import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from './helpers/pglite-db'
import { createMockFacilitator, buildPaymentHeaderValue } from './helpers/facilitator'

// R1: one facilitator down must not stop the other chain.
// Monad facilitator (molandak) throwing -> the 402 offers only Base, and a Base payment still settles;
// Base facilitator throwing -> the 402 offers only Monad, and a Monad payment still settles;
// both throwing -> 503 x402_unavailable. The missing one is retried on later requests with a backoff.

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

// For the "both down" test the handlers use the DEFAULT facilitator clients (testnet mode = plain HTTP clients);
// point both at a closed local port so they fail at once, offline. These are read when lib/x402-flow is imported.
process.env.MONAD_FACILITATOR_URL = 'http://127.0.0.1:9'
process.env.BASE_SEPOLIA_FACILITATOR_URL = 'http://127.0.0.1:9'

const { NextRequest } = await import('next/server')
const flow = await import('../lib/x402-flow')
const { purchaseHandler } = await import('../app/api/cells/purchase/handler')
const { bulkPurchaseHandler } = await import('../app/api/cells/bulk-purchase/handler')
const { regenHandler } = await import('../app/api/cells/regen-key/handler')

const { BASE_NETWORK, MONAD_NETWORK, BASE_TREASURY_ADDRESS, MONAD_TREASURY_ADDRESS } = flow

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const buy = (x: number, y: number, headers: Record<string, string> = {}) =>
  purchaseHandler(post('http://localhost/api/cells/purchase', { x, y }, headers))

async function offeredNetworks(res: Response): Promise<string[]> {
  expect(res.status).toBe(402)
  const header = res.headers.get('PAYMENT-REQUIRED')
  expect(header).toBeTruthy()
  const decoded = JSON.parse(Buffer.from(header as string, 'base64').toString())
  return decoded.accepts.map((a: any) => a.network).sort()
}

/** A facilitator whose getSupported() rejects (what an unreachable facilitator does), until `recover()` is called. */
function downFacilitator(network: string) {
  const f = createMockFacilitator(network)
  const working = f.getSupported.getMockImplementation()!
  f.getSupported.mockImplementation(async () => {
    throw new Error(`facilitator for ${network} is down`)
  })
  return { ...f, recover: () => f.getSupported.mockImplementation(working), calls: () => f.getSupported.mock.calls.length }
}

async function freshServer(factory: Parameters<typeof flow.getSharedX402Server>[0]) {
  flow.resetSharedX402Server()
  return flow.getSharedX402Server(factory)
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Monad facilitator down', () => {
  it('the 402 offers only Base, and a Base payment still settles', async () => {
    const base = createMockFacilitator(BASE_NETWORK)
    const monad = downFacilitator(MONAD_NETWORK)
    await freshServer(async () => ({ base, monad }))

    expect(await offeredNetworks(await buy(70, 70))).toEqual([BASE_NETWORK])
    expect(flow.getUnavailableX402Networks()).toEqual([MONAD_NETWORK])

    const header = buildPaymentHeaderValue({ network: BASE_NETWORK, from: '0xaaaa00000000000000000000000000000000b001', payTo: BASE_TREASURY_ADDRESS })
    const res = await buy(70, 70, { 'x-payment': header })
    expect(res.status).toBe(200)
    expect((await res.json()).network).toBe(BASE_NETWORK)
    expect(base.settle).toHaveBeenCalledTimes(1)
    expect(monad.settle).not.toHaveBeenCalled()
  })

  it('bulk-purchase and regen-key offer only Base too', async () => {
    const base = createMockFacilitator(BASE_NETWORK)
    const monad = downFacilitator(MONAD_NETWORK)
    await freshServer(async () => ({ base, monad }))

    const bulk = await bulkPurchaseHandler(post('http://localhost/api/cells/bulk-purchase', { cells: [{ x: 71, y: 70 }, { x: 72, y: 70 }] }))
    expect(await offeredNetworks(bulk)).toEqual([BASE_NETWORK])

    await testDb.dbQuery(`INSERT INTO grid_cells (id, x, y, owner_address, block_id, block_origin_x, block_origin_y) VALUES (7373, 73, 70, '0xOwner', 'blk_73_70_1x1', 73, 70)`)
    const regen = await regenHandler(post('http://localhost/api/cells/regen-key', { x: 73, y: 70 }))
    expect(await offeredNetworks(regen)).toEqual([BASE_NETWORK])
  })
})

describe('Base facilitator down', () => {
  it('the 402 offers only Monad, and a Monad payment still settles', async () => {
    const base = downFacilitator(BASE_NETWORK)
    const monad = createMockFacilitator(MONAD_NETWORK)
    await freshServer(async () => ({ base, monad }))

    expect(await offeredNetworks(await buy(74, 70))).toEqual([MONAD_NETWORK])
    expect(flow.getUnavailableX402Networks()).toEqual([BASE_NETWORK])

    const header = buildPaymentHeaderValue({ network: MONAD_NETWORK, from: '0xaaaa00000000000000000000000000000000b002', payTo: MONAD_TREASURY_ADDRESS })
    const res = await buy(74, 70, { 'x-payment': header })
    expect(res.status).toBe(200)
    expect((await res.json()).network).toBe(MONAD_NETWORK)
    expect(monad.settle).toHaveBeenCalledTimes(1)
    expect(base.settle).not.toHaveBeenCalled()
  })
})

describe('both facilitators down', () => {
  const savedMode = process.env.X402_NETWORK_MODE
  beforeEach(() => { process.env.X402_NETWORK_MODE = 'testnet' })
  afterEach(() => {
    if (savedMode === undefined) delete process.env.X402_NETWORK_MODE
    else process.env.X402_NETWORK_MODE = savedMode
  })

  it('an explicit init fails and nothing is cached', async () => {
    flow.resetSharedX402Server()
    const base = downFacilitator(flow.BASE_SEPOLIA_NETWORK)
    const monad = downFacilitator(flow.MONAD_TESTNET_NETWORK)
    await expect(flow.getSharedX402Server(async () => ({ base, monad }))).rejects.toThrow(/no supported payment kinds|no facilitator supports/)
    expect(flow.getSharedX402Error()).toBeTruthy()
    expect(flow.getUnavailableX402Networks()).toEqual([])
  })

  it('purchase, bulk-purchase and regen-key all answer 503 x402_unavailable (default facilitator clients, both unreachable)', async () => {
    flow.resetSharedX402Server()
    await testDb.dbQuery(`INSERT INTO grid_cells (id, x, y, owner_address, block_id, block_origin_x, block_origin_y) VALUES (7676, 76, 70, '0xOwner', 'blk_76_70_1x1', 76, 70)`)
    const responses = [
      await buy(77, 70),
      await bulkPurchaseHandler(post('http://localhost/api/cells/bulk-purchase', { cells: [{ x: 78, y: 70 }] })),
      await regenHandler(post('http://localhost/api/cells/regen-key', { x: 76, y: 70 })),
    ]
    for (const res of responses) {
      expect(res.status).toBe(503)
      expect((await res.json()).error).toBe('x402_unavailable')
    }
  })

  it('the failure is not cached: once a facilitator answers, the very next request works', async () => {
    flow.resetSharedX402Server()
    expect((await buy(75, 70)).status).toBe(503)
    const server = await flow.getSharedX402Server(async () => ({
      base: createMockFacilitator(flow.BASE_SEPOLIA_NETWORK),
      monad: createMockFacilitator(flow.MONAD_TESTNET_NETWORK),
    }))
    expect(server).toBeTruthy()
    expect(await offeredNetworks(await buy(75, 70))).toEqual([flow.BASE_SEPOLIA_NETWORK, flow.MONAD_TESTNET_NETWORK].sort())
  })
})

describe('the missing facilitator is retried on later requests, with a backoff', () => {
  it('not before the backoff has passed, then in the background; the 402 then offers both again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'))
    const base = createMockFacilitator(BASE_NETWORK)
    const monad = downFacilitator(MONAD_NETWORK)
    const factory = async () => ({ base, monad })
    await freshServer(factory)
    expect(monad.calls()).toBe(1)

    // a request inside the first 2s: still Base only, no retry
    vi.setSystemTime(new Date('2026-10-03T12:00:01Z'))
    await flow.getSharedX402Server(factory)
    await flow.waitForX402Retry()
    expect(monad.calls()).toBe(1)

    // facilitator comes back; a request after the backoff triggers ONE background retry...
    monad.recover()
    vi.setSystemTime(new Date('2026-10-03T12:00:03Z'))
    await flow.getSharedX402Server(factory)
    await flow.getSharedX402Server(factory) // a second request while it runs must not start a second retry
    await flow.waitForX402Retry()
    expect(monad.calls()).toBe(2)
    expect(flow.getUnavailableX402Networks()).toEqual([])

    // ...and the next 402 offers both networks
    expect(await offeredNetworks(await buy(79, 70))).toEqual([BASE_NETWORK, MONAD_NETWORK].sort())
    // nothing left to retry
    vi.setSystemTime(new Date('2026-10-03T13:00:00Z'))
    await flow.getSharedX402Server(factory)
    await flow.waitForX402Retry()
    expect(monad.calls()).toBe(2)
  })

  it('a retry that fails again waits twice as long (2s, 4s, 8s ...) and never takes Base away', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'))
    const base = createMockFacilitator(BASE_NETWORK)
    const monad = downFacilitator(MONAD_NETWORK)
    const factory = async () => ({ base, monad })
    await freshServer(factory)
    expect(monad.calls()).toBe(1)

    vi.setSystemTime(new Date('2026-10-03T12:00:02Z')) // first retry is due: fails
    await flow.getSharedX402Server(factory)
    await flow.waitForX402Retry()
    expect(monad.calls()).toBe(2)
    expect(await offeredNetworks(await buy(80, 70))).toEqual([BASE_NETWORK])

    vi.setSystemTime(new Date('2026-10-03T12:00:05Z')) // 3s after the failed retry: backoff is 4s, not due
    await flow.getSharedX402Server(factory)
    await flow.waitForX402Retry()
    expect(monad.calls()).toBe(2)

    vi.setSystemTime(new Date('2026-10-03T12:00:06Z')) // 4s after: due, fails again
    await flow.getSharedX402Server(factory)
    await flow.waitForX402Retry()
    expect(monad.calls()).toBe(3)

    vi.setSystemTime(new Date('2026-10-03T12:00:13Z')) // 7s after: backoff is now 8s, not due
    await flow.getSharedX402Server(factory)
    await flow.waitForX402Retry()
    expect(monad.calls()).toBe(3)
    expect(await offeredNetworks(await buy(81, 70))).toEqual([BASE_NETWORK])
  })

  it('a retry during which the working facilitator is down too does not replace the working server', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'))
    const base = createMockFacilitator(BASE_NETWORK)
    const monad = downFacilitator(MONAD_NETWORK)
    const factory = async () => ({ base, monad })
    await freshServer(factory)

    // by the retry, Base blips AND Monad is still down: nothing can be built -> keep the cached server
    const workingBase = base.getSupported.getMockImplementation()!
    base.getSupported.mockImplementation(async () => { throw new Error('base blip') })
    vi.setSystemTime(new Date('2026-10-03T12:00:02Z'))
    await flow.getSharedX402Server(factory)
    await flow.waitForX402Retry()
    base.getSupported.mockImplementation(workingBase)
    expect(await offeredNetworks(await buy(82, 70))).toEqual([BASE_NETWORK])
  })
})

describe('both facilitators healthy: nothing changes', () => {
  it('offers both networks, nothing is marked unavailable, no retry is ever started', async () => {
    const base = createMockFacilitator(BASE_NETWORK)
    const monad = createMockFacilitator(MONAD_NETWORK)
    await freshServer(async () => ({ base, monad }))
    expect(await offeredNetworks(await buy(83, 70))).toEqual([BASE_NETWORK, MONAD_NETWORK].sort())
    expect(flow.getUnavailableX402Networks()).toEqual([])
    await flow.getSharedX402Server(async () => ({ base, monad }))
    await flow.waitForX402Retry()
    expect(base.getSupported).toHaveBeenCalledTimes(1)
    expect(monad.getSupported).toHaveBeenCalledTimes(1)
  })
})
