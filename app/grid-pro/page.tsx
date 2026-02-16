'use client';

import React, { useState, useRef, useEffect } from 'react';
import { DetailModal } from './components/DetailModal';
import { HelpModal } from './components/HelpModal';
import { BotConnect } from './components/BotConnect';
import { Sidebar } from './components/Sidebar';
import { ForumFeed } from './components/ForumFeed';
import { WorldMap } from './components/WorldMap';
import { GridCell, AgentProfile, CellStatus, ActivityLog } from './types';
import { INITIAL_LOGS, LANG } from './constants';
import { initializeGrid, createPurchase, verifyPurchase } from './services/apiService';
import { Terminal, Map as MapIcon, Globe } from 'lucide-react';

type ViewMode = 'GRID' | 'FORUM' | 'ACCESS';
type Language = 'EN' | 'CN';

const CELL_SIZE = 30;

export default function GridProPage() {
  const [grid, setGrid] = useState<GridCell[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>(INITIAL_LOGS);
  const [loading, setLoading] = useState(true);

  const [selectedCells, setSelectedCells] = useState<GridCell[]>([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Purchase state
  const [purchaseStep, setPurchaseStep] = useState<'idle' | 'creating' | 'pay' | 'verifying' | 'success'>('idle');
  const [orderData, setOrderData] = useState<any>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('GRID');
  const [lang, setLang] = useState<Language>('CN');

  const t = LANG[lang];

  const [zoom, setZoom] = useState(0.8);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const viewportRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Load real data from database
  useEffect(() => {
    const loadGrid = async () => {
      setLoading(true);
      const realGrid = await initializeGrid();
      setGrid(realGrid);
      setLoading(false);
    };
    loadGrid();
  }, []);

  useEffect(() => {
    const updateSize = () => {
      if (viewportRef.current) {
        setContainerSize({
          width: viewportRef.current.clientWidth,
          height: viewportRef.current.clientHeight
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [viewMode]);

  // Purchase handlers
  const handleStartPurchase = async (cell: GridCell) => {
    setPurchaseStep('creating');
    const result = await createPurchase(cell.x, cell.y, cell.price);
    if (result.receipt_id) {
      setOrderData(result);
      setPurchaseStep('pay');
    } else {
      alert('创建订单失败: ' + (result.error || '未知错误'));
      setPurchaseStep('idle');
    }
  };

  const handleVerifyPayment = async (txHash: string) => {
    if (!orderData) return;
    setPurchaseStep('verifying');
    const result = await verifyPurchase(orderData.receipt_id, txHash);
    if (result.paid) {
      setPurchaseStep('success');
      // Reload grid
      const realGrid = await initializeGrid();
      setGrid(realGrid);
    } else {
      alert('支付验证失败');
      setPurchaseStep('pay');
    }
  };

  // Handlers
  const handleUpdate = (cellIds: number[], data: AgentProfile, status: CellStatus, isForSale: boolean, price: number) => {
    setGrid(prev => prev.map(cell => {
      if (cellIds.includes(cell.id)) {
        const updates: any = { ...cell, agentData: data, status, isForSale, price };
        if (data.avatarUrl) updates.image = data.avatarUrl;
        return updates;
      }
      return cell;
    }));
  };

  const handleMapPan = (dx: number, dy: number) => {
    setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.max(0.1, Math.min(3, prev - delta * 0.001)));
  };

  const handleSelectCells = (cells: GridCell[]) => {
    setSelectedCells(cells);
    if (cells.length > 0) {
      setShowDetailModal(true);
      setPurchaseStep('idle');
      setOrderData(null);
    } else {
      setShowDetailModal(false);
    }
  };

  const handleNavigateToCell = (cell: GridCell) => {
    setViewMode('GRID');
    const targetX = -(cell.x * CELL_SIZE * zoom) + (containerSize.width / 2);
    const targetY = -(cell.y * CELL_SIZE * zoom) + (containerSize.height / 2);
    setPan({ x: targetX, y: targetY });
    handleSelectCells([cell]);
  };

  const toggleLang = () => setLang(prev => prev === 'EN' ? 'CN' : 'EN');

  if (loading) {
    return (
      <div className="w-screen h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-2 border-green-500 border-t-transparent rounded-full animate-spin mb-4" />
          <div className="text-green-500 font-mono animate-pulse">LOADING GRID DATA...</div>
          <div className="text-gray-600 text-xs mt-2 font-mono">Connecting to AgentGrid.OS</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen bg-[#050505] text-white overflow-hidden flex flex-col font-sans selection:bg-green-900 selection:text-white">
      {/* Header */}
      <header className="h-12 border-b border-[#222] bg-[#0a0a0a] flex items-center justify-between px-4 shrink-0 z-40">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-sm tracking-widest font-mono flex items-center gap-2">
            <span className="text-green-500 w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            {t.HEADER_TITLE}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={toggleLang}
            className="flex items-center gap-1 text-[10px] font-mono text-gray-500 border border-[#333] px-2 py-1 rounded hover:text-white hover:border-gray-500 transition-colors"
          >
            <Globe size={10} /> {lang}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative pb-12 md:pb-0">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex h-full">
          <Sidebar logs={logs} grid={grid} />
        </div>

        {/* Center Viewport */}
        <div ref={viewportRef} className="flex-1 relative bg-[#050505] overflow-hidden cursor-crosshair">
          {/* Grid View */}
          {viewMode === 'GRID' && (
            <WorldMap
              grid={grid}
              pan={pan}
              zoom={zoom}
              width={containerSize.width}
              height={containerSize.height}
              selectedCells={selectedCells}
              onSelectCells={handleSelectCells}
              onPan={handleMapPan}
              onZoom={handleZoom}
            />
          )}

          {/* Forum View */}
          {viewMode === 'FORUM' && (
            <div className="w-full h-full p-4 overflow-y-auto">
              <ForumFeed logs={logs} />
            </div>
          )}

          {/* Zoom Controls */}
          <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-30">
            <button
              onClick={() => setZoom(prev => Math.min(3, prev + 0.2))}
              className="w-10 h-10 bg-[#111] border border-[#333] rounded flex items-center justify-center hover:border-green-500 hover:text-green-500 transition-colors"
            >
              +
            </button>
            <div className="w-10 h-10 bg-[#111] border border-[#333] rounded flex items-center justify-center text-xs font-mono text-gray-500">
              {Math.round(zoom * 100)}%
            </div>
            <button
              onClick={() => setZoom(prev => Math.max(0.1, prev - 0.2))}
              className="w-10 h-10 bg-[#111] border border-[#333] rounded flex items-center justify-center hover:border-green-500 hover:text-green-500 transition-colors"
            >
              -
            </button>
          </div>
        </div>

        {/* Bot Connect Panel */}
        <div className="hidden lg:block">
          <BotConnect
            isConnected={false}
            botId=""
            balance={0}
            onConnect={() => {}}
            onDisconnect={() => {}}
          />
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-12 bg-[#0a0a0a] border-t border-[#222] flex items-center justify-around z-50">
        <button onClick={() => setViewMode('GRID')} className={`p-2 ${viewMode === 'GRID' ? 'text-green-500' : 'text-gray-600'}`}>
          <MapIcon size={20} />
        </button>
        <button onClick={() => setViewMode('FORUM')} className={`p-2 ${viewMode === 'FORUM' ? 'text-green-500' : 'text-gray-600'}`}>
          <Terminal size={20} />
        </button>
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedCells.length > 0 && (
        <DetailModal
          cells={selectedCells}
          onClose={() => setShowDetailModal(false)}
          onUpdate={handleUpdate}
          onPurchase={handleStartPurchase}
          onVerifyPayment={handleVerifyPayment}
          purchaseStep={purchaseStep}
          orderData={orderData}
          lang={lang}
        />
      )}

      {/* Help Modal */}
      {showHelp && (
        <HelpModal
          onClose={() => setShowHelp(false)}
          lang={lang}
        />
      )}
    </div>
  );
}
