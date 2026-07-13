# SCORING-SPEC.md — Modelo de scoring geoespacial (Terreno Cimatario, QRO)

**Objetivo:** especificación **determinista, reproducible y anti-alucinación** para que un agente Sonnet
la implemente como script. Mercado objetivo (según HBU): **co-living / millennial profesional**.

**Regla de oro (anti-alucinación):** todo número que produzca el script debe derivarse *exclusivamente*
de los JSON de entrada listados abajo mediante las fórmulas de este documento. **Ningún subscore, peso
efectivo, umbral ni severidad puede provenir de conocimiento externo del modelo.** Si un insumo no existe
(p. ej. `inversion-proyectos.json`), el subscore afectado se marca `null` y se documenta como faltante —
nunca se inventa un valor.

**Determinismo:** sin aleatoriedad, sin llamadas de red, sin dependencia de reloj. Orden de iteración
estable (ordenar por `link` antes de cualquier desempate). Mismas entradas ⇒ mismos bytes de salida.

---

## 0. Insumos, esquemas y guardas de calidad

Dir base (rutas absolutas):
`/private/tmp/claude-501/-Users-germanvillar/dc05db55-6af9-4edf-b586-a92b521ae340/scratchpad/klugger-testing/dashboard-financial/app/valuacion-cimatario/`

| Archivo | N | Campos usados | Notas |
|---|---|---|---|
| `terrenos_full.json` | 537 | `price`, `size_m2`, `lat`, `lng`, `link` | comps (población de referencia) |
| `data/geo/anclas.json` | 312 | `lat`, `lng`, `dist_predio_m`, `subcat`, `rating` | subcat ∈ {universidad, plaza_mall, hospital, supermercado, corporativo} |
| `data/geo/competencia.json` | 54 | idem | subcat ∈ {coliving, estudiantil, multifamiliar_renta} |
| `data/geo/consumo-usuario.json` | 163 | idem | subcat ∈ {coworking, cafe_especialidad, gimnasio, bar, restaurante} |
| `data/geo/equipamiento.json` | 127 | idem | subcat ∈ {educacion, salud, parque, transporte*} |
| `data/topologia-colindancias.json` | — | `predio.lat/lng`, `adyacentes[]` | topología del predio |
| `data/geo/inversion-proyectos.json` | **NO EXISTE AÚN** | `lat`, `lng` (esperado) | ver §1.6 (contrato de integración) |

\* `transporte` está declarado en el enunciado pero **no aparece** en la muestra de datos
(`educacion:46, parque:51, salud:30`). El script debe tolerar subcats ausentes sin fallar.

**Predio objeto** (fuente autoritativa = `topologia-colindancias.json.predio`):
`lat = 20.5822759`, `lng = -100.3887838`, `size_m2 = 660`, `asking = $7,000,000` ⇒ `$/m² = 10,606`.

### 0.1 Distancia — usar Haversine, no reutilizar `dist_predio_m` ciegamente
`dist_predio_m` es distancia **al predio** (válida solo para el scorecard del predio). Para los 537 comps
y para puntos arbitrarios de la superficie hay que **recalcular** la distancia POI→punto con Haversine:

```
R = 6_371_000  # m
d(φ1,λ1,φ2,λ2) = 2R·asin( sqrt( sin²(Δφ/2) + cos φ1·cos φ2·sin²(Δλ/2) ) )   # φ,λ en radianes
```

Guarda de implementación (checkeo obligatorio antes de correr el pipeline): para `anclas[0]`
(place_id `ChIJE6WgeO1F04UR4pa0m_kqupA`), `haversine(predio, ancla0) == 401 m == dist_predio_m`.
Si difiere en >2 m, el implementador tiene un bug y debe detenerse.

### 0.2 Guardas contra datos sucios (obligatorias, aplican a TODOS los POIs y comps)
1. **Coordenada implausible:** descartar cualquier POI con `haversine(predio, poi) > 50_000 m`.
   Justificación: `competencia.json` contiene un registro con `dist_predio_m = 9_213_416` (≈9,000 km,
   error de geocodificación). Sin esta guarda contamina densidades y normalización.
