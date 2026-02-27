import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Cell, COLS, ROWS, CELL_PX, PRICE_PER_CELL, isReserved } from '../app/types';
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
    onZoom,
}) => {
    // Desktop: default select (drag=box-select), Mobile: default pan (drag=move)
    const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const mode: 'pan' | 'select' = isTouchDevice ? 'pan' : 'select';
    const { t } = useLang();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [hoveredCell, setHoveredCell] = useState<Cell | null>(null);
    const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

    // Interaction State
    const [isDragging, setIsDragging] = useState(false);
    const [isSelecting, setIsSelecting] = useState(false);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const lastMousePos = useRef({ x: 0, y: 0 });

    // Selection by grid coordinates (for box-select mode)
    const [selectGridStart, setSelectGridStart] = useState<{ col: number; row: number } | null>(null);
    const [selectGridEnd, setSelectGridEnd] = useState<{ col: number; row: number } | null>(null);

    const imageCache = useRef<{ [key: string]: HTMLImageElement }>({});
    const [frameCount, setFrameCount] = useState(0);
    const failedImages = useRef(new Set<string>());
    const animTime = useRef(0);
    const animRAF = useRef<number>(0);

    // Animation loop — drives pulse/glow effects for large blocks
    useEffect(() => {
        let running = true;
        const tick = (t: number) => {
            if (!running) return;
            animTime.current = t;
            animRAF.current = requestAnimationFrame(tick);
        };
        animRAF.current = requestAnimationFrame(tick);
        // Re-render at ~20fps for animation
        const iv = setInterval(() => setFrameCount(f => f + 1), 50);
        return () => { running = false; cancelAnimationFrame(animRAF.current); clearInterval(iv); };
    }, []);

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

    const selectionInfo = useMemo(() => {
        if (!selectGridStart || !selectGridEnd) return null;
        const minCol = Math.max(0, Math.min(selectGridStart.col, selectGridEnd.col));
        const maxCol = Math.min(COLS - 1, Math.max(selectGridStart.col, selectGridEnd.col));
        const minRow = Math.max(0, Math.min(selectGridStart.row, selectGridEnd.row));
        const maxRow = Math.min(ROWS - 1, Math.max(selectGridStart.row, selectGridEnd.row));
        let validCount = 0;
        let ownedCount = 0;
        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                const cell = cellMap.get(`${c},${r}`);
                if (!cell?.owner && !isReserved(c, r)) validCount++;
                if (cell?.owner) ownedCount++;
            }
        }
        return { minCol, maxCol, minRow, maxRow, validCount, ownedCount };
    }, [selectGridStart, selectGridEnd, cellMap]);

    // Draw Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        // 1. Fill Background — dark with subtle gradient
        const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.7);
        bgGrad.addColorStop(0, '#0a0a12');
        bgGrad.addColorStop(1, '#030308');
        ctx.fillStyle = bgGrad;
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

        // Collect large blocks for glow pass (drawn after grid lines)
        const glowBlocks: { x: number; y: number; w: number; h: number; color: string }[] = [];

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
                const isLargeBlock = bw >= 3 || bh >= 3;

                let isSold = !!cell?.owner;
                let isReservedCell = isReserved(c, r);

                if (isSold && cell) {
                    const imgUrl = cell.image_url;
                    const imgFailed = imgUrl ? failedImages.current.has(imgUrl) : true;

                    // Large blocks: dark bg + border frame first
                    if (isLargeBlock) {
                        const blockColor = cell.color || '#10b981';
                        // Dark fill
                        ctx.fillStyle = '#0a0a0f';
                        ctx.fillRect(screenX, screenY, drawW, drawH);
                        // Colored inner border
                        const bdr = Math.max(1, cellSize * 0.15);
                        ctx.strokeStyle = blockColor;
                        ctx.lineWidth = bdr;
                        ctx.strokeRect(screenX + bdr / 2, screenY + bdr / 2, drawW - bdr, drawH - bdr);
                        // Corner accents
                        const corner = Math.min(drawW, drawH) * 0.12;
                        ctx.strokeStyle = blockColor;
                        ctx.lineWidth = Math.max(2, bdr * 0.8);
                        // Top-left
                        ctx.beginPath(); ctx.moveTo(screenX, screenY + corner); ctx.lineTo(screenX, screenY); ctx.lineTo(screenX + corner, screenY); ctx.stroke();
                        // Top-right
                        ctx.beginPath(); ctx.moveTo(screenX + drawW - corner, screenY); ctx.lineTo(screenX + drawW, screenY); ctx.lineTo(screenX + drawW, screenY + corner); ctx.stroke();
                        // Bottom-left
                        ctx.beginPath(); ctx.moveTo(screenX, screenY + drawH - corner); ctx.lineTo(screenX, screenY + drawH); ctx.lineTo(screenX + corner, screenY + drawH); ctx.stroke();
                        // Bottom-right
                        ctx.beginPath(); ctx.moveTo(screenX + drawW - corner, screenY + drawH); ctx.lineTo(screenX + drawW, screenY + drawH); ctx.lineTo(screenX + drawW, screenY + drawH - corner); ctx.stroke();

                        // Collect for glow effect
                        glowBlocks.push({ x: screenX, y: screenY, w: drawW, h: drawH, color: blockColor });
                    }

                    if (imgUrl && !imgFailed) {
                        const img = imageCache.current[imgUrl];
                        if (img && img.complete && img.naturalWidth > 0) {
                            if (isLargeBlock) {
                                // Center image with padding inside the frame
                                const pad = Math.max(4, drawW * 0.15);
                                const imgArea = Math.min(drawW - pad * 2, drawH - pad * 2.5);
                                const imgX = screenX + (drawW - imgArea) / 2;
                                const imgY = screenY + pad;
                                ctx.drawImage(img, imgX, imgY, imgArea, imgArea);
                            } else {
                                ctx.drawImage(img, screenX, screenY, drawW, drawH);
                            }
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
                            if (!isLargeBlock) {
                                ctx.fillStyle = cell.color || '#10b981';
                                ctx.fillRect(screenX, screenY, drawW, drawH);
                            }
                            if (cellSize > 10) {
                                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                                ctx.font = `${Math.max(8, cellSize / 3)}px monospace`;
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'middle';
                                ctx.fillText('...', screenX + drawW / 2, screenY + drawH / 2);
                            }
                        }
                    } else if (!isLargeBlock) {
                        // No image or failed → pixel avatar (only for small cells)
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

                    // Title overlay — enhanced for large blocks
                    if (isLargeBlock && cell.title && cellSize >= 4) {
                        const fontSize = Math.max(6, Math.min(cellSize * 0.45, 18));
                        const textH = fontSize + 8;
                        // Gradient title bar at bottom
                        const titleGrad = ctx.createLinearGradient(screenX, screenY + drawH - textH, screenX, screenY + drawH);
                        titleGrad.addColorStop(0, 'rgba(0,0,0,0.9)');
                        titleGrad.addColorStop(1, 'rgba(0,0,0,0.7)');
                        ctx.fillStyle = titleGrad;
                        ctx.fillRect(screenX, screenY + drawH - textH, drawW, textH);
                        ctx.fillStyle = '#fff';
                        ctx.font = `bold ${fontSize}px "Segoe UI", system-ui, sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(cell.title.slice(0, 24), screenX + drawW / 2, screenY + drawH - textH / 2);
                    } else if (bw > 1 && cell.title && cellSize >= 12) {
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

                    // Subtle glow border for small owned cells
                    if (!isLargeBlock && cellSize >= 4) {
                        ctx.strokeStyle = cell.color ? cell.color + '60' : 'rgba(16, 185, 129, 0.3)';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(screenX, screenY, drawW, drawH);
                    }
                } else if (isReservedCell) {
                    ctx.fillStyle = '#0c0c14';
                    ctx.fillRect(screenX, screenY, drawW, drawH);
                    if (cellSize > 4) {
                        ctx.strokeStyle = '#1a1a2e';
                        ctx.lineWidth = 1;
                        ctx.strokeRect(screenX + 1, screenY + 1, drawW - 2, drawH - 2);
                        if (cellSize > 10) {
                            ctx.fillStyle = '#2a2a3a';
                            ctx.font = `${cellSize * 0.3}px monospace`;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText('SYS', screenX + drawW / 2, screenY + drawH / 2);
                        }
                    }
                } else {
                    // Empty cells — subtle dark with micro-border
                    ctx.fillStyle = '#0d0d12';
                    ctx.fillRect(screenX, screenY, drawW, drawH);
                    if (cellSize >= 6) {
                        ctx.strokeStyle = 'rgba(255,255,255,0.025)';
                        ctx.lineWidth = 0.5;
                        ctx.strokeRect(screenX, screenY, drawW, drawH);
                    }
                }

                // For-sale border and price label
                if (cell?.is_for_sale && cell?.price_usdc > 0 && cellSize >= 4) {
                    const borderWidth = Math.max(1, Math.min(3, cellSize * 0.12));
                    ctx.strokeStyle = 'rgba(245, 158, 11, 0.8)';
                    ctx.lineWidth = borderWidth;
                    ctx.strokeRect(screenX + borderWidth / 2, screenY + borderWidth / 2, drawW - borderWidth, drawH - borderWidth);
                    if (cellSize >= 16) {
                        const priceText = `$${cell.price_usdc}`;
                        const fontSize = Math.max(8, Math.min(11, cellSize * 0.35));
                        ctx.font = `bold ${fontSize}px monospace`;
                        const tw = ctx.measureText(priceText).width;
                        const labelH = fontSize + 4;
                        const labelW = tw + 6;
                        const lx = screenX + (drawW - labelW) / 2;
                        const ly = screenY + drawH - labelH - 1;
                        ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
                        ctx.fillRect(lx, ly, labelW, labelH);
                        ctx.fillStyle = '#000';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(priceText, lx + labelW / 2, ly + labelH / 2);
                    }
                }

                // Selection Outline
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

        // 2.5 Draw Grid Lines — subtle dotted style
        if (cellSize >= 6) {
            ctx.beginPath();
            ctx.strokeStyle = cellSize >= 14 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)';
            ctx.lineWidth = 0.5;
            const gridStartX = Math.round(renderStartCol * cellSize + pan.x);
            const gridEndX = Math.round(renderEndCol * cellSize + pan.x);
            const gridStartY = Math.round(renderStartRow * cellSize + pan.y);
            const gridEndY = Math.round(renderEndRow * cellSize + pan.y);
            for (let c = renderStartCol; c <= renderEndCol; c++) {
                const x = Math.round(c * cellSize + pan.x) + 0.5;
                ctx.moveTo(x, gridStartY);
                ctx.lineTo(x, gridEndY);
            }
            for (let r = renderStartRow; r <= renderEndRow; r++) {
                const y = Math.round(r * cellSize + pan.y) + 0.5;
                ctx.moveTo(gridStartX, y);
                ctx.lineTo(gridEndX, y);
            }
            ctx.stroke();
        }

        // 2.6 Animated glow effects for large brand blocks
        const t = animTime.current * 0.001; // seconds
        ctx.save();
        for (const block of glowBlocks) {
            // Breathing glow — pulse between min and max
            const pulse = 0.5 + 0.5 * Math.sin(t * 2 + block.x * 0.01);
            const glowSize = Math.max(6, Math.min(20, block.w * 0.08)) * (0.8 + pulse * 0.6);
            ctx.shadowColor = block.color;
            ctx.shadowBlur = glowSize;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            const alpha = Math.round(80 + pulse * 60).toString(16).padStart(2, '0');
            ctx.strokeStyle = block.color + alpha;
            ctx.lineWidth = 1.5 + pulse;
            ctx.strokeRect(block.x, block.y, block.w, block.h);

            // Scan line effect — horizontal light sweep
            ctx.shadowBlur = 0;
            const scanY = block.y + ((t * 40 + block.x) % block.h);
            const scanGrad = ctx.createLinearGradient(block.x, scanY - 3, block.x, scanY + 3);
            scanGrad.addColorStop(0, 'rgba(255,255,255,0)');
            scanGrad.addColorStop(0.5, `rgba(255,255,255,${0.06 + pulse * 0.04})`);
            scanGrad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = scanGrad;
            ctx.fillRect(block.x + 2, scanY - 3, block.w - 4, 6);

            // Corner sparkle — rotating highlight on corners
            const sparkleAlpha = 0.3 + 0.3 * Math.sin(t * 3 + block.y * 0.02);
            const sparkleR = Math.max(3, block.w * 0.03);
            ctx.fillStyle = `rgba(255,255,255,${sparkleAlpha})`;
            const corners = [
                [block.x + 4, block.y + 4],
                [block.x + block.w - 4, block.y + 4],
                [block.x + 4, block.y + block.h - 4],
                [block.x + block.w - 4, block.y + block.h - 4],
            ];
            const activeCorner = Math.floor((t * 2) % 4);
            ctx.beginPath();
            ctx.arc(corners[activeCorner][0], corners[activeCorner][1], sparkleR, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // 3. Draw Hover Highlight
        if (hoveredCell && !isSelecting) {
            const ox = hoveredCell.block_origin_x ?? hoveredCell.x;
            const oy = hoveredCell.block_origin_y ?? hoveredCell.y;
            const bw = hoveredCell.block_w || 1;
            const bh = hoveredCell.block_h || 1;
            const hX = Math.floor(ox * cellSize + pan.x);
            const hY = Math.floor(oy * cellSize + pan.y);
            const hW = Math.ceil(cellSize * bw);
            const hH = Math.ceil(cellSize * bh);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.fillRect(hX, hY, hW, hH);
            // Glow border on hover
            ctx.save();
            ctx.shadowColor = '#00ff41';
            ctx.shadowBlur = 8;
            ctx.strokeStyle = 'rgba(0, 255, 65, 0.9)';
            ctx.lineWidth = 2;
            ctx.strokeRect(hX, hY, hW, hH);
            ctx.restore();
        }

        // 4. Draw box-select overlay (grid-based)
        if (selectionInfo && isSelecting) {
            const { minCol, maxCol, minRow, maxRow, validCount } = selectionInfo;
            const sx = Math.floor(minCol * cellSize + pan.x);
            const sy = Math.floor(minRow * cellSize + pan.y);
            const sw = Math.ceil((maxCol - minCol + 1) * cellSize);
            const sh = Math.ceil((maxRow - minRow + 1) * cellSize);
            ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
            ctx.fillRect(sx, sy, sw, sh);
            ctx.strokeStyle = '#6366f1';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(sx, sy, sw, sh);
            ctx.setLineDash([]);
            for (let r = minRow; r <= maxRow; r++) {
                for (let c = minCol; c <= maxCol; c++) {
                    const cell = cellMap.get(`${c},${r}`);
                    if (cell?.owner || isReserved(c, r)) {
                        ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
                        ctx.fillRect(
                            Math.floor(c * cellSize + pan.x),
                            Math.floor(r * cellSize + pan.y),
                            Math.ceil(cellSize),
                            Math.ceil(cellSize)
                        );
                    }
                }
            }
            if (validCount > 0 && cellSize >= 8) {
                const label = `${validCount} cells · $${(validCount * PRICE_PER_CELL).toFixed(2)} USDC`;
                const font = `${Math.max(10, Math.min(14, cellSize * 0.5))}px monospace`;
                ctx.font = font;
                const tw = ctx.measureText(label).width;
                const th = 18;
                const lx = sx + (sw - tw) / 2 - 8;
                const ly = sy + sh + 4;
                ctx.fillStyle = 'rgba(0,0,0,0.85)';
                ctx.fillRect(lx, ly, tw + 16, th);
                ctx.strokeStyle = '#6366f1';
                ctx.strokeRect(lx, ly, tw + 16, th);
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, lx + 8, ly + th / 2);
            }
        }

    }, [grid, cellMap, pan, zoom, width, height, selectedCells, selectionInfo, isSelecting, frameCount, hoveredCell]);

    // --- Event Handlers ---

    const handleMouseDown = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        lastMousePos.current = { x: e.clientX, y: e.clientY };

        if (mode === 'select') {
            const gc = getGridCoord(mouseX, mouseY);
            setSelectGridStart({ col: gc.x, row: gc.y });
            setSelectGridEnd({ col: gc.x, row: gc.y });
            setIsSelecting(true);
        } else {
            setIsDragging(true);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        if (isSelecting && mode === 'select') {
            const gc = getGridCoord(mouseX, mouseY);
            setSelectGridEnd({ col: gc.x, row: gc.y });
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
        const moveDist = Math.sqrt(
            Math.pow(e.clientX - dragStartPos.current.x, 2) +
            Math.pow(e.clientY - dragStartPos.current.y, 2)
        );

        if (isSelecting && mode === 'select' && selectionInfo) {
            if (moveDist < 5) {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    const gc = getGridCoord(mouseX, mouseY);
                    const cell = cellMap.get(`${gc.x},${gc.y}`) || { id: gc.y * COLS + gc.x, x: gc.x, y: gc.y, owner: null };
                    if (!isReserved(gc.x, gc.y)) onSelectCells([cell]);
                    else onSelectCells([]);
                }
            } else {
                const newSelection: Cell[] = [];
                for (let r = selectionInfo.minRow; r <= selectionInfo.maxRow; r++) {
                    for (let c = selectionInfo.minCol; c <= selectionInfo.maxCol; c++) {
                        const cell = cellMap.get(`${c},${r}`);
                        if (!isReserved(c, r) && !cell?.owner) {
                            newSelection.push(cell || { id: r * COLS + c, x: c, y: r, owner: null });
                        }
                    }
                }
                if (newSelection.length > 0) onSelectCells(newSelection);
            }
            setSelectGridStart(null);
            setSelectGridEnd(null);
        } else if (moveDist < 5 && !isSelecting) {
            if (hoveredCell) {
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
    };

    // --- Touch Handlers ---
    const lastTouchDist = useRef<number>(0);
    const touchStartPos = useRef({ x: 0, y: 0 });
    const touchStartTime = useRef(0);

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
            lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            touchStartTime.current = Date.now();
            if (mode === 'select') {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                    const tx = e.touches[0].clientX - rect.left;
                    const ty = e.touches[0].clientY - rect.top;
                    const gc = getGridCoord(tx, ty);
                    setSelectGridStart({ col: gc.x, row: gc.y });
                    setSelectGridEnd({ col: gc.x, row: gc.y });
                    setIsSelecting(true);
                } else {
                    setIsDragging(true);
                }
            } else {
                setIsDragging(true);
            }
        } else if (e.touches.length === 2) {
            lastTouchDist.current = getTouchDist(e.touches[0], e.touches[1]);
            setIsDragging(false);
            setIsSelecting(false);
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        e.preventDefault();
        if (e.touches.length === 1 && isSelecting && mode === 'select') {
            const rect = canvasRef.current?.getBoundingClientRect();
            if (rect) {
                const tx = e.touches[0].clientX - rect.left;
                const ty = e.touches[0].clientY - rect.top;
                const gc = getGridCoord(tx, ty);
                setSelectGridEnd({ col: gc.x, row: gc.y });
            }
        } else if (e.touches.length === 1 && isDragging) {
            const dx = e.touches[0].clientX - lastMousePos.current.x;
            const dy = e.touches[0].clientY - lastMousePos.current.y;
            onPan(dx, dy);
            lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else if (e.touches.length === 2) {
            const newDist = getTouchDist(e.touches[0], e.touches[1]);
            const delta = lastTouchDist.current - newDist;
            const center = getTouchCenter(e.touches[0], e.touches[1]);
            if (Math.abs(delta) > 5) {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                    onZoom(delta * 2, center.x - rect.left, center.y - rect.top);
                    lastTouchDist.current = newDist;
                }
            }
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (e.changedTouches.length === 1) {
            const touch = e.changedTouches[0];
            const moveDist = Math.sqrt(
                Math.pow(touch.clientX - touchStartPos.current.x, 2) +
                Math.pow(touch.clientY - touchStartPos.current.y, 2)
            );
            const elapsed = Date.now() - touchStartTime.current;

            if (isSelecting && mode === 'select' && selectionInfo) {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                    const tx = touch.clientX - rect.left;
                    const ty = touch.clientY - rect.top;
                    if (moveDist < 12) {
                        const gc = getGridCoord(tx, ty);
                        const cell = cellMap.get(`${gc.x},${gc.y}`) || { id: gc.y * COLS + gc.x, x: gc.x, y: gc.y, owner: null };
                        if (!isReserved(gc.x, gc.y)) onSelectCells([cell]);
                        else onSelectCells([]);
                    } else {
                        const newSelection: Cell[] = [];
                        for (let r = selectionInfo.minRow; r <= selectionInfo.maxRow; r++) {
                            for (let c = selectionInfo.minCol; c <= selectionInfo.maxCol; c++) {
                                const cell = cellMap.get(`${c},${r}`);
                                if (!isReserved(c, r) && !cell?.owner) {
                                    newSelection.push(cell || { id: r * COLS + c, x: c, y: r, owner: null });
                                }
                            }
                        }
                        if (newSelection.length > 0) onSelectCells(newSelection);
                    }
                }
                setSelectGridStart(null);
                setSelectGridEnd(null);
            } else if (moveDist < 12 && elapsed < 300 && !isSelecting) {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (rect) {
                    const tx = touch.clientX - rect.left;
                    const ty = touch.clientY - rect.top;
                    const coords = getGridCoord(tx, ty);
                    if (coords.x >= 0 && coords.x < COLS && coords.y >= 0 && coords.y < ROWS) {
                        const key = `${coords.x},${coords.y}`;
                        const cell = cellMap.get(key) || { id: coords.y * COLS + coords.x, x: coords.x, y: coords.y, owner: null };
                        if (!isReserved(coords.x, coords.y)) onSelectCells([cell]);
                        else onSelectCells([]);
                    }
                }
            }
        }
        setIsDragging(false);
        setIsSelecting(false);
        lastTouchDist.current = 0;
    };

    return (
        <div className="relative w-full h-full bg-[#050505] overflow-hidden select-none">
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                className={`block touch-none ${mode === 'select' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { setIsDragging(false); setIsSelecting(false); setSelectGridStart(null); setSelectGridEnd(null); setHoveredCell(null); }}
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
