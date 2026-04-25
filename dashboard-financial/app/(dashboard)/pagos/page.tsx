import { api, fmt, type PaymentConfirmation } from '@/lib/api';

export const dynamic = 'force-dynamic';

const TIPO_ICON: Record<string, string> = {
  factura:     '📋',
  comprobante: '🧾',
  texto:       '💬',
  manual:      '⚙️',
};

const TIPO_LABEL: Record<string, string> = {
  factura:     'Factura',
  comprobante: 'Comprobante',
  texto:       'Texto',
  manual:      'Manual admin',
};

export default async function PagosPage() {
  let pagos: PaymentConfirmation[] = [];
  try { pagos = await api.getPaymentConfirmations('limit=200'); } catch (_) {}

  const total      = pagos.length;
  const volumBruto = pagos.reduce((s, p) => s + Number(p.monto_bruto), 0);
  const volumNeto  = pagos.reduce((s, p) => s + Number(p.monto_neto),  0);

  return (
    <main className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Confirmaciones de Pago</h1>
          <p className="text-sm text-gray-500">
            {total} registros · Bruto: ${fmt(volumBruto)} · Neto: ${fmt(volumNeto)}
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          {(['factura','comprobante','texto','manual'] as const).map(t => {
            const n = pagos.filter(p => p.tipo === t).length;
            return n > 0 ? (
              <span key={t} className="px-2 py-1 rounded glass border border-border text-gray-400">
                {TIPO_ICON[t]} {TIPO_LABEL[t]} · <b className="text-white">{n}</b>
              </span>
            ) : null;
          })}
        </div>
      </div>

      {pagos.length === 0 ? (
        <div className="glass rounded-xl border border-border p-12 text-center">
          <p className="text-4xl mb-3">🧾</p>
          <p className="text-gray-400">Aún no hay pagos confirmados.</p>
          <p className="text-xs text-gray-600 mt-1">
            Los pagos se registran automáticamente cuando clientes suben comprobantes o facturas,
            o cuando el admin confirma desde el dashboard.
          </p>
        </div>
      ) : (
        <div className="glass rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Op</th>
                <th className="px-4 py-3 text-right">Bruto</th>
                <th className="px-4 py-3 text-right">Neto</th>
                <th className="px-4 py-3 text-right">Comisión</th>
                <th className="px-4 py-3 text-right">Saldo → Nuevo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {pagos.map(p => (
                <tr key={p.id} className="hover:bg-border/20 transition-colors">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(p.created_at).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                    <span className="block text-[10px] text-gray-700">
                      {new Date(p.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{p.client_nombre || p.telegram_username}</p>
                    {p.telegram_username && (
                      <p className="text-[10px] text-gray-600">@{p.telegram_username}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-accent/10 text-accent">
                      {TIPO_ICON[p.tipo]} {TIPO_LABEL[p.tipo]}
                    </span>
                    {p.tipo_operacion && (
                      <p className="text-[10px] text-gray-500 mt-0.5">{p.tipo_operacion}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs">
                    {p.operation_id ? `#${p.operation_id}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white">
                    ${fmt(p.monto_bruto)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-400">
                    ${fmt(p.monto_neto)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500">
                    {p.comision_pct > 0 ? `${(p.comision_pct * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <span className="text-gray-500">${fmt(p.saldo_antes)}</span>
                    <span className="text-gray-700 mx-1">→</span>
                    <span className={p.saldo_despues >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      ${fmt(p.saldo_despues)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
