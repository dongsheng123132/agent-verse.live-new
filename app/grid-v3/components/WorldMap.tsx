import React, { useRef, useEffect, useState } from 'react';
import { GridCell } from '../types';
import { COLS, ROWS } from '../constants';

const CELL_GAP = 1; // 格子之间的像素间距

interface WorldMapProps {
  grid: GridCell[];
  pan: { x: number; y: number };
  zoom: number;
  width: number;
  height: number;
  selectedCells: GridCell[];
  onSelectCells: (cells: GridCell[]) => void;
  onPan: (dx: number, dy: number) => void;
  onZoom: (delta: number, clientX: number, clientY: number) => void;
}

export const WorldMap: React.FC<WorldMapProps> = ({
  grid,
  pan,
  zoom,
  width,
  height,
  selectedCells,
  onSelectCells,
  onPan,
  onZoom
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredCell, setHoveredCell] = useState<GridCell | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  
  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [isSelecting, setIsSelecting] = useState(false); // Shift + Drag
  const dragStartPos = useRef({ x: 0, y: 0 });
  const lastMousePos = useRef({ x: 0, y: 0 }); // For delta calc
  
  const selectionStart = useRef({ x: 0, y: 0 }); // Screen coords
  const [selectionRect, setSelectionRect] = useState<{x:number, y:number, w:number, h:number} | null>(null);

  const imageCache = useRef<{ [key: string]: HTMLImageElement }>({});
  const [frameCount, setFrameCount] = useState(0); 

  const CELL_SIZE = 30;

  // 空格子虚拟 cell，用于点击/悬停时打开购买
  const emptyCell = (x: number, y: number): GridCell => ({
    id: y * COLS + x,
    x,
    y,
    owner: null,
    price: 0,
    isForSale: false,
    status: 'EMPTY',
    agentData: null,
  });

  // Helper: Screen to Grid
  const getGridCoord = (screenX: number, screenY: number) => {
    const cellX = Math.floor((screenX - pan.x) / (CELL_SIZE * zoom));
    const cellY = Math.floor((screenY - pan.y) / (CELL_SIZE * zoom));
    return { x: cellX, y: cellY };
  };

  // Draw Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false }); 
    if (!ctx) return;

    // 1. Fill Background
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    // 2. Draw Grid & Content
    
    const selectedIds = new Set(selectedCells.map(c => c.id));

    const screenSize = Math.ceil(CELL_SIZE * zoom);
    const drawSize = Math.max(1, screenSize - 2 * CELL_GAP);

    // 只遍历有数据的格子（已购买的），画时间距 CELL_GAP
    for (const cell of grid) {
        const screenX = Math.floor(cell.x * CELL_SIZE * zoom + pan.x);
        const screenY = Math.floor(cell.y * CELL_SIZE * zoom + pan.y);
        const dx = screenX + CELL_GAP;
        const dy = screenY + CELL_GAP;

        if (dx + drawSize < 0 || dx > width || dy + drawSize < 0 || dy > height) continue;

        if (cell.image) {
            const img = imageCache.current[cell.image];
            if (img && img.complete && img.naturalWidth > 0) {
                 ctx.drawImage(img, dx, dy, drawSize, drawSize);
            } else {
                if (!img) {
                    const newImg = new Image();
                    newImg.src = cell.image;
                    newImg.onload = () => setFrameCount(f => f + 1);
                    newImg.onerror = () => { };
                    imageCache.current[cell.image] = newImg;
                }
                ctx.fillStyle = cell.color || '#222';
                ctx.fillRect(dx, dy, drawSize, drawSize);
            }
        } else {
            ctx.fillStyle = cell.color || '#10b981';
            ctx.fillRect(dx, dy, drawSize, drawSize);
        }

        if (selectedIds.has(cell.id)) {
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(dx, dy, drawSize, drawSize);
        }
    }

    // 3. Draw Hover Highlight（带间距）
    if (hoveredCell && !isSelecting) {
        const hX = Math.floor(hoveredCell.x * CELL_SIZE * zoom + pan.x) + CELL_GAP;
        const hY = Math.floor(hoveredCell.y * CELL_SIZE * zoom + pan.y) + CELL_GAP;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(hX, hY, drawSize, drawSize);
        ctx.strokeStyle = 'rgba(0, 255, 65, 0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(hX, hY, drawSize, drawSize);
    }

    // 4. Draw Drag Selection Rect
    if (selectionRect) {
        ctx.strokeStyle = '#00ff41';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
        ctx.fillStyle = 'rgba(0, 255, 65, 0.1)';
        ctx.fillRect(selectionRect.x, selectionRect.y, selectionRect.w, selectionRect.h);
        ctx.setLineDash([]);
    }

  }, [grid, pan, zoom, width, height, selectedCells, selectionRect, frameCount, hoveredCell, isSelecting]);

  // --- Event Handlers ---

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    
    // SHIFT key triggers Area Selection Mode
    if (e.shiftKey) {
        setIsSelecting(true);
        const rect = canvasRef.current?.getBoundingClientRect();
        if(rect) {
            selectionStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
            setSelectionRect({ x: selectionStart.current.x, y: selectionStart.current.y, w: 0, h: 0 });
        }
    } else {
        setIsDragging(true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isSelecting) {
        const w = mouseX - selectionStart.current.x;
        const h = mouseY - selectionStart.current.y;
        setSelectionRect({ x: selectionStart.current.x, y: selectionStart.current.y, w, h });
        return;
    }

    if (isDragging) {
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        onPan(dx, dy);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
    }

    // Hover：已购买格子或空格子（0..99 范围内）都可悬停/点击
    if (!isSelecting) {
        const coords = getGridCoord(mouseX, mouseY);
        const inRange = coords.x >= 0 && coords.x < COLS && coords.y >= 0 && coords.y < ROWS;
        const cell = inRange
            ? (grid.find(c => c.x === coords.x && c.y === coords.y) ?? emptyCell(coords.x, coords.y))
            : null;
        setHoveredCell(cell);
        setHoverPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // Check if it was a click (little movement)
    const moveDist = Math.sqrt(
        Math.pow(e.clientX - dragStartPos.current.x, 2) + 
        Math.pow(e.clientY - dragStartPos.current.y, 2)
    );

    if (isSelecting && selectionRect) {
        // ... Selection Rect Logic ...
        const start = getGridCoord(selectionRect.x, selectionRect.y);
        const end = getGridCoord(selectionRect.x + selectionRect.w, selectionRect.y + selectionRect.h);

        const minX = Math.max(0, Math.min(start.x, end.x));
        const maxX = Math.min(COLS - 1, Math.max(start.x, end.x));
        const minY = Math.max(0, Math.min(start.y, end.y));
        const maxY = Math.min(COLS - 1, Math.max(start.y, end.y));

        // 从已购买的格子中筛选在选择区域内的
        const newSelection = grid.filter(c =>
            c.x >= minX && c.x <= maxX && c.y >= minY && c.y <= maxY
        );
        if (newSelection.length > 0) onSelectCells(newSelection);
    } else if (moveDist < 5 && !isSelecting) {
        if (hoveredCell) {
            onSelectCells([hoveredCell]);
        } else {
            onSelectCells([]);
        }
    }
    
    setIsDragging(false);
    setIsSelecting(false);
    setSelectionRect(null);
  };

  return (
    <div className="relative w-full h-full bg-[#050505] overflow-hidden select-none">
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className={`block touch-none ${isSelecting ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { setIsDragging(false); setIsSelecting(false); setSelectionRect(null); setHoveredCell(null); }}
            onWheel={(e) => {
                 const rect = canvasRef.current?.getBoundingClientRect();
                 if(!rect) return;
                 onZoom(e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
            }}
        />
        
        {/* Tooltip Overlay */}
        {hoveredCell && !isDragging && !isSelecting && (
            <div 
                className="fixed pointer-events-none z-50 bg-black/90 border border-green-900/50 p-2 rounded shadow-xl backdrop-blur text-xs text-white"
                style={{ 
                    left: hoverPos.x + 15, 
                    top: hoverPos.y + 15 
                }}
            >
                <div className="font-bold text-agent-green mb-1 flex justify-between gap-4">
                    <span>COORD</span>
                    <span className="font-mono">[{hoveredCell.x}, {hoveredCell.y}]</span>
                </div>
                {hoveredCell.owner ? (
                    <>
                        <div className="text-gray-300 font-bold">{hoveredCell.agentData?.name || 'Unknown'}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{hoveredCell.owner.slice(0,8)}...</div>
                    </>
                ) : (
                    <div className="text-agent-green/90 font-medium">空格子 · 点击购买</div>
                )}
                {hoveredCell.status === 'LOCKED' && (
                     <div className="text-red-500 font-bold mt-1 text-[10px]">[SYSTEM RESERVED]</div>
                )}
            </div>
        )}
    </div>
  );
};