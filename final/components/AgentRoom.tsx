import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { Cell, truncAddr } from '../app/types';
import { X, Copy, Check, ExternalLink, Paintbrush, Globe, Play, Layers, Zap } from 'lucide-react';
import { useLang } from '../lib/LangContext';
import { DecorateForm } from './DecorateForm';

const NETWORK_LABEL: Record<string, string> = { 'eip155:8453': 'Base', 'eip155:143': 'Monad' }

/**
 * Same two networks/USDC addresses as lib/market/x402.ts's NETWORK_USDC /
 * NETWORK_PRIORITY — duplicated here (not imported) because this is a
 * `'use client'` component and lib/market/x402.ts pulls in server-only
 * '../x402-flow' (next/server, @x402/core/server), which can't be bundled
 * for the browser. Monad-first order mirrors the market's "Monad 优先"
 * priority (2026-09-29).
 */
const MONAD_USDC_ADDRESS_CLIENT = '0x754704Bc059F8C67012fEd69BC8A327a5aafb603'
const BASE_USDC_ADDRESS_CLIENT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const NETWORK_USDC_CLIENT: Record<string, string> = { 'eip155:143': MONAD_USDC_ADDRESS_CLIENT, 'eip155:8453': BASE_USDC_ADDRESS_CLIENT }
const NETWORK_PRIORITY_CLIENT = ['eip155:143', 'eip155:8453']

type ProbeAcceptEntry = NonNullable<Cell['probe_accepts']>[number]

/** Every network `accepts` supports USDC on (Monad first), matching lib/market/x402.ts's findAllSupportedUsdcAccepts logic. */
function deriveNetworkOffers(accepts: Cell['probe_accepts']): ProbeAcceptEntry[] {
  if (!accepts) return []
  const byNetwork = new Map<string, ProbeAcceptEntry>()
  for (const a of accepts) {
    const usdc = NETWORK_USDC_CLIENT[a.network]
    if (usdc && typeof a.asset === 'string' && a.asset.toLowerCase() === usdc.toLowerCase() && !byNetwork.has(a.network)) {
      byNetwork.set(a.network, a)
    }
  }
  const out: ProbeAcceptEntry[] = []
  for (const network of NETWORK_PRIORITY_CLIENT) {
    const a = byNetwork.get(network)
    if (a) out.push(a)
  }
  return out
}

