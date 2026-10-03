/**
 * A "traditional" x402 buyer, spelled out step by step: a raw private key, the official
 * @x402/fetch client (same 2.27.x as @x402/core), no budget, no approval. Used by
 * scripts/taste-x402.mjs (the experience kit) and scripts/e2e-ai-purchase.mjs.
 *
 * HARD SAFETY GUARD: this module only ever signs for TESTNETS (Monad testnet eip155:10143, Base
 * Sepolia eip155:84532). The x402 client is registered for those two networks only, the 402's
 * `accepts` are filtered to them BEFORE anything is signed, and a 402 that offers nothing else is
 * refused (GuardError) — a mainnet bill can never reach the signer. It also refuses to sign more
 * than MAX_SIGN_ATOMIC (1 USDC). Nothing here ever prints a private key.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { x402Client, x402HTTPClient } from '@x402/fetch'
import { ExactEvmScheme } from '@x402/evm/exact/client'
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'

export const MONAD_TESTNET = 'eip155:10143'
export const BASE_SEPOLIA = 'eip155:84532'
/** The only networks this module will sign for; order = preference. */
export const ALLOWED_NETWORKS = [MONAD_TESTNET, BASE_SEPOLIA]
/** Never sign more than 1 USDC (6 decimals), whatever the 402 says. */
export const MAX_SIGN_ATOMIC = 1_000_000n

export const NETWORKS = {
  [MONAD_TESTNET]: {
    name: 'Monad 测试网',
    usdc: '0x534b2f3A21130d7a60830c2Df862319e593943A3',
    rpc: 'https://testnet-rpc.monad.xyz',
    chainId: 10143,
    explorerTx: (hash) => `https://testnet.monadvision.com/tx/${hash}`,
  },
  [BASE_SEPOLIA]: {
    name: 'Base Sepolia 测试网',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    rpc: 'https://sepolia.base.org',
    chainId: 84532,
    explorerTx: (hash) => `https://sepolia.basescan.org/tx/${hash}`,
  },
}

export class GuardError extends Error {
  constructor(message) {
    super(message)
    this.name = 'GuardError'
  }
}

export function networkLabel(caip2) {
  return NETWORKS[caip2] ? `${NETWORKS[caip2].name}（${caip2}）` : caip2
}

/** 100000n | "100000" -> "0.10" (USDC has 6 decimals; at least 2 decimals, trailing zeros trimmed to 2). */
export function formatUsdc(atomic) {
  const s = BigInt(atomic).toString().padStart(7, '0')
  const whole = s.slice(0, -6)
  let frac = s.slice(-6).replace(/0+$/, '')
  if (frac.length < 2) frac = frac.padEnd(2, '0')
  return `${whole}.${frac}`
}

/** Split a 402's accepts into the ones we may sign for (testnets, in preference order) and the rest. */
export function splitAccepts(accepts) {
  const list = Array.isArray(accepts) ? accepts : []
  const allowed = ALLOWED_NETWORKS.map((n) => list.find((a) => a?.network === n)).filter(Boolean)
  const refused = list.filter((a) => !ALLOWED_NETWORKS.includes(a?.network))
  return { allowed, refused }
}

/** The accept to pay with, or a GuardError when the bill offers only networks we refuse to sign for. */
export function chooseAccept(required) {
  const { allowed, refused } = splitAccepts(required?.accepts)
  if (allowed.length === 0) {
    const offered = refused.map((a) => a?.network).filter(Boolean).join(', ') || '(空)'
    throw new GuardError(`这张账单只提供 ${offered}，不在测试网白名单（${ALLOWED_NETWORKS.join(' / ')}）里，拒绝签名。`)
  }
  const accept = allowed[0]
  const amount = BigInt(String(accept.amount ?? accept.maxAmountRequired ?? '0'))
  if (amount <= 0n || amount > MAX_SIGN_ATOMIC) {
    throw new GuardError(`账单金额 ${formatUsdc(amount < 0n ? 0n : amount)} USDC 超出体验脚本的上限（${formatUsdc(MAX_SIGN_ATOMIC)} USDC），拒绝签名。`)
  }
  return accept
}

