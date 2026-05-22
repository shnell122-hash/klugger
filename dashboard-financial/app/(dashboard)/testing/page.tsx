import { Suspense } from 'react';
import { api } from '@/lib/api';
import KPICard from '@/components/ui/KPICard';
import VolumeChart from '@/components/charts/VolumeChart';
import OpsTypeChart from '@/components/charts/OpsTypeChart';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 30;

const EMPTY_KPIS = {
  saldo_total_clientes: 0, volumen_hoy: 0, comisiones_hoy: 0,
  ops_pendientes: 0, total_clientes: 0, ops_hoy: 0,
  costo_llm_hoy: 0, costo_llm_30d: 0,
};

export default async function TestingPage() {
  const [kpisRes, volumeRes, opsByTypeRes] = await Promise.allSettled([
    api.getKPIs('testing'),
    api.getVolumeTS(30),
    api.getOpsByType(30),
  ]);

  const kpis      = kpisRes.status      === 'fulfilled' ? kpisRes.value      : EMPTY_KPIS;
  const volumeTS  = volumeRes.status    === 'fulfilled' ? volumeRes.value    : [];
  const opsByType = opsByTypeRes.status === 'fulfilled' ? opsByTypeRes.value : [];

  return (
    <main className="min-h-screen p-6 space-y-6 max-w-[1600px] mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">Testing</h1>
            <span className="px-2 py-0.5 rounded text-xs font-mono bg-yellow-900/40 text-yellow-400 border border-yellow-700/50">
              simulación
            </span>
          </div>
          <p className="text-sm text-gray-500">Operaciones de prueba — grupo Testing (conversation_engine)</p>
        </div>
        <Link href="/" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
          ← Ver operaciones reales
        </Link>
      </div>

      {/* Banner informativo */}
      <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-300">
        Estas operaciones provienen del grupo de simulación (<code className="font-mono text-yellow-200">-5142407305</code>).
        No representan transacciones reales de clientes. Las operaciones de Operaciones G y Operaciones LT están en el{' '}
        <Link href="/" className="underline hover:text-yellow-100">dashboard principal</Link>.
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="Volumen Hoy"      value={kpis.volumen_hoy ?? 0}        icon="📊" color="info"   isMonetary decimals={0} />
        <KPICard title="Comisiones Hoy"   value={kpis.comisiones_hoy ?? 0}     icon="💸" color="success" isMonetary decimals={0} />
        <KPICard title="Ops Pendientes"   value={kpis.ops_pendientes}           icon="⏳" color="warning" decimals={0} />
        <KPICard title="Ops Hoy"          value={kpis.ops_hoy ?? 0}            icon="⚡" color="accent"  decimals={0} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass rounded-xl p-5 border border-border">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Volumen simulación (últimos 30 días)</h2>
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

      {/* Score de aprendizaje */}
      <div className="glass rounded-xl p-5 border border-border">
        <h2 className="text-sm font-semibold text-gray-300 mb-1">Episodios de aprendizaje</h2>
        <p className="text-xs text-gray-600 mb-4">Resultados de la suite de pruebas automatizadas (conversation_engine)</p>
        <Link
          href="/scores"
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20 transition-colors"
        >
          Ver scores de episodios →
        </Link>
      </div>

    </main>
  );
}
