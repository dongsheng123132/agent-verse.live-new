import React, { useState, useEffect } from 'react';
import { GridCell, AgentProfile, CellStatus } from '../types';
import { BASE_LAND_PRICE } from '../constants';
import { X, FileText, Code, Lock, Wallet, Box, DollarSign, Loader2, Check } from 'lucide-react';

interface DetailModalProps {
  cells: GridCell[];
  onClose: () => void;
  onUpdate: (cellIds: number[], data: AgentProfile, status: CellStatus, isForSale: boolean, price: number) => void;
  onPurchase?: (cell: GridCell) => void;
  onVerifyPayment?: (txHash: string) => void;
  purchaseStep?: 'idle' | 'creating' | 'pay' | 'verifying' | 'success';
  orderData?: any;
  lang?: 'EN' | 'CN';
}

const LANG = {
  EN: {
    TAB_PAYMENT: 'PAYMENT',
    TAB_MANIFEST: 'MANIFEST',
    TAB_API: 'API',
    PRICE: 'PRICE',
    BUY: 'BUY NOW',
    VERIFY: 'VERIFY PAYMENT',
    OWNER: 'OWNER',
    DESCRIPTION: 'DESCRIPTION',
    STATUS_LOCKED: 'SYSTEM RESERVED',
    STATUS_EMPTY: 'AVAILABLE FOR PURCHASE',
    ENTER_TX: 'Enter Transaction Hash',
    PAYMENT_SENT: 'Payment Sent?',
    SUCCESS: 'Purchase Successful!'
  },
  CN: {
    TAB_PAYMENT: '支付',
    TAB_MANIFEST: '详情',
    TAB_API: '接口',
    PRICE: '价格',
    BUY: '立即购买',
    VERIFY: '验证支付',
    OWNER: '所有者',
    DESCRIPTION: '描述',
    STATUS_LOCKED: '系统保留',
    STATUS_EMPTY: '可购买',
    ENTER_TX: '输入交易哈希',
    PAYMENT_SENT: '已支付?',
    SUCCESS: '购买成功!'
  }
};

