# §1b — Craft de UI/animaciones de clase mundial: reglas accionables (Emil Kowalski + Linear/Vercel/Family)

> Fuentes: [Great Animations — emilkowal.ski](https://emilkowal.ski/ui/great-animations) · [Building a Toast Component](https://emilkowal.ski/ui/building-a-toast-component) · [The Magic of Clip-Path](https://emilkowal.ski/ui/the-magic-of-clip-path) · [animations.dev](https://animations.dev/) · [emil-design-eng SKILL](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md) · [Rauno — Interaction Design](https://rauno.me/craft/interaction-design) · [How is Linear so fast](https://performance.dev/how-is-linear-so-fast-a-technical-breakdown) · [vercel-labs web-animation-design SKILL](https://github.com/vercel-labs/open-agents/blob/main/.agents/skills/web-animation-design/SKILL.md)

---

## (a) Reglas de oro de animación (Emil Kowalski)

**1. Duración — techo duro y rangos.** Regla maestra: **casi todo < 300ms**.

| Interacción | Duración |
|---|---|
| Button press / feedback | **100–160ms** |
| Hover / color transition | ~150ms |
| Tooltip, popover pequeño | 125–200ms |
| Dropdown, select | 150–250ms |
| Modal / drawer / bottom-sheet | 200–500ms (drawer iOS Vaul ≈ 500ms) |
| Stagger entre items de lista | 30–80ms de delay |
| Toast | ~400ms (Sonner) |
| Regla general | mantener < 300ms; a más distancia recorrida, más duración |

**2. Easing.**
- **`ease-out` = default de UI** (arranca rápido, desacelera): entradas y casi toda acción del usuario.
- **`ease-in-out`** solo para movimiento *dentro* de pantalla (A→B de algo ya visible).
- **`ease`** para hover/color.
- **`ease-in` PROHIBIDO en UI** (se siente pesado/sluggish).
- **`linear`** solo para velocidad constante real (marquees, spinners).

Curvas custom (copiar):
```
Ease-out fuerte (entradas):        cubic-bezier(0.23, 1, 0.32, 1)
Ease-in-out fuerte (movimiento):   cubic-bezier(0.77, 0, 0.175, 1)
Drawer estilo iOS (Vaul/Ionic):    cubic-bezier(0.32, 0.72, 0, 1)
```

**3. Spring — por qué se siente natural.** Nada real aparece/desaparece instantáneo; el spring imita física (stiffness/damping/mass).
```
Apple (recomendada):   { type: "spring", duration: 0.5, bounce: 0.2 }
Física tradicional:    { type: "spring", mass: 1, stiffness: 100, damping: 10 }
```
`bounce` sutil (0.1–0.3). Ideal para gestos/drag; evita bounce llamativo en UI "seria".

**4. Propósito — cuándo NO animar.**
- Acción 100+ veces/día (teclado, command palette) → **sin animación**.
- Decenas/día → reducir o quitar. Ocasional → estándar. Rara/primera vez → permitido "delight".
- La animación debe **orientar** (de dónde viene, hacia dónde va), no decorar.

**5. Nunca animar desde cero.**
```
❌ transform: scale(0)                → aparece de la nada
✅ transform: scale(0.95); opacity: 0  → nada real desaparece del todo
```

**6. Interrumpibilidad (clave del "feel" caro).** Los **CSS keyframes NO son interrumpibles**; las **CSS transitions SÍ** (re-apuntan aun antes de terminar). Para cosas re-disparables (toasts, hover, drag) usa transitions o Framer Motion. Nunca bloquees al usuario esperando una animación.

**7. Timing asimétrico (entrada ≠ salida).** Aparecer = instantáneo/rápido; desaparecer un poco más lento (~150ms fade). La salida ~20% más rápida cuando es acción deliberada.

**8. Performance (no negociable).**
- Animar **solo `transform` y `opacity`.**
- Nunca `width/height/margin/padding/top/left` (layout thrashing).
- `will-change: transform`; `clip-path` es hardware-accelerated (reveals sin layout shift).
- CSS/WAAPI corren fuera del main thread → 60fps aun con JS ocupado.
- En Framer Motion usa `transform: "translateX(100px)"`, no el shorthand `x: 100`, para garantizar HW.
- Truco Sonner/Vaul: `translateY(100%)` mueve por el propio tamaño del elemento.

**9. Accesibilidad.**
- `@media (prefers-reduced-motion: reduce)`: quita movimiento/posición, **conserva opacity y color**.
- Nunca dependas solo del movimiento para comunicar estado.
- Gate de hover en touch: `@media (hover: hover) and (pointer: fine)`.

---

## (b) Catálogo de micro-interacciones con specs

**Botón (press/hover)**
```css
.button:active { transform: scale(0.97); }   /* 0.95–0.98 */
.button { transition: transform 160ms ease-out; }
```

**Toast (Sonner):** `transition: transform 400ms ease`; entra/sale con `translateY(100%)↔0`; auto-dismiss 4s, pausar en hover/pestaña oculta; stacking escala `1 - 0.05*index`, offset `-14px*index`; swipe-to-dismiss si `velocity > 0.11` o distancia > threshold; CSS transitions (no keyframes).

**Drawer / bottom-sheet (Vaul):** curva iOS; oculto en `translateY(100%)`; dismiss por momentum `velocity > 0.11`; damping en bordes; `setPointerCapture()` al iniciar drag.

**Popover / dropdown (origin-aware):** `transform-origin` = esquina del trigger (**sale de donde lo tocaste**); modales mantienen origin center; entrada `scale(0.97)+opacity:0 → 1`, 125–200ms.

**Tooltip:** inicial `scale(0.97)+opacity:0`; skip-delay en hovers subsecuentes (2º tooltip instantáneo).

**Skeleton/loading & Optimistic UI:** preferir **optimistic UI** a spinners (escribe local, re-render síncrono, encola request); skeleton solo para carga real inevitable.

**List reordering / stagger:** 30–80ms entre items; layout animations con transform, no re-flow.

**Reveals / theme switch:** `clip-path: inset(...)` animado (evita layout shift; contenido ya está, solo se recorta).

**Principios (Rauno):** Follow-Through & Overlapping Action (no todo frena a la vez); **robustez > delight** (scroll/input/nav deben funcionar siempre); prototipar en código; gestos mapeados a metáforas físicas.

---

## (c) Checklist "se siente caro" nivel Linear
- [ ] **Duraciones bajo el promedio.** Tokens Linear: quick 100ms, highlight fade-out 150ms, regular 250ms, slow 350ms. Nunca "una sola duración".
- [ ] **Timing asimétrico:** hover/popovers/paneles **aparecen instantáneos**, **se desvanecen en 150ms**.
- [ ] **Optimistic UI en toda mutación** (re-render síncrono desde estado local; server sincroniza en background). Cero spinners.
- [ ] **Grid de 4px estricto** (padding/margin/icon/text múltiplos de 4). Espaciado inconsistente = se ve barato.
- [ ] **Keyboard-first:** ⌘K abre command palette sobre store local (sin red); **no animar** estas acciones.
- [ ] **Prefetch agresivo:** `modulepreload`; service worker precachea ~1,200 assets tras login.
- [ ] **`transition: all` prohibido** → especificar la propiedad.
- [ ] **Nada entra desde `scale(0)`; nada usa `ease-in`; nada > 300ms sin razón de distancia.**
- [ ] **Interrumpibilidad** en todo lo re-disparable.
- [ ] **`prefers-reduced-motion`** respetado conservando opacity/color.
- [ ] **Consistencia > singularidad:** la calidad es la suma de micro-refinamientos invisibles.

---

## Aterrizaje para Next.js + Framer Motion

**Tokens CSS (globals.css)**
```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
  --dur-quick: 100ms; --dur-hover: 150ms; --dur-base: 250ms; --dur-slow: 350ms;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation: none !important; }
}
```

**Framer Motion**
```tsx
// Botón: press asimétrico
<motion.button whileTap={{ scale: 0.97 }} transition={{ duration: 0.16, ease: [0.23,1,0.32,1] }} />

// Panel/popover origin-aware
const variants = {
  hidden: { opacity: 0, scale: 0.97 },
  show:   { opacity: 1, scale: 1, transition: { duration: 0.2, ease: [0.23,1,0.32,1] } },
  exit:   { opacity: 0, scale: 0.97, transition: { duration: 0.15 } }, // salida más rápida
};

// Drawer/sheet con spring Apple
transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}

// Lista con stagger
transition={{ staggerChildren: 0.05 }}
```
- Usa `transform: "translateY(100%)"` (no `y`) donde necesites GPU garantizada.
- Toasts/drawers: usa **Sonner** y **Vaul** directamente (ya implementan interrupción, velocity 0.11, damping, pausa de timer). No reimplementar.
- Envuelve rutas con `AnimatePresence`; respeta `useReducedMotion()`.
- No animes el command palette / atajos de teclado.

*Nota de fuente: las skills derivadas (Emil `emil-design-eng`, vercel-labs `web-animation-design`, `leadgenjay/design-motion-principles`) coinciden en los mismos números — destilaciones del curso de Emil y de los internals de Sonner/Vaul.*
