import { NextResponse } from 'next/server'
import { dbQuery } from '../../../../lib/db.js'
import { generateApiKey } from '../../../../lib/api-key.js'
import { logEvent } from '../../../../lib/events.js'
import { getBlockLabel, getBlockPrice } from '../../../../lib/pricing.js'
import { ensureRefCode, trackReferral } from '../../../../lib/referral.js'
import { OWNER_COMMERCE } from '../../../../lib/constants'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  try {
    if (!process.env.COMMERCE_API_KEY) {
      return NextResponse.json({ ok: false, error: 'env_missing' }, { status: 500 })
    }
    const url = new URL(req.url)
    const receiptId = url.searchParams.get('receipt_id')
    const chargeIdFromQuery = url.searchParams.get('charge_id')
    let chargeId = chargeIdFromQuery
    let orderRow
    if (process.env.DATABASE_URL && receiptId) {
      const r = await dbQuery('SELECT * FROM grid_orders WHERE receipt_id = $1 LIMIT 1', [receiptId])
      if (r.rowCount) {
        orderRow = r.rows[0]
        chargeId = orderRow.commerce_charge_id || chargeId
      }
    } else if (process.env.DATABASE_URL && chargeIdFromQuery) {
      const r = await dbQuery('SELECT * FROM grid_orders WHERE commerce_charge_id = $1 LIMIT 1', [chargeIdFromQuery])
      if (r.rowCount) orderRow = r.rows[0]
    }
    if (!chargeId) return NextResponse.json({ ok: false, error: 'missing_charge_id' }, { status: 400 })

    const res = await fetch(`https://api.commerce.coinbase.com/charges/${chargeId}`, {
      headers: { 'Content-Type': 'application/json', 'X-CC-Api-Key': process.env.COMMERCE_API_KEY },
    })
    if (!res.ok) return NextResponse.json({ ok: false, error: 'commerce_error', detail: await res.text() }, { status: 502 })
    const data = await res.json()
    const charge = data?.data
    const status = charge?.timeline?.[charge.timeline.length - 1]?.status || charge?.status
    const hasTimelineCompleted = status && ['COMPLETED', 'CONFIRMED', 'RESOLVED'].includes(String(status).toUpperCase())
    const hasPaymentDetected = Array.isArray(charge?.payments) && charge.payments.some(p => p?.transaction_id)
    const completed = hasTimelineCompleted || hasPaymentDetected

    let cellX = orderRow ? Number(orderRow.x) : Number(charge?.metadata?.x)
    let cellY = orderRow ? Number(orderRow.y) : Number(charge?.metadata?.y)
    if (!Number.isFinite(cellX) || !Number.isFinite(cellY)) cellX = cellY = null

    const blockW = Number(charge?.metadata?.block_w) || 1
    const blockH = Number(charge?.metadata?.block_h) || 1

    let apiKey = null
    let refCodeOut = null

    if (completed && process.env.DATABASE_URL) {
      const firstPayment = charge?.payments?.[0]
      const owner = firstPayment?.payer_addresses?.[0] || firstPayment?.value?.address || OWNER_COMMERCE

      // Resale: metadata.resale true → transfer ownership, new API key
      if (charge?.metadata?.resale) {
        const rx = Number(charge.metadata.x)
        const ry = Number(charge.metadata.y)
        if (Number.isFinite(rx) && Number.isFinite(ry)) {
          await dbQuery(
            'UPDATE grid_cells SET owner_address = $1, is_for_sale = false, price_usdc = NULL, last_updated = NOW() WHERE x = $2 AND y = $3',
            [owner, rx, ry]
          )
          await dbQuery('DELETE FROM cell_api_keys WHERE x = $1 AND y = $2', [rx, ry])
          try {
            apiKey = await generateApiKey(rx, ry)
          } catch (e) {
            console.error('[commerce/verify] resale api key failed:', e?.message)
          }
          await logEvent('resale', { x: rx, y: ry, owner, message: `Resold to ${owner}` })
          refCodeOut = await ensureRefCode(rx, ry)
        }
        return NextResponse.json({ ok: true, paid: true, status, charge, api_key: apiKey, ref_code: refCodeOut })
      }

      // Multi-cell order: cells_json or metadata.cells
      let cellsList = []
      if (orderRow?.cells_json) {
        try {
          cellsList = typeof orderRow.cells_json === 'string' ? JSON.parse(orderRow.cells_json) : orderRow.cells_json
        } catch {}
      }
      if (cellsList.length === 0 && charge?.metadata?.cells) {
        try {
          cellsList = typeof charge.metadata.cells === 'string' ? JSON.parse(charge.metadata.cells) : charge.metadata.cells
        } catch {}
      }

      if (cellsList.length > 0) {
        // New flow: each cell is 1×1
        if (cellX == null) cellX = cellsList[0].x
        if (cellY == null) cellY = cellsList[0].y

        if (orderRow) {
          await dbQuery('UPDATE grid_orders SET status = $1 WHERE receipt_id = $2', ['paid', orderRow.receipt_id])
        }

        for (const cell of cellsList) {
          const cx = Number(cell.x)
          const cy = Number(cell.y)
          const cid = cy * 1000 + cx
          await dbQuery(
            `INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, block_w, block_h, block_origin_x, block_origin_y, last_updated)
             VALUES ($1,$2,$3,$4,'HOLDING',false,1,1,$2,$3,NOW())
             ON CONFLICT (x,y) DO UPDATE SET owner_address = EXCLUDED.owner_address, status = EXCLUDED.status, is_for_sale = false,
               block_w = 1, block_h = 1, block_origin_x = $2, block_origin_y = $3, last_updated = NOW()`,
            [cid, cx, cy, owner]
          )
        }

        try {
          apiKey = await generateApiKey(cellsList[0].x, cellsList[0].y)
        } catch (e) {
          console.error('[commerce/verify] api key generation failed:', e?.message)
        }
        for (let i = 1; i < cellsList.length; i++) {
          try {
            await generateApiKey(cellsList[i].x, cellsList[i].y)
          } catch {}
        }

        const totalPrice = cellsList.length * (Number(orderRow?.amount_usdc) || 0) || cellsList.length
        await logEvent('purchase', {
          x: cellX, y: cellY,
          blockSize: `${cellsList.length} cells`,
          owner,
          message: `${cellsList.length} cells purchased`
        })

        const buyerRefCode = await ensureRefCode(cellX, cellY)
        const referrerCode = charge?.metadata?.ref || orderRow?.ref_code
        if (referrerCode) {
          await trackReferral(referrerCode, {
            receiptId: orderRow?.receipt_id || `c_${chargeId}`,
            buyerX: cellX, buyerY: cellY,
            purchaseAmount: totalPrice,
          })
        }
        refCodeOut = buyerRefCode
      } else {
        // Legacy block flow
        if (cellX == null || cellY == null) {
          return NextResponse.json({ ok: true, paid: completed, status, charge, api_key: null, ref_code: null })
        }

        if (orderRow) {
          await dbQuery('UPDATE grid_orders SET status = $1 WHERE receipt_id = $2', ['paid', orderRow.receipt_id])
        } else if (chargeId) {
          const rid = charge?.metadata?.receipt_id || `c_${chargeId}_repaired`
          await dbQuery(
            `INSERT INTO grid_orders (receipt_id, x, y, amount_usdc, unique_amount, pay_method, status, commerce_charge_id)
             VALUES ($1,$2,$3,$4,$4,'commerce','paid',$5)
             ON CONFLICT (receipt_id) DO UPDATE SET status = 'paid', commerce_charge_id = EXCLUDED.commerce_charge_id`,
            [rid, cellX, cellY, 0, chargeId]
          )
        }

        const blockId = `blk_${cellX}_${cellY}_${blockW}x${blockH}`
        for (let dy = 0; dy < blockH; dy++) {
          for (let dx = 0; dx < blockW; dx++) {
            const cx = cellX + dx
            const cy = cellY + dy
            const cellId = cy * 1000 + cx
            await dbQuery(
              `INSERT INTO grid_cells (id, x, y, owner_address, status, is_for_sale, block_id, block_w, block_h, block_origin_x, block_origin_y, last_updated)
               VALUES ($1,$2,$3,$4,'HOLDING',false,$5,$6,$7,$8,$9,NOW())
               ON CONFLICT (x,y) DO UPDATE SET owner_address = EXCLUDED.owner_address, status = EXCLUDED.status, is_for_sale = false,
                 block_id = EXCLUDED.block_id, block_w = EXCLUDED.block_w, block_h = EXCLUDED.block_h,
                 block_origin_x = EXCLUDED.block_origin_x, block_origin_y = EXCLUDED.block_origin_y, last_updated = NOW()`,
              [cellId, cx, cy, owner, blockId, blockW, blockH, cellX, cellY]
            )
          }
        }

        try {
          apiKey = await generateApiKey(cellX, cellY)
        } catch (e) {
          console.error('[commerce/verify] api key generation failed:', e?.message)
        }

        const label = getBlockLabel(blockW, blockH)
        const price = getBlockPrice(blockW, blockH) || 0
        await logEvent('purchase', {
          x: cellX, y: cellY,
          blockSize: label,
          owner,
          message: `${label} block purchased at (${cellX},${cellY})`
        })

        const buyerRefCode = await ensureRefCode(cellX, cellY)
        const referrerCode = charge?.metadata?.ref || orderRow?.ref_code
        if (referrerCode) {
          await trackReferral(referrerCode, {
            receiptId: orderRow?.receipt_id || `c_${chargeId}`,
            buyerX: cellX, buyerY: cellY,
            purchaseAmount: price,
          })
        }
        refCodeOut = buyerRefCode
      }
    }
    return NextResponse.json({ ok: true, paid: completed, status, charge, api_key: apiKey, ref_code: refCodeOut })
  } catch (e) {
    console.error('[commerce/verify]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
