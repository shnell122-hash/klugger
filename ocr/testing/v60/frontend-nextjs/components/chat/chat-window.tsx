'use client';
import { KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { chatStream, type ChatEvent } from '@/lib/api';
import { useSocket } from '../socket-provider';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  ops?: ChatEvent[];
};

const SLASH_CMDS = [
  { cmd: '/masivo',       desc: 'Generar múltiples artefactos' },
  { cmd: '/materialidad', desc: 'Análisis de materialidad' },
  { cmd: '/grafico',      desc: 'Generar grafo del expediente' },
  { cmd: '/evidencia',    desc: 'Analizar evidencia' },
  { cmd: '/ultra',        desc: 'Modo ultra-económico (LLM barato)' },
  { cmd: '/sonnet',       desc: 'Forzar Claude Sonnet' },
];

const ARTIFACT_TYPES = ['analysis', 'contract', 'brief', 'summary', 'checklist', 'html'];

export function ChatWindow({ caseId }: { caseId: string }) {
  const [messages,  setMessages]  = useState<Message[]>([]);
  const [input,     setInput]     = useState('');
  const [streaming, setStreaming] = useState(false);
  const [artType,   setArtType]   = useState('analysis');
  const [showSlash, setShowSlash] = useState(false);
  const [opLog,     setOpLog]     = useState<ChatEvent[]>([]);
  const [showOps,   setShowOps]   = useState(false);

  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const abortRef   = useRef<AbortController | null>(null);

  const { onArtifact } = useSocket();

  // Listen for artifact:new from socket
  useEffect(() => {
    return onArtifact(e => {
      if (e.case_id === caseId) {
        setMessages(m => [...m, {
          role: 'assistant',
          content: `Artefacto creado: **${e.artifact_name}** (${e.artifact_type})`,
        }]);
      }
    });
  }, [caseId, onArtifact]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInput = (val: string) => {
    setInput(val);
    setShowSlash(val.startsWith('/') && !val.includes(' '));
  };

  const applySlash = (cmd: string) => {
    setInput(cmd + ' ');
    setShowSlash(false);
    inputRef.current?.focus();
  };

  const send = useCallback(async () => {
    const msg = input.trim();
    if (!msg || streaming) return;
    setInput('');
    setShowSlash(false);

    setMessages(m => [...m, { role: 'user', content: msg }]);
    setStreaming(true);

    let accumulated = '';
    const ops: ChatEvent[] = [];
    setMessages(m => [...m, { role: 'assistant', content: '', ops: [] }]);

    try {
      for await (const ev of chatStream(caseId, msg, artType)) {
        if (ev.type === 'text' && ev.content) {
          accumulated += ev.content;
          setMessages(m => {
            const updated = [...m];
            updated[updated.length - 1] = { role: 'assistant', content: accumulated, ops };
            return updated;
          });
        } else if (ev.type !== 'done') {
          ops.push(ev);
          setOpLog(l => [...l, ev]);
          setMessages(m => {
            const updated = [...m];
            updated[updated.length - 1] = { role: 'assistant', content: accumulated, ops: [...ops] };
            return updated;
          });
        }
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'Error';
      setMessages(m => {
        const updated = [...m];
        updated[updated.length - 1] = { role: 'assistant', content: `Error: ${errMsg}`, ops };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, caseId, artType]);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="text-xs text-text-faint">Tipo:</span>
        <div className="flex gap-1">
          {ARTIFACT_TYPES.map(t => (
            <button
              key={t}
              onClick={() => setArtType(t)}
              className={`rounded px-2 py-0.5 text-xs transition-colors ${
                artType === t
                  ? 'bg-accent/15 text-accent'
                  : 'text-text-faint hover:text-text-muted'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setShowOps(s => !s)}
          className={`text-xs px-2 py-0.5 rounded transition-colors ${
            showOps ? 'bg-accent-amber/15 text-accent-amber' : 'text-text-faint hover:text-text-muted'
          }`}
        >
          Op log ({opLog.length})
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-text-faint">
              <span className="text-4xl">⚖️</span>
              <p className="text-sm">Escribe un mensaje o usa un comando slash</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {SLASH_CMDS.slice(0, 3).map(({ cmd }) => (
                  <button
                    key={cmd}
                    onClick={() => applySlash(cmd)}
                    className="rounded-full border border-border px-3 py-1 text-xs text-text-muted hover:border-accent/40 hover:text-accent"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-xl px-4 py-3 text-sm ${
                  m.role === 'user'
                    ? 'bg-accent/15 text-text-primary'
                    : 'bg-surface border border-border text-text-primary'
                }`}
              >
                {m.role === 'assistant' ? (
                  <div className="prose-vilar">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {m.content || (streaming ? '▌' : '')}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap">{m.content}</span>
                )}
                {/* Op chips */}
                {m.ops && m.ops.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {m.ops.filter(o => o.type === 'tool_use').map((o, j) => (
                      <span key={j} className="rounded-full bg-accent-amber/10 px-2 py-0.5 text-[10px] text-accent-amber">
                        {o.tool_name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Op log panel */}
        {showOps && (
          <div className="w-56 overflow-y-auto border-l border-border bg-surface p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-faint">Op Log</p>
            {opLog.length === 0 ? (
              <p className="text-[11px] text-text-faint">Sin operaciones</p>
            ) : (
              <div className="space-y-1.5">
                {opLog.map((ev, i) => (
                  <div key={i} className="rounded bg-bg p-2 text-[10px]">
                    <div className="font-medium text-accent-amber">{ev.type}</div>
                    {ev.tool_name && <div className="text-text-muted">{ev.tool_name}</div>}
                    {ev.cost_mxn && (
                      <div className="text-text-faint">${ev.cost_mxn.toFixed(4)}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="relative border-t border-border p-3">
        {/* Slash suggestions */}
        {showSlash && (
          <div className="absolute bottom-full left-3 right-3 mb-1 rounded-lg border border-border bg-surface shadow-xl overflow-hidden">
            {SLASH_CMDS
              .filter(({ cmd }) => cmd.startsWith(input))
              .map(({ cmd, desc }) => (
                <button
                  key={cmd}
                  onClick={() => applySlash(cmd)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5"
                >
                  <span className="text-xs font-mono font-medium text-accent">{cmd}</span>
                  <span className="text-xs text-text-faint">{desc}</span>
                </button>
              ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={e => { handleInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
            onKeyDown={onKeyDown}
            placeholder="Escribe o /comando…"
            disabled={streaming}
            className="flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary placeholder-text-faint focus:border-accent focus:outline-none disabled:opacity-50"
            style={{ minHeight: '38px' }}
          />
          <button
            onClick={streaming ? () => abortRef.current?.abort() : send}
            disabled={!input.trim() && !streaming}
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
              streaming
                ? 'bg-accent-red/15 text-accent-red hover:bg-accent-red/25'
                : 'bg-accent text-bg hover:opacity-90'
            }`}
          >
            {streaming ? '■' : '↑'}
          </button>
        </div>
      </div>
    </div>
  );
}