/** Plain-language lines for a decoded 402 bill. */
export function describeBill(required, accept, requestLine) {
  const amount = String(accept.amount ?? accept.maxAmountRequired ?? '')
  const { allowed, refused } = splitAccepts(required?.accepts)
  const lines = [
    `金额      ${formatUsdc(amount)} USDC（链上最小单位 ${amount}，USDC 有 6 位小数）`,
    `代币      USDC，合约 ${accept.asset}`,
    `网络      ${networkLabel(accept.network)}`,
    `收款地址  ${accept.payTo}（payTo）`,
    `有效期    签名后 ${accept.maxTimeoutSeconds ?? '?'} 秒内有效`,
    `付款方案  ${accept.scheme}（精确金额，EIP-3009 授权）`,
  ]
  if (requestLine) lines.push(`对应请求  ${requestLine}`)
  const offered = (required?.accepts || []).map((a) => a?.network).filter(Boolean)
  lines.push(`服务器一共报了 ${offered.length} 个网络：${offered.join('、') || '(无)'}；可签名的：${allowed.map((a) => a.network).join('、') || '(无)'}${refused.length ? `；拒签的：${refused.map((a) => a.network).join('、')}` : ''}`)
  return lines
}

/** Plain-language lines for the EIP-3009 authorization inside a payment payload (the signature itself is shortened). */
export function describeAuthorization(payload) {
  const inner = payload?.payload || {}
  const a = inner.authorization || {}
  const sig = typeof inner.signature === 'string' ? `${inner.signature.slice(0, 12)}…${inner.signature.slice(-6)}` : '(无)'
  return [
    `from         ${a.from}（你的钱包地址）`,
    `to           ${a.to}（收款地址）`,
    `value        ${a.value}（= ${a.value != null ? formatUsdc(a.value) : '?'} USDC）`,
    `validAfter   ${a.validAfter}（Unix 时间，此刻之后才生效）`,
    `validBefore  ${a.validBefore}（Unix 时间，过了这个时间作废）`,
    `nonce        ${a.nonce}（一次性随机数，同一张授权只能用一次）`,
    `signature    ${sig}（你的私钥对以上内容的 EIP-712 签名）`,
  ]
}

// ---------------------------------------------------------------- the throwaway wallet

export function defaultWalletDir() {
  return path.join(os.homedir(), '.agentverse-taste')
}

/**
 * Load, or create, the throwaway wallet. The private key stays in this file (outside the repo)
 * and is NEVER returned in anything meant for printing: use `publicView(wallet)`.
 */
export function loadOrCreateWallet(dir = defaultWalletDir()) {
  const file = path.join(dir, 'wallet.json')
  fs.mkdirSync(dir, { recursive: true })
  let data = null
  if (fs.existsSync(file)) {
    try {
      data = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      throw new Error(`${file} 不是合法的 JSON；请检查或删除它（删除 = 换一个新钱包）`)
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(data?.privateKey || '')) throw new Error(`${file} 里没有合法的私钥字段`)
    const address = privateKeyToAccount(data.privateKey).address
    if (data.address !== address) data.address = address
    return { file, created: false, data }
  }
  const privateKey = generatePrivateKey()
  data = { version: 1, note: 'throwaway wallet for scripts/taste-x402.mjs — testnet only, never put real funds here', address: privateKeyToAccount(privateKey).address, privateKey, createdAt: new Date().toISOString(), cells: {} }
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { mode: 0o600 })
  return { file, created: true, data }
}

/** What may be printed about a wallet: path and address only. */
export function publicView(wallet) {
  return { file: wallet.file, address: wallet.data.address, created: wallet.created }
}

