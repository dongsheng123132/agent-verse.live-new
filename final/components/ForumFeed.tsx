import React from 'react';
import { GridEvent, truncAddr } from '../app/types';
import { MessageSquare, User } from 'lucide-react';
import { useLang } from '../lib/LangContext';

interface ForumFeedProps {
    events: GridEvent[];
    onNavigate: (x: number, y: number) => void;
}

export const ForumFeed: React.FC<ForumFeedProps> = ({ events, onNavigate }) => {
    const { t } = useLang();
    return (
        <div className="flex flex-col h-full bg-[#050505] overflow-y-auto">
            <div className="sticky top-0 z-10 bg-[#0a0a0a] border-b border-[#222] p-4">
                <h2 className="text-green-500 font-mono font-bold text-lg flex items-center gap-2">
                    <MessageSquare size={20} /> {t('global_feed')}
                </h2>
                <p className="text-gray-500 text-xs mt-1">{t('feed_desc')}</p>
            </div>

            <div className="p-4 space-y-4">
                {events.map((ev) => {
                    const d = new Date(ev.created_at);
                    const yyyy = d.getUTCFullYear();
                    const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
                    const dd = d.getUTCDate().toString().padStart(2, '0');
                    const hh = d.getUTCHours().toString().padStart(2, '0');
                    const mi = d.getUTCMinutes().toString().padStart(2, '0');
                    const ts = `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
                    return (
                        <div key={ev.id} className="bg-[#111] border border-[#222] rounded p-3 flex gap-3">
                        <div className="shrink-0 pt-1">
                            <div className="w-8 h-8 rounded bg-[#222] flex items-center justify-center text-gray-500">
                                <User size={16} />
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start">
                                <span className="text-green-500 font-mono text-xs font-bold">
                                    {ev.owner ? truncAddr(ev.owner) : 'System'}
                                </span>
                                <span className="text-gray-600 text-[10px] font-mono">
                                    {ts}
                                </span>
                            </div>
                            <div className="mt-1 text-gray-300 text-sm break-words">
                                {ev.message || (ev.event_type === 'purchase'
                                    ? `${t('purchased_node')} ${ev.block_size || '1x1'} ${t('node_at')} (${ev.x},${ev.y})`
                                    : `${t('updated_node')} (${ev.x},${ev.y})`
                                )}
                            </div>
                            {ev.x != null && (
                                <div className="mt-2 pt-2 border-t border-[#222]">
                                    <button onClick={() => onNavigate(ev.x!, ev.y!)}
                                        className="text-xs text-blue-500 hover:text-blue-400 font-mono flex items-center gap-1">
                                        {t('jump_to')} [{ev.x}, {ev.y}]
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                    );
                })}
            </div>
        </div>
    );
};
