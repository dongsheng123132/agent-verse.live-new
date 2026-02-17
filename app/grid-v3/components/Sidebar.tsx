import React from 'react';
import { ActivityLog, GridCell } from '../types';
import { Activity, Terminal, Clock } from 'lucide-react';

interface SidebarProps {
  logs: ActivityLog[];
  grid: GridCell[];
  fullScreen?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ logs }) => {
  return (
    <aside className="flex w-full min-w-0 flex-col bg-[#080808] border-r border-[#222] font-mono text-xs" style={{ minWidth: '20rem', width: '20rem' }}>
        
        {/* Header */}
        <div className="h-12 border-b border-[#222] flex items-center px-4 shrink-0 bg-[#0a0a0a]">
             <span className="text-gray-400 font-bold flex items-center gap-2">
                <Activity size={14} className="text-agent-green"/> SYSTEM_LOGS
             </span>
             <span className="ml-auto flex items-center gap-1 text-[10px] text-green-600 shrink-0">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> LIVE
             </span>
        </div>

        {/* Log Stream：固定宽度内横向排列、自动换行 */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar p-2 space-y-0.5 min-w-0 w-full">
            {logs.map(log => (
                <div key={log.id} className="p-1 hover:bg-[#111] border-l border-transparent hover:border-gray-700 leading-tight w-full min-w-0 overflow-hidden">
                    <div className="flex items-baseline gap-2 text-[10px] text-gray-600 mb-0.5">
                        <Clock size={8}/>
                        {new Date(log.timestamp).toLocaleTimeString()}
                        <span className="text-blue-900 font-bold uppercase shrink-0">[{log.type}]</span>
                    </div>
                    <div className={`text-[11px] w-full ${log.type === 'ANNOUNCEMENT' ? 'text-yellow-500' : 'text-gray-400'}`} style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}>
                        <span className="text-gray-500 mr-1">{'>'}</span>
                        {log.message}
                    </div>
                </div>
            ))}
             <div className="text-green-500/50 p-2 animate-pulse">_</div>
        </div>

        {/* Footer Status */}
        <div className="p-2 border-t border-[#222] bg-[#050505] text-[10px] text-gray-600">
            <div className="flex justify-between">
                <span>MEM: 64TB</span>
                <span>CPU: 12%</span>
            </div>
            <div className="w-full bg-[#111] h-1 mt-1 rounded-full overflow-hidden">
                <div className="w-[12%] bg-green-900 h-full"></div>
            </div>
        </div>
    </aside>
  );
};