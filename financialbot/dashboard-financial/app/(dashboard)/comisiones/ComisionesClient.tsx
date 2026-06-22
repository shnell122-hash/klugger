'use client';
import { useState, useMemo } from 'react';
import { api, fmt, type Comision, type Comisionista } from '@/lib/api';

interface Props {
  initialData: Comision[];
  comisionistas: Comisionista[];
}

type Tab = 'todas' | 'pendientes' | 'pagadas';

export default function ComisionesClient({ initialData, comisionistas }: Props) {
  const [data, setData]           = useState(initialData);
  const [tab, setTab]             = useState<Tab>('pendientes');
  const [filterCom, setFilterCom] = useState('');
  const [paying, setPaying]       = useState<number | null>(null);

  const filtered = useMemo(() => {
    let rows = data;
    if (tab === 'pendientes') rows = rows.filter(r => !r.pagado);
    if (tab === 'pagadas')    rows = rows.filter(r =>  r.pagado);
    if (filterCom)            rows = rows.filter(r => String(r.comisionista_id) === filterCom);
    return rows;
  }, [data, tab, filterCom]);

  const totals = useMemo(() => ({
    pendiente: data.filter(r => !r.pagado).reduce((s, r) => s + Number(r.monto_comision), 0),
    pagado:    data.filter(r =>  r.pagado).reduce((s, r) => s + Number(r.monto_comision), 0),
  }), [data]);

  async function pagar(id: number) {
    setPaying(id);
    try {
      await api.pagarComision(id);
      setData(prev => prev.map(r => r.id === id ? { ...r, pagado: true, fecha_pago: new Date().toISOString() } : r));
    } finally { setPaying(null); }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: 'pendientes', label: `Pendientes (${data.filter(r => !r.pagado).length})` },
    { key: 'pagadas',    label: `Pagadas (${data.filter(r => r.pagado).length})` },
    { key: 'todas',      label: `Todas (${data.length})` },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs rápidos */}
      <div className="grid grid-cols-2 gap-4">
        <div className="glass rounded-xl p-4 border border-border">
          <p className="text-xs text-gray-500">Por pagar</p>
          <p className="text-2xl font-bold text-orange-400">${fmt(totals.pendiente)}</p>
        </div>
        <div className="glass rounded-xl p-4 border border-border">
          <p className="text-xs text-gray-500">Ya pagado</p>
          <p className="text-2xl font-bold text-green-400">${fmt(totals.pagado)}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border border-border">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-xs font-medium transition ${tab === t.key ? 'bg-accent/20 text-accent-light' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <select value={filterCom} onChange={e => setFilterCom(e.target.value)}
          className="px-3 py-2 rounded-lg bg-white/5 border border-border text-xs text-gray-300 focus:outline-none focus:border-accent/50">
          <option value="">Todos los comisionistas</option>
          {comisionistas.map(c => (
            <option key={c.id} value={String(c.id)}>{c.nombre}</option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      <div className="glass rounded-xl border border-border overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-gray-500 uppercase tracking-wide">
              <th className="p-3 text-left">Comisionista</th>
              <th className="p-3 text-left">Cliente</th>
              <th className="p-3 text-left">Tipo</th>
              <th className="p-3 text-right">Monto op.</th>
              <th className="p-3 text-right">%</th>
              <th className="p-3 text-right">Comisión</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-left">Fecha pago</th>
              <th className="p-3 text-left">Registrado</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map(r => (
              <tr key={r.id} className="hover:bg-white/5 transition">
                <td className="p-3 text-white font-medium">{r.comisionista_nombre}</td>
                <td className="p-3 text-gray-300">{r.client_nombre}</td>
                <td className="p-3">
                  <span className="px-2 py-0.5 rounded-full bg-accent/10 text-accent-light font-mono">{r.tipo_operacion}</span>
                </td>
                <td className="p-3 text-right text-gray-300 font-mono">${fmt(Number(r.monto_base))}</td>
                <td className="p-3 text-right text-gray-500">{(Number(r.pct) * 100).toFixed(2)}%</td>
                <td className="p-3 text-right font-semibold text-white">${fmt(Number(r.monto_comision))}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${r.pagado ? 'bg-green-500/10 text-green-400' : 'bg-orange-500/10 text-orange-400'}`}>
                    {r.pagado ? 'Pagada' : 'Pendiente'}
                  </span>
                </td>
                <td className="p-3 text-gray-500">
                  {r.fecha_pago ? new Date(r.fecha_pago).toLocaleDateString('es-MX') : '—'}
                </td>
                <td className="p-3 text-gray-600">
                  {new Date(r.created_at).toLocaleDateString('es-MX')}
                </td>
                <td className="p-3">
                  {!r.pagado && (
                    <button onClick={() => pagar(r.id)} disabled={paying === r.id}
                      className="px-2 py-1 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition disabled:opacity-50">
                      {paying === r.id ? '…' : 'Marcar pagada'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="p-8 text-center text-gray-600">Sin registros</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
