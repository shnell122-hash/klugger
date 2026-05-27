'use client';
import { useEffect, useState } from 'react';
import { fetchJSON } from '@/lib/api';

interface Session {
  id: string;
  project_name: string;
  chat_source: string | null;
  tool_call_count: number;
  total_cost_usd: number;
  is_active: number;
  resumed: number;
  started_at: string;
  ended_at: string | null;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [filter, setFilter]     = useState('');
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    fetchJSON<Session[]>('/api/sessions/recent?limit=100')
      .then(setSessions).catch(() => {}).finally(() => setLoading(false));
    const id = setInterval(() =>
      fetchJSON<Session[]>('/api/sessions/recent?limit=100').then(setSessions).catch(() => {}),
    30_000);
    return () => clearInterval(id);
  }, []);

  const filtered = sessions.filter(s =>
    !filter || (s.project_name || '').toLowerCase().includes(filter.toLowerCase()) ||
    (s.chat_source || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div style={{ paddingTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <input
          placeholder="Filtrar por proyecto..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: 220,
          }}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{filtered.length} sesiones</span>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              {['Proyecto', 'Fuente', 'Tools', 'Costo', 'Duración', 'Estado', 'Inicio'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <td key={j} style={{ padding: '10px 14px' }}>
                    <div style={{ height: 10, background: 'var(--border)', borderRadius: 4, width: '80%', opacity: 0.5 }} />
                  </td>
                ))}
              </tr>
            ))}
            {!loading && filtered.map(s => {
              const dur = s.ended_at && s.started_at
                ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
                : null;
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)33' }}>
                  <td style={{ padding: '8px 14px', color: 'var(--accent)', fontWeight: 500 }}>{s.project_name || '—'}</td>
                  <td style={{ padding: '8px 14px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{s.chat_source || '—'}</td>
                  <td style={{ padding: '8px 14px', fontFamily: 'JetBrains Mono, monospace', color: s.tool_call_count > 50 ? 'var(--green)' : 'var(--text)' }}>{s.tool_call_count}</td>
                  <td style={{ padding: '8px 14px', fontFamily: 'JetBrains Mono, monospace' }}>${Number(s.total_cost_usd).toFixed(4)}</td>
                  <td style={{ padding: '8px 14px', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{dur !== null ? `${dur}m` : '—'}</td>
                  <td style={{ padding: '8px 14px' }}>
                    {s.is_active
                      ? <span style={{ color: 'var(--green)', fontSize: 11 }}>● activa</span>
                      : <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>completa</span>}
                    {Boolean(s.resumed) && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--accent)' }}>↩ resume</span>}
                  </td>
                  <td style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>
                    {new Date(s.started_at).toLocaleString('es-MX', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              );
            })}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Sin sesiones</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
