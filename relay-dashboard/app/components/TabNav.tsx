'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { href: '/',           label: 'Pipeline',   emoji: '⚡' },
  { href: '/sessions',   label: 'Sesiones',   emoji: '🤖' },
  { href: '/dispatches', label: 'Dispatches', emoji: '📤' },
  { href: '/costs',      label: 'Costos',     emoji: '💰' },
  { href: '/alerts',     label: 'Alertas',    emoji: '🚨' },
];

export default function TabNav() {
  const path = usePathname();
  return (
    <nav style={{
      display: 'flex', gap: 2, padding: '12px 20px 0',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      {TABS.map(t => {
        const active = path === t.href;
        return (
          <Link key={t.href} href={t.href} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: '6px 6px 0 0',
            fontSize: 13, fontWeight: active ? 600 : 400,
            color: active ? 'var(--accent)' : 'var(--text-muted)',
            background: active ? 'var(--accent-dim)' : 'transparent',
            borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
            textDecoration: 'none', transition: 'all 0.15s',
          }}>
            <span>{t.emoji}</span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
