#!/usr/bin/env node
/**
 * 测试 Coinbase 收款流程（不依赖 Next 端口）
 * 用法: node scripts/test-coinbase-payment.js
 */
import 'dotenv/config'

async function main() {
  console.log('=== 环境检查 ===')
  const required = ['CDP_API_KEY_ID', 'CDP_API_KEY_SECRET', 'TREASURY_ADDRESS', 'DATABASE_URL']
  const missing = required.filter(k => !process.env[k])
  if (missing.length) {
    console.error('缺少:', missing.join(', '))
    process.exit(1)
  }
  console.log('CDP_KEY_ID:', process.env.CDP_API_KEY_ID?.slice(0, 8) + '...')
  console.log('TREASURY:', process.env.TREASURY_ADDRESS)
  console.log('')

  console.log('=== 1. CDP JWT 生成 ===')
  let token
  try {
    const { getCdpBearerToken } = await import('../lib/cdp-auth.js')
    token = await getCdpBearerToken()
    console.log('JWT 长度:', token?.length || 0)
  } catch (e) {
    console.error('JWT 失败:', e.message)
    process.exit(1)
  }

  console.log('\n=== 2. 创建 Payment Link (business.coinbase.com) ===')
  const baseUrl = process.env.NEXT_PUBLIC_BASE_API || 'https://agent-verse-live-new.vercel.app'
  const body = {
    amount: '2',
    currency: 'USDC',
    network: 'base',
    description: 'Grid cell (28,18)',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    successRedirectUrl: baseUrl + '/grid-v3?paid=1',
    failRedirectUrl: baseUrl + '/grid-v3?paid=0',
    metadata: { x: '28', y: '18' },
  }
  const res = await fetch('https://business.coinbase.com/api/v1/payment-links', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log('状态:', res.status, res.statusText)
  if (res.ok) {
    const data = JSON.parse(text)
    console.log('paymentLinkId:', data.id || data.paymentLinkId)
    console.log('url:', data.url ? data.url.slice(0, 60) + '...' : '(无)')
  } else {
    console.log('响应:', text.slice(0, 300))
  }

  console.log('\n=== 3. 数据库 coinbase_payment_links ===')
  try {
    const { dbQuery } = await import('../lib/db.js')
    const r = await dbQuery('SELECT COUNT(*) as c FROM coinbase_payment_links')
    console.log('表行数:', r.rows[0]?.c ?? 0)
  } catch (e) {
    console.log('DB:', e.message)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
