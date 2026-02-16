
import React, { useState, useEffect } from 'react';
import { GridCell, AgentProfile, CellStatus } from '../types';
import { BASE_LAND_PRICE } from '../constants';
import { X, Globe, FileText, Code, Lock, Copy, Bot, Wallet, Layers, Box, Cpu, DollarSign, ExternalLink } from 'lucide-react';

interface DetailModalProps {
  cells: GridCell[];
  currentUser: string | null;
  onClose: () => void;
  onBuy: (cellIds: number[], totalPrice: number) => void;
  onUpdate: (cellIds: number[], data: AgentProfile, status: CellStatus, isForSale: boolean, price: number) => void;
  t: any;
}

export const DetailModal: React.FC<DetailModalProps> = ({ 
  cells, 
  onClose, 
  t
}) => {
  if (cells.length === 0) return null;

  const firstCell = cells[0];
  const isMulti = cells.length > 1;
  const isLocked = cells.some(c => c.status === 'LOCKED');
  const isBuyable = cells.every(c => (!c.owner) || c.isForSale);
  
  // Pricing Logic
  let integerCost = 0;
  if (isBuyable) {
      cells.forEach((c, index) => {
          const p = c.price > 0 ? c.price : BASE_LAND_PRICE; 
          const multiplier = Math.pow(2, index);
          integerCost += p * multiplier;
      });
  }

  // Verification Logic
  const decimalSeed = (firstCell.x * 137 + firstCell.y * 13);
  const finalAmount = (integerCost + (decimalSeed % 9000 + 1000) / 100000).toFixed(4);
  const decimalPart = finalAmount.split('.')[1];

  // Default Tab Logic
  const [tab, setTab] = useState<'MANIFEST' | 'API' | 'PAYMENT'>('MANIFEST');
  
  useEffect(() => {
      if (isBuyable && !isLocked) {
          setTab('PAYMENT');
      } else {
          setTab('MANIFEST');
      }
  }, [isBuyable, isLocked]);

  const formData = firstCell.agentData || {
      name: '', description: '', readme: 'No service description.',
      apiEndpoint: 'https://', avatarUrl: '', capabilities: [], 
      costPerCall: 0, inputSchema: '{}', outputSchema: '{}',
      protocol: 'HTTP', uptime: 0, creditScore: 0
  };

  const paymentAddress = "0xe6EA7c31A85A1f42DFAc6C49155bE90722246890"; 
  const coordString = cells.map(c => `[${c.x},${c.y}]`).join(' + ');

  const skillMdContent = `
>>> TASK: ACQUIRE_LAND
TARGET: ${coordString}
PAY: ${finalAmount} USDC
TO: ${paymentAddress}
VERIFY: .${decimalPart}
`.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-[#0a0a0a] border border-[#333] w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] font-sans text-sm pb-safe rounded-lg overflow-hidden">
        
        {/* Header */}
        <div className="h-14 bg-[#111] border-b border-[#333] flex items-center justify-between px-6 select-none shrink-0">
            <div className="flex items-center gap-4">
                {formData.avatarUrl ? (
                    <img src={formData.avatarUrl} className="w-8 h-8 rounded bg-black border border-[#333] object-cover" />
                ) : (
                    <Box size={24} className="text-gray-500"/>
                )}
                <div>
                    <div className="text-white font-bold text-base md:text-lg font-mono flex items-center gap-2">
                         {isMulti ? `MULTI_SELECTION` : (formData.name || (isLocked ? 'RESTRICTED' : 'UNNAMED'))}
                    </div>
                    {firstCell.owner && (
                        <div className="text-[10px] text-gray-500 font-mono flex items-center gap-2">
                             OWNER: {firstCell.owner.slice(0, 8)}...
                             <span className="bg-[#222] px-1 rounded text-gray-400">{formData.protocol}</span>
                        </div>
                    )}
                </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            
            {/* Sidebar Tabs */}
            <div className="w-full md:w-40 bg-[#0f0f0f] border-b md:border-b-0 md:border-r border-[#222] flex md:flex-col shrink-0 overflow-x-auto md:overflow-visible">
                 
                 {isBuyable && !isLocked && (
                    <button 
                        onClick={() => setTab('PAYMENT')} 
                        className={`flex items-center gap-2 px-4 py-3 text-[10px] font-bold whitespace-nowrap ${tab === 'PAYMENT' ? 'bg-[#1a1a1a] text-green-500 border-l-2 border-green-500' : 'text-gray-500'}`}
                    >
                        <Wallet size={14}/> {t.TAB_PAYMENT}
                    </button>
                 )}

                 <button 
                    onClick={() => setTab('MANIFEST')} 
                    className={`flex items-center gap-2 px-4 py-3 text-[10px] font-medium whitespace-nowrap ${tab === 'MANIFEST' ? 'bg-[#1a1a1a] text-white border-l-2 border-green-500' : 'text-gray-500'}`}
                 >
                    <FileText size={14}/> {t.TAB_MANIFEST}
                 </button>
                 
                 {!isLocked && !isBuyable && (
                    <button 
                        onClick={() => setTab('API')} 
                        className={`flex items-center gap-2 px-4 py-3 text-[10px] font-medium whitespace-nowrap ${tab === 'API' ? 'bg-[#1a1a1a] text-white border-l-2 border-green-500' : 'text-gray-500'}`}
                    >
                        <Code size={14}/> {t.TAB_API}
                    </button>
                 )}
            </div>

            {/* Content */}
            <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-[#050505]">
                
                {/* --- TAB: PAYMENT --- */}
                {tab === 'PAYMENT' && !isLocked && (
                    <div className="space-y-6">
                        <div className="bg-gradient-to-r from-green-900/10 to-blue-900/10 border border-green-900/30 rounded p-4">
                            <h3 className="text-green-500 font-mono font-bold text-xs mb-2 flex items-center gap-2">
                                <DollarSign size={14}/> ACQUISITION_COST
                            </h3>
                            <div className="text-3xl font-mono text-white font-bold tracking-tighter">
                                {finalAmount} <span className="text-sm text-gray-500">USDC</span>
                            </div>
                        </div>
                        
                        <div className="bg-[#0a0a0a] border border-gray-700 p-4 rounded relative">
                            <div className="text-[10px] text-gray-500 font-bold mb-2">AGENT INSTRUCTION</div>
                            <pre className="text-[10px] text-gray-300 font-mono whitespace-pre-wrap leading-relaxed select-all">
                                {skillMdContent}
                            </pre>
                            <button 
                                className="absolute top-3 right-3 p-1.5 bg-[#222] rounded hover:bg-[#333] text-white"
                                onClick={() => navigator.clipboard.writeText(skillMdContent)}
                            >
                                <Copy size={12}/>
                            </button>
                        </div>
                    </div>
                )}

                {/* --- TAB: MANIFEST --- */}
                {tab === 'MANIFEST' && (
                    <div className="space-y-6">
                        {!isLocked && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-[#111] p-3 rounded border border-[#222]">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Service Cost</div>
                                    <div className="text-white font-mono text-sm font-bold flex items-center gap-1">
                                        {formData.costPerCall.toFixed(4)} <span className="text-gray-600 text-[10px]">USDC/Call</span>
                                    </div>
                                </div>
                                <div className="bg-[#111] p-3 rounded border border-[#222]">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold mb-1">Uptime</div>
                                    <div className="text-green-400 font-mono text-sm font-bold">
                                        {formData.uptime}%
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="prose prose-invert prose-sm max-w-none">
                            <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Description</h4>
                            <div className="bg-[#111] p-4 rounded border border-[#222] min-h-[100px]">
                                <pre className="whitespace-pre-wrap text-gray-400 font-mono text-xs leading-5 line-clamp-[10]">
                                    {formData.readme || formData.description}
                                </pre>
                            </div>
                        </div>

                        {!isLocked && (
                             <div className="flex gap-2">
                                {formData.capabilities.map(cap => (
                                    <span key={cap} className="px-2 py-1 bg-[#222] text-gray-400 text-[10px] rounded border border-[#333] font-mono">
                                        {cap}
                                    </span>
                                ))}
                             </div>
                        )}
                    </div>
                )}

                {/* --- TAB: API --- */}
                {tab === 'API' && !isLocked && !isBuyable && (
                    <div className="space-y-6 font-mono text-xs">
                        
                        <div className="space-y-2">
                            <label className="text-gray-500 block text-[10px] uppercase font-bold">Endpoint</label>
                            <div className="flex items-center gap-2 bg-black p-3 rounded border border-[#333] text-green-400 overflow-x-auto">
                                <span className="text-gray-500 font-bold shrink-0">POST</span>
                                <span className="select-all">{formData.apiEndpoint}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="text-gray-500 block text-[10px] uppercase font-bold mb-2">Input Schema (JSON)</label>
                                <div className="bg-[#111] p-3 rounded border border-[#222] text-gray-400 overflow-x-auto">
                                    <pre>{formData.inputSchema}</pre>
                                </div>
                            </div>
                             <div>
                                <label className="text-gray-500 block text-[10px] uppercase font-bold mb-2">Output Schema (JSON)</label>
                                <div className="bg-[#111] p-3 rounded border border-[#222] text-gray-400 overflow-x-auto">
                                    <pre>{formData.outputSchema}</pre>
                                </div>
                            </div>
                        </div>
                        
                        <button className="w-full bg-[#1a1a1a] hover:bg-[#222] border border-[#333] text-white py-2 rounded flex items-center justify-center gap-2 transition-colors">
                            <ExternalLink size={14}/> Test Endpoint (External)
                        </button>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
