'use client';
import { useEffect, useState } from 'react';
import { fetchJSON, RelayAlert } from '@/lib/api';
import { useSocket } from '../components/SocketProvider';

const SEV_COLOR: Record<string, string> = {
  critical: 'var(--red)',
  warning:  'var(--yellow)',
  info:     'var(--text-muted)',
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<RelayAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();

  useEffect(() => {
    fetchJSON<RelayAlert[]>('/api/alerts?limit=50')
      .then(setAlerts).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onAlert = (a: RelayAlert) => setAlerts(prev => [a, ...prev].slice(0, 50));
    socket.on('alert:new', onAlert);
    return () => { socket.off('alert:new', onAlert); };
  }, [socket]);

  const unresolved = alerts.filter(a => !a.resolved);

  return (
    <div style={{ paddingTop: 20 }}>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ padding: '8px 14px', background: 'var(--red-dim)', border: '1px solid var(--red)', borderRadius: 8, fontSize: 13 }}>
          <span style={{ color: 'var(--text-muted)' }}>Sin resolver: </span>
          <strong style={{ color: 'var(--red)' }}>{unresolved.length}</strong>
        </div>
        <div style={{ padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
          <span style={{ color: 'var(--text-muted)' }}>Total: </span>
          <strong>{alerts.length}</strong>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading && <div style={{ color: 'var(--text-muted)', padding: 24, textAlign: 'center' }}>Cargando alertas...</div>}
        {!loading && alerts.length === 0 && (
          <div style={{ color: 'var(--green)', padding: 24, textAlign: 'center' }}>✓ Sin alertas activas</div>
        )}
        {!loading && alerts.map(a => (
          <div key={a.id} style={{
            padding: '12px 16px', background: 'var(--surface)',
            border: `1px solid ${a.resolved ? 'var(--border)' : SEV_COLOR[a.severity] + '44'}`,
            borderLeft: `3px solid ${SEV_COLOR[a.severity]}`,
            borderRadius: 8, opacity: a.resolved ? 0.6 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: SEV_COLOR[a.severity], fontWeight: 600 }}>
                {a.alert_type}
              </span>
              {a.project_id && (
                <span style={{ fontSize: 11, color: 'var(--accent)' }}>{a.project_id}</span>
              )}
              {a.resolved && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ resuelto</span>}
              {a.auto_fixed && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>auto-fix</span>}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                {new Date(a.created_at).toLocaleString('es-MX', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: a.details ? 4 : 0 }}>{a.title}</div>
            {a.details && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>{a.details.slice(0, 200)}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
