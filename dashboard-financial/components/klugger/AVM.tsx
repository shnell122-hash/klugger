"use client";
// Klugger — AVM widget "Valuar" (D4). Regla de honestidad: SIEMPRE mostrar el rango de
// confianza (no un número solo), el nivel de confianza y los factores ponderados con su
// dirección + un "por qué" legible. Nunca presentar el estimado como precio cerrado.
import { useState } from "react";
import { motion } from "framer-motion";
import { DUR, EASE_OUT } from "@/lib/motion";
import { Icon, UI } from "./icons";
import { Badge } from "./atoms";

type Factor = { label: string; weight: number; dir: "up" | "down" | "flat"; note: string };
const FACTORS: Factor[] = [
  { label: "Ubicación (Condesa)", weight: 34, dir: "up", note: "Colonia de alta demanda y plusvalía sostenida." },
  { label: "Superficie 82 m²", weight: 22, dir: "flat", note: "En la mediana del segmento 2 rec." },
  { label: "Plusvalía de zona", weight: 18, dir: "up", note: "+6.4% anual en los últimos 3 años." },
  { label: "Comparables (14 reales)", weight: 16, dir: "up", note: "Cierres recientes a ≤500 m del predio." },
  { label: "Estado / antigüedad", weight: 10, dir: "down", note: "Edificio de 2009; resta vs. obra nueva." },
];

const fmt = (n: number) => "$" + n.toLocaleString("es-MX");

export function AVMWidget() {
  const [open, setOpen] = useState(false);
  const point = 6_450_000, lo = 6_050_000, hi = 6_900_000; // MXN
  const pct = ((point - lo) / (hi - lo)) * 100;
  return (
    <div className="kavm">
      <div className="kavm__head">
        <div>
          <div className="kavm__eyebrow"><Icon as={UI.TrendingUp} size={15} /> Valor estimado Klugger</div>
          <div className="kavm__value">{fmt(point)}</div>
          <div className="kavm__range">Rango de confianza · {fmt(lo)} – {fmt(hi)}</div>
        </div>
        <Badge variant="verified"><Icon as={UI.BadgeCheck} size={13} /> Confianza alta</Badge>
      </div>

      {/* barra de rango con el punto estimado */}
      <div className="kavm__bar" aria-hidden>
        <div className="kavm__bartrack" />
        <motion.div className="kavm__barpoint" initial={{ left: "50%" }} animate={{ left: `${pct}%` }} transition={{ duration: DUR.slow, ease: EASE_OUT }} />
        <div className="kavm__barlabels"><span>{fmt(lo)}</span><span>{fmt(hi)}</span></div>
      </div>

      <p className="kavm__why">
        Estimado a partir de <strong>14 comparables reales</strong> de la zona, ponderando ubicación, superficie y plusvalía.
        Es un <strong>rango</strong>, no un precio cerrado: el valor final depende de estado interior, negociación y condiciones de mercado al cierre.
      </p>

      <button className="kavm__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? "Ocultar" : "Ver"} factores ponderados
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: DUR.hover, ease: EASE_OUT }} style={{ display: "inline-flex" }}><Icon as={UI.ChevronDown} size={16} /></motion.span>
      </button>

      {open && (
        <motion.ul className="kavm__factors" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: DUR.base, ease: EASE_OUT }}>
          {FACTORS.map((f) => (
            <li key={f.label} className="kavm__factor">
              <div className="kavm__frow">
                <span className="kavm__flabel">
                  <Icon as={f.dir === "down" ? UI.ChevronDown : UI.TrendingUp} size={14} />
                  {f.label}
                </span>
                <span className="kavm__fweight" data-dir={f.dir}>{f.weight}%</span>
              </div>
              <div className="kavm__fbar"><span style={{ width: `${f.weight}%` }} data-dir={f.dir} /></div>
              <div className="kavm__fnote">{f.note}</div>
            </li>
          ))}
        </motion.ul>
      )}
    </div>
  );
}
