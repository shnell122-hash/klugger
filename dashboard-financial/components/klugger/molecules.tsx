"use client";
// Klugger — moléculas del sistema (K1 del MASTERPLAN-CATALOGO §C).
// Craft Emil: <300ms, ease-out, entrada/salida asimétrica, interrumpible, reduced-motion.
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DUR, EASE_OUT, popIn } from "@/lib/motion";
import { Icon, UI } from "./icons";
import { Button } from "./atoms";
import { Logo } from "./Logo";

/* ── C6 · Segmented control (Comprar/Rentar/Vender) — underline animado (layoutId) ── */
export function Segmented<T extends string>({
  options, value, onChange,
}: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="kseg" role="tablist">
      {options.map((o) => {
        const active = o === value;
        return (
          <button key={o} role="tab" aria-selected={active} className="kseg__item" data-active={active} onClick={() => onChange(o)}>
            {active && <motion.span layoutId="kseg-pill" className="kseg__pill" transition={{ type: "spring", duration: 0.4, bounce: 0.18 }} />}
            <span className="kseg__label">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── C11 · Search bar (hero) — tipo + ubicación + NL + CTA ── */
export function SearchBar({ onOpenPalette }: { onOpenPalette?: () => void }) {
  const [tipo, setTipo] = useState<"Comprar" | "Rentar" | "Vender">("Comprar");
  return (
    <div className="ksearch">
      <Segmented options={["Comprar", "Rentar", "Vender"] as const} value={tipo} onChange={setTipo} />
      <div className="ksearch__row">
        <div className="ksearch__field">
          <Icon as={UI.MapPin} size={18} label="Ubicación" />
          <input className="ksearch__input" placeholder="Colonia, delegación o metro — ej. Condesa, Metro Chabacano" aria-label="Ubicación" />
        </div>
        <button className="ksearch__nl" onClick={onOpenPalette} title="Búsqueda en lenguaje natural (⌘K)">
          <Icon as={UI.MessageSquare} size={16} /> Preguntar
        </button>
        <Button variant="gradient"><Icon as={UI.Search} size={16} /> Buscar</Button>
      </div>
    </div>
  );
}

/* ── C13 · Navbar (top) — sticky transparente→sólido al hacer scroll dentro del demo ── */
const NAV_ITEMS = ["Comprar", "Rentar", "Vender", "Valuar", "Desarrolladores"];
export function Navbar({ solidByDefault = false }: { solidByDefault?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [solid, setSolid] = useState(solidByDefault);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = ref.current?.closest(".knav-scroll");
    if (!el) return;
    const onScroll = () => setSolid((el as HTMLElement).scrollTop > 8);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div ref={ref} className="knav" data-solid={solid}>
      <Logo variant="full" height={28} />
      <nav className="knav__items">
        {NAV_ITEMS.map((it) => <a key={it} className="knav__link" href="#" onClick={(e) => e.preventDefault()}>{it}</a>)}
      </nav>
      <div className="knav__right">
        <button className="knav__icon" aria-label="Guardados"><Icon as={UI.Heart} size={20} /></button>
        <Button variant="secondary" size="sm"><Icon as={UI.User} size={15} /> Entrar</Button>
        <button className="knav__burger" aria-label="Menú" onClick={() => setOpen((v) => !v)}><Icon as={open ? UI.X : UI.Menu} size={22} /></button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.div className="knav__mobile" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: DUR.hover, ease: EASE_OUT }}>
            {NAV_ITEMS.map((it) => <a key={it} className="knav__mlink" href="#" onClick={(e) => { e.preventDefault(); setOpen(false); }}>{it}</a>)}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── C14 · Bottom tab-bar (móvil) — indicador activo animado ── */
const TABS = [
  { id: "buscar", label: "Buscar", icon: UI.Search },
  { id: "mapa", label: "Mapa", icon: UI.Map },
  { id: "guardados", label: "Guardados", icon: UI.Heart },
  { id: "alertas", label: "Alertas", icon: UI.Bell },
  { id: "perfil", label: "Perfil", icon: UI.User },
] as const;
export function BottomNav() {
  const [active, setActive] = useState("buscar");
  return (
    <div className="ktabbar" role="tablist">
      {TABS.map((t) => {
        const on = active === t.id;
        return (
          <button key={t.id} role="tab" aria-selected={on} className="ktabbar__item" data-active={on} onClick={() => setActive(t.id)}>
            <span className="ktabbar__icon">
              {on && <motion.span layoutId="ktab-dot" className="ktabbar__dot" transition={{ type: "spring", duration: 0.4, bounce: 0.2 }} />}
              <Icon as={t.icon} size={22} strokeWidth={on ? 2.4 : 2} />
            </span>
            <span className="ktabbar__label">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ── C2 · Popover / Dropdown — origin-aware (sale del trigger) ── */
export function Popover({ trigger, children }: { trigger: (o: { open: boolean; toggle: () => void }) => ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc); document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);
  return (
    <div className="kpop" ref={ref}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      <AnimatePresence>
        {open && (
          <motion.div className="kpop__panel" style={{ transformOrigin: "top left" }} variants={popIn} initial="hidden" animate="show" exit="exit">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── C7 · Accordion — altura animada, sin ease-in ── */
export function Accordion({ items }: { items: { q: string; a: ReactNode }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="kacc">
      {items.map((it, i) => {
        const on = open === i;
        return (
          <div key={i} className="kacc__item" data-open={on}>
            <button className="kacc__head" aria-expanded={on} onClick={() => setOpen(on ? null : i)}>
              <span>{it.q}</span>
              <motion.span animate={{ rotate: on ? 180 : 0 }} transition={{ duration: DUR.hover, ease: EASE_OUT }} style={{ display: "inline-flex" }}><Icon as={UI.ChevronDown} size={18} /></motion.span>
            </button>
            <AnimatePresence initial={false}>
              {on && (
                <motion.div key="body" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: DUR.base, ease: EASE_OUT }} style={{ overflow: "hidden" }}>
                  <div className="kacc__body">{it.a}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/* ── C9 · Pagination ── */
export function Pagination({ total = 8 }: { total?: number }) {
  const [page, setPage] = useState(1);
  return (
    <div className="kpage">
      <button className="kpage__btn" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Anterior">‹</button>
      {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
        <button key={n} className="kpage__btn" data-active={n === page} onClick={() => setPage(n)}>{n}</button>
      ))}
      <button className="kpage__btn" disabled={page === total} onClick={() => setPage((p) => Math.min(total, p + 1))} aria-label="Siguiente">›</button>
    </div>
  );
}
