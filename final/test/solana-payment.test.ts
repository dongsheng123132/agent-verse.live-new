import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  address, appendTransactionMessageInstructions, compileTransaction,
  createTransactionMessage, getBase64Decoder, getTransactionEncoder,
  setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash,
  type SignatureBytes,
} from '@solana/kit'
import { TOKEN_PROGRAM_ADDRESS } from '@x402/svm'
import { SOLANA_NETWORK, SOLANA_PAY_TO, SOLANA_USDC_ADDRESS } from '../lib/networks'
import { sameWalletAddress, solanaTokenPayer } from '../lib/solana-payment'
import { createTestDb, type TestDb } from './helpers/pglite-db'
import { createMockFacilitator } from './helpers/facilitator'

const holder = vi.hoisted(() => ({ db: null as any }))
vi.mock('../lib/db', () => ({
  dbQuery: (sql: string, params?: unknown[]) => holder.db.dbQuery(sql, params),
  withTransaction: (fn: any) => holder.db.withTransaction(fn),
}))
const flow = await import('../lib/x402-flow')
const { purchaseHandler } = await import('../app/api/cells/purchase/handler')
const { bulkPurchaseHandler } = await import('../app/api/cells/bulk-purchase/handler')
const { regenHandler } = await import('../app/api/cells/regen-key/handler')
const BUYER = address('FNyQi4CKkKdXDZEgPrGsC9LRioSxEZPHxfbm3L6LPF2y')
const SPONSOR = SOLANA_PAY_TO
let db: TestDb
const base = createMockFacilitator('eip155:8453')
const monad = createMockFacilitator('eip155:143')

function transaction(amount = 100000n, mint = SOLANA_USDC_ADDRESS, duplicate = false) {
  const data = new Uint8Array(10)
  data[0] = 12
  new DataView(data.buffer).setBigUint64(1, amount, true)
  data[9] = 6
  const transfer = {
    programAddress: address(TOKEN_PROGRAM_ADDRESS),
    accounts: [
      { address: address('2JFq6rwKZj1W4iiEuL1bNsLwfZavN2vP5Pw3DY677JA5'), role: 1 },
      { address: address(mint), role: 0 },
      { address: address('9FPexcDPLLSAZYhDmo62VvNsYMFRTXyJeUsDvvdHG4mN'), role: 1 },
      { address: address(BUYER), role: 2 },
    ],
    data,
  } as const
  const message = appendTransactionMessageInstructions(duplicate ? [transfer, transfer] : [transfer],
    setTransactionMessageLifetimeUsingBlockhash({ blockhash: '11111111111111111111111111111111' as any, lastValidBlockHeight: 1n },
      setTransactionMessageFeePayer(address(SPONSOR), createTransactionMessage({ version: 0 }))))
  const tx = compileTransaction(message)
  return getBase64Decoder().decode(getTransactionEncoder().encode({
    ...tx, signatures: { ...tx.signatures, [BUYER]: new Uint8Array(64).fill(1) as SignatureBytes },
  }))
}
function post(path: string, body: unknown, header?: string) {
  return new NextRequest(`http://localhost${path}`, { method: 'POST',
    headers: { 'content-type': 'application/json', ...(header ? { 'payment-signature': header } : {}) },
    body: JSON.stringify(body),
  })
}
async function header(amount = 100000n) {
  const quote = await purchaseHandler(post('/api/cells/purchase', { x: 95, y: 95 }))
  const accepts = JSON.parse(Buffer.from(quote.headers.get('payment-required')!, 'base64').toString()).accepts
  const accepted = accepts.find((a: any) => a.network === SOLANA_NETWORK)
  expect(accepted).toMatchObject({ payTo: SOLANA_PAY_TO, asset: SOLANA_USDC_ADDRESS, amount: '100000' })
  accepted.amount = amount.toString()
  return Buffer.from(JSON.stringify({ x402Version: 2, accepted, payload: { transaction: transaction(amount) } })).toString('base64')
}
beforeAll(async () => { db = await createTestDb(); holder.db = db; process.env.DATABASE_URL = 'postgres://test-fake-not-used' })
afterAll(async () => { await db.close() })
beforeEach(async () => {
  await db.reset()
  vi.clearAllMocks()
  flow.resetSharedX402Server()
  base.settle.mockImplementation(async (_payload: any, requirements: any) => ({
    success: true, network: requirements.network, transaction: 'LocalTestSignature', payer: SPONSOR,
  }))
  await flow.getSharedX402Server(async () => ({ base, monad }))
})

