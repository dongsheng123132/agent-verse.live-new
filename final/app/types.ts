import type { ShowcaseKind, ShowcaseLink, ShowcaseListing } from '../lib/showcase/metropolis'

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
  // x402 service market (MONAD-MARKET-SPEC.md P2)
  service_url?: string | null;
  service_method?: 'GET' | 'POST' | string | null;
  service_desc?: string | null;
  service_category?: string | null;
  /** Probe-only (lib/market/types.ts MarketStatus): can_pay = a read-only GET got a valid x402 v2 402; failed = it did not; unchecked = POST or not probed. */
  probe_status?: 'can_pay' | 'failed' | 'unchecked' | null;
  probe_accepts?: Array<{ scheme: string; network: string; amount: string | null; asset: string | null; payTo: string | null }> | null;
  probed_at?: string | null;
  // Monad Metropolis showcase (lib/showcase): virtual, display-only cells merged in by /api/grid and /api/cells.
  showcase?: boolean;
  showcase_kind?: ShowcaseKind;
  /** Short map label (sponsor amount / service price). */
  showcase_tag?: string;
  /** Second colour (arena gold, service lamp amber). */
  showcase_accent?: string;
  showcase_links?: ShowcaseLink[];
  /** Small print at the bottom of the detail view. */
  showcase_footnote?: string;
  /** Price / network a service-street slot is listed with, and how far to trust it. */
  showcase_listing?: ShowcaseListing;
}

export const COLS = 100
export const ROWS = 100
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
