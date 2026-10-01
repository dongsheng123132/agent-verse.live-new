import { wrapFetchWithPayment, x402Client, decodePaymentResponseHeader } from '@x402/fetch'
import { decodePaymentRequiredHeader } from '@x402/core/http'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import { createWalletClient, custom } from 'viem'
import { formatAtomicUsdc, totalAtomicForCells } from './amount'
import { makeNetworkSelector, pickAcceptForNetwork } from './accepts'
import { PayError, describeHttpFailure, toPayError } from './errors'
import { explorerTxUrl, getPayNetwork, resolveNetworkMode, type NetworkMode, type PayNetwork, type PayNetworkKey } from './networks'
import { assertEnoughUsdc, ensureChain, readUsdcBalance, requestAccounts, type Eip1193Provider } from './wallet'

export type PayStatus = 'quoting' | 'connecting' | 'switching' | 'checking_balance' | 'signing'

export interface PayForCellsOptions {
  provider: Eip1193Provider
  networkKey: PayNetworkKey
  cells: { x: number; y: number }[]
  /** NEXT_PUBLIC_X402_NETWORK_MODE, passed in by the caller (Next inlines it at build time). */
  buildMode?: string | null
  refCode?: string | null
  /** Absolute origin of the site (the x402 fetch wrapper needs an absolute URL). */
  origin: string
  fetchImpl?: typeof fetch
  /** fetch used only for the read-only RPC balance call. */
  rpcFetchImpl?: typeof fetch
  onStatus?: (status: PayStatus, detail?: string) => void
}

export interface PurchaseSuccess {
  kind: 'single' | 'bulk'
  /** The cell the API key belongs to (the first cell, top-left, of the purchase). */
  keyCell: { x: number; y: number }
  cells: { x: number; y: number }[]
  apiKey: string
  txHash: string | null
  txUrl: string | null
  network: PayNetwork
  mode: NetworkMode
  owner: string | null
  refCode: string | null
  totalUsdc: string
}

