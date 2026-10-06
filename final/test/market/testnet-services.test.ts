import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb, type TestDb } from '../helpers/pglite-db'
import {
  BASE_SEPOLIA_USDC_ADDRESS,
  BASE_USDC_ADDRESS,
  MONAD_TESTNET_USDC_ADDRESS,
  MONAD_USDC_ADDRESS,
} from '../../lib/market/x402'

// The service index with testnet entries: a cell whose stored probe result offers testnet USDC is listed as
// can_pay on that network, GET /api/services?network=eip155:10143 (and :84532) filters on it, and an entry
// that also offers a mainnet keeps the mainnet as its main network.

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
const { getMarketServices } = await import('../../lib/market/market')
const { resetSchemaCache } = await import('../../lib/schema')
const { GET: servicesGET } = await import('../../app/api/services/route')

const accept = (network: string, asset: string, amount: string, payTo: string) => ({ scheme: 'exact', network, amount, asset, payTo })
const MONAD_TESTNET = accept('eip155:10143', MONAD_TESTNET_USDC_ADDRESS, '10000', '0xPing')
const BASE_SEPOLIA = accept('eip155:84532', BASE_SEPOLIA_USDC_ADDRESS, '10000', '0xPing')
const MONAD_MAIN = accept('eip155:143', MONAD_USDC_ADDRESS, '20000', '0xMain')
const BASE_MAIN = accept('eip155:8453', BASE_USDC_ADDRESS, '30000', '0xMain')

async function addListing(x: number, y: number, title: string, accepts: unknown[]) {
  await testDb.dbQuery(
    `INSERT INTO grid_cells (id, x, y, owner_address, title, service_url, service_method, probe_status, probe_accepts, probed_at, block_id, block_origin_x, block_origin_y)
     VALUES ($1, $2, $3, '0xSeller', $4, $5, 'GET', 'candidate', $6, NOW(), $7, $2, $3)`,
    [x * 100 + y, x, y, title, `https://${title.toLowerCase().replace(/\W+/g, '-')}.example.com/api`, JSON.stringify(accepts), `blk_${x}_${y}_1x1`]
  )
}

beforeEach(async () => {
  await testDb.reset()
  resetSchemaCache()
  await addListing(10, 10, 'Ping Monad Testnet', [MONAD_TESTNET])
  await addListing(11, 11, 'Ping Base Sepolia', [BASE_SEPOLIA])
  await addListing(12, 12, 'Ping Both Testnets', [BASE_SEPOLIA, MONAD_TESTNET])
  await addListing(13, 13, 'Real Money And Testnet', [MONAD_TESTNET, BASE_MAIN, MONAD_MAIN])
  await addListing(14, 14, 'Base Only', [BASE_MAIN])
})

describe('getMarketServices with testnet listings', () => {
  it('lists a testnet-only service as can_pay with its testnet network and price', async () => {
    const e = (await getMarketServices({})).find((s) => s.name === 'Ping Monad Testnet')!
    expect(e.status).toBe('can_pay')
    expect(e.network).toBe('eip155:10143')
    expect(e.price_usdc).toBe('0.01')
    expect(e.pay_to).toBe('0xPing')
    expect(e.networks).toEqual([{ network: 'eip155:10143', price_usdc: '0.01', payTo: '0xPing', asset: MONAD_TESTNET_USDC_ADDRESS }])
  })

  it('orders the networks of an entry Monad, Base, Monad testnet, Base Sepolia; the main network is a mainnet when it offers one', async () => {
    const both = (await getMarketServices({})).find((s) => s.name === 'Ping Both Testnets')!
    expect(both.networks?.map((n) => n.network)).toEqual(['eip155:10143', 'eip155:84532'])
    expect(both.network).toBe('eip155:10143')

    const mixed = (await getMarketServices({})).find((s) => s.name === 'Real Money And Testnet')!
    expect(mixed.networks?.map((n) => n.network)).toEqual(['eip155:143', 'eip155:8453', 'eip155:10143'])
    expect(mixed.network).toBe('eip155:143')
    expect(mixed.price_usdc).toBe('0.02')
  })

  it('filters by network=eip155:10143 and network=eip155:84532 (any network the entry offers)', async () => {
    const names = async (network: string) => (await getMarketServices({ network })).map((e) => e.name).sort()
    expect(await names('eip155:10143')).toEqual(['Ping Both Testnets', 'Ping Monad Testnet', 'Real Money And Testnet'])
    expect(await names('eip155:84532')).toEqual(['Ping Base Sepolia', 'Ping Both Testnets'])
    expect(await names('eip155:8453')).toEqual(['Base Only', 'Real Money And Testnet'])
  })
})

describe('GET /api/services?network=', () => {
  async function get(query: string) {
    const res = await servicesGET(new NextRequest(`http://localhost/api/services${query}`))
    expect(res.status).toBe(200)
    return res.json()
  }

  it('network=eip155:10143 returns exactly the entries that offer Monad testnet', async () => {
    const body = await get('?network=eip155:10143')
    expect(body.ok).toBe(true)
    expect(body.count).toBe(3)
    expect(body.services.map((s: { name: string }) => s.name).sort()).toEqual(['Ping Both Testnets', 'Ping Monad Testnet', 'Real Money And Testnet'])
    for (const s of body.services) expect(s.networks.some((n: { network: string }) => n.network === 'eip155:10143')).toBe(true)
  })

  it('network=eip155:84532 returns exactly the entries that offer Base Sepolia', async () => {
    const body = await get('?network=eip155:84532')
    expect(body.services.map((s: { name: string }) => s.name).sort()).toEqual(['Ping Base Sepolia', 'Ping Both Testnets'])
  })

  it('without a network filter all five are there, testnet ones included', async () => {
    expect((await get('')).count).toBe(5)
  })
})
