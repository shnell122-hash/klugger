'use client';

import { useState } from 'react';
import { api, fmt, type Client, type BankingAccount, type ClientModel, type OperationType } from '@/lib/api';
import ConfirmarPagoBtn from '@/components/clients/ConfirmarPagoBtn';

function EditNombreInline({ clientId, nombre, onSaved }: { clientId: number; nombre: string; onSaved: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(nombre);
  const [saving, setSaving]   = useState(false);

  const save = async () => {
    if (!value.trim() || value === nombre) { setEditing(false); return; }
    setSaving(true);
    try {
      await api.updateClientNombre(clientId, value.trim());
      onSaved(value.trim());
      setEditing(false);
    } catch (e) {
      alert(`Error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
          className="bg-surface border border-accent/40 rounded px-2 py-0.5 text-sm text-white w-40 focus:outline-none"
        />
        <button onClick={save} disabled={saving} className="text-xs text-accent hover:underline">{saving ? '…' : '✓'}</button>
        <button onClick={() => setEditing(false)} className="text-xs text-gray-600 hover:text-white">✕</button>
      </div>
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="group flex items-center gap-1 text-left hover:text-accent transition-colors">
      <span className="font-medium text-white group-hover:text-accent">{nombre}</span>
      <span className="text-[10px] text-gray-700 group-hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
    </button>
  );
}

function BankingExpandRow({ clientId }: { clientId: number }) {
  const [open, setOpen]           = useState(false);
  const [accounts, setAccounts]   = useState<BankingAccount[]>([]);
  const [loading, setLoading]     = useState(false);
  const [loaded, setLoaded]       = useState(false);

  const toggle = async () => {
    if (!open && !loaded) {
      setLoading(true);
      try {
        const data = await api.getBankingByClient(clientId);
        setAccounts(data);
        setLoaded(true);
      } catch { setAccounts([]); }
      finally { setLoading(false); }
    }
    setOpen(o => !o);
  };

  return (
    <>
      <tr>
        <td colSpan={9} className="px-4 py-0">
          <button onClick={toggle} className="text-[10px] text-gray-600 hover:text-accent py-1 transition-colors">
            {open ? '▲ ocultar cuentas' : '▼ ver cuentas bancarias'}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-surface/30">
          <td colSpan={9} className="px-6 py-3">
            {loading ? (
              <p className="text-xs text-gray-500">Cargando…</p>
            ) : accounts.length === 0 ? (
              <p className="text-xs text-gray-600">Sin cuentas registradas</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {accounts.map(a => (
                  <div key={a.id} className="bg-surface border border-border rounded-lg px-3 py-2 text-xs">
                    <span className="text-[10px] text-accent font-medium uppercase mr-2">{a.tipo}</span>
                    <span className="font-mono text-white">{a.numero}</span>
                    {a.banco && <span className="text-gray-500 ml-2">{a.banco}</span>}
                    {a.titular && <span className="text-gray-400 ml-2">· {a.titular}</span>}
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function ComisionesRow({ clientId }: { clientId: number }) {
  const [open, setOpen]                   = useState(false);
  const [models, setModels]               = useState<ClientModel[]>([]);
  const [globalTypes, setGlobalTypes]     = useState<OperationType[]>([]);
  const [loading, setLoading]             = useState(false);
  const [loaded, setLoaded]               = useState(false);
  const [saving, setSaving]               = useState<string | null>(null);
  const [editValues, setEditValues]       = useState<Record<string, string>>({});

  const toggle = async () => {
    if (!open && !loaded) {
      setLoading(true);
      try {
        const [clientMods, types] = await Promise.all([
          api.getClientModels(clientId),
          api.getOperationTypes(),
        ]);
        setModels(clientMods);
        setGlobalTypes(types);
        // Seed edit values from current overrides
        const init: Record<string, string> = {};
        clientMods.forEach(m => { init[m.tipo_operacion] = String((m.comision_pct * 100).toFixed(2)); });
        setEditValues(init);
        setLoaded(true);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    }
    setOpen(o => !o);
  };

  const save = async (tipo: string) => {
    const raw = editValues[tipo];
    const pct = parseFloat(raw) / 100;
    if (isNaN(pct) || pct < 0 || pct > 1) return;
    setSaving(tipo);
    try {
      await api.upsertClientModel(clientId, tipo, { comision_pct: pct, is_active: true });
      const updated = await api.getClientModels(clientId);
      setModels(updated);
    } catch (e) { alert((e as Error).message); }
    finally { setSaving(null); }
  };

  return (
    <>
      <tr>
        <td colSpan={9} className="px-4 py-0">
          <button onClick={toggle} className="text-[10px] text-gray-600 hover:text-accent py-1 transition-colors">
            {open ? '▲ ocultar comisiones' : '▼ ver comisiones por tipo'}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-surface/30">
          <td colSpan={9} className="px-6 py-3">
            {loading ? (
              <p className="text-xs text-gray-500">Cargando…</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {globalTypes.map(gt => {
                  const override = models.find(m => m.tipo_operacion === gt.codigo && m.is_active);
                  const currentPct = override ? override.comision_pct : gt.comision_pct;
                  const displayPct = (currentPct * 100).toFixed(2);
                  const editVal    = editValues[gt.codigo] ?? displayPct;
                  const isDirty    = editVal !== displayPct;
                  return (
                    <div key={gt.codigo} className="bg-surface border border-border rounded-lg px-3 py-2 text-xs flex items-center gap-2">
                      <span className="text-accent font-medium uppercase">{gt.codigo}</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={editVal}
                        onChange={e => setEditValues(v => ({ ...v, [gt.codigo]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') save(gt.codigo); if (e.key === 'Escape') setEditValues(v => ({ ...v, [gt.codigo]: displayPct })); }}
                        className="w-16 bg-transparent border-b border-border focus:border-accent outline-none text-white text-xs text-right"
                      />
                      <span className="text-gray-500">%</span>
                      {override && <span className="text-[10px] text-accent">personalizado</span>}
                      {!override && <span className="text-[10px] text-gray-700">global</span>}
                      {isDirty && (
                        <button
                          onClick={() => save(gt.codigo)}
                          disabled={saving === gt.codigo}
                          className="text-[10px] text-accent hover:underline"
                        >
                          {saving === gt.codigo ? '…' : '✓ guardar'}
                        </button>
                      )}
                    </div>
                  );
                })}
                {globalTypes.length === 0 && (
                  <p className="text-xs text-gray-600">Sin tipos de operación configurados</p>
                )}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function ClientsClient({ initialClients }: { initialClients: Client[] }) {
  const [clients, setClients] = useState<Client[]>(initialClients);

  const updateNombre = (id: number, nombre: string) => {
    setClients(cs => cs.map(c => c.id === id ? { ...c, nombre } : c));
  };

  const negativos = clients.filter(c => Number(c.saldo) < 0).length;

  return (
    <main className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-white">Clientes</h1>
          <p className="text-sm text-gray-500">{clients.length} clientes registrados</p>
        </div>
        {negativos > 0 && (
          <span className="px-2 py-1 rounded glass border border-red-500/30 text-red-400 text-xs">
            ⚠️ {negativos} con saldo negativo
          </span>
        )}
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
              const nombre   = c.nombre || c.telegram_username || String(c.telegram_user_id);
              const saldo    = Number(c.saldo ?? 0);
              const negativo = saldo < 0;
              return (
                <>
                  <tr key={c.id} className={`hover:bg-surface/80 transition-colors ${negativo ? 'bg-red-950/20' : ''}`}>
                    <td className="px-4 py-3">
                      <EditNombreInline
                        clientId={c.id}
                        nombre={nombre}
                        onSaved={n => updateNombre(c.id, n)}
                      />
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
                          <span className="block text-[10px] text-gray-600">comisiones: ${fmt(diff)}</span>
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
                  <BankingExpandRow key={`bk-${c.id}`} clientId={c.id} />
                  <ComisionesRow key={`cm-${c.id}`} clientId={c.id} />
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
