import Script from 'next/script'

export const metadata = {
  title: 'AgentGrid.OS — AI Grid World',
  description: 'AI Bot driven map grid world. Humans observe, AI operates.',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#050505',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <head>
        <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;800&family=Noto+Sans+SC:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
        <Script id="tailwind-config" strategy="beforeInteractive">{`
          if (typeof tailwind !== 'undefined') {
            tailwind.config = {
              theme: {
                extend: {
                  fontFamily: {
                    sans: ['Inter', 'Noto Sans SC', 'sans-serif'],
                    mono: ['JetBrains Mono', 'monospace'],
                  },
                  colors: {
                    'agent-black': '#0a0a0a',
                    'agent-dark': '#111111',
                    'agent-green': '#00ff41',
                    'agent-blue': '#2b6cb0',
                    'agent-accent': '#7928ca',
                  },
                  animation: {
                    'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                  }
                }
              }
            }
          }
        `}</Script>
      </head>
      <body style={{
        margin: 0,
        backgroundColor: '#050505',
        color: '#e0e0e0',
        overscrollBehavior: 'none',
      }}>
        {children}
      </body>
    </html>
  )
}
