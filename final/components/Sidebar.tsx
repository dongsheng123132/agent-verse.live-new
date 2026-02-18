import React, { useEffect, useRef, useState } from 'react';
import { GridEvent, Ranking, truncAddr } from '../app/types';
import { Activity, Trophy, Flame, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { useLang } from '../lib/LangContext';

type HotCell = { x: number; y: number; title?: string; hit_count: number; owner: string }

interface SidebarProps {
    events: GridEvent[];
    holders: Ranking[];
    recent: Ranking[];
    hot: HotCell[];
    onNavigate: (x: number, y: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ events, holders, recent, hot, onNavigate }) => {
    const { t } = useLang();
    const MIN_WIDTH = 280;
    const MAX_WIDTH = 520;
    const COLLAPSED_WIDTH = 56;
    const DEFAULT_WIDTH = 320;

    const [collapsed, setCollapsed] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
    const [logsOpen, setLogsOpen] = useState(true);
    const [rankingsOpen, setRankingsOpen] = useState(true);
    const [hotOpen, setHotOpen] = useState(true);
    const [isResizing, setIsResizing] = useState(false);

    const resizeStartXRef = useRef(0);
    const resizeStartWidthRef = useRef(DEFAULT_WIDTH);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const savedCollapsed = localStorage.getItem('sidebar:collapsed');
        const savedWidth = localStorage.getItem('sidebar:width');
        if (savedCollapsed != null) setCollapsed(savedCollapsed === '1');
        if (savedWidth != null) {
            const parsed = Number(savedWidth);
            if (Number.isFinite(parsed)) {
                setSidebarWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed)));
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem('sidebar:collapsed', collapsed ? '1' : '0');
    }, [collapsed]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem('sidebar:width', String(Math.round(sidebarWidth)));
    }, [sidebarWidth]);

    useEffect(() => {
        if (!isResizing) return;

        const onMouseMove = (e: MouseEvent) => {
            const delta = e.clientX - resizeStartXRef.current;
            const next = resizeStartWidthRef.current + delta;
            setSidebarWidth(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, next)));
        };
        const onMouseUp = () => setIsResizing(false);

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [isResizing]);

    const beginResize = (e: React.MouseEvent<HTMLDivElement>) => {
        if (collapsed) return;
        resizeStartXRef.current = e.clientX;
        resizeStartWidthRef.current = sidebarWidth;
        setIsResizing(true);
    };

    const toggleCollapsed = () => setCollapsed(v => !v);

    return (
        <div
            className={`relative h-full bg-[#0a0a0a] border-r border-[#222] flex flex-col font-mono text-xs ${isResizing ? 'select-none' : ''} ${isResizing ? '' : 'transition-[width] duration-200'}`}
            style={{ width: collapsed ? COLLAPSED_WIDTH : sidebarWidth }}
        >
            <div className="h-11 px-2 border-b border-[#222] bg-[#111] flex items-center justify-between">
                {!collapsed && <span className="text-[10px] tracking-wider text-gray-500 uppercase">{t('terminal_logs')} / {t('top_agents')}</span>}
                <button
                    type="button"
                    className="w-7 h-7 flex items-center justify-center rounded border border-[#333] text-gray-500 hover:text-white hover:border-gray-500"
                    onClick={toggleCollapsed}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>
            </div>

            {collapsed && (
                <div className="flex-1 p-2 flex flex-col items-center gap-2">
                    <button
                        type="button"
                        className={`w-9 h-9 rounded border flex items-center justify-center ${logsOpen ? 'border-blue-500 text-blue-500 bg-blue-500/10' : 'border-[#333] text-gray-500 hover:text-white'}`}
                        onClick={() => { setCollapsed(false); setLogsOpen(true); }}
                        title={t('terminal_logs')}
                    >
                        <Activity size={16} />
                    </button>
                    <button
                        type="button"
                        className={`w-9 h-9 rounded border flex items-center justify-center ${rankingsOpen ? 'border-yellow-500 text-yellow-500 bg-yellow-500/10' : 'border-[#333] text-gray-500 hover:text-white'}`}
                        onClick={() => { setCollapsed(false); setRankingsOpen(true); }}
                        title={t('top_agents')}
                    >
                        <Trophy size={16} />
                    </button>
                    <button
                        type="button"
                        className={`w-9 h-9 rounded border flex items-center justify-center ${hotOpen ? 'border-orange-500 text-orange-500 bg-orange-500/10' : 'border-[#333] text-gray-500 hover:text-white'}`}
                        onClick={() => { setCollapsed(false); setHotOpen(true); }}
                        title={t('hot_cells')}
                    >
                        <Flame size={16} />
                    </button>
                </div>
            )}

            {!collapsed && (
                <>
                    <div className="flex-1 overflow-hidden flex flex-col border-b border-[#222]">
                        <button
                            type="button"
                            onClick={() => setLogsOpen(v => !v)}
                            className="p-3 bg-[#111] border-b border-[#222] flex items-center justify-between gap-2 text-gray-400 font-bold uppercase tracking-wider hover:bg-[#151515]"
                        >
                            <span className="flex items-center gap-2">
                                <Activity size={14} className="text-blue-500" />
                                {t('terminal_logs')}
                            </span>
                            <ChevronDown size={14} className={`transition-transform ${logsOpen ? 'rotate-0' : '-rotate-90'}`} />
                        </button>
                        {logsOpen && (
                            <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                {events.length === 0 && <div className="text-gray-600 italic p-2">{t('system_idle')}</div>}
                                {events.map((ev) => (
                                    <div key={ev.id} className="group flex gap-2 text-[10px] text-gray-500 hover:bg-[#111] p-1 rounded transition-colors">
                                        <div className="text-gray-600 shrink-0 w-16 text-right">
                                            {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                        <div className="flex-1 break-all">
                                            <span className={ev.event_type === 'purchase' ? 'text-green-500' : 'text-blue-500'}>
                                                [{ev.event_type === 'purchase' ? 'BUY' : 'UPD'}]
                                            </span>{' '}
                                            {ev.x != null && (
                                                <button onClick={() => onNavigate(ev.x!, ev.y!)} className="hover:text-white underline decoration-gray-700">
                                                    ({ev.x},{ev.y})
                                                </button>
                                            )}{' '}
                                            {ev.owner && <span className="text-gray-400">{truncAddr(ev.owner)}</span>}{' '}
                                            {ev.message || (ev.event_type === 'purchase' ? t('buy_action') : t('update_action'))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col bg-[#050505]">
                        <button
                            type="button"
                            onClick={() => setRankingsOpen(v => !v)}
                            className="p-3 bg-[#111] border-b border-[#222] flex items-center justify-between gap-2 text-gray-400 font-bold uppercase tracking-wider hover:bg-[#151515]"
                        >
                            <span className="flex items-center gap-2">
                                <Trophy size={14} className="text-yellow-500" />
                                {t('top_agents')}
                            </span>
                            <ChevronDown size={14} className={`transition-transform ${rankingsOpen ? 'rotate-0' : '-rotate-90'}`} />
                        </button>
                        {rankingsOpen && (
                            <div className="overflow-y-auto p-2">
                                <div className="flex justify-between text-[10px] text-gray-600 mb-2 px-2">
                                    <span>{t('agent_col')}</span>
                                    <span>{t('nodes_col')}</span>
                                </div>
                                {holders.map((h, i) => (
                                    <div key={i} className="flex justify-between items-center px-2 py-1 text-gray-400 hover:bg-[#111] rounded cursor-pointer" onClick={() => h.x != null && onNavigate(h.x, h.y!)}>
                                        <div className="flex items-center gap-2">
                                            <span className={`font-mono w-4 text-right ${i < 3 ? 'text-yellow-500' : 'text-gray-600'}`}>#{i + 1}</span>
                                            <span>{truncAddr(h.owner)}</span>
                                        </div>
                                        <span className="text-green-500 font-bold">{h.cell_count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col bg-[#050505]">
                        <button
                            type="button"
                            onClick={() => setHotOpen(v => !v)}
                            className="p-3 bg-[#111] border-b border-[#222] flex items-center justify-between gap-2 text-gray-400 font-bold uppercase tracking-wider hover:bg-[#151515]"
                        >
                            <span className="flex items-center gap-2">
                                <Flame size={14} className="text-orange-500" />
                                {t('hot_cells')}
                            </span>
                            <ChevronDown size={14} className={`transition-transform ${hotOpen ? 'rotate-0' : '-rotate-90'}`} />
                        </button>
                        {hotOpen && (
                            <div className="overflow-y-auto p-2">
                                {hot.length === 0 && <div className="text-gray-600 italic text-[10px] p-2">{t('no_data')}</div>}
                                {hot.map((h, i) => (
                                    <div key={i} className="flex justify-between items-center px-2 py-1 text-gray-400 hover:bg-[#111] rounded cursor-pointer" onClick={() => onNavigate(h.x, h.y)}>
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className={`font-mono w-4 text-right shrink-0 ${i < 3 ? 'text-orange-500' : 'text-gray-600'}`}>#{i + 1}</span>
                                            <span className="text-gray-500 shrink-0">({h.x},{h.y})</span>
                                            {h.title && <span className="truncate text-gray-300">{h.title}</span>}
                                        </div>
                                        <span className="text-orange-400 font-bold shrink-0 ml-2">{h.hit_count} {t('views')}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}

            {!collapsed && (
                <div
                    className={`absolute right-0 top-0 h-full w-2 translate-x-1/2 cursor-col-resize ${isResizing ? 'bg-green-500/30' : 'bg-transparent hover:bg-green-500/15'}`}
                    onMouseDown={beginResize}
                    onDoubleClick={() => setSidebarWidth(DEFAULT_WIDTH)}
                    title="Drag to resize"
                />
            )}
        </div>
    );
};
