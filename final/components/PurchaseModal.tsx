import React, { useMemo, useRef, useState } from 'react';
import { X, Box, Copy, Check, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import { useLang } from '../lib/LangContext';
import {
    AGENTVERSE_PAY_TO,
    DEFAULT_ORIGIN,
    EMPTY_DECORATE,
    MAX_BULK_CELLS,
    MONEYSWITCH_URL,
    buildAiPurchasePrompt,
    totalPriceUsdc,
    unitPriceUsdc,
    validateDecorateFields,
    type AiDecorateFields,
} from '../lib/ai-purchase-prompt';
import { PAY_NETWORKS } from '../lib/networks';

interface PurchaseModalProps {
    selectedCells: { x: number; y: number }[];
    onClose: () => void;
    refCode?: string | null;
    /**
     * "我让 AI 买完了": re-read the map and the selected cells so the person can review the result.
     * Resolves with how many of the selected cells now have an owner (null = could not tell).
     */
    onAiDone?: () => Promise<{ owned: number; total: number } | null>;
}

const FIELD = 'w-full bg-[#050505] border border-[#333] rounded px-2 py-1.5 text-xs font-mono text-gray-200 focus:border-green-500 focus:outline-none placeholder:text-gray-600';
const LABEL = 'block text-[10px] text-gray-500 font-mono mb-0.5';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export const PurchaseModal: React.FC<PurchaseModalProps> = ({
    selectedCells,
    onClose,
    refCode,
    onAiDone,
}) => {
    const { t } = useLang();
    // ---- AI-first purchase ----
    const [fields, setFields] = useState<AiDecorateFields>({ ...EMPTY_DECORATE });
    const [copied, setCopied] = useState(false);
    const [copyFailed, setCopyFailed] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [checking, setChecking] = useState(false);
    const [doneMsg, setDoneMsg] = useState<string | null>(null);
    // A text selection that starts inside the modal and ends on the backdrop must not close the modal.
    const downOnBackdrop = useRef(false);

    const origin = (typeof window !== 'undefined' && window.location.origin) || DEFAULT_ORIGIN;
    const count = selectedCells.length;
    const totalPrice = totalPriceUsdc(count);
    const minX = Math.min(...selectedCells.map(c => c.x));
    const maxX = Math.max(...selectedCells.map(c => c.x));
    const minY = Math.min(...selectedCells.map(c => c.y));
    const maxY = Math.max(...selectedCells.map(c => c.y));
    const rangeLabel = count === 1
        ? `(${selectedCells[0].x}, ${selectedCells[0].y})`
        : count <= 8
            ? selectedCells.map(c => `(${c.x},${c.y})`).join(' ')
            : `(${minX},${minY}) → (${maxX},${maxY})`;

    const aiPrompt = useMemo(
        () => buildAiPurchasePrompt({ origin, cells: selectedCells, decorate: fields, refCode }),
        [origin, selectedCells, fields, refCode]
    );
    const fieldErrors = validateDecorateFields(fields);
    const hasFieldErrors = Object.keys(fieldErrors).length > 0;
    const tooMany = count > MAX_BULK_CELLS;

    const setField = <K extends keyof AiDecorateFields>(k: K, v: AiDecorateFields[K]) => {
        setFields(prev => ({ ...prev, [k]: v }));
        setCopied(false);
    };

    const handleCopyForAI = async () => {
        if (hasFieldErrors || tooMany) return;
        try {
            await navigator.clipboard.writeText(aiPrompt);
            setCopied(true);
            setCopyFailed(false);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard blocked (insecure origin / permission): show the text so it can be selected by hand.
            setCopyFailed(true);
            setShowPreview(true);
        }
    };

    const handleAiDone = async () => {
        if (!onAiDone || checking) return;
        setChecking(true);
        setDoneMsg(null);
        try {
            const r = await onAiDone();
            if (!r) setDoneMsg('刷新失败，请检查网络后再点一次');
            else if (r.owned === 0) setDoneMsg('已刷新，但还没看到这些格子被买走——AI 可能还没付款，或付款还在确认中。稍后再点一次。');
            else if (r.owned < r.total) setDoneMsg(`已刷新：${r.total} 格里已有 ${r.owned} 格有主人。AI 可能还没买完，或有格子被别人先买走了。`);
        } catch {
            setDoneMsg('刷新失败，请检查网络后再点一次');
        } finally {
            setChecking(false);
        }
    };

    const fieldError = (k: keyof AiDecorateFields) =>
        fieldErrors[k] ? <p data-testid={`ai-err-${k}`} className="text-red-400 text-[10px] font-mono mt-0.5">{fieldErrors[k]}</p> : null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 bg-black/80 backdrop-blur-sm"
            onMouseDown={e => { downOnBackdrop.current = e.target === e.currentTarget; }}
            onClick={e => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); }}
        >
            <div data-testid="purchase-modal" className="bg-[#111] border border-[#333] rounded-lg p-4 md:p-5 max-w-md w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 max-h-[calc(100dvh-1.5rem)] md:max-h-[90dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
                    <X size={20} />
                </button>

                <h2 className="text-green-500 font-mono font-bold mb-3 text-lg flex items-center gap-2">
                    <Box size={20} />
                    {t('acquire_node')} — {count} {count === 1 ? 'cell' : 'cells'}
                </h2>

                {/* ---- what is being bought ---- */}
                <div className="bg-[#0a0a0a] border border-[#222] rounded p-3 mb-3">
                    <div data-testid="selected-cells" className="text-gray-300 text-xs font-mono mb-2 break-words">
                        <span className="text-gray-500">所选格子 </span>{rangeLabel}
                    </div>
                    <div className="flex justify-between items-end mb-1">
                        <span className="text-gray-400 text-xs font-mono">{t('total_cost')}</span>
                        <span data-testid="total-price" className="text-white text-xl font-bold font-mono">${totalPrice} USDC</span>
                    </div>
                    <div className="flex justify-between items-end">
                        <span className="text-gray-500 text-[10px] font-mono">${unitPriceUsdc()} × {count}</span>
                        <span className="text-green-500 text-xs font-mono">{count} {t('units')}</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-[#1a1a1a] text-[10px] font-mono text-gray-500 space-y-0.5">
                        <div>收款地址 <span data-testid="pay-to" className="text-gray-300 break-all select-all">{AGENTVERSE_PAY_TO}</span></div>
                        <div>支持网络 <span className="text-purple-300">Monad {PAY_NETWORKS.mainnet.monad.caip2}（优先）</span> · <span className="text-blue-300">Base {PAY_NETWORKS.mainnet.base.caip2}</span></div>
                    </div>
                </div>

                {tooMany && (
                    <div data-testid="too-many" role="alert" className="bg-red-900/20 border border-red-900/50 p-2 rounded mb-3 text-red-300 text-xs font-mono flex gap-1.5">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        <span>一次最多买 {MAX_BULK_CELLS} 格，你选了 {count} 格。请缩小选区。</span>
                    </div>
                )}

                {/* ---- how I want it to look (optional) ---- */}
                <div className="mb-3">
                    <div className="text-green-500 text-[11px] font-bold font-mono mb-1.5">想要的样子（可选，不填就只买格子）</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                        <div>
                            <label className={LABEL} htmlFor="ai-title">标题 title</label>
                            <input id="ai-title" data-testid="ai-title" className={FIELD} value={fields.title} maxLength={120} onChange={e => setField('title', e.target.value)} placeholder="我的格子" />
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="ai-fill-color">格子颜色 fill_color</label>
                            <div className="flex gap-1.5">
                                <input
                                    type="color"
                                    aria-label="选择颜色"
                                    data-testid="ai-color-picker"
                                    value={HEX_COLOR.test(fields.fill_color) ? fields.fill_color : '#10b981'}
                                    onChange={e => setField('fill_color', e.target.value)}
                                    className="h-[30px] w-9 shrink-0 bg-transparent border border-[#333] rounded cursor-pointer"
                                />
                                <input id="ai-fill-color" data-testid="ai-fill-color" className={FIELD} value={fields.fill_color} onChange={e => setField('fill_color', e.target.value)} placeholder="不选就不改颜色" />
                                {fields.fill_color && (
                                    <button type="button" onClick={() => setField('fill_color', '')} className="shrink-0 px-2 text-[10px] font-mono rounded border border-[#333] text-gray-500 hover:text-white">清除</button>
                                )}
                            </div>
                            {fieldError('fill_color')}
                        </div>
                    </div>
                    <div className="mb-2">
                        <label className={LABEL} htmlFor="ai-summary">一句话简介 summary</label>
                        <input id="ai-summary" data-testid="ai-summary" className={FIELD} value={fields.summary} maxLength={200} onChange={e => setField('summary', e.target.value)} placeholder="一句话介绍这个格子" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                            <label className={LABEL} htmlFor="ai-iframe">嵌入网页 iframe_url（仅 https）</label>
                            <input id="ai-iframe" data-testid="ai-iframe" className={FIELD} value={fields.iframe_url} onChange={e => setField('iframe_url', e.target.value)} placeholder="https://your-site.com" />
                            {fieldError('iframe_url')}
                        </div>
                        <div>
                            <label className={LABEL} htmlFor="ai-service-url">x402 服务地址 service_url（可选）</label>
                            <input id="ai-service-url" data-testid="ai-service-url" className={FIELD} value={fields.service_url} onChange={e => setField('service_url', e.target.value)} placeholder="https://api.example.com/paid" />
                            {fieldError('service_url')}
                        </div>
                    </div>
                </div>

                {/* ---- primary: copy the prompt to my AI ---- */}
                <button
                    type="button"
                    data-testid="copy-for-ai"
                    disabled={hasFieldErrors || tooMany}
                    onClick={handleCopyForAI}
                    className={`w-full py-3 font-mono font-bold rounded mb-1.5 text-sm flex items-center justify-center gap-2 transition-all disabled:bg-[#222] disabled:text-gray-500 disabled:cursor-not-allowed ${copied ? 'bg-green-900/40 border border-green-600 text-green-300' : 'bg-green-600 hover:bg-green-500 text-white shadow-lg hover:shadow-green-900/20'}`}
                >
                    {copied ? <><Check size={16} /> 已复制，去粘贴给你的 AI</> : <><Copy size={16} /> 复制给我的 AI</>}
                </button>
                <p data-testid="ai-helper" className="text-[10px] text-gray-500 font-mono mb-2">总价 ${totalPrice} USDC 你已在这里确认：AI 直接付款，付款不会超过这个数，然后把 key 的保存位置、交易链接告诉你。</p>
                {copyFailed && (
                    <div data-testid="copy-failed" role="alert" className="bg-yellow-900/20 border border-yellow-800/40 rounded p-2 mb-2 text-yellow-400 text-[11px]">
                        浏览器不让自动复制。请在下面的提示词框里全选（Ctrl+A / 长按）后手动复制。
                    </div>
                )}
                <details open={showPreview} onToggle={e => setShowPreview((e.currentTarget as HTMLDetailsElement).open)} className="mb-3">
                    <summary className="text-[10px] font-mono text-gray-500 cursor-pointer hover:text-gray-300">查看将要复制的提示词</summary>
                    <pre data-testid="ai-prompt" className="mt-1.5 bg-[#050505] p-2 rounded border border-[#222] text-[10px] text-gray-400 overflow-x-auto whitespace-pre-wrap break-all font-mono select-all max-h-56 overflow-y-auto">{aiPrompt}</pre>
                </details>

                {/* ---- secondary: no AI wallet yet ---- */}
                <div data-testid="no-ai-wallet" className="bg-[#0a0a0a] border border-[#222] rounded p-3 mb-3">
                    <p className="text-gray-300 text-[11px] font-bold font-mono mb-1.5">还没有 AI 钱包？三种办法：</p>
                    <ul className="text-gray-500 text-[11px] leading-relaxed space-y-1.5 list-none">
                        <li data-testid="wallet-opt-moneyswitch">
                            <span className="text-green-400 font-bold">MoneySwitch（推荐）</span>：有额度、大额要你批准，AI 拿不到私钥。
                            <a href={MONEYSWITCH_URL} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-1 text-blue-400 font-mono hover:underline break-all">
                                <ExternalLink size={10} /> {MONEYSWITCH_URL}
                            </a>
                        </li>
                        <li data-testid="wallet-opt-awal">
                            <span className="text-gray-300 font-bold">awal</span>：Coinbase 出的，邮箱登录，只支持 Base。
                        </li>
                        <li data-testid="wallet-opt-rawkey">
                            <span className="text-yellow-400 font-bold">私钥 + x402 客户端</span>：等于把整个钱包交给 AI，里面只放小额。
                        </li>
                    </ul>
                </div>

                {/* ---- review the result ---- */}
                <button
                    type="button"
                    data-testid="ai-done"
                    disabled={checking || !onAiDone}
                    onClick={handleAiDone}
                    className="w-full py-2 mb-1 bg-[#1a1a1a] border border-[#333] hover:border-green-500 hover:text-green-400 disabled:opacity-60 text-gray-300 font-mono text-xs rounded flex items-center justify-center gap-1.5 transition-all"
                >
                    <RefreshCw size={12} className={checking ? 'animate-spin' : ''} /> {checking ? '正在刷新…' : '我让 AI 买完了（刷新地图，查看结果）'}
                </button>
                {doneMsg && (
                    <p data-testid="ai-done-msg" role="status" className="text-yellow-400 text-[11px] font-mono mb-2">{doneMsg}</p>
                )}
            </div>
        </div>
    );
};
