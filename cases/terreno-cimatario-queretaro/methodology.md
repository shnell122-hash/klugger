# Methodology — Modelo de valuación y scoring geoespacial (Terreno Cimatario 660 m²)

> Documento de metodología: **qué determina el modelo**, los **hallazgos/conclusiones** que produce, y una lectura crítica de sus **aciertos, fallas y áreas de oportunidad**.
> Fuentes de verdad: `SCORING-SPEC.md` (spec determinista), `data/scores/*.json` (outputs reales sobre 1,418 comps), `analisisCimatario2023.md` + `transcripcionEstudioMercado2023.md` (estudio 2023), `due-dilligence1.md` (cierre legal).
> Principio rector transversal: **cero alucinación** — todo número deriva de un dato de entrada por una fórmula documentada; lo ausente se marca `null` + flag, nunca se imputa en silencio.

---

## 1. Alcance y filosofía del modelo

El modelo responde tres preguntas distintas sobre el predio (Carlos Septién García, Cimatario, 660 m², asking $7.0M ⇒ **$10,606/m²**):

1. **¿Cuánto vale?** — valuación por comparables ajustada.
2. **¿Qué tan bueno es su lugar en el mercado?** — scoring geoespacial que rankea el predio contra la oferta real.
3. **¿Para quién es el mejor negocio?** — scorecard por 3 lentes (desarrollador / comprador / inversionista).

Filosofía: **relativo al mercado observado, no a un ideal abstracto**. Todas las escalas 0–100 se anclan a la población de comps reales de Querétaro. El modelo es **determinista y reproducible** (sin aleatoriedad, sin red, sin reloj: mismas entradas ⇒ mismos bytes).

---

## 2. Pipeline de datos (de dónde sale todo)

| Etapa | Método | Resultado |
|-------|--------|-----------|
| **Harvest** | Scraping de listados de Lamudi QRO (server-rendered, paginado real `?page=N`) vía `scraper_v2.py` | ~1,439 terrenos con `link`, precio, m² |
| **Enriquecimiento** | Fetch de páginas de detalle → extracción de `ld+json` `RealEstateListing` (dirección, geo lat/lng, floorSize, precio, imágenes). Desbloqueado con **proxy residencial IPRoyal MX** (las páginas de detalle banean IPs de datacenter) | metadata + coords reales por comp |
| **Geocodificación** | ld+json de Lamudi (593) + Google Geocoding (467) + base (358) | 1,418/1,418 con coords válidas |
| **Limpieza / guardas** | Exclusión de comps fuera de mercado: `price/size ≤ 0`, coords nulas, y **>50 km del predio** (Haversine). Removió 21 listados que eran de Durango/Chihuahua/Pedro Escobedo (ruido de búsqueda) | **1,418 comps QRO-metro limpios** |

**POIs geoespaciales** (Google Places, geocodificados): anclas (312), competencia (54→41 tras guarda), consumo-usuario (163), equipamiento (127), inversión-proyectos (13→11). Todos con lat/lng real.

> Nota: **una sola fuente de comps (Lamudi)**. Inmuebles24/Vivanuncios quedaron fuera (bloqueo DataDome no vencido con proxy). Es una limitación de cobertura declarada, no oculta.

---

## 3. Metodología de valuación (comparables)

- **Base**: mediana de $/m² del mercado limpio × superficie, con ajustes por potencial (CUS), zona y tipología.
- **HBU/HBV** (Highest & Best Use): pro-forma real (no maqueta) con TIR / VPN / DCF sobre el producto híbrido co-living + townhouses que el estudio 2023 propone (12 unidades / 4 niveles).
- **RLV** (Residual Land Value): valor del suelo como residual del proyecto óptimo — es la base de negociación para venta vs aportación/JV.
- **Reconciliación de 3 enfoques** (comparables / ingreso-residual / potencial) en un rango.

Banda de mercado real (1,418 comps): **mín $314 · p25 $5,557 · mediana $7,693 · p75 $9,500 · p90 $12,668 · máx $108,000 /m²**. El predio a **$10,606/m² cae ≈ p80** (caro-relativo, entre p75 y p90).

---

## 4. Metodología de scoring geoespacial (el corazón del modelo)

### 4.1 Normalización canónica — percentil-rank
Toda densidad se convierte a 0–100 por su **rango-percentil dentro de los 1,418 comps** (no min-max, que aplastaría distribuciones sesgadas). El predio se inserta como consulta contra esa misma población ⇒ es directamente comparable a los comps.

