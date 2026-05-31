'use client';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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

const UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.gif,.tiff,.docx,.doc,.xlsx,.xls,.pptx,.ppt,.txt,.html,.mp3,.mp4,.m4a,.wav,.ogg,.flac,.zip';

type ViewState = { name: string; type: string; content: string } | null;

export default function ArtifactsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const [dragOver,  setDragOver]  = useState(false);
  const [viewing,   setViewing]   = useState<ViewState>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { onArtifact } = useSocket();

  const load = useCallback(async () => {
    setLoading(true);
    try { setArtifacts(await api.artifacts.list(id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { return onArtifact(e => { if (e.case_id === id) load(); }); }, [id, load, onArtifact]);

  async function handleDelete(artifactId: string) {
    if (!confirm('¿Eliminar este artefacto?')) return;
    try {
      await api.artifacts.delete(artifactId);
      setArtifacts(a => a.filter(x => x.artifact_id !== artifactId));
    } catch (e) { alert(e instanceof Error ? e.message : 'Error'); }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true); setUploadMsg('');
    try {
      const fd = new FormData();
      fd.append('case_id', id);
      for (const f of Array.from(files)) fd.append('files', f);
      const res = await fetch('/api/v1/upload', { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const ok  = Array.isArray(data) ? data.filter((r: { status: string }) => r.status === 'ok').length : 0;
      const dup = Array.isArray(data) ? data.filter((r: { status: string }) => r.status === 'duplicate').length : 0;
      setUploadMsg(`${ok} subido(s)${dup ? `, ${dup} duplicado(s)` : ''}`);
      load();
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : 'Error al subir');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleView(a: Artifact) {
    setViewing({ name: a.artifact_name, type: a.artifact_type, content: '…' });
    try {
      const res = await fetch(`/api/artifacts/${a.artifact_id}/text`, { credentials: 'include' });
      const data = await res.json();
      const content = data.extracted_text || data.content || '(sin contenido)';
      setViewing({ name: a.artifact_name, type: a.artifact_type, content });
    } catch {
      setViewing(v => v ? { ...v, content: '(error al cargar)' } : null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Sub-nav */}
      <div className="flex items-center gap-1 border-b border-border px-4 py-2">
        <Link href="/cases" className="text-xs text-text-faint hover:text-text-muted">Expedientes</Link>
        <span className="text-text-faint text-xs">/</span>
        <Link href={`/cases/${id}`} className="text-xs text-text-faint hover:text-text-muted truncate max-w-[120px]">{id}</Link>
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

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Upload zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
          onClick={() => !uploading && fileInputRef.current?.click()}
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 transition-colors ${
            dragOver ? 'border-accent bg-accent/5 text-accent' : 'border-border bg-surface text-text-faint hover:border-accent/40 hover:text-text-muted'
          } ${uploading ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          <input ref={fileInputRef} type="file" multiple accept={UPLOAD_ACCEPT} className="hidden"
            onChange={e => handleUpload(e.target.files)} />
          {uploading ? (
            <div className="flex items-center gap-2 text-sm">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
              Subiendo…
            </div>
          ) : (
            <>
              <span className="text-xl">📎</span>
              <span className="text-sm">Arrastra archivos o haz clic para seleccionar</span>
              <span className="text-[10px] text-text-faint">PDF · Imagen · Word · Excel · Audio · ZIP</span>
            </>
          )}
        </div>
        {uploadMsg && (
          <p className={`text-xs px-1 ${uploadMsg.includes('error') || uploadMsg.includes('Error') ? 'text-accent-red' : 'text-accent-green'}`}>
            {uploadMsg}
          </p>
        )}

        {/* Artifact list */}
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
          </div>
        ) : error ? (
          <p className="text-sm text-accent-red">{error}</p>
        ) : artifacts.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-text-faint">
            <span className="text-3xl">📄</span>
            <span className="text-sm">Sin artefactos — sube archivos o usa el chat para generar</span>
          </div>
        ) : (
          <div className="grid gap-2">
            {artifacts.map(a => {
              const color = TYPE_COLOR[a.artifact_type] ?? 'text-text-muted';
              const bg    = TYPE_BG[a.artifact_type]   ?? 'bg-white/5';
              return (
                <div key={a.artifact_id}
                  className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3">
                  <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${bg} text-sm font-bold ${color}`}>
                    {a.artifact_type[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium text-text-primary">{a.artifact_name}</div>
                    <span className={`text-[10px] font-semibold ${color}`}>{a.artifact_type.toUpperCase()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleView(a)} title="Ver"
                      className="flex h-7 w-7 items-center justify-center rounded text-text-faint hover:text-accent text-sm">
                      👁
                    </button>
                    <a href={api.artifacts.downloadUrl(a.artifact_id)} target="_blank" rel="noreferrer"
                      title="Descargar"
                      className="flex h-7 w-7 items-center justify-center rounded text-text-faint hover:text-text-primary">
                      ↓
                    </a>
                    {a.share_slug && (
                      <a href={`https://ocr.ruby.lease/caso/${a.share_slug}`} target="_blank" rel="noreferrer"
                        title="Compartir"
                        className="flex h-7 w-7 items-center justify-center rounded text-text-faint hover:text-accent">
                        ↗
                      </a>
                    )}
                    <button onClick={() => handleDelete(a.artifact_id)} title="Eliminar"
                      className="flex h-7 w-7 items-center justify-center rounded text-text-faint hover:text-accent-red">
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Artifact viewer modal — ReactMarkdown, native to the design system */}
      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={e => { if (e.target === e.currentTarget) setViewing(null); }}
        >
          <div className="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-2xl">
            <div className="flex items-center gap-2 border-b border-border px-5 py-3 flex-shrink-0 bg-surface">
              <span className={`text-[10px] font-bold uppercase ${TYPE_COLOR[viewing.type] ?? 'text-text-muted'}`}>
                {viewing.type}
              </span>
              <span className="flex-1 truncate text-sm font-semibold text-text-primary">{viewing.name}</span>
              <button onClick={() => setViewing(null)}
                className="text-text-faint hover:text-text-primary text-lg leading-none">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto px-8 py-6">
              {viewing.content === '…' ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
                </div>
              ) : (
                <div className="prose-vilar prose-vilar-doc">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {viewing.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
