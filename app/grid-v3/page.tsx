import { Suspense } from 'react';
import AgentGridApp from './components/AgentGrid';

export default function GridV3Page() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#050505] flex items-center justify-center text-green-500 font-mono">加载中...</div>}>
      <AgentGridApp />
    </Suspense>
  );
}
