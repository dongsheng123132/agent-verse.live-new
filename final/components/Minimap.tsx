import React, { useRef, useEffect } from 'react';
import { Cell, COLS, ROWS, CELL_PX, isReserved } from '../app/types';

interface MinimapProps {
    grid: Cell[];
    pan: { x: number; y: number };
    zoom: number;
    viewport: { width: number; height: number };
    onNavigate: (x: number, y: number) => void;
}

export const Minimap: React.FC<MinimapProps> = ({ grid, pan, zoom, viewport, onNavigate }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const size = 150; // px
    // World size at Zoom 1
    const worldW = COLS * CELL_PX;
    const worldH = ROWS * CELL_PX;

    // Scale factor for minimap
    // Fit largest dimension
    const scale = size / Math.max(worldW, worldH);
    const displayW = worldW * scale;
    const displayH = worldH * scale;

    const cellMap = React.useMemo(() => {
        const m = new Map<string, Cell>();
        grid.forEach(c => m.set(`${c.x},${c.y}`, c));
        return m;
    }, [grid]);

    useEffect(() => {
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, displayW, displayH);

        // Draw Cells
        // Since it's only 100x100, we can iterate all cells
        const dotSize = Math.max(1, CELL_PX * scale);

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
        // Viewport in world coords (0,0 is top-left of world)
        // pan.x is offset. If pan.x = -100, we are shifted left 100px.
        // Viewport X relative to world = -pan.x
        const vx = (-pan.x / zoom) * scale;
        const vy = (-pan.y / zoom) * scale;
        const vw = (viewport.width / zoom) * scale;
        const vh = (viewport.height / zoom) * scale;

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(vx, vy, vw, vh);

        // Fill semi-transparent
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(vx, vy, vw, vh);

    }, [cellMap, pan, zoom, viewport, scale, displayH, displayW]);

    const handleInteract = (e: React.MouseEvent) => {
        // Find click pos relative to canvas
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        // Convert to world coords (center of view)
        // mx / scale = worldX
        const worldX = mx / scale;
        const worldY = my / scale;

        // Convert world px to cell coords
        const cx = Math.floor(worldX / CELL_PX);
        const cy = Math.floor(worldY / CELL_PX);

        onNavigate(cx, cy);
    }

    return (
        <div className="bg-[#111] border border-[#333] p-1 shadow-2xl rounded">
            <canvas
                ref={canvasRef}
                width={displayW}
                height={displayH}
                className="cursor-crosshair block"
                onMouseDown={(e) => { if (e.buttons === 1) handleInteract(e); }}
                onMouseMove={(e) => { if (e.buttons === 1) handleInteract(e); }}
                onClick={handleInteract}
            />
        </div>
    );
};
