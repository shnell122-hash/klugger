// Klugger — primitivas de animación (Emil Kowalski, ux-research/04)
// Reglas: <300ms, ease-out default, ease-in prohibido, salida ~20% más rápida, interrumpible.
import type { Transition, Variants } from "framer-motion";

export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

export const DUR = { quick: 0.1, hover: 0.15, base: 0.25, slow: 0.35 } as const;

/** Entrada/salida asimétrica para paneles, popovers, cards. */
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { opacity: 1, scale: 1, transition: { duration: DUR.base, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.97, transition: { duration: DUR.hover, ease: EASE_OUT } },
};

/** Fade + slide sutil (secciones, listas). Nunca desde scale(0). */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.base, ease: EASE_OUT } },
  exit: { opacity: 0, y: 8, transition: { duration: DUR.hover, ease: EASE_OUT } },
};

/** Contenedor con stagger (30–80ms). */
export const stagger = (delay = 0.05): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: delay } },
});

/** Press de botón (asimétrico: press deliberado, release rápido). */
export const pressTap = { scale: 0.97 };
export const pressTransition: Transition = { duration: 0.16, ease: EASE_OUT };

/** Spring estilo Apple para gestos/drawers. */
export const springApple: Transition = { type: "spring", duration: 0.5, bounce: 0.2 };
