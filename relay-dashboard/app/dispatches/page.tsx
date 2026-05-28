'use client';
import { useEffect, useState } from 'react';
import { fetchJSON, DispatchTask } from '@/lib/api';
import { useSocket } from '../components/SocketProvider';

const STATUS_COLOR: Record<string, string> = {
  completed: 'var(--green)',
  failed:    'var(--red)',
  dispatched:'var(--yellow)',
  pending:   'var(--text-muted)',
};

export default function DispatchesPage() {
  const [tasks, setTasks]   = useState<DispatchTask[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const { socket, connected } = useSocket();

  useEffect(() => {
    fetchJSON<DispatchTask[]>('/api/relay/dispatch')
      .then(d => setTasks(d.slice(0, 100))).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onNew      = (d: DispatchTask) => setTasks(t => [d, ...t].slice(0, 100));
    const onComplete = (d: Partial<DispatchTask>) => setTasks(t => t.map(x => x.id === d.id ? { ...x, ...d } : x));
    socket.on('dispatch:new',      onNew);
    socket.on('dispatch:complete', onComplete);
    return () => { socket.off('dispatch:new', onNew); socket.off('dispatch:complete', onComplete); };
  }, [socket]);

  const filtered = tasks.filter(t =>
    !filter || t.project.includes(filter) || t.title.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div style={{ paddingTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <input
          placeholder="Filtrar proyecto o tarea..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
            background: 'var(--surface)', color: 'var(--text)', fontSize: 13, width: 240,
          }}
        />
        <span style={{ fontSize: 12, color: connected ? 'var(--green)' : 'var(--text-muted)' }}>
          {connected ? '● live' : '○ offline'}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 'auto' }}>{filtered.length} tareas</span>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              {['Proyecto', 'Tarea', 'Estado', 'Solicitante', 'Depth', 'Duración', 'Creada'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && Array.from({ length: 10 }).map((_, i) => (
              <tr key={i}><td colSpan={7} style={{ padding: '10px 14px' }}>
                <div style={{ height: 10, background: 'var(--border)', borderRadius: 4, opacity: 0.5 }} />
              </td></tr>
            ))}
            {!loading && filtered.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)22' }}>
                <td style={{ padding: '8px 14px', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{t.project}</td>
                <td style={{ padding: '8px 14px', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.title}>{t.title}</td>
                <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                  <span style={{ color: STATUS_COLOR[t.status] || 'var(--text-muted)', fontWeight: 500, fontSize: 11 }}>
                    {t.status === 'completed' ? '✓' : t.status === 'failed' ? '✗' : t.status === 'dispatched' ? '⏳' : '⏸'} {t.status}
                  </span>
                </td>
                <td style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>{t.requester || '—'}</td>
                <td style={{ padding: '8px 14px', color: 'var(--text-muted)', textAlign: 'center' }}>{t.depth}</td>
                <td style={{ padding: '8px 14px', fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>
                  {t.duration_sec ? `${Math.round(t.duration_sec / 60)}m` : '—'}
                </td>
                <td style={{ padding: '8px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(t.created_at).toLocaleString('es-MX', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
              </tr>
            ))}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Sin dispatches</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
