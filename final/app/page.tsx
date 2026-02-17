'use client'

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'

const COLS = 100
const ROWS = 100
const CELL_PX = 8 // base cell size in pixels

const BLOCK_SIZES = [
  { w: 1, h: 1, label: '1×1', price: 0.50 },
  { w: 2, h: 1, label: '2×1', price: 1.25 },
  { w: 2, h: 2, label: '2×2', price: 3.00 },
  { w: 3, h: 3, label: '3×3', price: 9.00 },
  { w: 4, h: 4, label: '4×4', price: 20.00 },
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

const RESERVED_DIAGONALS = new Set([
  '20,20','25,25','30,30','33,33','35,35','40,40','44,44','45,45',
  '50,50','55,55','60,60','66,66','70,70','75,75','77,77','80,80',
  '85,85','88,88','90,90','95,95','99,99'
])

function isReserved(x: number, y: number) {
  if (x < 16 && y < 16) return true
  return RESERVED_DIAGONALS.has(`${x},${y}`)
}

function truncAddr(addr: string) {
  if (!addr || addr.length < 12) return addr
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

// Generate a deterministic pixel avatar color from address hash
function addrColor(addr: string): string {
  let h = 0
  for (let i = 0; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) & 0xffffff
  const hue = h % 360
  return `hsl(${hue}, 65%, 50%)`
}

export default function Page() {
  const [cells, setCells] = useState<Cell[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null)
  const [blockSize, setBlockSize] = useState(BLOCK_SIZES[0])
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [purchasedCell, setPurchasedCell] = useState<{ x: number; y: number } | null>(null)
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
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null)

  // Canvas zoom/pan state
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map())
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
      const px = Number(params.get('x'))
      const py = Number(params.get('y'))
      fetch(`/api/commerce/verify?receipt_id=${encodeURIComponent(params.get('receipt_id')!)}`)
        .then(r => r.json())
        .then(d => {
          if (d?.ok && d?.paid) {
            fetchGrid()
            if (d.api_key) {
              setApiKeyResult(d.api_key)
              if (Number.isFinite(px) && Number.isFinite(py)) setPurchasedCell({ x: px, y: py })
            }
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

  const cellMap = useMemo(() => {
    const m = new Map<string, Cell>()
    cells.forEach(c => m.set(`${c.x},${c.y}`, c))
    return m
  }, [cells])

  const soldCount = useMemo(() => cells.filter(c => c?.owner != null).length, [cells])

  const blockConflict = useCallback((x: number, y: number, w: number, h: number) => {
    if (x + w > 100 || y + h > 100) return true
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const c = cellMap.get(`${x + dx},${y + dy}`)
        if (c?.owner) return true
        if (isReserved(x + dx, y + dy)) return true
      }
    }
    return false
  }, [cellMap])

  // Preload images for cells that have image_url
  useEffect(() => {
    cells.forEach(c => {
      if (c.image_url && !imageCache.current.has(c.image_url)) {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = c.image_url
        imageCache.current.set(c.image_url, img)
      }
    })
  }, [cells])

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const dpr = window.devicePixelRatio || 1
    const w = container.clientWidth
    const h = container.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const cellSize = CELL_PX * zoom
    const startCol = Math.max(0, Math.floor(-pan.x / cellSize))
    const startRow = Math.max(0, Math.floor(-pan.y / cellSize))
    const endCol = Math.min(COLS, Math.ceil((w - pan.x) / cellSize))
    const endRow = Math.min(ROWS, Math.ceil((h - pan.y) / cellSize))

    // Background
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, w, h)

    // Grid lines when zoomed enough
    const gap = zoom >= 1.5 ? 1 : 0

    for (let row = startRow; row < endRow; row++) {
      for (let col = startCol; col < endCol; col++) {
        const px = pan.x + col * cellSize
        const py = pan.y + row * cellSize
        const c = cellMap.get(`${col},${row}`)
        const isSold = !!(c?.owner)
        const reserved = isReserved(col, row)

        // Background color
        if (isSold) {
          ctx.fillStyle = c?.color || '#00ff41'
        } else if (reserved) {
          ctx.fillStyle = '#111118'
        } else {
          ctx.fillStyle = '#161616'
        }
        ctx.fillRect(px + gap, py + gap, cellSize - gap, cellSize - gap)

        // Draw image when zoomed in enough (cellSize > 16px)
        if (isSold && cellSize > 16) {
          const imgUrl = c?.image_url
          if (imgUrl) {
            const img = imageCache.current.get(imgUrl)
            if (img && img.complete && img.naturalWidth > 0) {
              try {
                ctx.drawImage(img, px + 1, py + 1, cellSize - 2, cellSize - 2)
              } catch {}
            }
          } else if (c?.owner && cellSize > 24) {
            // No image: draw a mini pixel avatar placeholder
            ctx.fillStyle = addrColor(c.owner)
            const s = Math.floor(cellSize * 0.6)
            const ox = px + (cellSize - s) / 2
            const oy = py + (cellSize - s) / 2
            ctx.fillRect(ox, oy, s, s)
            // Inner pattern
            ctx.fillStyle = 'rgba(0,0,0,0.3)'
            const hs = s / 2
            ctx.fillRect(ox, oy + hs, hs, hs)
            ctx.fillRect(ox + hs, oy, hs, hs)
          }

          // Title text when zoomed a lot
          if (c?.title && cellSize > 40) {
            ctx.fillStyle = '#fff'
            ctx.font = `${Math.min(10, cellSize / 6)}px monospace`
            ctx.textAlign = 'center'
            ctx.fillText(c.title.slice(0, 8), px + cellSize / 2, py + cellSize - 3, cellSize - 4)
          }
        }

        // Hover highlight
        if (hoverCell && hoverCell.x === col && hoverCell.y === row) {
          ctx.strokeStyle = '#00ff41'
          ctx.lineWidth = 2
          ctx.strokeRect(px + 1, py + 1, cellSize - 2, cellSize - 2)
        }

        // Block preview highlight
        if (selected) {
          const inPreview = col >= selected.x && col < selected.x + blockSize.w && row >= selected.y && row < selected.y + blockSize.h
          if (inPreview) {
            const conflict = blockConflict(selected.x, selected.y, blockSize.w, blockSize.h)
            ctx.fillStyle = conflict ? 'rgba(255,68,68,0.4)' : 'rgba(0,255,65,0.25)'
            ctx.fillRect(px, py, cellSize, cellSize)
          }
        }
      }
    }

    // Grid border
    const totalW = COLS * cellSize
    const totalH = ROWS * cellSize
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    ctx.strokeRect(pan.x, pan.y, totalW, totalH)

  }, [cells, cellMap, zoom, pan, hoverCell, selected, blockSize, blockConflict])

  // Resize handler
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (canvas && container) {
        // Trigger re-render
        setPan(p => ({ ...p }))
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Screen coords → grid coords
  const screenToGrid = useCallback((sx: number, sy: number) => {
    const cellSize = CELL_PX * zoom
    const gx = Math.floor((sx - pan.x) / cellSize)
    const gy = Math.floor((sy - pan.y) / cellSize)
    return { x: Math.max(0, Math.min(99, gx)), y: Math.max(0, Math.min(99, gy)) }
  }, [zoom, pan])

  // Mouse handlers for canvas
  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    if (isDragging) {
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy })
    } else {
      setHoverCell(screenToGrid(mx, my))
    }
  }

  const handleCanvasMouseUp = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const dx = Math.abs(e.clientX - dragStart.current.x)
    const dy = Math.abs(e.clientY - dragStart.current.y)

    // Click (not drag) — less than 5px movement
    if (dx < 5 && dy < 5) {
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const { x, y } = screenToGrid(mx, my)
      if (x >= 0 && x < 100 && y >= 0 && y < 100) {
        handleCellClick(x, y)
      }
    }
    setIsDragging(false)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    const newZoom = Math.max(0.3, Math.min(6, zoom - e.deltaY * 0.002))
    // Zoom toward mouse position
    const scale = newZoom / zoom
    setPan({ x: mx - (mx - pan.x) * scale, y: my - (my - pan.y) * scale })
    setZoom(newZoom)
  }

  // Touch handlers for mobile pinch zoom
  const lastTouches = useRef<{ d: number; cx: number; cy: number } | null>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const t0 = e.touches[0], t1 = e.touches[1]
      const d = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
      lastTouches.current = { d, cx: (t0.clientX + t1.clientX) / 2, cy: (t0.clientY + t1.clientY) / 2 }
    } else if (e.touches.length === 1) {
      const t = e.touches[0]
      setIsDragging(true)
      dragStart.current = { x: t.clientX, y: t.clientY, panX: pan.x, panY: pan.y }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouches.current) {
      e.preventDefault()
      const t0 = e.touches[0], t1 = e.touches[1]
      const d = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY)
      const cx = (t0.clientX + t1.clientX) / 2
      const cy = (t0.clientY + t1.clientY) / 2
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const scale = d / lastTouches.current.d
      const newZoom = Math.max(0.3, Math.min(6, zoom * scale))
      const zoomScale = newZoom / zoom
      const mx = cx - rect.left
      const my = cy - rect.top
      setPan({ x: mx - (mx - pan.x) * zoomScale, y: my - (my - pan.y) * zoomScale })
      setZoom(newZoom)
      lastTouches.current = { d, cx, cy }
    } else if (e.touches.length === 1 && isDragging) {
      const t = e.touches[0]
      setPan({ x: dragStart.current.panX + t.clientX - dragStart.current.x, y: dragStart.current.panY + t.clientY - dragStart.current.y })
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    lastTouches.current = null
    if (e.touches.length === 0 && isDragging) {
      setIsDragging(false)
      // Detect tap
      if (e.changedTouches.length === 1) {
        const t = e.changedTouches[0]
        const dx = Math.abs(t.clientX - dragStart.current.x)
        const dy = Math.abs(t.clientY - dragStart.current.y)
        if (dx < 10 && dy < 10) {
          const rect = canvasRef.current?.getBoundingClientRect()
          if (rect) {
            const { x, y } = screenToGrid(t.clientX - rect.left, t.clientY - rect.top)
            if (x >= 0 && x < 100 && y >= 0 && y < 100) handleCellClick(x, y)
          }
        }
      }
    }
  }

  // Navigate to cell
  const navigateToCell = useCallback((x: number, y: number) => {
    const container = containerRef.current
    if (!container) return
    const cellSize = CELL_PX * zoom
    setPan({
      x: container.clientWidth / 2 - x * cellSize - cellSize / 2,
      y: container.clientHeight / 2 - y * cellSize - cellSize / 2,
    })
  }, [zoom])

  const handlePay = async () => {
    if (!selected) return
    setPayError(null)
    setPayLoading(true)
    try {
      const res = await fetch('/api/commerce/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: selected.x, y: selected.y, block_w: blockSize.w, block_h: blockSize.h, return_path: '' }),
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
      setDetailLoading(true)
      setDetailCell(null)
      fetch(`/api/cells?x=${x}&y=${y}`).then(r => r.json()).then(d => {
        if (d?.ok && d?.cell) setDetailCell(d.cell)
      }).catch(() => {}).finally(() => setDetailLoading(false))
    } else if (!isReserved(x, y)) {
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

  const hasConflict = selected ? blockConflict(selected.x, selected.y, blockSize.w, blockSize.h) : false

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-green-500 font-mono">
        加载中...
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#0a0a0a] text-white flex flex-col overflow-hidden">
      {/* Notification Ticker */}
      {events.length > 0 && (
        <div className="bg-[#111] border-b border-[#333] overflow-hidden h-7 flex items-center flex-shrink-0">
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
        @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
        .animate-marquee { animation: marquee 30s linear infinite; }
      `}</style>

      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#222] flex-shrink-0 flex-wrap gap-1">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold text-green-500 font-mono">Grid Shop</h1>
          <span className="text-gray-500 text-xs font-mono">已售 <span className="text-green-500">{soldCount}</span></span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()} placeholder="搜索..." className="bg-[#111] border border-[#333] rounded px-2 py-1 text-xs font-mono text-white w-24 focus:outline-none focus:border-green-500" />
            <button onClick={handleSearch} disabled={searchLoading} className="px-2 py-1 text-xs bg-[#222] border border-[#333] rounded text-green-500 hover:bg-[#333] font-mono">{searchLoading ? '..' : '搜'}</button>
          </div>
          <button onClick={() => setShowRankings(!showRankings)} className="px-2 py-1 text-xs bg-[#222] border border-[#333] rounded text-green-500 hover:bg-[#333] font-mono">排名</button>
          <span className="text-gray-600 text-[10px] font-mono">{zoom.toFixed(1)}x</span>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="px-2 py-1 text-[10px] bg-[#222] border border-[#333] rounded text-gray-400 hover:text-white font-mono">重置</button>
        </div>
      </div>

      {/* Search Results */}
      {searchResults && (
        <div className="px-3 py-2 bg-[#111] border-b border-[#333] flex-shrink-0">
          <div className="flex justify-between items-center mb-1">
            <span className="text-green-500 text-xs font-mono font-bold">搜索结果 ({searchResults.length})</span>
            <button onClick={() => setSearchResults(null)} className="text-gray-500 text-xs hover:text-white">[关闭]</button>
          </div>
          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
            {searchResults.length === 0 ? <span className="text-gray-500 text-xs">无结果</span> : searchResults.map((r, i) => (
              <button key={i} onClick={() => { navigateToCell(r.x, r.y); handleCellClick(r.x, r.y); setSearchResults(null) }} className="text-xs font-mono bg-[#222] border border-[#333] rounded px-2 py-0.5 hover:border-green-500">
                ({r.x},{r.y}) {r.title || truncAddr(r.owner || '')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas grid */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden" style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
          <canvas
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={() => { setIsDragging(false); setHoverCell(null) }}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="absolute inset-0"
          />

          {/* Hover tooltip */}
          {hoverCell && !isDragging && (
            <div className="absolute top-2 left-2 bg-[#111]/90 border border-[#333] rounded px-2 py-1 pointer-events-none z-10">
              <p className="text-green-500 text-xs font-mono">({hoverCell.x}, {hoverCell.y})</p>
              {(() => {
                const c = cellMap.get(`${hoverCell.x},${hoverCell.y}`)
                if (c?.owner) return <p className="text-gray-400 text-[10px] font-mono">{c.title || truncAddr(c.owner)}</p>
                if (isReserved(hoverCell.x, hoverCell.y)) return <p className="text-gray-600 text-[10px] font-mono">保留</p>
                return <p className="text-gray-600 text-[10px] font-mono">可购买</p>
              })()}
            </div>
          )}

          {/* Minimap */}
          <div className="absolute bottom-2 right-2 bg-[#111] border border-[#333] rounded overflow-hidden z-10" style={{ width: 120, height: 120 }}>
            <canvas
              width={120}
              height={120}
              ref={el => {
                if (!el) return
                const ctx = el.getContext('2d')
                if (!ctx) return
                const scale = 120 / COLS
                ctx.fillStyle = '#0a0a0a'
                ctx.fillRect(0, 0, 120, 120)
                // Draw cells
                cells.forEach(c => {
                  if (!c.owner) return
                  ctx.fillStyle = c.color || '#00ff41'
                  ctx.fillRect(c.x * scale, c.y * scale, Math.max(1, scale), Math.max(1, scale))
                })
                // Viewport indicator
                const container = containerRef.current
                if (container) {
                  const cellSize = CELL_PX * zoom
                  const vx = (-pan.x / cellSize) * scale
                  const vy = (-pan.y / cellSize) * scale
                  const vw = (container.clientWidth / cellSize) * scale
                  const vh = (container.clientHeight / cellSize) * scale
                  ctx.strokeStyle = '#fff'
                  ctx.lineWidth = 1
                  ctx.strokeRect(vx, vy, vw, vh)
                }
              }}
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                const mx = e.clientX - rect.left
                const my = e.clientY - rect.top
                const scale = 120 / COLS
                const gx = Math.floor(mx / scale)
                const gy = Math.floor(my / scale)
                navigateToCell(gx, gy)
              }}
              className="cursor-pointer"
            />
          </div>
        </div>

        {/* Rankings sidebar */}
        {showRankings && (
          <div className="w-56 bg-[#111] border-l border-[#333] p-3 overflow-y-auto flex-shrink-0">
            <div className="mb-4">
              <p className="text-green-500 text-xs font-mono font-bold mb-2">大户排名</p>
              {holders.length === 0 ? <p className="text-gray-500 text-xs">暂无</p> : (
                <div className="space-y-1">
                  {holders.map((h, i) => (
                    <div key={i} className="flex justify-between text-xs font-mono">
                      <span className="text-gray-400">{i + 1}. {truncAddr(h.owner)}</span>
                      <span className="text-green-500">{h.cell_count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className="text-green-500 text-xs font-mono font-bold mb-2">最近活跃</p>
              {recent.length === 0 ? <p className="text-gray-500 text-xs">暂无</p> : (
                <div className="space-y-1">
                  {recent.map((r, i) => (
                    <div key={i} className="flex justify-between text-xs font-mono cursor-pointer hover:text-green-500" onClick={() => navigateToCell(r.x!, r.y!)}>
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

      {/* Purchase Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => setSelected(null)}>
          <div className="bg-[#111] border border-[#333] rounded-lg p-5 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-green-500 font-mono font-bold mb-3">购买格子 ({selected.x}, {selected.y})</h2>

            <p className="text-gray-400 text-xs mb-2 font-mono">选择尺寸：</p>
            <div className="flex gap-2 mb-3 flex-wrap">
              {BLOCK_SIZES.map(bs => {
                const active = bs.w === blockSize.w && bs.h === blockSize.h
                const conflict = blockConflict(selected.x, selected.y, bs.w, bs.h)
                return (
                  <button key={bs.label} onClick={() => setBlockSize(bs)} disabled={conflict}
                    className={`px-2 py-1.5 text-xs font-mono rounded border ${active ? 'border-green-500 bg-green-900/30 text-green-400' : conflict ? 'border-[#333] bg-[#111] text-gray-600 cursor-not-allowed' : 'border-[#333] bg-[#222] text-gray-300 hover:border-green-500'}`}>
                    {bs.label} <span className={active ? 'text-green-300' : 'text-gray-500'}>${bs.price}</span>
                  </button>
                )
              })}
            </div>

            <p className="text-gray-400 text-sm mb-3 font-mono">
              <span className="text-green-500 font-bold">${blockSize.price} USDC</span>
              <span className="text-gray-600 ml-2">· {blockSize.w * blockSize.h} 格</span>
            </p>

            {hasConflict && <p className="text-red-400 text-xs mb-2 font-mono">该区域有已售/保留格子</p>}

            <button type="button" disabled={payLoading || hasConflict} onClick={handlePay}
              className="w-full py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-mono font-bold rounded mb-3 text-sm">
              {payLoading ? '跳转中...' : `Coinbase 付款 ($${blockSize.price})`}
            </button>
            {payError && <p className="text-red-400 text-xs mb-2">{payError}</p>}

            <div className="border-t border-[#333] pt-3">
              <p className="text-green-500 text-[10px] font-bold mb-1 font-mono">AI 付款 (x402) — 仅 1×1</p>
              <pre className="bg-[#0a0a0a] p-2 rounded text-[9px] text-gray-400 overflow-x-auto whitespace-pre-wrap break-all font-mono">{`npx awal@latest x402 pay ${typeof window !== 'undefined' ? window.location.origin : ''}/api/cells/purchase -X POST -d '{"x":${selected.x},"y":${selected.y}}'`}</pre>
            </div>
            <button type="button" className="mt-3 w-full py-1.5 border border-[#333] text-gray-400 hover:text-white rounded font-mono text-xs" onClick={() => setSelected(null)}>关闭</button>
          </div>
        </div>
      )}

      {/* API Key Modal */}
      {apiKeyResult && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80" onClick={() => setApiKeyResult(null)}>
          <div className="bg-[#111] border border-green-500 rounded-lg p-5 max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-green-500 font-mono font-bold mb-1">购买成功!</h2>
            {purchasedCell && <p className="text-gray-400 text-xs font-mono mb-2">格子 ({purchasedCell.x}, {purchasedCell.y})</p>}
            <p className="text-yellow-400 text-xs mb-3 font-mono">请保存 API Key，此后不再显示！</p>

            <div className="bg-[#0a0a0a] border border-[#333] rounded p-2 mb-2">
              <p className="text-green-400 font-mono text-sm break-all">{apiKeyResult}</p>
            </div>
            <button type="button" className="w-full py-2 bg-green-600 hover:bg-green-500 text-white font-mono text-sm rounded mb-3" onClick={() => navigator.clipboard.writeText(apiKeyResult)}>复制 Key</button>

            <div className="space-y-2">
              <p className="text-green-500 text-xs font-bold font-mono">自定义你的格子：</p>
              <div className="bg-[#0a0a0a] border border-[#333] rounded p-2">
                <p className="text-gray-400 text-[10px] font-mono mb-1">设头像 + 颜色 + 标题 + 链接（一次性全改）：</p>
                <pre className="text-[9px] text-gray-500 font-mono whitespace-pre-wrap break-all">{`curl -X PUT ${typeof window !== 'undefined' ? window.location.origin : ''}/api/cells/update \\
  -H "Authorization: Bearer ${apiKeyResult}" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"MyAgent","summary":"AI assistant","fill_color":"#6366f1","image_url":"https://your-avatar.png","content_url":"https://your-site.com","markdown":"## About\\nHello world"}'`}</pre>
              </div>
              <div className="bg-[#0a0a0a] border border-[#333] rounded p-2 flex items-center justify-between">
                <span className="text-gray-500 text-[10px] font-mono">AI Agent 完整文档：</span>
                <a href="/skill.md" target="_blank" className="text-green-500 text-[10px] font-mono hover:underline">/skill.md</a>
              </div>
            </div>
            <button type="button" className="mt-3 w-full py-1.5 border border-[#333] text-gray-400 hover:text-white rounded font-mono text-xs" onClick={() => { setApiKeyResult(null); setPurchasedCell(null) }}>我已保存，关闭</button>
          </div>
        </div>
      )}

      {/* Cell Detail Modal */}
      {(detailCell || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80" onClick={() => { setDetailCell(null); setDetailLoading(false) }}>
          <div className="bg-[#111] border border-[#333] rounded-lg p-5 max-w-md w-full shadow-xl max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            {detailLoading ? <p className="text-gray-400 font-mono text-sm">加载中...</p> : detailCell ? (
              <>
                <h2 className="text-green-500 font-mono font-bold mb-1">
                  ({detailCell.x}, {detailCell.y})
                  {detailCell.block_w && detailCell.block_w > 1 ? ` · ${detailCell.block_w}×${detailCell.block_h}` : ''}
                </h2>
                <p className="text-gray-500 text-xs font-mono mb-3">{truncAddr(detailCell.owner || '')}</p>
                {detailCell.image_url && <img src={detailCell.image_url} alt={detailCell.title || ''} className="w-full rounded mb-3 max-h-48 object-cover" />}
                {detailCell.title && <p className="text-white font-bold mb-1">{detailCell.title}</p>}
                {detailCell.summary && <p className="text-gray-300 text-sm mb-2">{detailCell.summary}</p>}
                {detailCell.content_url && <a href={detailCell.content_url} target="_blank" rel="noopener noreferrer" className="text-green-500 text-xs hover:underline block mb-2 font-mono break-all">{detailCell.content_url}</a>}
                {detailCell.markdown && <pre className="bg-[#0a0a0a] p-3 rounded text-xs text-gray-300 whitespace-pre-wrap break-all font-mono mt-2 max-h-40 overflow-y-auto">{detailCell.markdown}</pre>}
                {detailCell.last_updated && <p className="text-gray-600 text-[10px] font-mono mt-2">更新: {new Date(detailCell.last_updated).toLocaleString()}</p>}
              </>
            ) : <p className="text-gray-400 font-mono text-sm">暂无数据</p>}
            <button type="button" className="mt-3 w-full py-1.5 border border-[#333] text-gray-400 hover:text-white rounded font-mono text-xs" onClick={() => { setDetailCell(null); setDetailLoading(false) }}>关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}
