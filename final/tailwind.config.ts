import type { Config } from 'tailwindcss'

// Build-time Tailwind v3. `content` must list every folder that holds class names: a class that
// only appears in a file outside these globs is purged from the CSS. Class names are written out
// in full in the source (no `bg-${color}-500` string building), so no safelist is needed.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
}

export default config
