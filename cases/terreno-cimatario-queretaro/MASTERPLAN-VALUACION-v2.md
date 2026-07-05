# /masterplan v2 — QA visual del staging desplegado + correcciones y re-deploy

> Orden no negociable: **SEGURIDAD → CALIDAD → COSTO**. Orquestador: Opus 4.8.
> Base: auditoría con **Gemini 2.5 Flash** (vision agent) sobre 4 capturas del staging
> vivo `klugger.shnell.mx/valuacion-cimatario` (tras PIN 1206), con los 537 comps reales ya desplegados.
> Objetivo: corregir los defectos visibles y re-desplegar a `testing` → verificar con nueva pasada de Gemini.

## Diagnóstico (hallazgos de Gemini + operador)
1. 🔴 **KPIs con formato roto** — "Precio asking $7,000,00 0.00" cortado/wrap; falta separador de miles en varios KPIs y en la pro-forma. (`KPICard.tsx`, `ValuacionTab.tsx`, `HbuTab.tsx`)
2. 🔴 **Mapa sin coords reales** — las propiedades NO están conectadas; el componente inventa posiciones (scatter). Confirmado por el operador. (`HbuTab.tsx` → `propertyPoints`, `MapboxMap.tsx`)
3. 🟠 **Charts vacíos** — "Vector de precios / valor implícito" (Valuación), "Histograma de precios" y "Scatter Precio vs m² + OLS" (Base de Datos) no renderizan con los 537 comps. (`ValuacionTab.tsx`, `DatabaseTab.tsx`)
4. 🟠 **Bug COS/CUS** — infla ROI / subvalúa construcción (VPN −$4.6M, ROI 4%). (`HbuTab.tsx` pro-forma)
5. 🟠 **Tabla comps: `vs Asking` engañoso** — porcentajes negativos extremos sin explicación. (`CompsTable.tsx`)
6. 🟡 **Pro-forma sin formato de miles** + 🔵 numeración de fases inconsistente (Marketing) + 🔵 "6.5 meses" tipografía dispar.

## Arquitectura relevante
Staging = rama **`testing`** (refactorizada: wrapper + `components/*Tab.tsx`). Se trabaja sobre un clon de `testing`, **no** sobre `main`. Deploy: push a `testing` → GitHub Action → Cloudflare Pages.

## Tabla de tareas

| # | Tarea | Owner/Modelo | Razón (sec/cal/costo) | Ola ∥ | Deps | Verificación | Estado |
|---|-------|--------------|------------------------|-------|------|--------------|--------|
| 0 | Clonar `testing` (write token) + QA vision (Gemini) | **TÚ** (orq.) | secreto/red en vivo | — | — | 4 capturas + findings JSON | ✅ hecho |
| 1 | Fix `ValuacionTab.tsx` + `KPICard.tsx` + `CompsTable.tsx` (formato KPI, chart vector, columna vs-Asking) | Sonnet | impl. acotada, archivos propios | **A** | 0 | tsc ok; chart con datos | 🟡 |
| 2 | Fix `DatabaseTab.tsx` (histograma + scatter OLS con 537 comps) | Sonnet | impl. acotada, archivo propio | **A** ∥ | 0 | tsc ok; charts poblados | 🟡 |
| 3 | Fix `HbuTab.tsx` (+`MapboxMap.tsx`): wire lat/lng reales al mapa + bug COS/CUS + formato pro-forma | Sonnet | correctness sutil (fórmula) + mapa | **A** ∥ | 0 | tsc ok; puntos = coords reales; ROI coherente | 🟡 |
| 4 | Build static export (`NEXT_STATIC_EXPORT=true`) del clon testing | **TÚ** | gate previo a deploy | B | 1,2,3 | `out/` generado sin errores | ⬜ |
| 5 | Push a `testing` → deploy Cloudflare Pages | **TÚ** + humano | prod-adjacent/irreversible | final | 4 | Action verde + 200 | ⬜ |
| 6 | Re-captura + re-review Gemini (confirmar fixes) | **TÚ** + Haiku/Gemini | verificación adversarial | final | 5 | findings v2 sin críticos | ⬜ |

## Reglas de paralelización
- Ola A = 3 Sonnet en **archivos disjuntos** (Valuación / Base de Datos / HBU). `KPICard.tsx` lo edita **solo** T1 (los demás lo consumen). **Nadie** edita `data/comps.ts` ni `terrenos_full.json`; si la causa raíz está ahí, se reporta y el orquestador reconcilia.
- Build, push y deploy = **orquestador (TÚ)**, nunca delegado.

## Gate de smoke tests (prueba positiva)
- [ ] `tsc --noEmit` sin errores nuevos en los 3 tabs.
- [ ] `next build` con `NEXT_STATIC_EXPORT=true` → `out/` sin errores.
- [ ] Mapa: los puntos coinciden con lat/lng reales (no scatter).
- [ ] Charts (vector, histograma, scatter) muestran los 537 comps.
- [ ] KPIs sin corte, con separador de miles.
- [ ] Re-review Gemini: 0 hallazgos críticos de formato/charts/mapa.

## Pendientes del operador
- Aprobar el deploy final a `testing`.
- Rotar el `GITHUB_PAT_TOKEN` y el `GEMINI_API_KEY` que viajaron en el chat.
