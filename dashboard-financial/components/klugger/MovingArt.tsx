"use client";
// Klugger — Arte en movimiento (K3 · MASTERPLAN-CATALOGO §F). TODO scroll-triggered.
// Regla: el arte lo crea german (assets en R2/public); aquí se CABLEA con GSAP/Framer.
// prefers-reduced-motion: sin scrub ni loops; se muestra el póster/estado estático.
import { useEffect, useRef, useState } from "react";
import { motion, type TargetAndTransition } from "framer-motion";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Icon, UI } from "./icons";
import { FOX_PATHS, FOX_VIEWBOX } from "./foxPaths";

gsap.registerPlugin(ScrollTrigger, useGSAP);
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ── F1+F2+F5 · Hero: el zorro y la ciudad — VIDEO autoplay+loop (funciona en iOS).
   El scroll-scrub de video no pinta frames en iOS Safari → se usa autoplay muted loop
   playsInline (patrón Stripe/Linear). Entrada scroll-triggered (transform/opacity, sí va en iOS). ── */
export function HeroVideo() {
  const root = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  useGSAP(() => {
    if (reduced()) return;
    gsap.from(root.current, { opacity: 0, y: 24, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: root.current, start: "top 88%" } });
  }, { scope: root });
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    v.muted = true;
    const p = v.play();
    if (p && typeof p.catch === "function") p.catch(() => {}); // iOS Low-Power → queda el póster
  }, []);
  return (
    <div className="khv" ref={root}>
      <div className="khv__stage">
        <video ref={vid} className="khv__video" src="/assets/klugger-hero.mp4" poster="/assets/klugger-hero-poster.jpg" muted loop autoPlay playsInline preload="auto" />
        <div className="khv__overlay">
          <p className="khv__tag">El zorro conoce la ciudad.<br />Tú también, con Klugger.</p>
        </div>
      </div>
    </div>
  );
}

/* ── F6 · Line-draw del imagotipo — stroke-dashoffset atado a scroll (scrub) ── */
export function FoxLineDraw() {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    const paths = gsap.utils.toArray<SVGPathElement>(".kdraw path");
    if (reduced()) { gsap.set(paths, { strokeDashoffset: 0, fillOpacity: 1 }); return; }
    paths.forEach((p) => {
      const len = p.getTotalLength();
      gsap.set(p, { strokeDasharray: len, strokeDashoffset: len, fillOpacity: 0 });
    });
    // un disparo que COMPLETA al entrar en viewport (nunca queda a medias)
    gsap.timeline({ scrollTrigger: { trigger: root.current, start: "top 80%", toggleActions: "play none none none" } })
      .to(paths, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut", stagger: 0.08 })
      .to(paths, { fillOpacity: 1, duration: 0.4, ease: "power1.out" }, "-=0.2");
  }, { scope: root });
  return (
    <div className="kdraw" ref={root}>
      <svg viewBox={FOX_VIEWBOX} width={150} height={150} fill="currentColor" stroke="currentColor" strokeWidth={6} strokeLinejoin="round" style={{ color: "var(--accent-2)" }}>
        {FOX_PATHS.map((d, i) => <path key={i} d={d} />)}
      </svg>
      <span className="kdraw__cap">line-draw del imagotipo · scroll dibuja el contorno</span>
    </div>
  );
}

/* ── F4 · Mascota zorro — estados (Framer). Entrada scroll-triggered. ── */
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
        <motion.img src="/assets/klugger-isotipo.svg" alt={`Mascota — ${STATES[s].label}`} width={120} height={120} animate={STATES[s].anim as unknown as TargetAndTransition} />
      </div>
      <div className="kstyle-row" style={{ justifyContent: "center" }}>
        {(Object.keys(STATES) as StateKey[]).map((k) => (
          <button key={k} className="kchip" data-active={s === k} onClick={() => setS(k)}>{STATES[k].label}</button>
        ))}
      </div>
      <p className="kmascot__note">Estados: bienvenida/buscando/éxito/vacío. Slot listo para el Lottie de german.</p>
    </div>
  );
}

/* ── F7 · Marquee de colonias (loop continuo, pausa al hover; sin motion si reduced) ── */
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
