'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSocket } from './socket-provider';

type NavItem = { icon: string; label: string; href: string };

const NAV: NavItem[] = [
  { icon: '📁', label: 'Expedientes', href: '/cases' },
  { icon: '📊', label: 'Dashboard',   href: '/dashboard' },
];

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const pathname   = usePathname();
  const router     = useRouter();
  const { user, logout } = useAuth();
  const { connected }    = useSocket();
  const name = user?.name || user?.email || 'Usuario';

  async function handleLogout() {
    await logout();
    router.push('/login');
  }

  return (
    <aside
      className={`flex h-full flex-col border-r border-border bg-surface transition-all duration-200 ${
        collapsed ? 'w-[52px]' : 'w-[220px]'
      }`}
    >
      {/* Header */}
      <div className="flex h-14 items-center px-3">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-accent/10">
          <svg className="h-4 w-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
          </svg>
        </div>
        {!collapsed && (
          <div className="ml-2.5 flex-1 min-w-0">
            <div className="text-xs font-semibold text-text-primary truncate">VILAR Legal OS</div>
            <div className="flex items-center gap-1.5 text-[10px] text-text-faint">
              v60 · Testing
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-accent-green' : 'bg-text-faint'}`} />
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="ml-auto flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-text-faint hover:text-text-muted"
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      <div className="h-px bg-border" />
      <div className="mt-2 flex-1 space-y-0.5 px-1.5">
        {NAV.map(({ icon, label, href }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : ''}
              className={`flex h-9 items-center gap-2.5 rounded-md px-2 text-sm transition-colors ${
                active
                  ? 'bg-accent/10 text-accent font-medium'
                  : 'text-text-muted hover:bg-white/5 hover:text-text-primary'
              }`}
            >
              <span className="text-base">{icon}</span>
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </div>

      <div className="h-px bg-border" />
      {/* User */}
      <div className="p-2">
        <div className={`flex items-center gap-2 rounded-md px-2 py-2 ${collapsed ? '' : ''}`}>
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
            {name[0]?.toUpperCase()}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="truncate text-xs font-medium text-text-primary">{name}</div>
              {user?.role && (
                <div className="text-[10px] text-text-faint">{user.role}</div>
              )}
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              title="Cerrar sesión"
              className="text-text-faint hover:text-accent-red text-sm"
            >
              ⏻
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
