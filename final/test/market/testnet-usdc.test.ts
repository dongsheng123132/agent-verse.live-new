import { describe, expect, it } from 'vitest'
import { findAllSupportedUsdcAccepts } from '../../lib/market/x402'

// 2026-10-06: one cell lists an x402 TEST service that only takes testnet USDC; the index must see it as payable.
describe('service index: testnet USDC (Monad testnet, Base Sepolia)', () => {
  it('a testnet-only 402 offers both testnets, mainnets would still come first', () => {
    const accepts = [
      { scheme: 'exact', network: 'eip155:84532', amount: '10000', asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', payTo: '0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6', maxTimeoutSeconds: 60, extra: {} },
      { scheme: 'exact', network: 'eip155:10143', amount: '10000', asset: '0x534b2f3A21130d7a60830c2Df862319e593943A3', payTo: '0x4eCf92bAb524039Fc4027994b9D88C2DB2Ee05E6', maxTimeoutSeconds: 60, extra: {} },
    ]
    expect(findAllSupportedUsdcAccepts(accepts as any).map((a) => a.network)).toEqual(['eip155:10143', 'eip155:84532'])
  })
})
