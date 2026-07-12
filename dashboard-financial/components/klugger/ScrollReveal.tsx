"use client";
// Klugger — arte en movimiento (catálogo F): reveal/parallax con GSAP + ScrollTrigger.
// Respeta prefers-reduced-motion. Solo transform/opacity (60fps).
import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function ScrollReveal({ children, y = 24 }: { children: ReactNode; y?: number }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, {
          opacity: 0, y, duration: 0.5, ease: "power3.out",
          scrollTrigger: { trigger: el, start: "top 85%", toggleActions: "play none none none" },
        });
      });
    },
    { scope: root }
  );
  return <div ref={root}>{children}</div>;
}