2. **Comp inválido:** excluir del scoring (y del set de normalización) todo comp con
   `price ≤ 0` ∨ `size_m2 ≤ 0` ∨ `lat/lng` nulos.
3. **Outlier de precio (guarda contra manipular la banda):** para calcular la banda de mercado de $/m²
   (§2.1) usar **winsorización a [p5, p95]** del set válido. Un comp con `$/m²` fuera de banda **sí**
   recibe score (marcado `outlier:true`), pero **no** desplaza la mediana/banda de los demás.
   Cotas observadas (informativas, el script las recomputa): min 507, p10 4,502, p25 7,341,
   **mediana 9,002**, p75 10,917, p90 13,961, max 104,167 $/m².

### 0.3 Normalización canónica — rango-percentil sobre la población de comps
Todas las densidades geoespaciales son fuertemente sesgadas (muchos comps lejanos con densidad 0:
mediana de densidad de consumo = 0.24, de equipamiento = 0.00). Min-max las aplastaría contra 0.
Por eso la normalización canónica es **percentil-rank** dentro de la población de los 537 comps válidos:

```
norm(x; X) = 100 · ( #{ v ∈ X : v < x } + 0.5·#{ v ∈ X : v == x } ) / |X|      # 0..100
```

- `X` = distribución del mismo indicador crudo calculado sobre **los 537 comps** (población de referencia
  única y fija). Esto ancla toda la escala 0–100 al mercado real, no a un máximo arbitrario.
- El **predio** y **puntos arbitrarios** de la superficie se normalizan contra esta *misma* `X` (se
  insertan como consulta, no alteran `X`). Así el predio es directamente comparable a los comps.
- Empates: la corrección `+0.5·#empates` hace la función estable y simétrica.
- **Alternativa documentada (no default):** min-max winsorizado `clamp(100·(x−p5)/(p95−p5),0,100)`.
  Se deja como opción configurable `NORM_MODE ∈ {percentile, minmax}`; **default = percentile**.

> ⚠️ **Supuesto a validar (german):** usar los 537 comps como población de referencia asume que
> "bueno/malo" se define *relativo a la oferta existente en Cimatario*. Si se quiere una escala absoluta
> (p. ej. contra estándares de otra ciudad), habría que fijar cotas externas — hoy **no** hay datos para eso.

---

## 1. Growth / Opportunity Surface (superficie de oportunidad por ubicación)

Función `growth_surface(lat, lng) → 0..100` calculable para **cualquier** punto. Es la capa que pinta el
mapa y alimenta el subscore S2 "oportunidad de ubicación" del Land Score.

### 1.1 Kernel de densidad ponderada por distancia
Para un conjunto de POIs `P`, radio de corte `R` y escala `d0`:

```
K(punto, P; R, d0) = Σ_{p∈P, d≤R, d≤50000}  1 / (1 + d/d0)          donde d = haversine(punto, p)
```

- Peso `1/(1+d/d0)`: **1.0** en d=0, **0.5** en d=d0, decae suave (evita el borde duro de un conteo).
- `R` corta la cola lejana; `50000 m` es la guarda global de §0.2.
- `rating` **no** entra al kernel de densidad (muchos POIs tienen `rating=null`; introducirlo obligaría
  a imputar → riesgo de alucinación). El `rating` se reserva para desempates opcionales (§1.7), nunca
  para inventar magnitud.

### 1.2 Radios y escalas por señal (default) + racional
| Señal | Fuente | R (m) | d0 (m) | Racional del radio |
|---|---|---|---|---|
| Ancla | anclas.json | 3000 | 500 | Anclas (hospital, universidad, mall) irradian valor a escala de zona; sirven aún a 2–3 km en auto. |
| Consumo meta | consumo-usuario.json | 1200 | 300 | Café/gym/coworking son "estilo de vida a pie": relevantes en radio caminable ~15 min. |
| Equipamiento | equipamiento.json | 1000 | 300 | Parque/escuela/salud pesan como servicio de barrio inmediato. |
| Competencia | competencia.json | 800 (sat) / 1500 (val) | 150 / 400 | Canibalización es hiperlocal (≤800 m); validación de demanda cuenta en submercado (≤1500 m). |

