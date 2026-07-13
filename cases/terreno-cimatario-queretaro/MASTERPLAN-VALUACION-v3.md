# /masterplan v3 — Fixes de render + capa de diseño/animación (principios Emil Kowalski)

> Orden no negociable: **SEGURIDAD → CALIDAD → COSTO**. Orquestador: Opus 4.8.
> Base: re-review Gemini 2.5 Flash del staging v2 + ground-truth visual del orquestador.
> Objetivo: cerrar los 2 defectos funcionales que sobrevivieron a v2 y subir el **craft** de UI
> (motion + micro-interacciones) siguiendo los principios de **Emil Kowalski** ("Animations on the Web", Sonner/Vaul).
> Stack disponible: `framer-motion ^11.12.0` ya instalado, Tailwind, Recharts.

## Diagnóstico (qué sobrevivió a v2)
1. 🔴 **Histograma + Scatter OLS no dibujan** (`DatabaseTab.tsx`): ejes y OLS (n=549, R²=0.555) se computan, pero **barras/puntos no se pintan**. Bug de binding/animación/container, no de datos.
2. 🟠 **Tabla de Valuación = volcado de 537 filas** (`ValuacionTab.tsx` + `CompsTable.tsx`): T1 (v2) metió las 537 sin paginar. El tab Base de Datos **ya** pagina (25/pág) — copiar ese patrón.
3. 🟡 **Falta capa de motion/craft**: sin transiciones de tab, sin micro-interacciones en KPIs/tabs/botones, sin `prefers-reduced-motion`.

## Principios de motion/design (Emil Kowalski) — aplicar en TODO cambio de UI
1. **Propósito, no decoración**: animar para comunicar cambio de estado o relación espacial. Si no ayuda, se quita.
2. **Easing**: `ease-out` al entrar (rápido→asienta), `ease-in` al salir; nada de `linear` salvo loops. Preferir cubic-bezier/springs.
3. **Duración corta**: 150–300 ms UI general; lo pequeño se mueve más rápido. Nada lento/pesado.
4. **Performance**: animar **solo `transform` y `opacity`** (GPU). Nunca `width/height/top/left` (reflow).
5. **Springs** (framer-motion) para lo interactivo/natural.
6. **Accesibilidad**: honrar `prefers-reduced-motion` (MotionConfig `reducedMotion="user"` o media query) — desactivar/atenuar.
7. **Micro-interacciones**: hover lift, press `scale .98`, feedback sutil; stagger en listas; transición de números.
8. **Origen del movimiento**: la animación nace del elemento que la dispara (indicador de tab que se desliza).
9. **Interrumpible**, no bloquea interacción.
10. **Restraint + consistencia**: un solo lenguaje de motion; es una herramienta de datos, no over-animar.

## Tabla de tareas

| # | Tarea | Owner/Modelo | Razón | Ola ∥ | Deps | Verificación | Estado |
|---|-------|--------------|-------|-------|------|--------------|--------|
| 1 | `DatabaseTab.tsx`: **fix render** de histograma+scatter (que dibujen barras/puntos con los 537/549) + enter-animation sutil ease-out | Sonnet | correctness de viz | **A** | — | build ok; barras/puntos visibles | 🟡 |
| 2 | `ValuacionTab.tsx`+`CompsTable.tsx`: **paginar** la tabla (patrón de Base de Datos, 25/pág, búsqueda) + micro-interacciones de fila | Sonnet | UX/correctness | **A** ∥ | — | build ok; tabla paginada | 🟡 |
| 3 | **Design system / motion** (Emil): `KPICard.tsx` (entrada stagger + hover lift + tabular-nums + count-up), nav de tabs con indicador animado + crossfade, `globals.css` + `MotionConfig` reduced-motion | Sonnet | craft/consistencia | **A** ∥ | — | build ok; motion consistente; reduced-motion respetado | 🟡 |
| 4 | Build static export del clon testing | **TÚ** | gate pre-deploy | B | 1,2,3 | `out/` sin errores | ⬜ |
| 5 | Push a `testing` → deploy Cloudflare Pages | **TÚ** + humano | prod-adjacent | final | 4 | Action verde + 200 | ⬜ (tras aprobación) |
| 6 | Re-captura + re-review Gemini | **TÚ** + Gemini | verificación | final | 5 | 0 críticos de render/UX | ⬜ |

## Reglas de paralelización (archivos disjuntos)
- T1 = `DatabaseTab.tsx`. T2 = `ValuacionTab.tsx` + `CompsTable.tsx`. T3 = `KPICard.tsx` + `ValuacionDashboard.tsx` (wrapper/nav) + `app/globals.css`.
- `KPICard.tsx` lo edita **solo T3** (los demás lo consumen). Nadie toca `data/*` ni `terrenos_full.json`.
- Cada agente aplica los 10 principios de Emil dentro de sus archivos; T3 dueño del sistema compartido (tokens de motion + reduced-motion).
- Build, push, deploy = orquestador.

## Gate de smoke tests
- [ ] `next build` (`NEXT_STATIC_EXPORT=true`) → `out/` sin errores.
- [ ] Histograma con barras + scatter con puntos + línea OLS visibles.
- [ ] Tabla Valuación paginada (no 537 de golpe).
- [ ] Transiciones de tab + hover de KPIs suaves (transform/opacity, 150–300ms, ease-out).
- [ ] `prefers-reduced-motion: reduce` desactiva/atenúa animaciones.
- [ ] Re-review Gemini sin críticos de render/UX.

## Pendientes del operador
- Aprobar deploy final a `testing`.
- Rotar `GITHUB_PAT_TOKEN` y `GEMINI_API_KEY` (viajaron en el chat).
