'use client';
import { useEffect, useState } from 'react';
import { fetchJSON, ResumeStats } from '@/lib/api';

interface HeaderStats {
  costToday: number;
  activeSessions: number;
  successRate: number | null;
  resumed: string;
}

export default function Header() {
  const [stats, setStats] = useState<HeaderStats>({ costToday: 0, activeSessions: 0, successRate: null, resumed: '—' });

  useEffect(() => {
    const load = async () => {
      try {
        const [resume, pipeline] = await Promise.allSettled([
          fetchJSON<ResumeStats>('/api/sessions/stats/resume'),
          fetchJSON<Array<{ success_rate_pct: number; total: number }>>('/api/relay/dispatch/stats?days=1'),
        ]);

        let rate: number | null = null;
        if (pipeline.status === 'fulfilled') {
          const rows = pipeline.value;
          const total = rows.reduce((s, r) => s + r.total, 0);
          const weighted = rows.reduce((s, r) => s + r.success_rate_pct * r.total, 0);
          rate = total > 0 ? Math.round(weighted / total) : null;
        }

        let resumedStr = '—';
        if (resume.status === 'fulfilled') {
          const t = resume.value.today;
          resumedStr = t.total > 0 ? `${t.resumed}/${t.total}` : '0';
        }

        setStats(s => ({ ...s, successRate: rate, resumed: resumedStr }));
      } catch (_) {}
    };
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const rateColor = stats.successRate === null ? 'var(--text-muted)' :
    stats.successRate >= 80 ? 'var(--green)' :
    stats.successRate >= 50 ? 'var(--yellow)' : 'var(--red)';

  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: 56, borderBottom: '1px solid var(--border)',
      background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 100,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="5"  r="2.5" fill="#7c3aed"/>
          <circle cx="19" cy="16" r="2.5" fill="#10b981"/>
          <circle cx="5"  cy="16" r="2.5" fill="#f59e0b"/>
          <line x1="12" y1="7.5" x2="18" y2="14" stroke="#7c3aed" strokeWidth="1.2" strokeLinecap="round"/>
          <line x1="12" y1="7.5" x2="6"  y2="14" stroke="#f59e0b" strokeWidth="1.2" strokeLinecap="round"/>
          <line x1="6"  y1="16.5" x2="18" y2="16.5" stroke="#10b981" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>
          Relay <span style={{ color: 'var(--accent)' }}>Monitor</span>
        </span>
      </div>

      {/* Stat pills */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Pill label="Success rate" value={stats.successRate !== null ? `${stats.successRate}%` : '—'} color={rateColor} title="Pipeline success rate últimas 24h" />
        <Pill label="Reanudadas" value={stats.resumed} title="Sesiones reanudadas hoy (--resume)" />
        <a href="https://ia.vilarkptl.com" target="_blank" rel="noreferrer"
           style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                    background: 'var(--accent-dim)', border: '1px solid var(--accent)',
                    borderRadius: 6, color: 'var(--accent)', fontSize: 12, textDecoration: 'none' }}>
          Dashboard clásico ↗
        </a>
      </div>
    </header>
  );
}

function Pill({ label, value, color, title }: { label: string; value: string; color?: string; title?: string }) {
  return (
    <div title={title} style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', background: 'var(--surface2)',
      border: '1px solid var(--border)', borderRadius: 6, fontSize: 12,
    }}>
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: color || 'var(--text)', fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
    </div>
  );
}