Cotas observadas de cada kernel sobre los 537 comps (informativas; el script las recomputa para normalizar):

| Kernel | min | p5 | mediana | p95 | max |
|---|---|---|---|---|---|
| ancla (R3000,d0 500) | 0.00 | 0.00 | 4.33 | 25.90 | 28.59 |
| consumo (R1200,d0 300) | 0.00 | 0.00 | 0.24 | 11.66 | 18.25 |
| equip (R1000,d0 300) | 0.00 | 0.00 | 0.00 | 13.44 | 18.90 |
| comp (R800,d0 150) | 0.00 | 0.00 | 0.00 | 1.01 | 3.25 |

### 1.3 Subseñales normalizadas
```
A(pt) = norm( K(pt, anclas;      3000, 500), X_ancla )        # densidad de ancla   0..100
C(pt) = norm( K(pt, consumo;     1200, 300), X_consumo )      # consumo meta        0..100
E(pt) = norm( K(pt, equipamiento;1000, 300), X_equip )        # equipamiento        0..100
G(pt) = growth_exposure(pt)                                   # crecimiento QRO §1.6  0..100 | null
COMP(pt) = comp_net(pt)                                       # competencia neta §1.4 0..100
```

### 1.4 Competencia: penalización de saturación **y** premio a demanda probada (trade-off explícito)
Dos efectos opuestos, ambos reales para co-living:
- **Saturación / canibalización** (malo): demasiada oferta idéntica muy cerca ⇒ vacancia, guerra de precios.
- **Validación de demanda** (bueno): que *exista* competencia en el submercado prueba que el producto renta.

Se modelan por separado y se combinan en un subscore **neto donde más alto = mejor para un nuevo desarrollo**:

```
sat(pt) = norm( K(pt, competencia; 800, 150),  X_sat )       # 0..100  presión hiperlocal
val(pt) = norm( K(pt, competencia; 1500,400),  X_val )       # 0..100  demanda probada en submercado
comp_net(pt) = clamp( 50  − 0.60·(sat − 50)  + 0.30·(val − 50) , 0, 100 )
```

- Punto neutro 50. La saturación resta con peso **0.60** (domina: el riesgo de sobre-oferta es el mayor
  destructor de valor de un co-living nuevo). La validación suma con peso **0.30** (mitad del peso: es
  señal positiva pero secundaria, y ya está parcialmente capturada por A/C/E).
- Interpretación en Cimatario: el predio tiene `sat≈` bajo (0 competidores <300 m, 2 <1000 m) ⇒
  `comp_net` alto ⇒ **espacio para oferta nueva sin canibalizar**. Es el caso favorable.

> ⚠️ **Supuesto a validar:** los pesos 0.60/0.30 y el que "saturación pese el doble que validación" son
> una postura de negocio (conservadora anti-sobreoferta). german puede invertirla si su tesis es
> "clúster gana" (aglomeración). Parámetros `W_SAT`, `W_VAL` configurables.

### 1.5 Combinación → superficie
```
growth_surface(pt) = Σ w_i · señal_i , con pesos DEFAULT (renormalizados si G es null):

  w_A (ancla)        = 0.30
  w_C (consumo)      = 0.25
  w_E (equipamiento) = 0.15
  w_COMP (comp_net)  = 0.15
  w_G (crecimiento)  = 0.15      # si inversion-proyectos.json no existe ⇒ G=null y se REPARTE
                                 #   w_G proporcionalmente entre {A,C,E,COMP}; se emite flag surface_growth_included:false
```
Racional de pesos: la **ancla** es el driver estructural de valor de suelo (0.30). El **consumo meta**
es el diferenciador para el usuario co-living específico (0.25). **Equipamiento** (0.15) y **competencia
neta** (0.15) son moduladores de barrio. **Crecimiento futuro** (0.15) inclina hacia plusvalía; al ser
forward-looking y hoy sin datos, no domina.

