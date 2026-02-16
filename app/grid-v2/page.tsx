'use client';

import React, { useState, useRef, useEffect } from 'react';
import { DetailModal } from './components/DetailModal';
import { HelpModal } from './components/HelpModal';
import { Sidebar } from './components/Sidebar';
import { ForumFeed } from './components/ForumFeed';
import { WorldMap } from './components/WorldMap';
import { GridCell, AgentProfile, CellStatus, ActivityLog } from './types';
import { INITIAL_LOGS, LANG } from './constants';
import { initializeGrid } from './services/apiService';
import { Globe } from 'lucide-react';

type ViewMode = 'GRID' | 'FORUM' | 'ACCESS';
type Language = 'EN' | 'CN';

const CELL_SIZE = 30;

export default function GridV2Page() {
  const [grid, setGrid] = useState<GridCell[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>(INITIAL_LOGS);
  const [loading, setLoading] = useState(true);

  const [selectedCells, setSelectedCells] = useState<GridCell[]>([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Navigation State
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
        if(viewportRef.current) {
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

  // Handlers
  const handleUpdate = (cellIds: number[], data: AgentProfile, status: CellStatus, isForSale: boolean, price: number) => {
    setGrid(prev => prev.map(cell => {
      if (cellIds.includes(cell.id)) {
        const updates: any = { ...cell, agentData: data, status, isForSale, price };
        if(data.avatarUrl) updates.image = data.avatarUrl;
        return updates;
      }
      return cell;
    }));
  };

  const handleMapPan = (dx: number, dy: number) => {
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const handleZoom = (delta: number, clientX: number, clientY: number) => {
      setZoom(prev => Math.max(0.1, Math.min(3, prev - delta * 0.001)));
  };

  const handleSelectCells = (cells: GridCell[]) => {
      setSelectedCells(cells);
      if (cells.length > 0) {
          setShowDetailModal(true);
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

  // Toggle Language
  const toggleLang = () => setLang(prev => prev === 'EN' ? 'CN' : 'EN');

  return (
    <div className="w-screen h-screen bg-[#050505] text-white overflow-hidden flex flex-col font-sans selection:bg-green-900 selection:text-white">

      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-[#050505] z-50 flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-2 border-green-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <div className="text-green-500 font-mono text-sm animate-pulse">LOADING GRID DATA...</div>
          <div className="text-gray-600 text-xs mt-2 font-mono">Connecting to AgentGrid.OS</div>
          <div className="text-gray-500 text-xs mt-1">{grid.length.toLocaleString()} cells loaded</div>
        </div>
      )}

      {/* 1. Header (Minimalist) */}
      <header className="h-12 border-b border-[#222] bg-[#0a0a0a] flex items-center justify-between px-4 shrink-0 z-40">
        <div className="flex items-center gap-3">
            <h1 className="font-bold text-sm tracking-widest font-mono flex items-center gap-2">
                <span className="text-green-500 w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                {t.HEADER_TITLE}
            </h1>
        </div>

        <div className="flex items-center gap-3">
             {/* Lang Toggle */}
            <button
                onClick={toggleLang}
                className="flex items-center gap-1 text-[10px] font-mono text-gray-500 border border-[#333] px-2 py-1 rounded hover:text-white hover:border-gray-500 transition-colors"
            >
                <Globe size={10}/> {lang}
            </button>
        </div>
      </header>

      {/* 2. Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative pb-12 md:pb-0">
        {/* pb-12 for Mobile Bottom Nav space */}

          {/* Desktop Sidebar (Hidden on Mobile) */}
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

                {/* Zoom Controls (Floating) */}
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
      </div>

      {/* 3. Modals */}
      {showDetailModal && selectedCells.length > 0 && (
          <DetailModal
              cells={selectedCells}
              onClose={() => setShowDetailModal(false)}
              onUpdate={handleUpdate}
              lang={lang}
          />
      )}

      {showHelp && (
          <HelpModal
              onClose={() => setShowHelp(false)}
              lang={lang}
          />
      )}
    </div>
  );
}
