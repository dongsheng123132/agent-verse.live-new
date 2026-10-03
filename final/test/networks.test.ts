import { describe, expect, it } from 'vitest'
import { PAY_NETWORKS } from '../lib/networks'
import * as flow from '../lib/x402-flow'

describe('mainnet network parameters', () => {
  it('Monad: chainId 143, caip2 eip155:143, monadvision explorer', () => {
    const n = PAY_NETWORKS.mainnet.monad
    expect(n.chainId).toBe(143)
    expect(n.caip2).toBe('eip155:143')
    expect(n.explorerUrl).toBe('https://monadvision.com')
  })

  it('Base: chainId 8453, caip2 eip155:8453, basescan explorer', () => {
    const n = PAY_NETWORKS.mainnet.base
    expect(n.chainId).toBe(8453)
    expect(n.caip2).toBe('eip155:8453')
    expect(n.explorerUrl).toBe('https://basescan.org')
  })
})

describe('testnet network parameters', () => {
  it('Monad testnet 10143 and Base Sepolia 84532, with the testnet explorers', () => {
    expect(PAY_NETWORKS.testnet.monad.chainId).toBe(10143)
    expect(PAY_NETWORKS.testnet.monad.caip2).toBe('eip155:10143')
    expect(PAY_NETWORKS.testnet.monad.explorerUrl).toBe('https://testnet.monadvision.com')
    expect(PAY_NETWORKS.testnet.base.chainId).toBe(84532)
    expect(PAY_NETWORKS.testnet.base.caip2).toBe('eip155:84532')
    expect(PAY_NETWORKS.testnet.base.explorerUrl).toBe('https://sepolia.basescan.org')
  })

  it('every caip2 is eip155:<chainId>', () => {
    for (const mode of ['mainnet', 'testnet'] as const) {
      for (const n of Object.values(PAY_NETWORKS[mode])) {
        expect(n.caip2).toBe('eip155:' + n.chainId)
      }
    }
  })
})

describe('USDC addresses match the server (lib/x402-flow.ts) — drift guard', () => {
  it('mainnet', () => {
    expect(PAY_NETWORKS.mainnet.monad.usdc.address.toLowerCase()).toBe(flow.MONAD_USDC_ADDRESS.toLowerCase())
    expect(PAY_NETWORKS.mainnet.base.caip2).toBe(flow.BASE_NETWORK)
    expect(PAY_NETWORKS.mainnet.monad.caip2).toBe(flow.MONAD_NETWORK)
  })
  it('testnet', () => {
    expect(PAY_NETWORKS.testnet.monad.usdc.address.toLowerCase()).toBe(flow.MONAD_TESTNET_USDC_ADDRESS.toLowerCase())
    expect(PAY_NETWORKS.testnet.base.usdc.address.toLowerCase()).toBe(flow.BASE_SEPOLIA_USDC_ADDRESS.toLowerCase())
    expect(PAY_NETWORKS.testnet.monad.caip2).toBe(flow.MONAD_TESTNET_NETWORK)
    expect(PAY_NETWORKS.testnet.base.caip2).toBe(flow.BASE_SEPOLIA_NETWORK)
  })
  it('getActiveNetworks agrees with the table in both modes', () => {
    expect(flow.getActiveNetworks('mainnet')).toEqual({ base: PAY_NETWORKS.mainnet.base.caip2, monad: PAY_NETWORKS.mainnet.monad.caip2 })
    expect(flow.getActiveNetworks('testnet')).toEqual({ base: PAY_NETWORKS.testnet.base.caip2, monad: PAY_NETWORKS.testnet.monad.caip2 })
  })
})