### 1.6 Integración de `inversion-proyectos.json` (contrato — aún no existe)
Cuando otro agente lo genere, se espera un array de objetos con al menos `{lat, lng}` (opcional
`monto`, `tipo`, `horizonte`). Integración determinista:
```
growth_exposure(pt) = norm( K(pt, inversion; R=4000, d0=800), X_growth )     # mismo esquema de kernel
```
- Radio 4000 / d0 800: la plusvalía por megaproyecto irradia a escala metropolitana amplia.
- Si `monto` está disponible, ponderar el término del kernel por `monto/mediana(monto)` (cap a 3×) —
  documentar y marcar `growth_amount_weighted:true`. Sin `monto`, conteo simple.
- **Mientras el archivo no exista:** `G = null`, `w_G` se reparte (§1.5), y el output declara
  `surface_growth_included:false`. Jamás se sustituye por un valor supuesto.

### 1.7 Desempate opcional por calidad (no altera magnitud)
Solo para ordenar POIs en tooltips o romper empates exactos de score: `rating` (null → tratar como el
p25 de ratings no nulos de esa capa, y marcar `rating_imputed_for_tiebreak:true`). **Nunca** entra al
score numérico principal.

---

## 2. Land Score — ranking de los 537 comps

Para cada comp válido: `land_score = Σ w_i · S_i`, cada `S_i ∈ [0,100]`.

### 2.1 S1 — Valor (relativo $/m², más barato relativo = mejor)
```
ppm(comp) = price / size_m2
banda = [p25_w, p75_w] de ppm sobre comps winsorizados a [p5,p95]     # p25≈7341, mediana≈9002, p75≈10917
S1(comp) = 100 − norm( ppm(comp), X_ppm )        # invertido: menor $/m² ⇒ mayor S1
```
- `X_ppm` = distribución de $/m² de los 537 (winsorizada solo para banda, no para el rank).
- Guarda outlier: si `ppm` fuera de [p5,p95] ⇒ `S1` se **clampa** al valor del percentil de corte
  correspondiente y el comp se marca `value_outlier:true` (evita que un lote basura de $507/m² o uno de
  $104k/m² produzca S1=100/0 engañosos).
- Racional: barato-relativo = mayor margen de desarrollo / mejor entrada; invertido porque el score
  premia oportunidad de compra.

### 2.2 S2 — Oportunidad de ubicación
```
S2(comp) = growth_surface(comp.lat, comp.lng)      # §1, ya 0..100
```

### 2.3 S3..S6 — proximidades atómicas y competencia (interpretabilidad)
```
S3(comp) = C(comp)         # consumo meta   §1.3
S4(comp) = A(comp)         # ancla          §1.3
S5(comp) = E(comp)         # equipamiento   §1.3
S6(comp) = comp_net(comp)  # competencia neta §1.4  (alto = poca saturación)
```

> ⚠️ **Redundancia declarada (supuesto a validar):** S3–S6 son los mismos ingredientes que ya componen
> S2 (growth_surface). Incluirlos otra vez los cuenta parcialmente doble. **Decisión de diseño:** S2 lleva
> el peso geoespacial grueso; S3–S6 se mantienen con **pesos pequeños** como capa de *interpretabilidad*
> (permiten explicar "por qué" un comp puntúa alto y desempatar), sin triple-contar. Si german prefiere
> cero redundancia, poner `w3=w4=w5=w6=0` y subir `w2`. Parámetros configurables.

### 2.4 Pesos DEFAULT del Land Score + racional (suman 1.00)
| Subscore | Peso | Racional |
|---|---|---|
| S1 valor | **0.30** | El precio relativo es la variable dura de decisión de compra de suelo. |
| S2 oportunidad (surface) | **0.30** | Índice geoespacial compuesto; co-motor con el precio. |
| S3 consumo meta | 0.10 | Diferenciador del usuario co-living; peso menor por redundancia con S2. |
| S4 ancla | 0.10 | Estructura de valor; menor por redundancia con S2. |
| S5 equipamiento | 0.05 | Servicio de barrio; secundario. |
| S6 competencia neta | 0.10 | Riesgo de sobre-oferta / validación de demanda. |
| S7 crecimiento (inversión) | 0.05 | Forward-looking; hoy `null` ⇒ se reparte (ver abajo). |
| **Σ** | **1.00** | |

