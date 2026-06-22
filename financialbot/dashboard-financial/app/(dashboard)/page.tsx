import { Suspense } from 'react';
import { api } from '@/lib/api';
import KPICard from '@/components/ui/KPICard';
import VolumeChart from '@/components/charts/VolumeChart';
import OpsTypeChart from '@/components/charts/OpsTypeChart';
import AgentFlowGraph from '@/components/graph/AgentFlowGraph';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

const EMPTY_KPIS = {
  saldo_total_clientes: 0, volumen_hoy: 0, comisiones_hoy: 0,
  ops_pendientes: 0, total_clientes: 0, ops_hoy: 0,
  costo_llm_hoy: 0, costo_llm_30d: 0,
};

export default async function DashboardPage() {
  const [kpisRes, volumeRes, opsByTypeRes] = await Promise.allSettled([
    api.getKPIs('real'),
    api.getVolumeTS(30),
    api.getOpsByType(30),
  ]);

  const kpis      = kpisRes.status      === 'fulfilled' ? kpisRes.value      : EMPTY_KPIS;
  const volumeTS  = volumeRes.status    === 'fulfilled' ? volumeRes.value    : [];
  const opsByType = opsByTypeRes.status === 'fulfilled' ? opsByTypeRes.value : [];

  const apiError = [kpisRes, volumeRes, opsByTypeRes].find(r => r.status === 'rejected')
    ? (kpisRes.status === 'rejected' ? (kpisRes.reason as Error).message : 'Error de API')
    : null;

  return (
    <main className="min-h-screen p-6 space-y-6 max-w-[1600px] mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sistema Financiero</h1>
          <p className="text-sm text-gray-500 mt-0.5">Operaciones reales — Operaciones G · Operaciones LT</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse-slow" />
          <span className="text-xs text-gray-500">En línea</span>
        </div>
      </div>

      {/* API error banner */}
      {apiError && (
        <div className="rounded-lg border border-red-700 bg-red-900/30 px-4 py-3 text-sm text-red-300">
          Backend no disponible: {apiError}. Los datos mostrados pueden estar desactualizados.
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Saldo Clientes"   value={kpis.saldo_total_clientes}   icon="💰" color="accent"  isMonetary decimals={0} />
        <KPICard title="Volumen Hoy"      value={kpis.volumen_hoy ?? 0}        icon="📊" color="info"   isMonetary decimals={0} />
        <KPICard title="Comisiones Hoy"   value={kpis.comisiones_hoy ?? 0}     icon="💸" color="success" isMonetary decimals={0} />
        <KPICard title="Ops Pendientes"   value={kpis.ops_pendientes}           icon="⏳" color="warning" decimals={0} />
        <KPICard title="Total Clientes"   value={kpis.total_clientes}           icon="👥" color="info"   decimals={0} />
        <KPICard title="Ops Hoy"          value={kpis.ops_hoy ?? 0}            icon="⚡" color="accent"  decimals={0} />
        <KPICard title="Costo LLM Hoy"   value={kpis.costo_llm_hoy ?? 0}      icon="🤖" color="warning" isMonetary decimals={4} />
        <KPICard title="Costo LLM 30d"   value={kpis.costo_llm_30d ?? 0}      icon="🧠" color="danger"  isMonetary decimals={2} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass rounded-xl p-5 border border-border">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Volumen (últimos 30 días)</h2>
          <Suspense fallback={<div className="h-[280px] flex items-center justify-center text-gray-600">Cargando...</div>}>
            <VolumeChart data={volumeTS} />
          </Suspense>
        </div>
        <div className="glass rounded-xl p-5 border border-border">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Por tipo de operación</h2>
          <Suspense fallback={<div className="h-[260px] flex items-center justify-center text-gray-600">Cargando...</div>}>
            <OpsTypeChart data={opsByType} />
          </Suspense>
        </div>
      </div>

      {/* Agent Flow */}
      <div className="glass rounded-xl p-5 border border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-300">Flujo de Agentes</h2>
          <span className="text-xs text-gray-600">Node.js · grammy · MySQL · DeepSeek</span>
        </div>
        <Suspense fallback={<div className="h-[320px] flex items-center justify-center text-gray-600">Cargando grafo...</div>}>
          <AgentFlowGraph />
        </Suspense>
      </div>

      {/* Operations summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {opsByType.map(t => (
          <div key={t.tipo_operacion} className="glass rounded-xl p-4 border border-border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-white">{t.tipo_operacion}</span>
              <span className="text-xs font-mono text-success">
                {(Number(t.comision_pct_avg) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-white">
              ${Number(t.volumen).toLocaleString('es-MX', {minimumFractionDigits:0, maximumFractionDigits:0})}
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{t.total} ops</span>
              <span className="text-success">
                +${Number(t.comisiones).toLocaleString('es-MX', {minimumFractionDigits:0, maximumFractionDigits:0})} comisión
              </span>
            </div>
          </div>
        ))}
      </div>

    </main>
  );
}
