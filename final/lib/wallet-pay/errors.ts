/**
 * Everything the wallet-payment flow can go wrong with, turned into a
 * Chinese sentence a non-technical buyer can act on. The `code` is for the UI
 * (e.g. insufficient_usdc keeps the modal open on the same screen) and tests.
 */

export type PayErrorCode =
  | 'no_wallet'
  | 'user_rejected'
  | 'insufficient_usdc'
  | 'cell_taken'
  | 'reserved'
  | 'network_not_offered'
  | 'price_mismatch'
  | 'chain_switch_failed'
  | 'payment_rejected'
  | 'settlement_failed'
  | 'settlement_anomaly'
  | 'facilitator_down'
  | 'service_unavailable'
  | 'bad_request'
  | 'network_error'
  | 'unknown'

export class PayError extends Error {
  readonly code: PayErrorCode
  readonly txHash?: string
  constructor(code: PayErrorCode, message: string, extra: { txHash?: string } = {}) {
    super(message)
    this.name = 'PayError'
    this.code = code
    this.txHash = extra.txHash
  }
}

export const NO_GAS_NOTE = '只需要 USDC，不需要 gas——gas 由 facilitator 代付。'

function errorChain(err: unknown): any[] {
  const out: any[] = []
  let cur: any = err
  for (let i = 0; i < 6 && cur; i++) {
    out.push(cur)
    cur = cur.cause ?? cur.error
  }
  return out
}

/** The wallet popup was dismissed / "Reject" was pressed (EIP-1193 code 4001, viem UserRejectedRequestError, ethers ACTION_REJECTED, or wallet-specific wording). */
export function isUserRejection(err: unknown): boolean {
  return errorChain(err).some((e) => {
    if (e?.code === 4001 || e?.code === 'ACTION_REJECTED') return true
    if (e?.name === 'UserRejectedRequestError') return true
    const msg = String(e?.shortMessage ?? e?.message ?? '')
    return /user (rejected|denied|cancel)|rejected the request|request rejected|denied (message|transaction) signature|user closed/i.test(msg)
  })
}

function bodyMessage(body: any): string {
  if (!body || typeof body !== 'object') return ''
  return String(body.message ?? body.errorMessage ?? body.error ?? '')
}

/** Turn a non-OK answer from /api/cells/purchase or /bulk-purchase into a PayError. */
export function describeHttpFailure(status: number, body: any, ctx: { txHash?: string | null; paymentRequiredError?: string | null } = {}): PayError {
  const code = typeof body?.error === 'string' ? body.error : ''
  const serverMsg = bodyMessage(body)
  const withMsg = (base: string) => (serverMsg && serverMsg !== code ? `${base}（${serverMsg}）` : base)

  if (status === 409) {
    if (code === 'settlement_anomaly') {
      const tx = body?.tx || ctx.txHash || undefined
      return new PayError(
        'settlement_anomaly',
        `付款已经上链，但这个格子同时被别人先拿到了。请保存交易哈希并联系我们${tx ? `：${tx}` : ''}`,
        { txHash: tx }
      )
    }
    return new PayError('cell_taken', withMsg('这个格子刚刚被别人买走了，你没有被扣款，请换一个格子'))
  }
  if (status === 403) {
    return new PayError('reserved', withMsg('这里是展示区/保留区，不能购买，请换一个格子'))
  }
  if (status === 402) {
    if (code === 'settlement_failed') {
      return new PayError('settlement_failed', withMsg('链上结算失败，请稍后重试'))
    }
    const why = ctx.paymentRequiredError || serverMsg
    return new PayError('payment_rejected', `付款没有被接受${why ? `（${why}）` : ''}。通常是 USDC 余额不足或网络不对，你没有被扣款`)
  }
  if (status === 502 || code === 'FACILITATOR_ERROR') {
    return new PayError('facilitator_down', withMsg('支付通道（facilitator）暂时不可用，请稍后再试，你没有被扣款'))
  }
  if (status === 503) {
    return new PayError('service_unavailable', withMsg('服务暂时不可用，请稍后再试'))
  }
  if (status === 400) {
    return new PayError('bad_request', withMsg('请求有误'))
  }
  return new PayError('unknown', `购买失败（HTTP ${status}）${serverMsg ? `：${serverMsg}` : ''}`)
}

/** Normalise anything thrown inside the flow into a PayError. */
export function toPayError(err: unknown): PayError {
  if (err instanceof PayError) return err
  if (isUserRejection(err)) {
    return new PayError('user_rejected', '你在钱包里拒绝了请求，没有扣款')
  }
  const e = err as any
  if (e?.name === 'NetworkNotOfferedError') {
    return new PayError('network_not_offered', '服务器没有提供你选的这条链的付款方式，请换另一条链再试')
  }
  const msg = String(e?.message ?? err ?? '')
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed|fetch failed/i.test(msg)) {
    return new PayError('network_error', '网络请求失败，请检查网络后重试')
  }
  if (/rejected by spendControls|No network\/scheme registered/i.test(msg)) {
    return new PayError('price_mismatch', '服务器给出的付款条件和页面不一致，已拒绝签名，请刷新页面重试')
  }
  return new PayError('unknown', `付款失败：${msg || '未知错误'}`)
}