Manejo de S7 nulo: si `inversion-proyectos.json` no existe, `S7=null`, su 0.05 se reparte proporcional
entre {S1..S6} y el output emite `growth_included:false`.

### 2.5 Output — `data/scores/land-scores.json`
```json
{
  "meta": {
    "generated_from": ["terrenos_full.json","anclas.json","competencia.json",
                       "consumo-usuario.json","equipamiento.json"],
    "n_comps_input": 537, "n_comps_valid": 0,
    "weights": { "S1":0.30,"S2":0.30,"S3":0.10,"S4":0.10,"S5":0.05,"S6":0.10,"S7":0.05 },
    "norm_mode": "percentile",
    "growth_included": false,
    "kernels": { "ancla":[3000,500],"consumo":[1200,300],"equip":[1000,300],
                 "comp_sat":[800,150],"comp_val":[1500,400] }
  },
  "comps": [
    {
      "link": "https://...",
      "score": 0.0,
      "subscores": { "S1":0.0,"S2":0.0,"S3":0.0,"S4":0.0,"S5":0.0,"S6":0.0,"S7":null },
      "raw": { "ppm":0.0, "k_ancla":0.0,"k_consumo":0.0,"k_equip":0.0,"k_sat":0.0,"k_val":0.0 },
      "flags": { "value_outlier": false },
      "rank": 0, "percentil": 0.0
    }
  ]
}
```
- `comps` ordenado por `score` desc; empates se rompen por `S1` desc, luego `link` asc (determinismo).
- `percentil` = rank-percentil del `score` dentro de los comps válidos (0..100).
- `raw` incluye kernels crudos para auditoría (permite recomputar el score a mano).

---

## 3. Predio Scorecard — 3 lentes (Desarrollador / Comprador / Inversionista)

Se calculan los **mismos 7 subscores** para el predio (usando `dist_predio_m` directo o Haversine —
equivalen, ver §0.1) y se **re-ponderan** por perfil. Cada lente ⇒ un score 0–100 y su **percentil dentro
de los 537** (insertando el score del predio en la distribución de land_scores calculada con esa misma
matriz de pesos aplicada a los comps — es decir, cada lente re-rankea los 537 con sus propios pesos).

### 3.1 Matrices de pesos por lente (cada fila suma 1.00) + racional
| Subscore | Desarrollador | Comprador (usuario) | Inversionista |
|---|---|---|---|
| S1 valor | 0.10 | 0.25 | 0.20 |
| S2 oportunidad (surface) | 0.25 | 0.15 | 0.15 |
| S3 consumo meta | 0.10 | 0.25 | 0.10 |
| S4 ancla | 0.10 | 0.10 | 0.10 |
| S5 equipamiento | 0.05 | 0.20 | 0.05 |
| S6 competencia neta | 0.25 | 0.05 | 0.10 |
| S7 crecimiento (inversión) | 0.15 | 0.00 | 0.30 |

**Desarrollador** — prioriza espacio para HBU/RLV: **competencia neta 0.25** (baja saturación = poder
absorber oferta nueva) y **oportunidad 0.25**; **crecimiento 0.15** (pipeline). Valor bajo (0.10): el
desarrollador tolera pagar por suelo si el producto lo justifica. *Modificadores no-geo* (de
`topologia-colindancias.json`, aplicados como bono/penalización ±0..10 pts sobre el score final,
documentados): **doble fachada / esquina** (+), **frente amplio** (+); si la topología no lo permite
inferir, modificador = 0 y flag `topo_modifier_applied:false`. **CUS/absorción** no están en los datos ⇒
`null`, no se inventan (ver §5).

**Comprador (usuario final co-living)** — prioriza estilo de vida: **consumo 0.25**, **equipamiento 0.20**,
**valor 0.25** (asequibilidad). Competencia casi irrelevante (0.05). **Seguridad** no existe como dato ⇒
se **proxy-declara** vía densidad de equipamiento salud/educación (parte de S5) y se marca
`safety_is_proxy:true`; nunca un índice de seguridad inventado.

