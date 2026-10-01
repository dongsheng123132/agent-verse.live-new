/**
 * A fake browser wallet (EIP-1193) backed by a throwaway viem private key.
 * Node side only: vitest uses `wallet.request` directly as the provider, and
 * scripts/e2e-wallet-buy.mjs exposes `wallet.request` into the page through
 * Playwright's exposeFunction so `window.ethereum` forwards to it.
 *
 * It behaves like MetaMask where it matters for this app:
 *  - wallet_switchEthereumChain to a chain it does not know -> error 4902
 *  - wallet_addEthereumChain validates the EIP-3085 object and then switches
 *  - eth_signTypedData_v4 refuses when the typed-data domain.chainId is not the
 *    wallet's current chain (real wallets do), and honours rejectNextSign (4001)
 *  - eth_call answers USDC balanceOf from state.usdcBalance (the "wallet fallback" read)
 * Everything it was asked is recorded in `state` so tests can assert on it.
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

function rpcError(code, message) {
  return Object.assign(new Error(message), { code })
}

const HEX_CHAIN_ID = /^0x[1-9a-f][0-9a-f]*$/

export function createMockWallet({
  privateKey = generatePrivateKey(),
  initialChainId = 1,
  knownChainIds = [1],
  usdcBalance = 5_000_000n,
  signDelayMs = 0, // e2e uses this so the "waiting for the wallet" state is visible long enough to screenshot
} = {}) {
  const account = privateKeyToAccount(privateKey)
  const state = {
    chainId: initialChainId,
    known: new Set(knownChainIds),
    added: [], // wallet_addEthereumChain params, in order
    switched: [], // chainIds (hex) requested via wallet_switchEthereumChain
    signCalls: 0,
    signed: [], // { domain, primaryType, message, signature }
    rejectNextSign: false,
    usdcBalance,
    requests: [], // every method name, in order
  }

  async function request({ method, params }) {
    state.requests.push(method)
    switch (method) {
      case 'eth_requestAccounts':
      case 'eth_accounts':
        return [account.address]
      case 'eth_chainId':
        return `0x${state.chainId.toString(16)}`
      case 'net_version':
        return String(state.chainId)
      case 'wallet_switchEthereumChain': {
        const hex = params?.[0]?.chainId
        if (typeof hex !== 'string' || !HEX_CHAIN_ID.test(hex)) throw rpcError(-32602, `invalid chainId ${hex}`)
        state.switched.push(hex)
        const id = parseInt(hex, 16)
        if (!state.known.has(id)) throw rpcError(4902, `Unrecognized chain ID "${hex}". Try adding the chain using wallet_addEthereumChain first.`)
        state.chainId = id
        return null
      }
      case 'wallet_addEthereumChain': {
        const p = params?.[0]
        if (!p || !HEX_CHAIN_ID.test(String(p.chainId))) throw rpcError(-32602, 'invalid chainId')
        if (!p.chainName || !Array.isArray(p.rpcUrls) || p.rpcUrls.length === 0 || !String(p.rpcUrls[0]).startsWith('https://')) {
          throw rpcError(-32602, 'invalid chain params (chainName / rpcUrls)')
        }
        if (!p.nativeCurrency?.symbol || p.nativeCurrency.decimals !== 18) throw rpcError(-32602, 'invalid nativeCurrency')
        state.added.push(p)
        const id = parseInt(p.chainId, 16)
        state.known.add(id)
        state.chainId = id // MetaMask switches to the chain it just added
        return null
      }
      case 'eth_signTypedData_v4': {
        const [from, json] = params ?? []
        if (String(from).toLowerCase() !== account.address.toLowerCase()) throw rpcError(-32602, 'address mismatch')
        const typed = typeof json === 'string' ? JSON.parse(json) : json
        if (signDelayMs) await new Promise((r) => setTimeout(r, signDelayMs))
        if (state.rejectNextSign) {
          state.rejectNextSign = false
          throw rpcError(4001, 'User rejected the request.')
        }
        if (Number(typed.domain?.chainId) !== state.chainId) {
          throw rpcError(-32602, `Provided chainId "${typed.domain?.chainId}" must match the active chainId "${state.chainId}"`)
        }
        const { EIP712Domain: _drop, ...types } = typed.types
        // JSON carries uint/int fields as strings; viem wants bigint for them.
        const fields = types[typed.primaryType] ?? []
        const message = { ...typed.message }
        for (const f of fields) {
          if (/^u?int\d*$/.test(f.type) && message[f.name] !== undefined) message[f.name] = BigInt(message[f.name])
        }
        const domain = { ...typed.domain }
        if (domain.chainId !== undefined) domain.chainId = BigInt(domain.chainId)
        const signature = await account.signTypedData({ domain, types, primaryType: typed.primaryType, message })
        state.signCalls += 1
        state.signed.push({ domain: typed.domain, primaryType: typed.primaryType, message: typed.message, signature })
        return signature
      }
      case 'eth_call': {
        const data = String(params?.[0]?.data ?? '')
        if (data.startsWith('0x70a08231')) return `0x${state.usdcBalance.toString(16).padStart(64, '0')}`
        throw rpcError(-32601, 'mock wallet: unsupported eth_call')
      }
      default:
        throw rpcError(-32601, `mock wallet: ${method} not supported`)
    }
  }

  return { account, address: account.address, state, request }
}
