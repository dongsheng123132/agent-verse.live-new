import React, { useRef, useEffect, useState } from 'react';
import { Cell, COLS, ROWS, CELL_PX, isReserved } from '../app/types';
import { useLang } from '../lib/LangContext';
import { getPixelAvatar, drawPixelAvatar, drawPixelAvatarSmall } from '../lib/pixelAvatar';

interface WorldMapProps {
    grid: Cell[];
    pan: { x: number; y: number };
    zoom: number;
    width: number;
    height: number;
    selectedCells: Cell[];
    onSelectCells: (cells: Cell[]) => void;
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
    const { t } = useLang();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hoveredCell, setHoveredCell] = useState<Cell | null>(null);
    const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

    // Interaction State
    const [isDragging, setIsDragging] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false); // Shift + Drag
    const dragStartPos = useRef({ x: 0, y: 0 });
    const lastMousePos = useRef({ x: 0, y: 0 }); // For delta calc

    const selectionStart = useRef({ x: 0, y: 0 }); // Screen coords
    const [selectionRect, setSelectionRect] = useState<{ x: number, y: number, w: number, h: number } | null>(null);

    const imageCache = useRef<{ [key: string]: HTMLImageElement }>({});
    const [frameCount, setFrameCount] = useState(0);
    const failedImages = useRef(new Set<string>());

    // Helper: Screen to Grid
    const getGridCoord = (screenX: number, screenY: number) => {
        const cellSize = CELL_PX * zoom;
        const cellX = Math.floor((screenX - pan.x) / cellSize);
        const cellY = Math.floor((screenY - pan.y) / cellSize);
        return { x: cellX, y: cellY };
    };

    // Convert linear grid array to map for O(1) access
    // Ideally this should be passed in or memoized outside, but for now we do it here or assume grid is sorted? 
    // Actually the original `WorldMap` iterated ranges.
    // The `final` project `grid` is `Cell[]`. Let's create a map for easier rendering of viewport.
    // BUT the `WorldMap` from reference iterates row/col.
    // We can do the same.

    const cellMap = React.useMemo(() => {
        const m = new Map<string, Cell>();
        grid.forEach(c => m.set(`${c.x},${c.y}`, c));
        return m;
    }, [grid]);

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
        const cellSize = CELL_PX * zoom;

        const startCol = Math.floor((-pan.x) / cellSize);
        const endCol = startCol + Math.ceil(width / cellSize) + 1;
        const startRow = Math.floor((-pan.y) / cellSize);
        const endRow = startRow + Math.ceil(height / cellSize) + 1;

        const renderStartCol = Math.max(0, startCol - 4);
        const renderEndCol = Math.min(COLS, endCol);
        const renderStartRow = Math.max(0, startRow - 4);
        const renderEndRow = Math.min(ROWS, endRow);

        const selectedIds = new Set(selectedCells.map(c => `${c.x},${c.y}`));

        for (let r = renderStartRow; r < renderEndRow; r++) {
            for (let c = renderStartCol; c < renderEndCol; c++) {
                const cell = cellMap.get(`${c},${r}`);

                // Block rendering: skip non-origin cells (origin draws the full block)
                if (cell?.block_origin_x != null && (cell.block_origin_x !== c || cell.block_origin_y !== r)) {
                    continue;
                }

                const screenX = Math.floor(c * cellSize + pan.x);
                const screenY = Math.floor(r * cellSize + pan.y);
                const bw = cell?.block_w || 1;
                const bh = cell?.block_h || 1;
                const drawW = Math.ceil(cellSize * bw);
                const drawH = Math.ceil(cellSize * bh);

                let isSold = !!cell?.owner;
                let isReservedCell = isReserved(c, r);

                if (isSold && cell) {
                    const imgUrl = cell.image_url;
                    const imgFailed = imgUrl ? failedImages.current.has(imgUrl) : true;

                    if (imgUrl && !imgFailed) {
                        const img = imageCache.current[imgUrl];
                        if (img && img.complete && img.naturalWidth > 0) {
                            ctx.drawImage(img, screenX, screenY, drawW, drawH);
                        } else {
                            if (!img && cellSize > 5) {
                                const newImg = new Image();
                                newImg.crossOrigin = 'anonymous';
                                newImg.src = imgUrl;
                                newImg.onload = () => setFrameCount(f => f + 1);
                                newImg.onerror = () => {
                                    failedImages.current.add(imgUrl);
                                    setFrameCount(f => f + 1);
                                };
                                imageCache.current[imgUrl] = newImg;
                            }
                            ctx.fillStyle = cell.color || '#10b981';
                            ctx.fillRect(screenX, screenY, drawW, drawH);
                            if (cellSize > 10) {
                                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                                ctx.font = `${Math.max(8, cellSize / 3)}px monospace`;
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                ctx.fillText('...', screenX + drawW / 2, screenY + drawH / 2);
                            }
                        }
                    } else {
                        // No image or failed → pixel avatar
                        const avatar = getPixelAvatar(cell.owner || cell.id.toString());
                        ctx.fillStyle = cell.color ? cell.color : avatar.colors.bg;
                        ctx.fillRect(screenX, screenY, drawW, drawH);

                        const avatarSize = Math.min(drawW, drawH);
                        const avatarX = screenX + (drawW - avatarSize) / 2;
                        const avatarY = screenY + (drawH - avatarSize) / 2;

                        if (cellSize >= 20) {
                            drawPixelAvatar(ctx, avatar, avatarX, avatarY, avatarSize);
                        } else if (cellSize >= 8) {
                            drawPixelAvatarSmall(ctx, avatar, avatarX, avatarY, avatarSize);
                        } else if (cellSize > 3) {
                            ctx.fillStyle = cell.color || avatar.colors.primary;
                            ctx.fillRect(screenX + drawW * 0.15, screenY + drawH * 0.15, drawW * 0.7, drawH * 0.7);
                        }
                    }

                    // Title overlay for blocks when zoomed in
                    if (bw > 1 && cell.title && cellSize >= 12) {
                        const fontSize = Math.min(cellSize * 0.35, 14);
                        const textH = fontSize + 6;
                        ctx.fillStyle = 'rgba(0,0,0,0.6)';
                        ctx.fillRect(screenX, screenY + drawH - textH, drawW, textH);
                        ctx.fillStyle = '#fff';
                        ctx.font = `bold ${fontSize}px monospace`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(cell.title.slice(0, 20), screenX + drawW / 2, screenY + drawH - textH / 2);
                    }
                } else if (isReservedCell) {
                    ctx.fillStyle = '#111118';
                    ctx.fillRect(screenX, screenY, drawW, drawH);
                    if (cellSize > 4) {
                        ctx.strokeStyle = '#222';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(screenX + 2, screenY + 2, drawW - 4, drawH - 4);
                        if (cellSize > 10) {
                            ctx.fillStyle = '#333';
                            ctx.font = `${cellSize * 0.3}px monospace`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText('SYS', screenX + drawW / 2, screenY + drawH / 2);
                        }
                    }
                } else {
                    ctx.fillStyle = '#161616';
                    ctx.fillRect(screenX, screenY, drawW, drawH);
                }

                // Selection Outline — check all cells in this block
                let blockSelected = selectedIds.has(`${c},${r}`);
                if (!blockSelected && (bw > 1 || bh > 1)) {
                    for (let dy = 0; dy < bh && !blockSelected; dy++) {
                        for (let dx = 0; dx < bw && !blockSelected; dx++) {
                            if (selectedIds.has(`${c + dx},${r + dy}`)) blockSelected = true;
                        }
                    }
                }
                if (blockSelected) {
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = Math.max(1, 2 * (zoom / 2));
                    ctx.strokeRect(screenX, screenY, drawW, drawH);
                }
            }
        }

        // 3. Draw Hover Highlight (snap to block origin if block cell)
        if (hoveredCell && !isSelecting) {
            const ox = hoveredCell.block_origin_x ?? hoveredCell.x;
            const oy = hoveredCell.block_origin_y ?? hoveredCell.y;
            const bw = hoveredCell.block_w || 1;
            const bh = hoveredCell.block_h || 1;
            const hX = Math.floor(ox * cellSize + pan.x);
            const hY = Math.floor(oy * cellSize + pan.y);
            const hW = Math.ceil(cellSize * bw);
            const hH = Math.ceil(cellSize * bh);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(hX, hY, hW, hH);
            ctx.strokeStyle = 'rgba(0, 255, 65, 0.8)';
            ctx.lineWidth = 2;
            ctx.strokeRect(hX, hY, hW, hH);
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

    }, [grid, cellMap, pan, zoom, width, height, selectedCells, selectionRect, frameCount, hoveredCell, isSelecting]);

    // --- Event Handlers ---

    const handleMouseDown = (e: React.MouseEvent) => {
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        lastMousePos.current = { x: e.clientX, y: e.clientY };

        // SHIFT key triggers Area Selection Mode
        if (e.shiftKey) {
            setIsSelecting(true);
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
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

        // Hover Calculation
        if (!isSelecting) {
            const coords = getGridCoord(mouseX, mouseY);
            if (coords.x >= 0 && coords.x < COLS && coords.y >= 0 && coords.y < ROWS) {
                const key = `${coords.x},${coords.y}`;
                const cell = cellMap.get(key) || {
                    id: coords.y * COLS + coords.x,
                    x: coords.x,
                    y: coords.y,
                    owner: null
                };
                setHoveredCell(cell);
                setHoverPos({ x: e.clientX, y: e.clientY });
            } else {
                setHoveredCell(null);
            }
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        // Check if it was a click (little movement)
        const moveDist = Math.sqrt(
            Math.pow(e.clientX - dragStartPos.current.x, 2) +
            Math.pow(e.clientY - dragStartPos.current.y, 2)
        );

        if (isSelecting && selectionRect) {
            const start = getGridCoord(selectionRect.x, selectionRect.y);
            const end = getGridCoord(selectionRect.x + selectionRect.w, selectionRect.y + selectionRect.h);

            const minX = Math.max(0, Math.min(start.x, end.x));
            const maxX = Math.min(COLS - 1, Math.max(start.x, end.x));
            const minY = Math.max(0, Math.min(start.y, end.y));
            const maxY = Math.min(ROWS - 1, Math.max(start.y, end.y));

            const newSelection: Cell[] = [];
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    // Create dummy cell if not exists in map, to allow selecting empty space
                    const cell = cellMap.get(`${x},${y}`) || { id: y * COLS + x, x, y, owner: null };
                    if (!isReserved(x, y)) {
                        newSelection.push(cell);
                    }
                }
            }
            if (newSelection.length > 0) onSelectCells(newSelection);
        } else if (moveDist < 5 && !isSelecting) {
            // It's a CLICK
            if (hoveredCell) {
                // Check if reserved
                if (!isReserved(hoveredCell.x, hoveredCell.y)) {
                    onSelectCells([hoveredCell]);
                } else {
                    onSelectCells([]);
                }
            } else {
                onSelectCells([]);
            }
        }

        setIsDragging(false);
        setIsSelecting(false);
        setSelectionRect(null);
    };

    // --- Touch Handlers ---
    const lastTouchDist = useRef<number>(0);

    const getTouchDist = (t1: React.Touch, t2: React.Touch) => {
        return Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2));
    };

    const getTouchCenter = (t1: React.Touch, t2: React.Touch) => {
        return {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2
        };
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            // Pan
            lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            setIsDragging(true);
        } else if (e.touches.length === 2) {
            // Pinch
            lastTouchDist.current = getTouchDist(e.touches[0], e.touches[1]);
            setIsDragging(false); // Disable pan logic, use pinch logic
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        e.preventDefault(); // Prevent page scroll
        if (e.touches.length === 1 && isDragging) {
            // Pan
            const dx = e.touches[0].clientX - lastMousePos.current.x;
            const dy = e.touches[0].clientY - lastMousePos.current.y;
            onPan(dx, dy);
            lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
            // Pinch Zoom
            const newDist = getTouchDist(e.touches[0], e.touches[1]);
            const delta = lastTouchDist.current - newDist; // Positive gap = zoom out
            const center = getTouchCenter(e.touches[0], e.touches[1]);

            // Adjust sensitivity
            if (Math.abs(delta) > 5) {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                    onZoom(delta * 2, center.x - rect.left, center.y - rect.top);
                    lastTouchDist.current = newDist;
                }
            }
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);
        lastTouchDist.current = 0;
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
                    e.preventDefault();
                    const rect = canvasRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    onZoom(e.deltaY, e.clientX - rect.left, e.clientY - rect.top);
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
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
                    <div className="font-bold text-green-500 mb-1 flex justify-between gap-4">
                        <span>{t('coord')}</span>
                        <span className="font-mono">[{hoveredCell.x}, {hoveredCell.y}]</span>
                    </div>
                    {hoveredCell.owner ? (
                        <>
                            <div className="text-gray-300 font-bold">{hoveredCell.title || 'Agent'}</div>
                            <div className="text-[10px] text-gray-500 font-mono">{hoveredCell.owner.slice(0, 8)}...</div>
                        </>
                    ) : (
                        <div className="text-gray-500 italic">{t('click_select')}</div>
                    )}
                    {isReserved(hoveredCell.x, hoveredCell.y) && (
                        <div className="text-red-500 font-bold mt-1 text-[10px]">{t('system_reserved')}</div>
                    )}
                </div>
            )}
        </div>
    );
};
