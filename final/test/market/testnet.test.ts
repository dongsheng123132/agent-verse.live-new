import { describe, expect, it, vi } from 'vitest'

// Testnet USDC in the service index: Monad testnet (eip155:10143) and Base Sepolia (eip155:84532)
// are recognised next to the two mainnets. probeCellService() runs a real SSRF DNS check, so node:dns
// is mocked (same as test/market/x402-probe.test.ts) and everything here is offline.
vi.mock('node:dns', () => ({
  default: { promises: { lookup: async () => [{ address: '93.184.216.34', family: 4 }] } },
  promises: { lookup: async () => [{ address: '93.184.216.34', family: 4 }] },
}))

import {
  BASE_NETWORK,
  BASE_SEPOLIA_NETWORK,
  BASE_SEPOLIA_USDC_ADDRESS,
  BASE_USDC_ADDRESS,
  MONAD_NETWORK,
  MONAD_TESTNET_NETWORK,
  MONAD_TESTNET_USDC_ADDRESS,
  MONAD_USDC_ADDRESS,
  NETWORK_PRIORITY,
  NETWORK_USDC,
  findAllSupportedUsdcAccepts,
  findSupportedUsdcAccept,
} from '../../lib/market/x402'
import { probeCellService } from '../../lib/market/probe'
import { NETWORK_LABEL, buildCallPrompt, isTestnet, networkLabel, offersOnlyTestnets } from '../../lib/market/call-prompt'

function v2Header(accepts: unknown[]): string {
  return Buffer.from(JSON.stringify({ x402Version: 2, accepts })).toString('base64')
}

const monadTestnet = { scheme: 'exact', network: MONAD_TESTNET_NETWORK, amount: '10000', asset: MONAD_TESTNET_USDC_ADDRESS, payTo: '0xPing' }
const baseSepolia = { scheme: 'exact', network: BASE_SEPOLIA_NETWORK, amount: '10000', asset: BASE_SEPOLIA_USDC_ADDRESS, payTo: '0xPing' }
const monadMain = { scheme: 'exact', network: MONAD_NETWORK, amount: '20000', asset: MONAD_USDC_ADDRESS, payTo: '0xPing' }
const baseMain = { scheme: 'exact', network: BASE_NETWORK, amount: '30000', asset: BASE_USDC_ADDRESS, payTo: '0xPing' }

