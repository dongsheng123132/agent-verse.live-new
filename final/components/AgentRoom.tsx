import React, { useRef, useEffect, useState } from 'react';
import { Cell, truncAddr } from '../app/types';
import { X, Home, Globe, FileText, ExternalLink } from 'lucide-react';
import { useLang } from '../lib/LangContext';
import { getPixelAvatar, drawPixelAvatar } from '../lib/pixelAvatar';

interface AgentRoomProps {
  cell: Cell | null;
  loading: boolean;
  onClose: () => void;
}

type Tab = 'room' | 'embed' | 'info';

// ---------- isometric helpers ----------

const TILE_W = 32;
const TILE_H = 16;
const ROOM_GRID = 5; // 5×5 floor tiles
const WALL_H = 4;    // wall height in tiles
const CW = 400;      // canvas width
const CH = 320;       // canvas height
const OX = CW / 2;   // origin X (center)
const OY = 100;       // origin Y (top area for walls)

function isoX(gx: number, gy: number) {
  return OX + (gx - gy) * (TILE_W / 2);
}
function isoY(gx: number, gy: number) {
  return OY + (gx + gy) * (TILE_H / 2);
}

function hash32(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff;
  return h >>> 0;
}

function lcg(seed: number) {
  let s = seed;
  return () => { s = (1664525 * s + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

// ---------- procedural furniture drawers ----------

function drawIsoBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, d: number, topColor: string, leftColor: string, rightColor: string) {
  const hw = w / 2, hd = d / 2;
  // top face
  ctx.fillStyle = topColor;
  ctx.beginPath();
  ctx.moveTo(x, y - h);
  ctx.lineTo(x + hw, y - h + hd);
  ctx.lineTo(x, y - h + d);
  ctx.lineTo(x - hw, y - h + hd);
  ctx.closePath();
  ctx.fill();
  // left face
  ctx.fillStyle = leftColor;
  ctx.beginPath();
  ctx.moveTo(x - hw, y - h + hd);
  ctx.lineTo(x, y - h + d);
  ctx.lineTo(x, y + d);
  ctx.lineTo(x - hw, y + hd);
  ctx.closePath();
  ctx.fill();
  // right face
  ctx.fillStyle = rightColor;
  ctx.beginPath();
  ctx.moveTo(x + hw, y - h + hd);
  ctx.lineTo(x, y - h + d);
  ctx.lineTo(x, y + d);
  ctx.lineTo(x + hw, y + hd);
  ctx.closePath();
  ctx.fill();
}

type FurnitureItem = {
  name: string;
  prob: number;
  gx: number;
  gy: number;
  draw: (ctx: CanvasRenderingContext2D, x: number, y: number, accent: string, secondary: string) => void;
};

const FURNITURE_POOL: FurnitureItem[] = [
  {
    name: 'desk', prob: 0.60, gx: 1, gy: 1,
    draw: (ctx, x, y, accent) => {
      drawIsoBox(ctx, x, y, 28, 14, 14, accent, '#222', '#1a1a1a');
    }
  },
  {
    name: 'plant', prob: 0.70, gx: 0, gy: 0,
    draw: (ctx, x, y) => {
      // pot
      drawIsoBox(ctx, x, y, 12, 8, 6, '#8B4513', '#6B3410', '#5a2d0e');
      // leaves
      ctx.fillStyle = '#22c55e';
      ctx.beginPath(); ctx.arc(x, y - 14, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#16a34a';
      ctx.beginPath(); ctx.arc(x - 3, y - 18, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 4, y - 16, 4, 0, Math.PI * 2); ctx.fill();
    }
  },
  {
    name: 'bookshelf', prob: 0.40, gx: 0, gy: 2,
    draw: (ctx, x, y, accent) => {
      drawIsoBox(ctx, x, y, 24, 28, 10, '#3a2a1a', '#2a1a0a', '#1a1008');
      // books
      const bookColors = [accent, '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = bookColors[i % bookColors.length];
        ctx.fillRect(x - 8 + i * 5, y - 26, 4, 8);
      }
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = bookColors[(i + 2) % bookColors.length];
        ctx.fillRect(x - 6 + i * 5, y - 16, 4, 8);
      }
    }
  },
  {
    name: 'lamp', prob: 0.50, gx: 4, gy: 0,
    draw: (ctx, x, y, accent) => {
      // pole
      ctx.fillStyle = '#555';
      ctx.fillRect(x - 1, y - 28, 2, 22);
      // shade
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.arc(x, y - 30, 6, 0, Math.PI * 2); ctx.fill();
      // glow
      ctx.fillStyle = 'rgba(255,255,200,0.15)';
      ctx.beginPath(); ctx.arc(x, y - 30, 12, 0, Math.PI * 2); ctx.fill();
      // base
      drawIsoBox(ctx, x, y, 10, 4, 5, '#444', '#333', '#2a2a2a');
    }
  },
  {
    name: 'rug', prob: 0.45, gx: 2, gy: 2,
    draw: (ctx, x, y, accent) => {
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + 20, y);
      ctx.lineTo(x, y + 8);
      ctx.lineTo(x - 20, y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  },
  {
    name: 'monitor', prob: 0.35, gx: 1, gy: 3,
    draw: (ctx, x, y, accent) => {
      // stand
      ctx.fillStyle = '#333';
      ctx.fillRect(x - 1, y - 8, 2, 6);
      drawIsoBox(ctx, x, y, 8, 2, 4, '#444', '#333', '#2a2a2a');
      // screen
      ctx.fillStyle = '#111';
      ctx.fillRect(x - 10, y - 24, 20, 14);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(x - 8, y - 22, 16, 10);
      ctx.globalAlpha = 1;
      // text lines on screen
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.4;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(x - 6, y - 20 + i * 3, 8 + (i % 2) * 4, 1);
      }
      ctx.globalAlpha = 1;
    }
  },
];

// ---------- room canvas renderer ----------

function drawRoom(
  ctx: CanvasRenderingContext2D,
  cell: Cell,
  imageEl: HTMLImageElement | null,
) {
  const owner = cell.owner || '';
  const avatar = getPixelAvatar(owner);
  const roomHash = hash32(owner + '_room');
  const rand = lcg(roomHash);

  // Background
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, CW, CH);

  // Floor color from avatar
  const floorBase = avatar.colors.bg;
  const floorLight = avatar.colors.primary;

  // Draw walls (back-left and back-right)
  const wallHeight = WALL_H * TILE_H;

  // Left wall (parallelogram)
  ctx.fillStyle = '#151520';
  ctx.beginPath();
  ctx.moveTo(isoX(0, 0), isoY(0, 0) - wallHeight);
  ctx.lineTo(isoX(ROOM_GRID, 0), isoY(ROOM_GRID, 0) - wallHeight);
  ctx.lineTo(isoX(ROOM_GRID, 0), isoY(ROOM_GRID, 0));
  ctx.lineTo(isoX(0, 0), isoY(0, 0));
  ctx.closePath();
  ctx.fill();

  // Right wall
  ctx.fillStyle = '#101018';
  ctx.beginPath();
  ctx.moveTo(isoX(0, 0), isoY(0, 0) - wallHeight);
  ctx.lineTo(isoX(0, ROOM_GRID), isoY(0, ROOM_GRID) - wallHeight);
  ctx.lineTo(isoX(0, ROOM_GRID), isoY(0, ROOM_GRID));
  ctx.lineTo(isoX(0, 0), isoY(0, 0));
  ctx.closePath();
  ctx.fill();

  // Wall accent lines
  ctx.strokeStyle = avatar.colors.accent;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(isoX(0, 0), isoY(0, 0) - wallHeight);
  ctx.lineTo(isoX(ROOM_GRID, 0), isoY(ROOM_GRID, 0) - wallHeight);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(isoX(0, 0), isoY(0, 0) - wallHeight);
  ctx.lineTo(isoX(0, ROOM_GRID), isoY(0, ROOM_GRID) - wallHeight);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Wall painting (image_url) on left wall
  if (imageEl && imageEl.complete && imageEl.naturalWidth > 0) {
    const paintX = (isoX(1, 0) + isoX(3, 0)) / 2;
    const paintY = isoY(2, 0) - wallHeight + 12;
    const pw = 50, ph = 38;
    // frame
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(paintX - pw / 2 - 3, paintY - 3, pw + 6, ph + 6);
    ctx.fillStyle = avatar.colors.accent;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(paintX - pw / 2 - 1, paintY - 1, pw + 2, ph + 2);
    ctx.globalAlpha = 1;
    ctx.drawImage(imageEl, paintX - pw / 2, paintY, pw, ph);
  }

  // Draw floor tiles (back to front for painter's algorithm)
  for (let gy = 0; gy < ROOM_GRID; gy++) {
    for (let gx = 0; gx < ROOM_GRID; gx++) {
      const x = isoX(gx, gy);
      const y = isoY(gx, gy);
      const isCheckerboard = (gx + gy) % 2 === 0;

      ctx.fillStyle = isCheckerboard ? '#1a1a24' : '#14141c';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + TILE_W / 2, y + TILE_H / 2);
      ctx.lineTo(x, y + TILE_H);
      ctx.lineTo(x - TILE_W / 2, y + TILE_H / 2);
      ctx.closePath();
      ctx.fill();

      // subtle grid line
      ctx.strokeStyle = '#222';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  // Floor accent border
  ctx.strokeStyle = avatar.colors.accent;
  ctx.globalAlpha = 0.15;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(isoX(0, 0), isoY(0, 0));
  ctx.lineTo(isoX(ROOM_GRID, 0), isoY(ROOM_GRID, 0));
  ctx.lineTo(isoX(ROOM_GRID, ROOM_GRID), isoY(ROOM_GRID, ROOM_GRID));
  ctx.lineTo(isoX(0, ROOM_GRID), isoY(0, ROOM_GRID));
  ctx.closePath();
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Determine furniture placement (deterministic)
  const occupied = new Set<string>();
  const placed: { item: FurnitureItem; gx: number; gy: number }[] = [];

  const shuffled = [...FURNITURE_POOL].sort(() => rand() - 0.5);
  let count = 0;
  for (const item of shuffled) {
    if (count >= 3) break;
    if (rand() > item.prob) continue;
    // Find placement slot
    let gx = item.gx, gy = item.gy;
    if (occupied.has(`${gx},${gy}`)) {
      // try adjacent
      gx = Math.min(4, gx + 1);
      if (occupied.has(`${gx},${gy}`)) continue;
    }
    occupied.add(`${gx},${gy}`);
    placed.push({ item, gx, gy });
    count++;
  }

  // Character position
  const charGx = 2, charGy = 3;
  occupied.add(`${charGx},${charGy}`);

  // Sort by depth (gy + gx, back to front)
  placed.sort((a, b) => (a.gx + a.gy) - (b.gx + b.gy));

  // Draw furniture + character (back to front)
  let charDrawn = false;
  for (const { item, gx, gy } of placed) {
    if (!charDrawn && (gx + gy) >= (charGx + charGy)) {
      drawCharacter(ctx, avatar, charGx, charGy);
      charDrawn = true;
    }
    const fx = isoX(gx + 0.5, gy + 0.5);
    const fy = isoY(gx + 0.5, gy + 0.5);
    item.draw(ctx, fx, fy, avatar.colors.accent, avatar.colors.secondary);
  }
  if (!charDrawn) {
    drawCharacter(ctx, avatar, charGx, charGy);
  }

  // Room label
  ctx.fillStyle = '#333';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`AGENT_HOME [${cell.x},${cell.y}]`, CW / 2, CH - 8);
}

function drawCharacter(ctx: CanvasRenderingContext2D, avatar: ReturnType<typeof getPixelAvatar>, gx: number, gy: number) {
  const cx = isoX(gx + 0.5, gy + 0.5);
  const cy = isoY(gx + 0.5, gy + 0.5);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw 12×12 avatar at 4× scale (48×48)
  const avatarSize = 48;
  drawPixelAvatar(ctx, avatar, cx - avatarSize / 2, cy - avatarSize + 4, avatarSize);
}

// ---------- main component ----------

export const AgentRoom: React.FC<AgentRoomProps> = ({ cell, loading, onClose }) => {
  const { t } = useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>('room');
  const [wallImage, setWallImage] = useState<HTMLImageElement | null>(null);

  // Load wall painting image
  useEffect(() => {
    if (!cell?.image_url) { setWallImage(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setWallImage(img);
    img.src = cell.image_url;
  }, [cell?.image_url]);

  // Draw room canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !cell?.owner) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawRoom(ctx, cell, wallImage);
  }, [cell, wallImage]);

  if (!cell && !loading) return null;

  const avatar = cell?.owner ? getPixelAvatar(cell.owner) : null;
  const hasEmbed = !!cell?.iframe_url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#111] border border-[#333] rounded-lg max-w-lg w-full shadow-xl max-h-[90vh] overflow-y-auto relative animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-white z-10">
          <X size={20} />
        </button>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-500 font-mono text-xs animate-pulse">{t('retrieving')}</p>
          </div>
        ) : cell ? (
          <>
            {/* Header */}
            <div className="px-5 pt-4 pb-2">
              <h2 className="text-green-500 font-mono font-bold text-lg flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                {cell.title || `Agent (${cell.x},${cell.y})`}
                {cell.block_w && cell.block_w > 1 ? <span className="text-xs text-gray-500">{cell.block_w}x{cell.block_h}</span> : ''}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#222] border border-[#333] text-gray-400">
                  {truncAddr(cell.owner || '')}
                </span>
                {cell.last_updated && (
                  <span className="text-[10px] text-gray-600 font-mono">
                    {new Date(cell.last_updated).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>

            {/* Room Canvas */}
            <div className="px-3 pb-2">
              <canvas
                ref={canvasRef}
                width={CW}
                height={CH}
                className="w-full rounded border border-[#222]"
                style={{ imageRendering: 'pixelated', background: '#0a0a0a' }}
              />
            </div>

            {/* Tabs */}
            <div className="px-3 flex gap-1 border-b border-[#222]">
              <TabBtn active={activeTab === 'room'} onClick={() => setActiveTab('room')}>
                <Home size={12} /> {t('tab_room')}
              </TabBtn>
              {hasEmbed && (
                <TabBtn active={activeTab === 'embed'} onClick={() => setActiveTab('embed')}>
                  <Globe size={12} /> {t('tab_embed')}
                </TabBtn>
              )}
              <TabBtn active={activeTab === 'info'} onClick={() => setActiveTab('info')}>
                <FileText size={12} /> {t('tab_info')}
              </TabBtn>
            </div>

            {/* Tab content */}
            <div className="px-5 py-3">
              {activeTab === 'room' && (
                <div className="text-center">
                  {cell.summary && <p className="text-gray-300 text-sm mb-2">{cell.summary}</p>}
                  <div className="flex gap-2 justify-center flex-wrap">
                    {avatar && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1a1a1a] border border-[#333] text-gray-500">
                        {avatar.archetype.toUpperCase()}
                      </span>
                    )}
                    {cell.content_url && (
                      <a href={cell.content_url} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#1a1a1a] border border-[#333] text-blue-400 hover:border-blue-500 flex items-center gap-1">
                        <ExternalLink size={10} /> {t('external_link')}
                      </a>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'embed' && cell.iframe_url && (
                <div className="space-y-2">
                  <iframe
                    src={cell.iframe_url}
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                    className="w-full h-80 rounded border border-[#333] bg-black"
                    title={cell.title || 'Embedded content'}
                  />
                  <p className="text-[9px] text-gray-600 font-mono text-center">
                    {cell.iframe_url}
                  </p>
                </div>
              )}

              {activeTab === 'info' && (
                <div className="space-y-3">
                  {cell.title && <h3 className="text-white font-bold text-lg">{cell.title}</h3>}
                  {cell.summary && <p className="text-gray-300 text-sm leading-relaxed">{cell.summary}</p>}

                  {cell.content_url && (
                    <div className="bg-[#0a0a0a] border border-[#333] p-3 rounded">
                      <div className="text-[10px] text-gray-500 font-bold mb-1">{t('external_link')}</div>
                      <a href={cell.content_url} target="_blank" rel="noopener noreferrer"
                        className="text-blue-500 text-xs hover:underline block font-mono break-all">
                        {cell.content_url}
                      </a>
                    </div>
                  )}

                  {cell.markdown && (
                    <div className="bg-[#0a0a0a] border border-[#333] p-3 rounded">
                      <div className="text-[10px] text-gray-500 font-bold mb-2">README.MD</div>
                      <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all font-mono max-h-60 overflow-y-auto">
                        {cell.markdown}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-10 text-gray-500">
            <p>{t('no_data')}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Tab button component
const TabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`px-3 py-2 text-[10px] font-mono flex items-center gap-1.5 border-b-2 transition-colors ${
      active
        ? 'border-green-500 text-green-400'
        : 'border-transparent text-gray-500 hover:text-gray-300'
    }`}
  >
    {children}
  </button>
);
