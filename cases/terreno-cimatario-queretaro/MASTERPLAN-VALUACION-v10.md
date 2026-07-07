# /masterplan v10 — Due Diligence resuelto → tab en dashboard + cierre de pendientes

> Orden: SEGURIDAD → CALIDAD → COSTO. Orquestador: Opus 4.8.
> Motiva: german cerró los **6 P0 de due diligence** (el mayor bloqueante del cierre según el GTM) y entregó la transcripción legal (`due-dilligence1.md`, 8 documentos). v10 lo integra al producto y lanza los pendientes ejecutables de masterplans previos.
> Regla de datos: **cero invención** — todo dato legal sale textual de `due-dilligence1.md`.

---

## Contexto — qué cambió

Los P0 de DD que el `MASTERPLAN-GTM-DESARROLLADORES.md` marcaba como *"el mayor bloqueante, fuera de código"* están **RESUELTOS**. Mapeo a los 8 documentos transcritos:

| P0 | Estado | Fuente en `due-dilligence1.md` |
|----|--------|-------------------------------|
| Escritura | ✅ No. 4,652 (16-dic-2020, Not. 2 SJR) · COMANESP · René Adrián Villar Barajas | Doc 1 |
| Libertad de gravamen | ✅ folios RPP 424746/2 y 334088/3 | (folios en Doc 1) |
| Uso de suelo / CUS | ✅ Dictamen DUS202104552 · 300 hab/ha · 12 niveles viables | Doc 2 + Doc 8 |
| Fusión de lotes | ✅ FUS202000221 + sello Catastro · 420+240 = 660 m² | Doc 1 + Doc 7 |
| Factibilidades (agua/drenaje/CFE) | ✅ factibles | — |
| Predial | ✅ recibo pagado · clave 140100107016016 | Doc 4 |

---

## Tabla de tareas

| # | Tarea → Subtareas | Owner/Modelo | Razón | Ola ∥ | Deps | Verificación |
|---|-------------------|--------------|-------|-------|------|--------------|
| 1 | **Leer `due-dilligence1.md`** (8 docs) y mapear a los 6 P0 | **TÚ** | fidelidad legal | 0 | — | 6 P0 con documento fuente identificado ✅ |
| 2 | **Tab `📋 Due Diligence`** en dashboard: nuevo `DueDiligenceTab.tsx` (6 P0 con status, ficha registral/catastral, link a transcripción) + nav item al final + wiring en `ValuacionDashboard.tsx` | **TÚ** (autoría inline; entorno cross-host testing) | criterio + integración | 1 | 1 | build verde; tab renderiza; datos textuales ✅ |
| 3 | **Incorporar DD en `MASTERPLAN-GTM-DESARROLLADORES.md`** (veredicto Parte 1, P0 → ✅, pendiente de operador 2 → resuelto) | **TÚ** | consistencia doc | 1 ∥ | 1 | referencias a los 6 P0 + link a transcript ✅ |
| 4 | **Build + commit + push `testing`** → Cloudflare Pages | **TÚ** | prod-adjacent | final | 2 | Action verde; `/valuacion-cimatario` 200 |
| 5 | **QA visual del tab DD** (spot-check / Gemini) | **TÚ** | verificación | final | 4 | tab visible con 6 P0 + ficha + link |

## Pendientes de masterplans previos — estado de lanzamiento

| Pendiente (origen) | ¿Lanzable ahora? | Acción en v10 |
|--------------------|------------------|----------------|
| **IPRoyal / enriquecimiento** (v8/v9) | ✅ **RESUELTO esta sesión** | Proxy MX validado (creds en comentario de `IP_ROYAL_LA_API_TOKEN`); dataset limpiado 1439→1418 (excluidos 21 fuera de mercado); re-scoring desplegado (`265a7a9`). |
| **Due Diligence tab** (nuevo) | ✅ | Ejecutado (Tareas 2-4). |
| **Validar pesos del scoring** (v9 T1) | ⛔ operador | `SCORING-VALIDATION.md` listo (6 decisiones); espera firma de german. |
| **QA Gemini del build** (v9 T7) | ✅ | Corre tras el deploy de v10. |
| **Inmuebles24/Vivanuncios → ≥1,800** (v9) | ⚠️ duro | 403 con DataDome aun vía proxy; requiere browser headless (Playwright). Sub-ola aparte, no indispensable. |
| **Reconciliar `main`↔`testing`** (v7-v9) | ⛔ operador / irreversible | Diferido por decisión de german; solo se planea. |
| **GTM a desarrolladores** (dossier/outreach) | ⛔ requiere aprobación | Propuesta; no lanzado. DD resuelto lo desbloquea del lado legal. |

## Gate de smoke tests
1. `DueDiligenceTab.tsx` compila; `npm run build` verde; `/valuacion-cimatario` en la lista de rutas.
2. Tab `📋 Due Diligence` aparece al final del nav y renderiza los 6 P0 + ficha registral + link a `due-dilligence1.md`.
3. Todo dato legal del tab es textual de la transcripción (0 invención).
4. GTM doc refleja los 6 P0 como ✅ con sus documentos fuente.
5. Action verde; deploy Cloudflare; HTTP 200.

## Pendientes del operador
- **Firmar `SCORING-VALIDATION.md`** (6 decisiones de pesos) — sigue siendo la decisión #1 abierta.
- **Decidir Inmuebles24/Vivanuncios** (invertir en Playwright vs 1,418 Lamudi ya suficientes).
- **Aprobar reconciliación `main`↔`testing`** (irreversible).
- **Aprobar el GTM** (dossier/outreach) ahora que el DD ya no bloquea.
- (Opcional) rotar la machine identity de Infisical usada en la sesión.
