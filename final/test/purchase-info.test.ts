import { beforeAll, beforeEach, afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { Network } from '@x402/core/types'
import { createTestDb, type TestDb } from './helpers/pglite-db'
import { createMockFacilitator } from './helpers/facilitator'

// GET /api/cells/purchase is the post-deploy self-check (PRODUCT.md). It used to read TREASURY_ADDRESS /
// MONAD_TREASURY_ADDRESS, which the 402 never reads, so live it said {base: "0x4eCf…", monad: null} while both
// chains actually pay the same address. The info must come from the same list the 402 is built from.

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../lib/db', () => ({
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

// The old (wrong) env vars are set to decoys: if the info endpoint still read them it would show these.
const DECOY = '0xdec0dedec0dedec0dedec0dedec0dedec0dedec0'
const saved = {
  mode: process.env.X402_NETWORK_MODE,
  treasury: process.env.TREASURY_ADDRESS,
  monadTreasury: process.env.MONAD_TREASURY_ADDRESS,
}
beforeEach(() => {
  process.env.TREASURY_ADDRESS = DECOY
  process.env.MONAD_TREASURY_ADDRESS = DECOY
})
afterEach(() => {
  for (const [key, value] of [['X402_NETWORK_MODE', saved.mode], ['TREASURY_ADDRESS', saved.treasury], ['MONAD_TREASURY_ADDRESS', saved.monadTreasury]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

const { NextRequest } = await import('next/server')
const flow = await import('../lib/x402-flow')
const { GET, POST } = await import('../app/api/cells/purchase/route')

async function buildSharedServer() {
  const { base, monad } = flow.getActiveNetworks()
  flow.resetSharedX402Server()
  await flow.getSharedX402Server(async () => ({ base: createMockFacilitator(base), monad: createMockFacilitator(monad) }))
}

async function offeredAccepts(): Promise<{ network: Network; payTo: string }[]> {
  const res = await POST(
    new NextRequest('http://localhost/api/cells/purchase', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ x: 60, y: 60 }),
    })
  )
  expect(res.status).toBe(402)
  const header = res.headers.get('PAYMENT-REQUIRED')
  expect(header).toBeTruthy()
  return JSON.parse(Buffer.from(header as string, 'base64').toString()).accepts
}

describe.each(['mainnet', 'testnet'] as const)('GET /api/cells/purchase info vs the real 402 (%s)', (mode) => {
  it('payTo and networks equal what the 402 offers, and ignore the old TREASURY env vars', async () => {
    process.env.X402_NETWORK_MODE = mode
    await buildSharedServer()
    const accepts = await offeredAccepts()
    const info = await (await GET()).json()
    const { base, monad } = flow.getActiveNetworks()

    expect(accepts.map((a) => a.network).sort()).toEqual([base, monad].sort())
    expect(info.payTo.base).toBe(accepts.find((a) => a.network === base)!.payTo)
    expect(info.payTo.monad).toBe(accepts.find((a) => a.network === monad)!.payTo)
    expect(info.payTo.base).toBe(flow.PAY_TO_ADDRESS)
    expect(info.payTo.monad).toBe(flow.PAY_TO_ADDRESS)
    expect(info.payTo.monad).not.toBeNull()
    expect(JSON.stringify(info.payTo)).not.toContain(DECOY)
    expect(info.networks).toEqual([`Base (${base})`, `Monad (${monad})`])
    expect(info.x402_unavailable_networks).toEqual([])
  })
})
