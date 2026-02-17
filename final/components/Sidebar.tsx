import React from 'react';
import { GridEvent, Ranking, truncAddr } from '../app/types';
import { Activity, Trophy } from 'lucide-react';
import { useLang } from '../lib/LangContext';

interface SidebarProps {
    events: GridEvent[];
    holders: Ranking[];
    recent: Ranking[];
    onNavigate: (x: number, y: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ events, holders, recent, onNavigate }) => {
    const { t } = useLang();
    return (
        <div className="h-full w-80 bg-[#0a0a0a] border-r border-[#222] flex flex-col font-mono text-xs">
            <div className="flex-1 overflow-hidden flex flex-col border-b border-[#222]">
                <div className="p-3 bg-[#111] border-b border-[#222] flex items-center gap-2 text-gray-400 font-bold uppercase tracking-wider">
                    <Activity size={14} className="text-blue-500" />
                    {t('terminal_logs')}
                </div>
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
            </div>

            <div className="h-1/3 flex flex-col bg-[#050505]">
                <div className="p-3 bg-[#111] border-b border-[#222] flex items-center gap-2 text-gray-400 font-bold uppercase tracking-wider">
                    <Trophy size={14} className="text-yellow-500" />
                    {t('top_agents')}
                </div>
                <div className="flex-1 overflow-y-auto p-2">
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
            </div>
        </div>
    );
};
