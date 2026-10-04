import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/pglite-db'

// /api/services, /llms-services.txt and /.well-known/x402 with the index holding only
// what cell owners listed: an empty database is a normal 200 with count 0.

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../../lib/db', () => ({
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

const { NextRequest } = await import('next/server')
const { resetSchemaCache } = await import('../../lib/schema')
const { GET: servicesGET } = await import('../../app/api/services/route')
const { GET: llmsServicesGET } = await import('../../app/llms-services.txt/route')
const { GET: wellKnownGET } = await import('../../app/.well-known/x402/route')

beforeEach(async () => {
  await testDb.reset()
  resetSchemaCache()
})

describe('service index routes with no cell listings', () => {
  it('GET /api/services is 200 with count 0 and no entries', async () => {
    const res = await servicesGET(new NextRequest('http://localhost/api/services'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, count: 0, services: [] })
  })

  it('GET /llms-services.txt is 200 and says the index is empty', async () => {
    const res = await llmsServicesGET()
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain('Service index (0 services)')
    expect(text).toContain('no cell owner has listed a service')
  })

  it('GET /.well-known/x402 is 200 and lists only this site\'s own endpoints', async () => {
    const res = await wellKnownGET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.resources.map((r: { resource: string }) => r.resource).every((u: string) => u.includes('/api/cells/'))).toBe(true)
  })
})

describe('service index routes with a cell listing', () => {
  beforeEach(async () => {
    await testDb.dbQuery(
      `INSERT INTO grid_cells (id, x, y, owner_address, title, service_url, service_method, probe_status, block_id, block_origin_x, block_origin_y)
       VALUES (4242, 42, 42, '0xSeller', 'Listed', 'https://listed.example.com/api', 'GET', 'unprobed', 'blk_42_42_1x1', 42, 42)`
    )
  })

  it('GET /api/services returns exactly the cell listing', async () => {
    const body = await (await servicesGET(new NextRequest('http://localhost/api/services'))).json()
    expect(body.count).toBe(1)
    expect(body.services.map((s: { url: string; source: string; cell: unknown }) => [s.url, s.source, s.cell])).toEqual([
      ['https://listed.example.com/api', 'listing', { x: 42, y: 42 }],
    ])
  })

  it('GET /llms-services.txt lists it with the cell source', async () => {
    const text = await (await llmsServicesGET()).text()
    expect(text).toContain('Service index (1 services)')
    expect(text).toContain('url: https://listed.example.com/api')
    expect(text).toContain('source: listing')
  })
})
