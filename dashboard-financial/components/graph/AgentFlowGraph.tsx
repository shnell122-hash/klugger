'use client';
/**
 * Grafo de nodos del sistema multiagéntico.
 * Muestra: Telegram → Parser → Calculator → BalanceManager → PollHandler → Verifier → DB
 * Con animaciones de flujo y estado en vivo.
 */
import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ── Nodo personalizado ────────────────────────────────────────────────────────

interface AgentNodeData {
  label: string;
  icon: string;
  color: string;
  role: string;
  cost?: string;
  status?: 'idle' | 'active' | 'error';
}

function AgentNode({ data }: NodeProps<AgentNodeData & Record<string, unknown>>) {
  const statusColor = data.status === 'active' ? '#10b981'
                    : data.status === 'error'  ? '#ef4444'
                    : '#3a3a5c';
  return (
    <div
      className="glass rounded-xl px-4 py-3 min-w-[140px] text-center relative"
      style={{ border: `1px solid ${data.color}40`, boxShadow: `0 0 16px ${data.color}20` }}
    >
      <Handle type="target" position={Position.Left}  style={{ background: data.color, border: 'none', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: data.color, border: 'none', width: 8, height: 8 }} />

      {/* Status dot */}
      <div className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ background: statusColor }} />

      <div className="text-2xl mb-1">{data.icon}</div>
      <div className="text-xs font-semibold text-white">{data.label}</div>
      <div className="text-[10px] text-gray-500 mt-0.5">{data.role}</div>
      {data.cost && (
        <div className="text-[10px] text-success mt-1 font-mono">{data.cost}</div>
      )}
    </div>
  );
}

// ── Nodo de DB ────────────────────────────────────────────────────────────────

function DBNode({ data }: NodeProps<AgentNodeData & Record<string, unknown>>) {
  return (
    <div className="glass rounded-xl px-4 py-3 min-w-[120px] text-center"
      style={{ border: '1px solid #f59e0b40', boxShadow: '0 0 16px #f59e0b10' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#f59e0b', border: 'none', width: 8, height: 8 }} />
      <div className="text-2xl mb-1">🗄️</div>
      <div className="text-xs font-semibold text-white">MySQL</div>
      <div className="text-[10px] text-gray-500">ai_monitoring</div>
    </div>
  );
}

// ── Graph data ────────────────────────────────────────────────────────────────

const initialNodes = [
  {
    id: 'telegram',
    type: 'agentNode',
    position: { x: 0, y: 120 },
    data: { label: 'Telegram', icon: '📱', color: '#3b82f6', role: 'Cliente', status: 'active' },
  },
  {
    id: 'parser',
    type: 'agentNode',
    position: { x: 200, y: 20 },
    data: { label: 'Parser', icon: '🔍', color: '#7c3aed', role: 'Detección', cost: '$0', status: 'idle' },
  },
  {
    id: 'calculator',
    type: 'agentNode',
    position: { x: 200, y: 140 },
    data: { label: 'Calculator', icon: '🧮', color: '#10b981', role: 'Sin LLM', cost: '$0', status: 'idle' },
  },
  {
    id: 'balance',
    type: 'agentNode',
    position: { x: 400, y: 20 },
    data: { label: 'Balance Mgr', icon: '💰', color: '#10b981', role: 'Saldo', cost: '$0', status: 'idle' },
  },
  {
    id: 'poll',
    type: 'agentNode',
    position: { x: 400, y: 140 },
    data: { label: 'Poll Handler', icon: '🗳️', color: '#3b82f6', role: 'Confirmación', cost: '$0', status: 'idle' },
  },
  {
    id: 'verifier',
    type: 'agentNode',
    position: { x: 600, y: 80 },
    data: { label: 'Verifier', icon: '✅', color: '#f59e0b', role: 'Validación', cost: '~$0.001', status: 'idle' },
  },
  {
    id: 'response',
    type: 'agentNode',
    position: { x: 600, y: 200 },
    data: { label: 'Response Gen', icon: '💬', color: '#a78bfa', role: 'DeepSeek', cost: '~$0.001', status: 'idle' },
  },
  {
    id: 'db',
    type: 'dbNode',
    position: { x: 820, y: 120 },
    data: {},
  },
];

const initialEdges = [
  { id: 'e1', source: 'telegram',   target: 'parser',     animated: false, style: { stroke: '#3b82f680' } },
  { id: 'e2', source: 'parser',     target: 'calculator', animated: false, style: { stroke: '#7c3aed80' } },
  { id: 'e3', source: 'calculator', target: 'balance',    animated: false, style: { stroke: '#10b98180' } },
  { id: 'e4', source: 'balance',    target: 'poll',       animated: false, style: { stroke: '#10b98180' } },
  { id: 'e5', source: 'poll',       target: 'verifier',   animated: false, style: { stroke: '#3b82f680' } },
  { id: 'e6', source: 'verifier',   target: 'response',   animated: false, style: { stroke: '#f59e0b80' } },
  { id: 'e7', source: 'response',   target: 'db',         animated: false, style: { stroke: '#a78bfa80' } },
  { id: 'e8', source: 'poll',       target: 'telegram',   animated: false, style: { stroke: '#3b82f640', strokeDasharray: '5 5' } },
];

const nodeTypes = { agentNode: AgentNode, dbNode: DBNode };

export default function AgentFlowGraph() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  return (
    <div style={{ height: 320 }} className="rounded-xl overflow-hidden border border-border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e1e2e" />
        <Controls showInteractive={false} style={{ background: '#111118', border: '1px solid #1e1e2e' }} />
        <MiniMap
          style={{ background: '#0a0a0f', border: '1px solid #1e1e2e' }}
          nodeColor={(n: any) => n.data?.color ?? '#3a3a5c'}
        />
      </ReactFlow>
    </div>
  );
}
