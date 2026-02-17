// Deterministic pixel avatar generator — zero dependencies
// Generates 5x5 symmetric pixel art from any seed string

export interface PixelAvatar {
  grid: boolean[][]  // 5x5, true = foreground pixel
  fg: string         // CSS color for foreground
  bg: string         // CSS color for background
  accent: string     // CSS color for decoration
}

// djb2 hash → unsigned 32-bit
function hash32(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff
  }
  return h >>> 0
}

// Linear congruential generator (deterministic pseudo-random)
function lcg(seed: number) {
  let s = seed
  return () => {
    s = (1664525 * s + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function generatePixelAvatar(seed: string): PixelAvatar {
  const h = hash32(seed)
  const rand = lcg(h)

  // Generate 5x5 grid with bilateral symmetry (only decide cols 0,1,2)
  const grid: boolean[][] = []
  for (let row = 0; row < 5; row++) {
    const line: boolean[] = [false, false, false, false, false]
    line[0] = rand() > 0.45
    line[1] = rand() > 0.45
    line[2] = rand() > 0.5
    line[3] = line[1]  // mirror
    line[4] = line[0]  // mirror
    grid.push(line)
  }

  // Colors from hash
  const hue = h % 360
  const fg = `hsl(${hue}, 70%, 55%)`
  const bg = `hsl(${hue}, 30%, 12%)`
  const accent = `hsl(${(hue + 120) % 360}, 60%, 50%)`

  return { grid, fg, bg, accent }
}

// Module-level cache (deterministic, safe to persist)
const cache = new Map<string, PixelAvatar>()

export function getPixelAvatar(seed: string): PixelAvatar {
  let avatar = cache.get(seed)
  if (!avatar) {
    avatar = generatePixelAvatar(seed)
    cache.set(seed, avatar)
  }
  return avatar
}

// Draw pixel avatar onto a Canvas context
export function drawPixelAvatar(
  ctx: CanvasRenderingContext2D,
  avatar: PixelAvatar,
  screenX: number,
  screenY: number,
  cellSize: number
) {
  const px = cellSize / 5
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (avatar.grid[row][col]) {
        ctx.fillStyle = avatar.fg
        ctx.fillRect(
          screenX + col * px,
          screenY + row * px,
          Math.ceil(px),
          Math.ceil(px)
        )
      }
    }
  }
}
