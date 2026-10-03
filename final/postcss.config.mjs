// Tailwind runs at build time through PostCSS (no runtime CDN script).
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}

export default config
