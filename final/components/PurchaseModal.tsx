import React, { useState } from 'react';
import { BLOCK_SIZES } from '../app/types';
import { X, CreditCard, Box, Copy, Check } from 'lucide-react';
import { useLang } from '../lib/LangContext';

interface PurchaseModalProps {
    x: number;
    y: number;
    blockSize: { w: number; h: number; label: string; price: number };
    setBlockSize: (bs: any) => void;
    onPay: () => void;
    onClose: () => void;
    loading: boolean;
    error: string | null;
    hasConflict: boolean;
    checkConflict: (w: number, h: number) => boolean;
}

export const PurchaseModal: React.FC<PurchaseModalProps> = ({
    x, y, blockSize, setBlockSize, onPay, onClose, loading, error, hasConflict, checkConflict
}) => {
    const { t } = useLang();
    const [copied, setCopied] = useState(false);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const x402Cmd = `npx awal@latest x402 pay ${origin}/api/cells/purchase -X POST -d '{"x":${x},"y":${y}}'`;
    const aiPrompt = `Please help me buy a grid cell on AgentVerse. Run this command:\n\n${x402Cmd}\n\nAfter purchase, customize my cell using the API documented at:\n${origin}/skill.md`;

    const handleCopyForAI = () => {
        navigator.clipboard.writeText(aiPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#111] border border-[#333] rounded-lg p-5 max-w-sm w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
                    <X size={20} />
                </button>

                <h2 className="text-green-500 font-mono font-bold mb-4 text-lg flex items-center gap-2">
                    <Box size={20} />
                    {t('acquire_node')} ({x}, {y})
                </h2>

                <div className="mb-6">
                    <p className="text-gray-400 text-xs mb-2 font-mono uppercase tracking-wider">{t('select_config')}</p>
                    <div className="flex gap-2 flex-wrap">
                        {BLOCK_SIZES.map(bs => {
                            const active = bs.w === blockSize.w && bs.h === blockSize.h;
                            const conflict = checkConflict(bs.w, bs.h);
                            return (
                                <button key={bs.label} onClick={() => setBlockSize(bs)} disabled={conflict}
                                    className={`px-3 py-2 text-xs font-mono rounded border transition-all ${active
                                            ? 'border-green-500 bg-green-900/20 text-green-400 shadow-[0_0_10px_rgba(0,255,65,0.2)]'
                                            : conflict
                                                ? 'border-[#222] bg-[#111] text-gray-700 cursor-not-allowed line-through'
                                                : 'border-[#333] bg-[#1a1a1a] text-gray-300 hover:border-gray-500'
                                        }`}>
                                    {bs.label}
                                    <div className={active ? 'text-green-300 font-bold' : 'text-gray-500 mt-0.5'}>${bs.price}</div>
                                </button>
                            )
                        })}
                    </div>
                </div>

                <div className="bg-[#0a0a0a] border border-[#222] rounded p-4 mb-4">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-gray-400 text-xs font-mono">{t('total_cost')}</span>
                        <span className="text-white text-xl font-bold font-mono">${blockSize.price.toFixed(2)} USDC</span>
                    </div>
                    <div className="flex justify-between items-end">
                        <span className="text-gray-500 text-[10px] font-mono">{t('area_size')}</span>
                        <span className="text-green-500 text-xs font-mono">{blockSize.w * blockSize.h} {t('units')}</span>
                    </div>
                </div>

                {hasConflict && (
                    <div className="bg-red-900/20 border border-red-900/50 p-2 rounded mb-4 text-red-400 text-xs font-mono text-center">
                        {t('area_blocked')}
                    </div>
                )}

                {error && (
                    <div className="bg-red-900/20 border border-red-900/50 p-2 rounded mb-4 text-red-400 text-xs font-mono break-words">
                        ERROR: {error}
                    </div>
                )}

                <button type="button" disabled={loading || hasConflict} onClick={onPay}
                    className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-[#222] disabled:text-gray-600 text-white font-mono font-bold rounded mb-4 text-sm flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-green-900/20">
                    {loading ? (
                        <span className="animate-pulse">{t('processing')}</span>
                    ) : (
                        <><CreditCard size={16} /> {t('confirm_tx')}</>
                    )}
                </button>

                <div className="border-t border-[#222] pt-4">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-green-500 text-[10px] font-bold font-mono">{t('ai_payment')}</p>
                        <span className="text-[9px] bg-[#222] text-gray-500 px-1 rounded">{t('only_1x1')}</span>
                    </div>
                    <pre className="bg-[#050505] p-2 rounded border border-[#222] text-[9px] text-gray-500 overflow-x-auto whitespace-pre-wrap break-all font-mono select-all hover:border-gray-600 transition-colors mb-2">
                        {x402Cmd}
                    </pre>
                    <button onClick={handleCopyForAI}
                        className={`w-full py-1.5 text-[10px] font-mono rounded border flex items-center justify-center gap-1.5 transition-all ${
                            copied
                                ? 'bg-green-900/20 border-green-700 text-green-400'
                                : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-green-500 hover:text-green-400'
                        }`}>
                        {copied ? <><Check size={10} /> {t('copied')}</> : <><Copy size={10} /> {t('copy_for_ai')}</>}
                    </button>
                </div>
            </div>
        </div>
    );
};
