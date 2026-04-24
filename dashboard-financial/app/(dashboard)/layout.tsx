import Link from 'next/link';

const navItems = [
  { href: '/',              label: 'Inicio',        icon: '🏠' },
  { href: '/operations',    label: 'Operaciones',   icon: '💸' },
  { href: '/analytics',     label: 'Analytics',     icon: '📈' },
  { href: '/clients',       label: 'Clientes',      icon: '👥' },
  { href: '/admin',         label: 'Admin',         icon: '⚙️' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-surface border-r border-border flex flex-col fixed h-full z-10">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center text-xs">💰</div>
            <span className="text-sm font-bold text-white">FinOps</span>
          </div>
          <p className="text-[10px] text-gray-600 mt-0.5 ml-9">Sistema Multiagéntico</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-border/60 transition-colors"
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <p className="text-[10px] text-gray-600">ia.vilarkptl.com</p>
          <p className="text-[10px] text-gray-700">Node.js · grammy · MySQL</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-56">
        {children}
      </main>
    </div>
  );
}
