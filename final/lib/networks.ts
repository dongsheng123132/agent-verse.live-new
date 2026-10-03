/**
 * The two chains AgentVerse accepts payment on (Monad, Base), in mainnet and
 * testnet flavour. Pure data — no server imports, because the purchase modal
 * (browser) shows these ids and lib/ai-purchase-prompt.ts writes them into the
 * prompt. The addresses below are intentionally a second copy of the ones in
 * lib/x402-flow.ts; test/networks.test.ts fails if the two ever drift apart.
 */

export type NetworkMode = 'mainnet' | 'testnet'
export type PayNetworkKey = 'monad' | 'base'

export interface PayNetwork {
  key: PayNetworkKey
  /** Short name ("Monad", "Base"). */
  label: string
  chainId: number
  /** CAIP-2 id as it appears in an x402 `accepts` entry. */
  caip2: string
  /** Block-explorer site root, no trailing slash. */
  explorerUrl: string
  usdc: { address: string; decimals: number }
}

function net(key: PayNetworkKey, label: string, chainId: number, explorerUrl: string, usdcAddress: string): PayNetwork {
  return { key, label, chainId, caip2: `eip155:${chainId}`, explorerUrl, usdc: { address: usdcAddress, decimals: 6 } }
}

export const PAY_NETWORKS: Record<NetworkMode, Record<PayNetworkKey, PayNetwork>> = {
  mainnet: {
    monad: net('monad', 'Monad', 143, 'https://monadvision.com', '0x754704Bc059F8C67012fEd69BC8A327a5aafb603'),
    base: net('base', 'Base', 8453, 'https://basescan.org', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
  },
  testnet: {
    monad: net('monad', 'Monad', 10143, 'https://testnet.monadvision.com', '0x534b2f3A21130d7a60830c2Df862319e593943A3'),
    base: net('base', 'Base', 84532, 'https://sepolia.basescan.org', '0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
  },
}
