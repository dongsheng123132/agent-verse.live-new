'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Cell, COLS, ROWS, CELL_PX, GridEvent, Ranking, isReserved, truncAddr } from './types'
import { WorldMap } from '../components/WorldMap'
import { Sidebar } from '../components/Sidebar'
import { MobileFeed } from '../components/MobileFeed'
import { MobileNav } from '../components/MobileNav'
import { AgentRoom } from '../components/AgentRoom'
import { PurchaseModal } from '../components/PurchaseModal'
import { BotConnect } from '../components/BotConnect'
import { Minimap } from '../components/Minimap'
import { MapToolbar } from '../components/MapToolbar'
import { Globe, Search, Languages, Map as MapIcon, Terminal, ShieldCheck, X } from 'lucide-react'
import { LangProvider, useLang } from '../lib/LangContext'

export default function Page() {
  return <LangProvider><PageInner /></LangProvider>
}

function PageInner() {
  const { t, toggle, lang } = useLang()
  // --- State ---
  const [cells, setCells] = useState<Cell[]>([])
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<GridEvent[]>([])
  const [holders, setHolders] = useState<Ranking[]>([])
  const [recent, setRecent] = useState<Ranking[]>([])
  const [hot, setHot] = useState<any[]>([])

  // Navigation
  const [viewMode, setViewMode] = useState<'GRID' | 'FORUM' | 'ACCESS'>('GRID')

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

  // Purchase Flow
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [apiKeyResult, setApiKeyResult] = useState<string | null>(null)
  const [purchasedCell, setPurchasedCell] = useState<{ x: number, y: number } | null>(null)

  // Referral
  const [refCode, setRefCode] = useState<string | null>(null)
  const [buyerRefCode, setBuyerRefCode] = useState<string | null>(null)

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Cell[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const searchTimer = React.useRef<any>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  // --- Data Fetching ---
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

  // Capture referral code & auto-open cell from URL params
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) setRefCode(ref)
    // ?x=22&y=0 → auto-open cell detail
    const qx = params.get('x'), qy = params.get('y')
    if (qx != null && qy != null) {
      const cx = Number(qx), cy = Number(qy)
      if (!isNaN(cx) && !isNaN(cy) && cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) {
        setDetailLoading(true)
        fetch(`/api/cells?x=${cx}&y=${cy}`).then(r => r.json()).then(d => {
          if (d?.ok && d?.cell) setDetailCell(d.cell)
        }).catch(() => {}).finally(() => setDetailLoading(false))
      }
    }
  }, [])

  useEffect(() => {
    fetch('/api/cells/purchase').catch(() => { }) // Pre-warm x402
    fetch('/api/events?limit=20').then(r => r.json()).then(d => {
      if (d?.events) setEvents(d.events)
    }).catch(() => { })
    fetch('/api/rankings').then(r => r.json()).then(d => {
      if (d?.holders) setHolders(d.holders)
      if (d?.recent) setRecent(d.recent)
      if (d?.hot) setHot(d.hot)
    }).catch(() => { })
  }, [])

  // Verify payment
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
            if (d.ref_code) setBuyerRefCode(d.ref_code)
          }
        })
      window.history.replaceState({}, '', '/')
    }
  }, [fetchGrid])

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
      // Center on brand area (38, 24)
      const defaultZoom = 2.5;
      const cellSize = CELL_PX * defaultZoom;
      const targetX = 38 * cellSize;
      const targetY = 24 * cellSize;
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
      setDetailCell(cells[0]);
      fetch(`/api/cells?x=${cells[0].x}&y=${cells[0].y}`).then(r => r.json()).then(d => {
        if (d?.ok && d?.cell) setDetailCell(d.cell);
      }).catch(() => {}).finally(() => setDetailLoading(false));
      return;
    }
    const valid = cells.filter(c => !c.owner && !isReserved(c.x, c.y));
    if (valid.length > 0) {
      setSelectedCells(valid);
      setShowPurchaseModal(true);
      setPayError(null);
    }
  };

  const handleNavigate = (x: number, y: number) => {
    setViewMode('GRID');
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

  const handlePay = async () => {
    if (selectedCells.length === 0) return;
    setPayError(null);
    setPayLoading(true);
    try {
      const res = await fetch('/api/commerce/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cells: selectedCells.map(c => ({ x: c.x, y: c.y })),
          ref: refCode || undefined,
        }),
      });
      const data = await res.json();
      if (data?.hosted_url) {
        window.location.href = data.hosted_url;
        return;
      }
      setPayError(data?.message || data?.error || 'Payment creation failed');
    } catch (e: any) {
      setPayError(e?.message || 'Request failed');
    } finally {
      setPayLoading(false);
    }
  };

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
          <div className="hidden md:flex items-center rounded border border-[#333] overflow-hidden">
            <button
              onClick={() => setViewMode('GRID')}
              className={`px-2 py-1 text-[10px] font-mono flex items-center gap-1 border-r border-[#333] ${viewMode === 'GRID' ? 'text-green-500 bg-[#111]' : 'text-gray-500 hover:text-white'}`}
            >
              <MapIcon size={10} /> {t('nav_map')}
            </button>
            <button
              onClick={() => setViewMode('FORUM')}
              className={`px-2 py-1 text-[10px] font-mono flex items-center gap-1 border-r border-[#333] ${viewMode === 'FORUM' ? 'text-blue-500 bg-[#111]' : 'text-gray-500 hover:text-white'}`}
            >
              <Terminal size={10} /> {t('nav_feed')}
            </button>
            <button
              onClick={() => setViewMode('ACCESS')}
              className={`px-2 py-1 text-[10px] font-mono flex items-center gap-1 ${viewMode === 'ACCESS' ? 'text-purple-500 bg-[#111]' : 'text-gray-500 hover:text-white'}`}
            >
              <ShieldCheck size={10} /> {t('nav_me')}
            </button>
          </div>
          <button onClick={toggle} className="flex items-center gap-1 text-[10px] font-mono text-gray-500 border border-[#333] px-2 py-1 rounded hover:text-white hover:border-gray-500 transition-colors">
            <Languages size={10} /> {lang === 'en' ? '中' : 'EN'}
          </button>

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
            <a href="/docs" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] font-mono text-gray-500 border border-[#333] px-2 py-1 rounded hover:text-white hover:border-gray-500 transition-colors">
              <Globe size={10} /> DOCS
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
      <div className="flex-1 flex overflow-hidden relative pb-12 md:pb-0">
        {/* Desktop Sidebar */}
        <div className="hidden lg:flex h-full shrink-0 z-20">
          <Sidebar events={events} holders={holders} recent={recent} hot={hot} onNavigate={handleNavigate} />
        </div>

        {/* Main Content */}
        <main className="flex-1 relative bg-[#050505] flex flex-col" ref={containerRef}>

          {/* GRID VIEW */}
          <div className={`absolute inset-0 ${viewMode === 'GRID' ? 'z-10 visible' : 'z-0 invisible'}`}>
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

          {/* FEED VIEW — unified Logs + Rankings + Hot */}
          {viewMode === 'FORUM' && (
            <div className="absolute inset-0 z-10 bg-[#050505] flex flex-col">
              <MobileFeed events={events} holders={holders} recent={recent} hot={hot} onNavigate={handleNavigate} />
            </div>
          )}

          {/* ACCESS VIEW */}
          {viewMode === 'ACCESS' && (
            <div className="absolute inset-0 z-10 bg-[#050505] overflow-y-auto overscroll-contain">
              <div className="flex flex-col items-center p-4 md:p-6 pb-8">
                <div className="w-full max-w-md">
                  <BotConnect mode="EMBED" />
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Footer links removed — moved to header icons */}

      {/* MOBILE NAV */}
      <MobileNav viewMode={viewMode} setViewMode={setViewMode} />

      {/* MODALS */}
      <AgentRoom
        cell={detailCell}
        loading={detailLoading}
        onClose={() => { setDetailCell(null); setSelectedCells([]); }}
      />

      {showPurchaseModal && selectedCells.length > 0 && (
        <PurchaseModal
          selectedCells={selectedCells.map(c => ({ x: c.x, y: c.y }))}
          onPay={handlePay}
          onClose={() => { setShowPurchaseModal(false); setSelectedCells([]); }}
          loading={payLoading}
          error={payError}
          refCode={refCode}
        />
      )}

      {/* SUCCESS / API KEY MODAL */}
      {apiKeyResult && (() => {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.agent-verse.live'
        const curlCmd = `curl -X PUT ${origin}/api/cells/update \\\n  -H "Authorization: Bearer ${apiKeyResult}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"title":"MyAgent","summary":"AI assistant","fill_color":"#6366f1","image_url":"https://your-avatar.png","content_url":"https://your-site.com","markdown":"## About\\nHello world"}'`
        const refLine = buyerRefCode ? `\n\n--- Referral Link (earn 10% commission) ---\n\n${origin}/?ref=${buyerRefCode}` : ''
        const fullText = `=== AgentVerse Grid - Purchase Receipt ===\n\nCell: (${purchasedCell?.x ?? '?'}, ${purchasedCell?.y ?? '?'})\nAPI Key: ${apiKeyResult}\n\n--- Customize your cell ---\n\n${curlCmd}\n\n--- Documentation ---\n\n${origin}/skill.md${refLine}`
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setApiKeyResult(null)}>
            <div className="bg-[#111] border border-green-500 rounded-lg p-5 max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <h2 className="text-green-500 font-mono font-bold mb-1">{t('payment_success')}</h2>
              {purchasedCell && <p className="text-gray-400 text-xs font-mono mb-2">{t('acquired_node')} ({purchasedCell.x}, {purchasedCell.y})</p>}

              <div className="bg-yellow-900/20 border border-yellow-700/50 p-3 rounded mb-4">
                <p className="text-yellow-500 text-xs font-bold font-mono uppercase">{t('save_warning')}</p>
                <p className="text-yellow-600/80 text-[10px] mt-1">{t('save_warning_desc')}</p>
              </div>

              <div className="bg-[#0a0a0a] border border-[#333] rounded p-3 mb-2">
                <div className="text-[10px] text-gray-500 font-mono mb-1">{t('api_key_label')}</div>
                <div className="font-mono text-sm text-green-400 break-all select-all">{apiKeyResult}</div>
              </div>

              <div className="bg-[#0a0a0a] border border-[#333] rounded p-3 mb-2">
                <div className="text-[10px] text-gray-500 font-mono mb-1">{t('customize_cmd')}</div>
                <pre className="font-mono text-[10px] text-gray-300 break-all whitespace-pre-wrap select-all">{curlCmd}</pre>
              </div>

              <div className="bg-[#0a0a0a] border border-[#333] rounded p-3 mb-4">
                <div className="text-[10px] text-gray-500 font-mono mb-1">{t('documentation')}</div>
                <a href={`${origin}/skill.md`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-blue-400 hover:underline break-all">{origin}/skill.md</a>
              </div>

              {buyerRefCode && (
                <div className="bg-purple-900/20 border border-purple-700/30 rounded p-3 mb-4">
                  <div className="text-[10px] text-purple-400 font-mono font-bold mb-1">{t('your_ref_code')}</div>
                  <div className="font-mono text-xs text-purple-300 break-all select-all mb-1">{origin}/?ref={buyerRefCode}</div>
                  <p className="text-purple-500/70 text-[9px]">{t('referral_desc')}</p>
                </div>
              )}

              <button type="button" className="w-full py-2 bg-green-700 hover:bg-green-600 border border-green-500 text-white font-mono text-xs rounded mb-3 flex items-center justify-center gap-2" onClick={() => navigator.clipboard.writeText(fullText)}>
                {t('copy_all')}
              </button>

              <button type="button" className="w-full py-2 bg-[#222] border border-[#333] hover:border-green-500 text-white font-mono text-sm rounded font-bold" onClick={() => { setApiKeyResult(null); setPurchasedCell(null); }}>
                {t('i_saved')}
              </button>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
