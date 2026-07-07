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

---

## Hallazgos (ejecución — timestamps UTC)

- **~02:00** IPRoyal (bloqueo heredado de v8) **resuelto**: las credenciales del proxy estaban en el **comentario** de `IP_ROYAL_LA_API_TOKEN` (no en `IP_ROYAL`, que era el token equivocado → 401). Proxy `geo.iproyal.com:12321`, salida residencial MX, rotando IP. Validado: Lamudi detalle vía proxy → HTTP 200 con ld+json + geo.
- **~02:00** Conectividad establecida **Mac → turazive (jumphost, `sugus` 10.8.0.2) → dev-2 (10.8.0.13)** vía ProxyJump; Infisical (Vilar-infra `a9fa59c9…`, env=staging) accesible.
- **~02:20** Data-quality: el "~811 comps por enriquecer" era info **pre-v8 obsoleta**. El dataset ya estaba enriquecido (1,439/1,439 con address). Los 21 "sin coords" resultaron **fuera de mercado** (Durango, Chihuahua, Pedro Escobedo). Excluidos por la guarda ≤50 km de `SCORING-SPEC §0.2` → **1,439 → 1,418** comps QRO-metro limpios. Re-scoring desplegado (`265a7a9`); validación vs spec §6 OK.
- **~03:30** DD: `due-dilligence1.md` = **8 documentos** que cierran los 6 P0 (escritura 4,652 / DUS202104552 CUS / FUS202000221 fusión / predial 1121400 / folios RPP / factibilidades).
- **~03:37** Tab **📋 Due Diligence** implementado (`DueDiligenceTab.tsx`, autoría inline por entorno cross-host), cableado al nav al final. Build **verde**; deploy `994916a` **success**; `/valuacion-cimatario/` **HTTP 200**.
- **~03:48** QA: verificación por grep de chunks **no concluyente** (el componente carga on-demand vía runtime de webpack, no está en el HTML inicial). Pruebas positivas del ship: build verde + Action success + 200. **Pendiente**: QA visual con Gemini/puppeteer (PIN 1206) para confirmar render en pantalla.

## Decisiones tomadas en la ejecución
- Excluir los 21 out-of-market en vez de geocodificarlos a la fuerza (evita meter ruido de otros estados al mapa/scoring). Alineado con la guarda del propio modelo.
- Autoría inline del tab DD (no subagente Sonnet): el `Agent` tool corre en la Mac (rama `main`, sin el código del dashboard); el dashboard vive en `testing`/clone dev-2 → delegar tenía más fricción que valor para un solo componente.
- Inmuebles24/Vivanuncios: **no** perseguidos (403 DataDome aun vía proxy); marcados como sub-ola de Playwright, no indispensable.