### 4.2 Kernels de densidad ponderada por distancia
`K(punto,P;R,d0) = Σ 1/(1+d/d0)` para POIs a ≤R. Radios por señal (racional de alcance):
| Señal | R / d0 | Lógica |
|-------|--------|--------|
| Ancla | 3000 / 500 m | valor a escala de zona (auto) |
| Consumo meta | 1200 / 300 m | estilo de vida caminable |
| Equipamiento | 1000 / 300 m | servicio de barrio |
| Competencia (saturación) | 800 / 150 m | canibalización hiperlocal |
| Competencia (validación) | 1500 / 400 m | demanda del submercado |
| Crecimiento/inversión | 4000 / 800 m | plusvalía metropolitana |

### 4.3 Los 7 subscores y el Land Score
`land_score = 0.30·S1 + 0.30·S2 + 0.10·S3 + 0.10·S4 + 0.05·S5 + 0.10·S6 + 0.05·S7`
- **S1 Valor** — $/m² invertido (barato-relativo = alto).
- **S2 Oportunidad** — `growth_surface`: mezcla ponderada de ancla/consumo/equip/competencia-neta/crecimiento.
- **S3–S5** — densidades atómicas de consumo / ancla / equipamiento (capa de interpretabilidad).
- **S6 Competencia neta** — trade-off explícito: `50 − 0.60·(saturación−50) + 0.30·(validación−50)`. Alto = poca canibalización con demanda probada.
- **S7 Crecimiento** — densidad de megaproyectos de inversión (ponderada por monto).

### 4.4 Scorecard por 3 lentes (re-ponderación por perfil)
Los mismos 7 subscores, re-ponderados y re-rankeados contra los comps:
| Subscore | Desarrollador | Comprador | Inversionista |
|---|---|---|---|
| S1 valor | 0.10 | 0.25 | 0.20 |
| S2 oportunidad | 0.25 | 0.15 | 0.15 |
| S3 consumo | 0.10 | 0.25 | 0.10 |
| S4 ancla | 0.10 | 0.10 | 0.10 |
| S5 equipamiento | 0.05 | 0.20 | 0.05 |
| S6 competencia | 0.25 | 0.05 | 0.10 |
| S7 crecimiento | 0.15 | 0.00 | 0.30 |

### 4.5 Amenazas y datos ausentes
- **Amenazas** (`{tipo, severidad, evidencia}`) derivadas de umbrales numéricos: competencia_cercana, saturación_submercado, dependencia_una_ancla, precio_sobre_banda, equipamiento_débil. Solo se emiten si superan su umbral.
- **Datos ausentes** → `null` + flag + reparto de peso. Nunca imputación. Los proxies (seguridad←equipamiento, liquidez←profundidad de comps, yield←valor) se declaran con `*_is_proxy:true`.
- **Guardas de calidad**: descarte de POIs a >50 km, winsorización [p5,p95] para la banda de precios, comps inválidos fuera del set de normalización.

---

## 5. Hallazgos y conclusiones principales (según la metodología, sobre 1,418 comps)

**Perfil del predio (subscores 0–100):**
`S1 valor = 16.9` · `S2 oportunidad = 88.4` · `S3 consumo = 96.0` · `S4 ancla = 96.3` · `S5 equipamiento = 98.4` · `S6 competencia neta = 39.3` · `S7 crecimiento = 99.0`.

1. **Ubicación de élite, precio caro.** El predio está en el **percentil ~93–95 del mercado** en las tres lentes, movido por ancla/consumo/equipamiento/crecimiento casi en el techo (S3–S5, S7 ≈ 96–99). Su **único punto débil estructural es el precio**: S1 = 16.9 (asking $10,606/m² ≈ p80 del mercado). *Se compra caro un lugar excelente.*
2. **El mejor negocio es para el inversionista** (score 74.4, percentil 93.7) — por encima de desarrollador (72.6) y comprador (72.8). Lo decide S7 crecimiento = 99 (megaproyectos: Cloud-HQ $14,942 MDP, hospitales, carreteras), que el lente inversionista pondera 0.30.
3. **Competencia como matiz, no como bloqueo.** S6 = 39.3 (bajo-medio): hay algo de oferta de co-living/renta cerca, suficiente para *validar demanda* pero sin saturación hiperlocal que canibalice — el punto más débil para el comprador, no para el desarrollador.
4. **4 amenazas** emitidas por umbral (encabezadas por precio-sobre-banda y competencia de submercado); ninguna de severidad estructural-alta según los datos.
5. **Cierre legal resuelto** (due diligence 6/6): escritura 4,652, fusión 660 m² protocolizada, CUS que admite 12 niveles, predial al corriente → el predio puede pasar de "interesante" a "oferta" sin fricción documental.

