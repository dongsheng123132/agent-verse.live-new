'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Copy, Check, ExternalLink, Sparkles, ChevronDown, ChevronRight } from 'lucide-react'

/** 区块数 + 换算成人类可读时长（如"约 6.7 小时"）——见 lib/market/rpc.ts humanizeWindowBlocks。 */
interface EvidenceWindow {
  blocks: number
  human: string
}

/**
 * 2026-09-30 诚实标注修复：证据现在带 network（在哪条链上查的）和 window
 * （多长窗口，人类可读），字段也从 payers_7d/transfers_7d 改名成 payers/
 * transfers——这是一条"收款钱包级"证据（同一收款地址下的所有接口共享这一份），
 * 不是"这个接口自己的"证据，见下面 evidence 展示处的小字说明。
 */
interface MarketEvidence {
  network: string
  payers: number
  transfers: number
  last_tx: string | null
  last_at: string | null
  source: 'hypersync' | 'rpc-short-window'
  window: EvidenceWindow
}

interface MarketNetworkOffer {
  network: string
  price_usdc: string | null
  payTo: string | null
  asset: string | null
}

type MarketStatus = 'verified' | 'candidate' | 'failed' | 'unprobed'

interface MarketEntry {
  name: string
  url: string
  method: string
  description: string | null
  category: string | null
  network: string | null
  price_usdc: string | null
  pay_to: string | null
  /** Every network this service accepts USDC on (Monad first). */
  networks: MarketNetworkOffer[] | null
  /** "主状态"——筛了 network 时，这是那条网络自己的状态，不是"任一网络最好的那条"了。 */
  status: MarketStatus
  /** 每条受支持网络各自的状态。 */
  status_by_network: Record<string, MarketStatus> | null
  /** 筛了 network 且该网络状态不如整体最好状态时，人话解释是哪条网络撑起来的，如"Monad 候选 · Base 已验证"。 */
  status_label: string | null
  evidence: MarketEvidence | null
  /** 每条受支持网络各自的证据。 */
  evidence_by_network: Record<string, MarketEvidence> | null
  source: 'official' | 'listing'
  origin: 'seed' | 'bazaar' | null
  cell: { x: number; y: number } | null
  probed_at: string | null
  note: string
  /** 分组 key："network:payTo"（同一收款地址）或 "origin:host"。 */
  seller_id: string
}

/** 一个卖家（收款方）+ 它挂的所有接口——见 lib/market/market.ts groupSellers()。 */
interface MarketSellerGroup {
  seller_id: string
  network: string | null
  pay_to: string | null
  origin_host: string | null
  service_count: number
  status: MarketStatus
  services: MarketEntry[]
}

const NETWORK_LABEL: Record<string, string> = { 'eip155:8453': 'Base', 'eip155:143': 'Monad' }

function statusBadge(status: MarketStatus, label?: string | null) {
  const text = label || status.toUpperCase()
  switch (status) {
    case 'verified':
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-purple-900/40 border border-purple-500/50 text-purple-300">{text}</span>
    case 'candidate':
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-900/30 border border-amber-600/40 text-amber-400">{text}</span>
    case 'failed':
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-950/40 border border-red-800/40 text-red-400">{text}</span>
    default:
      return <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1a1a1a] border border-[#333] text-gray-500">{text}</span>
  }
}

/** 收款方级证据说明的小字——「同一收款地址下的所有接口共享这一证据」。 */
function evidenceLine(evidence: MarketEvidence): string {
  const net = NETWORK_LABEL[evidence.network] || evidence.network
  return `收款方近${evidence.window.human}内有 ${evidence.payers} 个付款人 / ${evidence.transfers} 笔转账（网络：${net}，来源：${evidence.source}）`
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

/**
 * 一个接口的卡片。`network` 是当前筛选的网络（可能是 ''）：筛了网络时优先显示
 * 那条网络自己的证据（evidence_by_network[network]），不是"任一网络最好的那条"
 * （e.evidence）——否则 Monad 视图里还是会看到 Base 的付款人数字。
 */
function EntryCard({ e, network }: { e: MarketEntry; network: string }) {
  const focusedEvidence = (network && e.evidence_by_network?.[network]) || e.evidence
  return (
    <div className="rounded border border-[#222] bg-[#0a0a0a] p-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-bold text-white">{e.name}</span>
            {statusBadge(e.status, e.status_label)}
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
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#1a1a1a]">
        <div className="text-[10px] text-gray-500 font-mono" title="同一收款地址下的所有接口共享这一证据">
          {focusedEvidence ? evidenceLine(focusedEvidence) : 'no on-chain evidence yet'}
        </div>
        <CopyForAiButton entry={e} />
      </div>
    </div>
  )
}

/**
 * 一个卖家（收款方）分组卡：只有一个接口时直接展开显示（没什么可折叠的）；
 * 多个接口共享同一收款地址时（agent402 的 15 个工具是原型案例）先折叠成一行，
 * 点开才看到各个接口——避免看起来像 15 份独立证据。
 */
function SellerGroupCard({
  seller,
  network,
  isOpen,
  onToggle,
}: {
  seller: MarketSellerGroup
  network: string
  isOpen: boolean
  onToggle: () => void
}) {
  if (seller.service_count === 1) {
    return <EntryCard e={seller.services[0]} network={network} />
  }
  return (
    <div className="rounded border border-[#222] bg-[#0a0a0a]">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-2 p-3 text-left">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          {isOpen ? <ChevronDown size={12} className="text-gray-500 shrink-0" /> : <ChevronRight size={12} className="text-gray-500 shrink-0" />}
          <span
            className="font-mono text-sm font-bold text-white truncate"
            title="同一收款地址下的所有接口共享这一证据"
          >
            {seller.pay_to ? `收款方 ${seller.pay_to.slice(0, 6)}…${seller.pay_to.slice(-4)}` : seller.origin_host || 'seller'}
          </span>
          {statusBadge(seller.status)}
          <span className="text-[10px] font-mono text-gray-500 px-1.5 py-0.5 rounded border border-[#333]">{seller.service_count} 个接口共享这一证据</span>
        </div>
        {seller.network && <span className="text-[10px] text-gray-500 font-mono shrink-0">{NETWORK_LABEL[seller.network] || seller.network}</span>}
      </button>
      {isOpen && (
        <div className="space-y-2 px-3 pb-3">
          {seller.services.map((e) => (
            <EntryCard key={e.url} e={e} network={network} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function MarketPage() {
  const [entries, setEntries] = useState<MarketEntry[]>([])
  // 按收款方分组（lib/market/market.ts groupSellers()）——/market 列表按这个渲染，
  // 而不是直接 entries.map，避免「同一个卖家的 15 个接口看起来像 15 份独立证据」。
  const [sellers, setSellers] = useState<MarketSellerGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [network, setNetwork] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [category, setCategory] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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
            setSellers(data.sellers || [])
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

  const toggleExpanded = (sellerId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(sellerId)) next.delete(sellerId)
      else next.add(sellerId)
      return next
    })
  }

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
        {!loading && !error && sellers.length === 0 && <p className="text-gray-500 text-xs font-mono">no services matched.</p>}

        <div className="space-y-2">
          {sellers.map((s) => (
            <SellerGroupCard
              key={s.seller_id}
              seller={s}
              network={network}
              isOpen={expanded.has(s.seller_id)}
              onToggle={() => toggleExpanded(s.seller_id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
