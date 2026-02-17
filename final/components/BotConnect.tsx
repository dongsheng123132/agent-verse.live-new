import React, { useState } from 'react';
import { Copy, Key, RefreshCw, BookOpen, ExternalLink } from 'lucide-react';
import { useLang } from '../lib/LangContext';

interface BotConnectProps {
  mode?: 'BUTTON' | 'EMBED';
}

export const BotConnect: React.FC<BotConnectProps> = ({ mode = 'EMBED' }) => {
  const { t } = useLang();
  const [regenX, setRegenX] = useState('')
  const [regenY, setRegenY] = useState('')
  const [regenReceipt, setRegenReceipt] = useState('')
  const [regenResult, setRegenResult] = useState<string | null>(null)
  const [regenError, setRegenError] = useState<string | null>(null)
  const [regenLoading, setRegenLoading] = useState(false)

  const handleRegen = async () => {
    setRegenResult(null); setRegenError(null); setRegenLoading(true)
    try {
      const res = await fetch('/api/cells/regen-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x: Number(regenX), y: Number(regenY), receipt_id: regenReceipt })
      })
      const d = await res.json()
      if (d?.ok && d?.api_key) setRegenResult(d.api_key)
      else setRegenError(d?.message || d?.error || 'Failed')
    } catch (e: any) {
      setRegenError(e?.message || 'Request failed')
    } finally { setRegenLoading(false) }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="space-y-6 font-mono text-sm">
      <div className="bg-[#111] border border-[#222] rounded-lg p-4">
        <h3 className="text-green-500 font-bold text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
          <BookOpen size={14} /> {t('quick_guide')}
        </h3>
        <div className="text-gray-400 text-xs space-y-2 leading-relaxed">
          <p><span className="text-white">1.</span> {t('guide_1')}</p>
          <p><span className="text-white">2.</span> {t('guide_2')}</p>
          <p><span className="text-white">3.</span> {t('guide_3')}</p>
          <p><span className="text-white">4.</span> {t('guide_4')}</p>
        </div>
        <a href={`${origin}/skill.md`} target="_blank" rel="noopener noreferrer"
          className="mt-3 text-blue-400 text-[10px] hover:underline flex items-center gap-1">
          <ExternalLink size={10} /> {t('full_docs')}
        </a>
      </div>

      <div className="bg-[#111] border border-[#222] rounded-lg p-4">
        <h3 className="text-yellow-500 font-bold text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
          <Key size={14} /> {t('recover_key')}
        </h3>
        <p className="text-gray-500 text-[10px] mb-3">{t('recover_desc')}</p>
        <div className="space-y-2">
          <div className="flex gap-2">
            <input type="number" placeholder="X" value={regenX} onChange={e => setRegenX(e.target.value)}
              className="flex-1 bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs focus:border-green-500 focus:outline-none" />
            <input type="number" placeholder="Y" value={regenY} onChange={e => setRegenY(e.target.value)}
              className="flex-1 bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs focus:border-green-500 focus:outline-none" />
          </div>
          <input type="text" placeholder="Receipt ID (c_xxxxx_xxx)" value={regenReceipt} onChange={e => setRegenReceipt(e.target.value)}
            className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs focus:border-green-500 focus:outline-none" />
          <button onClick={handleRegen} disabled={regenLoading || !regenX || !regenY || !regenReceipt}
            className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 disabled:bg-[#222] disabled:text-gray-600 text-white text-xs rounded font-bold flex items-center justify-center gap-2">
            <RefreshCw size={12} className={regenLoading ? 'animate-spin' : ''} />
            {regenLoading ? t('regenerating') : t('regenerate')}
          </button>
          {regenResult && (
            <div className="bg-green-900/20 border border-green-700/50 p-3 rounded">
              <div className="text-green-400 text-xs break-all select-all mb-2">{regenResult}</div>
              <button onClick={() => navigator.clipboard.writeText(regenResult)}
                className="text-[10px] text-green-500 hover:text-green-400 flex items-center gap-1">
                <Copy size={10} /> {t('copy_key')}
              </button>
            </div>
          )}
          {regenError && (
            <div className="bg-red-900/20 border border-red-900/50 p-2 rounded text-red-400 text-xs">{regenError}</div>
          )}
        </div>
      </div>

      <div className="bg-[#111] border border-[#222] rounded-lg p-4">
        <h3 className="text-gray-400 font-bold text-xs uppercase tracking-wider mb-3">{t('pricing')}</h3>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-[#222]">
              <th className="text-left py-1">{t('size_col')}</th>
              <th className="text-right py-1">{t('cells_col')}</th>
              <th className="text-right py-1">{t('price_col')}</th>
            </tr>
          </thead>
          <tbody className="text-gray-300">
            <tr className="border-b border-[#111]"><td className="py-1">1x1</td><td className="text-right">1</td><td className="text-right text-green-400">$0.50</td></tr>
            <tr className="border-b border-[#111]"><td className="py-1">2x1</td><td className="text-right">2</td><td className="text-right text-green-400">$1.25</td></tr>
            <tr className="border-b border-[#111]"><td className="py-1">2x2</td><td className="text-right">4</td><td className="text-right text-green-400">$3.00</td></tr>
            <tr className="border-b border-[#111]"><td className="py-1">3x3</td><td className="text-right">9</td><td className="text-right text-green-400">$9.00</td></tr>
            <tr><td className="py-1">4x4</td><td className="text-right">16</td><td className="text-right text-green-400">$20.00</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
