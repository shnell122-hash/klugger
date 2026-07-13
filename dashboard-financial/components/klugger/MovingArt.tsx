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

/* ── F6 · Line-draw del imagotipo — VIDEO real (luz dibuja el contorno + zoom in/out).
   Autoplay+loop (iOS-safe); reproduce cuando entra en viewport. ── */
export function FoxLineDraw() {
  const root = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  useGSAP(() => {
    if (reduced()) return;
    // reproducir al entrar en viewport (scroll-triggered), reiniciar cada vez
    ScrollTrigger.create({
      trigger: root.current, start: "top 82%",
      onEnter: () => { const v = vid.current; if (v) { v.currentTime = 0; v.play?.().catch(() => {}); } },
    });
  }, { scope: root });
  useEffect(() => { const v = vid.current; if (v) { v.muted = true; v.play?.().catch(() => {}); } }, []);
  return (
    <div className="kdraw" ref={root}>
      <video ref={vid} className="kdraw__video" src="/assets/klugger-linedraw.mp4" poster="/assets/klugger-linedraw-poster.jpg" muted loop autoPlay playsInline preload="auto" />
      <span className="kdraw__cap">el contorno de Klugger se dibuja (loader / intro de marca)</span>
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
