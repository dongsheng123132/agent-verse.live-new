import React, { useRef, useEffect, useState } from 'react';
import { Cell, COLS, ROWS, CELL_PX, isReserved } from '../app/types';

interface MinimapProps {
    grid: Cell[];
    pan: { x: number; y: number };
    zoom: number;
    viewport: { width: number; height: number };
    onNavigate: (x: number, y: number) => void;
    onPanTo?: (x: number, y: number) => void;
}

export const Minimap: React.FC<MinimapProps> = ({ grid, pan, zoom, viewport, onNavigate, onPanTo }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const size = 180; // Larger minimap

    const worldW = COLS * CELL_PX;
    const worldH = ROWS * CELL_PX;

    // Scale factor for minimap
    const scale = size / Math.max(worldW, worldH);
    const displayW = worldW * scale;
    const displayH = worldH * scale;

    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const cellMap = React.useMemo(() => {
        const m = new Map<string, Cell>();
        grid.forEach(c => m.set(`${c.x},${c.y}`, c));
        return m;
    }, [grid]);

    // Draw
    useEffect(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        // Background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, displayW, displayH);

        // Grid contents
        const dotSize = Math.max(1.5, CELL_PX * scale);

        // Draw all cells
        for (let y = 0; y < ROWS; y++) {
            for (let x = 0; x < COLS; x++) {
                const cell = cellMap.get(`${x},${y}`);
                const sx = x * CELL_PX * scale;
                const sy = y * CELL_PX * scale;

                if (cell?.owner) {
                    ctx.fillStyle = cell.color || '#10b981';
                    ctx.fillRect(sx, sy, dotSize, dotSize);
                } else if (isReserved(x, y)) {
                    ctx.fillStyle = '#222';
                    ctx.fillRect(sx, sy, dotSize, dotSize);
                }
            }
        }

        // Viewport Rect
        const vx = (-pan.x / zoom) * scale;
        const vy = (-pan.y / zoom) * scale;
        const vw = (viewport.width / zoom) * scale;
        const vh = (viewport.height / zoom) * scale;

        ctx.strokeStyle = '#00ff41'; // Bright green
        ctx.lineWidth = 2;
        ctx.strokeRect(vx, vy, vw, vh);

        ctx.fillStyle = 'rgba(0, 255, 65, 0.1)';
        ctx.fillRect(vx, vy, vw, vh);

    }, [cellMap, pan, zoom, viewport, scale, displayH, displayW]);


    const handleMouseDown = (e: React.MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Check if inside viewport rect
        const vx = (-pan.x / zoom) * scale;
        const vy = (-pan.y / zoom) * scale;
        const vw = (viewport.width / zoom) * scale;
        const vh = (viewport.height / zoom) * scale;

        if (mx >= vx && mx <= vx + vw && my >= vy && my <= vy + vh) {
            // Clicked inside view frame -> Drag mode
            setIsDragging(true);
            dragOffset.current = { x: mx - vx, y: my - vy };
        } else {
            // Clicked outside -> Teleport
            setIsDragging(true);
            // Center the frame on mouse
            dragOffset.current = { x: vw / 2, y: vh / 2 };
            updatePan(mx, my, vw, vh);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Current view dim on minimap
        const vw = (viewport.width / zoom) * scale;
        const vh = (viewport.height / zoom) * scale;

        updatePan(mx, my, vw, vh);
    };

    const handleMouseUp = () => setIsDragging(false);

    const updatePan = (mx: number, my: number, vw: number, vh: number) => {
        if (!onPanTo) return;

        // We want the top-left of the viewport to be at (mx - offset)
        // targetMinimapX = mx - dragOffset.x
        // But onPanTo takes CENTER in world coords.
        // So centerMinimapX = targetMinimapX + vw/2

        const targetMinimapLeft = mx - dragOffset.current.x;
        const targetMinimapTop = my - dragOffset.current.y;

        const centerMinimapX = targetMinimapLeft + vw / 2;
        const centerMinimapY = targetMinimapTop + vh / 2;

        const worldX = centerMinimapX / scale;
        const worldY = centerMinimapY / scale;

        onPanTo(worldX, worldY);
    };

    return (
        <div
            ref={containerRef}
            className="bg-[#000] border border-[#333] p-1 shadow-2xl rounded overflow-hidden select-none"
            style={{ width: displayW + 10, height: displayH + 10 }}
        >
            <canvas
                ref={canvasRef}
                width={displayW}
                height={displayH}
                className={`block ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            />
        </div>
    );
};