describe('the network table', () => {
  it('has the two testnet USDC addresses, and the priority is Monad, Base, Monad testnet, Base Sepolia', () => {
    expect(NETWORK_USDC['eip155:10143']).toBe('0x534b2f3A21130d7a60830c2Df862319e593943A3')
    expect(NETWORK_USDC['eip155:84532']).toBe('0x036CbD53842c5426634e7929541eC2318f3dCF7e')
    expect(NETWORK_USDC['eip155:143']).toBe('0x754704Bc059F8C67012fEd69BC8A327a5aafb603')
    expect(NETWORK_USDC['eip155:8453']).toBe('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
    expect(NETWORK_PRIORITY).toEqual(['eip155:143', 'eip155:8453', 'eip155:10143', 'eip155:84532'])
    expect(Object.keys(NETWORK_USDC).sort()).toEqual([...NETWORK_PRIORITY].sort())
  })
})

describe('findAllSupportedUsdcAccepts / findSupportedUsdcAccept with testnets', () => {
  it('returns all four in priority order, whatever the accepts order', () => {
    const matches = findAllSupportedUsdcAccepts([baseSepolia, monadTestnet, baseMain, monadMain])
    expect(matches.map((a) => a.network)).toEqual(['eip155:143', 'eip155:8453', 'eip155:10143', 'eip155:84532'])
  })

  it('a mainnet beats a testnet as the primary accept', () => {
    expect(findSupportedUsdcAccept([monadTestnet, baseMain])?.network).toBe(BASE_NETWORK)
    expect(findSupportedUsdcAccept([baseSepolia, monadTestnet])?.network).toBe(MONAD_TESTNET_NETWORK)
  })

  it('matches the testnet asset case-insensitively and only on its own network', () => {
    expect(findSupportedUsdcAccept([{ ...monadTestnet, asset: MONAD_TESTNET_USDC_ADDRESS.toLowerCase() }])?.network).toBe(MONAD_TESTNET_NETWORK)
    // Right address for another network is not a match.
    expect(findSupportedUsdcAccept([{ ...monadTestnet, asset: BASE_SEPOLIA_USDC_ADDRESS }])).toBeNull()
    expect(findSupportedUsdcAccept([{ ...baseSepolia, asset: MONAD_TESTNET_USDC_ADDRESS }])).toBeNull()
    expect(findSupportedUsdcAccept([{ ...baseSepolia, asset: BASE_USDC_ADDRESS }])).toBeNull()
  })
})

describe('probe: a valid x402 v2 402 with testnet USDC is can_pay', () => {
  function res402(accepts: unknown[]) {
    return vi.fn(async () => ({
      status: 402,
      headers: { get: (name: string) => (name === 'payment-required' ? v2Header(accepts) : null) },
      text: async () => '',
      arrayBuffer: async () => new ArrayBuffer(0),
    }))
  }
  const probe = (accepts: unknown[]) => probeCellService({ url: 'https://svc.example.com/api', method: 'GET' }, { fetchImpl: res402(accepts) as any })

  it('only Monad testnet USDC: can_pay on eip155:10143', async () => {
    const result = await probe([monadTestnet])
    expect(result.status).toBe('can_pay')
    expect(result.network).toBe(MONAD_TESTNET_NETWORK)
    expect(result.price_usdc).toBe('0.01')
    expect(result.payTo).toBe('0xPing')
    expect(result.networks).toEqual([{ network: MONAD_TESTNET_NETWORK, price_usdc: '0.01', payTo: '0xPing', asset: MONAD_TESTNET_USDC_ADDRESS }])
  })

  it('only Base Sepolia USDC: can_pay on eip155:84532', async () => {
    const result = await probe([baseSepolia])
    expect(result.status).toBe('can_pay')
    expect(result.network).toBe(BASE_SEPOLIA_NETWORK)
    expect(result.networks?.map((n) => n.network)).toEqual([BASE_SEPOLIA_NETWORK])
  })

  it('both testnets: Monad testnet is the main network; mainnet + testnets: the mainnet is', async () => {
    const both = await probe([baseSepolia, monadTestnet])
    expect(both.status).toBe('can_pay')
    expect(both.network).toBe(MONAD_TESTNET_NETWORK)
    expect(both.networks?.map((n) => n.network)).toEqual([MONAD_TESTNET_NETWORK, BASE_SEPOLIA_NETWORK])

    const mixed = await probe([monadTestnet, baseSepolia, baseMain])
    expect(mixed.status).toBe('can_pay')
    expect(mixed.network).toBe(BASE_NETWORK)
    expect(mixed.price_usdc).toBe('0.03')
    expect(mixed.networks?.map((n) => n.network)).toEqual([BASE_NETWORK, MONAD_TESTNET_NETWORK, BASE_SEPOLIA_NETWORK])
  })

  it('a testnet 402 with the wrong asset is still failed, and the note names the testnets', async () => {
    const result = await probe([{ ...monadTestnet, asset: '0x0000000000000000000000000000000000000001' }])
    expect(result.status).toBe('failed')
    expect(result.note).toContain('eip155:10143/84532')
  })

  it('an x402 v1 402 on a testnet is failed like any v1 402', async () => {
    const fetchImpl = vi.fn(async () => ({
      status: 402,
      headers: { get: () => null },
      text: async () => JSON.stringify({ x402Version: 1, accepts: [monadTestnet] }),
      arrayBuffer: async () => new ArrayBuffer(0),
    }))
    const result = await probeCellService({ url: 'https://svc.example.com/api', method: 'GET' }, { fetchImpl: fetchImpl as any })
    expect(result.status).toBe('failed')
  })
})

describe('call prompt labels and the testnet helpers', () => {
  const origin = 'https://www.agent-verse.live'

  it('labels Monad testnet and Base Sepolia next to the two mainnets', () => {
    expect(NETWORK_LABEL).toEqual({
      'eip155:8453': 'Base',
      'eip155:143': 'Monad',
      'eip155:10143': 'Monad testnet',
      'eip155:84532': 'Base Sepolia',
    })
    expect(networkLabel('eip155:10143')).toBe('Monad testnet (eip155:10143)')
    expect(networkLabel('eip155:84532')).toBe('Base Sepolia (eip155:84532)')
  })

  it('names the testnets in the price line', () => {
    const p = buildCallPrompt({ url: 'https://x402-ping.example/testnet', priceUsdc: '0.01', networks: ['eip155:10143', 'eip155:84532'], origin })
    expect(p).toContain('$0.01 USDC on Monad testnet (eip155:10143) or Base Sepolia (eip155:84532)')
  })

  it('isTestnet is true for exactly Monad testnet and Base Sepolia', () => {
    expect(isTestnet('eip155:10143')).toBe(true)
    expect(isTestnet('eip155:84532')).toBe(true)
    for (const real of ['eip155:143', 'eip155:8453', 'eip155:1', '', 'solana:mainnet']) expect(isTestnet(real)).toBe(false)
  })

  it('the badge condition: at least one network, and every one of them a testnet', () => {
    expect(offersOnlyTestnets(['eip155:10143'])).toBe(true)
    expect(offersOnlyTestnets(['eip155:84532'])).toBe(true)
    expect(offersOnlyTestnets(['eip155:10143', 'eip155:84532'])).toBe(true)
    expect(offersOnlyTestnets(['eip155:143', 'eip155:10143'])).toBe(false)
    expect(offersOnlyTestnets(['eip155:8453', 'eip155:84532'])).toBe(false)
    expect(offersOnlyTestnets(['eip155:143'])).toBe(false)
    expect(offersOnlyTestnets([])).toBe(false)
  })
})
