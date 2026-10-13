import type { PaymentPayload, PaymentRequirements } from '@x402/core/types'
import { decodeTransactionFromPayload, TOKEN_PROGRAM_ADDRESS } from '@x402/svm'
import { getCompiledTransactionMessageDecoder } from '@solana/kit'
import { SOLANA_USDC_ADDRESS } from './networks'
export { SOLANA_NETWORK, SOLANA_USDC_ADDRESS, SOLANA_PAY_TO } from './networks'

/** Call only after facilitator verification. Reject layouts whose buyer is ambiguous.
 * The fee sponsor and the USDC transfer authority are different identities.
 * Standard wallets with one direct TransferChecked are supported; smart-wallet
 * CPI / lookup-table payments fail before settlement until ownership is supported.
 */
export function solanaTokenPayer(payload: PaymentPayload, requirements: PaymentRequirements): string | null {
  try {
    const raw = payload.payload as { transaction?: string }
    if (typeof raw?.transaction !== 'string') return null
    const tx = decodeTransactionFromPayload({ transaction: raw.transaction })
    const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes)
    if ('addressTableLookups' in message && message.addressTableLookups?.length) return null
    const accounts = message.staticAccounts
    const transfers = message.instructions.filter((ix) =>
      accounts[ix.programAddressIndex] === TOKEN_PROGRAM_ADDRESS && ix.data?.[0] === 12)
    if (transfers.length !== 1) return null
    const ix = transfers[0]
    const indices = ix.accountIndices
    if (!indices || indices.length !== 4 || !ix.data || ix.data.length !== 10 || ix.data[9] !== 6) return null
    if (accounts[indices[1]] !== requirements.asset || requirements.asset !== SOLANA_USDC_ADDRESS) return null
    const amount = new DataView(ix.data.buffer, ix.data.byteOffset, ix.data.byteLength).getBigUint64(1, true)
    if (amount < BigInt(requirements.amount)) return null
    const authorityIndex = indices[3]
    if (authorityIndex >= message.header.numSignerAccounts || authorityIndex === 0) return null
    const authority = accounts[authorityIndex]
    if (!tx.signatures[authority]) return null
    return authority
  } catch {
    return null
  }
}

export function sameWalletAddress(a: string, b: string): boolean {
  const evm = /^0x[0-9a-fA-F]{40}$/
  return evm.test(a) && evm.test(b) ? a.toLowerCase() === b.toLowerCase() : a === b
}
