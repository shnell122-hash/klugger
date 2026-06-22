'use client';

import { useState } from 'react';

export default function ConfirmarPagoBtn({ clientId, saldoActual }: { clientId: number; saldoActual: number }) {
  const [open,    setOpen]    = useState(false);
  const [monto,   setMonto]   = useState('');
  const [tipo,    setTipo]    = useState('');
  const [notas,   setNotas]   = useState('');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<string | null>(null);

  async function handleConfirm() {
    const m = parseFloat(monto.replace(/,/g, ''));
    if (!m || m <= 0) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/financial/clients/${clientId}/confirmar-pago`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto: m, tipo_operacion: tipo || undefined, notas: notas || undefined }),
      });
      const json = await res.json();
      if (json.ok) {
        setResult(`✅ Nuevo saldo: $${json.data.saldo_despues.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`);
        setTimeout(() => { setOpen(false); setResult(null); setMonto(''); setTipo(''); setNotas(''); }, 3000);
      } else {
        setResult(`❌ ${json.error}`);
      }
    } catch (e: unknown) {
      setResult(`❌ ${e instanceof Error ? e.message : 'Error'}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors"
        title="Registrar pago recibido"
      >
        + Pago
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="glass border border-border rounded-xl p-5 w-full max-w-sm space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Confirmar pago recibido</h3>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white text-lg leading-none">✕</button>
            </div>
            <p className="text-xs text-gray-500">Saldo actual: <b className={saldoActual < 0 ? 'text-red-400' : 'text-white'}>${saldoActual.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</b></p>

            <input
              type="text"
              placeholder="Monto ($)"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent"
            />
            <select
              value={tipo}
              onChange={e => setTipo(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
            >
              <option value="">Tipo de operación (opcional)</option>
              {['IAS','SPEI','SINDICATO','TARJETAS','EFECTIVO'].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Notas (opcional)"
              value={notas}
              onChange={e => setNotas(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-accent"
            />

            {result && <p className="text-xs text-center py-1">{result}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleConfirm}
                disabled={loading || !monto}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded-lg transition-colors"
              >
                {loading ? '…' : 'Confirmar'}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="flex-1 border border-border text-gray-400 hover:text-white text-sm py-2 rounded-lg transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
