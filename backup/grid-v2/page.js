'use client';

import { useState, useEffect } from 'react';

export default function GridV2Page() {
  const [grid, setGrid] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadGrid = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/grid/state');
        const data = await response.json();

        // Create 10,000 cells with database data overlaid
        const cells = [];
        for (let y = 0; y < 100; y++) {
          for (let x = 0; x < 100; x++) {
            const dbCell = data.cells?.find(c => c.x === x && c.y === y);
            if (dbCell) {
              cells.push({
                id: y * 100 + x,
                x, y,
                color: dbCell.fill_color || '#10b981',
                title: dbCell.title || '',
                owner: dbCell.owner_address
              });
            }
          }
        }
        setGrid(cells);
      } catch (e) {
        console.error('Failed to load grid:', e);
      }
      setLoading(false);
    };
    loadGrid();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-green-500 font-mono">Loading Grid...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-4">
      <h1 className="text-2xl font-bold mb-4">AgentGrid.OS v2</h1>
      <div className="text-gray-400 mb-4">Loaded {grid.length} cells from database</div>

      {/* Simple Grid Display */}
      <div
        className="relative mx-auto"
        style={{
          width: '800px',
          height: '800px',
          background: '#0a0a0a'
        }}
      >
        {/* Canvas for grid */}
        <canvas
          width={800}
          height={800}
          style={{ width: '100%', height: '100%' }}
          ref={(canvas) => {
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Clear
            ctx.fillStyle = '#0a0a0a';
            ctx.fillRect(0, 0, 800, 800);

            const cellSize = 8;

            // Draw terrain for all cells
            for (let x = 0; x < 100; x++) {
              for (let y = 0; y < 100; y++) {
                const colors = ['#0a0a0a', '#0c0c0c', '#0e0e0e', '#101010', '#111111'];
                const idx = (x * 7 + y * 13) % colors.length;
                ctx.fillStyle = colors[idx];
                ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
              }
            }

            // Draw grid lines
            ctx.strokeStyle = '#2a2a2a';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            for (let i = 0; i <= 100; i++) {
              ctx.moveTo(i * cellSize, 0);
              ctx.lineTo(i * cellSize, 800);
              ctx.moveTo(0, i * cellSize);
              ctx.lineTo(800, i * cellSize);
            }
            ctx.stroke();

            // Draw owned cells
            grid.forEach(cell => {
              ctx.fillStyle = cell.color;
              ctx.fillRect(cell.x * cellSize + 0.5, cell.y * cellSize + 0.5, cellSize - 1, cellSize - 1);
            });
          }}
        />
      </div>

      {/* Cell List */}
      <div className="mt-8 max-w-4xl">
        <h2 className="text-xl font-bold mb-2">Active Cells ({grid.length})</h2>
        <div className="grid grid-cols-4 gap-2 text-sm">
          {grid.slice(0, 20).map(cell => (
            <div key={cell.id} className="bg-[#1a1a1a] p-2 rounded">
              <div className="text-green-500">({cell.x}, {cell.y})</div>
              <div className="text-gray-400 truncate">{cell.title}</div>
            </div>
          ))}
        </div>
        {grid.length > 20 && (
          <div className="text-gray-500 mt-2">... and {grid.length - 20} more</div>
        )}
      </div>
    </div>
  );
}