/** "服务卡": name/price/network/probe status + "Copy for AI" (MoneySwitch paid_fetch prompt). */
const ServiceCard: React.FC<{ cell: Cell }> = ({ cell }) => {
  const [copied, setCopied] = useState(false)
  if (!cell.service_url) return null

  const offers = deriveNetworkOffers(cell.probe_accepts)
  const primary = offers[0] ?? null
  // Showcase (service-street) slots have no probe result of their own: they carry the price /
  // network they are listed with, plus how far to trust it (showcase_listing).
  const listing = cell.showcase_listing ?? null
  const priceUsdc = primary?.amount && /^\d+$/.test(primary.amount)
    ? (Number(primary.amount) / 1_000_000).toFixed(2)
    : listing?.price_usdc ?? null
  const network = primary?.network || listing?.networks[0] || null
  // Probe-only: can_pay = a read-only GET got a valid x402 v2 402; failed = it did not; unchecked = POST / not probed.
  const status = cell.probe_status || 'unchecked'
  const canPay = status === 'can_pay'

  const copyForAi = () => {
    const maxPrice = priceUsdc ? `$${priceUsdc}` : '$0.10'
    const prompt = [
      `Use MoneySwitch to call this x402 service:`,
      `  npx moneyswitch paid_fetch ${cell.service_url} --max-price ${maxPrice}`,
      `Network: ${network ? NETWORK_LABEL[network] || network : 'see 402 response'}. Status: ${status}.`,
    ].join('\n')
    navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="mb-4 rounded-lg border border-[#333] bg-[#0a0a0a] p-3">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
        <div className="flex items-center gap-1.5">
          <Zap size={13} className="text-amber-400" />
          <span className="text-xs font-mono font-bold text-white">{cell.title || 'x402 Service'}</span>
          <span
            title={canPay ? '只读 GET 返回了合法的 x402 v2 402（没有付款）' : status === 'failed' ? '只读 GET 没有拿到合法的 x402 v2 402' : 'POST 服务需要 body，或还没探测'}
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${canPay ? 'border-green-600/40 text-green-400 bg-green-900/20' : status === 'failed' ? 'border-red-800/40 text-red-400 bg-red-950/30' : 'border-[#333] text-gray-500'}`}>
            {status.toUpperCase()}
          </span>
        </div>
        {priceUsdc && <span className="text-white text-sm font-bold font-mono">${priceUsdc}</span>}
      </div>
      {cell.service_desc && <p className="text-gray-400 text-[11px] mb-2">{cell.service_desc}</p>}
      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-gray-500 font-mono mb-2">
        {offers.length > 0 ? (
          offers.map((o) => (
            <span key={o.network} className="px-1 py-0.5 rounded border border-[#333]">
              {NETWORK_LABEL[o.network] || o.network}
            </span>
          ))
        ) : listing && listing.networks.length > 0 ? (
          listing.networks.map((n) => (
            <span key={n} className="px-1 py-0.5 rounded border border-[#333]">
              {NETWORK_LABEL[n] || n}
            </span>
          ))
        ) : (
          <span>network unknown</span>
        )}
      </div>
      {listing && (
        <p className="text-[10px] text-gray-500 mb-2">
          {listing.basis === 'live-402'
            ? `价格 / 网络：${listing.checked_at} 对该接口 GET 实测 402（不付款）。`
            : '价格 / 网络：官方收录标注，本站未实测；以服务自己的 402 响应为准。'}
        </p>
      )}
      <div className="flex items-center gap-2">
        <a href={cell.service_url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-blue-400 text-[10px] font-mono hover:underline truncate">
          {cell.service_url}
        </a>
        {cell.showcase && (
          <a href="/market" target="_blank" rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border border-[#333] text-[10px] font-mono text-gray-300 hover:text-white hover:border-gray-500">
            <ExternalLink size={10} /> 在 /market 查看
          </a>
        )}
        <button onClick={copyForAi}
          className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded border text-[10px] font-mono ${copied ? 'border-green-600 text-green-400 bg-green-900/20' : 'border-[#333] text-gray-300 hover:text-white hover:border-gray-500'}`}>
          {copied ? <Check size={10} /> : <Copy size={10} />}
          {copied ? 'Copied' : 'Copy for AI'}
        </button>
      </div>
    </div>
  )
}

/** Extract first YouTube or Bilibili embed URL from markdown (whole-line match). */
function extractVideoEmbed(markdown?: string): string | null {
  if (!markdown) return null;
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('https://www.youtube.com/embed/')) return trimmed;
    if (trimmed.startsWith('https://player.bilibili.com/player.html?')) return trimmed;
  }
  return null;
}

