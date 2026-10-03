import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from './helpers/pglite-db'

// The route's SSRF check (lib/market/ssrf.ts) resolves hostnames via real DNS.
// Mock node:dns so a hostname like svc.example.com always resolves to a
// public IP — literal-IP inputs (127.0.0.1, 169.254.169.254, ...) never reach
// this mock at all (assertPublicHttpsUrl short-circuits on those), so the
// SSRF-rejection tests below still exercise the real rejection logic.
vi.mock('node:dns', () => ({
  default: { promises: { lookup: async () => [{ address: '93.184.216.34', family: 4 }] } },
  promises: { lookup: async () => [{ address: '93.184.216.34', family: 4 }] },
}))

const dbHolder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../lib/db', () => ({
  dbQuery: (text: string, params?: unknown[]) => dbHolder.db.dbQuery(text, params),
  withTransaction: (fn: any) => dbHolder.db.withTransaction(fn),
}))

// Mock the probe layer for this file — its own behavior (SSRF, 402 parsing)
// is covered by test/market/*.test.ts. Here we only need to prove
// PUT /api/cells/update calls it with the right args and persists what it returns.
const probeHolder = vi.hoisted(() => ({ fn: vi.fn() }))
vi.mock('../lib/market/service', () => ({
  probeService: (...args: unknown[]) => probeHolder.fn(...args),
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
  probeHolder.fn.mockReset()
})

const { NextRequest } = await import('next/server')
const { PUT } = await import('../app/api/cells/update/route')
const { hashApiKey } = await import('../lib/api-key')

async function createOwnedCell(x: number, y: number, apiKey: string) {
  await testDb.dbQuery(
    `INSERT INTO grid_cells (id, x, y, owner_address, block_id, block_origin_x, block_origin_y) VALUES ($1,$2,$3,'0xOwner',$4,$2,$3)`,
    [y * 100 + x, x, y, `blk_${x}_${y}_1x1`]
  )
  await testDb.dbQuery(`INSERT INTO cell_api_keys (key_hash, x, y) VALUES ($1,$2,$3)`, [hashApiKey(apiKey), x, y])
}

function putRequest(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/cells/update', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('PUT /api/cells/update — auth', () => {
  it('401 when Authorization header is missing entirely (unauthenticated)', async () => {
    const res = await PUT(putRequest({ title: 'hi' }))
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toBe('unauthorized')
  })

  it('403 when the API key does not own any cell (non-owner)', async () => {
    const res = await PUT(putRequest({ title: 'hi' }, { authorization: 'Bearer gk_doesnotexist00000000000000' }))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.error).toBe('not_owner')
  })

  it('200 and persists the update when the API key owns the cell', async () => {
    await createOwnedCell(20, 20, 'gk_owner1')
    const res = await PUT(putRequest({ title: 'My Cell' }, { authorization: 'Bearer gk_owner1' }))
    expect(res.status).toBe(200)
    const row = await testDb.dbQuery('SELECT title FROM grid_cells WHERE x=20 AND y=20')
    expect(row.rows[0].title).toBe('My Cell')
  })
})

