import React, { useState } from 'react';
import { X, CreditCard, Box, Copy, Check } from 'lucide-react';
import { useLang } from '../lib/LangContext';
import { PRICE_PER_CELL } from '../app/types';

interface PurchaseModalProps {
    selectedCells: { x: number; y: number }[];
    onPay: () => void;
    onClose: () => void;
    loading: boolean;
    error: string | null;
    refCode?: string | null;
}

export const PurchaseModal: React.FC<PurchaseModalProps> = ({
    selectedCells,
    onPay,
    onClose,
    loading,
    error,
    refCode,
}) => {
    const { t } = useLang();
    const [copied, setCopied] = useState(false);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const count = selectedCells.length;
    const totalPrice = count * PRICE_PER_CELL;
    const minX = Math.min(...selectedCells.map(c => c.x));
    const maxX = Math.max(...selectedCells.map(c => c.x));
    const minY = Math.min(...selectedCells.map(c => c.y));
    const maxY = Math.max(...selectedCells.map(c => c.y));
    const rangeLabel = count === 1
        ? `(${selectedCells[0].x}, ${selectedCells[0].y})`
        : `(${minX},${minY}) → (${maxX},${maxY})`;
    const refPart = refCode ? `,"ref":"${refCode}"` : '';
    const x402Cmds = selectedCells.slice(0, 5).map(c =>
        `npx awal@latest x402 pay ${origin}/api/cells/purchase -X POST -d '{"x":${c.x},"y":${c.y}${refPart}}'`
    );
    const aiPrompt = count === 1
        ? `Buy a grid cell on AgentVerse:\n\n${x402Cmds[0]}\n\nAfter purchase, customize your cell:\n${origin}/skill.md`
        : `Buy ${count} grid cells on AgentVerse (use Coinbase Commerce on the site, or run x402 for each cell):\n\n${x402Cmds.join('\n\n')}\n\n${origin}/skill.md`;

    const handleCopyForAI = () => {
        navigator.clipboard.writeText(aiPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#111] border border-[#333] rounded-lg p-4 md:p-5 max-w-sm w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 max-h-[calc(100dvh-1.5rem)] md:max-h-[90dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
                    <X size={20} />
                </button>

                <h2 className="text-green-500 font-mono font-bold mb-4 text-lg flex items-center gap-2">
                    <Box size={20} />
                    {t('acquire_node')} — {count} {count === 1 ? 'cell' : 'cells'}
                </h2>

                <div className="text-gray-400 text-xs font-mono mb-2">
                    {rangeLabel}
                </div>

                <div className="bg-[#0a0a0a] border border-[#222] rounded p-4 mb-4">
                    <div className="flex justify-between items-end mb-2">
                        <span className="text-gray-400 text-xs font-mono">{t('total_cost')}</span>
                        <span className="text-white text-xl font-bold font-mono">${totalPrice.toFixed(2)} USDC</span>
                    </div>
                    <div className="flex justify-between items-end">
                        <span className="text-gray-500 text-[10px] font-mono">${PRICE_PER_CELL} × {count}</span>
                        <span className="text-green-500 text-xs font-mono">{count} {t('units')}</span>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-900/20 border border-red-900/50 p-2 rounded mb-4 text-red-400 text-xs font-mono break-words">
                        {error}
                    </div>
                )}

                <button
                    type="button"
                    disabled={loading}
                    onClick={onPay}
                    className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-[#222] disabled:text-gray-600 text-white font-mono font-bold rounded mb-4 text-sm flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-green-900/20"
                >
                    {loading ? (
                        <span className="animate-pulse">{t('processing')}</span>
                    ) : (
                        <><CreditCard size={16} /> {t('confirm_tx')}</>
                    )}
                </button>

                <div className="border-t border-[#222] pt-4">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-green-500 text-[10px] font-bold font-mono">{t('ai_payment')}</p>
                        {count > 1 && <span className="text-[9px] bg-[#222] text-gray-500 px-1 rounded">Multi-cell: use Commerce above</span>}
                    </div>
                    <pre className="bg-[#050505] p-2 rounded border border-[#222] text-[9px] text-gray-500 overflow-x-auto whitespace-pre-wrap break-all font-mono select-all hover:border-gray-600 transition-colors mb-2 max-h-36 overflow-y-auto">
                        {count === 1 ? x402Cmds[0] : x402Cmds.join('\n\n')}
                    </pre>
                    <button
                        onClick={handleCopyForAI}
                        className={`w-full py-1.5 text-[10px] font-mono rounded border flex items-center justify-center gap-1.5 transition-all ${copied ? 'bg-green-900/20 border-green-700 text-green-400' : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-green-500 hover:text-green-400'}`}
                    >
                        {copied ? <><Check size={10} /> {t('copied')}</> : <><Copy size={10} /> {t('copy_for_ai')}</>}
                    </button>
                </div>
            </div>
        </div>
    );
};
