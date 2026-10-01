import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { defaultFacilitatorClients } from '../lib/x402-flow'
import { MOCK_FACILITATOR_MARKER, createMockFacilitator } from '../lib/x402-mock-facilitator'

const FINAL_DIR = path.resolve(__dirname, '..')

afterEach(() => {
  vi.unstubAllEnvs()
})

const isMock = (c: unknown) => (c as { isMock?: boolean }).isMock === true

describe('mock facilitator gate: NODE_ENV !== production AND X402_FACILITATOR_MOCK=1 (AND testnet mode)', () => {
  it('enabled in test / development', async () => {
    for (const nodeEnv of ['test', 'development']) {
      vi.stubEnv('NODE_ENV', nodeEnv)
      vi.stubEnv('X402_FACILITATOR_MOCK', '1')
      const pair = await defaultFacilitatorClients('testnet')
      expect(isMock(pair.base) && isMock(pair.monad)).toBe(true)
    }
  })

  it('NEVER enabled when NODE_ENV=production, even with X402_FACILITATOR_MOCK=1', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('X402_FACILITATOR_MOCK', '1')
    const pair = await defaultFacilitatorClients('testnet')
    expect(isMock(pair.base) || isMock(pair.monad)).toBe(false)
    const mainnet = await defaultFacilitatorClients('mainnet')
    expect(isMock(mainnet.base) || isMock(mainnet.monad)).toBe(false)
  })

  it('off unless the variable is exactly "1"', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    for (const v of [undefined, '', '0', 'true', 'yes', ' 1', '11']) {
      if (v === undefined) vi.stubEnv('X402_FACILITATOR_MOCK', undefined as any)
      else vi.stubEnv('X402_FACILITATOR_MOCK', v)
      const pair = await defaultFacilitatorClients('testnet')
      expect(isMock(pair.base) || isMock(pair.monad)).toBe(false)
    }
  })

  it('off in mainnet mode (a mainnet-shaped authorization must never be signed against a fake settler)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('X402_FACILITATOR_MOCK', '1')
    const pair = await defaultFacilitatorClients('mainnet')
    expect(isMock(pair.base) || isMock(pair.monad)).toBe(false)
  })

  it('second lock: the mock factory itself refuses to run under NODE_ENV=production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => createMockFacilitator('eip155:10143')).toThrow(/must never run with NODE_ENV=production/)
  })
})

describe('the mock import is only reachable through the guarded branch (source-level proof)', () => {
  it('lib/x402-flow.ts is the only module that imports the mock, and only inside the NODE_ENV guard', () => {
    const flowSrc = fs.readFileSync(path.join(FINAL_DIR, 'lib', 'x402-flow.ts'), 'utf8')
    const importAt = flowSrc.indexOf("import('./x402-mock-facilitator')")
    expect(importAt).toBeGreaterThan(0)
    // the nearest `if (` before the import is the guard, and it names all three conditions
    const guard = flowSrc.slice(flowSrc.lastIndexOf('if (', importAt), importAt)
    expect(guard).toContain("process.env.NODE_ENV !== 'production'")
    expect(guard).toContain("process.env.X402_FACILITATOR_MOCK === '1'")
    expect(guard).toContain("mode === 'testnet'")
    // no static import anywhere
    expect(flowSrc).not.toMatch(/^import .*x402-mock-facilitator/m)

    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.next', '.local-db', 'test'].includes(e.name)) continue
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.(ts|tsx|js|jsx|mjs)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes('x402-mock-facilitator')) offenders.push(path.relative(FINAL_DIR, p).replace(/\\/g, '/'))
      }
    }
    walk(FINAL_DIR)
    // x402-flow.ts (the guarded import) and the build checker script (mentions it in its header). Nothing else.
    expect(offenders.sort()).toEqual(['lib/x402-flow.ts', 'scripts/check-no-mock-in-build.mjs'])
  })
})

