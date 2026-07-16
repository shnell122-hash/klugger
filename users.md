# Klugger — Tipos de usuario

> Documento de producto. Define los segmentos de usuario de la plataforma y cómo cada uno
> se mapea a las superficies de producto (y a las ramas divergentes del repo).
> Redactado con contexto dado por el fundador (2026-07-16), enriquecido.

## Marco general

Klugger es una plataforma de **inteligencia e intermediación inmobiliaria**. No es un portal de
anuncios más: su valor está en el **análisis** (valuación, uso óptimo, due diligence) y en la
**conexión inteligente** entre oferta y demanda **sin depender de pauta pagada**.

Existen dos superficies de producto — y esto explica por qué el repo tiene **ramas que divergen**:

| Superficie | "Modo" | Base técnica | Para quién | Rama / stream |
|-----------|--------|--------------|-----------|---------------|
| **Personas físicas** | Modo claro | Dashboard Next.js + branding/K0 | Dueños particulares, buscadores, agentes | stream de **estilos/branding** (`main`/`testing`) |
| **Financiero / valuación** | Modo oscuro | Basado en **financial-bot** | Inversionistas, banqueros, due diligence | stream de **valuación HBU/HBV** (financial) |

Ambas superficies comparten datos y catálogo; se diferencian en la experiencia y en la
profundidad analítica que exponen.

---

## Los usuarios

### 1. Dueño de **terreno** (dueño-desarrollador)
- **Qué quiere:** acelerar la venta de su terreno.
- **Qué necesita:** demostrar el **máximo potencial** del terreno para justificar precio y atraer
  desarrolladores → análisis de **Highest & Best Use (HBU)** y **Highest Investment Value (HBV)**.
- **Qué hace Klugger:** automatiza el análisis HBU/HBV — pro-forma real, regresión honesta,
  escenarios de desarrollo — para convertir un terreno "en bruto" en una tesis de inversión.
- **Estado:** **automatizado** en el micro-caso **Cimatario** (Querétaro) — scraping + enriquecimiento
  de datos + valuación.
- **Superficie:** financiera / modo oscuro.

### 2. Dueño de **inmueble construido** (casa o departamento, sin potencial de desarrollo)
- **Qué quiere:** acelerar la venta de su bien, pero **no** es un terreno convertible a desarrollo.
- **Qué necesita:** aquí no hay tesis de "uso óptimo"; el valor está en **generar demanda**. Y con
  una restricción clave: **sin pago a plataformas** (nada de pauta en portales).
- **Qué hace Klugger:** en vez de pauta pagada →
  - **búsqueda en frío** de clientes potenciales,
  - **detección de intención de compra** mediante señales que emergen de **estudios de mercado**
    que la propia plataforma produce,
  - estrategias de marketing **no convencional** dirigidas a atraer exactamente a quien compraría
    ese inmueble.
- **Estado:** estrategia definida (marketing no convencional / búsqueda en frío); por instrumentar.
- **Superficie:** personas físicas / modo claro.

### 3. **Buscador / comprador** de inmuebles — ⭐ el más importante
- **Qué quiere:** encontrar el inmueble que realmente busca, sin fricción.
- **Qué necesita:**
  - **búsqueda por lenguaje natural** (describir lo que quiere, no llenar filtros),
  - **alertas diarias** con lo que va apareciendo,
  - un **loop de retroalimentación**: sus correcciones **afinan el scraper** con el tiempo,
  - **búsqueda federada** sobre múltiples fuentes de inmuebles.
- **Qué hace Klugger:** motor de búsqueda NL sobre datos federados + digest diario de alertas +
  feedback del usuario que mejora continuamente el scraper y el ranking.
- **Por qué es el más importante:** es el lado de la **demanda**; sin buscadores activos, la oferta
  (usuarios 1, 2 y 5) no tiene a quién venderle. Es el motor que da liquidez a toda la plataforma.
- **Superficie:** personas físicas / modo claro.

### 4. **Agente inmobiliario**
- **Qué quiere:** presencia y marca propia dentro de la plataforma.
- **Qué necesita:** entrar al portal e **hiper-personalizar** el portal de su inmobiliaria o su
  **perfil personal**.
