import { api, type BankingAccount, type EmpresaCuentaFull } from '@/lib/api';

export const dynamic = 'force-dynamic';

function maskClabe(s: string | null) {
  if (!s) return null;
  return `${s.slice(0,3)} ··· ${s.slice(-4)}`;
}

function maskCard(s: string | null) {
  if (!s) return null;
  return `●●●● ●●●● ●●●● ${s.slice(-4)}`;
}

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

function groupEmpresaCuentas(cuentas: EmpresaCuentaFull[]) {
  const map = new Map<string, { nombre: string; rfc: string | null; origen: string; cuentas: EmpresaCuentaFull[] }>();
  for (const c of cuentas) {
    const key = String(c.empresa_id);
    if (!map.has(key)) {
      map.set(key, { nombre: c.empresa_nombre, rfc: c.empresa_rfc, origen: c.empresa_origen, cuentas: [] });
    }
    map.get(key)!.cuentas.push(c);
  }
  return [...map.values()].sort((a, b) => (a.origen === 'nuestra' ? -1 : 1) || a.nombre.localeCompare(b.nombre));
}

export default async function BankingPage() {
  const [clientAccounts, empresaCuentas] = await Promise.all([
    api.getBankingAccounts(500).catch(() => [] as BankingAccount[]),
    api.getEmpresaCuentasAll().catch(() => [] as EmpresaCuentaFull[]),
  ]);

  const clientGroups  = groupByClient(clientAccounts);
  const empresaGroups = groupEmpresaCuentas(empresaCuentas);
  const nuestras      = empresaGroups.filter(g => g.origen === 'nuestra');
  const terceros      = empresaGroups.filter(g => g.origen !== 'nuestra');

  return (
    <main className="p-6 max-w-[1400px] mx-auto space-y-8">

      {/* ── Nuestras cuentas (empresa origen='nuestra') ─────────────────── */}
      <section className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-white">Nuestras Cuentas</h1>
          <p className="text-sm text-gray-500">{empresaCuentas.filter(c => c.empresa_origen === 'nuestra').length} cuentas propias</p>
        </div>

        {nuestras.length === 0 ? (
          <p className="text-sm text-gray-600 glass rounded-xl border border-border p-6">Sin cuentas propias registradas. Agrégalas en la sección Empresas.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {nuestras.map(group => (
              <div key={group.nombre} className="glass rounded-xl border border-accent/30 overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-accent/5 flex items-center gap-2">
                  <span className="text-lg">🏢</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{group.nombre}</p>
                    {group.rfc && <p className="text-[10px] text-gray-500">{group.rfc}</p>}
                  </div>
                  <span className="text-xs text-accent shrink-0">{group.cuentas.length} cta{group.cuentas.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-border/50">
                  {group.cuentas.map(c => (
                    <div key={c.id} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent uppercase tracking-wide">
                          {c.clabe ? 'CLABE' : c.num_tarjeta ? 'Tarjeta' : 'Cuenta'}
                        </span>
                        <span className="text-[10px] text-gray-500">{c.banco}</span>
                        {c.alias && <span className="text-[10px] text-gray-600 italic">{c.alias}</span>}
                      </div>
                      {c.clabe      && <p className="font-mono text-sm text-white tracking-wider">{maskClabe(c.clabe)}</p>}
                      {c.num_tarjeta && <p className="font-mono text-sm text-white tracking-wider">{maskCard(c.num_tarjeta)}</p>}
                      {c.num_cuenta  && !c.clabe && !c.num_tarjeta && (
                        <p className="font-mono text-sm text-white tracking-wider">···{c.num_cuenta.slice(-4)}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">👤 {c.titular}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Cuentas de terceros (empresas clientes) */}
        {terceros.length > 0 && (
          <details className="glass rounded-xl border border-border">
            <summary className="px-4 py-3 text-sm text-gray-400 cursor-pointer hover:text-white">
              Cuentas de terceros ({terceros.length} empresas)
            </summary>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-4">
              {terceros.map(group => (
                <div key={group.nombre} className="glass rounded-xl border border-border overflow-hidden">
                  <div className="px-4 py-2 border-b border-border flex items-center gap-2">
                    <span className="text-sm font-semibold text-white truncate">{group.nombre}</span>
                    {group.rfc && <span className="text-[10px] text-gray-500 ml-auto">{group.rfc}</span>}
                  </div>
                  <div className="divide-y divide-border/50">
                    {group.cuentas.map(c => (
                      <div key={c.id} className="px-4 py-2 text-xs">
                        <p className="font-mono text-white">{maskClabe(c.clabe) ?? maskCard(c.num_tarjeta) ?? `···${c.num_cuenta?.slice(-4)}`}</p>
                        <p className="text-gray-500">{c.banco} · {c.titular}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {/* ── Cuentas detectadas de clientes ────────────────────────────────── */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Cuentas de Clientes</h2>
          <p className="text-sm text-gray-500">{clientAccounts.length} cuentas · {clientGroups.length} clientes</p>
        </div>

        {clientGroups.length === 0 ? (
          <div className="glass rounded-xl border border-border p-8 text-center text-gray-500 text-sm">
            Sin cuentas detectadas aún. Se registran cuando clientes confirman operaciones.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {clientGroups.map(group => (
              <div key={group.username} className="glass rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-sm font-bold text-accent">
                    {(group.nombre?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{group.nombre}</p>
                    {group.username && <p className="text-[10px] text-gray-500">@{group.username}</p>}
                  </div>
                  <span className="ml-auto text-xs text-gray-600 shrink-0">{group.cuentas.length} cta{group.cuentas.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="divide-y divide-border/50">
                  {group.cuentas.map(c => (
                    <div key={c.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-accent/10 text-accent uppercase">{c.tipo}</span>
                          {c.banco && <span className="text-[10px] text-gray-500">{c.banco}</span>}
                        </div>
                        <p className="font-mono text-sm text-white mt-1">
                          {c.tipo === 'CLABE' ? maskClabe(c.numero) : c.tipo === 'tarjeta' ? maskCard(c.numero) : `··· ${c.numero.slice(-4)}`}
                        </p>
                        {c.titular && <p className="text-xs text-gray-400 mt-0.5 truncate">👤 {c.titular}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