**Inversionista** — prioriza plusvalía y riesgo: **crecimiento 0.30** (motor de plusvalía),
**valor 0.20** (proxy de yield: menor precio de entrada → mejor cap rate), competencia 0.10 (riesgo de
sobreoferta). **Liquidez** se proxy-declara por profundidad de mercado = nº de comps válidos dentro de
1500 m (más comps ⇒ más comparables ⇒ más líquido), marcada `liquidity_is_proxy:true`.

> ⚠️ **Supuesto a validar:** las tres matrices son **opiniones de negocio**. Son el parámetro más
> subjetivo de todo el modelo; german debería revisarlas explícitamente. Todas configurables.

### 3.2 Regla del veredicto textual (determinista, plantilla rellenada con números)
```
mejor_lente   = argmax_lente( score_lente )
percentil_L   = percentil del predio en los 537 bajo la lente L
falta_top_decil(L):
    gap = score_del_comp_en_p90(L) − score_predio(L)
    subscore_mas_debil = argmin_i( S_i · w_i^L )   # el subscore que más "cuesta" en esa lente
Plantilla:
  "El predio es más atractivo para el perfil {mejor_lente} (score {score}/100, percentil {percentil_L}
   de 537). Su punto más débil bajo este lente es {subscore_mas_debil} ({valor} pts). Para entrar al
   top-decil necesitaría subir ~{gap} pts, principalmente vía {subscore_mas_debil}."
```
Sin adjetivos libres: todo texto proviene de números calculados.

### 3.3 Output — `data/scores/predio-scorecard.json`
```json
{
  "predio": { "lat":20.5822759, "lng":-100.3887838, "size_m2":660, "asking":7000000, "ppm":10606 },
  "subscores": { "S1":0,"S2":0,"S3":0,"S4":0,"S5":0,"S6":0,"S7":null },
  "lentes": {
    "desarrollador": { "score":0, "percentil":0, "weakest":"", "veredicto":"" },
    "comprador":     { "score":0, "percentil":0, "weakest":"", "veredicto":"", "safety_is_proxy":true },
    "inversionista": { "score":0, "percentil":0, "weakest":"", "veredicto":"", "liquidity_is_proxy":true }
  },
  "modifiers": { "topo_modifier_applied": false, "value_pts": 0 }
}
```

---

## 4. Amenazas (derivadas de datos, nunca inventadas)

Lista `amenazas[]`, cada una `{tipo, severidad, evidencia}` donde `severidad ∈ {baja,media,alta}` se
deriva de umbrales numéricos y `evidencia` cita los números crudos. Reglas:

| tipo | Métrica | baja / media / alta | Evidencia a emitir |
|---|---|---|---|
| `competencia_cercana` | `n` competidores ≤500 m y `d_min` | n=0 → (omite) · n∈[1,2] → baja · n∈[3,5] → media · n>5 o d_min<150 → alta | `{n, d_min_m, links[]}` |
| `saturacion_submercado` | `sat` percentil (§1.4) | <60 → baja · 60–85 → media · >85 → alta | `{sat_percentil, k_sat}` |
| `dependencia_una_ancla` | share de la subcat de ancla dominante en `K_ancla` | share ≤0.40 → baja · 0.40–0.65 → media · >0.65 → alta | `{subcat_dominante, share, nearest_by_subcat}` |
| `precio_sobre_banda` | `ppm` vs banda [p25,p75] | ≤p50 → (omite) · p50–p75 → baja · p75–p90 → media · >p90 → alta | `{ppm, p50, p75, p90, percentil}` |
| `equipamiento_debil` | `E` percentil | >40 → (omite) · 25–40 → baja · 10–25 → media · <10 → alta | `{E_percentil, k_equip}` |

- Cada amenaza solo se emite si supera su umbral mínimo (no se listan "no-amenazas").
- `dependencia_una_ancla`: se computa el share ponderado por subcat sobre `K_ancla`; en Cimatario las
  anclas más cercanas son diversas (súper 401 m, hospital 543 m, plaza 717 m, universidad 732 m) ⇒
  se espera share bajo ⇒ severidad **baja**. Documentar el vector completo `nearest_by_subcat`.
