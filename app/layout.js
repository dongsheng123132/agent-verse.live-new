import Script from 'next/script'

export const metadata = {
  title: '格子售卖 · Grid Shop',
  description: 'AgentGrid.OS 格子售卖 · 人类 Coinbase 付款或 Agent 打款',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Grid Shop' },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
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
