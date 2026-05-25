'use client';
import { useEffect, useState } from 'react';
import { api, type DashboardData } from '@/lib/api';

const TYPE_COLOR: Record<string, string> = {
  html:      'bg-accent-green text-accent-green',
  contract:  'bg-accent text-accent',
  brief:     'bg-accent-purple text-accent-purple',
  analysis:  'bg-accent-amber text-accent-amber',
  summary:   'bg-text-muted text-text-muted',
  checklist: 'bg-accent-amber text-accent-amber',
};

function fmx(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
}

export default function DashboardPage() {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  async function load() {
    setLoading(true);
    try { setData(await api.dashboard()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  if (loading) return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  );
  if (error) return <p className="p-6 text-sm text-accent-red">{error}</p>;
  if (!data) return null;

  const margin = data.total_cost_mxn > 0
    ? ((data.total_price_mxn - data.total_cost_mxn) / data.total_cost_mxn * 100).toFixed(1) + '%'
    : '—';

  const kpis = [
    { label: 'Costo total',      value: fmx(data.total_cost_mxn),  color: 'text-accent-red' },
    { label: 'Precio facturado', value: fmx(data.total_price_mxn), color: 'text-accent-green' },
    { label: 'Usuarios activos', value: String(data.by_user.length), color: 'text-accent' },
    { label: 'Margen',           value: margin,                     color: 'text-accent-purple' },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-5 space-y-6">
        <h1 className="text-base font-semibold text-text-primary">Dashboard</h1>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-border bg-surface p-4">
              <p className="text-xs text-text-muted">{label}</p>
              <p className={`mt-2 text-xl font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* By type */}
        {Object.keys(data.by_artifact_type).length > 0 && (
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-faint">
              Por tipo de artefacto
            </h2>
            <div className="space-y-2">
              {Object.entries(data.by_artifact_type).map(([type, val]) => {
                const colors = (TYPE_COLOR[type] ?? 'bg-text-muted text-text-muted').split(' ');
                return (
                  <div key={type}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-2.5">
                    <span className={`h-2 w-2 rounded-full ${colors[0]}`} />
                    <span className="w-24 text-xs text-text-primary capitalize">{type}</span>
                    <span className="text-xs text-text-muted">{val.count} artefactos</span>
                    <span className="flex-1" />
                    <span className={`text-xs font-semibold ${colors[1]}`}>{fmx(val.cost_mxn)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* By user */}
        {data.by_user.length > 0 && (
          <div>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-faint">
              Por usuario
            </h2>
            <div className="space-y-2">
              {data.by_user.map((u, i) => {
                const name = u.name || u.email;
                return (
                  <div key={i}
                    className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 text-xs font-semibold text-accent flex-shrink-0">
                      {name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-text-primary">{name}</div>
                      <div className="text-xs text-text-faint">
                        {(u.by_case as unknown[]).length} expediente(s)
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-accent-green">{fmx(u.price_mxn)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