export const DetailModal: React.FC<DetailModalProps> = ({
  cells,
  onClose,
  onUpdate,
  onPurchase,
  onVerifyPayment,
  purchaseStep = 'idle',
  orderData,
  lang = 'CN'
}) => {
  const t = LANG[lang];
  const [txHash, setTxHash] = useState('');

  if (cells.length === 0) return null;

  const firstCell = cells[0];
  const isMulti = cells.length > 1;
  const isLocked = cells.some(c => c.status === 'LOCKED');
  const isBuyable = cells.every(c => (!c.owner) || c.isForSale);
  const isOwned = !!firstCell.owner;

  // Pricing Logic
  let integerCost = 0;
  if (isBuyable) {
    cells.forEach((c, index) => {
      const p = c.price > 0 ? c.price : BASE_LAND_PRICE;
      const multiplier = Math.pow(2, index);
      integerCost += p * multiplier;
    });
  }

  // Tab Logic
  const [tab, setTab] = useState<'MANIFEST' | 'API' | 'PAYMENT'>('MANIFEST');

  useEffect(() => {
    if (isBuyable && !isLocked && !isOwned) {
      setTab('PAYMENT');
    } else {
      setTab('MANIFEST');
    }
  }, [isBuyable, isLocked, isOwned]);

  const formData = firstCell.agentData || {
    name: '', description: '', readme: 'No service description.',
    apiEndpoint: 'https://', avatarUrl: '', capabilities: [],
    costPerCall: 0, inputSchema: '{}', outputSchema: '{}',
    protocol: 'HTTP', uptime: 0, creditScore: 0
  };

  const coordString = cells.map(c => `[${c.x},${c.y}]`).join(' + ');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#0a0a0a] border border-[#333] w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] font-sans text-sm rounded-lg overflow-hidden">

        {/* Header */}
        <div className="h-14 bg-[#111] border-b border-[#333] flex items-center justify-between px-6 select-none shrink-0">
          <div className="flex items-center gap-4">
            {formData.avatarUrl ? (
              <img src={formData.avatarUrl} className="w-8 h-8 rounded bg-black border border-[#333] object-cover" />
            ) : (
              <Box size={24} className="text-gray-500" />
            )}
            <div>
              <div className="text-white font-bold text-base md:text-lg font-mono flex items-center gap-2">
                {isMulti ? `MULTI_SELECTION` : (formData.name || (isLocked ? t.STATUS_LOCKED : t.STATUS_EMPTY))}
              </div>
              {firstCell.owner && (
                <div className="text-[10px] text-gray-500 font-mono flex items-center gap-2">
                  {t.OWNER}: {firstCell.owner.slice(0, 8)}...
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

            {isBuyable && !isLocked && !isOwned && (
              <button
                onClick={() => setTab('PAYMENT')}
                className={`flex items-center gap-2 px-4 py-3 text-[10px] font-bold whitespace-nowrap ${tab === 'PAYMENT' ? 'bg-[#1a1a1a] text-green-500 border-l-2 border-green-500' : 'text-gray-500'}`}
              >
                <Wallet size={14} /> {t.TAB_PAYMENT}
              </button>
            )}

            <button
              onClick={() => setTab('MANIFEST')}
              className={`flex items-center gap-2 px-4 py-3 text-[10px] font-medium whitespace-nowrap ${tab === 'MANIFEST' ? 'bg-[#1a1a1a] text-white border-l-2 border-green-500' : 'text-gray-500'}`}
            >
              <FileText size={14} /> {t.TAB_MANIFEST}
            </button>

            {!isLocked && !isBuyable && (
              <button
                onClick={() => setTab('API')}
                className={`flex items-center gap-2 px-4 py-3 text-[10px] font-medium whitespace-nowrap ${tab === 'API' ? 'bg-[#1a1a1a] text-white border-l-2 border-green-500' : 'text-gray-500'}`}
              >
                <Code size={14} /> {t.TAB_API}
              </button>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto bg-[#050505]">

            {/* --- TAB: PAYMENT --- */}
            {tab === 'PAYMENT' && !isLocked && !isOwned && (
              <div className="space-y-6">
                {purchaseStep === 'idle' && (
                  <>
                    <div className="bg-gradient-to-r from-green-900/10 to-blue-900/10 border border-green-900/30 rounded p-4">
                      <h3 className="text-green-500 font-mono font-bold text-xs mb-2 flex items-center gap-2">
                        <DollarSign size={14} /> {t.PRICE}
                      </h3>
                      <div className="text-3xl font-mono text-white font-bold tracking-tighter">
                        {integerCost} <span className="text-sm text-gray-500">USDC</span>
                      </div>
                    </div>

                    <button
                      onClick={() => onPurchase?.(firstCell)}
                      className="w-full py-3 bg-green-600 hover:bg-green-500 text-black font-bold rounded flex items-center justify-center gap-2"
                    >
                      <Wallet size={18} /> {t.BUY}
                    </button>
                  </>
                )}

                {purchaseStep === 'creating' && (
                  <div className="text-center py-8">
                    <Loader2 className="animate-spin mx-auto mb-4 text-green-500" size={32} />
                    <div className="text-gray-400">Creating Order...</div>
                  </div>
                )}

                {purchaseStep === 'pay' && orderData && (
                  <div className="space-y-4">
                    <div className="bg-green-900/20 border border-green-700/50 rounded p-4">
                      <div className="text-xs text-green-500 mb-1">Send Exactly</div>
                      <div className="text-2xl font-mono text-white font-bold">{orderData.unique_amount} USDC</div>
                    </div>

                    <div className="bg-[#0a0a0a] border border-[#333] rounded p-3">
                      <div className="text-[10px] text-gray-500 mb-1">To Address</div>
                      <div className="text-xs font-mono break-all">{orderData.treasury}</div>
                    </div>

                    <div className="bg-[#0a0a0a] border border-[#333] rounded p-3">
                      <div className="text-[10px] text-gray-500 mb-1">{t.ENTER_TX}</div>
                      <input
                        type="text"
                        value={txHash}
                        onChange={(e) => setTxHash(e.target.value)}
                        placeholder="0x..."
                        className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm font-mono mt-1"
                      />
                    </div>

                    <button
                      onClick={() => onVerifyPayment?.(txHash)}
                      disabled={!txHash}
                      className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-black font-bold rounded flex items-center justify-center gap-2"
                    >
                      <Check size={18} /> {t.VERIFY}
                    </button>
                  </div>
                )}

                {purchaseStep === 'verifying' && (
                  <div className="text-center py-8">
                    <Loader2 className="animate-spin mx-auto mb-4 text-green-500" size={32} />
                    <div className="text-gray-400">Verifying Payment...</div>
                  </div>
                )}

                {purchaseStep === 'success' && (
                  <div className="text-center py-8 bg-green-900/20 border border-green-500 rounded">
                    <Check className="mx-auto mb-4 text-green-500" size={48} />
                    <div className="text-green-500 font-bold text-lg">{t.SUCCESS}</div>
                    <button
                      onClick={onClose}
                      className="mt-4 px-6 py-2 bg-green-600 text-black rounded font-bold"
                    >
                      Close
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* --- TAB: MANIFEST --- */}
            {tab === 'MANIFEST' && (
              <div className="space-y-4">
                {isLocked ? (
                  <div className="p-4 bg-red-900/20 border border-red-700/50 rounded text-center">
                    <Lock className="mx-auto mb-2 text-red-500" size={32} />
                    <div className="text-red-500 font-bold">{t.STATUS_LOCKED}</div>
                  </div>
                ) : (
                  <>
                    <div className="text-xs text-gray-500 font-mono mb-2">{t.DESCRIPTION}</div>
                    <div className="text-gray-300 leading-relaxed">{formData.description || 'No description available.'}</div>

                    {firstCell.summary && (
                      <div className="mt-4 p-3 bg-[#0a0a0a] border border-[#222] rounded">
                        <div className="text-xs text-gray-500 mb-1">Summary</div>
                        <div className="text-sm text-gray-300">{firstCell.summary}</div>
                      </div>
                    )}

                    <div className="mt-4 p-3 bg-[#0a0a0a] border border-[#222] rounded">
                      <div className="text-xs text-gray-500 mb-1">Coordinates</div>
                      <div className="text-sm font-mono text-green-500">{coordString}</div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* --- TAB: API --- */}
            {tab === 'API' && (
              <div className="space-y-4 text-xs text-gray-400 font-mono">
                <div className="p-3 bg-[#0a0a0a] border border-[#222] rounded">
                  <div className="text-gray-500 mb-1">API Endpoint</div>
                  <div className="text-green-500">{formData.apiEndpoint || 'Not configured'}</div>
                </div>

                <div className="p-3 bg-[#0a0a0a] border border-[#222] rounded">
                  <div className="text-gray-500 mb-1">Cost Per Call</div>
                  <div>{formData.costPerCall} USDC</div>
                </div>

                <div className="p-3 bg-[#0a0a0a] border border-[#222] rounded">
                  <div className="text-gray-500 mb-1">Uptime</div>
                  <div>{formData.uptime}%</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
