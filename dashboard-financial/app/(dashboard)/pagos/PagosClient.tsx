'use client';

import { useState } from 'react';
import { api, fmt, type PaymentConfirmation } from '@/lib/api';

const TIPO_ICON: Record<string, string> = { factura: '📋', comprobante: '🧾', texto: '💬', manual: '⚙️' };
const TIPO_LABEL: Record<string, string> = { factura: 'Factura', comprobante: 'Comprobante', texto: 'Texto', manual: 'Manual admin' };

function ComprobanteModal({ pagoId, onClose }: { pagoId: number; onClose: () => void }) {
  const url = api.getComprobantImageUrl(pagoId);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          className="absolute -top-8 right-0 text-gray-400 hover:text-white text-sm"
        >
          ✕ Cerrar
        </button>
        <img
          src={url}
          alt="Comprobante"
          className="w-full rounded-xl border border-border shadow-2xl"
          onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
        <p className="text-center text-xs text-gray-600 mt-2">
          Comprobante de pago #{pagoId} · <a href={url} target="_blank" rel="noopener" className="text-accent hover:underline">Abrir en nueva pestaña</a>
        </p>
      </div>
    </div>
  );
}

export default function PagosClient({ pagos }: { pagos: PaymentConfirmation[] }) {
  const [visorId, setVisorId] = useState<number | null>(null);

  const total      = pagos.length;
  const volumBruto = pagos.reduce((s, p) => s + Number(p.monto_bruto), 0);
  const volumNeto  = pagos.reduce((s, p) => s + Number(p.monto_neto),  0);

  return (
    <main className="p-6 max-w-[1400px] mx-auto space-y-6">
      {visorId !== null && (
        <ComprobanteModal pagoId={visorId} onClose={() => setVisorId(null)} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Confirmaciones de Pago</h1>
          <p className="text-sm text-gray-500">
            {total} registros · Bruto: ${fmt(volumBruto)} · Neto: ${fmt(volumNeto)}
          </p>
        </div>
        <div className="flex gap-2 text-xs flex-wrap">
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
        <div className="glass rounded-xl border border-border overflow-hidden overflow-x-auto">
          <table className="min-w-[700px] w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3 whitespace-nowrap">Fecha</th>
                <th className="px-4 py-3 whitespace-nowrap">Cliente</th>
                <th className="px-4 py-3 whitespace-nowrap">Tipo</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Bruto</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Neto</th>
                <th className="px-4 py-3 text-right whitespace-nowrap">Saldo → Nuevo</th>
                <th className="px-4 py-3 text-center whitespace-nowrap">Imagen</th>
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
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-accent/10 text-accent whitespace-nowrap">
                      {TIPO_ICON[p.tipo]} {TIPO_LABEL[p.tipo]}
                    </span>
                    {p.tipo_operacion && (
                      <p className="text-[10px] text-gray-500 mt-0.5">{p.tipo_operacion}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-white whitespace-nowrap">
                    ${fmt(p.monto_bruto)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-400 whitespace-nowrap">
                    ${fmt(p.monto_neto)}
                    {p.comision_pct > 0 && <span className="block text-[10px] text-gray-500">{(p.comision_pct * 100).toFixed(1)}%</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-xs">
                    <span className="text-gray-500">${fmt(p.saldo_antes)}</span>
                    <span className="text-gray-700 mx-1">→</span>
                    <span className={p.saldo_despues >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      ${fmt(p.saldo_despues)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.tipo === 'comprobante' || p.tipo === 'factura' ? (
                      <button
                        onClick={() => setVisorId(p.id)}
                        className="text-xs px-2 py-1 rounded bg-accent/10 text-accent hover:bg-accent/20 transition"
                      >
                        🖼 Ver
                      </button>
                    ) : (
                      <span className="text-gray-700 text-[10px]">—</span>
                    )}
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