// Only meaningful right after `npm run build`: the production bundle must not contain the mock at all.
const builtServerDir = path.join(FINAL_DIR, '.next', 'server')
const buildIdFile = path.join(FINAL_DIR, '.next', 'BUILD_ID')
describe.skipIf(!fs.existsSync(buildIdFile))('production build artifact (.next/BUILD_ID present)', () => {
  it(`no file under .next/server contains "${MOCK_FACILITATOR_MARKER}"`, () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.(js|mjs|cjs|json|map)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes(MOCK_FACILITATOR_MARKER)) hits.push(path.relative(FINAL_DIR, p))
      }
    }
    if (fs.existsSync(builtServerDir)) walk(builtServerDir)
    expect(hits).toEqual([])
  })
})

describe('mock facilitator behaves like a facilitator (it is what makes the e2e meaningful)', () => {
  const MONAD_TESTNET = 'eip155:10143'
  const USDC = '0x534b2f3A21130d7a60830c2Df862319e593943A3'
  const PAY_TO = '0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6'
  const requirements = { scheme: 'exact', network: MONAD_TESTNET, asset: USDC, amount: '100000', payTo: PAY_TO, maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' } } as any

  async function signedPayload(overrides: { to?: string; value?: bigint; nonce?: string } = {}) {
    const account = privateKeyToAccount(generatePrivateKey())
    const now = Math.floor(Date.now() / 1000)
    const message = {
      from: account.address,
      to: (overrides.to ?? PAY_TO) as `0x${string}`,
      value: overrides.value ?? 100000n,
      validAfter: BigInt(now - 600),
      validBefore: BigInt(now + 600),
      nonce: (overrides.nonce ?? `0x${'ab'.repeat(32)}`) as `0x${string}`,
    }
    const signature = await account.signTypedData({
      domain: { name: 'USDC', version: '2', chainId: 10143, verifyingContract: USDC },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' }, { name: 'to', type: 'address' }, { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' }, { name: 'validBefore', type: 'uint256' }, { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message,
    })
    const authorization = Object.fromEntries(Object.entries(message).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v]))
    return { account, payload: { x402Version: 2, accepted: requirements, payload: { signature, authorization } } as any }
  }

  it('accepts a valid signature, settles once, refuses a replay of the same nonce', async () => {
    const f = createMockFacilitator(MONAD_TESTNET)
    const { account, payload } = await signedPayload()
    expect(await f.verify(payload, requirements)).toMatchObject({ isValid: true, payer: account.address })
    const s1: any = await f.settle(payload, requirements)
    expect(s1.success).toBe(true)
    expect(s1.transaction).toMatch(/^0x[0-9a-f]{64}$/)
    const s2: any = await f.settle(payload, requirements)
    expect(s2).toMatchObject({ success: false, errorReason: 'nonce_already_used' })
    expect(await f.verify(payload, requirements)).toMatchObject({ isValid: false, invalidReason: 'nonce_already_used' })
  })

  it('rejects a tampered signature, a different recipient and a different amount', async () => {
    const f = createMockFacilitator(MONAD_TESTNET)
    const { payload } = await signedPayload()
    const forged = { ...payload, payload: { ...payload.payload, signature: payload.payload.signature.slice(0, -4) + 'dead' } }
    expect(await f.verify(forged, requirements)).toMatchObject({ isValid: false, invalidReason: 'invalid_signature' })

    const other = await signedPayload({ to: '0x000000000000000000000000000000000000dEaD', nonce: `0x${'cd'.repeat(32)}` })
    expect(await f.verify(other.payload, requirements)).toMatchObject({ isValid: false, invalidReason: 'recipient_mismatch' })

    const cheap = await signedPayload({ value: 1n, nonce: `0x${'ef'.repeat(32)}` })
    expect(await f.verify(cheap.payload, requirements)).toMatchObject({ isValid: false, invalidReason: 'amount_mismatch' })
  })
})
