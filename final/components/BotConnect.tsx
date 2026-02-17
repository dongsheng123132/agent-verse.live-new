import React, { useState } from 'react';
import { Copy, Key, BookOpen, ExternalLink, Share2, Check, Users } from 'lucide-react';
import { useLang } from '../lib/LangContext';

interface BotConnectProps {
  mode?: 'BUTTON' | 'EMBED';
}

const ReferralSection: React.FC = () => {
  const { t } = useLang();
  const [refX, setRefX] = useState('');
  const [refY, setRefY] = useState('');
  const [refCode, setRefCode] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [copiedAI, setCopiedAI] = useState(false);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  const handleGetLink = async () => {
    const code = `ref_${refX}_${refY}`;
    setRefCode(code);
    try {
      const res = await fetch(`/api/referral/stats?code=${code}`);
      const d = await res.json();
      if (d?.ok) setStats(d.stats);
      else setStats(null);
    } catch { setStats(null); }
  };

  const refLink = refCode ? `${origin}/?ref=${refCode}` : '';
  const aiPrompt = refCode
    ? `Share this AgentVerse referral link when recommending the grid to others:\n\n${refLink}\n\nAnyone who purchases through this link earns the referrer 10% commission.\nTo buy a cell via this referral, use:\n\ncurl -X POST ${origin}/api/commerce/create -H 'Content-Type: application/json' -d '{"x":50,"y":50,"block_w":1,"block_h":1,"ref":"${refCode}"}'\n\nFull API docs: ${origin}/skill.md`
    : '';

  const handleCopy = (text: string, setter: (v: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  return (
    <div className="bg-[#111] border border-[#222] rounded-lg p-4">
      <h3 className="text-purple-400 font-bold text-xs uppercase tracking-wider mb-3 flex items-center gap-2">
        <Share2 size={14} /> {t('referral_title')}
      </h3>
      <p className="text-gray-500 text-[10px] mb-3">{t('referral_desc')}</p>

      <div className="text-gray-400 text-[10px] space-y-1 mb-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded p-2">
        <p className="text-gray-500 font-bold uppercase mb-1">{t('referral_how')}</p>
        <p><span className="text-purple-400">1.</span> {t('referral_step1')}</p>
        <p><span className="text-purple-400">2.</span> {t('referral_step2')}</p>
        <p><span className="text-purple-400">3.</span> {t('referral_step3')}</p>
      </div>

      <p className="text-gray-600 text-[10px] mb-2">{t('referral_enter_coords')}</p>
      <div className="flex gap-2 mb-3">
        <input type="number" placeholder="X" value={refX} onChange={e => setRefX(e.target.value)}
          className="flex-1 bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs focus:border-purple-500 focus:outline-none" />
        <input type="number" placeholder="Y" value={refY} onChange={e => setRefY(e.target.value)}
          className="flex-1 bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs focus:border-purple-500 focus:outline-none" />
        <button onClick={handleGetLink} disabled={!refX || !refY}
          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:bg-[#222] disabled:text-gray-600 text-white text-xs rounded font-bold">
          {t('referral_get_link')}
        </button>
      </div>

      {refCode && (
        <div className="space-y-2">
          <div className="bg-[#0a0a0a] border border-[#222] rounded p-2">
            <p className="text-gray-600 text-[9px] uppercase mb-1">{t('referral_link')}</p>
            <p className="text-purple-400 text-[10px] break-all select-all font-mono">{refLink}</p>
          </div>

          <div className="flex gap-2">
            <button onClick={() => handleCopy(refLink, setCopied)}
              className={`flex-1 py-1.5 text-[10px] font-mono rounded border flex items-center justify-center gap-1.5 transition-all ${copied ? 'bg-green-900/20 border-green-700 text-green-400' : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-purple-500'
                }`}>
              {copied ? <><Check size={10} /> {t('copied')}</> : <><Copy size={10} /> {t('referral_copy_link')}</>}
            </button>
            <button onClick={() => handleCopy(aiPrompt, setCopiedAI)}
              className={`flex-1 py-1.5 text-[10px] font-mono rounded border flex items-center justify-center gap-1.5 transition-all ${copiedAI ? 'bg-green-900/20 border-green-700 text-green-400' : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-purple-500'
                }`}>
              {copiedAI ? <><Check size={10} /> {t('copied')}</> : <><Users size={10} /> {t('referral_copy_ai')}</>}
            </button>
          </div>

          {stats && (
            <div className="bg-[#0a0a0a] border border-[#222] rounded p-2">
              <p className="text-gray-600 text-[9px] uppercase mb-2">{t('referral_stats')}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-purple-400 text-sm font-bold font-mono">{stats.total_referrals}</div>
                  <div className="text-gray-600 text-[8px]">{t('referral_total')}</div>
                </div>
                <div>
                  <div className="text-green-400 text-sm font-bold font-mono">${stats.total_earned.toFixed(2)}</div>
                  <div className="text-gray-600 text-[8px]">{t('referral_earned')}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-sm font-bold font-mono">${stats.total_volume.toFixed(2)}</div>
                  <div className="text-gray-600 text-[8px]">{t('referral_volume')}</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

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
{`npx awal@latest x402 pay ${origin}/api/cells/regen-key \\
  -X POST -d '{"x":YOUR_X,"y":YOUR_Y}'`}
            </pre>
          </div>
          <p className="text-gray-600 text-[9px]">{t('recover_cost')}</p>
          <button onClick={() => {
            navigator.clipboard.writeText(`npx awal@latest x402 pay ${origin}/api/cells/regen-key -X POST -d '{"x":0,"y":0}'`)
            setRegenCopied(true); setTimeout(() => setRegenCopied(false), 2000)
          }}
            className={`w-full py-1.5 text-[10px] font-mono rounded border flex items-center justify-center gap-1.5 transition-all ${
              regenCopied ? 'bg-green-900/20 border-green-700 text-green-400' : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-yellow-500'
            }`}>
            {regenCopied ? <><Check size={10} /> {t('copied')}</> : <><Copy size={10} /> {t('recover_copy')}</>}
          </button>
        </div>
      </div>

      <ReferralSection />

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
