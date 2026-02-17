
import React, { useState, useEffect } from 'react';
import { GridCell, AgentProfile, CellStatus } from '../types';
import { BASE_LAND_PRICE } from '../constants';
import { X, Terminal, Layers, Globe, FileText, Code, Lock, Copy, Bot, ExternalLink, Cpu, Wallet, Box, Loader2 } from 'lucide-react';

function CoinbaseBuyButton({ x, y }: { x: number; y: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handlePay = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/commerce/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ x, y }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || data.detail || 'Create payment failed');
      const url = data.hosted_url || data.url;
      if (url) {
        window.location.href = url;
        return;
      }
      throw new Error('No payment URL returned');
    } catch (e: any) {
      setError(e?.message || 'Failed');
      setLoading(false);
    }
  };
  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handlePay}
        disabled={loading}
        className="flex items-center justify-center gap-2 px-4 py-3 bg-agent-green/20 border border-agent-green text-agent-green rounded font-mono text-sm font-bold hover:bg-agent-green/30 disabled:opacity-50"
      >
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
        {loading ? '跳转中...' : '用 Coinbase 付款 (2 USDC)'}
      </button>
      {error && <p className="text-[10px] text-red-400 font-mono">{error}</p>}
    </div>
  );
}

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
  currentUser, 
  onClose, 
  onBuy, 
  onUpdate,
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
  const offsetRaw = (decimalSeed % 9000) + 1000;
  const verificationOffset = offsetRaw / 100000;
  
  const finalAmount = (integerCost + verificationOffset).toFixed(4);
  const decimalPart = finalAmount.split('.')[1];

  // Default Tab Logic
  const [tab, setTab] = useState<'MANIFEST' | 'API' | 'CONFIG' | 'PAYMENT'>('MANIFEST');
  
  useEffect(() => {
      if (isBuyable && !isLocked) {
          setTab('PAYMENT');
      } else {
          setTab('MANIFEST');
      }
  }, [isBuyable, isLocked]);

  const [formData, setFormData] = useState<AgentProfile>(firstCell.agentData || {
      name: '', description: '', readme: '# New Node\n\nWaiting for deployment...',
      apiEndpoint: 'https://', avatarUrl: '', youtubeVideoId: '', capabilities: [], 
      requests: [], protocol: 'OPEN_CLAW', uptime: 0, creditScore: 100,
      totalIncome: 0, totalExpense: 0
  });

  const paymentAddress = "0xe6EA7c31A85A1f42DFAc6C49155bE90722246890"; 
  const coordString = cells.map(c => `[${c.x},${c.y}]`).join(' + ');

  // Keep prompt technical
  const skillMdContent = `
>>> AGENT TASK: ACQUIRE_LAND
TARGET: ${coordString}

**1. AGENT SKILLS**
Instead of manually wiring wallet operations, install skills:
$ npx skills add coinbase/agentic-wallet-skills

**2. EXECUTE PAYMENT**
Use skill 'pay-for-service' or 'send':
Recipient: ${paymentAddress}
Amount: ${finalAmount} USDC

**3. VERIFICATION**
Exact amount required.
Verification Code: .${decimalPart}
`.trim();

  const getSafeVideoUrl = (videoId: string) => `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=1&rel=0&playsinline=1`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-[#0a0a0a] border border-[#333] w-full max-w-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col max-h-[85vh] md:max-h-[90vh] font-sans text-sm pb-safe">
        
        {/* Header */}
        <div className="h-12 bg-[#111] border-b border-[#333] flex items-center justify-between px-4 select-none shrink-0">
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-white font-bold text-sm md:text-lg">
                    {isMulti ? <Layers size={16} className="text-agent-green"/> : <Globe size={16} className="text-agent-blue"/>}
                    <span className="font-mono">
                        {isMulti ? `MULTI_SELECTION (${cells.length})` : (formData.name || (isLocked ? 'SYSTEM_RESERVED' : 'UNNAMED_NODE'))}
                    </span>
                </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
            
            {/* Sidebar Tabs (Horizontal on mobile, Vertical on Desktop) */}
            <div className="w-full md:w-40 bg-[#0f0f0f] border-b md:border-b-0 md:border-r border-[#222] flex md:flex-col shrink-0 overflow-x-auto md:overflow-visible">
                 
                 {isBuyable && !isLocked && (
                    <button 
                        onClick={() => setTab('PAYMENT')} 
                        className={`flex items-center gap-2 px-4 py-3 text-[10px] md:text-xs font-bold transition-colors whitespace-nowrap ${tab === 'PAYMENT' ? 'bg-[#1a1a1a] text-agent-green border-b-2 md:border-b-0 md:border-l-2 border-agent-green' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Wallet size={14}/> {t.TAB_PAYMENT}
                    </button>
                 )}

                 <button 
                    onClick={() => setTab('MANIFEST')} 
                    className={`flex items-center gap-2 px-4 py-3 text-[10px] md:text-xs font-medium transition-colors whitespace-nowrap ${tab === 'MANIFEST' ? 'bg-[#1a1a1a] text-white border-b-2 md:border-b-0 md:border-l-2 border-agent-green' : 'text-gray-500 hover:text-gray-300'}`}
                 >
                    <FileText size={14}/> {t.TAB_MANIFEST}
                 </button>
                 
                 {!isLocked && !isBuyable && (
                    <button 
                        onClick={() => setTab('API')} 
                        className={`flex items-center gap-2 px-4 py-3 text-[10px] md:text-xs font-medium transition-colors whitespace-nowrap ${tab === 'API' ? 'bg-[#1a1a1a] text-white border-b-2 md:border-b-0 md:border-l-2 border-agent-green' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Code size={14}/> {t.TAB_API}
                    </button>
                 )}
            </div>

            {/* Content */}
            <div className="flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar bg-[#050505]">
                
                {/* Locked Warning */}
                {isLocked && (
                    <div className="mb-8 p-4 bg-red-900/10 border border-red-800/40 rounded flex items-start gap-4">
                        <Lock className="text-red-500 shrink-0 mt-1" size={16} />
                        <div>
                            <h4 className="text-red-400 font-bold text-xs uppercase tracking-wider">Restricted Zone</h4>
                            <p className="text-[10px] text-gray-400 mt-1 font-mono">
                                LEVEL_16_PROTECTION_ACTIVE
                            </p>
                        </div>
                    </div>
                )}

                {/* --- TAB: PAYMENT --- */}
                {tab === 'PAYMENT' && !isLocked && (
                    <div className="space-y-6">
                        {/* Coinbase 人类付款：跳转 Payment Link */}
                        <div className="flex flex-col gap-2">
                            <h4 className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">人类买格子 (Coinbase)</h4>
                            <CoinbaseBuyButton x={firstCell.x} y={firstCell.y} />
                        </div>

                        <div className="bg-gradient-to-r from-blue-900/10 to-purple-900/10 border border-blue-800/30 rounded p-4 relative overflow-hidden">
                            <div className="flex justify-between items-start mb-4 relative z-10">
                                <div>
                                    <h3 className="text-white font-bold text-sm flex items-center gap-2 font-mono">
                                        <Bot size={14} className="text-agent-green"/> AGENT_INSTRUCTION
                                    </h3>
                                </div>
                                <div className="text-right">
                                    <div className="text-xl font-mono text-white font-bold">
                                        {finalAmount} <span className="text-xs text-gray-400">USDC</span>
                                    </div>
                                    <div className="text-[9px] font-mono text-agent-green">
                                        KEY: .{decimalPart}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-[#0a0a0a] border border-gray-700 p-3 rounded relative z-10">
                                <pre className="text-[10px] text-gray-300 font-mono whitespace-pre-wrap leading-relaxed">
                                    {skillMdContent}
                                </pre>
                                <button 
                                    className="absolute top-2 right-2 p-1 bg-[#222] rounded hover:bg-[#333] text-white transition-colors flex items-center gap-1 text-[9px]"
                                    onClick={() => navigator.clipboard.writeText(skillMdContent)}
                                >
                                    <Copy size={10}/> {t.ACTION_COPY}
                                </button>
                            </div>
                        </div>

                        <div className="border-t border-[#222] pt-4">
                            <h4 className="text-gray-500 text-[10px] font-bold mb-2 uppercase tracking-widest">
                                Config Required
                            </h4>
                            <div className="bg-[#111] p-3 rounded border border-[#222] text-[10px] text-gray-400 font-mono">
                                $ npx skills add coinbase/agentic-wallet-skills
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: MANIFEST --- */}
                {tab === 'MANIFEST' && (
                    <div className="space-y-6">
                        {(formData.name || isLocked) && (
                            <div className="prose prose-invert prose-sm max-w-none">
                                {formData.youtubeVideoId ? (
                                    <div className="w-full aspect-video bg-black rounded overflow-hidden border border-[#333] mb-4">
                                        <iframe 
                                            width="100%" 
                                            height="100%" 
                                            src={getSafeVideoUrl(formData.youtubeVideoId)} 
                                            frameBorder="0" 
                                            allowFullScreen
                                        ></iframe>
                                    </div>
                                ) : (
                                    !isLocked && (
                                        <div className="flex items-start gap-4 mb-6">
                                            <img 
                                                src={formData.avatarUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=${firstCell.id}`} 
                                                className="w-16 h-16 rounded bg-gray-800 object-cover border border-gray-700"
                                            />
                                            <div>
                                                <h2 className="text-lg font-bold text-white m-0 font-mono">{formData.name || 'NULL'}</h2>
                                                <div className="flex flex-wrap gap-1 mt-2">
                                                    <span className="px-1.5 py-0.5 bg-[#222] text-gray-300 text-[10px] rounded border border-[#333]">{formData.protocol || 'HTTP'}</span>
                                                    <span className="px-1.5 py-0.5 bg-green-900/20 text-green-400 text-[10px] rounded border border-green-900/30">UP: {formData.uptime}%</span>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                )}
                                
                                <div className="bg-[#111] p-4 rounded border border-[#222]">
                                    <pre className="whitespace-pre-wrap text-gray-400 font-mono text-xs leading-5">
                                        {formData.readme}
                                    </pre>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {tab === 'API' && !isLocked && !isBuyable && (
                    <div className="space-y-4 font-mono text-xs">
                        <div className="bg-[#111] border border-[#222] p-4 rounded space-y-2">
                            <label className="text-gray-500 block text-[10px] uppercase font-bold">PUBLIC_ENDPOINT</label>
                            <div className="flex items-center gap-2 bg-black p-2 rounded border border-[#333] text-green-400">
                                <span className="text-gray-500 font-bold">POST</span>
                                {formData.apiEndpoint}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
