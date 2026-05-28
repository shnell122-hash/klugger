'use client';
import { useEffect, useState } from 'react';
import { fetchJSON, PipelineStat, DispatchTask } from '@/lib/api';
import { useSocket } from '../components/SocketProvider';
import clsx from 'clsx';

function rateColor(rate: number) {
  if (rate >= 80) return 'var(--green)';
  if (rate >= 50) return 'var(--yellow)';
  return 'var(--red)';
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; bg: string }> = {
    completed: { color: 'var(--green)', bg: 'var(--green-dim)' },
    failed:    { color: 'var(--red)',   bg: 'var(--red-dim)'   },
    dispatched:{ color: 'var(--yellow)',bg: 'var(--yellow-dim)'},
    pending:   { color: 'var(--text-muted)', bg: 'transparent' },
  };
  const s = map[status] || map.pending;
  return (
    <span style={{
      fontSize: 11, padding: '2px 7px', borderRadius: 4, fontWeight: 500,
      color: s.color, background: s.bg, border: `1px solid ${s.color}33`,
    }}>{status}</span>
  );
}

function FunnelBar({ completed, failed, stuck, total }: { completed: number; failed: number; stuck: number; total: number }) {
  const pct = (n: number) => total > 0 ? Math.round(100 * n / total) : 0;
  return (
    <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--muted)', gap: 1 }}>
      <div style={{ width: `${pct(completed)}%`, background: 'var(--green)', transition: 'width 0.5s' }} title={`Completadas: ${completed}`} />
      <div style={{ width: `${pct(failed)}%`, background: 'var(--red)', transition: 'width 0.5s' }} title={`Fallidas: ${failed}`} />
      <div style={{ width: `${pct(stuck)}%`, background: 'var(--yellow)', transition: 'width 0.5s' }} title={`Atascadas: ${stuck}`} />
    </div>
  );
}

export default function PipelineTab() {
  const [stats, setStats]   = useState<PipelineStat[]>([]);
  const [recent, setRecent] = useState<DispatchTask[]>([]);
  const [days, setDays]     = useState(7);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  const load = async () => {
    try {
      const [s, r] = await Promise.all([
        fetchJSON<PipelineStat[]>(`/api/relay/dispatch/stats?days=${days}`),
        fetchJSON<DispatchTask[]>('/api/relay/dispatch'),
      ]);
      setStats(s);
      setRecent(r.slice(0, 20));
    } catch (_) {}
    setLoading(false);
  };

  useEffect(() => { load(); const id = setInterval(load, 30_000); return () => clearInterval(id); }, [days]);

  useEffect(() => {
    if (!socket) return;
    const onNew      = (d: DispatchTask) => setRecent(r => [d, ...r].slice(0, 20));
    const onComplete = (d: Partial<DispatchTask>) => setRecent(r => r.map(t => t.id === d.id ? { ...t, ...d } : t));
    socket.on('dispatch:new',      onNew);
    socket.on('dispatch:complete', onComplete);
    return () => { socket.off('dispatch:new', onNew); socket.off('dispatch:complete', onComplete); };
  }, [socket]);

  const overallRate = stats.length ? Math.round(stats.reduce((s, r) => s + r.success_rate_pct * r.total, 0) / Math.max(1, stats.reduce((s, r) => s + r.total, 0))) : null;

  return (
    <div style={{ paddingTop: 20 }}>
      {/* Overall rate pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
        <div style={{
          padding: '10px 20px', borderRadius: 8,
          background: overallRate !== null ? (overallRate >= 80 ? 'var(--green-dim)' : overallRate >= 50 ? 'var(--yellow-dim)' : 'var(--red-dim)') : 'var(--surface)',
          border: `1px solid ${overallRate !== null ? rateColor(overallRate ?? 0) : 'var(--border)'}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Pipeline success rate ({days}d)</span>
          <span style={{ fontSize: 24, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', color: overallRate !== null ? rateColor(overallRate) : 'var(--text-muted)' }}>
            {overallRate !== null ? `${overallRate}%` : '—'}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            objetivo: <strong style={{ color: 'var(--green)' }}>85%</strong>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 7, 30].map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 12, cursor: 'pointer',
              background: days === d ? 'var(--accent-dim)' : 'var(--surface)',
              border: `1px solid ${days === d ? 'var(--accent)' : 'var(--border)'}`,
              color: days === d ? 'var(--accent)' : 'var(--text-muted)',
            }}>{d}d</button>
          ))}
        </div>
      </div>

      {/* Project grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 24 }}>
        {loading && [1,2,3,4].map(i => (
          <div key={i} style={{ height: 120, background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', opacity: 0.5 }} />
        ))}
        {!loading && stats.map(row => (
          <div key={row.project} style={{
            padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{row.project}</span>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 16,
                color: rateColor(row.success_rate_pct),
              }}>{row.success_rate_pct}%</span>
            </div>
            <FunnelBar completed={row.completed} failed={row.failed} stuck={row.stuck} total={row.total} />
            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
              <span>Total: <b style={{ color: 'var(--text)' }}>{row.total}</b></span>
              <span style={{ color: 'var(--green)' }}>✓ {row.completed}</span>
              <span style={{ color: 'var(--red)' }}>✗ {row.failed}</span>
              {row.stuck > 0 && <span style={{ color: 'var(--yellow)' }}>⏱ {row.stuck}</span>}
              {row.avg_min_completed && <span>avg {row.avg_min_completed}m</span>}
            </div>
          </div>
        ))}
        {!loading && stats.length === 0 && (
          <div style={{ gridColumn: '1/-1', color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>
            Sin datos en los últimos {days} días
          </div>
        )}
      </div>

      {/* Recent dispatches */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
          Dispatches recientes
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                {['Proyecto', 'Tarea', 'Estado', 'Duración', 'Creada'].map(h => (
                  <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border)33' }}>
                  <td style={{ padding: '8px 14px', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{t.project}</td>
                  <td style={{ padding: '8px 14px', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.title}>{t.title}</td>
                  <td style={{ padding: '8px 14px' }}><StatusBadge status={t.status} /></td>
                  <td style={{ padding: '8px 14px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {t.duration_sec ? `${Math.round(t.duration_sec / 60)}m` : '—'}
                  </td>
                  <td style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>
                    {new Date(t.created_at).toLocaleString('es-MX', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Sin dispatches recientes</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