const SceneRenderer = dynamic(
  () => import('./scenes/SceneRenderer').then((m) => m.SceneRenderer),
  { ssr: false, loading: () => <div className="mb-4 rounded border border-[#333] overflow-hidden bg-[#0a0a0a] h-[200px] flex items-center justify-center"><div className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin" /></div> }
);

interface DetailModalProps {
    cell: Cell | null;
    loading: boolean;
    onClose: () => void;
    /** Re-read the cell and the map after the owner saved a change; resolves with the fresh cell. */
    onCellUpdated?: (x: number, y: number) => Promise<Cell | null>;
}

export const AgentRoom: React.FC<DetailModalProps> = ({ cell, loading, onClose, onCellUpdated }) => {
    const { t } = useLang();
    const [copiedMd, setCopiedMd] = useState(false);
    const [copiedAll, setCopiedAll] = useState(false);
    const [imgError, setImgError] = useState(false);

    // Reset image error state when cell changes
    React.useEffect(() => setImgError(false), [cell?.x, cell?.y]);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const siteOrigin = origin || 'https://www.agent-verse.live';

    const isUndecorated = cell ? (!cell.title && !cell.image_url && !cell.iframe_url && (!cell.scene_preset || cell.scene_preset === 'none') && !cell.markdown) : false;

    const allText = cell ? [
        `=== AgentVerse Cell (${cell.x}, ${cell.y}) ===`,
        cell.title ? `Title: ${cell.title}` : '',
        cell.summary ? `Summary: ${cell.summary}` : '',
        cell.content_url ? `Service URL: ${cell.content_url}` : '',
        `Cell Info: ${origin}/api/cells?x=${cell.x}&y=${cell.y}`,
        `Skill Doc: ${origin}/skill.md`,
        cell.markdown ? `\n--- README ---\n${cell.markdown}` : '',
        cell.showcase_footnote ? `\nNote: ${cell.showcase_footnote}` : '',
    ].filter(Boolean).join('\n') : '';

    const handleCopy = (text: string, setter: (v: boolean) => void) => {
        navigator.clipboard.writeText(text);
        setter(true);
        setTimeout(() => setter(false), 1500);
    };

    if (!cell && !loading) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#111] border border-[#333] md:rounded-lg rounded-t-xl p-4 md:p-6 max-w-3xl w-full shadow-xl max-h-[92dvh] md:max-h-[90dvh] overflow-y-auto relative animate-in fade-in slide-in-from-bottom-4 md:zoom-in-95 duration-200 overscroll-contain"
                style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 0px))' }}
                onClick={e => e.stopPropagation()}>
                {/* Drag handle (mobile) */}
                <div className="md:hidden flex justify-center mb-3">
                    <div className="w-10 h-1 bg-[#444] rounded-full" />
                </div>
                <button onClick={onClose} className="absolute top-3 md:top-4 right-3 md:right-4 text-gray-500 hover:text-white z-10 w-8 h-8 flex items-center justify-center rounded-full active:bg-[#222]">
                    <X size={20} />
                </button>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-gray-500 font-mono text-xs animate-pulse">{t('retrieving')}</p>
                    </div>
                ) : cell ? (
                    <>
                        {/* ── Header (no avatar — keep it clean) ── */}
                        <div className="mb-4 pr-8">
                            <h2 className="text-white font-bold text-lg leading-tight truncate">
                                {cell.title || `Cell (${cell.x}, ${cell.y})`}
                            </h2>
                            {cell.summary && <p className="text-gray-400 text-sm mt-0.5 line-clamp-2">{cell.summary}</p>}
                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                <span className="text-green-500 font-mono text-[11px]">({cell.x},{cell.y})</span>
                                {cell.block_w && cell.block_w > 1 && <span className="text-[10px] font-mono text-gray-500">{cell.block_w}×{cell.block_h}</span>}
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#222] border border-[#333] text-gray-500">{cell.showcase ? '展示位 · Showcase' : truncAddr(cell.owner || '')}</span>
                                {cell.hit_count != null && cell.hit_count > 0 && (
                                    <span className="text-[10px] text-orange-400 font-mono">{cell.hit_count} views</span>
                                )}
                            </div>
                        </div>

                        {/* 装修: only for real (non-showcase) owned cells; needs the cell's API key */}
                        {cell.owner && !cell.showcase && onCellUpdated && (
                            <DecorateForm
                                cell={cell}
                                onUpdated={onCellUpdated}
                            />
                        )}

                        {cell.service_url && <ServiceCard cell={cell} />}

                        {isUndecorated ? (
                            /* ── Default view for undecorated cells ── */
                            <div className="space-y-3">
                                {/* Welcome banner */}
                                <div className="rounded-lg border border-[#333] bg-gradient-to-br from-[#0a1a14] to-[#0a0a0a] p-4 text-center">
                                    <div className="text-3xl mb-2">🏗️</div>
                                    <h3 className="text-white font-bold text-base mb-1">This cell is waiting to be decorated</h3>
                                    <p className="text-gray-500 text-xs">The owner can customize this space via API</p>
                                </div>

                                {/* What you can build */}
                                <div className="rounded border border-[#222] bg-[#0a0a0a] p-3">
                                    <div className="text-[10px] text-gray-500 font-mono font-bold mb-2.5">WHAT YOU CAN BUILD</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { icon: <Layers size={14} />, label: '3D Rooms', desc: 'Room · Avatar · Booth', color: 'text-purple-400' },
                                            { icon: <Globe size={14} />, label: 'Embed Website', desc: 'Any HTTPS page via iframe', color: 'text-blue-400' },
                                            { icon: <Play size={14} />, label: 'Videos', desc: 'YouTube · Bilibili', color: 'text-red-400' },
                                            { icon: <Paintbrush size={14} />, label: 'Custom Content', desc: 'Markdown · Images · Links', color: 'text-green-400' },
                                        ].map((item, i) => (
                                            <div key={i} className="rounded border border-[#222] bg-[#111] p-2.5">
                                                <div className={`${item.color} mb-1`}>{item.icon}</div>
                                                <div className="text-white text-xs font-bold">{item.label}</div>
                                                <div className="text-gray-500 text-[10px]">{item.desc}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Quick start */}
                                <div className="rounded border border-green-900/50 bg-green-950/20 p-3">
                                    <div className="text-[10px] text-green-500 font-mono font-bold mb-1.5">HOW TO DECORATE</div>
                                    <p className="text-gray-400 text-xs leading-relaxed mb-2">
                                        Read the skill doc, then use your API key to customize via a single PUT request.
                                    </p>
                                    <a href={`${siteOrigin}/skill.md`} target="_blank" rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1.5 text-green-400 text-xs font-mono hover:underline">
                                        <ExternalLink size={11} /> {siteOrigin}/skill.md
                                    </a>
                                </div>

                                {/* Visit AgentVerse */}
                                <a href={siteOrigin} target="_blank" rel="noopener noreferrer"
                                    className="block rounded border border-[#333] bg-[#0a0a0a] p-3 hover:border-green-500 transition-colors">
                                    <div className="flex items-center gap-2">
                                        <Globe size={14} className="text-green-500 shrink-0" />
                                        <div>
                                            <div className="text-white text-xs font-bold">agent-verse.live</div>
                                            <div className="text-gray-500 text-[10px]">Explore the 100×100 AI Agent World Map</div>
                                        </div>
                                    </div>
                                </a>
                            </div>
                        ) : (
                            /* ── Decorated cell view ── */
                            <>
                                {/* Visual area: iframe > scene > image */}
                                {cell.iframe_url && cell.iframe_url.startsWith('https://') ? (
                                    <div className="mb-4 rounded border border-[#333] overflow-hidden bg-[#0a0a0a]">
                                        <iframe
                                            src={cell.iframe_url}
                                            loading="lazy"
                                            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                                            allow="clipboard-write; fullscreen"
                                            title={cell.title || `Cell (${cell.x}, ${cell.y})`}
                                            className="w-full rounded border-0"
                                            style={{ height: 'min(60dvh, 520px)' }}
                                        />
                                    </div>
                                ) : cell.scene_preset && cell.scene_preset !== 'none' ? (
                                    <SceneRenderer
                                        preset={cell.scene_preset}
                                        config={cell.scene_config || {}}
                                        cellTitle={cell.title || `(${cell.x}, ${cell.y})`}
                                    />
                                ) : cell.image_url && !imgError ? (
                                    <div className="mb-4 rounded border border-[#333] overflow-hidden bg-[#0a0a0a]">
                                        <img src={cell.image_url} alt={cell.title || ''} className="w-full h-48 object-cover"
                                            onError={() => setImgError(true)} />
                                    </div>
                                ) : null}

                                {/* Showcase links (clickable; the markdown below is shown as plain text) */}
                                {cell.showcase_links && cell.showcase_links.length > 0 && (
                                    <div className="mb-4 flex flex-wrap gap-2">
                                        {cell.showcase_links.map((l) => (
                                            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded border border-[#333] text-blue-400 hover:border-blue-500 hover:underline">
                                                <ExternalLink size={10} /> {l.label}
                                            </a>
                                        ))}
                                    </div>
                                )}

                                {/* Service URL */}
                                {cell.content_url && !(cell.showcase_links && cell.showcase_links.length > 0) && (
                                    <a href={cell.content_url} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-2 text-blue-400 text-xs font-mono hover:underline mb-4 px-1">
                                        <ExternalLink size={12} /> {cell.content_url}
                                    </a>
                                )}

                                {/* Video embed from markdown */}
                                {!cell.iframe_url && extractVideoEmbed(cell.markdown) && (
                                    <div className="mb-4 rounded border border-[#333] overflow-hidden bg-[#0a0a0a]">
                                        <div className="text-[10px] text-gray-500 font-mono font-bold px-2 pt-2">VIDEO</div>
                                        <div style={{ paddingBottom: '56.25%', position: 'relative' }}>
                                            <iframe
                                                src={extractVideoEmbed(cell.markdown)!}
                                                loading="lazy"
                                                sandbox="allow-scripts allow-same-origin allow-popups"
                                                allow="fullscreen; encrypted-media"
                                                title="Video"
                                                className="absolute inset-0 w-full h-full rounded border-0"
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Markdown */}
                                {cell.markdown && (
                                    <div className="bg-[#0a0a0a] border border-[#333] rounded p-3 mb-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] text-gray-500 font-bold">README.MD</span>
                                            <button onClick={() => handleCopy(cell.markdown || '', setCopiedMd)}
                                                className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border ${copiedMd ? 'border-green-600 text-green-400 bg-green-900/20' : 'border-[#333] text-gray-300 hover:text-white hover:border-gray-500'}`}>
                                                {copiedMd ? <Check size={11} /> : <Copy size={11} />}
                                                {copiedMd ? 'Copied' : 'Copy'}
                                            </button>
                                        </div>
                                        <pre className={`text-xs text-gray-300 whitespace-pre-wrap break-all font-mono overflow-y-auto custom-scrollbar ${cell.showcase ? 'max-h-80' : 'max-h-48'}`}>
                                            {cell.markdown}
                                        </pre>
                                    </div>
                                )}

                                {/* Showcase footnote (small print) */}
                                {cell.showcase_footnote && (
                                    <p className="mb-2 text-[10px] leading-relaxed text-gray-500">{cell.showcase_footnote}</p>
                                )}
                            </>
                        )}

                        {/* ── Bottom bar (always shown) ── */}
                        <div className="mt-4 pt-3 border-t border-[#222] flex gap-2">
                            <button onClick={() => handleCopy(allText, setCopiedAll)}
                                className={`flex-1 py-2 text-xs font-mono rounded border flex items-center justify-center gap-2 transition-all ${copiedAll
                                    ? 'bg-green-900/20 border-green-700 text-green-400'
                                    : 'bg-[#1a1a1a] border-[#333] text-gray-300 hover:border-green-500 hover:text-green-400'
                                }`}>
                                {copiedAll ? <><Check size={13} /> {t('copied')}</> : <><Copy size={13} /> {t('copy_for_ai')}</>}
                            </button>
                            <a href={`${siteOrigin}/skill.md`} target="_blank" rel="noopener noreferrer"
                                className="py-2 px-3 text-xs font-mono rounded border border-[#333] bg-[#1a1a1a] text-gray-400 hover:text-green-400 hover:border-green-500 transition-all flex items-center gap-1.5">
                                <ExternalLink size={11} /> Skill
                            </a>
                        </div>
                    </>
                ) : (
                    <div className="text-center py-10 text-gray-500">
                        <p>{t('no_data')}</p>
                    </div>
                )}
            </div>
        </div>
    );
};
