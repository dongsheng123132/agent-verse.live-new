import React, { useRef, useEffect, useState } from 'react';
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
        ctx.fillRect(0, 0, 120, 120);
        drawPixelAvatar(ctx, avatar, 0, 0, 120);
    }, [owner]);
    return <canvas ref={ref} width={120} height={120} className="rounded" style={{ imageRendering: 'pixelated' }} />;
};

export const AgentRoom: React.FC<DetailModalProps> = ({ cell, loading, onClose }) => {
    const { t } = useLang();
    const [copiedMd, setCopiedMd] = useState(false);
    const [copiedAll, setCopiedAll] = useState(false);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const allText = cell ? [
        `=== AgentVerse Cell (${cell.x}, ${cell.y}) ===`,
        cell.title ? `Title: ${cell.title}` : '',
        cell.summary ? `Summary: ${cell.summary}` : '',
        cell.content_url ? `Service URL: ${cell.content_url}` : '',
        `Cell Info: ${origin}/api/cells?x=${cell.x}&y=${cell.y}`,
        `Skill Doc: ${origin}/skill.md`,
        cell.markdown ? `\n--- README ---\n${cell.markdown}` : '',
    ].filter(Boolean).join('\n') : '';

    const handleCopy = (text: string, setter: (v: boolean) => void) => {
        navigator.clipboard.writeText(text);
        setter(true);
        setTimeout(() => setter(false), 1500);
    };

    if (!cell && !loading) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#111] border border-[#333] rounded-lg p-4 md:p-5 max-w-lg w-full shadow-xl max-h-[calc(100dvh-1.5rem)] md:max-h-[90dvh] overflow-y-auto relative animate-in fade-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white z-10">
                    <X size={20} />
                </button>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-4">
                        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-gray-500 font-mono text-xs animate-pulse">{t('retrieving')}</p>
                    </div>
                ) : cell ? (
                    <>
                        {/* Header */}
                        <h2 className="text-green-500 font-mono font-bold mb-1 text-lg flex items-center gap-2 pr-8">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            ({cell.x}, {cell.y})
                            {cell.block_w && cell.block_w > 1 ? ` · ${cell.block_w}×${cell.block_h}` : ''}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                            <span className="text-xs font-mono px-2 py-0.5 rounded bg-[#222] border border-[#333] text-gray-400">
                                {truncAddr(cell.owner || '')}
                            </span>
                            {cell.hit_count != null && cell.hit_count > 0 && (
                                <span className="text-[10px] text-orange-400 font-mono">{cell.hit_count} views</span>
                            )}
                        </div>

                        {/* Image or Avatar */}
                        {cell.image_url ? (
                            <div className="mb-4 rounded border border-[#333] overflow-hidden bg-[#0a0a0a]">
                                <img src={cell.image_url} alt={cell.title || ''} className="w-full h-48 object-cover" />
                            </div>
                        ) : cell.owner && (
                            <div className="mb-4 flex justify-center">
                                <div className="border border-[#333] rounded bg-[#0a0a0a] p-3 flex flex-col items-center gap-2"
                                    style={{ background: `linear-gradient(135deg, #0a0a0a 0%, ${getPixelAvatar(cell.owner).colors.bg} 100%)` }}>
                                    <AvatarCanvas owner={cell.owner} />
                                </div>
                            </div>
                        )}

                        {/* Title & Summary */}
                        {(cell.title || cell.summary) && (
                            <div className="bg-[#0a0a0a] border border-[#222] rounded p-3 mb-4">
                                {cell.title && <h3 className="text-white font-bold text-lg mb-1">{cell.title}</h3>}
                                {cell.summary && <p className="text-gray-300 text-sm leading-relaxed">{cell.summary}</p>}
                            </div>
                        )}

                        {/* Service URL */}
                        {cell.content_url && (
                            <a href={cell.content_url} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-2 text-blue-400 text-xs font-mono hover:underline mb-4 px-1">
                                <ExternalLink size={12} /> {cell.content_url}
                            </a>
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
                                <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all font-mono max-h-48 overflow-y-auto custom-scrollbar">
                                    {cell.markdown}
                                </pre>
                            </div>
                        )}

                        {/* Copy All to AI */}
                        <button onClick={() => handleCopy(allText, setCopiedAll)}
                            className={`w-full py-2.5 text-xs font-mono rounded border flex items-center justify-center gap-2 transition-all ${copiedAll
                                ? 'bg-green-900/20 border-green-700 text-green-400'
                                : 'bg-[#1a1a1a] border-[#333] text-gray-300 hover:border-green-500 hover:text-green-400'
                            }`}>
                            {copiedAll ? <><Check size={14} /> {t('copied')}</> : <><Copy size={14} /> {t('copy_for_ai')}</>}
                        </button>
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
