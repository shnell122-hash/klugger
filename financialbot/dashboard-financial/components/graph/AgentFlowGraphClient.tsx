'use client';

import dynamic from 'next/dynamic';

const AgentFlowGraph = dynamic(() => import('./AgentFlowGraph'), { ssr: false });

export default function AgentFlowGraphClient() {
  return <AgentFlowGraph />;
}
