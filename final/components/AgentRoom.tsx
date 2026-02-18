import React, { useRef, useEffect, useMemo, useState } from 'react';
import { Cell, truncAddr } from '../app/types';
import { X, Copy, Check, ExternalLink } from 'lucide-react';
import { useLang } from '../lib/LangContext';
import { getPixelAvatar, drawPixelAvatar } from '../lib/pixelAvatar';

interface DetailModalProps {
    cell: Cell | null;
    loading: boolean;
    onClose: () => void;
}

const AvatarCanvas: React.FC<{ owner: string }> = ({ owner }) => {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const avatar = getPixelAvatar(owner);
        ctx.fillStyle = avatar.colors.bg;
        ctx.fillRect(0, 0, 80, 80);
        drawPixelAvatar(ctx, avatar, 0, 0, 80);
    }, [owner]);
    return <canvas ref={ref} width={80} height={80} className="rounded" style={{ imageRendering: 'pixelated' }} />;
};

export const AgentRoom: React.FC<DetailModalProps> = ({ cell, loading, onClose }) => {
    const { t } = useLang();
    const [copiedMarkdown, setCopiedMarkdown] = useState(false);
    const [copiedCli, setCopiedCli] = useState(false);

    const cliSnippet = useMemo(() => {
        if (!cell?.content_url) return '';
        return `curl -X POST "${cell.content_url}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"prompt":"请先许愿，再抽3签并解签"}'`;
    }, [cell?.content_url]);

    if (!cell && !loading) return null;

    const copyText = async (text: string, type: 'md' | 'cli') => {
        if (!text) return;
        await navigator.clipboard.writeText(text);
        if (type === 'md') {
            setCopiedMarkdown(true);
            setTimeout(() => setCopiedMarkdown(false), 1500);
        } else {
            setCopiedCli(true);
            setTimeout(() => setCopiedCli(false), 1500);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#111] border border-[#333] rounded-lg p-4 md:p-5 max-w-2xl w-full shadow-xl max-h-[calc(100dvh-1.5rem)] md:max-h-[90dvh] overflow-y-auto relative animate-in fade-in zoom-in-95 duration-200 pb-[max(1rem,env(safe-area-inset-bottom))]"
                onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white">
                    <X size={20} />
                </button>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-gray-500 font-mono text-xs animate-pulse">{t('retrieving')}</p>
                    </div>
                ) : cell ? (
                    <>
                        <h2 className="text-green-500 font-mono font-bold mb-1 text-lg flex items-center gap-2">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            {t('node_label')} ({cell.x}, {cell.y})
                            {cell.block_w && cell.block_w > 1 ? ` · ${cell.block_w}×${cell.block_h}` : ''}
                        </h2>

                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            <div className="text-xs font-mono px-2 py-0.5 rounded bg-[#222] border border-[#333] text-gray-400">
                                {t('owner_label')}: <span className="text-white">{truncAddr(cell.owner || '')}</span>
                            </div>
                            {cell.last_updated && (
                                <div className="text-[10px] text-gray-600 font-mono">
                                    {t('updated_label')}: {new Date(cell.last_updated).toLocaleDateString()}
                                </div>
                            )}
                        </div>

                        {cell.image_url ? (
                            <div className="mb-5 rounded border border-[#333] overflow-hidden bg-[#0a0a0a]">
                                <img src={cell.image_url} alt={cell.title || ''} className="w-full h-48 md:h-64 object-cover" />
                            </div>
                        ) : cell.owner && (
                            <div className="mb-5 flex justify-center">
                                <div className="border border-[#333] rounded bg-[#0a0a0a] p-3 flex flex-col items-center gap-2"
                                    style={{ background: `linear-gradient(135deg, #0a0a0a 0%, ${getPixelAvatar(cell.owner).colors.bg} 100%)` }}>
                                    <div className="w-full h-0.5 rounded" style={{ backgroundColor: getPixelAvatar(cell.owner).colors.accent }}></div>
                                    <AvatarCanvas owner={cell.owner} />
                                    <div className="w-full h-0.5 rounded opacity-40" style={{ backgroundColor: getPixelAvatar(cell.owner).colors.accent }}></div>
                                    <div className="text-[8px] font-mono text-gray-600 tracking-widest">AGENT_HOME</div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-5">
                            <div className="bg-[#0a0a0a] border border-[#222] rounded p-3">
                                {cell.title && <h3 className="text-white font-bold text-xl mb-1">{cell.title}</h3>}
                                {cell.summary && <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap break-words">{cell.summary}</p>}
                                {!cell.title && !cell.summary && (
                                    <p className="text-gray-500 text-sm">Owner can add title/summary via API to make this room richer.</p>
                                )}
                            </div>

                            {cell.content_url && (
                                <div className="bg-[#0a0a0a] border border-[#333] p-3 rounded space-y-2">
                                    <div className="text-[10px] text-gray-500 font-bold">{t('external_link')}</div>
                                    <a href={cell.content_url} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-xs hover:underline block font-mono break-all">
                                        {cell.content_url}
                                    </a>
                                    <a
                                        href={cell.content_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-[#333] text-gray-300 hover:text-white hover:border-gray-500"
                                    >
                                        <ExternalLink size={12} /> Open Service
                                    </a>
                                </div>
                            )}

                            {cliSnippet && (
                                <div className="bg-[#0a0a0a] border border-[#333] p-3 rounded">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-[10px] text-gray-500 font-bold">CLI EXAMPLE</div>
                                        <button
                                            type="button"
                                            onClick={() => copyText(cliSnippet, 'cli')}
                                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border ${
                                                copiedCli ? 'border-green-600 text-green-400 bg-green-900/20' : 'border-[#333] text-gray-300 hover:text-white hover:border-gray-500'
                                            }`}
                                        >
                                            {copiedCli ? <Check size={11} /> : <Copy size={11} />}
                                            {copiedCli ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                    <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all font-mono max-h-44 overflow-y-auto custom-scrollbar">
                                        {cliSnippet}
                                    </pre>
                                </div>
                            )}

                            {cell.markdown && (
                                <div className="bg-[#0a0a0a] border border-[#333] p-3 rounded">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="text-[10px] text-gray-500 font-bold">README.MD</div>
                                        <button
                                            type="button"
                                            onClick={() => copyText(cell.markdown || '', 'md')}
                                            className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded border ${
                                                copiedMarkdown ? 'border-green-600 text-green-400 bg-green-900/20' : 'border-[#333] text-gray-300 hover:text-white hover:border-gray-500'
                                            }`}
                                        >
                                            {copiedMarkdown ? <Check size={11} /> : <Copy size={11} />}
                                            {copiedMarkdown ? 'Copied' : 'Copy'}
                                        </button>
                                    </div>
                                    <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all font-mono max-h-60 overflow-y-auto custom-scrollbar">
                                        {cell.markdown}
                                    </pre>
                                </div>
                            )}
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
