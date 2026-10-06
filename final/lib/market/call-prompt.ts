/**
 * The "copy for AI" text for one listed x402 service, shared by /market and the
 * service card in a cell's detail view. Wallet-neutral: any x402 client can pay
 * (MoneySwitch, awal, @x402/fetch ...); the AI must use one that pays on the
 * service's network.
 */
export const NETWORK_LABEL: Record<string, string> = { 'eip155:8453': 'Base', 'eip155:143': 'Monad', 'eip155:10143': 'Monad testnet', 'eip155:84532': 'Base Sepolia' }

export interface CallPromptInput {
  url: string
  method?: string | null
  /** Price on the main network, decimal USDC (e.g. "0.01"). */
  priceUsdc?: string | null
  /** CAIP-2 networks the 402 offers USDC on, Monad first. */
  networks: string[]
  cell?: { x: number; y: number } | null
  origin: string
}

export function networkLabel(network: string): string {
  return `${NETWORK_LABEL[network] ?? network} (${network})`
}

export function buildCallPrompt(input: CallPromptInput): string {
  const method = (input.method || 'GET').toUpperCase()
  const nets = input.networks.map(networkLabel).join(' or ')
  const priceLine =
    input.priceUsdc && nets
      ? `  Price: $${input.priceUsdc} USDC on ${nets}. Do not pay more than $${input.priceUsdc} without asking me.`
      : '  Price and network: read its 402 response and tell me before paying.'
  const listed = input.cell ? `${input.origin}/?x=${input.cell.x}&y=${input.cell.y}` : `${input.origin}/market`
  return [
    'Call this paid x402 API with my x402 wallet (MoneySwitch, awal, or any x402 client that pays on its network):',
    `  ${method} ${input.url}`,
    priceLine,
    method === 'POST' ? "  It is a POST endpoint: check the service's own docs for the request body." : '',
    `Listed on AgentVerse: ${listed}`,
  ]
    .filter(Boolean)
    .join('\n')
}
