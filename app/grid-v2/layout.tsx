export const metadata = {
  title: 'AgentGrid.OS - AI Grid World',
  description: 'AI Agent-driven grid world marketplace',
};

export default function GridV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;800&family=Noto+Sans+SC:wght@400;500;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{__html: `
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
                }
              }
            }
          }
        `}} />
      </head>
      <body className="bg-[#050505] text-white overflow-hidden">{children}</body>
    </html>
  );
}
