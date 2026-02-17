// Deterministic pixel avatar generator — CryptoPunks-style layered characters
// Generates 12×12 multi-color pixel art from any seed string
// 4 archetypes × 3+ templates × attribute layers = thousands of unique combinations

export interface PixelAvatar {
  pixels: number[][]   // 12×12, 0=empty 1=primary 2=secondary 3=accent 4=skin
  colors: {
    primary: string    // main body / clothing
    secondary: string  // detail / mouth
    accent: string     // eyes / accessories highlight
    skin: string       // body tone
    bg: string         // background
  }
  archetype: 'humanoid' | 'robot' | 'creature' | 'blob'
}

// ---------- hash & rng ----------

function hash32(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) & 0xffffffff
  }
  return h >>> 0
}

function lcg(seed: number) {
  let s = seed
  return () => {
    s = (1664525 * s + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

// ---------- archetype body templates ----------
// Each template is 12 rows × 6 cols (left half), mirrored to get 12×12
// Values: 0=empty, 1=primary(clothing), 4=skin

// humanoid templates — head + neck + torso + legs
const HUMANOID: number[][][] = [
  [ // template 0 — classic agent
    [0,0,4,4,4,0],  // row 0: head top
    [0,4,4,4,4,0],  // row 1: head
    [0,4,4,4,4,0],  // row 2: head bottom
    [0,0,4,4,0,0],  // row 3: neck
    [0,1,1,1,1,0],  // row 4: shoulders
    [0,1,1,1,1,0],  // row 5: torso
    [0,1,1,1,1,0],  // row 6: torso
    [0,0,1,1,0,0],  // row 7: waist
    [0,0,1,0,1,0],  // row 8: legs
    [0,0,1,0,1,0],  // row 9: legs
    [0,0,1,0,1,0],  // row 10: legs
    [0,0,1,0,1,0],  // row 11: feet
  ],
  [ // template 1 — stocky
    [0,0,4,4,0,0],
    [0,4,4,4,4,0],
    [0,4,4,4,4,0],
    [0,0,4,4,0,0],
    [1,1,1,1,1,0],
    [1,1,1,1,1,0],
    [0,1,1,1,1,0],
    [0,1,1,1,0,0],
    [0,0,1,1,0,0],
    [0,1,0,0,1,0],
    [0,1,0,0,1,0],
    [0,1,0,0,1,0],
  ],
  [ // template 2 — slim tall
    [0,0,4,4,0,0],
    [0,0,4,4,4,0],
    [0,0,4,4,4,0],
    [0,0,0,4,0,0],
    [0,0,1,1,1,0],
    [0,0,1,1,0,0],
    [0,0,1,1,0,0],
    [0,0,1,1,0,0],
    [0,0,1,1,0,0],
    [0,0,1,0,1,0],
    [0,0,1,0,1,0],
    [0,0,1,0,0,1],
  ],
]

// robot templates — angular, mechanical
const ROBOT: number[][][] = [
  [ // template 0 — boxy bot
    [0,0,0,3,0,0],  // antenna
    [0,1,1,1,1,0],
    [0,1,1,1,1,1],
    [0,1,1,1,1,1],
    [0,0,1,1,0,0],
    [1,1,1,1,1,0],
    [1,1,1,1,1,0],
    [1,1,1,1,1,0],
    [0,0,1,1,0,0],
    [0,1,1,0,1,0],
    [0,1,0,0,1,0],
    [0,1,1,0,1,1],
  ],
  [ // template 1 — round bot
    [0,0,3,3,0,0],
    [0,1,1,1,1,0],
    [1,1,1,1,1,0],
    [1,1,1,1,1,0],
    [0,1,1,1,1,0],
    [0,0,1,1,0,0],
    [0,1,1,1,1,0],
    [0,1,1,1,1,0],
    [0,1,1,1,1,0],
    [0,0,1,1,0,0],
    [0,1,0,0,1,0],
    [0,1,1,0,1,1],
  ],
  [ // template 2 — tall mech
    [0,3,0,0,3,0],
    [0,1,1,1,1,0],
    [0,1,1,1,1,0],
    [0,1,1,1,1,0],
    [0,0,1,1,0,0],
    [0,0,1,1,0,0],
    [0,1,1,1,1,0],
    [0,1,1,1,1,0],
    [0,0,1,1,0,0],
    [0,0,1,0,1,0],
    [0,0,1,0,1,0],
    [0,1,1,0,1,1],
  ],
]

// creature templates — organic, alien
const CREATURE: number[][][] = [
  [ // template 0 — tentacle creature
    [0,0,4,4,4,0],
    [0,4,4,4,4,4],
    [0,4,4,4,4,4],
    [0,4,4,4,4,0],
    [0,0,4,4,4,0],
    [0,4,4,4,4,0],
    [4,4,4,4,4,0],
    [4,0,4,4,0,0],
    [4,0,4,0,4,0],
    [0,0,4,0,0,4],
    [0,4,0,0,0,4],
    [0,4,0,0,4,0],
  ],
  [ // template 1 — round alien
    [0,4,0,0,0,0],
    [0,4,4,4,0,0],
    [4,4,4,4,4,0],
    [4,4,4,4,4,4],
    [4,4,4,4,4,4],
    [0,4,4,4,4,4],
    [0,4,4,4,4,0],
    [0,0,4,4,0,0],
    [0,4,0,0,4,0],
    [0,4,0,0,4,0],
    [4,0,0,0,0,4],
    [4,0,0,0,0,4],
  ],
  [ // template 2 — tall alien
    [0,4,0,0,4,0],
    [0,4,4,4,4,0],
    [4,4,4,4,4,0],
    [4,4,4,4,4,0],
    [0,4,4,4,0,0],
    [0,4,4,4,0,0],
    [0,4,4,4,4,0],
    [0,0,4,4,0,0],
    [0,0,4,4,0,0],
    [0,4,0,0,4,0],
    [0,4,0,0,4,0],
    [4,0,0,0,0,4],
  ],
]

// blob templates — amorphous, large fill area
const BLOB: number[][][] = [
  [ // template 0 — big blob
    [0,0,0,0,0,0],
    [0,0,1,1,0,0],
    [0,1,1,1,1,0],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [0,1,1,1,1,0],
    [0,1,1,1,1,0],
    [0,0,1,1,0,0],
    [0,0,0,0,0,0],
  ],
  [ // template 1 — spikey blob
    [0,0,0,1,0,0],
    [0,0,1,1,0,0],
    [0,1,1,1,1,0],
    [1,1,1,1,1,0],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [0,1,1,1,1,0],
    [0,1,1,1,0,0],
    [1,1,1,1,1,0],
    [0,1,0,0,1,0],
    [0,0,0,0,0,0],
  ],
  [ // template 2 — ghost blob
    [0,0,1,1,0,0],
    [0,1,1,1,1,0],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [1,1,1,1,1,1],
    [1,0,1,1,0,1],
    [1,0,1,0,0,1],
    [0,0,1,0,0,0],
  ],
]

const ALL_TEMPLATES = {
  humanoid: HUMANOID,
  robot: ROBOT,
  creature: CREATURE,
  blob: BLOB,
} as const

// skin tone presets (natural + fantasy)
const SKIN_PALETTES = [
  '#f4c794', '#e0ac69', '#c68642', '#8d5524',  // natural tones
  '#6b8e8e', '#a0a0d0', '#7b68ee', '#ff6b6b',  // fantasy tones
]

// ---------- generation ----------

function generatePixelAvatar(seed: string): PixelAvatar {
  const h = hash32(seed)
  const rand = lcg(h)

  // 1. Pick archetype
  const r0 = rand()
  const archetype: PixelAvatar['archetype'] =
    r0 < 0.35 ? 'humanoid' :
    r0 < 0.60 ? 'robot' :
    r0 < 0.80 ? 'creature' : 'blob'

  // 2. Pick base template
  const templates = ALL_TEMPLATES[archetype]
  const tplIdx = Math.floor(rand() * templates.length)
  const tpl = templates[tplIdx]

  // 3. Build 12×12 with bilateral symmetry (mirror left→right)
  const pixels: number[][] = []
  for (let row = 0; row < 12; row++) {
    const line: number[] = new Array(12).fill(0)
    for (let col = 0; col < 6; col++) {
      line[col] = tpl[row][col]
      line[11 - col] = tpl[row][col]
    }
    pixels.push(line)
  }

  // 4. Color palette
  const hue = h % 360
  const satShift = Math.floor(rand() * 30) - 15
  const colors = {
    primary:   `hsl(${hue}, ${65 + satShift}%, 50%)`,
    secondary: `hsl(${(hue + 30) % 360}, ${50 + satShift}%, 42%)`,
    accent:    `hsl(${(hue + 180) % 360}, 80%, 60%)`,
    skin:      SKIN_PALETTES[Math.floor(rand() * SKIN_PALETTES.length)],
    bg:        `hsl(${hue}, 20%, ${8 + Math.floor(rand() * 8)}%)`,
  }

  // 5. Layer: Eyes (100%) — accent color on head area
  const headRows = archetype === 'blob' ? [3, 4] : [1, 2]
  const eyeRow = headRows[Math.floor(rand() * headRows.length)]
  // Find skin/body pixels in that row for eye placement
  const eyeCols: number[] = []
  for (let c = 1; c < 5; c++) {
    if (pixels[eyeRow][c] !== 0) eyeCols.push(c)
  }
  if (eyeCols.length >= 2) {
    const eL = eyeCols[Math.floor(eyeCols.length * 0.25)]
    const eR = 11 - eL
    pixels[eyeRow][eL] = 3
    pixels[eyeRow][eR] = 3
  }

  // 6. Layer: Mouth (80%) — secondary color
  if (rand() < 0.80) {
    const mouthRow = eyeRow + 1
    if (mouthRow < 12) {
      // Single center pixel or wider
      const mouthWidth = rand() < 0.5 ? 1 : 2
      if (mouthWidth === 1) {
        pixels[mouthRow][5] = 2
        pixels[mouthRow][6] = 2
      } else {
        for (let c = 4; c <= 5; c++) {
          pixels[mouthRow][c] = 2
          pixels[mouthRow][11 - c] = 2
        }
      }
    }
  }

  // 7. Layer: Accessory (50%) — accent on top rows
  if (rand() < 0.50) {
    const accType = Math.floor(rand() * 3)
    if (accType === 0) {
      // Hat — fill top row
      for (let c = 2; c <= 9; c++) pixels[0][c] = 3
      for (let c = 3; c <= 8; c++) {
        if (pixels[1][c] === 0) pixels[1][c] = 3
      }
    } else if (accType === 1) {
      // Antenna / horns
      pixels[0][3] = 3; pixels[0][8] = 3
      if (rand() < 0.5) { pixels[0][4] = 3; pixels[0][7] = 3 }
    } else {
      // Crown dots
      pixels[0][2] = 3; pixels[0][5] = 3; pixels[0][6] = 3; pixels[0][9] = 3
    }
  }

  // 8. Layer: Body texture (40%) — secondary scattered pixels on torso
  if (rand() < 0.40) {
    for (let row = 4; row <= 7; row++) {
      for (let col = 1; col < 6; col++) {
        if (pixels[row][col] === 1 && rand() < 0.25) {
          pixels[row][col] = 2
          pixels[row][11 - col] = 2
        }
      }
    }
  }

  return { pixels, colors, archetype }
}

// ---------- cache & exports ----------

const cache = new Map<string, PixelAvatar>()

export function getPixelAvatar(seed: string): PixelAvatar {
  let avatar = cache.get(seed)
  if (!avatar) {
    avatar = generatePixelAvatar(seed)
    cache.set(seed, avatar)
  }
  return avatar
}

const COLOR_MAP_INDICES = [null, 'primary', 'secondary', 'accent', 'skin'] as const

export function drawPixelAvatar(
  ctx: CanvasRenderingContext2D,
  avatar: PixelAvatar,
  screenX: number,
  screenY: number,
  cellSize: number
) {
  const px = cellSize / 12
  const ceilPx = Math.ceil(px)
  const colors = avatar.colors as Record<string, string>

  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 12; col++) {
      const val = avatar.pixels[row][col]
      if (val > 0) {
        const key = COLOR_MAP_INDICES[val]
        if (key) {
          ctx.fillStyle = colors[key]
          ctx.fillRect(
            screenX + col * px,
            screenY + row * px,
            ceilPx,
            ceilPx
          )
        }
      }
    }
  }
}

// Draw downsampled 6×6 version for mid-zoom
export function drawPixelAvatarSmall(
  ctx: CanvasRenderingContext2D,
  avatar: PixelAvatar,
  screenX: number,
  screenY: number,
  cellSize: number
) {
  const px = cellSize / 6
  const ceilPx = Math.ceil(px)
  const colors = avatar.colors as Record<string, string>

  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const val = avatar.pixels[r * 2][c * 2]
      if (val > 0) {
        const key = COLOR_MAP_INDICES[val]
        if (key) {
          ctx.fillStyle = colors[key]
          ctx.fillRect(
            screenX + c * px,
            screenY + r * px,
            ceilPx,
            ceilPx
          )
        }
      }
    }
  }
}
