'use client';
import { useEffect, useState } from 'react';
import { fetchJSON } from '@/lib/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface CostRow   { provider: string; input_tokens: number; output_tokens: number; cost_usd: number }
interface DailyRow  { day: string; provider: string; cost_usd: number }
interface ProjRow   { project_id: string; provider: string; cost_usd: number }
interface CostResponse {
  today:      Array<CostRow & { model: string }>;
  week:       CostRow[];
  month:      CostRow[];
  daily:      DailyRow[];
  by_project: ProjRow[];
}

const COLORS = ['#7c3aed', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'];

function sum(arr: { cost_usd: number }[]) {
  return arr.reduce((s, r) => s + Number(r.cost_usd), 0);
}

export default function CostsPage() {
  const [data, setData]       = useState<CostResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod]   = useState<'today' | 'week' | 'month'>('month');

  useEffect(() => {
    fetchJSON<CostResponse>('/api/provider-costs')
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const rows      = data ? data[period] : [];
  const chartData = rows
    .map(r => ({ name: r.provider, cost: Math.round(Number(r.cost_usd) * 1e6) / 1e6 }))
    .sort((a, b) => b.cost - a.cost);

  const dailyMap: Record<string, number> = {};
  (data?.daily || []).forEach(r => { dailyMap[r.day] = (dailyMap[r.day] || 0) + Number(r.cost_usd); });
  const dailyChart = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, cost]) => ({ day: day.slice(5), cost: Math.round(cost * 1e4) / 1e4 }));

  const TABS: Array<{ key: typeof period; label: string }> = [
    { key: 'today', label: 'Hoy' },
    { key: 'week',  label: '7 días' },
    { key: 'month', label: 'Mes' },
  ];

  return (
    <div style={{ paddingTop: 20 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'Hoy',    value: data ? sum(data.today) : 0, big: true },
          { label: '7 días', value: data ? sum(data.week)  : 0, big: false },
          { label: 'Mes',    value: data ? sum(data.month) : 0, big: false },
        ].map(c => (
          <div key={c.label} style={{ padding: '14px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: c.big ? 22 : 18, fontWeight: 700, color: 'var(--accent)' }}>
              ${(loading ? 0 : c.value).toFixed(4)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Por proveedor</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {TABS.map(t => (
              <button key={t.key} onClick={() => setPeriod(t.key)}
                style={{
                  padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
                  background: period === t.key ? 'var(--accent)' : 'transparent',
                  color:      period === t.key ? '#fff'           : 'var(--text-muted)',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {loading && <div style={{ color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>Cargando...</div>}
        {!loading && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={200}>
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
        )}
        {!loading && chartData.length === 0 && <div style={{ color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>Sin datos</div>}
      </div>

      {!loading && dailyChart.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Gasto diario (30 días)</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={dailyChart} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} interval={4} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickFormatter={v => `$${v}`} />
              <Tooltip
                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`$${v.toFixed(4)}`, 'Total']}
              />
              <Bar dataKey="cost" fill="#7c3aed" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && (data?.by_project || []).length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
          <div style={{ fontSize: 13, fontWeight: 600, padding: '14px 16px 4px' }}>Por proyecto (este mes)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                {['Proyecto', 'Proveedor', 'Costo'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.by_project || []).map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)22' }}>
                  <td style={{ padding: '7px 14px', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{r.project_id || '—'}</td>
                  <td style={{ padding: '7px 14px', color: 'var(--text-muted)' }}>{r.provider}</td>
                  <td style={{ padding: '7px 14px', fontFamily: 'JetBrains Mono, monospace' }}>${Number(r.cost_usd).toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
