import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import * as B from '../scripts/lib/raw-x402-buyer.mjs'

const MONAD_T = 'eip155:10143'
const BASE_S = 'eip155:84532'
const bill = (accepts: any[]) => ({ x402Version: 2, accepts, resource: { url: 'http://localhost/api/cells/purchase' } })
const accept = (network: string, amount = '100000') => ({
  scheme: 'exact',
  network,
  amount,
  asset: '0x534b2f3A21130d7a60830c2Df862319e593943A3',
  payTo: '0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6',
  maxTimeoutSeconds: 300,
  extra: { name: 'USDC', version: '2' },
})

describe('safety guard: testnets only', () => {
  it('only Monad testnet and Base Sepolia are allowed, Monad first', () => {
    expect(B.ALLOWED_NETWORKS).toEqual([MONAD_T, BASE_S])
  })

  it('picks Monad testnet when it is offered, whatever the order', () => {
    const chosen = B.chooseAccept(bill([accept(BASE_S), accept('eip155:143'), accept(MONAD_T)]))
    expect(chosen.network).toBe(MONAD_T)
  })

  it('falls back to Base Sepolia when Monad testnet is not offered', () => {
    expect(B.chooseAccept(bill([accept('eip155:8453'), accept(BASE_S)])).network).toBe(BASE_S)
  })

  it('REFUSES a bill that offers only mainnets (eip155:143 / eip155:8453): GuardError, nothing to sign', () => {
    expect(() => B.chooseAccept(bill([accept('eip155:143'), accept('eip155:8453')]))).toThrow(B.GuardError)
    expect(() => B.chooseAccept(bill([accept('eip155:143'), accept('eip155:8453')]))).toThrow(/eip155:143, eip155:8453/)
    expect(() => B.chooseAccept(bill([]))).toThrow(B.GuardError)
    expect(() => B.chooseAccept({})).toThrow(B.GuardError)
  })

  it('refuses amounts above 1 USDC and non-positive amounts', () => {
    expect(() => B.chooseAccept(bill([accept(MONAD_T, '1000001')]))).toThrow(/上限/)
    expect(() => B.chooseAccept(bill([accept(MONAD_T, '0')]))).toThrow(B.GuardError)
    expect(B.chooseAccept(bill([accept(MONAD_T, '1000000')])).amount).toBe('1000000')
  })

  it('signBill refuses a mainnet accept even if called directly, before the signer is touched', async () => {
    const buyer = {
      http: {
        createPaymentPayload: () => {
          throw new Error('signer must not be reached')
        },
      },
    }
    await expect(B.signBill(buyer, bill([]), accept('eip155:143'))).rejects.toThrow(B.GuardError)
    await expect(B.signBill(buyer, bill([]), accept('eip155:8453'))).rejects.toThrow(B.GuardError)
  })

  it('splitAccepts separates signable and refused networks', () => {
    const { allowed, refused } = B.splitAccepts([accept('eip155:143'), accept(MONAD_T), accept('eip155:8453')])
    expect(allowed.map((a: any) => a.network)).toEqual([MONAD_T])
    expect(refused.map((a: any) => a.network)).toEqual(['eip155:143', 'eip155:8453'])
  })
})

describe('human-readable bill and authorization', () => {
  it('formatUsdc', () => {
    expect(B.formatUsdc('100000')).toBe('0.10')
    expect(B.formatUsdc(1000000n)).toBe('1.00')
    expect(B.formatUsdc('60000')).toBe('0.06')
    expect(B.formatUsdc(1)).toBe('0.000001')
  })

  it('describeBill shows amount, token, network, payTo and validity', () => {
    const a = accept(MONAD_T)
    const text = B.describeBill(bill([a, accept(BASE_S)]), a, 'POST http://localhost:3005/api/cells/purchase').join('\n')
    expect(text).toContain('0.10 USDC')
    expect(text).toContain('100000')
    expect(text).toContain(a.asset)
    expect(text).toContain('Monad 测试网（eip155:10143）')
    expect(text).toContain(a.payTo)
    expect(text).toContain('300 秒')
    expect(text).toContain('POST http://localhost:3005/api/cells/purchase')
  })

  it('describeAuthorization shows the EIP-3009 fields and only a shortened signature', () => {
    const sig = '0x' + 'ab'.repeat(65)
    const text = B.describeAuthorization({ payload: { signature: sig, authorization: { from: '0xFrom', to: '0xTo', value: '100000', validAfter: '0', validBefore: '9999999999', nonce: '0x' + '11'.repeat(32) } } }).join('\n')
    for (const k of ['from', 'to', 'value', 'validAfter', 'validBefore', 'nonce', 'signature']) expect(text).toContain(k)
    expect(text).toContain('0.10 USDC')
    expect(text).not.toContain(sig)
  })
})

describe('the throwaway wallet', () => {
  function tmp() {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'taste-wallet-'))
  }

  it('creates a wallet file, reuses it next time, and never exposes the private key in its public view', () => {
    const dir = tmp()
    const first = B.loadOrCreateWallet(dir)
    expect(first.created).toBe(true)
    expect(first.data.privateKey).toMatch(/^0x[0-9a-f]{64}$/)
    const view = B.publicView(first)
    expect(Object.keys(view).sort()).toEqual(['address', 'created', 'file'])
    expect(JSON.stringify(view)).not.toContain(first.data.privateKey)
    const second = B.loadOrCreateWallet(dir)
    expect(second.created).toBe(false)
    expect(second.data.address).toBe(first.data.address)
    expect(second.data.privateKey).toBe(first.data.privateKey)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('stores the gk_ key next to the wallet, and maskKey keeps it unusable when printed', () => {
    const dir = tmp()
    const w = B.loadOrCreateWallet(dir)
    const key = 'gk_0123456789abcdef0123456789abcdef'
    B.saveCellKey(w, { x: 61, y: 72 }, { key, network: MONAD_T, tx: '0xabc', mock: true })
    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'wallet.json'), 'utf8'))
    expect(onDisk.cells['61,72'].key).toBe(key)
    expect(onDisk.privateKey).toBe(w.data.privateKey)
    const masked = B.maskKey(key)
    expect(masked).not.toBe(key)
    expect(masked.length).toBeLessThan(key.length)
    expect(masked.startsWith('gk_')).toBe(true)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('rejects a corrupt wallet file instead of overwriting it', () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'wallet.json'), '{not json')
    expect(() => B.loadOrCreateWallet(dir)).toThrow(/不是合法的 JSON/)
    fs.writeFileSync(path.join(dir, 'wallet.json'), JSON.stringify({ privateKey: 'nope' }))
    expect(() => B.loadOrCreateWallet(dir)).toThrow(/私钥/)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('the default wallet folder is outside the repo, under the user profile', () => {
    const dir = B.defaultWalletDir()
    expect(dir).toBe(path.join(os.homedir(), '.agentverse-taste'))
    expect(dir.startsWith(path.resolve(__dirname, '..'))).toBe(false)
  })
})

describe('taste-x402.mjs source never prints the private key', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'taste-x402.mjs'), 'utf8')
  it('no console output interpolates privateKey, and the script uses publicView for the wallet', () => {
    expect(src).toContain('publicView(wallet)')
    const printing = src.split('\n').filter((l) => /\bline\(|console\.(log|error)/.test(l))
    for (const l of printing) expect(l, l).not.toMatch(/privateKey/)
  })
})
