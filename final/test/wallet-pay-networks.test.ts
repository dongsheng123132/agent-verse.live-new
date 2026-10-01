import { describe, expect, it } from 'vitest'
import {
  PAY_NETWORKS,
  DEFAULT_PAY_NETWORK,
  buildAddChainParams,
  explorerTxUrl,
  findPayNetworkByCaip2,
  getPayNetwork,
  resolveNetworkMode,
} from '../lib/wallet-pay/networks'
import * as flow from '../lib/x402-flow'

describe('mainnet network parameters', () => {
  it('Monad: chainId 143 (0x8f), public RPC, monadvision, MON with 18 decimals', () => {
    const n = PAY_NETWORKS.mainnet.monad
    expect(n.chainId).toBe(143)
    expect(n.chainIdHex).toBe('0x8f')
    expect(n.caip2).toBe('eip155:143')
    expect(n.rpcUrl).toBe('https://rpc.monad.xyz')
    expect(n.explorerUrl).toBe('https://monadvision.com')
    expect(n.nativeCurrency).toEqual({ name: 'Monad', symbol: 'MON', decimals: 18 })
  })

  it('Base: chainId 8453 (0x2105), basescan, ETH', () => {
    const n = PAY_NETWORKS.mainnet.base
    expect(n.chainId).toBe(8453)
    expect(n.chainIdHex).toBe('0x2105')
    expect(n.caip2).toBe('eip155:8453')
    expect(n.explorerUrl).toBe('https://basescan.org')
    expect(n.nativeCurrency.symbol).toBe('ETH')
  })

  it('Monad is the default choice', () => {
    expect(DEFAULT_PAY_NETWORK).toBe('monad')
  })
})

describe('testnet network parameters', () => {
  it('Monad testnet 10143 (0x279f) and Base Sepolia 84532 (0x14a34)', () => {
    expect(PAY_NETWORKS.testnet.monad.chainId).toBe(10143)
    expect(PAY_NETWORKS.testnet.monad.chainIdHex).toBe('0x279f')
    expect(PAY_NETWORKS.testnet.monad.caip2).toBe('eip155:10143')
    expect(PAY_NETWORKS.testnet.base.chainId).toBe(84532)
    expect(PAY_NETWORKS.testnet.base.chainIdHex).toBe('0x14a34')
    expect(PAY_NETWORKS.testnet.base.caip2).toBe('eip155:84532')
  })

  it('every chainIdHex is the lowercase hex of chainId with no padding', () => {
    for (const mode of ['mainnet', 'testnet'] as const) {
      for (const n of Object.values(PAY_NETWORKS[mode])) {
        expect(n.chainIdHex).toBe('0x' + n.chainId.toString(16))
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

describe('resolveNetworkMode', () => {
  it('defaults to mainnet', () => {
    expect(resolveNetworkMode({})).toBe('mainnet')
    expect(resolveNetworkMode({ buildMode: '', acceptNetworks: ['eip155:8453', 'eip155:143'] })).toBe('mainnet')
  })
  it('build flag NEXT_PUBLIC_X402_NETWORK_MODE=testnet wins (case/space tolerant)', () => {
    expect(resolveNetworkMode({ buildMode: 'testnet' })).toBe('testnet')
    expect(resolveNetworkMode({ buildMode: ' TestNet ' })).toBe('testnet')
    expect(resolveNetworkMode({ buildMode: 'testnet', acceptNetworks: ['eip155:8453'] })).toBe('testnet')
  })
  it('a testnet CAIP-2 id in the server accepts means testnet', () => {
    expect(resolveNetworkMode({ acceptNetworks: ['eip155:84532', 'eip155:10143'] })).toBe('testnet')
    expect(resolveNetworkMode({ acceptNetworks: ['eip155:8453', 'eip155:10143'] })).toBe('testnet')
  })
})

describe('wallet_addEthereumChain params and explorer links', () => {
  it('EIP-3085 object for Monad mainnet', () => {
    expect(buildAddChainParams(getPayNetwork('mainnet', 'monad'))).toEqual({
      chainId: '0x8f',
      chainName: 'Monad',
      nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
      rpcUrls: ['https://rpc.monad.xyz'],
      blockExplorerUrls: ['https://monadvision.com'],
    })
  })
  it('Monad -> monadvision.com/tx, Base -> basescan.org/tx', () => {
    expect(explorerTxUrl(getPayNetwork('mainnet', 'monad'), '0xabc')).toBe('https://monadvision.com/tx/0xabc')
    expect(explorerTxUrl(getPayNetwork('mainnet', 'base'), '0xabc')).toBe('https://basescan.org/tx/0xabc')
  })
  it('testnet explorers are the testnet sites', () => {
    expect(explorerTxUrl(getPayNetwork('testnet', 'monad'), '0xabc')).toBe('https://testnet.monadvision.com/tx/0xabc')
    expect(explorerTxUrl(getPayNetwork('testnet', 'base'), '0xabc')).toBe('https://sepolia.basescan.org/tx/0xabc')
  })
  it('findPayNetworkByCaip2 resolves both modes and rejects unknown ids', () => {
    expect(findPayNetworkByCaip2('eip155:143')?.network.key).toBe('monad')
    expect(findPayNetworkByCaip2('eip155:84532')).toMatchObject({ mode: 'testnet' })
    expect(findPayNetworkByCaip2('eip155:1')).toBeNull()
  })
})