async function readJson(res: Response): Promise<any> {
  try {
    const text = await res.text()
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

/** PaymentRequired from a 402: the PAYMENT-REQUIRED header (v2) or the JSON body. */
function readPaymentRequired(res: Response, body: any): { accepts: any[] } {
  const header = res.headers.get('PAYMENT-REQUIRED')
  if (header) {
    try {
      const decoded = decodePaymentRequiredHeader(header) as any
      if (Array.isArray(decoded?.accepts)) return decoded
    } catch {
      /* fall through to the body */
    }
  }
  if (Array.isArray(body?.accepts)) return body
  throw new PayError('unknown', '服务器的付款报价读取失败，请刷新页面重试')
}

function headerError(res: Response): string | null {
  const header = res.headers.get('PAYMENT-REQUIRED')
  if (!header) return null
  try {
    const e = (decodePaymentRequiredHeader(header) as any)?.error
    return typeof e === 'string' && e ? e : null
  } catch {
    return null
  }
}

/**
 * The whole "pay with my browser wallet" flow:
 *   unpaid POST (learn the quote + which chains are offered, fail early on 409/403)
 *   -> connect -> switch/add the chosen chain -> read USDC balance (stop here if short)
 *   -> official x402 client (only the chosen network's accepts) signs an EIP-3009
 *   authorization in the wallet -> paid POST -> receipt.
 * Throws PayError (message is Chinese, ready to show).
 */
export async function payForCells(opts: PayForCellsOptions): Promise<PurchaseSuccess> {
  try {
    return await run(opts)
  } catch (e) {
    throw toPayError(e)
  }
}

async function run(opts: PayForCellsOptions): Promise<PurchaseSuccess> {
  const { provider, networkKey, onStatus } = opts
  const doFetch: typeof fetch = opts.fetchImpl ?? ((input, init) => fetch(input, init))
  if (opts.cells.length === 0) throw new PayError('bad_request', '请先选择格子')

  // Deterministic order: the API key belongs to the first cell, so make that the top-left one.
  const cells = [...opts.cells].sort((a, b) => a.y - b.y || a.x - b.x)
  const single = cells.length === 1
  const url = `${opts.origin}${single ? '/api/cells/purchase' : '/api/cells/bulk-purchase'}`
  const ref = opts.refCode || undefined
  const body = JSON.stringify(single ? { x: cells[0].x, y: cells[0].y, ref } : { cells, ref })
  const init: RequestInit = { method: 'POST', headers: { 'content-type': 'application/json' }, body }
  const expectedAtomic = totalAtomicForCells(cells.length)

  // 1. Unpaid request: price + offered chains. 409 / 403 end here, before any wallet popup.
  onStatus?.('quoting')
  const quote = await doFetch(url, init)
  const quoteBody = await readJson(quote)
  if (quote.status !== 402) throw describeHttpFailure(quote.status, quoteBody)
  const required = readPaymentRequired(quote, quoteBody)

  const mode = resolveNetworkMode({
    buildMode: opts.buildMode,
    acceptNetworks: required.accepts.map((a: any) => a?.network),
  })
  const net = getPayNetwork(mode, networkKey)
  const accept = pickAcceptForNetwork(required.accepts as any[], net.caip2) as any
  if (!accept) {
    throw new PayError('network_not_offered', `服务器目前没有提供 ${net.label} 的付款方式，请换另一条链再试`)
  }
  // Never sign something other than "USDC, exactly cells x price".
  const quotedAmount = String(accept.amount ?? accept.maxAmountRequired ?? '')
  if (quotedAmount !== expectedAtomic.toString()) {
    throw new PayError('price_mismatch', `服务器报价（${quotedAmount || '空'}）和页面价格（${expectedAtomic} = ${formatAtomicUsdc(expectedAtomic)} USDC）不一致，已拒绝签名，请刷新页面重试`)
  }
  if (String(accept.asset ?? '').toLowerCase() !== net.usdc.address.toLowerCase()) {
    throw new PayError('price_mismatch', `服务器要求的付款资产不是 ${net.label} 上的 USDC，已拒绝签名`)
  }

  // 2. Wallet.
  onStatus?.('connecting')
  const address = await requestAccounts(provider)
  onStatus?.('switching', net.chainName)
  await ensureChain(provider, net)

  // 3. Balance (read-only RPC). Short -> stop before asking for any signature.
  onStatus?.('checking_balance')
  const balance = await readUsdcBalance({ net, owner: address, provider, fetchImpl: opts.rpcFetchImpl })
  assertEnoughUsdc(balance, expectedAtomic, net)

  // 4. Official x402 client, pinned to the chosen network.
  const walletClient = createWalletClient({ account: address, transport: custom(provider as any) })
  const signer = {
    address,
    signTypedData: (message: any) => walletClient.signTypedData({ account: address, ...message }),
  }
  const client = new x402Client(makeNetworkSelector(net.caip2))
  client.register(net.caip2 as any, new ExactEvmScheme(signer as any))
  client.setSpendControls({
    maxAmountPerPayment: `$${formatAtomicUsdc(expectedAtomic)}`,
    allowedAssets: [{ network: net.caip2 as any, asset: net.usdc.address, maxAmountPerPayment: expectedAtomic.toString() }],
  })
  const paidFetch = wrapFetchWithPayment(doFetch, client)

  onStatus?.('signing')
  const res = await paidFetch(url, init)
  const data = await readJson(res)

  const settleHeader = res.headers.get('PAYMENT-RESPONSE') ?? res.headers.get('X-PAYMENT-RESPONSE')
  let headerTx: string | null = null
  if (settleHeader) {
    try {
      headerTx = (decodePaymentResponseHeader(settleHeader) as any)?.transaction || null
    } catch {
      /* body tx_hash is the fallback */
    }
  }
  if (!res.ok) throw describeHttpFailure(res.status, data, { txHash: headerTx, paymentRequiredError: headerError(res) })

  const txHash: string | null = headerTx || (typeof data?.tx_hash === 'string' ? data.tx_hash : null)
  const apiKey = data?.api_key
  if (typeof apiKey !== 'string' || !apiKey.startsWith('gk_')) {
    throw new PayError('unknown', `付款已经完成，但服务器没有返回 API key。请保存交易哈希并联系我们${txHash ? `：${txHash}` : ''}`, { txHash: txHash ?? undefined })
  }
  return {
    kind: single ? 'single' : 'bulk',
    keyCell: { x: cells[0].x, y: cells[0].y },
    cells,
    apiKey,
    txHash,
    txUrl: txHash ? explorerTxUrl(net, txHash) : null,
    network: net,
    mode,
    owner: typeof data?.owner === 'string' ? data.owner : null,
    refCode: typeof data?.ref_code === 'string' ? data.ref_code : null,
    totalUsdc: formatAtomicUsdc(expectedAtomic),
  }
}
