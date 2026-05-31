'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Case } from '@/lib/api';

export default function CasesPage() {
  const [cases,   setCases]   = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [search,  setSearch]  = useState('');
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showNew,  setShowNew]  = useState(false);

  async function load() {
    try {
      setLoading(true);
      setCases(await api.cases.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.cases.create(newName.trim());
      setNewName('');
      setShowNew(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setCreating(false);
    }
  }

  const filtered = cases.filter(c =>
    c.case_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-5 py-3">
        <h1 className="text-base font-semibold text-text-primary">Expedientes</h1>
        <div className="flex-1" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar…"
          className="rounded-lg border border-border bg-bg px-3 py-1.5 text-xs text-text-primary placeholder-text-faint focus:border-accent focus:outline-none w-52"
        />
        <button
          onClick={() => setShowNew(true)}
          className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg hover:opacity-90"
        >
          + Nuevo
        </button>
        <button onClick={load} className="text-text-faint hover:text-text-muted text-sm">↻</button>
      </div>

      {/* New case modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-2xl"
          >
            <h2 className="mb-4 text-sm font-semibold text-text-primary">Nuevo expediente</h2>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nombre del expediente"
              className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder-text-faint focus:border-accent focus:outline-none"
            />
            {error && <p className="mt-2 text-xs text-accent-red">{error}</p>}
            <div className="mt-4 flex gap-2 justify-end">
              <button type="button" onClick={() => setShowNew(false)}
                className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-muted hover:text-text-primary">
                Cancelar
              </button>
              <button type="submit" disabled={creating}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-bg hover:opacity-90 disabled:opacity-50">
                {creating ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
          </div>
        ) : error ? (
          <p className="text-sm text-accent-red">{error}</p>
        ) : filtered.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-text-faint">
            <span className="text-3xl">📁</span>
            <span className="text-sm">{search ? 'Sin resultados' : 'Sin expedientes'}</span>
          </div>
        ) : (
          <div className="grid gap-2">
            {filtered.map(c => (
              <Link
                key={c.case_id}
                href={`/cases/${c.case_id}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface p-4 hover:border-accent/40 transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-lg flex-shrink-0">
                  📁
                </div>
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-sm text-text-primary">{c.case_name}</div>
                  {c.created_at && (
                    <div className="text-xs text-text-faint mt-0.5">
                      {new Date(c.created_at).toLocaleDateString('es-MX')}
                    </div>
                  )}
                </div>
                <span className="text-text-faint text-sm">›</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
