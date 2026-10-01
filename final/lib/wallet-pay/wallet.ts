import { buildAddChainParams, type PayNetwork } from './networks'
import { NO_GAS_NOTE, PayError, isUserRejection } from './errors'
import { formatAtomicUsdc } from './amount'

/** Minimal EIP-1193 surface we use. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<any>
}

/** window.ethereum (MetaMask / OKX / Rabby / in-app wallet browsers). Prefers MetaMask when several wallets stack providers. */
export function getInjectedProvider(w: any = typeof window !== 'undefined' ? window : undefined): Eip1193Provider | null {
  const eth = w?.ethereum
  if (!eth || typeof eth.request !== 'function') return null
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    return eth.providers.find((p: any) => p?.isMetaMask) ?? eth.providers[0]
  }
  return eth as Eip1193Provider
}

export async function requestAccounts(provider: Eip1193Provider): Promise<`0x${string}`> {
  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  const address = Array.isArray(accounts) ? accounts[0] : null
  if (typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new PayError('no_wallet', '钱包没有返回可用的账户，请在钱包里解锁并授权本站后重试')
  }
  return address as `0x${string}`
}

export async function getChainId(provider: Eip1193Provider): Promise<number> {
  const raw = await provider.request({ method: 'eth_chainId' })
  return typeof raw === 'string' ? parseInt(raw, raw.startsWith('0x') ? 16 : 10) : Number(raw)
}

function looksLikeUnknownChain(e: any): boolean {
  // 4902 is the standard code; MetaMask mobile / OKX / some Rabby builds answer -32603 or a bare message.
  if (e?.code === 4902 || e?.data?.originalError?.code === 4902) return true
  return /unrecognized chain|not been added|unknown chain|chain.*not.*(added|found|supported)/i.test(String(e?.message ?? ''))
}

/** Make the wallet sit on `net`: switch, adding the chain first if the wallet does not know it. */
export async function ensureChain(provider: Eip1193Provider, net: PayNetwork): Promise<void> {
  if ((await getChainId(provider)) === net.chainId) return
  const sw = () => provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: net.chainIdHex }] })
  try {
    await sw()
  } catch (e) {
    if (isUserRejection(e)) throw e
    if (!looksLikeUnknownChain(e)) {
      throw new PayError('chain_switch_failed', `没能把钱包切换到 ${net.chainName}（chainId ${net.chainId}）：${(e as any)?.message ?? e}`)
    }
    try {
      await provider.request({ method: 'wallet_addEthereumChain', params: [buildAddChainParams(net)] })
    } catch (e2) {
      if (isUserRejection(e2)) throw e2
      throw new PayError('chain_switch_failed', `没能把 ${net.chainName} 网络添加进钱包：${(e2 as any)?.message ?? e2}`)
    }
    // MetaMask switches by itself after adding; others need an explicit switch.
    if ((await getChainId(provider)) !== net.chainId) await sw()
  }
  if ((await getChainId(provider)) !== net.chainId) {
    throw new PayError('chain_switch_failed', `钱包仍然不在 ${net.chainName} 网络上，请在钱包里手动切换后重试`)
  }
}

const BALANCE_OF = '0x70a08231'

function balanceCallData(owner: string): string {
  return BALANCE_OF + owner.toLowerCase().replace(/^0x/, '').padStart(64, '0')
}

async function rpcEthCall(rpcUrl: string, to: string, data: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<bigint> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`rpc http ${res.status}`)
    const json = await res.json()
    if (json?.error || typeof json?.result !== 'string') throw new Error(`rpc error ${JSON.stringify(json?.error ?? json)}`)
    return json.result === '0x' ? 0n : BigInt(json.result)
  } finally {
    clearTimeout(timer)
  }
}

/**
 * USDC balance (atomic units) of `owner` on `net`, read through the public
 * read-only RPC; falls back to asking the wallet (already on the right chain)
 * if that RPC is unreachable from this browser. null = could not be determined
 * (the caller then lets the payment proceed — the facilitator is the real judge).
 */
export async function readUsdcBalance(args: {
  net: PayNetwork
  owner: string
  provider?: Eip1193Provider | null
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<bigint | null> {
  const { net, owner, provider } = args
  const data = balanceCallData(owner)
  const fetchImpl: typeof fetch = args.fetchImpl ?? ((input, init) => fetch(input, init))
  try {
    return await rpcEthCall(net.rpcUrl, net.usdc.address, data, fetchImpl, args.timeoutMs ?? 8000)
  } catch {
    /* fall through to the wallet */
  }
  if (provider) {
    try {
      const raw = await provider.request({ method: 'eth_call', params: [{ to: net.usdc.address, data }, 'latest'] })
      if (typeof raw === 'string' && raw.startsWith('0x')) return raw === '0x' ? 0n : BigInt(raw)
    } catch {
      /* unknown */
    }
  }
  return null
}

/** Throws PayError('insufficient_usdc') when the balance is known and below `needed`. */
export function assertEnoughUsdc(balance: bigint | null, needed: bigint, net: PayNetwork): void {
  if (balance === null || balance >= needed) return
  throw new PayError(
    'insufficient_usdc',
    `你的钱包在 ${net.label} 上的 USDC 不够：现有 ${formatAtomicUsdc(balance)} USDC，需要 ${formatAtomicUsdc(needed)} USDC。${NO_GAS_NOTE}请先给钱包充值 USDC（${net.label}）再来`
  )
}
