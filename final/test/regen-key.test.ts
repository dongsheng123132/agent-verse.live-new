import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from './helpers/pglite-db'
import { createMockFacilitator, buildPaymentHeaderValue } from './helpers/facilitator'

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
  await testDb.dbQuery(
    `INSERT INTO grid_cells (id, x, y, owner_address, block_id, block_origin_x, block_origin_y) VALUES (7070, 70, 70, '0xaaaa00000000000000000000000000000000a008', 'blk', 70, 70)`
  )
})

const { NextRequest } = await import('next/server')
const { BASE_NETWORK, getSharedX402Server, resetSharedX402Server } = await import('../lib/x402-flow')
const { regenHandler } = await import('../app/api/cells/regen-key/handler')

const baseFacilitator = createMockFacilitator(BASE_NETWORK)
beforeAll(async () => {
  resetSharedX402Server()
  await getSharedX402Server(async () => ({ base: baseFacilitator, monad: createMockFacilitator('eip155:143') }))
})

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/cells/regen-key', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('POST /api/cells/regen-key', () => {
  it('404s (no payment requested) when the cell has no owner', async () => {
    baseFacilitator.verify.mockClear()
    const res = await regenHandler(postRequest({ x: 71, y: 71 }))
    expect(res.status).toBe(404)
    expect(baseFacilitator.verify).not.toHaveBeenCalled()
  })

  it('rejects a non-owner payer with 403 and does not settle', async () => {
    baseFacilitator.settle.mockClear()
    const header = buildPaymentHeaderValue({ network: BASE_NETWORK, from: '0xbbbb00000000000000000000000000000000b002' })
    const res = await regenHandler(postRequest({ x: 70, y: 70 }, { 'x-payment': header }))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('not_owner')
    expect(baseFacilitator.settle).not.toHaveBeenCalled()
  })

  it('regenerates the key and settles when payer matches the owner', async () => {
    baseFacilitator.settle.mockClear()
    const header = buildPaymentHeaderValue({ network: BASE_NETWORK, from: '0xaaaa00000000000000000000000000000000a008' })
    const res = await regenHandler(postRequest({ x: 70, y: 70 }, { 'x-payment': header }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.api_key).toMatch(/^gk_/)
    expect(baseFacilitator.settle).toHaveBeenCalledTimes(1)
  })
})
