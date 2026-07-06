# /masterplan v6 — Cuestionamiento UI/UX + valuación con datos reales + HBU/HBV rehecho (topología + render)

> Orden: SEGURIDAD → CALIDAD → COSTO. Orquestador: Opus 4.8.
> Motiva: feedback de german (puntos 6-12) + principios **Emil Kowalski** + investigación de metodología HBU.
> Regla de datos: **cero alucinación**; cifras citan fuente (comps reales o estudio 2023).
> **Dos olas por dependencia de credenciales**: Ola 1 no necesita llaves; Ola 2 necesita FAL / Google Places / IPRoyal (ver "Requerimientos del operador").

---

## PARTE A — Cuestionamiento UI/UX (Emil Kowalski) — ¿experiencia, orden, colores?

**¿Quién es el usuario?** Un inversionista / audiencia de pitch que necesita: (1) el veredicto de valor, (2) por qué (mercado + mejor uso), (3) la evidencia. Hoy el dashboard es un *tour de features*, no una *narrativa de decisión*.

| # | Cuestión | Estado actual | Decisión |
|---|----------|---------------|----------|
| A1 | **Orden de tabs** ¿cuenta la historia? | Valuación · Base de Datos · Estudio · Marketing · **HBU/HBV (casi al final)** · Agentes | Reordenar a narrativa de inversión: **Valuación (resumen ejecutivo) → Estudio de Mercado (contexto) → HBU/HBV (mejor uso) → Base de Datos (evidencia) → Marketing → Agentes.** HBU es análisis core, no va después de Marketing. |
| A2 | **Header repetido** | "Terreno 660 m² — Cimatario" se repite en cada tab (redundante, lo notó Gemini) | Header persistente único (fuera del switch de tabs). |
| A3 | **Sistema de color** ¿es correcto/consistente? | Dos verdes distintos (#10b981 y #00FF66) + violeta #7c3aed + naranjas/cream sin semántica clara | **Paleta disciplinada**: 1 verde primario, violeta como acento de datos, **rojo/ámbar reservados a semántica** (malo/alerta), neutros para el resto. Tokens en `globals.css`, aplicados consistentemente. Restraint (Emil). |
| A4 | **Responsive** | "Fuente mercado" (header) **se traslapa / no responsive** (punto 6) | Arreglar el header/subheader para que colapse bien en móvil (flex-wrap, truncado, breakpoints). |
| A5 | **Jerarquía** | Muchos KPIs al mismo peso | Un KPI héroe (valor estimado) + secundarios; consistente con el sistema de motion v3. |

---

## PARTE B — Valuación con datos reales (punto 8)
El **modelo de valuación titular sigue usando 12 comps curados** (`data/comps.ts`), no los **537 reales**. 
- Recalcular el estimado con los hallazgos reales de la base (mediana $/m² real, banda por m², ajuste CUS), y **reconciliar explícitamente** "12 curados (comps de terreno sin construcción)" vs "537 mercado amplio". El número titular debe derivarse de/coherer con la data real, no de los 12 sintéticos.
- Mostrar de dónde sale cada cifra (trazabilidad).

## PARTE C — Scatter con regresión + nuestra propiedad (punto 9)
En `DatabaseTab.tsx`: **dibujar la línea de regresión OLS** (ya se calcula `pendiente/R²`, pero no se pinta) como `<Line>`/`ReferenceLine` sobre el ScatterChart; y **plotear el predio objeto** (660 m² al precio implícito/asking) como punto destacado (★, color distinto) para ubicarlo vs el mercado.

## PARTE D — Mapa: clasificaciones y cobertura (punto 10)
Cuestionar las 4-5 zonas crudas actuales (Cimatario core / Cumbres / Centro Sur / Periferia). 
- Investigar submercados/colonias reales relevantes de Querétaro y **reclasificar** para cubrir el mapeo relevante (por colonia real, por tier de precio $/m², o por submercado), con leyenda honesta.
- Evaluar usar **Google Places** para POIs/anclas reales (universidades, corporativos, hospitales del estudio) y las **colindancias** del predio. *(Ola 2 — requiere key.)*

## PARTE E — Matriz de riesgos: ¿la gráfica óptima? (punto 11)
Reconsiderar el ScatterChart. El estándar de una matriz de riesgos es un **heatmap/grid probabilidad × impacto** (5×5 o 3×3) con celdas coloreadas (verde→rojo) y los riesgos ubicados en su celda. Implementar el heatmap (más legible y convencional) manteniendo el detalle en cards.

## PARTE F — HBU/HBV rehecho: investigación + topología + render (punto 12)
**Investigación (metodología HBU aplicada):** un HBU serio debe tener — análisis **as-vacant vs as-improved**; las 4 pruebas (legal/físico/financiero/máx. productivo) *ya están*; **comparación de RLV entre usos alternativos** (co-living híbrido vs vertical vs horizontal vs comercial) eligiendo el de mayor RLV; **análisis de sensibilidad/tornado** (precio venta, renta, costo, tasa); **curva de absorción**; y evidencia de **comparables de suelo**. Agregar lo que falte.
- **Topología de colindancias** del predio (Carlos Septién 53, 22×30 m, doble fachada) vía **Google Places/Maps** (edificios/calles/usos adyacentes reales) → base para un render fiel. *(Ola 2 — key.)*
- **Rehacer el render 3D + video** de FinObra fiel a la topología real, con **FAL** (fal.ai). *(Ola 2 — FAL key.)*

## PARTE G — Fixes menores
- Responsive del header (A4 / punto 6).
- **Enriquecer proyección poblacional** con años 2023-2029 (transcripción pág.8) — fiel (punto 5).

---

## Tabla de tareas

| # | Tarea | Owner/Modelo | Ola | Deps | Verificación | Llave |
|---|-------|--------------|-----|------|--------------|-------|
| A | Reorden de tabs + header persistente + tokens de color + responsive header | Sonnet (`ValuacionDashboard.tsx`, `globals.css`) | **1** | — | build ok; orden nuevo; header 1 vez; móvil ok | — |
| B | Valuación titular derivada de los 537 reales + trazabilidad | Sonnet (`ValuacionTab.tsx`) | **1** | — | build ok; números coherentes con la base | — |
| C | Scatter: línea OLS dibujada + predio objeto ploteado | Sonnet (`DatabaseTab.tsx`) | **1** | — | build ok; línea + ★ visibles | — |
| E | Matriz de riesgos → heatmap prob×impacto | Sonnet (`EstudioMercadoTab.tsx`) | **1** | — | build ok; heatmap legible | — |
| G | Enriquecer proyección 2023-2029 (fiel) | Sonnet (`data/estudio-mercado.ts`) | **1** ∥ | — | Opus verifica fidelidad pág.8 | — |
| D | Reclasificar zonas del mapa + cobertura relevante | Sonnet (`MapboxMap.tsx`) + research | **2** | Places? | zonas por submercado real | Google Places (opcional) |
| F1 | Topología de colindancias del predio | **TÚ** + Google Places | **2** | key | JSON de colindancias reales | **Google Places** |
| F2 | Rehacer render 3D + video FinObra fiel a topología | **TÚ**/Sonnet + FAL | **2** | F1, FAL | render/video nuevos | **FAL** |
| GEO | Geocodificar los 179 comps sin coords | **TÚ** + IPRoyal | **2** | proxy | lat/lng reales | **IPRoyal proxy** |
| — | Build + deploy testing + re-review Gemini | **TÚ** + humano | final | — | Action verde | — |

## Reglas de paralelización
- Ola 1: A/B/C/E/G en **archivos disjuntos** (`ValuacionDashboard`+`globals.css` / `ValuacionTab` / `DatabaseTab` / `EstudioMercadoTab` / `data/estudio-mercado.ts`). Sin colisión.
- Ola 2: todo lo de red viva/keys/irreversible = **orquestador** (nunca delegado a barato). Requiere que el operador habilite acceso a Infisical y/o entregue keys.

## Requerimientos del operador (para Ola 2)
- **Google Places / Maps Platform API key** (Geocoding + Places habilitados) — para topología (F1), POIs del mapa (D) y **geocodificar los 179** (GEO, alternativa a IPRoyal). ¿Existe en Infisical? ¿nombre?
- **FAL_KEY** (fal.ai) — para el render/video (F2). ¿Está en Infisical como `FAL_KEY`?
- **IPRoyal proxy** — `user:pass@host:port` (el token dio 401; era password de proxy, falta usuario+endpoint) — para GEO/enrichment.
- **Infisical**: el auto-mode classifier bloquea que YO lea secretos. Etapa donde lo necesito = **inicio de Ola 2**. Ver nota abajo.