- **Qué hace Klugger:** portales/perfiles white-label hiper-personalizables para agentes e
  inmobiliarias.
- **Superficie:** personas físicas / modo claro (con herramientas del modo financiero según plan).

### 5. **Banquero** — el dueño en versión **macro**
- **Relación:** el **dueño (usuario 1) es la versión micro**; el **banquero es la versión macro**.
  Ambos buscan lo mismo — un **intermediario** — pero a escalas distintas.
- **Qué quiere:** intermediación que aporte **due diligence** como servicio.
- **Qué necesita:**
  - recepción de **documentos de forma segura y cifrada**,
  - un intermediario que **genere la intermediación del due diligence**,
  - poder **compartir** inmuebles — y en su caso **carteras completas** con el análisis **ya hecho** —
    entre banqueros y con **otros bancos**, sobre **información ya homologada** (estandarizada).
- **Qué hace Klugger:** bóveda cifrada de documentos + motor de due diligence + intercambio de
  carteras con análisis homologado entre instituciones.
- **Superficie:** financiera / modo oscuro (misma raíz que el usuario 1, a escala institucional).

### 6. **Desarrollador** (developer / capital de desarrollo) — el dueño de terreno **invertido**
- **Relación:** el **dueño de terreno (usuario 1)** parte de **un terreno** y pregunta *"¿qué es lo
  mejor que puedo construir **aquí**?"*. El **desarrollador invierte la pregunta**: parte del
  **capital** y pregunta *"¿**dónde** compro/construyo y **qué** modelo de vivienda?"*. Es el mismo
  motor HBU/HBV, pero corrido **al revés y a escala territorio**.
- **Qué quiere:** decidir **qué construir, dónde y con qué modelo de vivienda** — en **tiempo real**.
- **Qué necesita:** un **estudio de mercado en tiempo real** y un **HBU/HBV dinámico a nivel país**
  (no un terreno aislado, sino optimización continua de **todo el territorio**), visualizado en
  **mapas de color** con indicadores **por sector**: **riesgo, crecimiento, oportunidad**, demanda,
  absorción, precio/m², etc.
- **Qué hace Klugger:** motor HBU/HBV **nacional y dinámico** que rankea zonas y recomienda el
  **producto óptimo** (tipología de vivienda) por sector; capas de mapa de calor (riesgo /
  crecimiento / oportunidad) que se actualizan con los datos que entran.
- **Relación con Cimatario:** el caso **Cimatario es el micro-piloto** (un terreno). El desarrollador
  es la **generalización macro** del mismo análisis, corrido sobre el país completo y de forma continua.
- **Superficie:** financiera / modo oscuro.

---

## Mapa usuario → superficie (resumen)

```
DEMANDA
  └─ 3. Buscador/comprador ........... NL search + alertas + scraper federado    [modo claro] ⭐

OFERTA — personas físicas
  ├─ 1. Dueño de terreno ............. HBU/HBV de UN terreno (caso Cimatario)     [modo oscuro]
  ├─ 2. Dueño de inmueble construido . marketing no convencional / búsqueda fría   [modo claro]
  └─ 4. Agente inmobiliario .......... portal/perfil hiper-personalizable         [modo claro]

CAPITAL — institucional y desarrollo
  ├─ 5. Banquero (dueño macro) ....... due diligence + carteras homologadas cifradas [modo oscuro]
  └─ 6. Desarrollador ................ HBU/HBV nacional dinámico + mapas de color   [modo oscuro]
                                       (dueño de terreno invertido: capital → dónde/qué)
```

## Por qué el repo tiene ramas divergentes

No es un error ni trabajo duplicado: cada superficie evolucionó en su propio stream.
- **Stream de estilos/branding** (`main`/`testing`, sistema de diseño K0): experiencia para
  **personas físicas** (usuarios 2, 3, 4).
- **Stream financiero** (basado en financial-bot, HBU/HBV): **valuación, valores, due diligence y
  pricing** para **dueños-inversionistas y banqueros** (usuarios 1 y 5).

El caso **Cimatario** es el micro-piloto del stream financiero (usuario 1). Ver también
`cases/terreno-cimatario-queretaro/`.
