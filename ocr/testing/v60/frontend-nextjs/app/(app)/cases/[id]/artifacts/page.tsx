'use client';
import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, type Artifact } from '@/lib/api';
import { useSocket } from '@/components/socket-provider';

const TYPE_COLOR: Record<string, string> = {
  html:      'text-accent-green',
  contract:  'text-accent',
  brief:     'text-accent-purple',
  analysis:  'text-accent-amber',
  summary:   'text-text-muted',
  checklist: 'text-accent-amber',
};
const TYPE_BG: Record<string, string> = {
  html:      'bg-accent-green/10',
  contract:  'bg-accent/10',
  brief:     'bg-accent-purple/10',
  analysis:  'bg-accent-amber/10',
  summary:   'bg-white/5',
  checklist: 'bg-accent-amber/10',
};

export default function ArtifactsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');

  const { onArtifact } = useSocket();

  const load = useCallback(async () => {
    setLoading(true);
    try { setArtifacts(await api.artifacts.list(id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Refresh when a new artifact arrives for this case
  useEffect(() => {
    return onArtifact(e => { if (e.case_id === id) load(); });
  }, [id, load, onArtifact]);

  async function handleDelete(artifactId: string) {
    if (!confirm('¿Eliminar este artefacto?')) return;
    try {
      await api.artifacts.delete(artifactId);
      setArtifacts(a => a.filter(x => x.artifact_id !== artifactId));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Sub-nav */}
      <div className="flex items-center gap-1 border-b border-border px-4 py-2">
        <Link href="/cases" className="text-xs text-text-faint hover:text-text-muted">Expedientes</Link>
        <span className="text-text-faint text-xs">/</span>
        <Link href={`/cases/${id}`} className="text-xs text-text-faint hover:text-text-muted">{id}</Link>
        <span className="text-text-faint text-xs">/</span>
        <span className="text-xs font-medium text-text-primary">Artefactos</span>
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
        <button onClick={load} className="ml-2 text-text-faint hover:text-text-muted text-sm">↻</button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
          </div>
        ) : error ? (
          <p className="text-sm text-accent-red">{error}</p>
        ) : artifacts.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-text-faint">
            <span className="text-3xl">📄</span>
            <span className="text-sm">Sin artefactos — usa el chat para generar</span>
          </div>
        ) : (
          <div className="grid gap-2">
            {artifacts.map(a => {
              const color = TYPE_COLOR[a.artifact_type] ?? 'text-text-muted';
              const bg    = TYPE_BG[a.artifact_type]   ?? 'bg-white/5';
              return (
                <div
                  key={a.artifact_id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
                >
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${bg} text-sm font-bold ${color}`}>
                    {a.artifact_type[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium text-text-primary">{a.artifact_name}</div>
                    <span className={`text-[10px] font-semibold ${color}`}>
                      {a.artifact_type.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <a
                      href={api.artifacts.downloadUrl(a.artifact_id)}
                      target="_blank" rel="noreferrer"
                      title="Descargar"
                      className="flex h-7 w-7 items-center justify-center rounded text-text-faint hover:text-text-primary"
                    >↓</a>
                    {a.share_slug && (
                      <a
                        href={`https://ocr.ruby.lease/caso/${a.share_slug}`}
                        target="_blank" rel="noreferrer"
                        title="Compartir"
                        className="flex h-7 w-7 items-center justify-center rounded text-text-faint hover:text-accent"
                      >↗</a>
                    )}
                    <button
                      onClick={() => handleDelete(a.artifact_id)}
                      title="Eliminar"
                      className="flex h-7 w-7 items-center justify-center rounded text-text-faint hover:text-accent-red"
                    >✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
