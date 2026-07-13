"use client";
// Klugger — Arte en movimiento (K3 · MASTERPLAN-CATALOGO §F).
// Regla: el arte lo crea german (assets en R2/public); aquí se CABLEA con GSAP/Framer.
// Todo respeta prefers-reduced-motion y usa solo transform/opacity (60fps).
import { useRef, useState } from "react";
import { AnimatePresence, motion, type TargetAndTransition } from "framer-motion";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DUR, EASE_OUT } from "@/lib/motion";
import { Icon, UI } from "./icons";
import { FOX_PATHS, FOX_VIEWBOX } from "./foxPaths";

gsap.registerPlugin(ScrollTrigger, useGSAP);
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── F1/F3 · Hero low-poly con entrada + parallax ── */
export function HeroParallax() {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (reduced()) return;
    gsap.from(".khp__img", { scale: 1.08, opacity: 0, duration: 0.9, ease: "power3.out" });
    gsap.from(".khp__pill", { y: 18, opacity: 0, duration: 0.6, delay: 0.25, ease: "power3.out" });
    gsap.to(".khp__img", {
      yPercent: 10, ease: "none",
      scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: true },
    });
  }, { scope: root });
  return (
    <div className="khp" ref={root}>
      <div className="khp__frame">
        <img className="khp__img" src="/assets/hero-cdmx-v1.jpg" alt="CDMX low-poly (hero v1)" />
        <div className="khp__pill"><Icon as={UI.Search} size={16} /> <span>Encuentra tu lugar en la ciudad</span></div>
      </div>
    </div>
  );
}

/* ── F2 · Scroll-storytelling: el zorro recorre el mapa (pin + scrub) ── */
const BEATS = ["Explora la ciudad", "Filtra por lo que importa", "Verifica cada propiedad", "Decide con confianza"];
export function FoxScrollStory() {
  const root = useRef<HTMLDivElement>(null);
  const [beat, setBeat] = useState(0);
  useGSAP(() => {
    if (reduced()) return;
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: root.current, start: "top top", end: "+=1100", scrub: 0.6, pin: true,
        onUpdate: (self) => setBeat(Math.min(BEATS.length - 1, Math.floor(self.progress * BEATS.length))),
      },
    });
    tl.fromTo(".kfox__runner", { left: "3%", rotate: -4 }, { left: "86%", rotate: 4, ease: "none" })
      .to(".kfox__runner", { y: -16, duration: 0.5, yoyo: true, repeat: 7, ease: "sine.inOut" }, 0);
  }, { scope: root });
  return (
    <div className="kfox" ref={root}>
      <img className="kfox__map" src="/assets/hero-cdmx-v1.jpg" alt="" aria-hidden />
      <img className="kfox__runner" src="/assets/klugger-isotipo.svg" alt="Zorro Klugger recorriendo el mapa" />
      <div className="kfox__cap">
        <span className="kfox__step">{String(beat + 1).padStart(2, "0")}</span>
        <AnimatePresence mode="wait">
          <motion.span key={beat} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: DUR.hover, ease: EASE_OUT }}>{BEATS[beat]}</motion.span>
        </AnimatePresence>
      </div>
      <div className="kfox__hint">↓ scroll</div>
    </div>
  );
}

/* ── F6 · SVG line-draw del imagotipo (stroke-dashoffset con GSAP) ── */
export function FoxLineDraw() {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (reduced()) return;
    const paths = gsap.utils.toArray<SVGPathElement>(".kdraw path");
    paths.forEach((p) => {
      const len = p.getTotalLength();
      gsap.set(p, { strokeDasharray: len, strokeDashoffset: len, fillOpacity: 0 });
      gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 82%" } })
        .to(p, { strokeDashoffset: 0, duration: 1.2, ease: "power2.inOut" })
        .to(p, { fillOpacity: 1, duration: 0.4, ease: "power1.out" }, "-=0.25");
    });
  }, { scope: root });
  return (
    <div className="kdraw" ref={root}>
      <svg viewBox={FOX_VIEWBOX} width={140} height={140} fill="currentColor" stroke="currentColor" strokeWidth={5} strokeLinejoin="round" style={{ color: "var(--accent-2)" }}>
        {FOX_PATHS.map((d, i) => <path key={i} d={d} />)}
      </svg>
      <span className="kdraw__cap">line-draw del imagotipo · stroke-dashoffset (GSAP)</span>
    </div>
  );
}

/* ── F4 · Mascota zorro — estados (Framer; slot para Lottie de german) ── */
const STATES = {
  idle: { label: "Bienvenida", anim: { y: [0, -6, 0], transition: { repeat: Infinity, duration: 2.4, ease: "easeInOut" } } },
  buscando: { label: "Buscando", anim: { rotate: [-4, 4, -4], transition: { repeat: Infinity, duration: 1.2, ease: "easeInOut" } } },
  exito: { label: "Éxito", anim: { scale: [1, 1.12, 1], transition: { repeat: Infinity, duration: 1.1, ease: "easeInOut" } } },
  vacio: { label: "Vacío", anim: { opacity: [1, 0.5, 1], transition: { repeat: Infinity, duration: 1.8, ease: "easeInOut" } } },
} as const;
type StateKey = keyof typeof STATES;
export function FoxMascot() {
  const [s, setS] = useState<StateKey>("idle");
  return (
    <div className="kmascot">
      <div className="kmascot__stage">
        <motion.img src="/assets/klugger-isotipo.svg" alt={`Mascota — ${STATES[s].label}`} width={120} height={120} animate={STATES[s].anim as TargetAndTransition} />
      </div>
      <div className="kstyle-row" style={{ justifyContent: "center" }}>
        {(Object.keys(STATES) as StateKey[]).map((k) => (
          <button key={k} className="kchip" data-active={s === k} onClick={() => setS(k)}>{STATES[k].label}</button>
        ))}
      </div>
      <p className="kmascot__note">Mientras german entrega el Lottie, la mascota se anima desde el imagotipo (Framer).</p>
    </div>
  );
}

/* ── F7 · Marquee de colonias (CSS loop, pausa al hover) ── */
const COLONIAS = ["Condesa", "Roma Norte", "Polanco", "Coyoacán", "Del Valle", "Nápoles", "San Ángel", "Juárez", "Narvarte", "Santa Fe", "Xochimilco", "Escandón"];
export function Marquee() {
  return (
    <div className="kmarq" aria-label="Colonias">
      <div className="kmarq__track">
        {[...COLONIAS, ...COLONIAS].map((c, i) => (
          <span key={i} className="kmarq__item"><Icon as={UI.MapPin} size={13} /> {c}</span>
        ))}
      </div>
    </div>
  );
}