describe('PUT /api/cells/update — service_url SSRF + validation', () => {
  it('rejects a private-IP literal service_url with 400 and never saves it or calls the probe layer', async () => {
    await createOwnedCell(21, 21, 'gk_owner2')
    const res = await PUT(putRequest({ service_url: 'https://127.0.0.1/api' }, { authorization: 'Bearer gk_owner2' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('service_url_rejected')
    const row = await testDb.dbQuery('SELECT service_url FROM grid_cells WHERE x=21 AND y=21')
    expect(row.rows[0].service_url).toBeNull()
    expect(probeHolder.fn).not.toHaveBeenCalled()
  })

  it('rejects the cloud-metadata address (169.254.169.254) with 400', async () => {
    await createOwnedCell(22, 22, 'gk_owner3')
    const res = await PUT(putRequest({ service_url: 'https://169.254.169.254/latest/meta-data/' }, { authorization: 'Bearer gk_owner3' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('service_url_rejected')
  })

  it('rejects a non-https service_url with 400 before ever reaching the SSRF check', async () => {
    await createOwnedCell(23, 23, 'gk_owner4')
    const res = await PUT(putRequest({ service_url: 'http://example.com/api' }, { authorization: 'Bearer gk_owner4' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_service_url')
    expect(probeHolder.fn).not.toHaveBeenCalled()
  })

  it('rejects an invalid service_method with 400', async () => {
    await createOwnedCell(24, 24, 'gk_owner5')
    const res = await PUT(
      putRequest({ service_url: 'https://svc.example.com/api', service_method: 'DELETE' }, { authorization: 'Bearer gk_owner5' })
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_service_method')
  })
})

describe('PUT /api/cells/update — probes immediately after saving a service_url', () => {
  it('saves + probes a GET service and persists a can_pay result', async () => {
    await createOwnedCell(25, 25, 'gk_owner6')
    probeHolder.fn.mockResolvedValueOnce({
      status: 'can_pay',
      accepts: [{ scheme: 'exact', network: 'eip155:143', amount: '50000', asset: '0xUsdc', payTo: '0xPay' }],
      network: 'eip155:143',
      price_usdc: '0.05',
      pay_to: '0xPay',
      probed_at: '2026-09-29T00:00:00.000Z',
      note: 'can pay',
    })
    const res = await PUT(
      putRequest(
        { service_url: 'https://svc.example.com/api', service_method: 'GET', service_desc: 'demo', service_category: 'data' },
        { authorization: 'Bearer gk_owner6' }
      )
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.service).toEqual({ status: 'can_pay' }) // no evidence field any more
    expect(probeHolder.fn).toHaveBeenCalledWith('https://svc.example.com/api', 'GET')

    // The column keeps the old vocabulary (its CHECK constraint is not altered): can_pay is stored as 'candidate'.
    const row = await testDb.dbQuery('SELECT probe_status, probe_accepts, probed_at, evidence, evidence_by_network FROM grid_cells WHERE x=25 AND y=25')
    expect(row.rows[0].probe_status).toBe('candidate')
    expect(row.rows[0].probe_accepts[0].network).toBe('eip155:143')
    expect(row.rows[0].evidence).toBeNull() // evidence is no longer written
    expect(row.rows[0].evidence_by_network).toBeNull()
  })

  it('a failed probe is stored as failed and reported as failed', async () => {
    await createOwnedCell(26, 26, 'gk_owner7')
    probeHolder.fn.mockResolvedValueOnce({
      status: 'failed', accepts: null, network: null, price_usdc: null, pay_to: null,
      probed_at: '2026-09-29T00:00:00.000Z', note: 'GET 未返回 402',
    })
    const res = await PUT(putRequest({ service_url: 'https://svc2.example.com/api' }, { authorization: 'Bearer gk_owner7' }))
    expect(res.status).toBe(200)
    expect((await res.json()).service).toEqual({ status: 'failed' })
    const row = await testDb.dbQuery('SELECT probe_status FROM grid_cells WHERE x=26 AND y=26')
    expect(row.rows[0].probe_status).toBe('failed')
  })

  it('never calls the probe layer for a POST service (stays unchecked)', async () => {
    await createOwnedCell(27, 27, 'gk_owner8')
    const res = await PUT(
      putRequest({ service_url: 'https://svc3.example.com/api', service_method: 'POST' }, { authorization: 'Bearer gk_owner8' })
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.service.status).toBe('unchecked')
    expect(probeHolder.fn).not.toHaveBeenCalled()

    const row = await testDb.dbQuery('SELECT probe_status FROM grid_cells WHERE x=27 AND y=27')
    expect(row.rows[0].probe_status).toBe('unprobed') // stored in the column's old vocabulary
  })

  it('does not touch probe fields when the update has no service fields at all', async () => {
    await createOwnedCell(28, 28, 'gk_owner9')
    const res = await PUT(putRequest({ title: 'no service here' }, { authorization: 'Bearer gk_owner9' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.service).toBeNull()
    expect(probeHolder.fn).not.toHaveBeenCalled()
  })
})
