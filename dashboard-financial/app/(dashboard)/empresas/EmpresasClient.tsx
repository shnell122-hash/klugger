'use client';
import { useState } from 'react';
import { api, fmt, type Empresa, type EmpresaCuenta, type ClienteAsignado } from '@/lib/api';

interface Props { initialData: Empresa[] }

type OrigenType = 'nuestra' | 'cliente';
const emptyEmpresa = { nombre: '', rfc: '', origen: 'nuestra' as OrigenType, representante_nombre: '', notas: '' };
const emptyCuenta  = { banco: '', titular: '', clabe: '', num_cuenta: '', num_tarjeta: '', moneda: 'MXN', alias: '' };

export default function EmpresasClient({ initialData }: Props) {
  const [lista, setLista]             = useState(initialData);
  const [selected, setSelected]       = useState<Empresa | null>(null);
  const [cuentas, setCuentas]         = useState<EmpresaCuenta[]>([]);
  const [loadingC, setLoadingC]       = useState(false);
  const [clientesAsignados, setClientesAsignados] = useState<ClienteAsignado[]>([]);
  const [loadingCl, setLoadingCl]     = useState(false);
  const [allClients, setAllClients]   = useState<import('@/lib/api').Client[]>([]);
  const [showAsignar, setShowAsignar] = useState(false);
  const [showEmpForm, setShowEmpForm] = useState(false);
  const [showCuForm, setShowCuForm]   = useState(false);
  const [editingEmp, setEditingEmp]   = useState<Empresa | null>(null);
  const [editingCu, setEditingCu]     = useState<EmpresaCuenta | null>(null);
  const [empForm, setEmpForm]         = useState<typeof emptyEmpresa>(emptyEmpresa);
  // Cuenta incrustada en el form de nueva empresa
  const [cuInline, setCuInline]       = useState(emptyCuenta);
  const [cuForm, setCuForm]           = useState(emptyCuenta);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  async function openEmpresa(e: Empresa) {
    setSelected(e); setLoadingC(true); setShowAsignar(false);
    try {
      const [cs, cls] = await Promise.all([
        api.getEmpresaCuentas(e.id),
        e.origen === 'nuestra' ? api.getEmpresaClientes(e.id) : Promise.resolve([]),
      ]);
      setCuentas(cs);
      setClientesAsignados(cls as ClienteAsignado[]);
    } finally { setLoadingC(false); }
  }

  async function openAsignar() {
    if (!allClients.length) {
      setLoadingCl(true);
      try { setAllClients(await api.getClients(200)); } finally { setLoadingCl(false); }
    }
    setShowAsignar(true);
  }

  async function toggleAsignacion(clientId: number, isActive: boolean) {
    if (!selected) return;
    await api.toggleEmpresaCliente(selected.id, clientId, isActive);
    const updated = await api.getEmpresaClientes(selected.id);
    setClientesAsignados(updated as ClienteAsignado[]);
  }

  function openNewEmp() {
    setEditingEmp(null); setEmpForm(emptyEmpresa); setCuInline(emptyCuenta);
    setShowEmpForm(true); setError('');
  }
  function openEditEmp(e: Empresa) {
    setEditingEmp(e);
    setEmpForm({ nombre: e.nombre, rfc: e.rfc ?? '', origen: e.origen as OrigenType, representante_nombre: e.representante_nombre ?? '', notas: e.notas ?? '' });
    setShowEmpForm(true); setError('');
  }
  function openNewCuenta() { setEditingCu(null); setCuForm(emptyCuenta); setShowCuForm(true); setError(''); }
  function openEditCuenta(c: EmpresaCuenta) {
    setEditingCu(c);
    setCuForm({ banco: c.banco, titular: c.titular, clabe: c.clabe ?? '', num_cuenta: c.num_cuenta ?? '', num_tarjeta: c.num_tarjeta ?? '', moneda: c.moneda, alias: c.alias ?? '' });
    setShowCuForm(true); setError('');
  }

  async function saveEmpresa() {
    if (!empForm.nombre.trim()) { setError('Nombre requerido'); return; }
    // Si es nueva empresa, la cuenta es obligatoria
    if (!editingEmp && (!cuInline.banco.trim() || !cuInline.titular.trim())) {
      setError('Banco y titular de la cuenta son requeridos');
      return;
    }
    setSaving(true); setError('');
    try {
      const body = { nombre: empForm.nombre, rfc: empForm.rfc || null, origen: empForm.origen, representante_nombre: empForm.representante_nombre || null, notas: empForm.notas || null };
      if (editingEmp) {
        await api.updateEmpresa(editingEmp.id, body as Partial<Empresa>);
        setLista(prev => prev.map(e => e.id === editingEmp.id ? { ...e, ...body } : e));
        if (selected?.id === editingEmp.id) setSelected(s => s ? { ...s, ...body } : s);
      } else {
        const res = await api.createEmpresa(body as Partial<Empresa>);
        // Guardar cuenta bancaria al crear la empresa
        const cuBody = { banco: cuInline.banco, titular: cuInline.titular, clabe: cuInline.clabe || null, num_cuenta: cuInline.num_cuenta || null, num_tarjeta: cuInline.num_tarjeta || null, moneda: cuInline.moneda, alias: cuInline.alias || null };
        await api.createEmpresaCuenta(res.id, cuBody as Partial<EmpresaCuenta>);
        const newEmp = { id: res.id, ...body, is_active: true, total_cuentas: 1, created_at: new Date().toISOString() } as Empresa;
        setLista(prev => [...prev, newEmp]);
      }
      setShowEmpForm(false);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  async function saveCuenta() {
    if (!cuForm.banco.trim() || !cuForm.titular.trim()) { setError('Banco y titular requeridos'); return; }
    if (!selected) return;
    setSaving(true); setError('');
    try {
      const body = { banco: cuForm.banco, titular: cuForm.titular, clabe: cuForm.clabe || null, num_cuenta: cuForm.num_cuenta || null, num_tarjeta: cuForm.num_tarjeta || null, moneda: cuForm.moneda, alias: cuForm.alias || null };
      if (editingCu) {
        await api.updateEmpresaCuenta(editingCu.id, body as Partial<EmpresaCuenta>);
        setCuentas(prev => prev.map(c => c.id === editingCu.id ? { ...c, ...body } : c));
      } else {
        const res = await api.createEmpresaCuenta(selected.id, body as Partial<EmpresaCuenta>);
        const newC = { id: res.id, empresa_id: selected.id, ...body, is_active: true } as EmpresaCuenta;
        setCuentas(prev => [newC, ...prev]);
        setLista(prev => prev.map(e => e.id === selected.id ? { ...e, total_cuentas: e.total_cuentas + 1 } : e));
      }
      setShowCuForm(false);
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setSaving(false); }
  }

  async function toggleEmpresa(e: Empresa) {
    await api.updateEmpresa(e.id, { is_active: !e.is_active } as Partial<Empresa>);
    setLista(prev => prev.map(x => x.id === e.id ? { ...x, is_active: !x.is_active } : x));
  }

  const ORIGEN_BADGE: Record<string, string> = {
    nuestra: 'bg-accent/10 text-accent-light',
    cliente: 'bg-blue-500/10 text-blue-400',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Lista de empresas */}
      <div className="glass rounded-xl border border-border">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <span className="text-sm font-semibold text-gray-300">Empresas ({lista.length})</span>
          <button onClick={openNewEmp} className="px-3 py-1 rounded text-xs bg-accent/10 text-accent-light border border-accent/20 hover:bg-accent/20 transition">
            + Nueva
          </button>
        </div>
        <div className="divide-y divide-border">
          {lista.map(e => (
            <div key={e.id}
              onClick={() => openEmpresa(e)}
              className={`flex items-center justify-between p-4 cursor-pointer hover:bg-white/5 transition ${selected?.id === e.id ? 'bg-accent/10' : ''}`}>
              <div>
                <div className="text-sm font-medium text-white">{e.nombre}</div>
                <div className="text-xs text-gray-500">
                  {e.rfc || 'Sin RFC'} · {e.total_cuentas} cuenta{e.total_cuentas !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${ORIGEN_BADGE[e.origen]}`}>{e.origen}</span>
                {!e.is_active && <span className="text-xs text-gray-600">Inactiva</span>}
                <button onClick={ev => { ev.stopPropagation(); openEditEmp(e); }}
                  className="text-xs px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-400">Editar</button>
                <button onClick={ev => { ev.stopPropagation(); toggleEmpresa(e); }}
                  className="text-xs px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-400">
                  {e.is_active ? 'Desact.' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
          {lista.length === 0 && <p className="p-6 text-center text-gray-600 text-sm">No hay empresas</p>}
        </div>
      </div>

      {/* Panel derecho: cuentas + (si nuestra) clientes asignados */}
      <div className="space-y-4">
        {/* Cuentas bancarias */}
        <div className="glass rounded-xl border border-border">
          {!selected ? (
            <div className="flex items-center justify-center h-48 text-gray-600 text-sm">Selecciona una empresa</div>
          ) : (
            <>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div>
                  <span className="text-sm font-semibold text-white">{selected.nombre}</span>
                  <span className="text-xs text-gray-500 ml-2">— Cuentas bancarias</span>
                </div>
                <button onClick={openNewCuenta}
                  className="px-3 py-1 rounded text-xs bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition">
                  + Cuenta
                </button>
              </div>
              {loadingC ? (
                <div className="p-6 text-center text-gray-500 text-sm">Cargando…</div>
              ) : (
                <div className="divide-y divide-border">
                  {cuentas.map(c => (
                    <div key={c.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-sm font-medium text-white">{c.titular}</div>
                          <div className="text-xs text-gray-400">{c.banco}{c.alias ? ` · ${c.alias}` : ''}</div>
                          {c.clabe       && <div className="text-xs font-mono text-gray-500 mt-1">CLABE: {c.clabe}</div>}
                          {c.num_cuenta  && <div className="text-xs font-mono text-gray-500">Cuenta: {c.num_cuenta}</div>}
                          {c.num_tarjeta && <div className="text-xs font-mono text-gray-500">Tarjeta: ●●●● {c.num_tarjeta.slice(-4)}</div>}
                        </div>
                        <button onClick={() => openEditCuenta(c)}
                          className="text-xs px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-gray-400 shrink-0">Editar</button>
                      </div>
                    </div>
                  ))}
                  {cuentas.length === 0 && <p className="p-6 text-center text-gray-600 text-sm">Sin cuentas bancarias</p>}
                </div>
              )}
            </>
          )}
        </div>

        {/* Clientes asignados (solo para nuestras empresas) */}
        {selected?.origen === 'nuestra' && (
          <div className="glass rounded-xl border border-border">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <span className="text-sm font-semibold text-gray-300">Clientes asignados</span>
                <span className="text-xs text-gray-500 ml-2">— El bot usará esta cuenta para cobrar a estos clientes</span>
              </div>
              <button onClick={openAsignar}
                className="px-3 py-1 rounded text-xs bg-accent/10 text-accent-light border border-accent/20 hover:bg-accent/20 transition">
                + Asignar
              </button>
            </div>
            <div className="divide-y divide-border">
              {clientesAsignados.filter(c => c.is_active).map(c => (
                <div key={c.id} className="flex items-center justify-between p-3">
                  <div>
                    <div className="text-sm text-white">{c.nombre || c.telegram_username || `#${c.id}`}</div>
                    {c.telegram_username && <div className="text-xs text-gray-500">@{c.telegram_username}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-mono">${fmt(c.saldo)}</span>
                    <button onClick={() => toggleAsignacion(c.id, false)}
                      className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition">
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
              {clientesAsignados.filter(c => c.is_active).length === 0 && (
                <p className="p-4 text-center text-gray-600 text-xs">Sin clientes asignados</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal empresa (nueva o editar) */}
      {showEmpForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="glass rounded-xl border border-border p-6 w-full max-w-md space-y-4 my-4">
            <h2 className="text-base font-semibold text-white">{editingEmp ? 'Editar empresa' : 'Nueva empresa'}</h2>
            {error && <p className="text-xs text-red-400 bg-red-500/10 rounded p-2">{error}</p>}

            {/* Datos de la empresa */}
            <div className="space-y-3">
              {([['nombre','Nombre *'],['rfc','RFC'],['representante_nombre','Representante legal'],['notas','Notas']] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <input type="text" value={empForm[key as keyof typeof empForm]}
                    onChange={e => setEmpForm(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded bg-white/5 border border-border text-sm text-white focus:outline-none focus:border-accent/50" />
                </div>
              ))}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Origen</label>
                <select value={empForm.origen} onChange={e => setEmpForm(p => ({ ...p, origen: e.target.value as OrigenType }))}
                  className="w-full px-3 py-2 rounded bg-white/5 border border-border text-sm text-white focus:outline-none focus:border-accent/50">
                  <option value="nuestra">Nuestra</option>
                  <option value="cliente">Del cliente</option>
                </select>
              </div>
            </div>

            {/* Cuenta bancaria (solo en creación) */}
            {!editingEmp && (
              <>
                <div className="border-t border-border pt-4">
                  <p className="text-xs font-semibold text-gray-300 mb-3">Cuenta bancaria principal</p>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Banco *</label>
                      <input type="text" value={cuInline.banco} placeholder="Ej: BBVA, HSBC, Banamex"
                        onChange={e => setCuInline(p => ({ ...p, banco: e.target.value }))}
                        className="w-full px-3 py-2 rounded bg-white/5 border border-border text-sm text-white focus:outline-none focus:border-accent/50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Titular *</label>
                      <input type="text" value={cuInline.titular} placeholder="Nombre del titular"
                        onChange={e => setCuInline(p => ({ ...p, titular: e.target.value }))}
                        className="w-full px-3 py-2 rounded bg-white/5 border border-border text-sm text-white focus:outline-none focus:border-accent/50" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">CLABE (18 dígitos)</label>
                      <input type="text" value={cuInline.clabe} maxLength={18} placeholder="000000000000000000"
                        onChange={e => setCuInline(p => ({ ...p, clabe: e.target.value }))}
                        className="w-full px-3 py-2 rounded bg-white/5 border border-border text-sm text-white font-mono focus:outline-none focus:border-accent/50" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Núm. cuenta</label>
                        <input type="text" value={cuInline.num_cuenta}
                          onChange={e => setCuInline(p => ({ ...p, num_cuenta: e.target.value }))}
                          className="w-full px-3 py-2 rounded bg-white/5 border border-border text-sm text-white font-mono focus:outline-none focus:border-accent/50" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Alias</label>
                        <input type="text" value={cuInline.alias} placeholder="Ej: Principal"
                          onChange={e => setCuInline(p => ({ ...p, alias: e.target.value }))}
                          className="w-full px-3 py-2 rounded bg-white/5 border border-border text-sm text-white focus:outline-none focus:border-accent/50" />
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowEmpForm(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancelar</button>
              <button onClick={saveEmpresa} disabled={saving}
                className="px-4 py-2 rounded text-sm bg-accent/20 text-accent-light border border-accent/30 hover:bg-accent/30 transition disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cuenta adicional */}
      {showCuForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="glass rounded-xl border border-border p-6 w-full max-w-md space-y-4">
            <h2 className="text-base font-semibold text-white">{editingCu ? 'Editar cuenta' : 'Nueva cuenta bancaria'}</h2>
            {error && <p className="text-xs text-red-400 bg-red-500/10 rounded p-2">{error}</p>}
            <div className="space-y-3">
              {([['banco','Banco *'],['titular','Titular *'],['clabe','CLABE (18 dígitos)'],['num_cuenta','Número de cuenta'],['num_tarjeta','Número de tarjeta'],['alias','Alias']] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-xs text-gray-400 mb-1">{label}</label>
                  <input type="text" value={cuForm[key as keyof typeof cuForm]}
                    onChange={e => setCuForm(p => ({ ...p, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded bg-white/5 border border-border text-sm text-white focus:outline-none focus:border-accent/50" />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowCuForm(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition">Cancelar</button>
              <button onClick={saveCuenta} disabled={saving}
                className="px-4 py-2 rounded text-sm bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition disabled:opacity-50">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
