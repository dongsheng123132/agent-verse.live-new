export type Cell = {
  id: number; 
  x: number; 
  y: number; 
  owner: string | null; 
  color?: string;
  title?: string; 
  summary?: string; 
  image_url?: string;
  block_id?: string; 
  block_w?: number; 
  block_h?: number;
  block_origin_x?: number; 
  block_origin_y?: number;
  content_url?: string; // from CellDetail
  markdown?: string;    // from CellDetail
  last_updated?: string;// from CellDetail
}

export type GridEvent = { 
  id: number; 
  event_type: string; 
  x?: number; 
  y?: number; 
  block_size?: string; 
  owner?: string; 
  message?: string; 
  created_at: string 
}

export type Ranking = { 
  owner: string; 
  cell_count?: number; 
  x?: number; 
  y?: number; 
  title?: string; 
  last_updated?: string 
}

export const COLS = 100
export const ROWS = 100
export const CELL_PX = 8

export const BLOCK_SIZES = [
  { w: 1, h: 1, label: '1×1', price: 0.50 },
  { w: 2, h: 1, label: '2×1', price: 1.25 },
  { w: 2, h: 2, label: '2×2', price: 3.00 },
  { w: 3, h: 3, label: '3×3', price: 9.00 },
  { w: 4, h: 4, label: '4×4', price: 20.00 },
]

export const RESERVED_DIAGONALS = new Set([
  '20,20','25,25','30,30','33,33','35,35','40,40','44,44','45,45',
  '50,50','55,55','60,60','66,66','70,70','75,75','77,77','80,80',
  '85,85','88,88','90,90','95,95','99,99'
])

export function isReserved(x: number, y: number) {
  if (x < 16 && y < 16) return true
  return RESERVED_DIAGONALS.has(`${x},${y}`)
}

export function truncAddr(addr: string) {
  if (!addr || addr.length < 12) return addr
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

export function addrColor(addr: string): string {
  let h = 0
  for (let i = 0; i < addr.length; i++) h = (h * 31 + addr.charCodeAt(i)) & 0xffffff
  const hue = h % 360
  return `hsl(${hue}, 65%, 50%)`
}
