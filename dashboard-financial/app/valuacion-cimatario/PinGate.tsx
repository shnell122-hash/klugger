'use client';

import React, { useEffect, useState } from 'react';

// Soft client-side PIN gate for the Cimatario case shared on klugger.shnell.mx.
// NOTE: this is NOT real security (the bundle is public) — it's a light access
// gate so the link isn't openly browsable. PIN is intentionally simple.
const PIN = '1206';
const STORAGE_KEY = 'klugger_cimatario_unlocked';

export default function PinGate({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem(STORAGE_KEY) === '1') setUnlocked(true);
    } catch {}
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() === PIN) {
      setUnlocked(true);
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    } else {
      setError(true);
      setValue('');
    }
  };

  // Avoid hydration mismatch: render nothing until mounted
  if (!mounted) return null;

  if (unlocked) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0f] px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-[#1e1e2e] bg-[#111118] p-8 shadow-2xl"
      >
        <div className="flex flex-col items-center text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#00FF66] to-[#10b981] text-2xl font-black text-[#0a0a0f]">
            K
          </div>
          <h1 className="text-lg font-bold text-white">Klugger · Valuación Cimatario</h1>
          <p className="mt-1 text-xs text-gray-500">
            Acceso restringido — ingresa el PIN para ver el caso.
          </p>
        </div>

        <div className="mt-6">
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            autoComplete="off"
            value={value}
            onChange={(e) => { setValue(e.target.value); setError(false); }}
            placeholder="••••"
            className="w-full rounded-lg border border-[#2a2a3a] bg-[#0a0a0f] px-4 py-3 text-center text-2xl tracking-[0.5em] text-white outline-none focus:border-[#00FF66]"
          />
          {error && (
            <p className="mt-2 text-center text-xs text-red-400">PIN incorrecto. Intenta de nuevo.</p>
          )}
        </div>

        <button
          type="submit"
          className="mt-5 w-full rounded-lg bg-gradient-to-r from-[#00FF66] to-[#10b981] py-3 text-sm font-bold text-[#0a0a0f] transition hover:opacity-90"
        >
          Entrar
        </button>

        <p className="mt-4 text-center text-[10px] text-gray-600">
          Lic. Carlos Septién 53 · Col. Cimatario, Querétaro · Estudio de valuación
        </p>
      </form>
    </div>
  );
}
