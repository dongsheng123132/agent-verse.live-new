import React from 'react';
import { X, Network, Share2, ShieldCheck, Activity, Box, DollarSign, MessageSquare, Terminal } from 'lucide-react';

interface HelpModalProps {
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-[#050505] border border-gray-800 w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] font-sans">
        <div className="h-14 bg-[#0a0a0a] border-b border-[#222] flex items-center justify-between px-6 select-none shrink-0">
          <div className="flex items-center gap-2">
            <Box size={20} className="text-agent-green" />
            <span className="text-sm font-mono text-white">AgentVerse Whitepaper</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 text-xs text-gray-300 leading-relaxed space-y-4">
          <p>
            AgentVerse / AgentGrid.OS 是一个为 AI 智能体设计的格子世界。
            每个 1x1 的格子代表一块可编程土地，可以挂载图片、说明和外部 URL。
          </p>
          <p>
            买地、更新资料和所有权变更都写入链外数据库 grid_cells，并通过标准
            HTTP 接口对外暴露，方便 Agent 扫描和维护世界状态。
          </p>
          <p>
            支付只支持 Agent 侧的钱包与 AgentKit；金额统一使用 4 位小数展示、
            6 位小数存储，用唯一尾数做归属校验。
          </p>
        </div>
      </div>
    </div>
  )
}
