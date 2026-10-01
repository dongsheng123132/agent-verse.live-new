import React, { useEffect, useState } from 'react';
import { X, Wallet, Box, Copy, Check, AlertTriangle } from 'lucide-react';
import { useLang } from '../lib/LangContext';
import { PRICE_PER_CELL } from '../app/types';
import { formatAtomicUsdc, totalAtomicForCells, totalUsdcForCells } from '../lib/wallet-pay/amount';
import { NO_GAS_NOTE, toPayError } from '../lib/wallet-pay/errors';
import { saveCellKey, safeLocalStorage } from '../lib/wallet-pay/key-store';
import { DEFAULT_PAY_NETWORK, PAY_NETWORK_ORDER, PAY_NETWORKS, type PayNetworkKey } from '../lib/wallet-pay/networks';
import { getInjectedProvider } from '../lib/wallet-pay/wallet';
import type { PayStatus, PurchaseSuccess } from '../lib/wallet-pay/pay';

interface PurchaseModalProps {
    selectedCells: { x: number; y: number }[];
    onClose: () => void;
    /** Called once the payment settled; `keySaved` is false when this browser refused to store the key. */
    onPurchased: (result: PurchaseSuccess, keySaved: boolean) => void;
    refCode?: string | null;
}

const STATUS_TEXT: Record<PayStatus, string> = {
    quoting: '正在获取报价…',
    connecting: '请在钱包里点「连接」…',
    switching: '请在钱包里同意切换网络…',
    checking_balance: '正在检查 USDC 余额…',
    signing: '请在钱包里确认签名（不是转账交易，不花 gas）…',
};

