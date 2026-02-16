
import React, { useState } from 'react';
import { GridCell, ActivityLog } from '../types';
import { Search, Terminal, Activity, Server, Clock, Wifi } from 'lucide-react';

interface ForumFeedProps {
  grid: GridCell[];
  logs: ActivityLog[];
  currentUser: string | null;
  onNavigateToCell: (cell: GridCell) => void;
  t: any;
}

export const ForumFeed: React.FC<ForumFeedProps> = ({ grid, logs, onNavigateToCell, t }) => {
  const [activeTab, setActiveTab] = useState<'NODES' | 'LOGS'>('NODES');
  const [filter, setFilter] = useState('');

  // 1. Process Nodes
  const nodes = grid
    .filter(c => c.agentData && c.agentData.name)
    .map(c => ({
        timestamp: new Date().toISOString().split('T')[1].replace('Z',''),
        id: `N:${c.x},${c.y}`,
        name: c.agentData?.name,
        protocol: c.agentData?.protocol || 'HTTP',
        status: c.status,
        cell: c,
        desc: c.agentData?.description
    }))
    .filter(n => 
        n.name?.toLowerCase().includes(filter.toLowerCase()) || 
        n.protocol.toLowerCase().includes(filter.toLowerCase())
    );

  // 2. Process Logs
  const streamLogs = logs.filter(l => 
    l.message.toLowerCase().includes(filter.toLowerCase()) ||
    l.type.toLowerCase().includes(filter.toLowerCase())
  ).sort((a,b) => b.timestamp - a.timestamp);

  return (
    <div className="flex-1 bg-black flex flex-col overflow-hidden font-mono text-[11px] md:text-xs">
        
        {/* Mobile Terminal Header */}
        <div className="bg-[#080808] border-b border-[#222] p-2 flex flex-col gap-2 shrink-0">
            {/* Tabs */}
            <div className="flex items-center gap-1 bg-[#111] p-1 rounded border border-[#222] self-start">
                <button 
                    onClick={() => setActiveTab('NODES')}
                    className={`px-3 py-1.5 rounded flex items-center gap-2 transition-all ${activeTab === 'NODES' ? 'bg-[#222] text-green-500 shadow-sm' : 'text-gray-500'}`}
                >
                    <Server size={12}/> {t.NAV_MAP}
                </button>
                <button 
                    onClick={() => setActiveTab('LOGS')}
                    className={`px-3 py-1.5 rounded flex items-center gap-2 transition-all ${activeTab === 'LOGS' ? 'bg-[#222] text-blue-400 shadow-sm' : 'text-gray-500'}`}
                >
                    <Activity size={12}/> {t.NAV_FEED}
                </button>
            </div>

            {/* Filter */}
            <div className="relative w-full">
                <Search size={12} className="absolute left-2.5 top-2 text-gray-600"/>
                <input 
                    type="text" 
                    placeholder="grep -i 'search'..." 
                    className="w-full bg-black border border-[#333] rounded pl-8 pr-4 py-1.5 text-gray-300 focus:border-gray-500 outline-none placeholder:text-gray-700"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-black p-0 pb-16 md:pb-0">
            
            {/* --- NODES VIEW --- */}
            {activeTab === 'NODES' && (
                <div className="flex flex-col">
                    {nodes.length === 0 && (
                        <div className="p-8 text-center text-gray-600 italic">{t.TXT_WAITING}</div>
                    )}
                    {nodes.map((node, i) => (
                        <div 
                            key={i} 
                            onClick={() => onNavigateToCell(node.cell)}
                            className="group border-b border-[#111] p-3 active:bg-[#111] md:hover:bg-[#0a0a0a] cursor-pointer flex gap-3 items-start"
                        >
                            <div className="text-gray-600 shrink-0 w-14 text-[10px] mt-0.5">{node.timestamp}</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-blue-500 font-bold">{node.id}</span>
                                    <span className="text-gray-300 truncate font-bold">{node.name}</span>
                                </div>
                                <div className="text-gray-500 break-words leading-tight">
                                    {node.desc || 'System node operational. No public manifest.'}
                                </div>
                                <div className="mt-2 flex gap-2">
                                    <span className="text-[9px] border border-gray-800 px-1 rounded text-yellow-600">{node.protocol}</span>
                                    <span className={`text-[9px] border border-gray-800 px-1 rounded ${node.status === 'HIRING' ? 'text-red-500 border-red-900/30' : 'text-gray-600'}`}>{node.status}</span>
                                </div>
                            </div>
                            <div className="text-gray-700 group-hover:text-green-500 transition-colors mt-1">
                                <Terminal size={14}/>
                            </div>
                        </div>
                    ))}
                    <div className="p-4 text-center text-gray-700 animate-pulse text-[10px]">
                        _ END OF BUFFER
                    </div>
                </div>
            )}

            {/* --- LOGS VIEW --- */}
            {activeTab === 'LOGS' && (
                <div className="flex flex-col font-mono">
                    {streamLogs.map((log) => (
                        <div key={log.id} className="border-b border-[#111] p-2 px-3 hover:bg-[#080808] flex gap-2 text-[10px] items-start">
                             <div className="text-gray-600 shrink-0 pt-0.5 w-12">
                                {new Date(log.timestamp).toLocaleTimeString([], {hour12: false, hour:'2-digit', minute:'2-digit'})}
                             </div>
                             <div className="flex-1 break-all">
                                <span className={`font-bold mr-2 ${log.type === 'ANNOUNCEMENT' ? 'text-yellow-500' : 'text-blue-500'}`}>
                                    {log.type}
                                </span>
                                <span className="text-gray-400">{log.message}</span>
                             </div>
                        </div>
                    ))}
                    <div className="p-2 flex items-center gap-2 text-green-500 text-[10px] border-t border-green-900/20 bg-green-900/5">
                        <Wifi size={10} className="animate-pulse"/>
                        <span>SOCKET_CONNECTED</span>
                    </div>
                </div>
            )}
        </div>
    </div>
  );
};
