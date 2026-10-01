import { describe, expect, it } from 'vitest'
import { x402Client } from '@x402/core/client'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { NetworkNotOfferedError, makeNetworkSelector, pickAcceptForNetwork } from '../lib/wallet-pay/accepts'
import { PAY_NETWORKS } from '../lib/wallet-pay/networks'
import { buildDualNetworkAccepts } from '../lib/x402-flow'

const MONAD = 'eip155:143'
const BASE = 'eip155:8453'

/** A server offering both chains, Base FIRST — exactly the order lib/x402-flow.ts buildDualNetworkAccepts produces. */
function accepts() {
  return [
    { scheme: 'exact', network: BASE, asset: PAY_NETWORKS.mainnet.base.usdc.address, amount: '100000', payTo: '0xPay', maxTimeoutSeconds: 60, extra: { name: 'USD Coin', version: '2' } },
    { scheme: 'exact', network: MONAD, asset: PAY_NETWORKS.mainnet.monad.usdc.address, amount: '100000', payTo: '0xPay', maxTimeoutSeconds: 60, extra: { name: 'USDC', version: '2' } },
  ] as any[]
}

describe('pickAcceptForNetwork', () => {
  it('returns only the entry of the chosen network, not the first one', () => {
    expect(pickAcceptForNetwork(accepts(), MONAD)?.network).toBe(MONAD)
    expect(pickAcceptForNetwork(accepts(), BASE)?.network).toBe(BASE)
  })
  it('returns null (never another chain) when the network is not offered', () => {
    const onlyBase = accepts().filter((a) => a.network === BASE)
    expect(pickAcceptForNetwork(onlyBase, MONAD)).toBeNull()
  })
  it('ignores non-exact schemes', () => {
    const list = [{ scheme: 'upto', network: MONAD }, { scheme: 'exact', network: BASE }] as any[]
    expect(pickAcceptForNetwork(list, MONAD)).toBeNull()
  })
})

describe('makeNetworkSelector', () => {
  it('selects the Monad entry although Base is listed first', () => {
    expect(makeNetworkSelector(MONAD)(2, accepts()).network).toBe(MONAD)
  })
  it('selects the Base entry when Base is chosen', () => {
    expect(makeNetworkSelector(BASE)(2, accepts()).network).toBe(BASE)
  })
  it('throws NetworkNotOfferedError instead of falling back to accepts[0]', () => {
    const onlyBase = accepts().filter((a) => a.network === BASE)
    expect(() => makeNetworkSelector(MONAD)(2, onlyBase)).toThrow(NetworkNotOfferedError)
  })
})

describe('real x402Client with the selector (multi-chain accepts)', () => {
  const signer = privateKeyToAccount(generatePrivateKey())
  const clientFor = (chosen: string, registered: string[]) => {
    const c = new x402Client(makeNetworkSelector(chosen))
    for (const n of registered) c.register(n as any, new ExactEvmScheme(signer as any))
    return c
  }

  it('registered for both chains: still only pays on the chosen one (default selection would have picked Base)', () => {
    const c = clientFor(MONAD, [BASE, MONAD])
    expect(c.selectPaymentRequirements(2, accepts()).network).toBe(MONAD)
    const c2 = clientFor(BASE, [BASE, MONAD])
    expect(c2.selectPaymentRequirements(2, accepts()).network).toBe(BASE)
  })

  it('a stock client with no selector picks the first accept — the behaviour we are guarding against', () => {
    const stock = new x402Client()
    stock.register(BASE as any, new ExactEvmScheme(signer as any)).register(MONAD as any, new ExactEvmScheme(signer as any))
    expect(stock.selectPaymentRequirements(2, accepts()).network).toBe(BASE)
  })

  it('registered only for the chosen chain and the server omits it: refuses', () => {
    const onlyBase = accepts().filter((a) => a.network === BASE)
    expect(() => clientFor(MONAD, [MONAD]).selectPaymentRequirements(2, onlyBase)).toThrow()
  })

  it('works on the real server accepts (testnet shape) built by buildDualNetworkAccepts', () => {
    const real = buildDualNetworkAccepts(0.1, 'testnet')
    expect(real.map((a) => a.network)).toEqual(['eip155:84532', 'eip155:10143']) // Base Sepolia first
    // price is a "$0.10" string here, so just confirm the selector picks by network
    const asReq = real.map((a) => ({ scheme: a.scheme, network: a.network })) as any[]
    expect(makeNetworkSelector('eip155:10143')(2, asReq).network).toBe('eip155:10143')
  })
})
