"use client";
// Klugger — organismos de dominio (K2 · MASTERPLAN-CATALOGO §D).
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { DUR, EASE_OUT } from "@/lib/motion";
import { Icon, UI } from "./icons";
import { Badge, Button } from "./atoms";

const fmtM = (n: number) => "$" + n.toLocaleString("es-MX");

/** Favoritos persistidos en localStorage (por navegador, sin cuenta). */
const FAV_KEY = "klugger:favs";
function readFavs(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(FAV_KEY) ?? "[]"); } catch { return []; }
}
function writeFavs(ids: string[]) {
  window.localStorage.setItem(FAV_KEY, JSON.stringify(ids));
  window.dispatchEvent(new Event("klugger:favs-change"));
}
export function useFavorite(id: string) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(readFavs().includes(id));
    sync();
    window.addEventListener("klugger:favs-change", sync);
    return () => window.removeEventListener("klugger:favs-change", sync);
  }, [id]);
  const toggle = () => {
    const favs = readFavs();
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : [...favs, id];
    writeFavs(next);
    toast(favs.includes(id) ? "Quitado de guardados" : "Guardado en tus favoritos", {
      description: favs.includes(id) ? undefined : "Se guarda en este navegador — inicia sesión para verlo en todos tus dispositivos.",
    });
  };
  return [on, toggle] as const;
}

/* ── C1/D · Card de propiedad — carrusel de fotos (tinte) al hover, badges, card↔pin ── */
export type Prop = {
  id: string; titulo: string; zona: string; precio: number; rec: number; m2: number;
  verificado: boolean; nuevo?: boolean; plus?: number; tint: string[];
  tipo?: string; usoSuelo?: string;
};
export function PropertyCard({ p, active, onHover, onClick }: { p: Prop; active?: boolean; onHover?: (id: string | null) => void; onClick?: (id: string) => void }) {
  const [idx, setIdx] = useState(0);
  const [fav, toggleFav] = useFavorite(p.id);
  return (
    <motion.article
      className="kprop" data-active={active} onMouseEnter={() => onHover?.(p.id)} onMouseLeave={() => onHover?.(null)}
      onClick={() => onClick?.(p.id)} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
      whileHover={{ y: -3 }} transition={{ duration: DUR.hover, ease: EASE_OUT }}
    >
      <div className="kprop__photo" style={{ background: p.tint[idx] }}>
        <div className="kprop__badges">
          {p.verificado && <Badge variant="verified"><Icon as={UI.BadgeCheck} size={12} /> Verificado</Badge>}
          {p.nuevo && <Badge variant="new">Nuevo</Badge>}
          {p.plus != null && <Badge variant="up"><Icon as={UI.TrendingUp} size={12} /> {p.plus}%</Badge>}
        </div>
        <button
          className="kprop__fav" data-on={fav} aria-label={fav ? "Quitar de guardados" : "Guardar"} aria-pressed={fav}
          onClick={(e) => { e.stopPropagation(); toggleFav(); }}
        >
          <UI.Heart size={18} fill={fav ? "currentColor" : "none"} />
        </button>
        <div className="kprop__dots">
          {p.tint.map((_, i) => (
            <button key={i} className="kprop__dot" data-on={i === idx} aria-label={`Foto ${i + 1}`} onClick={(e) => { e.stopPropagation(); setIdx(i); }} />
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

/* ── D7 · Shortlist colaborativa — voto + invitar co-comprador (persistida en localStorage) ── */
type Item = { id: string; titulo: string; precio: number; votos: number; yo: boolean };
const SHORTLIST_KEY = "klugger:shortlist";
const SHORTLIST_SEED: Item[] = [
  { id: "a", titulo: "Depto. Condesa 2 rec", precio: 6_450_000, votos: 2, yo: true },
  { id: "b", titulo: "Casa Coyoacán 3 rec", precio: 8_900_000, votos: 1, yo: false },
  { id: "c", titulo: "Loft Roma Norte", precio: 5_200_000, votos: 1, yo: false },
];
export function Shortlist() {
  const [items, setItems] = useState<Item[]>(SHORTLIST_SEED);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SHORTLIST_KEY);
      if (saved) setItems(JSON.parse(saved));
    } catch { /* localStorage no disponible o dato corrupto — se usa el seed */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) window.localStorage.setItem(SHORTLIST_KEY, JSON.stringify(items));
  }, [items, ready]);

  const vote = (id: string) =>
    setItems((s) => s.map((it) => (it.id === id ? { ...it, yo: !it.yo, votos: it.votos + (it.yo ? -1 : 1) } : it)));
  const invitar = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) navigator.clipboard.writeText(window.location.href).catch(() => {});
    toast.success("Link copiado", { description: "Compártelo con tu co-comprador para que vote contigo." });
  };
  return (
    <div className="kshort">
      <div className="kshort__head">
        <span className="kshort__title"><Icon as={UI.Heart} size={17} /> Shortlist compartida</span>
        <Button size="sm" variant="secondary" onClick={invitar}><Icon as={UI.User} size={14} /> Invitar</Button>
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
      <Button
        variant="gradient"
        onClick={() => toast("Modo “Decidir” — próximamente", { description: "Por ahora vota y comparte el link; muy pronto podrán comparar lado a lado." })}
      >
        <Icon as={UI.Check} size={15} /> Entrar a modo “Decidir”
      </Button>
    </div>
  );
}

/* ── D1 · Mapa map-first (mock estilizado) — pines con precio + card↔pin linking ── */
export type MapPin = { id: string; x: number; y: number; precio: string };
const DEFAULT_PINS: MapPin[] = [
  { id: "a", x: 28, y: 40, precio: "6.4M" },
  { id: "b", x: 58, y: 32, precio: "8.9M" },
  { id: "c", x: 44, y: 62, precio: "5.2M" },
  { id: "d", x: 72, y: 58, precio: "7.1M" },
];
export function MapFirst({ active, onHover, pins = DEFAULT_PINS }: { active?: string | null; onHover?: (id: string | null) => void; pins?: MapPin[] }) {
  return (
    <div className="kmap" role="img" aria-label="Mapa con propiedades (demo)">
      <div className="kmap__grid" />
      {pins.map((pin) => (
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
