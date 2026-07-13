# methodology-inputs.md — Insumos por componente para METHODOLOGY.md v2 (Klugger)

> Documento de síntesis derivado de 23 extracciones estructuradas de literatura. Regla: **cero invención**. Cada ecuación cita su paper fuente. Donde una fuente no cubre lo pedido, se marca `⛔ VACÍO DE FUENTE`. Varias ecuaciones provienen de transcripts con `[pic]`/OCR degradado y están marcadas como *reconstrucción en prosa* — deben rotularse así en el METHODOLOGY.md, no como transcripción literal.

---

## Componente 1 — Hedónico + ajuste $/m² por tamaño de lote

Fuentes: Sopranzetti (Rosen 1974) · RPPI Handbook Cap. 5 (de Haan/Diewert) · Oikarinen (2009) · Guntermann et al. (2014) · Ritter et al. (2019) · Mayer & Nothaft.

### (a) Ecuaciones

**Forma funcional hedónica (Sopranzetti, Cap. 78; Rosen 1974)** — *reconstruidas de prosa, originales perdidas como `[pic]`*:

- Lineal aditivo (75.1): $E[\text{Price}] = X\beta,\ X=[S,N,L,C,T]$
- Semi-log (75.2–75.3): $\ln(\text{Price}) = X\beta + \varepsilon$
- Precio marginal semi-log (75.4): $\%\Delta\text{Value} = (e^{b}-1)\times 100$
- Box-Cox (75.5): $z^{(\lambda)} = \frac{z^{\lambda}-1}{\lambda}\ (\lambda\neq0);\ \ln z\ (\lambda=0)$
- Box-Cox generalizado (75.7): $\text{Price}^{(\lambda)} = \sum_j \beta_j X_j^{(\theta)} + \sum_{j,k}\gamma_{jk}X_j^{(\theta)}X_k^{(\theta)} + \varepsilon$

**Descomposición suelo/estructura (RPPI Handbook Cap. 5, de Haan/Diewert et al.)** — transcripción confiable (ecuaciones estándar):

- Lineal aditivo recomendado (5.29): $p_n^t = \alpha + \beta L_n^t + \gamma(1-\delta A_n^t)S_n^t + \tau^t + \epsilon_n^t$
- Estructura ajustada por depreciación lineal (5.26): $S_n^{*t} = (1-\delta A_n^t)S_n^t$
- Imputación por período (5.30): $p_n^t = \hat\alpha^t + \hat\beta^t L_n^t + \hat\gamma^t(1-\hat\delta^t A_n^t)S_n^t + \epsilon_n^t$
- log-lineal (5.3, NO usar para descomponer): $\ln p_n^t = \beta_0^t + \sum_k\beta_k^t\ln z_{nk}^t + \epsilon_n^t$

**Valor residual de suelo (Oikarinen 2009)**:
- $H = L + C\ (1)$ ; $L = H - C\ (2)$
- $\Delta H = w\Delta L + (1-w)\Delta C\ (3)$
- LR con tendencia (validada cointegrada): $H_t = \phi + \beta_1 L_t + \beta_2 C_t + \beta_3 U_t + \delta t + \epsilon_t\ (6)$
- Resultado Helsinki: $H = .337 + .311L + .643C - 1.902U + .002t$ (ilustrativo, NO reutilizar coeficientes)

**Tamaño de parcela — plottage/plattage (Guntermann et al. 2014)** — transcripción fiel:
- Paramétrico Colwell-Sirmans (1): $\ln[y_i] = \ln[\beta_0^p] + \beta_1^p D_i + \beta_2^p(A_i-\delta)^{1/3} + \epsilon_i$
- Log-lineal benchmark (2): $\ln[y_i] = \ln[\beta_0] + \beta_1 D_i + \beta_3\ln[A_i] + \epsilon_i$ — $\beta_3<1$ plattage, $\beta_3>1$ plottage, $\beta_3=1$ proporcional
- J-test (3): agregar $\gamma Y_{est}$; $\gamma$ no significativo ⇒ rechaza coexistencia plottage/plattage
- Semi-paramétrico kernel (4): $y_i^{sp}=g(A_i)+\beta_1^{sp}D_i+\epsilon_i$, bandwidth $h=n^{-0.2}$
- Box-Tidwell (9-10): $h_r(A_i,\lambda_r)=\frac{A_i^{\lambda_r}-1}{\lambda_r}$; $\lambda>1$ convexo (plottage), $\lambda<1$ cóncavo (plattage)
- Covarianza espacial (7a-c): $\Sigma_{ij}^{ss}=\tau^2+\sigma^2\rho(d_{ij},\phi)$

**Tamaño de parcela — forma inversa-lineal-cuadrática (Ritter et al. 2019, P2)**:
- Hedónico base: $\log P_i = \beta_0 + f(A_i) + \beta_1 Q_i + \dots + u_i$
- Model 1: $f(A_i) = a_1 A_i^{-1} + a_2 A_i + a_3 A_i^{2}$ (prima lote chico + escala + reversión lote grande)
- Model 2 (interacción tipo suelo), Model 3 (+ tipo comprador)
- Elasticidad meta-análisis: $\hat\theta_{overall}=-0.14$ (IC95% −0.18,−0.10), $I^2=99.8\%$ — NO tomar como efecto universal

