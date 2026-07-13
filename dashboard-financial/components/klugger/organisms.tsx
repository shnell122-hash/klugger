"use client";
// Klugger — organismos de dominio (K2 · MASTERPLAN-CATALOGO §D).
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DUR, EASE_OUT } from "@/lib/motion";
import { Icon, UI } from "./icons";
import { Badge, Button } from "./atoms";

const fmtM = (n: number) => "$" + n.toLocaleString("es-MX");

/* ── C1/D · Card de propiedad — carrusel de fotos (tinte) al hover, badges, card↔pin ── */
export type Prop = { id: string; titulo: string; zona: string; precio: number; rec: number; m2: number; verificado: boolean; nuevo?: boolean; plus?: number; tint: string[] };
export function PropertyCard({ p, active, onHover }: { p: Prop; active?: boolean; onHover?: (id: string | null) => void }) {
  const [idx, setIdx] = useState(0);
  return (
    <motion.article
      className="kprop" data-active={active} onMouseEnter={() => onHover?.(p.id)} onMouseLeave={() => onHover?.(null)}
      whileHover={{ y: -3 }} transition={{ duration: DUR.hover, ease: EASE_OUT }}
    >
      <div className="kprop__photo" style={{ background: p.tint[idx] }}>
        <div className="kprop__badges">
          {p.verificado && <Badge variant="verified"><Icon as={UI.BadgeCheck} size={12} /> Verificado</Badge>}
          {p.nuevo && <Badge variant="new">Nuevo</Badge>}
          {p.plus != null && <Badge variant="up"><Icon as={UI.TrendingUp} size={12} /> {p.plus}%</Badge>}
        </div>
        <button className="kprop__fav" aria-label="Guardar"><Icon as={UI.Heart} size={18} /></button>
        <div className="kprop__dots">
          {p.tint.map((_, i) => (
            <button key={i} className="kprop__dot" data-on={i === idx} aria-label={`Foto ${i + 1}`} onClick={() => setIdx(i)} />
          ))}
        </div>
      </div>
      <div className="kprop__body">
        <div className="kprop__price">{fmtM(p.precio)}</div>
        <div className="kprop__title">{p.titulo}</div>
        <div className="kprop__meta"><Icon as={UI.MapPin} size={13} /> {p.zona} · {p.rec} rec · {p.m2} m²</div>
      </div>
    </motion.article>
  );
}

/* ── D5 · Panel de verificación itemizado (honesto: qué se verificó + cuándo) ── */
const CHECKS = [
  { k: "Título de propiedad", ok: true, detail: "Folio real cotejado con RPP." },
  { k: "Geolocalización", ok: true, detail: "Coordenadas confirmadas en predio." },
  { k: "Dueño / vendedor", ok: true, detail: "Identidad validada." },
  { k: "Gravámenes", ok: false, detail: "Sin certificado de libertad reciente." },
];
export function VerificationPanel() {
  return (
    <div className="kverify">
      <div className="kverify__head">
        <span className="kverify__title"><Icon as={UI.BadgeCheck} size={18} /> Verificación</span>
        <span className="kverify__date">Última re-verificación: hace 3 días</span>
      </div>
      <ul className="kverify__list">
        {CHECKS.map((c) => (
          <li key={c.k} className="kverify__item" data-ok={c.ok}>
            <span className="kverify__ico"><Icon as={c.ok ? UI.Check : UI.X} size={15} /></span>
            <span className="kverify__k">{c.k}</span>
            <span className="kverify__d">{c.detail}</span>
          </li>
        ))}
      </ul>
      <p className="kverify__foot">Mostramos exactamente qué revisamos y qué falta — sin sellos genéricos.</p>
    </div>
  );
}

/* ── D7 · Shortlist colaborativa — voto + invitar co-comprador ── */
type Item = { id: string; titulo: string; precio: number; votos: number; yo: boolean };
export function Shortlist() {
  const [items, setItems] = useState<Item[]>([
    { id: "a", titulo: "Depto. Condesa 2 rec", precio: 6_450_000, votos: 2, yo: true },
    { id: "b", titulo: "Casa Coyoacán 3 rec", precio: 8_900_000, votos: 1, yo: false },
    { id: "c", titulo: "Loft Roma Norte", precio: 5_200_000, votos: 1, yo: false },
  ]);
  const vote = (id: string) =>
    setItems((s) => s.map((it) => (it.id === id ? { ...it, yo: !it.yo, votos: it.votos + (it.yo ? -1 : 1) } : it)));
  return (
    <div className="kshort">
      <div className="kshort__head">
        <span className="kshort__title"><Icon as={UI.Heart} size={17} /> Shortlist compartida</span>
        <Button size="sm" variant="secondary"><Icon as={UI.User} size={14} /> Invitar</Button>
      </div>
      <ul className="kshort__list">
        {items.map((it) => (
          <li key={it.id} className="kshort__item">
            <div>
              <div className="kshort__t">{it.titulo}</div>
              <div className="kshort__p">{fmtM(it.precio)}</div>
            </div>
            <button className="kshort__vote" data-on={it.yo} onClick={() => vote(it.id)}>
              <Icon as={UI.Heart} size={15} /> {it.votos}
            </button>
          </li>
        ))}
      </ul>
      <Button variant="gradient"><Icon as={UI.Check} size={15} /> Entrar a modo “Decidir”</Button>
    </div>
  );
}

/* ── D1 · Mapa map-first (mock estilizado) — pines con precio + card↔pin linking ── */
const PINS = [
  { id: "a", x: 28, y: 40, precio: "6.4M" },
  { id: "b", x: 58, y: 32, precio: "8.9M" },
  { id: "c", x: 44, y: 62, precio: "5.2M" },
  { id: "d", x: 72, y: 58, precio: "7.1M" },
];
export function MapFirst({ active, onHover }: { active?: string | null; onHover?: (id: string | null) => void }) {
  return (
    <div className="kmap" role="img" aria-label="Mapa con propiedades (demo)">
      <div className="kmap__grid" />
      {PINS.map((pin) => (
        <button
          key={pin.id} className="kmap__pin" data-active={active === pin.id}
          style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
          onMouseEnter={() => onHover?.(pin.id)} onMouseLeave={() => onHover?.(null)}
        >
          ${pin.precio}
        </button>
      ))}
      <AnimatePresence>
        {active && (
          <motion.div className="kmap__hint" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: DUR.hover, ease: EASE_OUT }}>
            card ↔ pin enlazados
          </motion.div>
        )}
      </AnimatePresence>
      <div className="kmap__badge">Mock · el real usa Mapbox GL (capas: precio/transporte/plusvalía/riesgo)</div>
    </div>
  );
}