- Output: `data/scores/amenazas.json` = `{ "predio_ref": {...}, "amenazas": [ ... ] }`.

---

## 5. Datos ausentes — tratamiento explícito (anti-alucinación)
| Concepto pedido | ¿Existe en datos? | Tratamiento |
|---|---|---|
| CUS / coeficiente de uso de suelo | No | `null`; excluir del score; nota en scorecard |
| Absorción de mercado | No | `null`; no estimar |
| Frente / doble fachada | Parcial (`topologia-colindancias`) | modificador ±pts **solo si** inferible; si no, 0 + flag |
| Seguridad | No | proxy vía equipamiento (S5), `safety_is_proxy:true` |
| Yield / cap rate | No (sin rentas) | proxy vía valor (S1), documentado |
| Liquidez | No | proxy vía profundidad de comps ≤1500 m, `liquidity_is_proxy:true` |
| `inversion-proyectos.json` | No aún | S7=null, se reparte peso, `growth_included:false` (§1.6) |

Regla única: **dato ausente ⇒ `null` + flag + reparto de peso. Nunca imputación silenciosa.**

---

## 6. Ejemplo trabajado (para validar la implementación)

Todos los números salen de correr las fórmulas sobre los JSON reales (kernels default, `NORM_MODE=percentile`,
`growth_included=false`). El implementador debe reproducirlos con tolerancia ±1 pt (±0.05 en kernels crudos).

### 6.1 Comp de ejemplo — `terrenos_full.json[0]`
- `link` …`38-19d6af9-83b9-735e`, `price = 21,157,890`, `size_m2 = 3255` ⇒ **ppm = 6,500 $/m²**.
- Kernels crudos (Haversine desde su lat/lng 20.584381, −100.392839):
  `k_ancla = 26.30`, `k_consumo = 13.01`, `k_equip = 16.35`, `k_sat = 0.84`.
- Normalización percentil contra las distribuciones de §1.2:
  - S1 valor: ppm 6,500 < mediana 9,002 ⇒ está ~p20 de $/m² ⇒ `S1 = 100 − 20 ≈ **80**` (barato-relativo).
  - S4 ancla: 26.30 vs (mediana 4.33, p95 25.90) ⇒ ~p96 ⇒ `S4 ≈ **96**`.
  - S3 consumo: 13.01 vs (mediana 0.24, p95 11.66) ⇒ ~p96 ⇒ `S3 ≈ **96**`.
  - S5 equip: 16.35 vs (p95 13.44, max 18.90) ⇒ ~p97 ⇒ `S5 ≈ **97**`.
  - S6 comp_net: k_sat 0.84 alto (p95≈1.01) ⇒ sat≈p92; val moderado ⇒
    `comp_net = 50 − 0.60·(92−50) + 0.30·(val−50)`; con val≈p85 ⇒ `≈ 50 −25.2 +10.5 ≈ **35**`
    (hay competencia cerca ⇒ subscore neto bajo-medio).
  - S2 surface = 0.30·S4 + 0.25·S3 + 0.15·S5 + 0.15·S6, renormalizado sin G (÷0.85):
    `(0.30·96 + 0.25·96 + 0.15·97 + 0.15·35)/0.85 = (28.8+24.0+14.55+5.25)/0.85 = 72.6/0.85 ≈ **85**`.
  - **land_score** (S7 null, pesos §2.4 renormalizados ÷0.95):
    `(0.30·80 + 0.30·85 + 0.10·96 + 0.10·96 + 0.05·97 + 0.10·35)/0.95`
    `= (24.0+25.5+9.6+9.6+4.85+3.5)/0.95 = 77.05/0.95 ≈ **81 / 100**`.
  - Lectura: comp barato, ubicación excelente, pero con competencia inmediata que le baja S6.

### 6.2 Predio scorecard
- `ppm = 10,606` ⇒ **percentil 72.6** del mercado (caro) ⇒ `S1 = 100 − 73 ≈ **27**`.
- Kernels crudos (desde predio, validados vs `dist_predio_m`):
  `k_ancla = 24.05` (~p90 ⇒ `S4≈90`), `k_consumo = 8.29` (~p88 ⇒ `S3≈88`),
  `k_equip = 15.26` (>p95 ⇒ `S5≈97`), `k_sat = 0.38` (≈p85 pero absoluto bajo).
