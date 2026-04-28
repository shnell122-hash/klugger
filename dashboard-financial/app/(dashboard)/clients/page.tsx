import { api, fmt } from '@/lib/api';
import ConfirmarPagoBtn from '@/components/clients/ConfirmarPagoBtn';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  let clients = await api.getClients(100);

  return (
    <main className="p-6 max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Clientes</h1>
          <p className="text-sm text-gray-500">{clients.length} clientes registrados</p>
        </div>
        <div className="flex gap-3 text-xs">
          {(() => {
            const negativos = clients.filter(c => c.saldo < 0).length;
            return negativos > 0 ? (
              <span className="px-2 py-1 rounded glass border border-red-500/30 text-red-400">
                ⚠️ {negativos} con saldo negativo
              </span>
            ) : null;
          })()}
        </div>
      </div>

      <div className="glass rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3 text-right">Saldo neto</th>
              <th className="px-4 py-3 text-right">Saldo bruto</th>
              <th className="px-4 py-3 text-center">Completadas</th>
              <th className="px-4 py-3 text-center">Pendientes</th>
              <th className="px-4 py-3 text-right">Total entrada</th>
              <th className="px-4 py-3 text-right">Total salida</th>
              <th className="px-4 py-3">Última op.</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {clients.map(c => {
              const nombre = c.nombre || c.telegram_username || String(c.telegram_user_id);
              const saldo  = Number(c.saldo ?? 0);
              const negativo = saldo < 0;
              return (
                <tr key={c.id} className={`hover:bg-surface/80 transition-colors ${negativo ? 'bg-red-950/20' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">{nombre}</div>
                    {c.telegram_username && (
                      <div className="text-xs text-gray-500">@{c.telegram_username}</div>
                    )}
                  </td>
                  <td className={`px-4 py-3 font-mono font-semibold text-right ${negativo ? 'text-red-400' : 'text-emerald-400'}`}>
                    ${fmt(saldo)}
                  </td>
                  <td className="px-4 py-3 font-mono text-right text-gray-400">
                    ${fmt(c.saldo_bruto ?? saldo)}
                    {(() => {
                      const diff = Number(c.saldo_bruto ?? saldo) - saldo;
                      return diff > 0 ? (
                        <span className="block text-[10px] text-gray-600">
                          comisiones: ${fmt(diff)}
                        </span>
                      ) : null;
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/10 text-emerald-400">{c.ops_completadas ?? 0}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-400">{c.ops_pendientes ?? 0}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-300 text-right">${fmt(c.total_entrada)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-300 text-right">${fmt(c.total_salida)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {c.ultima_operacion ? new Date(c.ultima_operacion).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ConfirmarPagoBtn clientId={c.id} saldoActual={saldo} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
