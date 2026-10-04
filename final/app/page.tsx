'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Cell, COLS, ROWS, CELL_PX, isReserved, truncAddr } from './types'
import { WorldMap } from '../components/WorldMap'
import { AgentRoom } from '../components/AgentRoom'
import { PurchaseModal } from '../components/PurchaseModal'
import { Minimap } from '../components/Minimap'
import { MapToolbar } from '../components/MapToolbar'
import { Globe, Info, Search, Languages, Map as MapIcon, X } from 'lucide-react'
import { LangProvider, useLang } from '../lib/LangContext'
import { SHOWCASE_ORIGIN } from '../lib/showcase/metropolis'

export default function Page() {
  return <LangProvider><PageInner /></LangProvider>
}

function PageInner() {
  const { t, toggle, lang } = useLang()
  // --- State ---
  const [cells, setCells] = useState<Cell[]>([])
  const [loading, setLoading] = useState(true)

  // Map State
  const [zoom, setZoom] = useState(2.5)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Selection & Modals
  const [selectedCells, setSelectedCells] = useState<Cell[]>([])
  // mapMode removed — WorldMap auto-detects: desktop=select, mobile=pan
  const [controlsOpen, setControlsOpen] = useState(true)
  const [detailCell, setDetailCell] = useState<Cell | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showPurchaseModal, setShowPurchaseModal] = useState(false)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Cell[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const searchTimer = React.useRef<any>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  // --- Data Fetching ---
  const fetchGrid = useCallback(async (): Promise<Cell[]> => {
    try {
      const res = await fetch('/api/grid', { cache: 'no-store' })
      const data = res.ok ? await res.json() : []
      const list: Cell[] = Array.isArray(data) ? data : []
      setCells(list)
      return list
    } catch {
      setCells([])
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchGrid() }, [fetchGrid])

  // Auto-open a cell from URL params
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    // ?x=22&y=0 → auto-open cell detail
    const qx = params.get('x'), qy = params.get('y')
    if (qx != null && qy != null) {
      const cx = Number(qx), cy = Number(qy)
      if (!isNaN(cx) && !isNaN(cy) && cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) {
        setDetailLoading(true)
        fetch(`/api/cells?x=${cx}&y=${cy}`).then(r => r.json()).then(d => {
          if (d?.ok && d?.cell) {
            const cell = d.cell;
            // If this is a sub-cell of a block, fetch the origin which has all content
            const ox = cell.block_origin_x ?? cell.x;
            const oy = cell.block_origin_y ?? cell.y;
            if (ox !== cell.x || oy !== cell.y) {
              fetch(`/api/cells?x=${ox}&y=${oy}`).then(r2 => r2.json()).then(d2 => {
                if (d2?.ok && d2?.cell) setDetailCell(d2.cell);
                else setDetailCell(cell);
              }).catch(() => setDetailCell(cell));
            } else {
              setDetailCell(cell);
            }
          }
        }).catch(() => {}).finally(() => setDetailLoading(false))
      }
    }
  }, [])

  useEffect(() => {
    fetch('/api/cells/purchase').catch(() => { }) // Pre-warm x402
  }, [])

  // --- Helpers ---
  const cellMap = useMemo(() => {
    const m = new Map<string, Cell>()
    cells.forEach(c => m.set(`${c.x},${c.y}`, c))
    return m
  }, [cells])

  const clampPan = useCallback((p: { x: number, y: number }, z: number, cSize: { width: number, height: number }) => {
    const worldW = COLS * CELL_PX * z;
    const worldH = ROWS * CELL_PX * z;

    // Horizontal
    let newX = p.x;
    if (worldW > cSize.width) {
      const minX = cSize.width - worldW;
      newX = Math.max(minX, Math.min(0, newX));
    } else {
      // Center horizontally if smaller
      newX = (cSize.width - worldW) / 2;
    }

    // Vertical
    let newY = p.y;
    if (worldH > cSize.height) {
      const minY = cSize.height - worldH;
      newY = Math.max(minY, Math.min(0, newY));
    } else {
      // Center vertically if smaller
      newY = (cSize.height - worldH) / 2;
    }
    return { x: newX, y: newY };
  }, []);

  // Initial Center — only trigger when container has a reasonable size
  const initialCentered = React.useRef(false)
  useEffect(() => {
    if (containerSize.width > 100 && containerSize.height > 100 && !initialCentered.current) {
      // Open on the Monad Metropolis arena + sponsor row (the main ad space),
      // not the old brand corner. Showcase block is 24x17 from SHOWCASE_ORIGIN.
      const defaultZoom = 2.5;
      const cellSize = CELL_PX * defaultZoom;
      const targetX = (SHOWCASE_ORIGIN.x + 12) * cellSize;
      const targetY = (SHOWCASE_ORIGIN.y + 8.5) * cellSize;
      const cx = (containerSize.width / 2) - targetX;
      const cy = (containerSize.height / 2) - targetY;
      setPan(clampPan({ x: cx, y: cy }, defaultZoom, containerSize));
      initialCentered.current = true;
    }
  }, [containerSize, clampPan])


  // --- Search ---
  const doSearch = useCallback((q: string) => {
    if (!q.trim()) { setSearchResults([]); setSearchOpen(false); return }
    // Check if it's a coordinate
    const match = q.match(/^(\d+)[,\s]+(\d+)$/)
    if (match) {
      const cx = parseInt(match[1]), cy = parseInt(match[2])
      if (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) {
        const c = cellMap.get(`${cx},${cy}`)
        setSearchResults(c ? [c] : [{ id: -1, x: cx, y: cy, owner: null }])
        setSearchOpen(true)
        return
      }
    }
    setSearchLoading(true)
    fetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.json()).then(d => {
      if (d?.results) { setSearchResults(d.results); setSearchOpen(true) }
      else setSearchResults([])
    }).catch(() => setSearchResults([])).finally(() => setSearchLoading(false))
  }, [cellMap])

  const handleSearchInput = useCallback((val: string) => {
    setSearchQuery(val)
    clearTimeout(searchTimer.current)
    if (!val.trim()) { setSearchResults([]); setSearchOpen(false); return }
    searchTimer.current = setTimeout(() => doSearch(val), 300)
  }, [doSearch])

  // --- Handlers ---
  const handleSelectCells = (cells: Cell[]) => {
    setSelectedCells(cells);
    if (cells.length === 0) {
      setDetailCell(null);
      setShowPurchaseModal(false);
      return;
    }
    if (cells.length === 1 && cells[0].owner) {
      setDetailLoading(true);
      // For block cells, fetch the origin cell which has all content (iframe_url, markdown, etc.)
      const c = cells[0];
      const ox = c.block_origin_x ?? c.x;
      const oy = c.block_origin_y ?? c.y;
      setDetailCell(c);
      fetch(`/api/cells?x=${ox}&y=${oy}`).then(r => r.json()).then(d => {
        if (d?.ok && d?.cell) setDetailCell(d.cell);
      }).catch(() => {}).finally(() => setDetailLoading(false));
      return;
    }
    const valid = cells.filter(c => !c.owner && !isReserved(c.x, c.y));
    if (valid.length > 0) {
      setSelectedCells(valid);
      setShowPurchaseModal(true);
    }
  };

  const handleNavigate = (x: number, y: number) => {
    const cellSize = CELL_PX * zoom;
    const targetX = -(x * cellSize) + (containerSize.width / 2);
    const targetY = -(y * cellSize) + (containerSize.height / 2);
    setPan(clampPan({ x: targetX, y: targetY }, zoom, containerSize));

    const cell = cellMap.get(`${x},${y}`) || { id: -1, x, y, owner: null };
    handleSelectCells([cell]);
  };

  const handlePanTo = (worldX: number, worldY: number) => {
    // Center view on this world coordinate
    const cx = (containerSize.width / 2) - worldX * zoom;
    const cy = (containerSize.height / 2) - worldY * zoom;
    setPan(clampPan({ x: cx, y: cy }, zoom, containerSize));
  };

  // "我让 AI 买完了": re-read the map, and if the chosen cells now have an owner open the first one so the person can review
  // what the AI bought / decorated. Returns how many of the chosen cells have an owner (the modal explains the rest).
  const handleAiDone = useCallback(async (): Promise<{ owned: number, total: number } | null> => {
    const chosen = selectedCells.map(c => ({ x: c.x, y: c.y }))
    if (chosen.length === 0) return null
    let list: Cell[]
    try {
      const res = await fetch('/api/grid', { cache: 'no-store' })
      if (!res.ok) return null
      const data = await res.json()
      if (!Array.isArray(data)) return null
      list = data
      setCells(list)
    } catch {
      return null
    }
    const ownerOf = new Map<string, Cell>()
    list.forEach(c => { if (c.owner) ownerOf.set(`${c.x},${c.y}`, c) })
    const owned = chosen.filter(c => ownerOf.has(`${c.x},${c.y}`))
    if (owned.length === chosen.length) {
      const first = owned[0]
      setShowPurchaseModal(false)
      setSelectedCells([])
      setDetailLoading(true)
      setDetailCell(ownerOf.get(`${first.x},${first.y}`) ?? null)
      fetch(`/api/cells?x=${first.x}&y=${first.y}`, { cache: 'no-store' }).then(r => r.json()).then(d => {
        if (d?.ok && d?.cell) setDetailCell(d.cell)
      }).catch(() => {}).finally(() => setDetailLoading(false))
    }
    return { owned: owned.length, total: chosen.length }
  }, [selectedCells])

  // Container measurement — robust approach using getBoundingClientRect
  const containerNodeRef = React.useRef<HTMLDivElement | null>(null)
  const observerRef = React.useRef<ResizeObserver | null>(null)

  const measureContainer = useCallback(() => {
    const node = containerNodeRef.current
    if (!node) return
    const rect = node.getBoundingClientRect()
    const w = Math.round(rect.width)
    const h = Math.round(rect.height)
    if (w > 0 && h > 0) {
      setContainerSize(prev => (prev.width === w && prev.height === h) ? prev : { width: w, height: h })
    }
  }, [])

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect()
      observerRef.current = null
    }
    containerNodeRef.current = node
    if (node) {
      measureContainer()
      observerRef.current = new ResizeObserver(measureContainer)
      observerRef.current.observe(node)
    }
  }, [measureContainer])

  useEffect(() => {
    // Re-measure after layout stabilizes (CSS load, paint)
    const raf = requestAnimationFrame(measureContainer)
    const timer = setTimeout(measureContainer, 300)
    window.addEventListener('resize', measureContainer)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
      window.removeEventListener('resize', measureContainer)
      if (observerRef.current) observerRef.current.disconnect()
    }
  }, [measureContainer])

  // Close search on outside click
  useEffect(() => {
    const handler = () => setSearchOpen(false)
    if (searchOpen) document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [searchOpen])

  if (loading) {
    return (
      <div className="absolute inset-0 bg-[#050505] z-50 flex flex-col items-center justify-center font-mono">
        <div className="relative w-64 h-2 bg-[#111] rounded overflow-hidden mb-4">
          <div className="absolute inset-y-0 left-0 bg-green-500 animate-[width_2s_ease-in-out_infinite]" style={{ width: '50%' }}></div>
        </div>
        <div className="text-green-500 text-xs tracking-widest animate-pulse">BOOTING_AGENT_GRID_SYSTEM...</div>
        <div className="text-[#333] text-[10px] mt-2">INITIALIZING_NEURAL_LINKS...</div>
      </div>
    );
  }

  return (
    <div className="w-screen h-[100dvh] bg-[#050505] text-white overflow-hidden flex flex-col font-sans selection:bg-green-900 selection:text-white">

      {/* HEADER */}
      <header className="h-12 border-b border-[#222] bg-[#0a0a0a] flex items-center justify-between px-3 md:px-4 shrink-0 z-40">
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-sm tracking-widest font-mono flex items-center gap-2">
            <span className="text-green-500 w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="hidden sm:inline">AGENT_VERSE</span>
            <span className="sm:hidden">AV</span>
          </h1>
          <span className="ml-2 px-2 py-0.5 rounded bg-[#111] border border-[#333] text-[9px] md:text-[10px] font-mono text-gray-400 leading-tight">
            <span className="hidden sm:inline">
              全球首个 x402 驱动的 AI 百万格子世界 · Every AI agent gets a cell
            </span>
            <span className="inline sm:hidden">
              x402 · AI 百万格子世界
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1.5 md:gap-2">
          <button onClick={toggle} className="flex items-center gap-1 text-[10px] font-mono text-gray-500 border border-[#333] px-2 py-1 rounded hover:text-white hover:border-gray-500 transition-colors">
            <Languages size={10} /> {lang === 'en' ? '中' : 'EN'}
          </button>
          <a href="/about" className="flex items-center gap-1 text-[10px] font-mono text-gray-500 border border-[#333] px-2 py-1 rounded hover:text-white hover:border-gray-500 transition-colors">
            <Info size={10} /> {t('about')}
          </a>

          {/* Mobile: search icon toggle */}
          <button onClick={() => { setMobileSearchOpen(v => !v); setTimeout(() => searchInputRef.current?.focus(), 100) }}
            className="md:hidden flex items-center justify-center w-8 h-8 rounded border border-[#333] text-gray-500 hover:text-white">
            <Search size={14} />
          </button>

          {/* Desktop: inline search */}
          <div className="hidden md:block relative" onClick={e => e.stopPropagation()}>
            <input
              type="text"
              placeholder={t('search_placeholder')}
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setSearchOpen(true) }}
              onKeyDown={e => {
                if (e.key === 'Enter') { doSearch(searchQuery); }
                if (e.key === 'Escape') { setSearchOpen(false); }
              }}
              className="bg-[#111] border border-[#333] rounded px-3 py-1 text-xs font-mono w-32 focus:w-52 transition-all focus:border-green-500 focus:outline-none"
            />
            <Search size={12} className="absolute right-2 top-2 text-gray-500" />
            {searchOpen && (
              <div className="absolute top-full right-0 mt-1 w-72 bg-[#111] border border-[#333] rounded shadow-xl z-50 max-h-64 overflow-y-auto">
                {searchLoading && <div className="p-3 text-gray-500 text-xs font-mono animate-pulse">{t('searching')}</div>}
                {!searchLoading && searchResults.length === 0 && searchQuery && (
                  <div className="p-3 text-gray-500 text-xs font-mono">{t('no_results')}</div>
                )}
                {searchResults.map((r, i) => (
                  <button key={i} className="w-full text-left px-3 py-2 hover:bg-[#1a1a1a] border-b border-[#222] last:border-0 flex items-center gap-2"
                    onClick={() => { handleNavigate(r.x, r.y); setSearchOpen(false); setSearchQuery(''); }}>
                    <span className="text-green-500 font-mono text-[10px] shrink-0">({r.x},{r.y})</span>
                    <span className="text-white text-xs truncate">{r.title || (r.owner ? truncAddr(r.owner) : t('empty'))}</span>
                    {r.color && <span className="w-3 h-3 rounded-sm shrink-0 ml-auto" style={{ backgroundColor: r.color }}></span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="hidden md:flex items-center gap-1">
            <a href="/skill.md" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] font-mono text-gray-500 border border-[#333] px-2 py-1 rounded hover:text-white hover:border-gray-500 transition-colors">
              <Globe size={10} /> skill.md
            </a>
            <a href="https://github.com/dongsheng123132/agent-verse.live-new" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white transition-colors p-1" title="GitHub">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
            </a>
            <a href="https://x.com/AGENTVERSE2026" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-white transition-colors p-1" title="X / Twitter">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
            </a>
            <a href="https://www.youtube.com/@AGENTVERSE2026" target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-red-500 transition-colors p-1" title="YouTube">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
            </a>
          </div>
        </div>
      </header>

      {/* MOBILE SEARCH BAR (slides down) */}
      {mobileSearchOpen && (
        <div className="md:hidden bg-[#0a0a0a] border-b border-[#222] px-3 py-2 z-40 shrink-0" onClick={e => e.stopPropagation()}>
          <div className="relative">
            <input
              ref={searchInputRef}
              type="text"
              placeholder={t('search_placeholder')}
              value={searchQuery}
              onChange={e => handleSearchInput(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setSearchOpen(true) }}
              onKeyDown={e => {
                if (e.key === 'Enter') { doSearch(searchQuery); (e.target as HTMLInputElement).blur(); }
                if (e.key === 'Escape') { setSearchOpen(false); setMobileSearchOpen(false); }
              }}
              className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm font-mono focus:border-green-500 focus:outline-none"
            />
            <button onClick={() => { setMobileSearchOpen(false); setSearchOpen(false); setSearchQuery(''); }}
              className="absolute right-2 top-2 text-gray-500 p-0.5">
              <X size={16} />
            </button>
          </div>
          {searchOpen && (
            <div className="mt-1 bg-[#111] border border-[#333] rounded shadow-xl max-h-52 overflow-y-auto">
              {searchLoading && <div className="p-3 text-gray-500 text-xs font-mono animate-pulse">{t('searching')}</div>}
              {!searchLoading && searchResults.length === 0 && searchQuery && (
                <div className="p-3 text-gray-500 text-xs font-mono">{t('no_results')}</div>
              )}
              {searchResults.map((r, i) => (
                <button key={i} className="w-full text-left px-3 py-2.5 active:bg-[#222] border-b border-[#222] last:border-0 flex items-center gap-2"
                  onClick={() => { handleNavigate(r.x, r.y); setSearchOpen(false); setMobileSearchOpen(false); setSearchQuery(''); }}>
                  <span className="text-green-500 font-mono text-xs shrink-0">({r.x},{r.y})</span>
                  <span className="text-white text-sm truncate">{r.title || (r.owner ? truncAddr(r.owner) : t('empty'))}</span>
                  {r.color && <span className="w-3 h-3 rounded-sm shrink-0 ml-auto" style={{ backgroundColor: r.color }}></span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* WORKSPACE */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Main Content: the map is the whole page */}
        <main className="flex-1 relative bg-[#050505] flex flex-col" ref={containerRef}>

          <div className="absolute inset-0 z-10">
            {containerSize.width > 0 && (
              <WorldMap
                grid={cells}
                pan={pan}
                zoom={zoom}
                width={containerSize.width}
                height={containerSize.height}
                selectedCells={selectedCells}
                onSelectCells={handleSelectCells}
                onPan={(dx, dy) => setPan(p => clampPan({ x: p.x + dx, y: p.y + dy }, zoom, containerSize))}
                onZoom={(d, cx, cy) => {
                  const newZoom = Math.max(0.1, Math.min(6, zoom - d * 0.001));
                  setZoom(newZoom);
                  setPan(p => clampPan(p, newZoom, containerSize));
                }}
              />
            )}

            {/* Controls: bottom-right — collapsible Minimap + Toolbar */}
            <div className="absolute bottom-4 md:bottom-6 right-3 md:right-6 z-20 flex flex-col items-end gap-2">
              {controlsOpen && (
                <div className="flex items-end gap-2">
                  <MapToolbar
                    onZoomIn={() => setZoom(z => Math.min(6, z + 0.5))}
                    onZoomOut={() => setZoom(z => Math.max(0.1, z - 0.5))}
                    onFitScreen={() => {
                      const cellSize = CELL_PX * 2.5;
                      const targetX = 16 * cellSize;
                      const targetY = 16 * cellSize;
                      const cx = (containerSize.width / 2) - targetX;
                      const cy = (containerSize.height / 2) - targetY;
                      setPan(clampPan({ x: cx, y: cy }, 2.5, containerSize));
                      setZoom(2.5);
                    }}
                  />
                  <div className="hidden lg:block">
                    <Minimap
                      grid={cells}
                      pan={pan}
                      zoom={zoom}
                      viewport={containerSize}
                      onNavigate={handleNavigate}
                      onPanTo={handlePanTo}
                    />
                  </div>
                </div>
              )}
              <button
                onClick={() => setControlsOpen(v => !v)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-black/70 backdrop-blur-sm border border-[#333] text-white/60 hover:text-white hover:bg-white/10 transition-all"
                title={controlsOpen ? 'Hide controls' : 'Show controls'}
              >
                {controlsOpen ? <X size={14} /> : <MapIcon size={14} />}
              </button>
            </div>
          </div>

        </main>
      </div>

      {/* MODALS */}
      <AgentRoom
        cell={detailCell}
        loading={detailLoading}
        onClose={() => { setDetailCell(null); setSelectedCells([]); }}
      />

      {showPurchaseModal && selectedCells.length > 0 && (
        <PurchaseModal
          selectedCells={selectedCells.map(c => ({ x: c.x, y: c.y }))}
          onClose={() => { setShowPurchaseModal(false); setSelectedCells([]); }}
          onAiDone={handleAiDone}
        />
      )}
    </div>
  )
}
