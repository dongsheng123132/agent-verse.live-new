'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Copy, Check, ExternalLink, Sparkles } from 'lucide-react'

interface MarketEvidence {
  payers_7d: number
  transfers_7d: number
  last_tx: string | null
  last_at: string | null
  source: 'hypersync' | 'rpc-short-window'
  window_blocks: number
}

interface MarketEntry {
  name: string
  url: string
  method: string
  description: string | null
  category: string | null
  network: string | null
  price_usdc: string | null
  pay_to: string | null
  status: 'verified' | 'candidate' | 'failed' | 'unprobed'
  evidence: MarketEvidence | null
  source: 'official' | 'listing'
  origin: 'seed' | 'bazaar' | null
  cell: { x: number; y: number } | null
  probed_at: string | null
  note: string
}

const NETWORK_LABEL: Record<string, string> = { 'eip155:8453': 'Base', 'eip155:143': 'Monad' }

function statusBadge(status: MarketEntry['status']) {
  switch (status) {
    case 'verified':
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-900/40 border border-purple-500/50 text-purple-300">VERIFIED</span>
    case 'candidate':
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-900/30 border border-amber-600/40 text-amber-400">CANDIDATE</span>
    case 'failed':
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-950/40 border border-red-800/40 text-red-400">FAILED</span>
    default:
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1a1a1a] border border-[#333] text-gray-500">UNPROBED</span>
  }
}

function buildPaidFetchPrompt(entry: MarketEntry, origin: string): string {
  const maxPrice = entry.price_usdc ? `$${entry.price_usdc}` : '$0.10'
  return [
    `Use MoneySwitch to call this x402 service:`,
    `  npx moneyswitch paid_fetch ${entry.url} --max-price ${maxPrice}`,
    entry.method === 'POST' ? `  (POST endpoint — check ${entry.url}'s own docs for the request body)` : '',
    `Network: ${entry.network ? NETWORK_LABEL[entry.network] || entry.network : 'see 402 response'}. Status: ${entry.status}.`,
    `Discovered via ${origin}/market.`,
  ]
    .filter(Boolean)
    .join('\n')
}

function CopyForAiButton({ entry }: { entry: MarketEntry }) {
  const [copied, setCopied] = useState(false)
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.agent-verse.live'
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(buildPaidFetchPrompt(entry, origin))
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
          if (data?.ok) setEntries(data.services || [])
          else setError(data?.message || 'failed to load')
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
        <h1 className="text-xl font-bold font-mono mb-1">Monad x402 Service Market</h1>
        <p className="text-gray-500 text-xs mb-4">
          官方收录 + 格子挂牌的 x402 付费服务索引。人看这页，AI 看{' '}
          <a href="/llms-services.txt" target="_blank" rel="noopener noreferrer" className="text-green-500 hover:underline">
            /llms-services.txt
          </a>{' '}
          或{' '}
          <a href="/api/services" target="_blank" rel="noopener noreferrer" className="text-green-500 hover:underline">
            /api/services
          </a>
          。
        </p>

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
        {!loading && !error && entries.length === 0 && <p className="text-gray-500 text-xs font-mono">no services matched.</p>}

        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.url} className="rounded border border-[#222] bg-[#0a0a0a] p-3">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-white">{e.name}</span>
                    {statusBadge(e.status)}
                    <span className="text-[10px] font-mono text-gray-500 px-1.5 py-0.5 rounded border border-[#333]">
                      {e.source === 'listing' ? `cell (${e.cell?.x},${e.cell?.y})` : e.origin || 'seed'}
                    </span>
                  </div>
                  {e.description && <p className="text-gray-400 text-xs mt-1">{e.description}</p>}
                  <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-[11px] font-mono hover:underline inline-flex items-center gap-1 mt-1 break-all">
                    <ExternalLink size={10} /> {e.url}
                  </a>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-white font-mono text-sm font-bold">{e.price_usdc ? `$${e.price_usdc}` : '—'}</div>
                  <div className="text-[10px] text-gray-500 font-mono">{e.network ? NETWORK_LABEL[e.network] || e.network : '—'}</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1a1a1a]">
                <div className="text-[10px] text-gray-500 font-mono">
                  {e.evidence
                    ? `${e.evidence.payers_7d} payers · ${e.evidence.transfers_7d} tx (${e.evidence.source})`
                    : 'no on-chain evidence yet'}
                </div>
                <CopyForAiButton entry={e} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
