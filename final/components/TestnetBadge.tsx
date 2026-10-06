import React from 'react'
import { offersOnlyTestnets } from '../lib/market/call-prompt'

/**
 * Shown on a service card / a /market entry when EVERY network the entry offers is a testnet
 * (Monad testnet, Base Sepolia): paying there costs nothing real, and the entry is not a real-money service.
 * An entry that also offers a mainnet shows no badge. Nothing is rendered for an entry with no known network.
 */
export const TestnetBadge: React.FC<{ networks: readonly string[] }> = ({ networks }) => {
  if (!offersOnlyTestnets(networks)) return null
  return (
    <span
      data-testid="testnet-badge"
      title="这个服务只在测试网收款，测试网 USDC 没有真实价值"
      className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950/40 border border-amber-700/40 text-amber-400"
    >
      测试网 · 无真实价值
    </span>
  )
}
