# /masterplan — Valuación Cimatario: datos reales + metadata completa + deploy staging

> Orden no negociable: **SEGURIDAD → CALIDAD → COSTO**. Generado por el orquestador (Opus 4.8).
> Objetivo: ~1000 entradas reales con fuentes + metadata completa; evaluar UI live; publicar en klugger.shnell.mx (STAGING) tras aprobación.

## Estado de datos (2026-07-05)
- **Datasets reales restaurados y commiteados** (commit `413caa6`): `terrenos_enriched.json` (1025 entradas reales de Lamudi, 0 fakes), `terrenos_full_real.json` (659 comps de venta), `terrenos_excluidos.json` (366 renta/ruido). Reemplaza el dataset previo 82% sintético. Tarea 5 completada: 1025 enriquecidas con offer_price, lat/lng, dirección, floor_size, imágenes.

## Diagnóstico (hallazgos que cambiaron el plan)
- Dataset previo "1000" = **824 sintéticos (`example.com`) + 176 nav-links vacíos = 0 reales usables**. **[REEMPLAZADO: ver Estado de datos arriba]**
- Portales MX bloquean scraping: Inmuebles24/Vivanuncios → **403**; Lamudi → **200 desde dev-2** (403 desde Mac).
- Páginas de detalle Lamudi → bloqueadas sin `Referer`; **con Referer → 200 + ld+json `RealEstateListing`** (geo real, floorSize, offer price, address, imágenes).
- Deploy: klugger.shnell.mx es **STAGING**, vía **Cloudflare Pages (branch `testing`)**.

## Tabla de tareas

| # | Tarea | Owner/Modelo | Razón (sec/cal/costo) | Ola ∥ | Deps | Verificación | Estado |
|---|-------|--------------|------------------------|-------|------|--------------|--------|
| 1 | Recon repo + datos + live | **TÚ** (orq.) | lectura sensible del estado | — | — | informe con conteos | ✅ hecho |
| 2 | Rework scraper Lamudi (listado) | **TÚ** (spec claro, sitio vivo) | scraping = sensible, no delegar | — | 1 | 60 reales validados | ✅ hecho |
| 3 | Harvest ~1000 (listado) | **TÚ** | acción de red en vivo | — | 2 | **1025 reales, 0 fakes** | ✅ hecho |
| 4 | Limpieza venta vs renta/ruido | **TÚ** | integridad del comp set | — | 3 | 659 comps limpios (card) | ✅ hecho |
| 5 | Enriquecer metadata completa (detalle) | **TÚ** | red en vivo + re-clean autoritativo | — | 3 | geo+price+addr por listing | ✅ hecho (1025 enriquecidas) |
| 6 | Re-clean con offer_price autoritativo | **TÚ** | rescata mis-parseados → maximiza a ~1000 | — | 5 | conteo limpio final | 🟡 en transform |
| 7 | (Si IP_ROYAL) Inmuebles24/Vivanuncios vía IPRoyal | **TÚ** | proxy = secreto en runtime, sensible | ∥ con 5 | IP_ROYAL | +fuentes, 0 fakes | 🟢 desbloqueado (IPRoyal en Infisical) — pendiente correr |
| 8 | Transform → `terrenos_full.json` (números+coords) | Sonnet | impl. mecánica con spec | Ola A | 6 | schema válido, build ok | 🟡 corriendo (Sonnet) |
| 9 | Eval UI live vs esperado (Gemini Flash ingesta) | Haiku/Gemini | barato, alto volumen | Ola A ∥ | — | transcript diffs | ⬜ |
| 10 | Wire datos+coords reales al mapa/tabla | Sonnet | edición de componente acotada | Ola B | 8 | build local 200 | ⬜ |
| 11 | Actualizar roadmaps (status + evidencias) | Haiku | mecánico | Ola B ∥ | 8 | archivos actualizados | ⬜ |
| 12 | Build static export + deploy Cloudflare Pages (testing) | **TÚ** + humano | **prod-adjacent/irreversible** | final | 10 | HTTP 200 + spot-check | ⬜ (tras aprobación) |

## Gate de smoke tests (prueba positiva, separa "hecho" de "listo")
- [ ] `0` entradas con `example.com`
- [ ] cada entrada: `link` http real + `source` + `price` numérico + `size_m2`
- [ ] enriquecidas: `geo.lat/lng` real + `address` + `offer_price`
- [ ] build `next build` sin errores; ruta `/valuacion-cimatario` responde local
- [ ] diff visual antes de publicar; deploy solo tras aprobación explícita del operador

## Paralelización
- Olas A/B usan **agentes en paralelo** solo en archivos disjuntos (transform vs eval UI vs docs). Wiring del componente = un solo Sonnet (no dos sobre el mismo `.tsx`).
- Todo lo que toca **red en vivo, secretos o deploy = orquestador (TÚ)**, nunca delegado a modelo barato.

## Pendientes del operador (solo humano)
- Subir **`IP_ROYAL`** a Infisical (Vilar-infra / env=prod / path=/) con lectura para la identidad `Claude-agent`.
- Confirmar/aprobar el **deploy a staging** (Cloudflare Pages branch `testing`) tras ver el diff.
