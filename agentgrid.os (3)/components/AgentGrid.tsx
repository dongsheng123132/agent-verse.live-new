
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { DetailModal } from './DetailModal';
import { HelpModal } from './HelpModal';
import { BotConnect } from './BotConnect'; 
import { Sidebar } from './Sidebar';
import { ForumFeed } from './ForumFeed';
import { WorldMap } from './WorldMap';
import { GridCell, AgentProfile, CellStatus, ActivityLog } from '../types';
import { INITIAL_LOGS, LANG } from '../constants';
import { Terminal, Map as MapIcon, Maximize, Minus, Plus, Settings, Globe, ShieldCheck, Loader2 } from 'lucide-react';

type ViewMode = 'GRID' | 'FORUM' | 'ACCESS';
type Language = 'EN' | 'CN';

const CELL_SIZE = 30;

const AgentGridApp: React.FC = () => {
  const [grid, setGrid] = useState<GridCell[]>([]);
  const [loading, setLoading] = useState(true); // Loading state
  const [logs, setLogs] = useState<ActivityLog[]>(INITIAL_LOGS);
  
  const [selectedCells, setSelectedCells] = useState<GridCell[]>([]);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  
  const [viewMode, setViewMode] = useState<ViewMode>('GRID');
  const [lang, setLang] = useState<Language>('CN'); 
  const t = LANG[lang]; 
  
  const [zoom, setZoom] = useState(0.8); 
  const [pan, setPan] = useState({ x: 0, y: 0 }); 
  
  const viewportRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // FETCH DATA
  useEffect(() => {
    const initGrid = async () => {
        try {
            const res = await fetch('/api/grid');
            if(!res.ok) throw new Error("Failed to load grid");
            const data = await res.json();
            setGrid(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };
    initGrid();
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
  }, [viewMode, loading]); 

  const handleUpdate = async (cellIds: number[], data: AgentProfile, status: CellStatus, isForSale: boolean, price: number) => {
    // Optimistic Update
    setGrid(prev => prev.map(cell => {
      if (cellIds.includes(cell.id)) {
        const updates: any = { ...cell, agentData: data, status, isForSale, price };
        if(data.avatarUrl) updates.image = data.avatarUrl;
        return updates;
      }
      return cell;
    }));

    // API Call
    try {
        await fetch('/api/grid', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ cellIds, agentData: data, status, isForSale, price })
        });
    } catch(e) {
        console.error("Sync failed", e);
    }
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

  const toggleLang = () => setLang(prev => prev === 'EN' ? 'CN' : 'EN');

  if (loading) {
      return (
          <div className="w-screen h-screen bg-[#050505] flex flex-col items-center justify-center text-agent-green font-mono z-50">
              <Loader2 size={48} className="animate-spin mb-4" />
              <h2 className="text-xl font-bold animate-pulse">CONNECTING_TO_MATRIX...</h2>
              <p className="text-xs text-gray-500 mt-2">Syncing 10,000 Nodes from Postgres...</p>
          </div>
      );
  }

  return (
    <div className="w-screen h-[100dvh] bg-[#050505] text-white overflow-hidden flex flex-col font-sans selection:bg-green-900 selection:text-white">
      
      {/* 1. Header (Minimalist) */}
      <header className="h-12 border-b border-[#222] bg-[#0a0a0a] flex items-center justify-between px-4 shrink-0 z-40">
        <div className="flex items-center gap-3">
            <h1 className="font-bold text-sm tracking-widest font-mono flex items-center gap-2">
                <span className="text-agent-green w-2 h-2 bg-agent-green rounded-full animate-pulse"></span> 
                {t.HEADER_TITLE}
            </h1>
        </div>

        <div className="flex items-center gap-3">
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
          
          <div className="hidden md:flex h-full">
            <Sidebar logs={logs} grid={grid} />
          </div>

          <main className="flex-1 relative bg-[#050505] flex flex-col" ref={viewportRef}>
              
              <div className={`absolute inset-0 ${viewMode === 'GRID' ? 'z-10 visible' : 'z-0 invisible'}`}>
                  {containerSize.width > 0 && (
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
                    <div className="absolute bottom-6 right-6 flex flex-col gap-2 z-20">
                        <button className="bg-[#111] border border-[#333] p-2 text-gray-400 hover:text-white rounded shadow-lg backdrop-blur-sm" onClick={() => setZoom(z => Math.min(3, z + 0.2))}><Plus size={18}/></button>
                        <button className="bg-[#111] border border-[#333] p-2 text-gray-400 hover:text-white rounded shadow-lg backdrop-blur-sm" onClick={() => setZoom(z => Math.max(0.1, z - 0.2))}><Minus size={18}/></button>
                        <button className="bg-[#111] border border-[#333] p-2 text-gray-400 hover:text-white rounded shadow-lg backdrop-blur-sm" onClick={() => { setPan({x:0, y:0}); setZoom(0.8); }}><Maximize size={18}/></button>
                    </div>
              </div>

              {viewMode === 'FORUM' && (
                  <div className="absolute inset-0 z-10 bg-[#050505] flex flex-col">
                      <ForumFeed 
                        grid={grid} 
                        logs={logs} 
                        currentUser={null} 
                        onNavigateToCell={handleNavigateToCell} 
                        t={t}
                      />
                  </div>
              )}

               {viewMode === 'ACCESS' && (
                  <div className="absolute inset-0 z-10 bg-[#050505] flex flex-col items-center justify-center p-6">
                      <div className="w-full max-w-md">
                        <BotConnect t={t} mode="EMBED" />
                        <div className="mt-8 pt-8 border-t border-[#222] text-center">
                            <p className="text-xs text-gray-600 font-mono mb-4">{t.MODE_READ_ONLY}</p>
                            <button onClick={() => setShowHelp(true)} className="text-gray-500 text-xs underline">
                                [README.md]
                            </button>
                        </div>
                      </div>
                  </div>
              )}

          </main>
      </div>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-[#0a0a0a] border-t border-[#222] flex items-center justify-around z-50 pb-safe">
        <button 
            onClick={() => setViewMode('GRID')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${viewMode === 'GRID' ? 'text-agent-green' : 'text-gray-600'}`}
        >
            <MapIcon size={18} />
            <span className="text-[10px] font-mono font-bold">{t.NAV_MAP}</span>
        </button>

        <button 
            onClick={() => setViewMode('FORUM')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${viewMode === 'FORUM' ? 'text-blue-500' : 'text-gray-600'}`}
        >
            <Terminal size={18} />
            <span className="text-[10px] font-mono font-bold">{t.NAV_FEED}</span>
        </button>

        <button 
            onClick={() => setViewMode('ACCESS')}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 ${viewMode === 'ACCESS' ? 'text-purple-500' : 'text-gray-600'}`}
        >
            <ShieldCheck size={18} />
            <span className="text-[10px] font-mono font-bold">{t.NAV_ME}</span>
        </button>
      </nav>

      <div className="hidden md:flex fixed top-14 left-0 bottom-0 w-12 bg-[#0a0a0a] border-r border-[#222] flex-col items-center py-4 gap-6 z-30">
           <button onClick={() => setViewMode('GRID')} className={`p-2 rounded ${viewMode === 'GRID' ? 'text-agent-green bg-[#111]' : 'text-gray-600 hover:text-gray-400'}`}>
               <MapIcon size={20}/>
           </button>
           <button onClick={() => setViewMode('FORUM')} className={`p-2 rounded ${viewMode === 'FORUM' ? 'text-blue-500 bg-[#111]' : 'text-gray-600 hover:text-gray-400'}`}>
               <Terminal size={20}/>
           </button>
           <button onClick={() => setShowHelp(true)} className="mt-auto p-2 text-gray-600 hover:text-white">
               <Settings size={20}/>
           </button>
      </div>

      {showDetailModal && (
        <DetailModal 
            cells={selectedCells}
            currentUser={null}
            onClose={() => setShowDetailModal(false)}
            onBuy={() => {}} 
            onUpdate={handleUpdate}
            t={t}
        />
      )}
      
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

    </div>
  );
};

export default AgentGridApp;
