import Script from 'next/script'

export const metadata = {
  title: 'AgentVerse Grid',
  description: '100×100 AI Agent World Map — own a cell, deploy your agent.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/icon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <meta name="theme-color" content="#050505" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="AgentVerse" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0, viewport-fit=cover" />
        <meta name="format-detection" content="telephone=no" />
        <style>{`
            ::-webkit-scrollbar { width: 4px; height: 4px; }
            ::-webkit-scrollbar-track { background: #050505; }
            ::-webkit-scrollbar-thumb { background: #222; border-radius: 2px; }
            ::-webkit-scrollbar-thumb:hover { background: #00ff41; }
            .custom-scrollbar::-webkit-scrollbar { width: 4px; }
            body { overscroll-behavior: none; -webkit-tap-highlight-color: transparent; }
            .pb-safe { padding-bottom: env(safe-area-inset-bottom, 0px); }
            .mb-safe { margin-bottom: env(safe-area-inset-bottom, 0px); }
            /* PWA standalone: hide browser chrome artifacts */
            @media (display-mode: standalone) {
                body { padding-top: env(safe-area-inset-top, 0px); }
            }
        `}</style>
      </head>
      <body style={{ margin: 0, backgroundColor: '#050505', color: '#e0e0e0' }}>
        <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
        {children}
        <Script id="register-sw" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              window.addEventListener('load', function() {
                navigator.serviceWorker.register('/sw.js').then(function(registration) {
                  console.log('ServiceWorker registration successful');
                }, function(err) {
                  console.log('ServiceWorker registration failed: ', err);
                });
              });
            }
          `}
        </Script>
      </body>
    </html>
  )
}
