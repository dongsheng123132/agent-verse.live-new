'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Copy, Check, ExternalLink, Sparkles } from 'lucide-react'
import { NETWORK_LABEL, buildCallPrompt } from '../../lib/market/call-prompt'

interface MarketNetworkOffer {
  network: string
  price_usdc: string | null
  payTo: string | null
  asset: string | null
}

/**
 * Probe-only status (lib/market/types.ts):
 *  can_pay   = a read-only GET returned a valid x402 v2 402 offering USDC on the listed network(s);
 *  failed    = it did not;
 *  unchecked = a POST service (needs a body) or not probed yet.
 */
type MarketStatus = 'can_pay' | 'failed' | 'unchecked'

interface MarketEntry {
  name: string
  url: string
  method: string
  description: string | null
  category: string | null
  network: string | null
  price_usdc: string | null
  pay_to: string | null
  /** Every network the 402 offered Monad/Base USDC on (Monad first). */
  networks: MarketNetworkOffer[] | null
  status: MarketStatus
  source: 'listing'
  cell: { x: number; y: number } | null
  probed_at: string | null
  note: string
}


const STATUS_HINT: Record<MarketStatus, string> = {
  can_pay: '只读 GET 返回了合法的 x402 v2 402（没有付款）',
  failed: '只读 GET 没有拿到合法的 x402 v2 402',
  unchecked: 'POST 服务需要 body，或还没探测',
}

function statusBadge(status: MarketStatus) {
  const text = status.replace('_', ' ').toUpperCase()
  switch (status) {
    case 'can_pay':
      return <span title={STATUS_HINT.can_pay} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-green-900/30 border border-green-600/40 text-green-400">{text}</span>
    case 'failed':
      return <span title={STATUS_HINT.failed} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-950/40 border border-red-800/40 text-red-400">{text}</span>
    default:
      return <span title={STATUS_HINT.unchecked} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1a1a1a] border border-[#333] text-gray-500">{text}</span>
  }
}

