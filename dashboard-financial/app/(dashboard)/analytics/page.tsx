import { api } from '@/lib/api';
import VolumeChart from '@/components/charts/VolumeChart';
import OpsTypeChart from '@/components/charts/OpsTypeChart';
import AgentFlowGraphClient from '@/components/graph/AgentFlowGraphClient';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const [volumeTS, opsByType, llmData] = await Promise.all([
    api.getVolumeTS(90),
    api.getOpsByType(90),
    api.getLLMCosts(90),
  ]);

  const totalCosto = llmData.byAgent.reduce((s, a) => s + Number(a.total_cost_usd), 0);
  const totalCalls = llmData.byAgent.reduce((s, a) => s + Number(a.total_calls), 0);

  return (
    <main className="p-6 max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-gray-500">Últimos 90 días</p>
      </div>

      {/* Volume series */}
      <div className="glass rounded-xl p-5 border border-border">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Volumen de operaciones (90 días)</h2>
        <VolumeChart data={volumeTS} height={320} />
      </div>

      {/* Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="glass rounded-xl p-5 border border-border">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Distribución por tipo</h2>
          <OpsTypeChart data={opsByType} />
        </div>

        {/* LLM Cost breakdown */}
        <div className="glass rounded-xl p-5 border border-border">
          <h2 className="text-sm font-semibold text-gray-300 mb-1">Costos del sistema multiagente</h2>
          <div className="flex gap-4 text-xs text-gray-500 mb-4">
            <span>Total 90d: <b className="text-success">${totalCosto.toFixed(4)}</b></span>
            <span>Total calls: <b className="text-accent-light">{totalCalls}</b></span>
          </div>
          <div className="space-y-2">
            {llmData.byAgent.map(a => {
              const pct = totalCosto > 0 ? (Number(a.total_cost_usd) / totalCosto) * 100 : 0;
              return (
                <div key={`${a.agent_name}-${a.model}`} className="text-xs">
                  <div className="flex justify-between mb-0.5">
                    <span className="text-gray-400">{a.agent_name}</span>
                    <span className="font-mono text-success">${Number(a.total_cost_usd).toFixed(5)}</span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-accent/70 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Agent flow */}
      <div className="glass rounded-xl p-5 border border-border">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Arquitectura del sistema</h2>
        <AgentFlowGraphClient />
      </div>
    </main>
  );
}
