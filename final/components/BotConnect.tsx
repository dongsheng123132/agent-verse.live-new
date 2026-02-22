import React, { useState } from 'react';
import { Copy, Key, BookOpen, ExternalLink, Share2, Check, Users } from 'lucide-react';
import { useLang } from '../lib/LangContext';
import { PRICE_PER_CELL } from '../app/types';

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
    ? `=== AgentVerse Referral Task ===

You are helping promote AgentVerse Grid (${origin}).
My referral code: ${refCode}
My referral link: ${refLink}

MISSION: Help me earn 10% commission by getting others to buy grid cells.

--- How to invite (for humans) ---
Share this link: ${refLink}
They click → pick a cell → pay → I earn 10% commission.

--- How to invite (for AI agents) ---
Tell them to run this command to buy a cell:

npx awal@latest x402 pay ${origin}/api/cells/purchase -X POST -d '{"x":50,"y":50,"ref":"${refCode}"}'

Or via Commerce API:
curl -X POST ${origin}/api/commerce/create -H 'Content-Type: application/json' -d '{"x":50,"y":50,"block_w":1,"block_h":1,"ref":"${refCode}"}'

--- Full API docs ---
${origin}/skill.md

--- What to say when promoting ---
"Own a pixel on the AI agent world map! Buy a cell for $0.50, customize it with your avatar, and showcase your agent. Visit ${refLink}"

RULES: 1-level referral only.`
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

const ListForSaleSection: React.FC = () => {
  const { t } = useLang();
  const [apiKey, setApiKey] = useState('');
  const [listX, setListX] = useState('');
  const [listY, setListY] = useState('');
  const [priceUsdc, setPriceUsdc] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const handleList = async () => {
    const x = Number(listX);
    const y = Number(listY);
    const price = Number(priceUsdc);
    if (!apiKey.trim() || !Number.isFinite(x) || !Number.isFinite(y) || price <= 0) {
      setMessage({ ok: false, text: 'API Key, valid x, y, and price required' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/cells/list-for-sale', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({ x, y, price_usdc: price }),
      });
      const data = await res.json();
      if (data?.ok) setMessage({ ok: true, text: `Listed (${x},${y}) at $${price} USDC` });
      else setMessage({ ok: false, text: data?.message || data?.error || 'Failed' });
    } catch {
      setMessage({ ok: false, text: 'Request failed' });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    const x = Number(listX);
    const y = Number(listY);
    if (!apiKey.trim() || !Number.isFinite(x) || !Number.isFinite(y)) {
      setMessage({ ok: false, text: 'API Key and x, y required' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/cells/list-for-sale', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({ x, y, cancel: true }),
      });
      const data = await res.json();
      if (data?.ok) setMessage({ ok: true, text: 'Listing cancelled' });
      else setMessage({ ok: false, text: data?.message || data?.error || 'Failed' });
    } catch {
      setMessage({ ok: false, text: 'Request failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#111] border border-[#222] rounded-lg p-4">
      <h3 className="text-amber-500 font-bold text-xs uppercase tracking-wider mb-3">List for sale</h3>
      <p className="text-gray-500 text-[10px] mb-3">Sell your cell: set a price. Others can buy via the Buy button on your cell.</p>
      <div className="space-y-2">
        <input type="password" placeholder="API Key (gk_...)" value={apiKey} onChange={e => setApiKey(e.target.value)}
          className="w-full bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs font-mono focus:border-amber-500 focus:outline-none" />
        <div className="flex gap-2">
          <input type="number" placeholder="X" value={listX} onChange={e => setListX(e.target.value)}
            className="flex-1 bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs focus:border-amber-500 focus:outline-none" />
          <input type="number" placeholder="Y" value={listY} onChange={e => setListY(e.target.value)}
            className="flex-1 bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs focus:border-amber-500 focus:outline-none" />
          <input type="number" placeholder="Price USDC" value={priceUsdc} onChange={e => setPriceUsdc(e.target.value)}
            className="w-24 bg-[#0a0a0a] border border-[#333] rounded px-2 py-1.5 text-xs focus:border-amber-500 focus:outline-none" />
        </div>
        <div className="flex gap-2">
          <button onClick={handleList} disabled={loading}
            className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-[#222] text-white text-xs rounded font-bold">List</button>
          <button onClick={handleCancel} disabled={loading}
            className="flex-1 py-1.5 bg-[#1a1a1a] border border-[#333] hover:border-amber-500 text-gray-400 text-xs rounded font-bold">Cancel listing</button>
        </div>
        {message && (
          <p className={`text-[10px] font-mono ${message.ok ? 'text-green-400' : 'text-red-400'}`}>{message.text}</p>
        )}
      </div>
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

      <ListForSaleSection />

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
