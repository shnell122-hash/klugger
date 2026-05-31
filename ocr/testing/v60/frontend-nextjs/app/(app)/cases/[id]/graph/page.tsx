'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type GraphData } from '@/lib/api';

const NODE_COLORS: Record<string, string> = {
  persona:   'text-accent border-accent/30 bg-accent/5',
  empresa:   'text-accent-green border-accent-green/30 bg-accent-green/5',
  contrato:  'text-accent-amber border-accent-amber/30 bg-accent-amber/5',
  operacion: 'text-accent-purple border-accent-purple/30 bg-accent-purple/5',
  fecha:     'text-text-muted border-border bg-white/5',
  documento: 'text-accent-green border-accent-green/30 bg-accent-green/5',
};

export default function GraphPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data,    setData]    = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try { setData(await api.graph(id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  const nodes = data?.cytoscape?.elements
    ? (data.cytoscape.elements as Record<string, unknown>[])
        .filter(e => !(e.data as Record<string, unknown>)?.source)
    : [];

  return (
    <div className="flex h-full flex-col">
      {/* Sub-nav */}
      <div className="flex items-center gap-1 border-b border-border px-4 py-2">
        <Link href="/cases" className="text-xs text-text-faint hover:text-text-muted">Expedientes</Link>
        <span className="text-text-faint text-xs">/</span>
        <Link href={`/cases/${id}`} className="text-xs text-text-faint hover:text-text-muted">{id}</Link>
        <span className="text-text-faint text-xs">/</span>
        <span className="text-xs font-medium text-text-primary">Grafo</span>
        <div className="flex-1" />
        <nav className="flex gap-1">
          {[
            { label: 'Chat',       href: `/cases/${id}` },
            { label: 'Artefactos', href: `/cases/${id}/artifacts` },
            { label: 'Grafo',      href: `/cases/${id}/graph` },
          ].map(({ label, href }) => (
            <Link key={href} href={href}
              className="rounded px-2.5 py-1 text-xs text-text-muted hover:text-text-primary">
              {label}
            </Link>
          ))}
        </nav>
        <button onClick={load} disabled={loading}
          className="ml-2 text-text-faint hover:text-text-muted text-sm disabled:opacity-50">↻</button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 text-text-faint">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent-purple" />
            <span className="text-sm">Generando grafo…</span>
          </div>
        ) : error ? (
          <p className="text-sm text-accent-red">{error}</p>
        ) : data ? (
          <div className="space-y-6">
            {/* Stats */}
            <div className="flex gap-3">
              {[
                { label: 'Nodos',      value: data.node_count, color: 'text-accent-purple' },
                { label: 'Relaciones', value: data.edge_count, color: 'text-accent' },
              ].map(({ label, value, color }) => (
                <div key={label}
                  className="rounded-lg border border-border bg-surface px-4 py-2 flex items-center gap-3">
                  <span className={`text-lg font-bold ${color}`}>{value}</span>
                  <span className="text-xs text-text-muted">{label}</span>
                </div>
              ))}
            </div>

            {/* Summary */}
            {data.summary && (
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">Resumen</h2>
                <p className="text-sm text-text-primary leading-relaxed">{data.summary}</p>
              </div>
            )}

            {/* Mermaid */}
            {data.mermaid && (
              <div>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-faint">
                  Diagrama Mermaid
                </h2>
                <pre className="rounded-lg border border-border bg-surface p-4 text-xs text-accent-green font-mono overflow-x-auto select-all">
                  {data.mermaid}
                </pre>
                <p className="mt-1 text-[10px] text-text-faint">
                  Pega este código en{' '}
                  <a href="https://mermaid.live" target="_blank" rel="noreferrer"
                    className="text-accent hover:underline">mermaid.live</a>
                  {' '}para visualizar.
                </p>
              </div>
            )}

            {/* Node chips */}
            {nodes.length > 0 && (
              <div>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-faint">
                  Entidades detectadas
                </h2>
                <div className="flex flex-wrap gap-2">
                  {nodes.map((n, i) => {
                    const d     = n.data as Record<string, string>;
                    const type  = d.type ?? 'default';
                    const color = NODE_COLORS[type] ?? 'text-text-faint border-border bg-white/5';
                    return (
                      <span key={i}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${color}`}>
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {d.label}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-text-faint">
            <span className="text-3xl">🕸️</span>
            <span className="text-sm">Genera el grafo con ↻</span>
          </div>
        )}
      </div>
    </div>
  );
}
