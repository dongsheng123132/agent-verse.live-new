import React, { useRef, useEffect } from 'react';
import { GridCell } from './types';
import { COLS, ROWS } from './constants';

interface MinimapProps {
  grid: GridCell[];
  pan: { x: number; y: number };
  zoom: number;
  containerSize: { width: number; height: number }; // The size of the viewing window
  contentSize: number; // The actual pixel size of the grid (e.g. 3000px)
  onNavigate: (x: number, y: number) => void;
}

export const Minimap: React.FC<MinimapProps> = ({ 
  grid, 
  pan, 
  zoom, 
  containerSize, 
  contentSize,
  onNavigate 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const MAP_SIZE = 150; // Pixel size of the minimap on screen

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    // Draw Cells
    // We map the 100x100 grid to the 150x150 canvas
    const cellPixelSize = MAP_SIZE / COLS;

    grid.forEach(cell => {
      // Optimization: Only draw if not empty to save cycles, or draw all for complete look
      let color = '#1a1a1a'; // Default empty

      if (cell.x === 0 && cell.y === 0) color = '#9333ea'; // Genesis
      else if (cell.owner) {
        if (cell.status === 'HIRING') color = '#dc2626';
        else if (cell.status === 'HIRE_ME') color = '#00ff41';
        else if (cell.status === 'PROCESSING') color = '#2563eb';
        else if (cell.isForSale) color = '#eab308';
        else color = '#404040'; // Owned but idle
      }

      ctx.fillStyle = color;
      ctx.fillRect(cell.x * cellPixelSize, cell.y * cellPixelSize, cellPixelSize, cellPixelSize);
    });

    // Draw Viewport Rect (The "Camera")
    // Convert pan/zoom to minimap coordinates
    // Pan is usually negative (moving content left), so we invert it for calculation
    const viewX = (-pan.x / (contentSize * zoom)) * MAP_SIZE;
    const viewY = (-pan.y / (contentSize * zoom)) * MAP_SIZE;
    
    // Width of viewport in relation to total content, scaled down to minimap
    const viewW = (containerSize.width / (contentSize * zoom)) * MAP_SIZE;
    const viewH = (containerSize.height / (contentSize * zoom)) * MAP_SIZE;

    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1;
    ctx.strokeRect(viewX, viewY, viewW, viewH);

    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(viewX, viewY, viewW, viewH);

  }, [grid, pan, zoom, containerSize, contentSize]);

  const handleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Convert click percent to content coordinates
    const ratioX = clickX / MAP_SIZE;
    const ratioY = clickY / MAP_SIZE;

    // We want the clicked point to be in the center of the screen
    // Target Pan = -(ContentSize * Zoom * Ratio) + (ScreenSize / 2)
    const newPanX = -(contentSize * zoom * ratioX) + (containerSize.width / 2);
    const newPanY = -(contentSize * zoom * ratioY) + (containerSize.height / 2);

    onNavigate(newPanX, newPanY);
  };

  return (
    <div className="relative border border-[#333] bg-black shadow-2xl">
      <canvas 
        ref={canvasRef}
        width={MAP_SIZE}
        height={MAP_SIZE}
        onClick={handleClick}
        className="cursor-crosshair block"
      />
      <div className="absolute top-0 right-0 bg-black/50 text-[8px] px-1 text-gray-400 pointer-events-none">
        NAV
      </div>
    </div>
  );
};