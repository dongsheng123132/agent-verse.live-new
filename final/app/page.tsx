'use client'

import React, { useState, useEffect } from 'react'

const COLS = 100
const ROWS = 100
const PRICE_USD = 0.02
const PAYMENT_ADDRESS = '0xe6EA7c31A85A1f42DFAc6C49155bE90722246890'

type Cell = { id: number; x: number; y: number; owner: string | null; color?: string }

export default function Page() {
  const [cells, setCells] = useState<Cell[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null)
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)

  const fetchGrid = async () => {
    try {
      const res = await fetch('/api/grid')
      const data = await res.ok ? res.json() : []
      setCells(Array.isArray(data) ? data : [])
    } catch {
      setCells([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchGrid() }, [])

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    if (params.get('paid') === '1' && params.get('receipt_id')) {
      fetch(`/api/commerce/verify?receipt_id=${encodeURIComponent(params.get('receipt_id')!)}`)
        .then(r => r.json())
        .then(d => { if (d?.ok && d?.paid) fetchGrid() })
      window.history.replaceState({}, '', '/')
    }
  }, [])

  const cellMap = new Map<string, Cell>()
  cells.forEach(c => cellMap.set(`${c.x},${c.y}`, c))
  const soldCells = cells.filter(c => c?.owner != null)
  const soldCount = soldCells.length

  const handlePay = async () => {
    if (!selected) return
    setPayError(null)
    setPayLoading(true)
    try {
      const res = await fetch('/api/commerce/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: selected.x, y: selected.y, amount_usd: PRICE_USD, return_path: '' }),
      })
      const data = await res.json()
      if (data?.hosted_url) {
        window.location.href = data.hosted_url
        return
      }
      setPayError(data?.message || data?.error || '创建支付失败')
    } catch (e: any) {
      setPayError(e?.message || '请求失败')
    } finally {
      setPayLoading(false)
    }
  }

  const decimalSeed = selected ? (selected.x * 137 + selected.y * 13) : 0
  const offsetRaw = (decimalSeed % 9000) + 1000
  const verificationOffset = offsetRaw / 100000
  const finalAmount = (PRICE_USD + verificationOffset).toFixed(4)
  const decimalPart = finalAmount.split('.')[1]

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-green-500 font-mono">
        加载中...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white p-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-lg font-bold text-green-500 font-mono mb-4">格子售卖 · Grid Shop</h1>
        <p className="text-gray-500 text-sm mb-4">点击任意格子购买 · {PRICE_USD} USDC/格</p>
        {soldCount > 0 && (
          <p className="text-gray-500 text-xs mb-2 font-mono">
            已售 <span className="text-green-500">{soldCount}</span> 格
            <span className="text-gray-600 ml-2">
              {soldCells.slice(0, 20).map(c => `(${c.x},${c.y})`).join(' ')}
              {soldCount > 20 ? ' …' : ''}
            </span>
          </p>
        )}

        <div
          className="inline-grid gap-px border border-[#333] p-px bg-[#222]"
          style={{ gridTemplateColumns: `repeat(${COLS}, 6px)`, gridTemplateRows: `repeat(${ROWS}, 6px)` }}
        >
          {Array.from({ length: ROWS * COLS }, (_, i) => {
            const x = i % COLS
            const y = Math.floor(i / COLS)
            const c = cellMap.get(`${x},${y}`)
            const isSold = !!(c?.owner)
            const isSelected = selected?.x === x && selected?.y === y
            return (
              <button
                key={i}
                type="button"
                className="w-[6px] h-[6px] min-w-[6px] min-h-[6px] rounded-sm focus:outline-none focus:ring-1 focus:ring-green-500"
                style={{
                  backgroundColor: c?.color || '#1a1a1a',
                  outline: isSelected ? '2px solid #00ff41' : 'none',
                  boxShadow: isSold ? '0 0 0 1px rgba(0,255,65,0.3)' : undefined,
                }}
                onClick={() => setSelected({ x, y })}
                title={isSold ? `已售 (${x},${y})` : `(${x},${y})`}
              />
            )
          })}
        </div>

        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setSelected(null)}>
            <div className="bg-[#111] border border-[#333] rounded-lg p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-green-500 font-mono font-bold mb-4">格子 [{selected.x}, {selected.y}]</h2>
              <p className="text-gray-400 text-sm mb-4">价格: {PRICE_USD} USDC</p>

              <button
                type="button"
                disabled={payLoading}
                onClick={handlePay}
                className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white font-mono font-bold rounded mb-4"
              >
                {payLoading ? '跳转中...' : `用 Coinbase 付款 (${PRICE_USD} USDC)`}
              </button>
              {payError && <p className="text-red-400 text-sm mb-4">{payError}</p>}

              <div className="border-t border-[#333] pt-4 space-y-4">
                <div>
                  <p className="text-green-500 text-xs font-bold mb-2">AI 付款 (x402)</p>
                  {(() => {
                    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
                    const apiUrl = `${baseUrl.replace(/\/$/, '')}/api/cells/purchase`
                    const cmd = `npx awal@latest x402 pay ${apiUrl} -X POST -d '{"x":${selected.x},"y":${selected.y}}'`
                    return (
                      <>
                        <pre className="bg-[#0a0a0a] p-3 rounded text-[10px] text-gray-300 overflow-x-auto whitespace-pre-wrap break-all font-mono">{cmd}</pre>
                        <button type="button" className="text-[10px] text-green-500 hover:text-green-400 font-mono" onClick={() => navigator.clipboard.writeText(cmd)}>[复制命令]</button>
                      </>
                    )
                  })()}
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-2">手动转账</p>
                  <pre className="bg-[#0a0a0a] p-3 rounded text-[10px] text-gray-400 overflow-x-auto whitespace-pre-wrap break-all font-mono">
{`Recipient: ${PAYMENT_ADDRESS}
Amount: ${finalAmount} USDC
Verification: .${decimalPart}`}
                  </pre>
                  <p className="text-gray-600 text-[10px] mt-2">Base 转 USDC 后调 POST /api/grid-shop/confirm-cell 确认。</p>
                </div>
              </div>

              <button type="button" className="mt-4 w-full py-2 border border-[#333] text-gray-400 hover:text-white rounded font-mono text-sm" onClick={() => setSelected(null)}>关闭</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
