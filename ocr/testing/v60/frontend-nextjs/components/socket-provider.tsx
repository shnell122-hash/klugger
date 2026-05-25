'use client';
import {
  createContext, useCallback, useContext,
  useEffect, useRef, useState, type ReactNode,
} from 'react';
import { getSocket, type SocketArtifactEvent, type SocketTaskEvent } from '@/lib/socket';

type Toast = { id: number; message: string; type: 'artifact' | 'task' | 'error' };

type SocketCtx = {
  connected: boolean;
  toasts: Toast[];
  dismissToast: (id: number) => void;
  onArtifact: (cb: (e: SocketArtifactEvent) => void) => () => void;
};

const Ctx = createContext<SocketCtx | null>(null);
let _nextToastId = 1;

export function SocketProvider({ children }: { children: ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [toasts,    setToasts]    = useState<Toast[]>([]);
  const listenersRef = useRef<Set<(e: SocketArtifactEvent) => void>>(new Set());

  useEffect(() => {
    const socket = getSocket();
    socket.connect();

    socket.on('connect',    () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('artifact:new', (e: SocketArtifactEvent) => {
      const id = _nextToastId++;
      setToasts(t => [...t, {
        id,
        message: `Artefacto creado: ${e.artifact_name}`,
        type: 'artifact',
      }]);
      setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
      listenersRef.current.forEach(cb => cb(e));
    });

    socket.on('task:progress', (e: SocketTaskEvent) => {
      if (e.status === 'complete') {
        const id = _nextToastId++;
        setToasts(t => [...t, {
          id,
          message: `Tarea completada: ${e.done}/${e.total} artefactos`,
          type: 'task',
        }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 5000);
      }
    });

    return () => { socket.disconnect(); };
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const onArtifact = useCallback((cb: (e: SocketArtifactEvent) => void) => {
    listenersRef.current.add(cb);
    return () => { listenersRef.current.delete(cb); };
  }, []);

  return (
    <Ctx.Provider value={{ connected, toasts, dismissToast, onArtifact }}>
      {children}
      {/* Toast overlay */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-xl"
          >
            <span className={`h-2 w-2 rounded-full flex-shrink-0 ${
              t.type === 'artifact' ? 'bg-accent-green' :
              t.type === 'error'    ? 'bg-accent-red' : 'bg-accent'
            }`} />
            <span className="text-xs text-text-primary">{t.message}</span>
            <button
              onClick={() => dismissToast(t.id)}
              className="ml-2 text-text-faint hover:text-text-muted"
            >✕</button>
          </div>
        ))}
      </div>
      {/* Connection indicator */}
      {!connected && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-surface border border-border px-3 py-1.5 text-xs text-text-faint">
          <span className="h-1.5 w-1.5 rounded-full bg-text-faint" />
          Sin socket
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useSocket() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSocket must be inside SocketProvider');
  return ctx;
}