function CopyForAiButton({ entry }: { entry: MarketEntry }) {
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.agent-verse.live'
  const networks = entry.networks?.map((n) => n.network) ?? (entry.network ? [entry.network] : [])
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(
          buildCallPrompt({ url: entry.url, method: entry.method, priceUsdc: entry.price_usdc, networks, cell: entry.cell, origin })
        )
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono transition-colors ${
        copied ? 'border-green-600 text-green-400 bg-green-900/20' : 'border-[#333] text-gray-300 hover:text-white hover:border-gray-500'
      }`}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? 'Copied' : 'Copy for AI'}
    </button>
  )
}

function EntryCard({ e }: { e: MarketEntry }) {
  return (
    <div className="rounded border border-[#222] bg-[#0a0a0a] p-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-white">{e.name}</span>
            {statusBadge(e.status)}
            <span className="text-[10px] font-mono text-gray-500 px-1.5 py-0.5 rounded border border-[#333]">
              cell ({e.cell?.x},{e.cell?.y})
            </span>
          </div>
          {e.description && <p className="text-gray-400 text-xs mt-1">{e.description}</p>}
          <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-[11px] font-mono hover:underline inline-flex items-center gap-1 mt-1 break-all">
            <ExternalLink size={10} /> {e.url}
          </a>
        </div>
        <div className="text-right shrink-0">
          <div className="text-white font-mono text-sm font-bold">{e.price_usdc ? `$${e.price_usdc}` : '—'}</div>
          <div className="flex items-center justify-end gap-1 mt-1 flex-wrap">
            {(e.networks && e.networks.length > 0
              ? e.networks.map((n) => n.network)
              : e.network
                ? [e.network]
                : []
            ).map((n) => (
              <span key={n} className="text-[10px] text-gray-500 font-mono px-1 py-0.5 rounded border border-[#333]">
                {NETWORK_LABEL[n] || n}
              </span>
            ))}
            {!e.network && (!e.networks || e.networks.length === 0) && (
              <span className="text-[10px] text-gray-500 font-mono">—</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end mt-2 pt-2 border-t border-[#1a1a1a]">
        <CopyForAiButton entry={e} />
      </div>
    </div>
  )
}

export default function MarketPage() {
  const [entries, setEntries] = useState<MarketEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [network, setNetwork] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [category, setCategory] = useState('')

  useEffect(() => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (network) params.set('network', network)
    if (maxPrice) params.set('max_price', maxPrice)
    if (category) params.set('category', category)
    setLoading(true)
    setError(null)
    const t = setTimeout(() => {
      fetch(`/api/services?${params.toString()}`)
        .then((r) => r.json())
        .then((data) => {
          if (data?.ok) {
            setEntries(data.services || [])
          } else {
            setError(data?.message || 'failed to load')
          }
        })
        .catch((e) => setError(String(e?.message || e)))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [q, network, maxPrice, category])

  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const e of entries) if (e.category) set.add(e.category)
    return Array.from(set)
  }, [entries])

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans">
      <header className="sticky top-0 z-10 border-b border-[#222] bg-[#0a0a0a] px-4 py-3 flex items-center justify-between">
        <Link href="/" className="font-mono text-sm font-bold text-green-500 hover:text-green-400 flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          AGENT_VERSE
        </Link>
        <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500">
          <Sparkles size={12} className="text-purple-400" /> x402 SERVICE MARKET
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <h1 className="text-xl font-bold font-mono mb-1">AgentVerse x402 服务索引</h1>
        <p className="text-gray-500 text-xs mb-4">
          格子主人挂的 x402 付费服务索引。人看这页，AI 看{' '}
          <a href="/api/services" target="_blank" rel="noopener noreferrer" className="text-green-500 hover:underline">
            /api/services
          </a>
          。{' '}
          <Link href="/about" className="text-green-500 hover:underline">
            说明
          </Link>
        </p>
        <ul data-testid="status-legend" className="text-gray-500 text-[11px] font-mono mb-4 space-y-0.5">
          <li><span className="text-green-400">CAN PAY</span> — 这个网址刚被只读探测过：返回了合法的 x402 v2 402（没有付款），在所列网络上收 USDC。</li>
          <li><span className="text-red-400">FAILED</span> — 探测没有拿到这样的 402。</li>
          <li><span className="text-gray-400">UNCHECKED</span> — POST 接口需要 body，我们不探测；或还没探测过。</li>
        </ul>

        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="search name / description / url"
              className="w-full pl-7 pr-2 py-1.5 rounded border border-[#333] bg-[#0a0a0a] text-xs font-mono text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-green-600"
            />
          </div>
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value)}
            className="px-2 py-1.5 rounded border border-[#333] bg-[#0a0a0a] text-xs font-mono text-gray-300"
          >
            <option value="">all networks</option>
            <option value="eip155:8453">Base</option>
            <option value="eip155:143">Monad</option>
          </select>
          <input
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="max $"
            type="number"
            step="0.01"
            className="w-24 px-2 py-1.5 rounded border border-[#333] bg-[#0a0a0a] text-xs font-mono text-gray-200 placeholder:text-gray-600"
          />
          {categories.length > 0 && (
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-2 py-1.5 rounded border border-[#333] bg-[#0a0a0a] text-xs font-mono text-gray-300"
            >
              <option value="">all categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>

        {loading && <p className="text-gray-500 text-xs font-mono">loading…</p>}
        {error && <p className="text-red-400 text-xs font-mono">error: {error}</p>}
        {!loading && !error && entries.length === 0 && (
          <p data-testid="market-empty" className="text-gray-500 text-xs font-mono">
            {q || network || maxPrice || category
              ? 'no services matched.'
              : '还没有格子主人挂服务。买一个格子，让你的 AI 在装修时填上 service_url，就会出现在这里。'}
          </p>
        )}

        <div className="space-y-2">
          {entries.map((e) => (
            <EntryCard key={`${e.source}:${e.url}:${e.cell?.x ?? ''},${e.cell?.y ?? ''}`} e={e} />
          ))}
        </div>
      </div>
    </div>
  )
}
