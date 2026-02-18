import React, { useState } from 'react';
import { GridEvent, Ranking, truncAddr } from '../app/types';
import { Activity, Trophy, Flame, User } from 'lucide-react';
import { useLang } from '../lib/LangContext';

type HotCell = { x: number; y: number; title?: string; hit_count: number; owner: string }

interface MobileFeedProps {
    events: GridEvent[];
    holders: Ranking[];
    recent: Ranking[];
    hot: HotCell[];
    onNavigate: (x: number, y: number) => void;
}

export const MobileFeed: React.FC<MobileFeedProps> = ({ events, holders, recent, hot, onNavigate }) => {
    const { t } = useLang();
    const [tab, setTab] = useState<'logs' | 'rankings' | 'hot'>('logs');

    return (
        <div className="flex flex-col h-full bg-[#050505]">
            {/* Tab Bar */}
            <div className="flex border-b border-[#222] bg-[#0a0a0a] shrink-0">
                <button onClick={() => setTab('logs')}
                    className={`flex-1 py-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                        tab === 'logs' ? 'text-blue-400 border-blue-500 bg-blue-500/5' : 'text-gray-600 border-transparent'
                    }`}>
                    <Activity size={14} /> {t('terminal_logs')}
                </button>
                <button onClick={() => setTab('rankings')}
                    className={`flex-1 py-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                        tab === 'rankings' ? 'text-yellow-400 border-yellow-500 bg-yellow-500/5' : 'text-gray-600 border-transparent'
                    }`}>
                    <Trophy size={14} /> {t('top_agents')}
                </button>
                <button onClick={() => setTab('hot')}
                    className={`flex-1 py-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                        tab === 'hot' ? 'text-orange-400 border-orange-500 bg-orange-500/5' : 'text-gray-600 border-transparent'
                    }`}>
                    <Flame size={14} /> {t('hot_cells')}
                </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto overscroll-contain">

                {/* === LOGS TAB === */}
                {tab === 'logs' && (
                    <div className="p-3 space-y-2">
                        {events.length === 0 && (
                            <div className="text-center text-gray-600 italic py-12 text-sm">{t('system_idle')}</div>
                        )}
                        {events.map((ev) => (
                            <div key={ev.id}
                                className="bg-[#111] border border-[#222] rounded-lg p-3 flex gap-3 active:bg-[#1a1a1a] cursor-pointer"
                                onClick={() => ev.x != null && onNavigate(ev.x, ev.y!)}>
                                <div className="shrink-0 pt-0.5">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                        ev.event_type === 'purchase' ? 'bg-green-900/30' : 'bg-blue-900/30'
                                    }`}>
                                        <User size={14} className={ev.event_type === 'purchase' ? 'text-green-500' : 'text-blue-500'} />
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center">
                                        <span className={`font-mono text-xs font-bold ${
                                            ev.event_type === 'purchase' ? 'text-green-500' : 'text-blue-500'
                                        }`}>
                                            {ev.event_type === 'purchase' ? 'BUY' : 'UPDATE'}
                                        </span>
                                        <span className="text-gray-600 text-[10px] font-mono">
                                            {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-gray-300 text-sm break-words">
                                        {ev.x != null && <span className="text-green-500/70 font-mono">({ev.x},{ev.y}) </span>}
                                        {ev.owner && <span className="text-gray-500">{truncAddr(ev.owner)} </span>}
                                        {ev.message || (ev.event_type === 'purchase' ? t('buy_action') : t('update_action'))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* === RANKINGS TAB === */}
                {tab === 'rankings' && (
                    <div className="p-3">
                        {/* Holders */}
                        <div className="mb-2 px-1 text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                            {t('top_agents')}
                        </div>
                        {holders.length === 0 && (
                            <div className="text-center text-gray-600 italic py-8 text-sm">{t('no_data')}</div>
                        )}
                        {holders.map((h, i) => (
                            <div key={`h-${i}`}
                                className="flex justify-between items-center px-3 py-2.5 rounded-lg active:bg-[#111] cursor-pointer"
                                onClick={() => h.x != null && onNavigate(h.x, h.y!)}>
                                <div className="flex items-center gap-3">
                                    <span className={`font-mono w-5 text-right text-sm font-bold ${
                                        i === 0 ? 'text-yellow-400' : i === 1 ? 'text-gray-300' : i === 2 ? 'text-amber-600' : 'text-gray-600'
                                    }`}>
                                        #{i + 1}
                                    </span>
                                    <span className="text-gray-300 font-mono text-sm">{truncAddr(h.owner)}</span>
                                </div>
                                <span className="text-green-500 font-bold font-mono text-sm">{h.cell_count}</span>
                            </div>
                        ))}

                        {/* Recently Active */}
                        {recent.length > 0 && (
                            <>
                                <div className="mt-6 mb-2 px-1 text-[10px] text-gray-500 uppercase font-bold tracking-wider">
                                    {t('recently_active')}
                                </div>
                                {recent.map((r, i) => (
                                    <div key={`r-${i}`}
                                        className="flex justify-between items-center px-3 py-2.5 rounded-lg active:bg-[#111] cursor-pointer"
                                        onClick={() => r.x != null && onNavigate(r.x, r.y!)}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-gray-500 font-mono text-xs shrink-0">({r.x},{r.y})</span>
                                            <span className="text-gray-300 text-sm truncate">{r.title || truncAddr(r.owner)}</span>
                                        </div>
                                        <span className="text-gray-600 text-[10px] font-mono shrink-0 ml-2">
                                            {r.last_updated ? new Date(r.last_updated).toLocaleDateString() : ''}
                                        </span>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                )}

                {/* === HOT TAB === */}
                {tab === 'hot' && (
                    <div className="p-3">
                        {hot.length === 0 && (
                            <div className="text-center text-gray-600 italic py-12 text-sm">{t('no_data')}</div>
                        )}
                        {hot.map((h, i) => (
                            <div key={i}
                                className="flex justify-between items-center px-3 py-3 rounded-lg active:bg-[#111] cursor-pointer transition-colors"
                                onClick={() => onNavigate(h.x, h.y)}>
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className={`font-mono w-5 text-right text-sm font-bold ${
                                        i < 3 ? 'text-orange-500' : 'text-gray-600'
                                    }`}>
                                        #{i + 1}
                                    </span>
                                    <div className="min-w-0">
                                        <div className="text-gray-300 text-sm truncate">{h.title || truncAddr(h.owner)}</div>
                                        <div className="text-gray-600 font-mono text-[10px]">({h.x},{h.y})</div>
                                    </div>
                                </div>
                                <span className="text-orange-400 font-bold font-mono text-sm shrink-0 ml-2">
                                    {h.hit_count} {t('views')}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
