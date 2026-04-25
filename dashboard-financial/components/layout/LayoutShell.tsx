'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const navItems = [
  { href: '/',           label: 'Inicio',      icon: '🏠' },
  { href: '/operations', label: 'Operaciones', icon: '💸' },
  { href: '/analytics',  label: 'Analytics',   icon: '📈' },
  { href: '/clients',    label: 'Clientes',    icon: '👥' },
  { href: '/banking',    label: 'Cuentas',     icon: '💳' },
  { href: '/pagos',      label: 'Pagos',       icon: '🧾' },
  { href: '/chats',      label: 'Chats',       icon: '💬' },
  { href: '/admin',      label: 'Admin',       icon: '⚙️' },
];

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  const sidebarW = collapsed ? 'w-14' : 'w-52';
  const mainML   = collapsed ? 'lg:ml-14' : 'lg:ml-52';

  return (
    <div className="flex min-h-screen bg-bg">

      {/* ── Mobile backdrop ─────────────────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-20 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-30 flex flex-col
          bg-surface border-r border-border
          transition-all duration-200
          ${sidebarW}
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Logo + toggle */}
        <div className="flex items-center justify-between px-3 py-4 border-b border-border shrink-0">
          <div className={`flex items-center gap-2 overflow-hidden ${collapsed ? 'w-7' : ''}`}>
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-xs shrink-0">💰</div>
            {!collapsed && (
              <div>
                <p className="text-sm font-bold text-white leading-none">FinOps</p>
                <p className="text-[10px] text-gray-600 mt-0.5">Sistema Multiagéntico</p>
              </div>
            )}
          </div>

          {/* Collapse toggle — desktop only */}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="hidden lg:flex items-center justify-center w-6 h-6 rounded text-gray-500 hover:text-white hover:bg-border/60 transition-colors shrink-0"
            title={collapsed ? 'Expandir' : 'Colapsar'}
          >
            {collapsed ? '›' : '‹'}
          </button>

          {/* Close — mobile only */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden flex items-center justify-center w-6 h-6 rounded text-gray-500 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : undefined}
                className={`
                  flex items-center gap-3 px-2 py-2.5 rounded-lg text-sm transition-colors
                  ${collapsed ? 'justify-center' : ''}
                  ${active
                    ? 'bg-accent/20 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-border/60'}
                `}
              >
                <span className="text-base leading-none">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="p-4 border-t border-border shrink-0">
            <p className="text-[10px] text-gray-600">ia.vilarkptl.com</p>
            <p className="text-[10px] text-gray-700">Node.js · grammy · MySQL</p>
          </div>
        )}
      </aside>

      {/* ── Page wrapper ────────────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-200 ${mainML}`}>

        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-10 flex items-center gap-3 px-4 h-12
                           bg-surface border-b border-border shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-gray-400 hover:text-white text-lg leading-none"
            aria-label="Abrir menú"
          >
            ☰
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-accent flex items-center justify-center text-[11px]">💰</div>
            <span className="text-sm font-semibold text-white">FinOps</span>
          </div>
        </header>

        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
