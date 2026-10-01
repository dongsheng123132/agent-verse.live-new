/**
 * Browser-wallet payment: the two chains a person can pay on, in mainnet and
 * testnet flavour. Pure data + tiny helpers — no server imports (this file is
 * bundled into the browser), so the addresses below are intentionally a second
 * copy of the ones in lib/x402-flow.ts; test/wallet-pay-networks.test.ts fails
 * if the two ever drift apart.
 */

export type NetworkMode = 'mainnet' | 'testnet'
export type PayNetworkKey = 'monad' | 'base'

export interface PayNetwork {
  key: PayNetworkKey
  /** Short name shown on the button / in messages ("Monad", "Base"). */
  label: string
  /** Name handed to wallet_addEthereumChain. */
  chainName: string
  chainId: number
  /** 0x-prefixed lowercase hex, no leading zeros (what wallets expect). */
  chainIdHex: string
  /** CAIP-2 id as it appears in an x402 `accepts` entry. */
  caip2: string
  /** Read-only public RPC (balance check + wallet_addEthereumChain). */
  rpcUrl: string
  /** Block-explorer site root, no trailing slash. */
  explorerUrl: string
  nativeCurrency: { name: string; symbol: string; decimals: number }
  usdc: { address: string; decimals: number }
}

function net(
  key: PayNetworkKey,
  label: string,
  chainName: string,
  chainId: number,
  rpcUrl: string,
  explorerUrl: string,
  nativeCurrency: PayNetwork['nativeCurrency'],
  usdcAddress: string
): PayNetwork {
  return {
    key,
    label,
    chainName,
    chainId,
    chainIdHex: `0x${chainId.toString(16)}`,
    caip2: `eip155:${chainId}`,
    rpcUrl,
    explorerUrl,
    nativeCurrency,
    usdc: { address: usdcAddress, decimals: 6 },
  }
}

const MON = { name: 'Monad', symbol: 'MON', decimals: 18 }
const ETH = { name: 'Ether', symbol: 'ETH', decimals: 18 }

export const PAY_NETWORKS: Record<NetworkMode, Record<PayNetworkKey, PayNetwork>> = {
  mainnet: {
    monad: net('monad', 'Monad', 'Monad', 143, 'https://rpc.monad.xyz', 'https://monadvision.com', MON, '0x754704Bc059F8C67012fEd69BC8A327a5aafb603'),
    base: net('base', 'Base', 'Base', 8453, 'https://mainnet.base.org', 'https://basescan.org', ETH, '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
  },
  testnet: {
    monad: net('monad', 'Monad', 'Monad Testnet', 10143, 'https://testnet-rpc.monad.xyz', 'https://testnet.monadvision.com', MON, '0x534b2f3A21130d7a60830c2Df862319e593943A3'),
    base: net('base', 'Base', 'Base Sepolia', 84532, 'https://sepolia.base.org', 'https://sepolia.basescan.org', ETH, '0x036CbD53842c5426634e7929541eC2318f3dCF7e'),
  },
}

export const DEFAULT_PAY_NETWORK: PayNetworkKey = 'monad'

export const PAY_NETWORK_ORDER: PayNetworkKey[] = ['monad', 'base']

const TESTNET_CAIP2 = new Set(Object.values(PAY_NETWORKS.testnet).map((n) => n.caip2))

export function getPayNetwork(mode: NetworkMode, key: PayNetworkKey): PayNetwork {
  return PAY_NETWORKS[mode][key]
}

/**
 * Mainnet or testnet?  The build-time flag (NEXT_PUBLIC_X402_NETWORK_MODE=testnet)
 * wins; otherwise the server's own 402 `accepts` decide — any testnet CAIP-2 id
 * in it means the server runs X402_NETWORK_MODE=testnet.
 */
export function resolveNetworkMode(opts: { buildMode?: string | null; acceptNetworks?: string[] | null }): NetworkMode {
  if (String(opts.buildMode ?? '').trim().toLowerCase() === 'testnet') return 'testnet'
  if (opts.acceptNetworks?.some((n) => TESTNET_CAIP2.has(n))) return 'testnet'
  return 'mainnet'
}

/** wallet_addEthereumChain parameter object (EIP-3085). */
export function buildAddChainParams(n: PayNetwork) {
  return {
    chainId: n.chainIdHex,
    chainName: n.chainName,
    nativeCurrency: { ...n.nativeCurrency },
    rpcUrls: [n.rpcUrl],
    blockExplorerUrls: [n.explorerUrl],
  }
}

/** Explorer link for a transaction hash on the given network. */
export function explorerTxUrl(n: PayNetwork, txHash: string): string {
  return `${n.explorerUrl}/tx/${txHash}`
}

/** Look up a network by CAIP-2 id in either mode. */
export function findPayNetworkByCaip2(caip2: string): { mode: NetworkMode; network: PayNetwork } | null {
  for (const mode of ['mainnet', 'testnet'] as const) {
    for (const n of Object.values(PAY_NETWORKS[mode])) {
      if (n.caip2 === caip2) return { mode, network: n }
    }
  }
  return null
}