describe('Solana buyer identity', () => {
  const requirements = { network: SOLANA_NETWORK, asset: SOLANA_USDC_ADDRESS, amount: '100000' } as any
  it('extracts the signed USDC authority, not the fee sponsor or an injected authorization', () => {
    expect(solanaTokenPayer({ payload: { transaction: transaction(), authorization: { from: SPONSOR } } } as any, requirements)).toBe(BUYER)
  })
  it('rejects malformed, insufficient, wrong-mint and ambiguous payments before settling', () => {
    for (const raw of ['invalid', transaction(99999n), transaction(100000n, SPONSOR), transaction(100000n, SOLANA_USDC_ADDRESS, true)]) {
      expect(solanaTokenPayer({ payload: { transaction: raw } } as any, requirements)).toBeNull()
    }
  })
  it('keeps Solana addresses case sensitive and EVM comparisons case insensitive', () => {
    expect(sameWalletAddress(BUYER, BUYER.toLowerCase())).toBe(false)
    expect(sameWalletAddress(BUYER, BUYER)).toBe(true)
    expect(sameWalletAddress('0x' + 'ab'.repeat(20), '0x' + 'AB'.repeat(20))).toBe(true)
  })
})

describe('Solana x402 purchases and key recovery', () => {
  it('leaves EVM available when the facilitator cannot sponsor Solana', async () => {
    const evmOnly = createMockFacilitator('eip155:8453')
    const supported = await evmOnly.getSupported()
    evmOnly.getSupported.mockResolvedValue({ ...supported, kinds: supported.kinds.map((kind) => ({ ...kind, extra: {} })) })
    flow.resetSharedX402Server()
    await flow.getSharedX402Server(async () => ({ base: evmOnly, monad }))
    const res = await purchaseHandler(post('/api/cells/purchase', { x: 95, y: 95 }))
    const quote = JSON.parse(Buffer.from(res.headers.get('payment-required')!, 'base64').toString())
    expect(quote.accepts.map((a: any) => a.network).sort()).toEqual(['eip155:143', 'eip155:8453'])
    expect(flow.getUnavailableX402Networks()).toEqual([SOLANA_NETWORK])
  })
  it('offers the owner-approved treasury and delivers a single cell to the USDC buyer', async () => {
    const res = await purchaseHandler(post('/api/cells/purchase', { x: 90, y: 95 }, await header()))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ owner: BUYER, network: SOLANA_NETWORK })
    expect(res.headers.get('payment-response')).toBeTruthy()
    expect((await db.dbQuery('SELECT owner_address FROM grid_cells WHERE x=90 AND y=95')).rows[0].owner_address).toBe(BUYER)
  })
  it('delivers an entire block to the buyer even when the settlement response names the sponsor', async () => {
    const res = await bulkPurchaseHandler(post('/api/cells/bulk-purchase', { cells: [{ x: 90, y: 95 }, { x: 91, y: 95 }] }, await header(200000n)))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ owner: BUYER, network: SOLANA_NETWORK, count: 2 })
  })
  it('allows only the exact Solana owner to recover a key and rejects a case-changed owner before settlement', async () => {
    await db.dbQuery("INSERT INTO grid_cells (id,x,y,owner_address,status,block_origin_x,block_origin_y) VALUES (9590,90,95,$1,'HOLDING',90,95)", [BUYER])
    const good = await regenHandler(post('/api/cells/regen-key', { x: 90, y: 95 }, await header()))
    expect(good.status).toBe(200)
    await db.dbQuery('UPDATE grid_cells SET owner_address=$1 WHERE x=90 AND y=95', [BUYER.toLowerCase()])
    base.settle.mockClear()
    const rejected = await regenHandler(post('/api/cells/regen-key', { x: 90, y: 95 }, await header()))
    expect(rejected.status).toBe(403)
    expect(base.settle).not.toHaveBeenCalled()
  })
})
