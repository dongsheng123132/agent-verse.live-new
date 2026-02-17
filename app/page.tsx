import { Suspense } from 'react';
import AgentGridApp from './grid-v3/components/AgentGrid';

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050505] flex items-center justify-center text-green-500 font-mono">加载中...</div>}>
      <AgentGridApp />
    </Suspense>
  );
}