**Conclusión de negocio:** activo *premium de ubicación* con tesis de **plusvalía/inversión** más que de *ganga de suelo*. La palanca de negociación es el sobreprecio relativo (S1 bajo): el RLV justifica el valor solo si se ejecuta el HBU de mayor densidad.

---

## 6. Aciertos de la metodología

- **Anti-alucinación operacionalizada**: cada subscore es trazable a un JSON de entrada; los datos ausentes se declaran, no se inventan. Raro en pitches de terreno.
- **Escala anclada al mercado real** (percentil sobre comps) en vez de un máximo arbitrario → los scores significan "vs la oferta que existe".
- **Trade-off de competencia explícito** (saturación vs validación de demanda) en vez de tratar "competencia" como monolito.
- **Multi-lente**: separa que un mismo predio sea buen negocio para un perfil y mediocre para otro — evita el veredicto único engañoso.
- **Determinismo y reproducibilidad** con ejemplo trabajado y guardas de auto-verificación (haversine ancla0 == 401 m).
- **Datos reales, limpios y geolocalizados** (1,418 comps, coords verificadas, guarda ≤50 km que ya removió ruido de otros estados).

---

## 7. Fallas, limitaciones y riesgos metodológicos

1. **Pesos = opiniones de negocio, sin validar.** Las matrices de las 3 lentes y los pesos del Land Score son el parámetro **más subjetivo** y aún **no firmados por el operador** (ver `SCORING-VALIDATION.md`). Un cambio de pesos puede reordenar el ranking.
2. **Redundancia parcial declarada**: S3–S6 vuelven a entrar en S2 (growth_surface) → doble-conteo parcial de la señal geoespacial. Mitigado con pesos chicos, pero presente.
3. **Escala relativa, no absoluta**: "bueno" se define contra la oferta de Cimatario. Un mercado localmente pobre haría ver "bueno" a algo mediocre en términos absolutos. No hay cotas externas (no hay datos para fijarlas).
4. **Una sola fuente de comps (Lamudi)**: sesgo de portal; Inmuebles24/Vivanuncios (DataDome) quedaron fuera. La banda de precios podría moverse con más fuentes.
5. **Proxies para conceptos sin dato** (seguridad, liquidez, yield, absorción): declarados, pero siguen siendo sustitutos — no medidas directas. CUS y absorción reales entran como `null`.
6. **La banda de precios cambió con la población** (mediana $9,002 con 537 → $7,693 con 1,418): los scores son sensibles al tamaño/composición del set de normalización. El "ejemplo trabajado" de la spec quedó fuera de tolerancia por esto (esperado, no bug), lo que muestra la sensibilidad.
7. **$/m² sin ajuste por tamaño de lote**: comparar un lote de 3,255 m² con uno de 660 m² por $/m² crudo ignora la prima/descuento por tamaño (los lotes chicos suelen valer más por m²) — puede penalizar artificialmente el S1 del predio.
8. **POIs de Places con calidad variable** (algunos `rating=null`, un competidor a 9,000 km ya filtrado): la densidad depende de la completitud del scrape de Places.

---

## 8. Áreas de oportunidad

- **Validar y congelar los pesos** (Tarea abierta): que el operador firme `SCORING-VALIDATION.md` cierra el mayor riesgo metodológico.
- **Ajuste hedónico por tamaño de lote** en S1 (regresión $/m² ~ log(m²)) para no castigar al predio por comparar contra macrolotes.
- **Segunda y tercera fuente de comps** (Inmuebles24/Vivanuncios vía Playmright headless) → banda de precios más robusta y menos sesgo de portal.
- **Absorción empírica real**: usar `scraped_at` / días-en-mercado de los propios comps para reemplazar la absorción hardcodeada del pro-forma.
- **Integrar CUS oficial al modelo**: ahora que el due diligence lo confirma (12 niveles / DUS202104552), dejar de tratarlo como `null` y meterlo al S1/HBU como dato duro.
- **Análisis de sensibilidad publicado**: mostrar cómo cambian ranking y percentil del predio al mover pesos ±10% y radios de kernel — vuelve auditable la subjetividad.
- **Escala absoluta opcional**: anclar a benchmarks de otras ciudades (Cushman/CBRE/Colliers) para complementar la lectura relativa.
- **Ampliar POIs de crecimiento** (`inversion-proyectos.json` tiene solo 11 puntos válidos): más megaproyectos geocodificados fortalecen el S7 que hoy domina la lente inversionista.
