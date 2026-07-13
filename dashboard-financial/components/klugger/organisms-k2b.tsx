"use client";
// Klugger — organismos de dominio, pendientes de K2 (§D: D2 galería, D3 floor-plan, D8 copiloto, D9 data-room).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { DUR, EASE_OUT } from "@/lib/motion";
import { Icon, UI } from "./icons";
import { Badge, Button } from "./atoms";

/* ── D2 · Galería / Lightbox — "1 de N", teclado, full-screen ── */
const SHOTS = ["#B4D94B", "#7CD6FF", "#DCCAB4", "#566757", "#C9B496", "#57C6E8"];
export function Gallery() {
  const [open, setOpen] = useState<number | null>(null);
  const close = () => setOpen(null);
  const go = (d: number) => setOpen((i) => (i == null ? i : (i + d + SHOTS.length) % SHOTS.length));
  useEffect(() => {
    if (open == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <div className="kgal">
      <div className="kgal__grid">
        {SHOTS.map((c, i) => (
          <button key={i} className="kgal__thumb" data-lead={i === 0} style={{ background: c }} onClick={() => setOpen(i)} aria-label={`Foto ${i + 1} de ${SHOTS.length}`}>
            {i === 0 && <span className="kgal__count"><Icon as={UI.LayoutGrid} size={13} /> {SHOTS.length} fotos</span>}
          </button>
        ))}
      </div>
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open != null && (
            <motion.div className="klight" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: DUR.hover }} onMouseDown={close}>
              <button className="klight__close" aria-label="Cerrar" onClick={close}><Icon as={UI.X} size={22} /></button>
              <button className="klight__nav klight__nav--prev" aria-label="Anterior" onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>
              <motion.div key={open} className="klight__stage" style={{ background: SHOTS[open] }} initial={{ scale: 0.96, opacity: 0.6 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: DUR.base, ease: EASE_OUT }} onMouseDown={(e) => e.stopPropagation()} />
              <button className="klight__nav klight__nav--next" aria-label="Siguiente" onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>
              <div className="klight__count">{open + 1} de {SHOTS.length}</div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

/* ── D3 · Floor plan clicable — plano 2D como navegación primaria ── */
const ROOMS = [
  { id: "sala", label: "Sala", x: 4, y: 4, w: 52, h: 40, m2: 28 },
  { id: "cocina", label: "Cocina", x: 58, y: 4, w: 38, h: 40, m2: 14 },
  { id: "rec1", label: "Recámara 1", x: 4, y: 46, w: 44, h: 50, m2: 18 },
  { id: "rec2", label: "Recámara 2", x: 50, y: 46, w: 30, h: 50, m2: 12 },
  { id: "bano", label: "Baño", x: 82, y: 46, w: 14, h: 50, m2: 6 },
];
export function FloorPlan() {
  const [sel, setSel] = useState("sala");
  const cur = ROOMS.find((r) => r.id === sel)!;
  return (
    <div className="kfloor">
      <svg viewBox="0 0 100 100" className="kfloor__svg" role="group" aria-label="Plano">
        {ROOMS.map((r) => (
          <g key={r.id} className="kfloor__room" data-on={sel === r.id} onClick={() => setSel(r.id)}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} rx={2} />
            <text x={r.x + r.w / 2} y={r.y + r.h / 2} className="kfloor__label">{r.label}</text>
          </g>
        ))}
      </svg>
      <div className="kfloor__info">
        <strong>{cur.label}</strong>
        <span>{cur.m2} m²</span>
        <span className="kfloor__hint">Toca un cuarto para saltar a sus fotos.</span>
      </div>
    </div>
  );
}

/* ── D8 · Copiloto del agente — next-best-action in-surface, accept optimista ── */
type Action = { id: string; icon: keyof typeof UI; title: string; why: string };
const ACTIONS: Action[] = [
  { id: "1", icon: "MessageSquare", title: "Responder a María G.", why: "Preguntó por disponibilidad hace 2 h — lead caliente." },
  { id: "2", icon: "TrendingUp", title: "Bajar precio 3% en Roma 402", why: "63 días en mercado, 0 visitas esta semana." },
  { id: "3", icon: "BadgeCheck", title: "Re-verificar Coyoacán 118", why: "Certificado de gravámenes vence en 4 días." },
];
export function AgentCopilot() {
  const [done, setDone] = useState<string[]>([]);
  const pending = ACTIONS.filter((a) => !done.includes(a.id));
  return (
    <div className="kcopilot">
      <div className="kcopilot__head">
        <span className="kcopilot__title"><Icon as={UI.TrendingUp} size={17} /> Copiloto del agente</span>
        <Badge variant="new">{pending.length} sugerencias</Badge>
      </div>
      <AnimatePresence initial={false}>
        {pending.map((a) => (
          <motion.div key={a.id} className="kcopilot__item" layout initial={{ opacity: 1 }} exit={{ opacity: 0, x: 24, transition: { duration: DUR.hover, ease: EASE_OUT } }}>
            <span className="kcopilot__ico"><Icon as={UI[a.icon]} size={18} /></span>
            <div className="kcopilot__body">
              <div className="kcopilot__t">{a.title}</div>
              <div className="kcopilot__w">{a.why}</div>
            </div>
            <div className="kcopilot__actions">
              <button className="kcopilot__skip" onClick={() => setDone((d) => [...d, a.id])} aria-label="Descartar"><Icon as={UI.X} size={16} /></button>
              <Button size="sm" onClick={() => setDone((d) => [...d, a.id])}>Hacer</Button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
      {pending.length === 0 && <div className="kcopilot__empty"><Icon as={UI.Check} size={18} /> Todo al día. Vuelvo cuando haya algo que valga tu tiempo.</div>}
    </div>
  );
}

/* ── D9 · Data room cifrado — sliders expiración/audiencia + audit itemizado ── */
const AUDIENCIAS = ["Solo yo", "Co-comprador", "Asesor", "Banco"];
const AUDIT = [
  { who: "Tú", act: "Subiste avalúo.pdf", when: "hace 1 h" },
  { who: "Co-comprador", act: "Vio escritura.pdf", when: "hace 40 min" },
  { who: "Banco BBVA", act: "Descargó estado_cuenta.pdf", when: "hace 12 min" },
];
export function DataRoom() {
  const [dias, setDias] = useState(7);
  const [aud, setAud] = useState(1);
  return (
    <div className="kdata">
      <div className="kdata__head">
        <span className="kdata__title"><Icon as={UI.BadgeCheck} size={17} /> Data room cifrado</span>
        <Badge variant="verified">E2E</Badge>
      </div>
      <label className="kfield">
        <span className="kfield__label">Expira en <strong>{dias} día{dias !== 1 ? "s" : ""}</strong></span>
        <input className="krange" type="range" min={1} max={30} value={dias} onChange={(e) => setDias(+e.target.value)} aria-label="Expiración" />
      </label>
      <label className="kfield">
        <span className="kfield__label">Audiencia máx.: <strong>{AUDIENCIAS[aud]}</strong></span>
        <input className="krange" type="range" min={0} max={AUDIENCIAS.length - 1} value={aud} onChange={(e) => setAud(+e.target.value)} aria-label="Audiencia" />
      </label>
      <div className="kdata__audit">
        <div className="kdata__auditttl">Bitácora de acceso</div>
        <ul>
          {AUDIT.map((a, i) => (
            <li key={i}><span className="kdata__who">{a.who}</span> {a.act} <span className="kdata__when">· {a.when}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
