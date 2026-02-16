'use client';

import { useState, useRef, useEffect } from 'react';
import { initializeGrid, createPurchase, verifyPurchase } from './services/api';
import { Globe, X, Wallet, Check, Loader2 } from 'lucide-react';

const CELL_SIZE = 30;

export default function GridProPage() {
  const [grid, setGrid] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCell, setSelectedCell] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Purchase state
  const [purchaseStep, setPurchaseStep] = useState('idle'); // idle, creating, pay, verifying, success
  const [orderData, setOrderData] = useState(null);
  const [txHash, setTxHash] = useState('');
  const [treasury, setTreasury] = useState('0x5C5869bceB4C4eb3fA1DCDEeBd84e9890DbC01aF');

  const [zoom, setZoom] = useState(0.6);
  const [pan, setPan] = useState({ x: 100, y: 100 });
  const [hoveredCell, setHoveredCell] = useState(null);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // Load grid data
  useEffect(() => {
    loadGrid();
  }, []);

  const loadGrid = async () => {
    setLoading(true);
    const data = await initializeGrid();
    setGrid(data);
    setLoading(false);
  };

  // Draw canvas
  useEffect(() => {
    if (!canvasRef.current || grid.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    // Calculate visible range
    const startCol = Math.floor((-pan.x) / (CELL_SIZE * zoom));
    const endCol = startCol + Math.ceil(width / (CELL_SIZE * zoom)) + 1;
    const startRow = Math.floor((-pan.y) / (CELL_SIZE * zoom));
    const endRow = startRow + Math.ceil(height / (CELL_SIZE * zoom)) + 1;

    const renderStartCol = Math.max(0, startCol);
    const renderEndCol = Math.min(100, endCol);
    const renderStartRow = Math.max(0, startRow);
    const renderEndRow = Math.min(100, endRow);

    // Draw cells
    for (let r = renderStartRow; r < renderEndRow; r++) {
      for (let c = renderStartCol; c < renderEndCol; c++) {
        const idx = r * 100 + c;
        const cell = grid[idx];
        if (!cell) continue;

        const screenX = Math.floor(cell.x * CELL_SIZE * zoom + pan.x);
        const screenY = Math.floor(cell.y * CELL_SIZE * zoom + pan.y);
        const screenSize = Math.ceil(CELL_SIZE * zoom);

        // Draw cell
        ctx.fillStyle = cell.color || '#111';
        ctx.fillRect(screenX, screenY, screenSize, screenSize);

        // Draw border
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(screenX, screenY, screenSize, screenSize);

        // Draw locked overlay
        if (cell.status === 'LOCKED') {
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fillRect(screenX, screenY, screenSize, screenSize);
        }
      }
    }

    // Draw hover highlight
    if (hoveredCell) {
      const hX = Math.floor(hoveredCell.x * CELL_SIZE * zoom + pan.x);
      const hY = Math.floor(hoveredCell.y * CELL_SIZE * zoom + pan.y);
      const hSize = Math.ceil(CELL_SIZE * zoom);
      ctx.strokeStyle = '#00ff41';
      ctx.lineWidth = 2;
      ctx.strokeRect(hX, hY, hSize, hSize);
    }
  }, [grid, pan, zoom, hoveredCell]);

  // Mouse handlers
  const handleMouseDown = (e) => {
    const startX = e.clientX;
    const startY = e.clientY;
    const startPanX = pan.x;
    const startPanY = pan.y;

    const handleMouseMove = (e) => {
      setPan({
        x: startPanX + (e.clientX - startX),
        y: startPanY + (e.clientY - startY)
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridX = Math.floor((x - pan.x) / (CELL_SIZE * zoom));
    const gridY = Math.floor((y - pan.y) / (CELL_SIZE * zoom));

    if (gridX >= 0 && gridX < 100 && gridY >= 0 && gridY < 100) {
      const idx = gridY * 100 + gridX;
      const cell = grid[idx];
      if (cell) {
        setSelectedCell(cell);
        setShowModal(true);
        setPurchaseStep('idle');
        setTxHash('');
      }
    }
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const gridX = Math.floor((x - pan.x) / (CELL_SIZE * zoom));
    const gridY = Math.floor((y - pan.y) / (CELL_SIZE * zoom));

    if (gridX >= 0 && gridX < 100 && gridY >= 0 && gridY < 100) {
      const idx = gridY * 100 + gridX;
      setHoveredCell(grid[idx]);
    } else {
      setHoveredCell(null);
    }
  };

  // Purchase handlers
  const startPurchase = async () => {
    if (!selectedCell) return;
    setPurchaseStep('creating');

    const result = await createPurchase(selectedCell.x, selectedCell.y, selectedCell.price);
    if (result.receipt_id) {
      setOrderData(result);
      setPurchaseStep('pay');
    } else {
      alert('创建订单失败: ' + (result.error || '未知错误'));
      setPurchaseStep('idle');
    }
  };

  const verifyPayment = async () => {
    if (!orderData || !txHash) return;
    setPurchaseStep('verifying');

    const result = await verifyPurchase(orderData.receipt_id, txHash);
    if (result.paid) {
      setPurchaseStep('success');
      // Reload grid to show updated ownership
      await loadGrid();
    } else {
      alert('支付验证失败，请检查交易哈希');
      setPurchaseStep('pay');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
          <div className="text-green-500 font-mono">LOADING GRID...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#050505] text-white flex flex-col font-sans">
      {/* Header */}
      <header className="h-14 border-b border-[#222] bg-[#0a0a0a] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"/>
          <h1 className="font-bold text-sm tracking-widest font-mono">AGENTGRID.OS</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-xs text-gray-500 font-mono">
            {grid.filter(c => c.owner).length} CELLS OWNED
          </div>
          <button className="flex items-center gap-1 text-xs text-gray-500 border border-[#333] px-2 py-1 rounded hover:border-gray-400">
            <Globe size={12}/> CN
          </button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 border-r border-[#222] bg-[#0a0a0a] p-4 hidden md:block">
          <h3 className="text-xs font-bold text-gray-500 mb-4 font-mono">LEGEND</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded"/>
              <span className="text-gray-400">Owned</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#065f46] rounded"/>
              <span className="text-gray-400">For Sale</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#222] rounded"/>
              <span className="text-gray-400">Reserved</span>
            </div>
          </div>

          <h3 className="text-xs font-bold text-gray-500 mb-4 mt-8 font-mono">CONTROLS</h3>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setZoom(z => Math.min(2, z + 0.1))}
              className="px-3 py-2 bg-[#111] border border-[#333] rounded text-xs hover:border-green-500"
            >
              Zoom In (+)
            </button>
            <button
              onClick={() => setZoom(z => Math.max(0.2, z - 0.1))}
              className="px-3 py-2 bg-[#111] border border-[#333] rounded text-xs hover:border-green-500"
            >
              Zoom Out (-)
            </button>
            <div className="text-center text-xs text-gray-500 font-mono">
              {Math.round(zoom * 100)}%
            </div>
          </div>
        </div>

        {/* Canvas Area */}
        <div ref={containerRef} className="flex-1 relative overflow-hidden">
          <canvas
            ref={canvasRef}
            width={1200}
            height={800}
            className="absolute inset-0 cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown}
            onClick={handleClick}
            onMouseMove={handleMouseMove}
            onWheel={(e) => {
              e.preventDefault();
              setZoom(z => Math.max(0.2, Math.min(2, z - e.deltaY * 0.001)));
            }}
          />

          {/* Hover Tooltip */}
          {hoveredCell && (
            <div className="absolute bottom-4 left-4 bg-black/80 border border-green-900/50 p-3 rounded text-xs pointer-events-none">
              <div className="text-green-500 font-mono font-bold">[{hoveredCell.x}, {hoveredCell.y}]</div>
              <div className="text-gray-300">{hoveredCell.title || 'Empty Land'}</div>
              {hoveredCell.owner && (
                <div className="text-gray-500 font-mono mt-1">{hoveredCell.owner.slice(0, 10)}...</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Purchase Modal */}
      {showModal && selectedCell && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-[#333] rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-[#222]">
              <h2 className="text-lg font-bold">Cell Details</h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-500 hover:text-white"
              >
                <X size={20}/>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4">
              {/* Cell Info */}
              <div className="mb-6">
                <div className="text-xs text-gray-500 font-mono mb-1">COORDINATES</div>
                <div className="text-2xl font-mono text-green-500">[{selectedCell.x}, {selectedCell.y}]</div>
              </div>

              {selectedCell.owner ? (
                // Owned cell
                <div className="space-y-4">
                  <div className="p-3 bg-[#0a0a0a] rounded border border-[#222]">
                    <div className="text-xs text-gray-500 mb-1">OWNER</div>
                    <div className="font-mono text-sm text-green-500">{selectedCell.owner}</div>
                  </div>

                  {selectedCell.title && (
                    <div className="p-3 bg-[#0a0a0a] rounded border border-[#222]">
                      <div className="text-xs text-gray-500 mb-1">NAME</div>
                      <div className="font-bold">{selectedCell.title}</div>
                    </div>
                  )}

                  {selectedCell.summary && (
                    <div className="p-3 bg-[#0a0a0a] rounded border border-[#222]">
                      <div className="text-xs text-gray-500 mb-1">DESCRIPTION</div>
                      <div className="text-sm text-gray-300">{selectedCell.summary}</div>
                    </div>
                  )}

                  <div className="p-3 bg-yellow-900/20 border border-yellow-700/50 rounded">
                    <div className="text-sm text-yellow-500">This cell is already owned</div>
                  </div>
                </div>
              ) : selectedCell.status === 'LOCKED' ? (
                // Locked cell
                <div className="p-4 bg-red-900/20 border border-red-700/50 rounded text-center">
                  <div className="text-red-500 font-bold mb-2">SYSTEM RESERVED</div>
                  <div className="text-sm text-gray-400">This cell is reserved for system use</div>
                </div>
              ) : (
                // Available for purchase
                <div className="space-y-4">
                  <div className="p-4 bg-green-900/20 border border-green-700/50 rounded text-center">
                    <div className="text-xs text-gray-400 mb-1">PRICE</div>
                    <div className="text-3xl font-bold text-green-500">{selectedCell.price} USDC</div>
                  </div>

                  {/* Purchase Flow */}
                  {purchaseStep === 'idle' && (
                    <button
                      onClick={startPurchase}
                      className="w-full py-3 bg-green-600 hover:bg-green-500 text-black font-bold rounded transition-colors flex items-center justify-center gap-2"
                    >
                      <Wallet size={18}/>
                      Buy This Cell
                    </button>
                  )}

                  {purchaseStep === 'creating' && (
                    <div className="text-center py-4">
                      <Loader2 className="animate-spin mx-auto mb-2" size={24}/>
                      <div className="text-sm text-gray-400">Creating order...</div>
                    </div>
                  )}

                  {purchaseStep === 'pay' && orderData && (
                    <div className="space-y-3">
                      <div className="p-3 bg-[#0a0a0a] rounded border border-[#222]">
                        <div className="text-xs text-gray-500 mb-1">Send exactly</div>
                        <div className="text-xl font-mono text-green-500">{orderData.unique_amount} USDC</div>
                      </div>

                      <div className="p-3 bg-[#0a0a0a] rounded border border-[#222]">
                        <div className="text-xs text-gray-500 mb-1">To address</div>
                        <div className="text-xs font-mono break-all">{treasury}</div>
                      </div>

                      <div className="p-3 bg-[#0a0a0a] rounded border border-[#222]">
                        <div className="text-xs text-gray-500 mb-1">Your transaction hash</div>
                        <input
                          type="text"
                          value={txHash}
                          onChange={(e) => setTxHash(e.target.value)}
                          placeholder="0x..."
                          className="w-full bg-[#111] border border-[#333] rounded px-3 py-2 text-sm font-mono mt-1"
                        />
                      </div>

                      <button
                        onClick={verifyPayment}
                        disabled={!txHash}
                        className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 text-black font-bold rounded transition-colors flex items-center justify-center gap-2"
                      >
                        <Check size={18}/>
                        Verify Payment
                      </button>
                    </div>
                  )}

                  {purchaseStep === 'verifying' && (
                    <div className="text-center py-4">
                      <Loader2 className="animate-spin mx-auto mb-2 text-green-500" size={24}/>
                      <div className="text-sm text-gray-400">Verifying on-chain...</div>
                    </div>
                  )}

                  {purchaseStep === 'success' && (
                    <div className="p-4 bg-green-900/30 border border-green-500 rounded text-center">
                      <Check className="mx-auto mb-2 text-green-500" size={32}/>
                      <div className="text-green-500 font-bold mb-1">Purchase Successful!</div>
                      <div className="text-sm text-gray-400">You now own this cell</div>
                      <button
                        onClick={() => {
                          setShowModal(false);
                          setPurchaseStep('idle');
                        }}
                        className="mt-4 px-4 py-2 bg-green-600 text-black rounded font-bold"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