**Sesgo asking-vs-cierre (Mayer & Nothaft)** — *el paper NO trae fórmulas; solo prosa/resultados*:
- Diferencial comp-sujeto (definición verbal): $\text{Dif}_\% = \frac{P_{comp}-P_{contrato}}{P_{contrato}}\times100$
- Logit selección: $Y_i=\mathbb{1}[P_{comp,i}>(1+\theta)P_{contrato}],\ \theta\in\{0.05,0.10\}$
- Resultados: comps altos +11.93% pre-ajuste → +7.32% post; comps bajos −7.23% → −2.28%. Asimetría: ajuste a la baja de comps caros (−3.75%) < ajuste al alza de comps baratos (+5.68%) ⇒ sobrevaluación residual. ~40% de comps eran *listings* activos. No da magnitud del descuento asking→cierre.

### (b) Método / pseudocódigo
1. Elegir forma funcional por reemplazabilidad del activo (Sopranzetti): terreno/predio único ⇒ **semi-log por defecto**; Box-Cox solo si hay mala especificación de curvatura y datos suficientes (λ estimado por ML, no impuesto).
2. Para descomponer suelo/estructura (RPPI 5.29): correr OLS lineal aditivo con L, S, A; leer β̂=$/m² suelo, γ̂=$/m² estructura nueva, δ̂=depreciación por década. **Reportar errores estándar** de β̂,γ̂ (riesgo multicolinealidad L–S, 5.8).
3. Para efecto tamaño de lote: **LOWESS exploratorio** (Ritter, grado 1, bandwidth 0.3) para detectar forma → luego especificar paramétrico (inversa+lineal+cuadrático) o detectar punto de inflexión δ (Guntermann). Método recomendado por costo/muestra: **semi-paramétrico kernel** como primera aproximación + paramétrico (Colwell-Sirmans + J-test) como chequeo; Bayesiano MCMC solo si hay autocorrelación espacial fuerte y se requieren probabilidades posteriores.
4. Índice temporal de zona: imputación por período (Fisher) preferido sobre time-dummy (RPPI); aplicar rezago/suavizado HP entre precio de vivienda y de suelo (Oikarinen: L sigue a H con rezago de varios trimestres, ~10T al pico).
5. Comps: penalizar/excluir *listings* activos vs ventas cerradas; ajuste simétrico para no replicar sesgo alcista (Mayer & Nothaft).

### (c) Decisión de diseño Klugger
- **Regresión de precio en semi-log** sobre X=[S,N,L,C,T]; coeficientes reportados como % de valor vía $(e^b-1)$.
- **Descomposición aditiva suelo/estructura (5.29)** como motor HBV: `valor_suelo = β̂·L`; `valor_estructura = γ̂·(1-δ̂·A)·S`. Base para detectar predios subutilizados/land-banking (comparar valor_suelo_implícito vs valor_total).
- **Curva tamaño-lote en S** con punto de inflexión δ por submercado (no lineal): premio a lotes chicos (plottage/ensamblaje) y descuento a lotes grandes (plattage/subdivisión); accionable mínimo = correr (2) con β₃ libre por zona.
- **Valor residual de suelo** L=H−C cuando falta comp directo de lote.
- Tratar *listings* como fuente de sesgo alcista distinta de cierres en el pipeline de comps.

### (d) Caveats
- Ecuaciones Sopranzetti son reconstrucción de prosa (`[pic]`), no transcripción. Rosen nunca fijó forma funcional; coeficientes hedónicos NO robustos a especificación (omitted-variable bias) → pesos del scoring son sensibles, no verdades causales fijas. Identification/equilibrium pricing problem.
- RPPI: NO usar log-lineal para descomponer suelo/estructura (interacción multiplicativa implausible). Decomposición detallada remitida a Cap. 8 (no extraído). Depreciación es straight-line neta, no geométrica.
- Oikarinen es macro-series agregadas (Helsinki), NO hedónico de parcela: no da coeficientes por tamaño de lote. Resultado lead-lag específico de mercado con zonificación estricta; correlación cruda 0.12 vs 0.77 filtrada HP (ruido alto, thin trading).
- Guntermann: método paramétrico falla cuando δ está en la cola / pocas parcelas chicas; kernel Gaussiano errático en colas; ni +muestra corrige salvo Bayesiano. NO trasladar coeficientes numéricos.
- Ritter P2: $I^2=99.8\%$, forma re-derivar por dataset (LOWESS); riesgo confusión tamaño×tipo de vendedor.
- Mayer & Nothaft: sin fórmulas matemáticas, sin magnitud del factor list-to-sale, datos EE.UU. hipotecario. Tabla 3B corrupta.

---

## Componente 2 — Reconciliación absoluta IVS 105 (sin promediar)

Fuente principal buscada: IVS 400/410/105. Fuente complementaria real: Appraisal of Real Estate Cap. 25 (ver Comp. 10) y RICS (Comp. 10).

### (a) Ecuaciones
⛔ **VACÍO DE FUENTE.** El único documento IVS disponible es el *Exposure Draft Summary and Consultation Questions* (IVSC, consulta 31-ene-2026 a 30-abr-2026) — documento de gobernanza, **sin texto normativo, sin fórmulas, sin la definición de "reconciliación sin promediar"**. Única mención tangencial: pregunta #28 (reordenamiento de "basic elements" del método residual de development property en IVS 400). Páginas 7-8 del PDF fallaron en OCR.

### (b) Método
- IVSC anuncia: fusión IVS 400 (Real Property Interests) + IVS 410 (Development Property); IVS 106→renombrado IVS 105 (Valuation Models) con requisitos de IA/herramientas; nuevo IVS 107 Quality Controls; inspección obligatoria (IVS 400 §40.02-40.05).
- El concepto de "Reconciliation" vive en el texto completo de IVS 105, **no presente** en este resumen.

