# /masterplan — Mascota "zorrito" Klugger derivada del logo + identidad Nexa Black

> Orden: SEGURIDAD → CALIDAD → COSTO. Orquestador: Opus 4.8.
> Objetivo: un **sistema de mascota (zorrito)** para Klugger, **fiel al logo oficial** — mismos trazos geométricos de línea limpia, círculo verde, contorno carbón — y coherente con el carácter **bold/geométrico/redondeado de la tipografía Nexa Black** del wordmark.
> El **juez estético es german** (proceso multi-IA + su ojo). El agente genera candidatos técnicos con `/recraft`; german valida antes de shipping.

## Insumos (en el repo)
- **Logo oficial:** `dashboard-financial/public/assets/klugger-logo-vectorized.png` (branch `testing`) — zorro geométrico de línea + wordmark **Nexa Black**. Es la **referencia canónica** de trazos y tipografía.
- ⚠️ **NO hay archivo de fuente Nexa Black** en el repo — la Nexa Black solo vive embebida en el wordmark del logo. **Pendiente de operador:** conseguir el `.otf/.ttf` de Nexa Black (comercial, Fontfabric) para tipografía real en la UI/mascota.

## Enfoque
**Image-to-image con el logo como referencia** (no text-to-image), para que las mascotas hereden los **trazos exactos** del zorro. Modelos que funcionan (de la sesión): **Recraft v3 i2i** (vector/marca) y **Gemini 3 Pro Image i2i** (fidelidad). Paleta: verdes de marca `#2ED666`/`#29BF5C` + carbón `#3B3B3B` + blanco. Sin degradado (el logo oficial no lo tiene). Ver skill `/recraft`.

## Tabla de tareas

| # | Tarea | Owner/Modelo | Ola | Deps | Verificación |
|---|-------|--------------|-----|------|--------------|
| 1 | **Referencia a dev-2** (logo oficial) + paleta de marca | **TÚ** | 0 | logo en testing | logo.png en dev-2 |
| 2 | **3 artes de mascota** (i2i con el logo): (a) hoja de poses/expresiones del zorrito, (b) zorro héroe/isotipo variado, (c) set de estados de producto (bienvenida, buscando, éxito, vacío) — estilo de línea del logo, sin degradado | **TÚ** (fal/gemini keys) + Recraft/Gemini 3 Pro | 1 | 1 | 3 artes fieles al trazo del logo; paleta de marca |
| 3 | **Entrega + validación** (SendUserFile) | **TÚ** + **OPERADOR** (juez) | 2 | 2 | german elige/descarta |
| 4 | **(tras validación) Vectorizar** el zorrito elegido a SVG + estados nombrados a `public/assets/mascota/` | **TÚ** + Sonnet | 3 | 3 | SVGs listos para la UI |

## Gate de smoke tests
1. Las 3 artes conservan los **trazos geométricos del logo** (construcción de la cara del zorro, grosor de línea).
2. Paleta = verdes de marca + carbón; **sin degradado**, **sin texto** (salvo que se pida wordmark).
3. Consistencia con el carácter **Nexa Black** (bold, geométrico, redondeado).

## Pendientes del operador
- **Conseguir la fuente Nexa Black** (`.otf/.ttf`) — hoy no está en el repo; sin ella no hay tipografía real de marca.
- **Validar/elegir** el zorrito ganador (juicio estético = german).
- Confirmar si la mascota lleva wordmark o es solo isotipo.
