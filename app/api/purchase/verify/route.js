/**
 * @deprecated 推荐改用 Coinbase x402 + Facilitator 验款，不再自建链上校验。见 docs/COINBASE_GRID_PAYMENT.md
 */
import { NextResponse } from 'next/server'
import { createPublicClient, http, decodeEventLog, formatUnits } from 'viem'
import { base } from 'viem/chains'
import { dbQuery } from '../../../../lib/db.js'

const USDC = (process.env.USDC_ADDRESS || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913')
const TREASURY = (process.env.TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000')
const RPC = process.env.RPC_URL || undefined
const client = createPublicClient({ chain: base, transport: http(RPC) })
const TransferAbi = ['event Transfer(address indexed from, address indexed to, uint256 value)']

export async function GET(req) {
  try {
    const url = new URL(req.url)
    const receiptId = url.searchParams.get('receipt_id')
    let amount = Number(url.searchParams.get('amount_usdc') || '0.02')
    let to = String(url.searchParams.get('to') || TREASURY)
    const lookback = Number(url.searchParams.get('lookback') || '50000')
    const tx = url.searchParams.get('tx')
    let orderRow
    if (process.env.DATABASE_URL && receiptId) {
      const res = await dbQuery('select * from grid_orders where receipt_id = $1 limit 1', [receiptId])
      if (!res.rowCount) {
        return NextResponse.json({ ok:false, error:'order_not_found' }, { status:404 })
      }
      orderRow = res.rows[0]
      to = orderRow.treasury_address || to
      amount = Number(orderRow.unique_amount || amount)
    }
    const latest = await client.getBlockNumber()
    const fromBlock = latest > BigInt(lookback) ? latest - BigInt(lookback) : BigInt(0)
    let transfers = []
    let paid = false
    const targetAmountStr = amount.toFixed(6)
    if (tx) {
      const receipt = await client.getTransactionReceipt({ hash: tx })
      const logs = receipt.logs.filter(l => l.address.toLowerCase() === USDC.toLowerCase())
      for (const l of logs) {
        try {
          const decoded = decodeEventLog({ abi: TransferAbi, data: l.data, topics: l.topics })
          const val = formatUnits(decoded.args.value, 6)
          transfers.push({ txHash: receipt.transactionHash, from: decoded.args.from, to: decoded.args.to, value: val, blockNumber: String(receipt.blockNumber || '') })
        } catch {}
      }
      paid = transfers.some(
        t =>
          t.to.toLowerCase() === to.toLowerCase() &&
          Number(t.value).toFixed(6) === targetAmountStr
      )
    } else {
      const logs = await client.getLogs({ address: USDC, event: { abi: TransferAbi, name: 'Transfer' }, fromBlock, toBlock: latest, args: { to } })
      transfers = logs.map(l => ({
        txHash: l.transactionHash,
        from: l.args.from,
        to: l.args.to,
        value: formatUnits(l.args.value, 6),
        blockNumber: String(l.blockNumber || '')
      }))
      paid = transfers.some(t => Number(t.value).toFixed(6) === targetAmountStr)
    }
    if (paid && process.env.DATABASE_URL && orderRow) {
      const matched = transfers.find(
        t =>
          t.to.toLowerCase() === to.toLowerCase() &&
          Number(t.value).toFixed(6) === targetAmountStr
      )
      const txHash = matched ? matched.txHash : null

      // 标记订单已支付，并保存金库地址与交易哈希
      await dbQuery(
        'update grid_orders set status = $1, tx_hash = coalesce(tx_hash,$2), treasury_address = coalesce(treasury_address,$3) where receipt_id = $4',
        ['paid', txHash, to, orderRow.receipt_id]
      )

      // 同步更新格子所有权（卖地）
      if (matched) {
        const owner = matched.from
        const x = Number(orderRow.x)
        const y = Number(orderRow.y)
        if (Number.isFinite(x) && Number.isFinite(y)) {
          const cellId = y * 100 + x
          const nowIso = new Date().toISOString()
          await dbQuery(
            `insert into grid_cells (id, x, y, owner_address, status, is_for_sale, last_updated)
             values ($1,$2,$3,$4,$5,$6,$7)
             on conflict (x, y) do update
             set owner_address = EXCLUDED.owner_address,
                 status = EXCLUDED.status,
                 is_for_sale = EXCLUDED.is_for_sale,
                 last_updated = EXCLUDED.last_updated`,
            [cellId, x, y, owner, 'HOLDING', false, nowIso]
          )
        }
      }
    }
    return NextResponse.json({ ok:true, paid, to, amount_usdc: amount, token: USDC, transfers })
  } catch {
    return NextResponse.json({ ok:false, error:'server_error' }, { status:500 })
  }
}