### (c) Decisión de diseño Klugger
- La lógica de "reconciliación ponderada, NO promedio simple" debe tomarse operativamente del **Appraisal of Real Estate Cap. 25** (Componente 10): ponderar las indicaciones de valor por Appropriateness / Accuracy / Quality of Evidence, con chequeo de consistencia HBU previo, y exponer resultado como **rango/banda**, no punto único ni media.
- **NO escribir la sección IVS 105 del METHODOLOGY.md v2 con esta fuente.**

### (d) Caveats
- Documento es exposure draft/consulta, vigencia propuesta 2028; puede cambiar. **Conseguir texto completo de IVS 400 (Residual Method) e IVS 105 (Reconciliation)** antes de redactar. Re-priorizar la búsqueda documental.

---

## Componente 3 — Econometría espacial (OLS → Moran I → LM → SAR/SEM/SDM)

Fuentes: LeSage & Pace (2009) · Anselin & Rey (PySAL workbook Cap. 3).

### (a) Ecuaciones (LeSage & Pace — estándar, verificables contra Anselin 1988/LeSage 2007)

- W row-standardized: $\sum_j w_{ij}=1$, $w_{ii}=0$
- Multiplicador espacial: $S(\rho)=(I_n-\rho W)^{-1}=I_n+\rho W+\rho^2 W^2+\dots$
- **SAR/SLM**: $y=\rho Wy + X\beta + \epsilon$
- **SEM**: $y=X\beta+u,\ u=\lambda Wu+\epsilon$
- **SDM** (recomendado como punto de partida): $y=\rho Wy + X\beta + WX\gamma + \epsilon$
- **SDEM**: $y=X\beta+WX\gamma+u,\ u=\lambda Wu+\epsilon$
- **SAC/SARAR**: $y=\rho W_1 y+X\beta+u,\ u=(I_n-\lambda W_2)^{-1}\epsilon$
- Log-verosim. SAR concentrada: $\ln L_c=-\frac{n}{2}\ln(\hat\sigma^2)+\ln|I_n-\rho W|$
- ML β,σ² dado ρ: $\hat\beta=(X'X)^{-1}X'(y-\rho Wy)$, $\hat\sigma^2=\frac1n(y-\rho Wy)'M_X(y-\rho Wy)$
- SEM concentrado: $S(\lambda)=e_0'e_0-2\lambda e_0'e_d+\lambda^2 e_d'e_d$
- **Efectos SDM**: $\frac{\partial y}{\partial x_k'}=(I_n-\rho W)^{-1}(\beta_k I_n+\theta_k W)$ → Directo (diag), Indirecto/spillover (off-diag), Total
- OLS sesgado bajo SAR: $E(\hat\beta_{OLS})=\beta+(X'X)^{-1}X'W(I_n-\rho W)^{-1}X\beta$
- **Moran's I**: $I=\frac{n}{\sum_i\sum_j w_{ij}}\cdot\frac{\sum_i\sum_j w_{ij}(y_i-\bar y)(y_j-\bar y)}{\sum_i(y_i-\bar y)^2}$
- Log-det vía eigenvalues: $\ln|I_n-\rho W|=\sum_i\ln(1-\rho\lambda_i)$; rango: $1/\lambda_{min}<\rho<1/\lambda_{max}$
- Spatial Tobit (precios censurados): $y^*=X\beta+\rho Wy^*+\epsilon$

**W y pesos (Anselin & Rey, Cap. 3)**:
- Row-standardization: $W_{ij}^{(s)}=W_{ij}/\sum_j W_{ij}$
- Spatial lag: $[Wy]_i=\sum_j W_{ij}y_j$
- Auxiliares: $S_0=\sum\sum W_{ij}$, $S_1=\sum\sum(W_{ij}+W_{ji})^2$, $S_2=\sum_j(\sum_i W_{ij}+\sum_i W_{ji})^2$

### (b) Método / pipeline
1. Construir **W** (row-standardized). Para predios como **puntos** (caso Klugger): usar pesos por **distancia inversa o KNN** (Cap. 4, no extraído) o teselación Thiessen antes de contigüidad rook/queen. Detectar y tratar **isolates** (fila W=0).
2. Estimar hedónico base OLS → **Moran's I** sobre residuos para detectar autocorrelación no explicada.
3. LM tests (robustos) para elegir SAR vs SEM. ⛔ **Fórmulas de LM y Moran robustos NO están en Anselin & Rey Cap. 3** (remiten a Cap. 5, no extraído; solo mencionan $tr(WW+W'W)$, Eq. 5.15).
4. Especificar **SDM** como modelo general (nesta SAR, aproxima SEM); estimar por **ML concentrada** (viable para cientos-miles de comps; log-det exacto vía eigenvalues, sin Chebyshev salvo n muy grande).
5. Descomponer en efectos Directo/Indirecto/Total (β_k NO es efecto marginal cuando hay Wy).

### (c) Decisión de diseño Klugger
- W (KNN/dist-inversa sobre coords de comps) = infraestructura faltante para pasar de scoring por-atributos a scoring con spillovers.
- **SDM sobre log(precio)** con X=atributos del predio y WX=promedios de vecindario → captura contagio de precios (ρWy) + efectos de vecindario (γ).
- Efecto Directo vs Indirecto = separación rigurosa de valor intrínseco vs valor de ubicación/entorno para HBU.
- Si solo se quiere corregir errores estándar: SEM (más simple).
- Spatial Tobit como precedente si hay precios con topes/pisos (reservas, subastas).

### (d) Caveats
- Transcript LeSage & Pace es "chunked" por Gemini con secciones desordenadas/duplicadas y huecos OCR (pág. 33-40, 66-73). Ecuaciones tratadas como confiables por ser canónicas; **cifras de ejemplo (ρ=0.45) son ilustrativas, no reusables**.
- Anselin & Rey: solo Cap. 3 (pesos). **Conseguir Cap. 5 para Moran's I y LM robustos**. Variance-stabilizing rara vez usada; S1/S2 no son features por sí solos. Contigüidad es para polígonos; Klugger con puntos ⇒ verificar Cap. 4 (distancia).

---

## Componente 4 — MGWR (bandwidth por AICc) + distancia de red

Fuentes: Fotheringham, Yang & Kang (2017) MGWR · Lu, Charlton, Harris & Fotheringham (2014) GWR no-euclidiana.

### (a) Ecuaciones

**MGWR (Fotheringham et al. 2017)**:
- GWR base: $y_i=\sum_{j=0}^m\beta_j(u_i,v_i)x_{ij}+\epsilon_i$
- MGWR: $y_i=\sum_{j=0}^m\beta_{b_{wj}}(u_i,v_i)x_{ij}+\epsilon_i$ (bandwidth propio $b_{wj}$ por variable)
- AICc: $\text{AICc}=2n\ln(\hat\sigma)+n\ln(2\pi)+n\frac{n+\text{tr}(S)}{n-2-\text{tr}(S)}$
- Estimador WLS: $\hat\beta(u_i,v_i)=[X^TW(u_i,v_i)X]^{-1}X^TW(u_i,v_i)y$
- Convergencia SOC-f (recomendada, umbral $10^{-5}$): $\text{SOC}_f=\frac{\sum_i\sum_j(\hat f_{ij}^{new}-\hat f_{ij}^{old})^2}{\sum_i\sum_j(\hat f_{ij}^{new})^2}$
- Kernel bicuadrado adaptativo: $W_{ij}=[1-(d_{ij}/G_i)^2]^2$ si $d_{ij}<G_i$, 0 si no ($G_i$=distancia al M-ésimo vecino)

**GWR distancia no-euclidiana (Lu et al. 2014)**:
- $y_i=\beta_{i0}+\sum_{k=1}^m\beta_{ik}x_{ik}+\epsilon_i$ (1)
- $\hat\beta_i=(X^TW_iX)^{-1}X^TW_i y$ (2)
- Kernel Gaussiano: $w_{ij}=\exp[-\frac12(d_{ij}/b)^2]$ (3) — **$d_{ij}$ puede ser distancia de red (ND) o tiempo de viaje (TT), sin cambiar el marco**
- AICc (4): igual forma que arriba — usar AICc (no CV) al comparar métricas de distancia
- Hat row (5): $r_i=X_i(X^TW_iX)^{-1}X^TW_i$

### (b) Método
1. **Estandarizar** todas las variables (media 0, sd 1) — obligatorio en MGWR para que los bandwidths sean comparables como escala del proceso.
2. Back-fitting estilo GAM: inicializar $f_j$ con estimaciones GWR clásicas; iterar variable por variable, ajustar GWR univariante del residuo parcial contra $x_j$ variando bandwidth y minimizando AICc por variable; repetir hasta SOC-f < $10^{-5}$ (~5-40 iteraciones).
3. Interpretar bandwidth: grande=proceso global/homogéneo; intermedio=regional; pequeño=hiperlocal.
4. Para ponderación de comps con barreras físicas: reemplazar $d_{ij}$ euclidiana por **distancia de red vial / tiempo de viaje** en el kernel (Lu). Calibrar bandwidth (=radio de comps efectivo) minimizando **AICc**, no radio fijo.

### (c) Decisión de diseño Klugger
- Sustituir el radio único de "vecinos comparables" por **un bandwidth por variable** (AICc): p.ej. distancia a CBD/costa a escala regional, elevación/servicios a escala hiperlocal.
- El bandwidth resultante indica si un driver de valor es local (submercado/manzana) o regional/ciudad → justifica qué variables usan comps cercanos vs de toda la zona en el HBV.
- Usar **distancia de red** en el kernel de ponderación de comps cuando haya barreras (ríos, autopistas, accesibilidad fragmentada en el AMBA).

### (d) Caveats
- **NO existe AICc global válido para MGWR completo** (cada covariable tiene su matriz de pesos): el paper usa RSS como bondad de ajuste global (no unit-free, no penaliza complejidad). **No hay marco inferencial (errores estándar locales, t-stats, R² local)** para MGWR — investigación futura (bootstrap/Monte Carlo).
- Costo computacional: MGWR ~8× GWR (51h en caso empírico de 2317 obs × 8 vars) — factor crítico si Klugger corre sobre miles de comps.
- Lu: casas no exactamente sobre la red (proxy al punto más cercano, sesgo en ND/TT); mejora "a menudo pequeña o sutil"; resultados específicos a Londres 2001; **usar AICc, no CV**; GWR no-euclidiana como *predictor* queda pendiente de validar (es justo el caso Klugger).

---

## Componente 5 — Pesos formales (BWM/AHP + entropía) + PCA

Fuentes: BWM (Bozorg-Haddad et al., Cap. 5) · Shannon (1948). AHP: solo referido dentro de BWM. PCA y entropy-weight-method operativo: sin fuente.

### (a) Ecuaciones

**BWM (Bozorg-Haddad, Zolghadr-Asli & Loáiciga, Cap. 5)** — transcripción fiel:
- Desempeño ponderado (5.2): $V_i=\sum_{j=1}^n w_j\, r_{(i,j)}$
- Matriz pareada recíproca (5.3-5.4): $P_{(i,i)}=1$, $P_{(i,j)}=1/P_{(j,i)}$
- Vectores B-a-otros / otros-a-W (5.9-5.10): $A_B=[P_{(B,1)},\dots]$, $A_W=[P_{(1,W)},\dots]$
- Relación peso-preferencia (5.11-5.12): $P_{(B,j)}=w_B/w_j$, $P_{(j,W)}=w_j/w_W$
- **LP (5.14)**: $\min\xi$ s.a. $|w_B/w_j-P_{(B,j)}|\le\xi$, $|w_j/w_W-P_{(j,W)}|\le\xi$, $\sum w_j=1$, $w_j\ge0$
- Índice inconsistencia (5.17-5.18): $(\xi^*)^2-[1+2P_{(B,W)}]\xi^*+[P_{(B,W)}]^2-P_{(B,W)}=0$ (tabulado: ξ*=0,0.44,1,1.63,2.30,3,3.73,4.47,5.23)
- **Ratio de inconsistencia (5.19)**: $BIR=\xi/\xi^*$

**Entropía de Shannon (1948)** — fuente teórica canónica:
- $H=-K\sum_{i=1}^n p_i\log p_i$ (K=unidad); forma reducida $H=-\sum p_i\log p_i$
- Fuente Markoff: $H=\sum_i P_i H_i$
- $H=0 \iff$ certeza total (una $p_i=1$)

### (b) Método
- **BWM**: (1) definir criterios + matriz normalizada; (2) decisor identifica criterio mejor (B) y peor (W); (3) comparar solo B-vs-todos y todos-vs-W en escala Saaty 1-9 (**2n−3 comparaciones** vs n(n-1)/2 de AHP); (4) resolver LP para w_j* minimizando ξ; (5) medir consistencia BIR=ξ/ξ*.
- **Entropy weight method operativo**: normalizar cada variable a $p_{ij}$ por columna → $H_j$ → grado de diversificación $d_j=1-H_j/\ln m$ → pesos $w_j=d_j/\sum d_j$. ⛔ **Solo el fundamento $H=-\sum p_i\log p_i$ está en Shannon; el pipeline $d_j$, $w_j$ NO está en ninguna fuente extraída.**

### (c) Decisión de diseño Klugger
- Usar **BWM** como alternativa/auditoría a AHP para ponderar atributos del scoring HBU/HBV (zonificación, accesibilidad, demanda, topología/FAL): menos comparaciones + chequeo explícito de consistencia (BIR).
- Combinar pesos subjetivos (BWM) con pesos objetivos por entropía (reduce dependencia de juicio experto).

### (d) Caveats / VACÍOS
- ⛔ **PCA: sin fuente extraída.** No hay ninguna referencia a PCA para colapsar redundancia entre variables. Conseguir fuente antes de redactar.
- ⛔ **AHP clásico (Saaty): sin fuente dedicada** (solo mencionado como comparación dentro de BWM).
- ⛔ **Entropy weight method aplicado a matriz de decisión: sin fuente.** Shannon es teoría de comunicación, no scoring; citarlo como "pesos objetivos por entropía" sería impreciso — solo respalda la definición de H. Fuente que asignaron a AHP-Entropía (Kantianis urbansci-10-00134) era **paper equivocado** (es Real Options → ver Componente 8).
- BWM es P3/método MADM genérico; depende de juicios subjetivos (Dyer 1990). No aporta al triage documental.

---

## Componente 6 — Validación IAAO (COD/PRD/PRB/PPE/FSD + hold-out)

Fuentes: OPA Philadelphia Ratio Studies (aplica IAAO Standard on Ratio Studies 2013) · IAAO Standard on Mass Appraisal 2025 (corrupto).

### (a) Ecuaciones (OPA, aplicando IAAO 2013)
- Ratio individual: $Ratio_i=\frac{AssessedValue_i}{TASP_i}$ (TASP = Time Adjusted Sales Price; usar **mediana**)
- **COD**: $COD=100\times\frac{\frac1n\sum_i|Ratio_i-MedianRatio|}{MedianRatio}$
- **PRD**: $PRD=\frac{MeanRatio}{WeightedMeanRatio}$, $WeightedMeanRatio=\frac{\sum AssessedValue_i}{\sum TASP_i}$
- **PRB**: ⛔ fórmula NO en transcript; solo resultado tabulado (PRB=−0.035, t=2.4). No inventar.

### (b) Método
- Segmentar por zona (GMA-equivalente) y tipo de propiedad/uso; para cada segmento reportar: (1) nivel (mediana de ratio), (2) uniformidad (COD), (3) equidad vertical (PRD, PRB).
- Solo ventas arm's-length; remover outliers con Cook's Distance + Studentized Residuals. Ajuste temporal multi-año por índice compuesto de regresión.
- **Bandas objetivo IAAO**: nivel 0.90–1.10; COD 5–15% (residencial homogéneo), hasta 20–25% (usos heterogéneos/vacant land); PRD 0.98–1.03.

### (c) Decisión de diseño Klugger
- Capa de auditoría/QA post-hoc sobre los outputs HBV: mediana de razón (modelo vs mercado) por zona, COD por zona/tipo, PRD sobre outputs para detectar sesgo bajo/alto valor.
- Segmentación GMA + tipo/estilo como en OPA.

### (d) Caveats / VACÍOS
- ⛔ **PRB: fórmula ausente** — consultar IAAO Standard on Ratio Studies (2013) directo.
- ⛔ **PPE (Price-Related... /Predictive?) y FSD (Forecast Standard Deviation): NO mencionados en ninguna fuente extraída.** Conseguir fuente.
- ⛔ **Hold-out / validación out-of-sample: sin fuente extraída.**
- ⛔ **IAAO Standard on Mass Appraisal 2025: transcript CORRUPTO** (solo 63 líneas de portada/índice, cero cuerpo técnico). No usar. Re-subir PDF (idealmente Section 3, única revisada en 2025).
- OPA: COD<5.0 puede indicar sales-chasing (alerta, no calidad); PRD menos fiable en muestras chicas/wide variation; sesgos en extremos de precio. Es reporte institucional, no paper.

---

## Componente 7 — Monte Carlo (Lognormal/Triangular/Beta/Normal; SIN GBM ni tasas diferenciadas; +VaR/CVaR)

Fuente parcial: RICS Valuation of Development Property (2020) — sensibilidad/escenarios/simulación.

### (a) Ecuaciones
- Método residual básico (RICS App. B2): $LV_0=(1+i)^{-t}[DV_0(1-p)-DC_0-I]$
- Conceptual: $\text{GDV}-\text{costos totales (incl. profit)}=\text{Residual land value}$
- NPV (descrito en prosa): $\text{NPV}=\sum_t\frac{CF_t}{(1+r)^t}$; IRR: $\text{NPV}(IRR)=0$

### (b) Método (RICS, jerarquía de análisis de riesgo)
1. **Sensitivity analysis** (mínimo obligatorio conceptual): variar inputs uno a la vez (costo construcción, GDV/precio venta, tasa financiamiento) y medir impacto en LV.
2. **Scenario modelling**: combinaciones de inputs (optimista/base/pesimista).
3. **Simulation (Monte Carlo, sin nombrarlo así)**: asignar probabilidades/varianzas a inputs clave, correr múltiples corridas estocásticas. Declarar explícitamente en el reporte la base racional de las distribuciones y correlaciones elegidas (RICS 7.1.6).
4. **NUNCA confiar en un único método/valor** (RICS 7.1.2); cross-check obligatorio contra comparables (7.1.10).

### (c) Decisión de diseño Klugger
- Reportar el residual como **banda/escenarios**, no punto único, ante variación de costo/GDV/tasa.
- Aplicar Monte Carlo sobre los inputs del residual $LV_0$ para el HBV; declarar distribuciones y correlaciones.

### (d) Caveats / VACÍOS
- ⛔ **Distribuciones específicas (Lognormal, Triangular, Beta, Normal): SIN fuente extraída.** RICS solo describe simulación cualitativamente ("varianzas aplicadas a inputs clave... proceso estocástico"), sin especificar familias de distribución.
- ⛔ **VaR / CVaR: NO mencionados en ninguna fuente extraída.** Conseguir fuente.
- ⛔ La consigna "SIN GBM ni tasas diferenciadas" es una decisión de diseño de Klugger, no algo respaldado/refutado por fuente — documentarla como criterio propio (contrasta con GBM de Titman/Williams/Quigg, Componente 8).
- RICS: técnicas de riesgo dependen enteramente de supuestos subjetivos sobre distribuciones/correlaciones; el basic residual "subject to major scrutiny" por no capturar cambios de valor/costo en el tiempo.

---

## Componente 8 — Opción real (LSM/binomial; NO Williams/Quigg flawed)

Fuentes: Kantianis, Tsiotas & Krabokoukis (Urban Science, deferral option — mal filado bajo AHP) · Titman 1985 (flawed) · Williams 1991 (flawed) · Quigg 1993 (sensible).

### (a) Ecuaciones

**Kantianis et al. (Real Options / deferral option)** — la fuente aplicable al enfoque binomial/no-flawed:
- ⛔ Las ecuaciones específicas (Black-Scholes, árbol binomial/BLOP para NPV expandido) **NO fueron extraídas** — la extracción solo describe que el paper compara DCF/NPV clásico vs opciones reales (Black-Scholes y binomial lattice) para la opción de diferir un edificio de oficinas. **Re-extraer este paper (urbansci-10-00134) para el Componente 8.**

**Titman 1985 (P2, CONCEPTUAL, flawed)** — solo fundamento teórico:
- Beneficio: $\Pi(p_0)=p_0 q - C(q)$; FOC: $dC/dq=p_0$
- Jensen: $E(\Pi(\tilde p_1))>\Pi(E(p_1))$ (convexidad ⇒ incertidumbre aumenta valor de esperar)
- Valor suelo por state prices: $V=\Pi(p_h)s_h+\Pi(p_l)s_l$
- Estática: $\partial V/\partial p_0>0$, $\partial V/\partial R_f<0$, $\partial V/\partial R_r<0$; mayor dispersión ⇒ mayor V
- Multi-periodo (inducción hacia atrás): $\Pi_t=\max\{\Pi(p_t),V_t\}$, $V_t=s_h\Pi_{t+1,h}+s_l\Pi_{t+1,l}$

**Williams 1991 (P2, flawed)**:
- GBM costo/renta: $dx_i=\mu_i x_i dt+\sigma_i x_i dz_i$
- PDE 2 factores; solución en 3 tramos para densidad óptima q* y ratio y*=x2/x1
- Costo Cobb-Douglas convexo $q x_1^\gamma$, γ>1

**Quigg 1993 (JIF sólido, sensible a calibración)**:
- $X=f+q^\gamma x_1$; $dX/X=\alpha_x dt+\sigma_x dz_x$
- PDE (4) reducida a ODE en z=P/X (5); solución cerrada (6) con hurdle $z^*=j(1+k)/(j-1)$
- Valor intrínseco (DCF puro, límite ω→0): $V^I=P-X$ si $z\ge1+k$
- **Hedónico (útil, no flawed) (9)**: $\log P_i=c+\phi\log q_i+\psi\log LSF_i+a_1HT_i+a_2HT_i^2+a_3AGE_i+b'L_i+d'Q_i+e_i$
- Premio por opción: (Valor Opción − Intrínseco)/Valor Opción, media 6% (1-30%)

### (b) Método
- Enfoque no-flawed recomendado: **árbol binomial / LSM** (Longstaff-Schwartz) para valorar la opción de diferir desarrollo. ⛔ **LSM no tiene fuente extraída**; el binomial está solo en Kantianis (no extraído en detalle).
- Regla de decisión (Titman/Quigg): mantener suelo vacante si Valor-Opción > Valor-Intrínseco/residual estático; hurdle ratio z*=1+k dispara desarrollo.
- Hedónico de Quigg (9/10): predecir precio de edificio potencial sobre terreno vacante, segmentado por zonificación y período.

### (c) Decisión de diseño Klugger
- Tratar la **opción de espera** como capa de valor separada del residual estático: mayor incertidumbre/volatilidad ⇒ mayor valor de mantener vacante/subutilizado (dirección conceptual, no motor cuantitativo con Titman/Williams).
- Usar la **regresión hedónica de Quigg (9/10)** con confianza como patrón de comps (segmentar por uso/año) — es la pieza no-flawed.
- Implementar la opcionalidad con **binomial/LSM** (Kantianis, re-extraer), NO con Black-Scholes de Williams/Quigg (marcados flawed para producción).

### (d) Caveats
- Titman/Williams: **flawed/conceptual** — supuestos de mercado replicable de "unidades de edificio", costos ciertos, 2 estados, sin equilibrio de mercado, sin geoespacial/comps. Solo marco teórico, NO cálculo productivo. Williams: modelo con abandono sin solución cerrada; Clarke-Reed degenera con β=0.
- Quigg: **extremadamente sensible a γ y β** (no observables, calibrados ex-post ⇒ riesgo sobreajuste); equilibrio parcial (P exógeno); errors-in-variables sesga al alza el valor de opción; datos Seattle 1976-79 no generalizables; q* fijo subestima opción. Usar hedónico con confianza, capa de opción como exploratoria.
- ⛔ Kantianis (fuente correcta para binomial/deferral) fue mal clasificado bajo "AHP-Entropía" — **re-extraer sus ecuaciones**. ⛔ LSM sin fuente.

---

## Componente 9 — Fiscalidad ISR/IVA + estructura de capital

### (a) Ecuaciones
⛔ **VACÍO TOTAL DE FUENTE.** Ninguna de las 23 extracciones cubre fiscalidad mexicana (ISR/IVA) ni estructura de capital de forma operativa.

Fragmentos tangenciales disponibles:
- RICS: financiamiento al 100% de suelo+construcción (B2.2.2.1); intereses I tratados como descuento del residual; profit-as-residual (invertir el método si el precio del suelo es conocido → residual = utilidad, lump sum o IRR).
- Geltner & Miller (Cap. 1): cap rate = NOI/Property Value (antes de deuda); 3 drivers del cap rate (costo de oportunidad, crecimiento esperado, riesgo). Nota: cap rate aplica a NOI antes de hipoteca, no al equity investor.

### (b/c/d)
- ⛔ **Conseguir fuente específica de fiscalidad inmobiliaria México (ISR sobre enajenación, IVA en construcción/terreno, depreciación fiscal de mejoras) y de estructura de capital/WACC.** No redactar esta sección con las extracciones actuales.
- Único puente conceptual: Sopranzetti menciona uso de Box-Cox para extraer tasas de depreciación a efectos fiscales (Hulten & Wycoff 1981) — análogo a depreciación/vida útil de mejoras en HBV, pero no es fiscalidad ISR/IVA.

---

## Componente 10 — HBU 4 pruebas + 3 enfoques (Appraisal of Real Estate)

Fuentes: The Appraisal of Real Estate 3rd Cdn Ed. (BUSI 330 Review Notes, Chuck Dunn) · RICS Valuation of Development Property · Geltner & Miller (bloqueado en DCF/RLV).

### (a) Ecuaciones (Appraisal of Real Estate — notas de repaso, cualitativas + fórmulas)
- Indexación de costo: $\text{Current Cost}=\text{Original Cost}\times\frac{\text{Current Index}}{\text{Original Index}}$
- Depreciación edad-vida: $\text{Depreciation}=\frac{\text{Effective Age}}{\text{Economic Life}}\times\text{Cost New}$
- Extracción de mercado: $\text{Depreciation}=\text{Cost New}-(\text{Sale Price}-\text{Land Value})$
- **Cost Approach**: $V_{cost}=\text{Land Value}+(\text{Cost New}-\text{Accrued Depreciation})$
- **Direct Capitalization**: $V=\frac{NOI}{R_O}$; $R_O=\frac{NIR}{EGIM}$, $NIR=1-OER$

**RICS residual (ver también Comp. 7)**: $LV_0=(1+i)^{-t}[DV_0(1-p)-DC_0-I]$

### (b) Método

**HBU — 4 tests EN ORDEN ESTRICTO (eliminatorios en cascada, NO ponderados)** (Cap. 12):
1. **Legally Permissible** (zoning, título, códigos, ambiental)
2. **Physically Possible** (tamaño, forma, topografía, suelo, utilities)
3. **Financially Feasible** (valor > costo de desarrollo; para income property: NOI proyectado y retorno ≥ tasa de mercado)
4. **Maximally Productive** (entre los que pasaron 1-3, el de mayor **valor residual de terreno**)

Analizar **HBU "as vacant"** (qué construir) y **HBU "as improved"** (continuar/modificar/demoler). Casos: assemblage, interim use (5-7 años), legally nonconforming, consistent use.

**Valuación del terreno — 6 métodos jerarquizados** (Cap. 16): Direct Comparison (preferido) > Allocation > Extraction > Land Residual > Ground Rent Capitalization > Subdivision Development.

**3 enfoques**: Cost (5 pasos, techo de valor para nuevos) · Direct Comparison (Cap. 15) · Income/Direct Capitalization (Cap. 20/22).

**Reconciliación (Cap. 25) — NO promediar**: ponderar las 3 indicaciones por **Appropriateness / Accuracy / Quality of Evidence**; chequeos de consistencia previos (HBU, misma definición de valor, derechos consistentes, lectura de mercado uniforme); resultado = cifra única o **rango** (rango preferido en teoría; cifra única exigida para impuestos/expropiación/hipoteca).

**HBU RICS**: uso físicamente posible + financieramente factible + legal (IVS 104 §140); development property = redesarrollo requerido para alcanzar HBU.

### (c) Decisión de diseño Klugger
1. **Pipeline de filtrado secuencial** (4 tests como cascada eliminatoria, NO score compuesto desde el inicio).
2. Dos outputs por predio: HBU-as-vacant vs HBU-as-improved → **gap de oportunidad** (redesarrollo/mispricing).
3. **Valor residual de terreno** como criterio de desempate en "Maximally Productive" (LV_0 de RICS por escenario de uso: DV_0=GDV proyectado desde comps×densidad; DC_0=costos por tipología; p=margen target; i=tasa; t=periodo).
4. **Reconciliación = scoring ponderado dinámico** (esta es la fuente operativa del Componente 2): pesos por fuente según Quality of Evidence (pocos comps ⇒ bajar peso sales-comparison, subir cost/income); exponer **banda de confianza**, no promedio.
5. Interim use marcable como score temporal con revalorización esperada.
6. Cost approach como techo/sanity-check para predios sin comps.

### (d) Caveats
- Appraisal: transcript es **Review Notes** (Chuck Dunn), no el libro completo; huecos OCR (págs. 73-80, 81-88, 121-128). **Land Residual: sin fórmula matemática en el transcript** (solo conceptual, remite a Cap. 22 truncado) — no inventar. Yield capitalization fuera de alcance BUSI 330. Cost Approach $V_{cost}$ reconstruida de los 5 pasos.
- RICS: basic residual "major scrutiny"; nunca prescribe básico vs DCF (decisión del valuador); técnicas de riesgo dependen de supuestos subjetivos.
- **Geltner & Miller BLOQUEADO**: transcript solo Cap. 1; DCF y RLV/Land Residual (Cap. 8-10) NO disponibles. Solo reusable: cap rate/direct cap y sus 3 drivers. **Conseguir Cap. 8-10 para DCF/RLV.**

---

## Resumen de VACÍOS DE FUENTE (bloqueantes para METHODOLOGY.md v2)

| # | Componente | Vacío | Acción |
|---|-----------|-------|--------|
| 2 | Reconciliación IVS 105 | Texto normativo IVS 400/105 (solo hay exposure draft summary) | Conseguir IVS 400 (Residual) + IVS 105 (Reconciliation); usar Appraisal Cap. 25 mientras tanto |
| 3 | Espacial | Fórmulas Moran's I robusto + LM tests (Anselin & Rey Cap. 5) | Extraer Cap. 5 del workbook |
| 5 | Pesos | **PCA** (0 fuentes); AHP clásico dedicado; entropy-weight-method operativo ($d_j$, $w_j$) | Conseguir fuentes; Kantianis NO era AHP |
| 6 | Validación IAAO | **PPE, FSD** (0 fuentes); fórmula PRB; hold-out; IAAO Mass Appraisal (corrupto) | Re-subir PDFs; IAAO Ratio Studies 2013 para PRB |
| 7 | Monte Carlo | Distribuciones (Lognormal/Triangular/Beta/Normal), **VaR/CVaR** (0 fuentes) | Conseguir fuente; RICS solo da simulación cualitativa |
| 8 | Opción real | Ecuaciones binomial/LSM de Kantianis (mal filado, no extraído); **LSM** (0 fuentes) | Re-extraer urbansci-10-00134; conseguir Longstaff-Schwartz |
| 9 | Fiscalidad | **ISR/IVA México + estructura de capital** (0 fuentes) | Conseguir fuente fiscal; no redactar aún |
| 10 | HBU/DCF | Fórmula Land Residual; DCF de Geltner Cap. 8-10 (bloqueado) | Extraer capítulos DCF/RLV |

**Fuentes descartadas por irrelevancia/corrupción**: Erratum Journal of Urban Management (administrativo); IAAO Mass Appraisal 2025 (OCR corrupto, solo portada); Geltner Cap. 1 (DCF/RLV ausentes); Kantianis mal etiquetado como AHP (es Real Options → reasignado a Comp. 8).

**Marcas de fidelidad**: ecuaciones de Sopranzetti (Comp. 1) y del apéndice Box-Cox son *reconstrucción de prosa* (`[pic]`), no transcripción — rotular como tal. Ecuaciones LeSage & Pace (Comp. 3) confiables por canónicas pero cifras de ejemplo son ilustrativas. Mayer & Nothaft (Comp. 1) no tiene fórmulas matemáticas en la fuente.