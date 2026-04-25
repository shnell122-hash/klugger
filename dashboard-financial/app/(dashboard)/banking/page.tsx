import { api, fmt, type BankingAccount } from '@/lib/api';

export const dynamic = 'force-dynamic';

function maskNumero(numero: string, tipo: string) {
  if (tipo === 'CLABE')   return `${numero.slice(0,3)} ··· ${numero.slice(-4)}`;
  if (tipo === 'tarjeta') return `●●●● ●●●● ●●●● ${numero.slice(-4)}`;
  return `··· ${numero.slice(-4)}`;
}

const TIPO_ICON: Record<string, string> = {
  CLABE:   '🏦',
  tarjeta: '💳',
  cuenta:  '📄',
  otro:    '💰',
};

function groupByClient(accounts: BankingAccount[]) {
  const map = new Map<string, { nombre: string; username: string; cuentas: BankingAccount[] }>();
  for (const a of accounts) {
    const key = String(a.client_id);
    if (!map.has(key)) {
      map.set(key, { nombre: a.client_nombre || a.telegram_username, username: a.telegram_username, cuentas: [] });
    }
    map.get(key)!.cuentas.push(a);
  }
  return [...map.values()].sort((a, b) => a.nombre?.localeCompare(b.nombre ?? '') ?? 0);
}

export default async function BankingPage() {
  let accounts: BankingAccount[] = [];
  try { accounts = await api.getBankingAccounts(500); } catch (_) {}

  const groups = groupByClient(accounts);
  const total  = accounts.length;
  const clientes = groups.length;

  return (
    <main className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Cuentas Bancarias</h1>
          <p className="text-sm text-gray-500">{total} cuentas · {clientes} clientes</p>
        </div>
        <div className="flex gap-3 text-xs">
          {['CLABE','tarjeta','cuenta'].map(t => {
            const n = accounts.filter(a => a.tipo === t).length;
            return n > 0 ? (
              <span key={t} className="px-2 py-1 rounded glass border border-border text-gray-400">
                {TIPO_ICON[t]} {t} · <b className="text-white">{n}</b>
              </span>
            ) : null;
          })}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="glass rounded-xl border border-border p-12 text-center">
          <p className="text-4xl mb-3">💳</p>
          <p className="text-gray-400">Aún no hay cuentas bancarias registradas.</p>
          <p className="text-xs text-gray-600 mt-1">Se registran automáticamente cuando los clientes confirman operaciones IAS, SPEI, SINDICATO o TARJETAS.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {groups.map(group => (
            <div key={group.username} className="glass rounded-xl border border-border overflow-hidden">
              {/* Cliente header */}
              <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm font-bold text-accent">
                  {(group.nombre?.[0] ?? '?').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{group.nombre}</p>
                  {group.username && (
                    <p className="text-[10px] text-gray-500">@{group.username}</p>
                  )}
                </div>
                <span className="ml-auto text-xs text-gray-600 shrink-0">{group.cuentas.length} cta{group.cuentas.length !== 1 ? 's' : ''}</span>
              </div>

              {/* Cuentas */}
              <div className="divide-y divide-border/50">
                {group.cuentas.map(c => (
                  <div key={c.id} className="px-4 py-3 flex items-start gap-3">
                    <span className="text-xl mt-0.5">{TIPO_ICON[c.tipo] ?? '💰'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent uppercase tracking-wide">
                          {c.tipo}
                        </span>
                        {c.banco && (
                          <span className="text-[10px] text-gray-500">{c.banco}</span>
                        )}
                      </div>
                      <p className="font-mono text-sm text-white mt-1 tracking-wider">
                        {maskNumero(c.numero, c.tipo)}
                      </p>
                      {c.titular && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">👤 {c.titular}</p>
                      )}
                      {c.notas && (
                        <p className="text-[10px] text-gray-600 mt-0.5 truncate">{c.notas}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-gray-600">
                        {new Date(c.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                      </p>
                      {c.operation_id && (
                        <p className="text-[10px] text-gray-700 mt-0.5">Op #{c.operation_id}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
