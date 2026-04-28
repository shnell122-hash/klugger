'use client';
import { useState } from 'react';
import { api, fmt, type Comisionista, type ComisionistaRate, type OperationType } from '@/lib/api';

interface Props {
  initialData: Comisionista[];
  opTypes: OperationType[];
}

const emptyForm = { nombre: '', email: '', telegram_user_id: '', notas: '' };

export default function ComisionistasClient({ initialData, opTypes }: Props) {
  const [lista, setLista]             = useState(initialData);
  const [selected, setSelected]       = useState<Comisionista | null>(null);
  const [rates, setRates]             = useState<ComisionistaRate[]>([]);
  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState<Comisionista | null>(null);
  const [form, setForm]               = useState(emptyForm);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [loadingRates, setLoadingRates] = useState(false);
  const [rateEdits, setRateEdits]     = useState<Record<string, string>>({});
  const [savingRates, setSavingRates] = useState(false);

  async function openRates(c: Comisionista) {
    setSelected(c);
    setLoadingRates(true);
    try {
      const r = await api.getComisionistaRates(c.id);
      setRates(r);
      const edits: Record<string, string> = {};
      for (const t of opTypes) {
        const found = r.find(x => x.tipo_operacion === t.codigo);
        edits[t.codigo] = found ? String((found.pct * 100).toFixed(2)) : '';
      }
      setRateEdits(edits);
    } finally { setLoadingRates(false); }
  }

  function openNew() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setError('');
  }

  function openEdit(c: Comisionista) {
    setEditing(c);
    setForm({ nombre: c.nombre, email: c.email ?? '', telegram_user_id: c.telegram_user_id ?? '', notas: c.notas ?? '' });
    setShowForm(true);
    setError('');
  }

  async function handleSave() {
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return; }
    setSaving(true); setError('');
    try {
      if (editing) {
        await api.updateComisionista(editing.id, { nombre: form.nombre, email: form.email || null, telegram_user_id: form.telegram_user_id || null, notas: form.notas || null } as Partial<Comisionista>);
        setLista(prev => prev.map(c => c.id === editing.id ? { ...c, ...form } : c));
      } else {
        const res = await api.createComisionista({ nombre: form.nombre, email: form.email || null, telegram_user_id: form.telegram_user_id || null, notas: form.notas || null } as Partial<Comisionista>);
        setLista(prev => [...prev, { id: res.id, ...form, is_active: true, total_rates: 0, created_at: new Date().toISOString() } as Comisionista]);
      }
      setShowForm(false);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  async function handleToggle(c: Comisionista) {
    await api.updateComisionista(c.id, { is_active: !c.is_active } as Partial<Comisionista>);
    setLista(prev => prev.map(x => x.id === c.id ? { ...x, is_active: !x.is_active } : x));
  }

  async function saveRates() {
    if (!selected) return;
    setSavingRates(true);
    try {
      const rates = Object.entries(rateEdits)
        .filter(([, v]) => v !== '' && !isNaN(parseFloat(v)))
        .map(([tipo_operacion, v]) => ({ tipo_operacion, pct: parseFloat(v) / 100 }));
      await api.upsertComisionistaRates(selected.id, rates);
      setRates(await api.getComisionistaRates(selected.id));
      setLista(prev => prev.map(c => c.id === selected.id ? { ...c, total_rates: rates.length } : c));
    } finally { setSavingRates(false); }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* Lista */}
      <div className="glass rounded-xl border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="text-sm font-semibold text-gray-300">Comisionistas ({lista.length})</span>
          <button onClick={openNew} className="px-3 py-1 rounded text-xs bg-accent/10 text-accent-light border border-accent/20 hover:bg-accent/20 transition">
            + Nuevo
          </button>
        </div>
        <div className="divide-y divide-border">
          {lista.map(c => (
            <div key={c.id}
              onClick={() => openRates(c)}
              className={`flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition ${selected?.id === c.id ? 'bg-accent/10' : ''}`}>
              <div>
                <div className="text-sm font-medium text-white">{c.nombre}</div>
                <div className="text-xs text-gray-500">{c.email || '—'} · {c.total_rates} tasas</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full ${c.is_active ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'}`}>
                  {c.is_active ? 'Activo' : 'Inactivo'}
                </span>
                <button onClick={e => { e.stopPropagation(); openEdit(c); }}
                  className="text-xs px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-400">
                  Editar
                </button>
                <button onClick={e => { e.stopPropagation(); handleToggle(c); }}
                  className="text-xs px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-400">
                  {c.is_active ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
          {lista.length === 0 && (
            <p className="p-6 text-center text-gray-600 text-sm">No hay comisionistas</p>
          )}
        </div>
      </div>

      {/* Panel de tasas */}
      <div className="glass rounded-xl border border-border">
        {!selected ? (
          <div className="flex items-center justify-center h-48 text-gray-600 text-sm">
            Selecciona un comisionista para ver sus tasas
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <span className="text-sm font-semibold text-white">{selected.nombre}</span>
                <span className="text-xs text-gray-500 ml-2">— Tasas por tipo de operación</span>
              </div>
              <button onClick={saveRates} disabled={savingRates}
                className="px-3 py-1 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition disabled:opacity-50">
                {savingRates ? 'Guardando…' : 'Guardar tasas'}
              </button>
            </div>
            {loadingRates ? (
              <div className="p-6 text-center text-gray-500 text-sm">Cargando…</div>
            ) : (
              <div className="p-4 space-y-3">
                <p className="text-xs text-gray-500">Deja en blanco los tipos que no aplican.</p>
                {opTypes.map(t => (
                  <div key={t.codigo} className="flex items-center gap-3">
                    <div className="w-28 text-xs font-mono text-gray-300">{t.codigo}</div>
                    <div className="flex-1 text-xs text-gray-500">{t.nombre}</div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number" min="0" max="100" step="0.01"
                        placeholder="—"
                        value={rateEdits[t.codigo] ?? ''}
                        onChange={e => setRateEdits(prev => ({ ...prev, [t.codigo]: e.target.value }))}
                        className="w-20 px-2 py-1 rounded bg-white/5 border border-border text-xs text-white text-right focus:outline-none focus:border-accent/50"
                      />
                      <span className="text-xs text-gray-500">%</span>
                    </div>
                  </div>
                ))}
                {rates.length > 0 && (
                  <div className="pt-3 border-t border-border">
                    <p className="text-xs text-gray-500 mb-2">Total acumulado en comisiones</p>
                    <p className="text-sm font-semibold text-accent-light">
                      Ver en pestaña Comisiones
                    </p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal crear/editar */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="glass rounded-xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-base font-semibold text-white">{editing ? 'Editar comisionista' : 'Nuevo comisionista'}</h2>
            {error && <p className="text-xs text-red-400 bg-red-500/10 rounded p-2">{error}</p>}
            <div className="space-y-3">
              {([['nombre','Nombre *',true],['email','Email',false],['telegram_user_id','Telegram User ID',false],['notas','Notas',false]] as const).map(([key, label, required]) => (
                <div key={key}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <input
                    type="text" value={form[key as keyof typeof form]}
                    onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded bg-white/5 border border-border text-sm text-white focus:outline-none focus:border-accent/50"
                    placeholder={required ? 'Requerido' : 'Opcional'}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 rounded text-sm bg-accent/20 text-accent-light border border-accent/30 hover:bg-accent/30 transition disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