- S6 comp_net: 0 competidores <300 m, 2 <1000 m ⇒ saturación real **baja** ⇒ sat percentil moderado,
  val moderado ⇒ `comp_net ≈ 50 − 0.60·(70−50) + 0.30·(75−50) ≈ 50 −12 +7.5 ≈ **46**`
  (para un **desarrollador** esto es favorable: hay demanda validada y poca canibalización directa).
- S2 surface = `(0.30·90 + 0.25·88 + 0.15·97 + 0.15·46)/0.85 = (27+22+14.55+6.9)/0.85 = 70.45/0.85 ≈ **83**`.
- **Score por lente** (S7=null ⇒ su peso se reparte proporcional entre S1..S6):
  - *Desarrollador* (pesos ÷0.85): `(0.10·27+0.25·83+0.10·88+0.10·90+0.05·97+0.25·46)/0.85`
    `= (2.7+20.75+8.8+9.0+4.85+11.5)/0.85 = 57.6/0.85 ≈ **68**`.
  - *Comprador* (÷1.00, w7=0): `0.25·27+0.15·83+0.25·88+0.10·90+0.20·97+0.05·46`
    `= 6.75+12.45+22.0+9.0+19.4+2.3 ≈ **72**`.
  - *Inversionista* (÷0.70, w7 nulo repartido): `(0.20·27+0.15·83+0.10·88+0.10·90+0.05·97+0.10·46)/0.70`
    `= (5.4+12.45+8.8+9.0+4.85+4.6)/0.70 = 45.1/0.70 ≈ **64**`.
- **Veredicto (plantilla)**: "El predio es más atractivo para el **usuario final co-living** (score ~72,
  entorno de estilo de vida top-decil: consumo p88, equipamiento p97), y sólido para **desarrollador**
  (~68, poca competencia directa). Su punto débil transversal es el **precio** (S1≈27, $/m² en percentil
  73). Para top-decil como inversión necesitaría exposición a crecimiento (S7, hoy sin datos) o mejor
  precio de entrada."

> Los scores del ejemplo usan percentiles aproximados a mano; el script los computa exactos. Sirven como
> **rango de validación**: si la implementación produce land_score del comp[0] fuera de [76,86] o score
> desarrollador del predio fuera de [63,73], hay un bug.

---

## 7. Parámetros configurables (resumen para german)
```
NORM_MODE            = percentile        # o minmax
KERNELS              = ancla(3000,500) consumo(1200,300) equip(1000,300) comp_sat(800,150) comp_val(1500,400)
W_SAT, W_VAL         = 0.60, 0.30        # trade-off competencia
LAND_WEIGHTS         = S1 .30 S2 .30 S3 .10 S4 .10 S5 .05 S6 .10 S7 .05
LENS_DEV / _USER / _INV = matrices §3.1
GROWTH_KERNEL        = (4000,800)        # cuando exista inversion-proyectos.json
OUTLIER_CAP_M        = 50000
WINSOR               = [p5,p95]
```

## 8. Supuestos que requieren validación humana (los pesos son opinables)
1. **Población de referencia = 537 comps de Cimatario** (escala relativa, no absoluta) — §0.3.
2. **Trade-off de competencia** 0.60 saturación vs 0.30 validación (postura anti-sobreoferta) — §1.4.
3. **Redundancia S2 vs S3–S6**: se mantienen con pesos chicos por interpretabilidad — §2.3.
4. **Tres matrices de lentes** (§3.1): el parámetro más subjetivo; requieren revisión explícita.
5. **Radios/escalas de kernel** (ancla 3 km, consumo 1.2 km, etc.): definen qué es "cercano".
6. **Proxies declarados** (seguridad→equipamiento, yield→valor, liquidez→profundidad): son proxies, no
   medidas directas — §5.
7. **Pesos default de la superficie** 0.30/0.25/0.15/0.15/0.15 — §1.5.
```
```
