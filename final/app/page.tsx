'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'

const COLS = 100
const ROWS = 100

const BLOCK_SIZES = [
  { w: 1, h: 1, label: '1×1', price: 0.02 },
  { w: 2, h: 1, label: '2×1', price: 0.05 },
  { w: 2, h: 2, label: '2×2', price: 0.12 },
  { w: 3, h: 3, label: '3×3', price: 0.36 },
  { w: 4, h: 4, label: '4×4', price: 0.80 },
]

type Cell = {
  id: number; x: number; y: number; owner: string | null; color?: string
  title?: string; summary?: string; image_url?: string
  block_id?: string; block_w?: number; block_h?: number
  block_origin_x?: number; block_origin_y?: number
}

type CellDetail = Cell & { content_url?: string; markdown?: string; last_updated?: string }
type GridEvent = { id: number; event_type: string; x?: number; y?: number; block_size?: string; owner?: string; message?: string; created_at: string }
type Ranking = { owner: string; cell_count?: number; x?: number; y?: number; title?: string; last_updated?: string }

function truncAddr(addr: string) {
  if (!addr || addr.length < 12) return addr
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

export default function Page() {
  const [cells, setCells] = useState<Cell[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null)
  const [blockSize, setBlockSize] = useState(BLOCK_SIZES[0])
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [apiKeyResult, setApiKeyResult] = useState<string | null>(null)
  const [detailCell, setDetailCell] = useState<CellDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [events, setEvents] = useState<GridEvent[]>([])
  const [holders, setHolders] = useState<Ranking[]>([])
  const [recent, setRecent] = useState<Ranking[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Cell[] | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [showRankings, setShowRankings] = useState(false)
  const marqueeRef = useRef<HTMLDivElement>(null)

  const fetchGrid = useCallback(async () => {
    try {
      const res = await fetch('/api/grid')
      const data = res.ok ? await res.json() : []
      setCells(Array.isArray(data) ? data : [])
    } catch {
      setCells([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchGrid() }, [fetchGrid])

  // Verify payment on redirect
  useEffect(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
    if (params.get('paid') === '1' && params.get('receipt_id')) {
      fetch(`/api/commerce/verify?receipt_id=${encodeURIComponent(params.get('receipt_id')!)}`)
        .then(r => r.json())
        .then(d => {
          if (d?.ok && d?.paid) {
            fetchGrid()
            if (d.api_key) setApiKeyResult(d.api_key)
          }
        })
      window.history.replaceState({}, '', '/')
    }
  }, [fetchGrid])

  // Fetch events + rankings
  useEffect(() => {
    fetch('/api/events?limit=10').then(r => r.json()).then(d => {
      if (d?.events) setEvents(d.events)
    }).catch(() => {})
    fetch('/api/rankings').then(r => r.json()).then(d => {
      if (d?.holders) setHolders(d.holders)
      if (d?.recent) setRecent(d.recent)
    }).catch(() => {})
  }, [])

  const cellMap = new Map<string, Cell>()
  cells.forEach(c => cellMap.set(`${c.x},${c.y}`, c))
  const soldCount = cells.filter(c => c?.owner != null).length

  // Check if a block area overlaps sold cells
  const blockConflict = (x: number, y: number, w: number, h: number) => {
    if (x + w > 100 || y + h > 100) return true
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const c = cellMap.get(`${x + dx},${y + dy}`)
        if (c?.owner) return true
      }
    }
    return false
  }

  const handlePay = async () => {
    if (!selected) return
    setPayError(null)
    setPayLoading(true)
    try {
      const res = await fetch('/api/commerce/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          x: selected.x, y: selected.y,
          block_w: blockSize.w, block_h: blockSize.h,
          return_path: '',
        }),
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

  const handleCellClick = (x: number, y: number) => {
    const c = cellMap.get(`${x},${y}`)
    if (c?.owner) {
      // Show detail
      setDetailLoading(true)
      setDetailCell(null)
      fetch(`/api/cells?x=${x}&y=${y}`).then(r => r.json()).then(d => {
        if (d?.ok && d?.cell) setDetailCell(d.cell)
      }).catch(() => {}).finally(() => setDetailLoading(false))
    } else {
      setSelected({ x, y })
      setBlockSize(BLOCK_SIZES[0])
      setPayError(null)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearchLoading(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`)
      const d = await res.json()
      setSearchResults(d?.results || [])
    } catch {
      setSearchResults([])
    } finally {
      setSearchLoading(false)
    }
  }

  // Determine which cells to highlight for block preview
  const previewCells = new Set<string>()
  if (selected) {
    for (let dy = 0; dy < blockSize.h; dy++) {
      for (let dx = 0; dx < blockSize.w; dx++) {
        previewCells.add(`${selected.x + dx},${selected.y + dy}`)
      }
    }
  }

  const hasConflict = selected ? blockConflict(selected.x, selected.y, blockSize.w, blockSize.h) : false

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-green-500 font-mono">
        加载中...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Notification Ticker */}
      {events.length > 0 && (
        <div className="bg-[#111] border-b border-[#333] overflow-hidden h-8 flex items-center">
          <div ref={marqueeRef} className="whitespace-nowrap animate-marquee flex gap-8 px-4 text-xs font-mono text-gray-400">
            {events.map(ev => (
              <span key={ev.id}>
                {ev.event_type === 'purchase' ? '\u{1F7E2}' : '\u{1F4DD}'}{' '}
                {ev.x != null ? `(${ev.x},${ev.y})` : ''}{' '}
                {ev.block_size ? `${ev.block_size} ` : ''}
                {ev.event_type === 'purchase' ? '被购买' : '已更新'}
                {ev.owner ? ` · ${truncAddr(ev.owner)}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .animate-marquee {
          animation: marquee 30s linear infinite;
        }
      `}</style>

      <div className="p-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h1 className="text-lg font-bold text-green-500 font-mono">格子售卖 · Grid Shop</h1>
              <p className="text-gray-500 text-sm">点击空格子购买 · 点击已售格子查看详情</p>
            </div>
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder="搜索..."
                  className="bg-[#111] border border-[#333] rounded px-2 py-1 text-xs font-mono text-white w-32 focus:outline-none focus:border-green-500"
                />
                <button
                  onClick={handleSearch}
                  disabled={searchLoading}
                  className="px-2 py-1 text-xs bg-[#222] border border-[#333] rounded text-green-500 hover:bg-[#333] font-mono"
                >
                  {searchLoading ? '...' : '搜'}
                </button>
              </div>
              <button
                onClick={() => setShowRankings(!showRankings)}
                className="px-2 py-1 text-xs bg-[#222] border border-[#333] rounded text-green-500 hover:bg-[#333] font-mono"
              >
                排名
              </button>
            </div>
          </div>

          {/* Stats */}
          <p className="text-gray-500 text-xs mb-3 font-mono">
            已售 <span className="text-green-500">{soldCount}</span> / 10000 格
          </p>

          {/* Search Results */}
          {searchResults && (
            <div className="mb-4 bg-[#111] border border-[#333] rounded p-3">
              <div className="flex justify-between items-center mb-2">
                <p className="text-green-500 text-xs font-mono font-bold">搜索结果 ({searchResults.length})</p>
                <button onClick={() => setSearchResults(null)} className="text-gray-500 text-xs hover:text-white">[关闭]</button>
              </div>
              {searchResults.length === 0 ? (
                <p className="text-gray-500 text-xs">无结果</p>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => { handleCellClick(r.x, r.y); setSearchResults(null) }}
                      className="text-xs font-mono bg-[#222] border border-[#333] rounded px-2 py-1 hover:border-green-500"
                    >
                      ({r.x},{r.y}) {r.title || truncAddr(r.owner || '')}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-4 flex-wrap">
            {/* Grid */}
            <div className="flex-shrink-0">
              <div
                className="inline-grid gap-0 border border-[#333] p-px bg-[#222]"
                style={{ gridTemplateColumns: `repeat(${COLS}, 6px)`, gridTemplateRows: `repeat(${ROWS}, 6px)` }}
              >
                {Array.from({ length: ROWS * COLS }, (_, i) => {
                  const x = i % COLS
                  const y = Math.floor(i / COLS)
                  const c = cellMap.get(`${x},${y}`)
                  const isSold = !!(c?.owner)
                  const isPreview = previewCells.has(`${x},${y}`)
                  let bg = '#1a1a1a'
                  if (isSold) bg = c?.color || '#00ff41'
                  if (isPreview && !isSold) bg = hasConflict ? '#ff4444' : '#00ff4140'
                  if (isPreview && isSold) bg = '#ff4444'
                  return (
                    <button
                      key={i}
                      type="button"
                      className="w-[6px] h-[6px] min-w-[6px] min-h-[6px] focus:outline-none"
                      style={{ backgroundColor: bg }}
                      onClick={() => handleCellClick(x, y)}
                      title={isSold ? `已售 (${x},${y}) ${c?.title || ''}` : `(${x},${y})`}
                    />
                  )
                })}
              </div>
            </div>

            {/* Rankings Panel */}
            {showRankings && (
              <div className="flex-1 min-w-[200px] max-w-[280px]">
                <div className="bg-[#111] border border-[#333] rounded p-3 mb-3">
                  <p className="text-green-500 text-xs font-mono font-bold mb-2">大户排名</p>
                  {holders.length === 0 ? (
                    <p className="text-gray-500 text-xs">暂无数据</p>
                  ) : (
                    <div className="space-y-1">
                      {holders.map((h, i) => (
                        <div key={i} className="flex justify-between text-xs font-mono">
                          <span className="text-gray-400">{i + 1}. {truncAddr(h.owner)}</span>
                          <span className="text-green-500">{h.cell_count}格</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-[#111] border border-[#333] rounded p-3">
                  <p className="text-green-500 text-xs font-mono font-bold mb-2">最近活跃</p>
                  {recent.length === 0 ? (
                    <p className="text-gray-500 text-xs">暂无数据</p>
                  ) : (
                    <div className="space-y-1">
                      {recent.map((r, i) => (
                        <div key={i} className="flex justify-between text-xs font-mono">
                          <span className="text-gray-400">{truncAddr(r.owner)}</span>
                          <span className="text-gray-500">({r.x},{r.y})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Purchase Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setSelected(null)}>
          <div className="bg-[#111] border border-[#333] rounded-lg p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-green-500 font-mono font-bold mb-4">购买格子 [{selected.x}, {selected.y}]</h2>

            {/* Block Size Selector */}
            <p className="text-gray-400 text-xs mb-2 font-mono">选择尺寸：</p>
            <div className="flex gap-2 mb-4 flex-wrap">
              {BLOCK_SIZES.map(bs => {
                const active = bs.w === blockSize.w && bs.h === blockSize.h
                const conflict = blockConflict(selected.x, selected.y, bs.w, bs.h)
                return (
                  <button
                    key={bs.label}
                    onClick={() => setBlockSize(bs)}
                    disabled={conflict}
                    className={`px-3 py-2 text-xs font-mono rounded border ${
                      active
                        ? 'border-green-500 bg-green-900/30 text-green-400'
                        : conflict
                        ? 'border-[#333] bg-[#111] text-gray-600 cursor-not-allowed'
                        : 'border-[#333] bg-[#222] text-gray-300 hover:border-green-500'
                    }`}
                  >
                    {bs.label}
                    <br />
                    <span className={active ? 'text-green-300' : 'text-gray-500'}>${bs.price}</span>
                  </button>
                )
              })}
            </div>

            <p className="text-gray-400 text-sm mb-4 font-mono">
              价格: <span className="text-green-500 font-bold">${blockSize.price} USDC</span>
              <span className="text-gray-600 ml-2">({blockSize.w * blockSize.h} 格)</span>
            </p>

            {hasConflict && (
              <p className="text-red-400 text-xs mb-3 font-mono">该区域有已售格子或超出边界，请调整位置或尺寸</p>
            )}

            <button
              type="button"
              disabled={payLoading || hasConflict}
              onClick={handlePay}
              className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-mono font-bold rounded mb-4"
            >
              {payLoading ? '跳转中...' : `Coinbase 付款 ($${blockSize.price} USDC)`}
            </button>
            {payError && <p className="text-red-400 text-sm mb-4">{payError}</p>}

            {/* x402 AI payment */}
            <div className="border-t border-[#333] pt-4">
              <p className="text-green-500 text-xs font-bold mb-2 font-mono">AI 付款 (x402) — 仅 1×1</p>
              {(() => {
                const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
                const apiUrl = `${baseUrl.replace(/\/$/, '')}/api/cells/purchase`
                const cmd = `npx awal@latest x402 pay ${apiUrl} -X POST -d '{"x":${selected.x},"y":${selected.y}}'`
                return (
                  <>
                    <pre className="bg-[#0a0a0a] p-3 rounded text-[10px] text-gray-300 overflow-x-auto whitespace-pre-wrap break-all font-mono">{cmd}</pre>
                    <button type="button" className="text-[10px] text-green-500 hover:text-green-400 font-mono mt-1" onClick={() => navigator.clipboard.writeText(cmd)}>[复制命令]</button>
                  </>
                )
              })()}
            </div>

            <button type="button" className="mt-4 w-full py-2 border border-[#333] text-gray-400 hover:text-white rounded font-mono text-sm" onClick={() => setSelected(null)}>关闭</button>
          </div>
        </div>
      )}

      {/* API Key Result Modal */}
      {apiKeyResult && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={() => setApiKeyResult(null)}>
          <div className="bg-[#111] border border-green-500 rounded-lg p-6 max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-green-500 font-mono font-bold mb-2">购买成功!</h2>
            <p className="text-yellow-400 text-xs mb-3 font-mono">请保存好你的 API Key，此后不再显示！</p>

            <div className="bg-[#0a0a0a] border border-[#333] rounded p-3 mb-3">
              <p className="text-green-400 font-mono text-sm break-all">{apiKeyResult}</p>
            </div>

            <button
              type="button"
              className="w-full py-2 bg-green-600 hover:bg-green-500 text-white font-mono text-sm rounded mb-3"
              onClick={() => navigator.clipboard.writeText(apiKeyResult)}
            >
              复制 Key
            </button>

            <div className="bg-[#0a0a0a] border border-[#333] rounded p-3 mb-3">
              <p className="text-gray-500 text-[10px] font-mono mb-1">用此 Key 更新格子内容：</p>
              <pre className="text-[10px] text-gray-400 font-mono whitespace-pre-wrap break-all">{`curl -X PUT ${typeof window !== 'undefined' ? window.location.origin : ''}/api/cells/update \\
  -H "Authorization: Bearer ${apiKeyResult}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"My Cell","summary":"Hello!","fill_color":"#ff6600"}'`}</pre>
            </div>

            <button type="button" className="w-full py-2 border border-[#333] text-gray-400 hover:text-white rounded font-mono text-sm" onClick={() => setApiKeyResult(null)}>我已保存，关闭</button>
          </div>
        </div>
      )}

      {/* Cell Detail Modal */}
      {(detailCell || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => { setDetailCell(null); setDetailLoading(false) }}>
          <div className="bg-[#111] border border-[#333] rounded-lg p-6 max-w-md w-full shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {detailLoading ? (
              <p className="text-gray-400 font-mono text-sm">加载中...</p>
            ) : detailCell ? (
              <>
                <h2 className="text-green-500 font-mono font-bold mb-2">
                  格子 [{detailCell.x}, {detailCell.y}]
                  {detailCell.block_w && detailCell.block_w > 1 ? ` (${detailCell.block_w}×${detailCell.block_h} block)` : ''}
                </h2>
                <p className="text-gray-500 text-xs font-mono mb-3">Owner: {truncAddr(detailCell.owner || '')}</p>

                {detailCell.image_url && (
                  <img src={detailCell.image_url} alt={detailCell.title || 'cell'} className="w-full rounded mb-3 max-h-48 object-cover" />
                )}

                {detailCell.title && <p className="text-white font-bold mb-1">{detailCell.title}</p>}
                {detailCell.summary && <p className="text-gray-300 text-sm mb-2">{detailCell.summary}</p>}

                {detailCell.content_url && (
                  <a href={detailCell.content_url} target="_blank" rel="noopener noreferrer" className="text-green-500 text-xs hover:underline block mb-2 font-mono break-all">
                    {detailCell.content_url}
                  </a>
                )}

                {detailCell.markdown && (
                  <pre className="bg-[#0a0a0a] p-3 rounded text-xs text-gray-300 whitespace-pre-wrap break-all font-mono mt-2 max-h-40 overflow-y-auto">{detailCell.markdown}</pre>
                )}

                {detailCell.last_updated && (
                  <p className="text-gray-600 text-[10px] font-mono mt-3">更新于: {new Date(detailCell.last_updated).toLocaleString()}</p>
                )}
              </>
            ) : (
              <p className="text-gray-400 font-mono text-sm">该格子暂无数据</p>
            )}
            <button type="button" className="mt-4 w-full py-2 border border-[#333] text-gray-400 hover:text-white rounded font-mono text-sm" onClick={() => { setDetailCell(null); setDetailLoading(false) }}>关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}
