# /masterplan — Iconografía nativa Klugger (íconos + emojis + iconogramas animados)

> Objetivo: cero emojis del OS (inconsistentes por dispositivo). Todo el sistema con **íconos/emojis/animaciones SVG nativos, consistentes y de marca**, vía la vía más eficiente (librería SVG + emojis self-hosted + iconogramas animados). Craft de animación = Emil (`ux-research/04`).
> Implementa los puntos 1–3 recomendados: (1) UI icons = Lucide (SVG); (2) emojis = SVG open self-hosted (Twemoji); (3) regla de sistema: cero emojis del OS, personalidad = mascota.

## Decisiones (la vía más eficiente y "nativa")
1. **Íconos de UI → `lucide-react`** (SVG inline, MIT, ~1,500 íconos, tree-shakeable, `currentColor` → heredan tema y animaciones). Reemplaza TODOS los emojis del catálogo (🔎→`Search`, ☀️🌓🌑→`Sun/SunMoon/Moon`, ✓→`Check`, ▲→`TrendingUp`, ♥→`Heart`, etc.). **NO Font Awesome** (icon-font pesado, quirks a11y, Pro de paga).
2. **Emojis consistentes → SVG de Twemoji self-hosted** (CC-BY 4.0). Se descargan los pocos que se usan a `public/emoji/` y se sirven local (mismo render en todo OS, sin CDN externo). Componente `<Emoji name>`.
3. **Iconogramas animados → 2 mecanismos:**
   - **Micro (nativo, sin assets): Lucide + Framer Motion** — spinner, heart pulse, check-draw, bell shake. SVG animado con transform/opacity (60fps, Emil).
   - **Mascota / estados (bienvenida/buscando/éxito/vacío): la mascota low-poly** (cartones zorro en `R2 cartones-transparent/`) animada con Framer, y **slot Lottie** para cuando german entregue el .json.
4. **Regla de sistema:** cero `emoji` del OS en componentes. Íconos = Lucide. Emoji-glyph = Twemoji SVG. Personalidad = mascota Klugger. Tokens de tamaño/stroke.

## Tabla de tareas (owner/modelo · ola · verificación)
| # | Tarea | Owner | Ola | Verificación |
|---|---|---|---|---|
| I0 | `lucide-react` + `<Icon>` wrapper (size/stroke/aria/currentColor) + **reemplazar emojis del catálogo** | TÚ + Sonnet | 0 | catálogo sin emojis del OS; íconos heredan tema |
| I1 | **Emoji system**: descargar Twemoji SVG usados → `public/emoji/` + `<Emoji>` | Sonnet + Haiku | 0 ∥ | emoji idéntico en cualquier OS; self-hosted |
| I2 | **Iconogramas animados**: `<AnimatedIcon>` (Lucide+Framer: spin/pulse/draw/shake) + mascota animada (cartón zorro + Framer) + slot Lottie | Sonnet | 1 | animan a 60fps; reduced-motion ok |
| I3 | **Generar SVG de marca** faltantes (vectorizar/curar) + sección **"Iconografía"** en `/style` + **deploy** | TÚ + Sonnet | 1 | `/style` muestra íconos/emojis/animados; live |

## Gate de smoke tests
1. `grep` en componentes = 0 emojis del OS (todo Lucide/Emoji/mascota).
2. Íconos SVG con `currentColor` → cambian con el tema; `aria-label`/`aria-hidden` correctos.
3. Emojis self-hosted (no CDN externo) → mismo render en iOS/Android/Windows.
4. Iconogramas animados a 60fps (transform/opacity), respetan `prefers-reduced-motion`.
5. Build estático ok + deploy a klugger.shnell.mx (`/deploy`).

## Pendientes del operador
- Entregar **Lottie de la mascota** (estados) si se quiere animación vectorial rica; mientras, se anima el cartón PNG.
- Validar el set de íconos de marca (¿algún glyph custom low-poly?).
- Licencias: Lucide (MIT) y Twemoji (CC-BY 4.0) — atribución de Twemoji en el sitio.

## Secuencia
Se ejecuta I0→I3 sobre el K0 ya desplegado. Ref: `MASTERPLAN-CATALOGO.md §B/§E/§F`, `ux-research/04`, skill `/deploy`.
