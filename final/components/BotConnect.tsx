import React, { useState } from 'react';
import { Copy, Key, BookOpen, ExternalLink, Check } from 'lucide-react';
import { useLang } from '../lib/LangContext';
import { PRICE_PER_CELL } from '../app/types';

interface BotConnectProps {
  mode?: 'BUTTON' | 'EMBED';
}

export const BotConnect: React.FC<BotConnectProps> = ({ mode = 'EMBED' }) => {
  const { t } = useLang();
  const [regenCopied, setRegenCopied] = useState(false)

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
          <div className="bg-[#0a0a0a] border border-[#222] rounded p-2 mb-1">
            <p className="text-gray-600 text-[9px] uppercase mb-1">{t('recover_cmd_label')}</p>
            <pre className="text-[9px] text-yellow-400/80 font-mono whitespace-pre-wrap break-all select-all">
{`POST ${origin}/api/cells/regen-key
{"x":YOUR_X,"y":YOUR_Y}
# x402 client that can send a POST JSON body, paid from the cell owner's wallet`}
            </pre>
          </div>
          <p className="text-gray-600 text-[9px]">{t('recover_cost')}</p>
          <button onClick={() => {
            navigator.clipboard.writeText(`POST ${origin}/api/cells/regen-key\n{"x":0,"y":0}\n# x402 client that can send a POST JSON body, paid from the cell owner's wallet`)
            setRegenCopied(true); setTimeout(() => setRegenCopied(false), 2000)
          }}
            className={`w-full py-1.5 text-[10px] font-mono rounded border flex items-center justify-center gap-1.5 transition-all ${
              regenCopied ? 'bg-green-900/20 border-green-700 text-green-400' : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-yellow-500'
            }`}>
            {regenCopied ? <><Check size={10} /> {t('copied')}</> : <><Copy size={10} /> {t('recover_copy')}</>}
          </button>
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
            <tr>
                <td className="py-1">1×1</td>
                <td className="text-right">1</td>
                <td className="text-right text-green-400">${PRICE_PER_CELL.toFixed(2)}</td>
              </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
