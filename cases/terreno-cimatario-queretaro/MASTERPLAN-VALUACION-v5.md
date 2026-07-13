# /masterplan v5 (mini) — Pulido final del tab Estudio de Mercado

> Orden: SEGURIDAD → CALIDAD → COSTO. Orquestador: Opus 4.8.
> Base: re-review Gemini 2.5 Flash del staging v4. El tab "Estudio de Mercado" quedó **bueno/exhaustivo/fiel**; restan solo defectos de **pulido de UI** (no datos, no funcionalidad). Alcance mínimo, un solo archivo.

## Diagnóstico (Gemini v4 — solo polish)
1. 🟠 **Sección 8 (Mercado inmobiliario)**: la tabla de listados co-living es larga/densa; la columna "$/m²" tiene formato numérico inconsistente.
2. 🟡 **Secciones 10 y 12**: etiquetas de eje-X **encimadas** en las barras (Inversión; TIR/ROI/HAIV).
3. 🟡 **Sección 11 (Riesgos)**: descripciones en bloque de texto denso → poco legibles.

## Tabla de tareas

| # | Tarea | Owner/Modelo | Razón | Ola | Deps | Verificación | Estado |
|---|-------|--------------|-------|-----|------|--------------|--------|
| 1 | `EstudioMercadoTab.tsx`: paginar/limitar tabla co-living (patrón existente) + formato `$/m²` consistente | Sonnet | UX, archivo único | A | — | build ok; tabla manejable | ⬜ |
| 2 | Ejes-X sin encimar en secc. 10 y 12 (barras horizontales / labels angulados / abreviados) | Sonnet | legibilidad | A | — | labels legibles | ⬜ |
| 3 | Riesgos (secc. 11) en viñetas/estructura, no bloque denso | Sonnet | legibilidad | A | — | riesgos escaneables | ⬜ |
| 4 | Build static export + deploy testing | **TÚ** + humano | prod-adjacent | B | 1-3 | Action verde + 200 | ⬜ (aprobación) |
| 5 | Re-captura + spot-check (orquestador/Gemini) | **TÚ** | verificación | final | 4 | 0 hallazgos de pulido | ⬜ |

## Notas
- Es **un solo archivo** (`EstudioMercadoTab.tsx`) → **un** agente Sonnet, sin paralelización (evita colisión).
- NO tocar `data/estudio-mercado.ts` (datos ya verificados por Opus). Cero cambios de cifras.
- Heredar el sistema de motion (Emil) + `prefers-reduced-motion` ya existente.

## Pendientes del operador (fuera de v5)
- Rotar `GITHUB_PAT_TOKEN` y `GEMINI_API_KEY` (viajaron en el chat).
- Decidir geocodificación de los 179 comps sin coords.
- Proxy IPRoyal válido (user:pass@host:port) para enriquecer los ~811 restantes + Inmuebles24/Vivanuncios.
