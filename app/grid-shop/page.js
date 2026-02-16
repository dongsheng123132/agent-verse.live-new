'use client'
import { useState } from 'react'
import Link from 'next/link'

const TREASURY = '0x5C5869bceB4C4eb3fA1DCDEeBd84e9890DbC01aF'

const grids = [
  { id: 'A', x: 24, y: 24, price: 0.02 },
  { id: 'B', x: 25, y: 24, price: 0.03 },
  { id: 'C', x: 26, y: 24, price: 0.05 }
]

export default function GridShopPage() {
  const [selected, setSelected] = useState(grids[0])
  const [onchainInfo, setOnchainInfo] = useState(null)
  const [loadingOnchain, setLoadingOnchain] = useState(false)
  const [commerceUrl, setCommerceUrl] = useState('')
  const [loadingCommerce, setLoadingCommerce] = useState(false)

  const awalCommand = `npx awal send ${onchainInfo?.amount_usdc ?? selected.price} ${TREASURY}`

  async function createOnchainOrder() {
    try {
      setLoadingOnchain(true)
      const res = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: selected.x, y: selected.y, amount_usdc: selected.price, mode: 'wallet' })
      })
      const data = await res.json()
      if (data.ok) {
        setOnchainInfo(data)
      }
    } finally {
      setLoadingOnchain(false)
    }
  }

  async function createCommerceOrder() {
    try {
      setLoadingCommerce(true)
      const res = await fetch('/api/commerce/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: selected.x, y: selected.y, amount_usd: 2 })
      })
      const data = await res.json()
      if (data.ok && data.hosted_url) {
        setCommerceUrl(data.hosted_url)
        window.open(data.hosted_url, '_blank')
      }
    } finally {
      setLoadingCommerce(false)
    }
  }

  return (
    <main style={{ padding: 16, fontFamily: 'system-ui' }}>
      <nav style={{ display: 'flex', gap: 12, marginBottom: 16, borderBottom: '1px solid #1e293b', paddingBottom: 12 }}>
        <Link href="/world" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 13 }}>世界地图</Link>
        <Link href="/" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 13 }}>首页</Link>
      </nav>
      <h1 style={{ margin: 0, fontSize: 20 }}>Grid Shop · 支付入口</h1>
      <div style={{ marginTop: 12, color: '#64748b' }}>选择格子，按你喜欢的方式付款（钱包 / Awal / AgentKit）</div>
      <div style={{ marginTop: 16, fontSize: 13, color: '#94a3b8' }}>收款地址（Base）：{TREASURY}</div>
      <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {grids.map(g => (
          <button
            key={g.id}
            onClick={() => setSelected(g)}
            style={{
              padding: 12,
              borderRadius: 12,
              border: '1px solid ' + (selected.id === g.id ? '#38bdf8' : '#1f2937'),
              background: selected.id === g.id ? '#0b1120' : '#020617',
              color: '#e2e8f0',
              cursor: 'pointer',
              minWidth: 140,
              textAlign: 'left'
            }}
          >
            <div style={{ fontSize: 12, color: '#64748b' }}>格子 {g.id}</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>坐标 ({g.x},{g.y})</div>
            <div style={{ fontSize: 12, marginTop: 4, color: '#94a3b8' }}>{g.price} USDC</div>
          </button>
        ))}
      </div>
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>方式 1：真人自己用钱包转账</h2>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          在任意支持 Base 的钱包中：
          <br />
          1）选择 USDC
          <br />
          2）收款地址填：{TREASURY}
          <br />
          3）金额填：{onchainInfo?.amount_usdc ?? selected.price} USDC
          <br />
          4）备注可填：Grid {selected.id} ({selected.x},{selected.y})
        </div>
        <button
          onClick={createOnchainOrder}
          disabled={loadingOnchain}
          style={{
            marginTop: 12,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid #1f2937',
            background: '#0f172a',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontSize: 13
          }}
        >
          {loadingOnchain ? '生成链上支付指纹中…' : '生成唯一金额（推荐）'}
        </button>
        {onchainInfo && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#a5b4fc' }}>
            本次订单的专属金额为 {onchainInfo.amount_usdc} USDC，对应收据 {onchainInfo.receiptId}
          </div>
        )}
      </section>
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>方式 2：Awal 命令行支付</h2>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>在终端执行下面两行：</div>
        <pre
          style={{
            marginTop: 8,
            background: '#020617',
            borderRadius: 8,
            padding: 12,
            fontSize: 12,
            overflowX: 'auto',
            border: '1px solid #1f2937'
          }}
        >
{`npx awal auth you@example.com
${awalCommand}`}
        </pre>
      </section>
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>方式 3：AgentKit / x402 支付</h2>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          让 AI 或后台系统直接调用
          <code style={{ padding: '0 4px' }}>/api/purchase</code>
          ，传入 x、y、amount_usdc、mode 等参数。
          <br />
          示例 curl 可以在首页“生成 AgentKit curl”按钮生成。
        </div>
      </section>
      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>方式 4：Coinbase Checkout 支付</h2>
        <div style={{ fontSize: 13, color: '#94a3b8' }}>
          点击下面按钮，会在新窗口打开 Coinbase 托管的支付页，你可以用 Coinbase 账户或支持的方式完成付款。
        </div>
        <button
          onClick={createCommerceOrder}
          disabled={loadingCommerce}
          style={{
            marginTop: 12,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid #1f2937',
            background: '#0f172a',
            color: '#e2e8f0',
            cursor: 'pointer',
            fontSize: 13
          }}
        >
          {loadingCommerce ? '跳转 Coinbase 中…' : '用 Coinbase Checkout 支付'}
        </button>
        {commerceUrl && (
          <div style={{ marginTop: 8, fontSize: 12, color: '#a5b4fc' }}>
            如果没有自动打开，可以手动复制访问：{commerceUrl}
          </div>
        )}
      </section>
      <div style={{ marginTop: 24, fontSize: 12, color: '#64748b', maxWidth: 520 }}>
        支付完成后，可以回到首页使用“生成校验 URL / 浏览器校验”来验证该收款地址是否收到对应 USDC，再由系统把对应格子标记为已售。
      </div>
    </main>
  )
}