export const PurchaseModal: React.FC<PurchaseModalProps> = ({
    selectedCells,
    onClose,
    onPurchased,
    refCode,
}) => {
    const { t } = useLang();
    const [copied, setCopied] = useState(false);
    const [hasWallet, setHasWallet] = useState<boolean | null>(null);
    const [networkKey, setNetworkKey] = useState<PayNetworkKey>(DEFAULT_PAY_NETWORK);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<PayStatus | null>(null);
    const [error, setError] = useState<string | null>(null);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const count = selectedCells.length;
    const totalPrice = totalUsdcForCells(count);
    const maxPrice = formatAtomicUsdc(totalAtomicForCells(count));
    const minX = Math.min(...selectedCells.map(c => c.x));
    const maxX = Math.max(...selectedCells.map(c => c.x));
    const minY = Math.min(...selectedCells.map(c => c.y));
    const maxY = Math.max(...selectedCells.map(c => c.y));
    const rangeLabel = count === 1
        ? `(${selectedCells[0].x}, ${selectedCells[0].y})`
        : `(${minX},${minY}) → (${maxX},${maxY})`;

    // Wallet extensions inject window.ethereum a moment after load — look now, and again shortly.
    useEffect(() => {
        const check = () => setHasWallet(!!getInjectedProvider());
        check();
        const timer = setTimeout(check, 800);
        window.addEventListener('ethereum#initialized', check);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('ethereum#initialized', check);
        };
    }, []);

    const handleWalletPay = async () => {
        if (busy) return;
        const provider = getInjectedProvider();
        if (!provider) {
            setHasWallet(false);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const { payForCells } = await import('../lib/wallet-pay/pay');
            const result = await payForCells({
                provider,
                networkKey,
                cells: selectedCells,
                buildMode: process.env.NEXT_PUBLIC_X402_NETWORK_MODE,
                refCode,
                origin: window.location.origin,
                onStatus: setStatus,
            });
            const keySaved = saveCellKey(safeLocalStorage(), result.keyCell.x, result.keyCell.y, result.apiKey, {
                network: result.network.caip2,
                txHash: result.txHash ?? undefined,
            });
            onPurchased(result, keySaved);
        } catch (e) {
            setError(toPayError(e).message);
        } finally {
            setBusy(false);
            setStatus(null);
        }
    };

    // ---- "let my AI buy it" ----
    const refPart = refCode ? `,"ref":"${refCode}"` : '';
    const first = selectedCells[0];
    const endpoint = count === 1 ? '/api/cells/purchase' : '/api/cells/bulk-purchase';
    const bodyJson = count === 1
        ? `{"x":${first.x},"y":${first.y}${refPart}}`
        : `{"cells":${JSON.stringify(selectedCells.map(c => ({ x: c.x, y: c.y })))}${refPart}}`;
    const awalCmd = `npx awal@latest x402 pay ${origin}${endpoint} -X POST -d '${bodyJson}'`;
    const aiPrompt = [
        `请用 MoneySwitch 的 paid_fetch 工具，在 AgentVerse 买 ${count} 个格子：`,
        `- url: ${origin}${endpoint}`,
        `- method: POST`,
        `- body: ${bodyJson}`,
        `- max_price: "${maxPrice}"（${PRICE_PER_CELL} USDC/格 × ${count}，Monad 或 Base 上的 USDC 都行）`,
        ``,
        `买完后响应里的 api_key（gk_ 开头）只返回这一次，请原样保存并告诉我。装修格子的方法见 ${origin}/skill.md`,
        ``,
        `备选（没有 MoneySwitch 时）：`,
        awalCmd,
    ].join('\n');

    const handleCopyForAI = () => {
        navigator.clipboard.writeText(aiPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-4 bg-black/80 backdrop-blur-sm" onClick={busy ? undefined : onClose}>
            <div data-testid="purchase-modal" className="bg-[#111] border border-[#333] rounded-lg p-4 md:p-5 max-w-sm w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 max-h-[calc(100dvh-1.5rem)] md:max-h-[90dvh] overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={e => e.stopPropagation()}>
                <button onClick={onClose} disabled={busy} className="absolute top-4 right-4 text-gray-500 hover:text-white disabled:opacity-30">
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
                        <span data-testid="total-price" className="text-white text-xl font-bold font-mono">${totalPrice.toFixed(2)} USDC</span>
                    </div>
                    <div className="flex justify-between items-end">
                        <span className="text-gray-500 text-[10px] font-mono">${PRICE_PER_CELL} × {count}</span>
                        <span className="text-green-500 text-xs font-mono">{count} {t('units')}</span>
                    </div>
                </div>

                {/* ---- primary: pay with a browser wallet ---- */}
                <div className="mb-2 text-[11px] text-gray-400 font-mono">选择付款网络</div>
                <div role="radiogroup" aria-label="付款网络" className="grid grid-cols-2 gap-2 mb-2">
                    {PAY_NETWORK_ORDER.map(key => {
                        const active = networkKey === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                data-testid={`net-${key}`}
                                disabled={busy}
                                onClick={() => setNetworkKey(key)}
                                className={`py-2 rounded border text-xs font-mono font-bold transition-all disabled:opacity-60 ${active
                                    ? (key === 'monad' ? 'border-purple-500 bg-purple-900/30 text-purple-200' : 'border-blue-500 bg-blue-900/30 text-blue-200')
                                    : 'border-[#333] bg-[#0a0a0a] text-gray-400 hover:border-gray-500'}`}
                            >
                                {PAY_NETWORKS.mainnet[key].label}
                                {key === DEFAULT_PAY_NETWORK && <span className="ml-1 font-normal text-[9px] opacity-70">默认</span>}
                            </button>
                        );
                    })}
                </div>
                <p className="text-[10px] text-gray-500 font-mono mb-3">{NO_GAS_NOTE}</p>

                {error && (
                    <div data-testid="pay-error" role="alert" className="bg-red-900/20 border border-red-900/50 p-2 rounded mb-3 text-red-300 text-xs font-mono break-words flex gap-1.5">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}

                {hasWallet === false ? (
                    <div data-testid="no-wallet" className="bg-yellow-900/20 border border-yellow-800/40 rounded p-3 mb-3">
                        <p className="text-yellow-400 text-xs font-bold font-mono mb-1">没有检测到浏览器钱包</p>
                        <p className="text-yellow-500/90 text-[11px] leading-relaxed">
                            电脑上请安装 MetaMask / OKX / Rabby 浏览器扩展后刷新本页；手机上请在钱包 App（MetaMask、OKX、Rabby、Trust 等）的内置浏览器里打开本站。
                            也可以用下面的「让我的 AI 买」。
                        </p>
                    </div>
                ) : (
                    <button
                        type="button"
                        data-testid="wallet-pay"
                        disabled={busy || hasWallet === null}
                        onClick={handleWalletPay}
                        className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-[#222] disabled:text-gray-500 text-white font-mono font-bold rounded mb-2 text-sm flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-green-900/20"
                    >
                        {busy ? (
                            <span data-testid="pay-status" className="animate-pulse text-xs">{status ? STATUS_TEXT[status] : t('processing')}</span>
                        ) : (
                            <><Wallet size={16} /> 连接钱包付款 · ${totalPrice.toFixed(2)} USDC</>
                        )}
                    </button>
                )}

                <button
                    type="button"
                    disabled
                    title="Coinbase Commerce 已不可用"
                    className="w-full py-2 bg-[#161616] border border-[#222] text-gray-600 font-mono text-[11px] rounded mb-4 cursor-not-allowed"
                >
                    信用卡支付暂停
                </button>

                {/* ---- secondary: let my AI buy ---- */}
                <div className="border-t border-[#222] pt-4">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-green-500 text-[10px] font-bold font-mono">让我的 AI 买（x402 · MoneySwitch）</p>
                    </div>
                    <pre data-testid="ai-prompt" className="bg-[#050505] p-2 rounded border border-[#222] text-[9px] text-gray-500 overflow-x-auto whitespace-pre-wrap break-all font-mono select-all hover:border-gray-600 transition-colors mb-2 max-h-36 overflow-y-auto">
                        {aiPrompt}
                    </pre>
                    <button
                        onClick={handleCopyForAI}
                        className={`w-full py-1.5 text-[10px] font-mono rounded border flex items-center justify-center gap-1.5 transition-all ${copied ? 'bg-green-900/20 border-green-700 text-green-400' : 'bg-[#1a1a1a] border-[#333] text-gray-400 hover:border-green-500 hover:text-green-400'}`}
                    >
                        {copied ? <><Check size={10} /> {t('copied')}</> : <><Copy size={10} /> 复制给 AI 的提示词</>}
                    </button>
                </div>
            </div>
        </div>
    );
};
