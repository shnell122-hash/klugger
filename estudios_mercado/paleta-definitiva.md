# Paleta definitiva Klugger (marca + mundo/arte) — CONGELADA

> Fuente única de color para **dominio (design tokens)** y **arte**. Base: hero CDMX v1 (aesthetic low-poly nativo).
> Board visual: R2 `klugger-art/brand/paleta-definitiva.png` (+ `.txt`). Cableado: `dashboard-financial/app/styles/tokens.css` + `dashboard-financial/lib/brand.ts`.
> Reemplaza la indecisión A/B/C de `paletas-color.md`: se congela ESTA.

## 1. Oficiales de marca (brandbook — intocables)

| Rol | HEX | Token |
|-----|-----|-------|
| Verde 1 · primario | `#2ED666` | `--k-green-1` / `BRAND.green1` |
| Verde 2 · secundario | `#29BF5C` | `--k-green-2` / `BRAND.green2` |
| Gris · texto/neutro | `#3B3B3B` | `--k-gray` / `BRAND.gray` |
| Azul marca · **activo = A** | `#2E9BD6` | `--k-blue` (→ `--k-blue-a`) / `BRAND.blue` |
| Claro · fondo | `#F4F6F5` | `--k-light` / `BRAND.light` |

**Variantes de azul disponibles** (elegir el activo cambiando `--k-blue` en `tokens.css`):

| Var | HEX | Carácter | Token |
|-----|-----|----------|-------|
| **A** (activo) | `#2E9BD6` | medio equilibrado | `--k-blue-a` |
| B | `#1E9FE0` | brillante cyan-cielo (tech) | `--k-blue-b` |
| C | `#29C1D6` | turquesa/cian (distintivo) | `--k-blue-c` |
| D | `#1E6FB5` | profundo confianza (banca/datos) | `--k-blue-d` |

**Degradado firma:** `#29BF5C → #2E9BD6` (`--k-gradient` / `BRAND_GRADIENT`). Protagonista en hero de consumidor.

## 2. Paleta del mundo / arte (hero CDMX v1)

| HEX | Rol aprox. | Token |
|-----|-----------|-------|
| `#DCCAB4` | tierra/adobe | `--k-art-earth` |
| `#918771` | piedra | `--k-art-stone` |
| `#B4D94B` | pasto vivo | `--k-art-grass` |
| `#7CD6FF` | cielo | `--k-art-sky` |
| `#335E2C` | follaje oscuro | `--k-art-forest` |
| `#566757` | verde apagado/slate | `--k-art-slate` |
| `#FAF0DA` | crema | `--k-art-cream` |
| `#343631` | tinta/contorno | `--k-art-ink` |
| `#57C6E8` | agua | `--k-art-water` |
| `#C9B496` | arena | `--k-art-sand` |

## 3. Reglas
1. Verdes `#2ED666`/`#29BF5C` y gris `#3B3B3B` **no se tocan** (marca).
2. El arte low-poly usa la **paleta del mundo** (§2); marca entra como acento/degradado.
3. Pendiente operador: **validar el azul `#2E9BD6`** (único no confirmado por brandbook).
4. Los 3 temas (`consumer` light · `valuacion` dark · `dev` toggle) se mapean en `tokens.css` por `data-theme`.

## 4. Aesthetic nativo
El estilo canónico de Klugger es **low-poly 3D del mundo del zorro** (facetado, colores de esta paleta, zorro verde). Hero canónico: R2 `klugger-art/maps/canonical/cdmx-hero-v1*`. Ver `MASTERPLAN-DISENO-v13-0.md`, `MASTERPLAN-UI-v1.md`.
