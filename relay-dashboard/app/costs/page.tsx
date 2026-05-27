'use client';
import { useEffect, useState } from 'react';
import { fetchJSON } from '@/lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface ProviderCost {
  provider: string;
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  request_count: number;
  date: string;
}

const COLORS = ['#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'];

export default function CostsPage() {
  const [data, setData] = useState<ProviderCost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJSON<ProviderCost[]>('/api/provider-costs')
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const byProvider = data.reduce<Record<string, number>>((acc, r) => {
    acc[r.provider] = (acc[r.provider] || 0) + Number(r.total_cost_usd);
    return acc;
  }, {});

  const chartData = Object.entries(byProvider)
    .map(([name, cost]) => ({ name, cost: Math.round(cost * 10000) / 10000 }))
    .sort((a, b) => b.cost - a.cost);

  const total = chartData.reduce((s, r) => s + r.cost, 0);

  return (
    <div style={{ paddingTop: 20 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ padding: '14px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>Costo total (histórico)</div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>
            ${total.toFixed(4)}
          </div>
        </div>
        {chartData.slice(0, 4).map((r, i) => (
          <div key={r.name} style={{ padding: '14px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>{r.name}</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 18, fontWeight: 700, color: COLORS[i] }}>${r.cost.toFixed(4)}</div>
          </div>
        ))}
      </div>

      {!loading && chartData.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 16px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Costo por proveedor API</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => `$${v}`} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`$${v.toFixed(6)}`, 'Costo']}
              />
              <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {loading && <div style={{ color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>Cargando costos...</div>}
      {!loading && chartData.length === 0 && <div style={{ color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>Sin datos de costos</div>}
    </div>
  );
}