/** Remember a cell's gk_ key next to the wallet (same file, same folder). */
export function saveCellKey(wallet, cell, record) {
  wallet.data.cells = wallet.data.cells || {}
  wallet.data.cells[`${cell.x},${cell.y}`] = { ...record, savedAt: new Date().toISOString() }
  fs.writeFileSync(wallet.file, JSON.stringify(wallet.data, null, 2), { mode: 0o600 })
}

/** gk_a1b2c3… -> "gk_a1b2…c3d4": enough to recognise, not enough to use. */
export function maskKey(key) {
  const k = String(key || '')
  return k.length > 12 ? `${k.slice(0, 7)}…${k.slice(-4)}` : '(空)'
}

// ---------------------------------------------------------------- the raw protocol, one step at a time

export function makeBuyer(privateKey) {
  const account = privateKeyToAccount(privateKey)
  const client = new x402Client()
  for (const n of ALLOWED_NETWORKS) client.register(n, new ExactEvmScheme(account))
  // The SDK only signs default assets unless told otherwise; testnet USDC is not a default asset, so list exactly
  // the two testnet USDC contracts (and cap each payment at MAX_SIGN_ATOMIC) — a second lock behind chooseAccept().
  client.setSpendControls({
    allowedAssets: ALLOWED_NETWORKS.map((n) => ({ network: n, asset: NETWORKS[n].usdc, maxAmountPerPayment: MAX_SIGN_ATOMIC.toString() })),
  })
  return { account, http: new x402HTTPClient(client) }
}

async function readJson(res) {
  try {
    const t = await res.text()
    return t ? JSON.parse(t) : null
  } catch {
    return null
  }
}

/** Step: the plain request, no payment. Returns the status, body and (for a 402) the decoded bill. */
export async function requestBill(buyer, url, bodyObj, fetchImpl = fetch) {
  const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bodyObj) })
  const json = await readJson(res)
  let required = null
  if (res.status === 402) required = buyer.http.getPaymentRequiredResponse((n) => res.headers.get(n), json)
  return { status: res.status, json, required, header: res.headers.get('PAYMENT-REQUIRED') }
}

/** Step: sign. Only the chosen (testnet) accept is handed to the signer. */
export async function signBill(buyer, required, accept) {
  if (!ALLOWED_NETWORKS.includes(accept?.network)) throw new GuardError(`拒绝为 ${accept?.network} 签名`)
  const payload = await buyer.http.createPaymentPayload({ ...required, accepts: [accept] })
  const signedNet = payload?.accepted?.network ?? payload?.network
  if (!ALLOWED_NETWORKS.includes(signedNet)) throw new GuardError(`签出来的授权网络是 ${signedNet}，不在白名单，已丢弃`)
  return { payload, headers: buyer.http.encodePaymentSignatureHeader(payload) }
}

/** Step: retry the same request with the PAYMENT-SIGNATURE header. */
export async function payWithSignature(buyer, url, bodyObj, headers, fetchImpl = fetch) {
  const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(bodyObj) })
  const json = await readJson(res)
  let settle = null
  try {
    settle = buyer.http.getPaymentSettleResponse((n) => res.headers.get(n))
  } catch {
    settle = null
  }
  return { status: res.status, json, settle, paymentResponseHeader: res.headers.get('PAYMENT-RESPONSE') }
}

/** All the steps in one go (no narration): bill -> guard -> sign -> pay. */
export async function buyOnce(buyer, url, bodyObj, fetchImpl = fetch) {
  const bill = await requestBill(buyer, url, bodyObj, fetchImpl)
  if (bill.status !== 402) return { stage: 'bill', ...bill }
  const accept = chooseAccept(bill.required)
  const { payload, headers } = await signBill(buyer, bill.required, accept)
  const paid = await payWithSignature(buyer, url, bodyObj, headers, fetchImpl)
  return { stage: 'paid', bill, accept, payload, ...paid }
}
