'use client'

import dynamic from 'next/dynamic'

const AgentGridApp = dynamic(
  () => import('./components/agentgrid/App').then(mod => mod.default),
  { ssr: false }
)

export default function Page() {
  return <AgentGridApp />
}
