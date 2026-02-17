import Script from 'next/script'

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <head />
      <body style={{ margin: 0, backgroundColor: '#050505', color: '#e0e0e0' }}>
        <Script src="https://cdn.tailwindcss.com" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  )
}
