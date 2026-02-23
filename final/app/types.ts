/** Built-in scene presets (no server needed). */
export type ScenePreset = 'none' | 'room' | 'avatar' | 'booth'

/** Config for built-in scene renderer. All image URLs must be HTTPS. */
export type SceneConfig = {
  wallColor?: string
  floorColor?: string
  accentColor?: string
  coverImage?: string
  avatarImage?: string
  name?: string
  bio?: string
  items?: Array<{ image: string; label: string }>
}

export type Cell = {
  id: number; 
  x: number; 
  y: number; 
  owner: string | null; 
  color?: string;
  title?: string; 
  summary?: string; 
  image_url?: string;
  iframe_url?: string;
  block_id?: string; 
  block_w?: number; 
  block_h?: number;
  block_origin_x?: number; 
  block_origin_y?: number;
  content_url?: string; // from CellDetail
  markdown?: string;    // from CellDetail
  hit_count?: number;
  last_updated?: string;
  scene_preset?: ScenePreset;
  scene_config?: SceneConfig;
  is_for_sale?: boolean;
  price_usdc?: number;
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

export const COLS = 1000
export const ROWS = 1000
export const CELL_PX = 8

export const PRICE_PER_CELL = 0.1

export function isReserved(x: number, y: number) {
  return x < 16 && y < 16
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
