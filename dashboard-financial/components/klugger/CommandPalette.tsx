"use client";
// Klugger — Command palette ⌘K (C10). Alta frecuencia → aparición INSTANTÁNEA (Emil:
// sin animación de entrada en herramientas de uso repetido); solo un fade sutil del overlay.
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, UI } from "./icons";

type Cmd = { id: string; label: string; hint?: string; icon: keyof typeof UI };
const COMMANDS: Cmd[] = [
  { id: "buy", label: "Buscar en venta", hint: "Comprar", icon: "Home" },
  { id: "rent", label: "Buscar en renta", hint: "Rentar", icon: "Building2" },
  { id: "valuar", label: "Valuar mi propiedad", hint: "AVM", icon: "TrendingUp" },
  { id: "map", label: "Ver en el mapa", hint: "Mapa", icon: "Map" },
  { id: "saved", label: "Mis guardados", hint: "Shortlist", icon: "Heart" },
  { id: "alerts", label: "Crear alerta de precio", hint: "Alertas", icon: "Bell" },
  { id: "verified", label: "Solo propiedades verificadas", icon: "BadgeCheck" },
  { id: "dev", label: "Portal de desarrolladores", icon: "LayoutGrid" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(
    () => COMMANDS.filter((c) => c.label.toLowerCase().includes(q.toLowerCase()) || c.hint?.toLowerCase().includes(q.toLowerCase())),
    [q]
  );
  useEffect(() => { if (open) { setQ(""); setSel(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); onClose(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, results.length, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="kcmd__overlay" onMouseDown={onClose}>
      <div className="kcmd" role="dialog" aria-modal="true" aria-label="Comandos" onMouseDown={(e) => e.stopPropagation()}>
        <div className="kcmd__search">
          <Icon as={UI.Search} size={18} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar o preguntar a Klugger…" aria-label="Comando" />
          <kbd className="kcmd__kbd">Esc</kbd>
        </div>
        <ul className="kcmd__list" role="listbox">
          {results.length === 0 && <li className="kcmd__empty">Sin resultados para “{q}”</li>}
          {results.map((c, i) => (
            <li
              key={c.id} role="option" aria-selected={i === sel} className="kcmd__item" data-active={i === sel}
              onMouseEnter={() => setSel(i)} onClick={onClose}
            >
              <span className="kcmd__ico"><Icon as={UI[c.icon]} size={18} /></span>
              <span className="kcmd__label">{c.label}</span>
              {c.hint && <span className="kcmd__hint">{c.hint}</span>}
              {i === sel && <span className="kcmd__enter"><Icon as={UI.Enter} size={14} /></span>}
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}

/** Hook: registra ⌘K / Ctrl-K para abrir la paleta. */
export function useCommandK(setOpen: (v: boolean) => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen(true); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setOpen]);
}
