import { api } from '@/lib/api';
import { fmt } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const clients = await api.getClients(100);

  return (
    <main className="p-6 max-w-[1600px] mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Clientes</h1>
        <p className="text-sm text-gray-500">{clients.length} clientes registrados</p>
      </div>

      <div className="glass rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {['Cliente', 'Saldo', 'Ops completadas', 'Ops pendientes', 'Total entrada', 'Total salida', 'Última op.'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map(c => (
              <tr key={c.id} className="border-b border-border/50 hover:bg-surface/80 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-white">{c.nombre ?? `@${c.telegram_username}` ?? `ID ${c.telegram_user_id}`}</div>
                  <div className="text-xs text-gray-500">@{c.telegram_username}</div>
                </td>
                <td className="px-4 py-3 font-mono font-semibold text-success">
                  ${fmt(c.saldo)}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="px-2 py-0.5 rounded text-xs bg-success/10 text-success">{c.ops_completadas ?? 0}</span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className="px-2 py-0.5 rounded text-xs bg-warning/10 text-warning">{c.ops_pendientes ?? 0}</span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-300">${fmt(c.total_entrada)}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-300">${fmt(c.total_salida)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {c.ultima_operacion ? new Date(c.ultima_operacion).toLocaleDateString('es-MX') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
