# Paletas de color Klugger — oficiales + propuestas ampliadas para el arte

> Objetivo: **cerrar la definición de paleta** para el arte de la plataforma y dejar de iterar. Parte de los colores institucionales exactos (brandbook) y propone paletas AMPLIADAS (una a elegir) para la ilustración.
> Fuentes: `IMG_9723` (brandbook pág. 5 "Colores institucionales"), `IMG_9726` (logo oficial), `IMG_9724` (papelería con degradado), y la extracción de color de la ilustración canónica de referencia.

---

## 1. Colores institucionales OFICIALES (intocables — son la marca)

| Rol | HEX | RGB | CMYK |
|-----|-----|-----|------|
| **Verde 1** (primario) | `#2ED666` | 46, 214, 102 | 67 / 0 / 77 / 0 |
| **Verde 2** (secundario) | `#29BF5C` | 41, 191, 92 | 71 / 0 / 81 / 0 |
| **Gris oscuro** (neutro/texto) | `#3B3B3B` | 59, 59, 59 | 67 / 57 / 55 / 61 |

- **Logo:** círculo verde + zorro con contorno gris oscuro, **sin degradado** (logo oficial = `klugger-logo-vectorized.png`).
- **Degradado de marca** (de la papelería): **verde → azul**. El brandbook no da el valor del azul; se **propone** el extremo azul en **`#2E9BD6`** (validar). Degradado: `#29BF5C → #2E9BD6`.

---

## 2. Paleta de la ilustración de referencia (extraída del arte canónico)

Colores dominantes reales del arte "Wally" (NO son colores de marca; son la paleta de ilustración a reconciliar con la marca):
`#339689` (agua teal) · `#60B69F` (mint) · `#C68765` (coral) · `#E6BE95` (tan) · `#B2BCC3` (gris) · `#1E201C` (contorno).

---

## 3. Propuestas de paleta AMPLIADA para el arte (elegir UNA y congelar)

Las tres anclan en los **verdes de marca**. Cambian el tono del resto (agua, edificios, cielo) según la audiencia.

### Opción A — "Vibrante fiel al arte" *(recomendada para el hero tipo Wally / marketing)*
| Rol | HEX |
|-----|-----|
| Césped/tierra (marca) | `#2ED666` / `#29BF5C` |
| Césped claro / mint | `#8FE0B0` |
| Agua turquesa | `#2FB8A8` |
| Edificio coral | `#E8845C` |
| Edificio tan / crema | `#E8C89A` / `#F2E4B8` |
| Ladrillo | `#C0503C` |
| Parque rosa | `#F2A8C8` |
| Techos slate | `#6B7A8F` |
| Playa/arena | `#EAD9A2` |
| Calles gris | `#C9CED1` |
| Contorno | `#1E201C` |
| Cielo | `#DCEEFF` |

### Opción B — "Cool / degradado de marca" *(para insights y desarrolladores; combina con toggle día/noche)*
| Rol | HEX |
|-----|-----|
| Verdes de marca | `#2ED666` / `#29BF5C` |
| Teal | `#2FB8A8` |
| Azul 1 / 2 (degradado) | `#2E9BD6` / `#56B8E6` |
| Acento cálido (mínimo) | `#E8845C` |
| Neutros | `#3B3B3B` / `#B8C0C4` |
| Fondo (dark / light) | `#1A1A1A` / `#F4F6F5` |

### Opción C — "Clara / amigable" *(para personas físicas / consumidor; tema light)*
| Rol | HEX |
|-----|-----|
| Verde suave | `#5FD08A` |
| Teal suave | `#6FC5BC` |
| Durazno / crema | `#F2C6A0` / `#F6EACB` |
| Rosa suave | `#F6C6DC` |
| Cielo | `#E8F4FF` |
| Fondo | `#F4F6F5` |
| Contorno / texto | `#3B3B3B` (no negro puro) |

---

## 4. Reglas para no volver a iterar

1. **Los 2 verdes (`#2ED666`, `#29BF5C`) y el gris (`#3B3B3B`) NO se tocan** — son la marca.
2. Se elige **UNA** de las 3 opciones ampliadas para el arte y se **congela** (se guarda como los `colors` que se pasan a Recraft/design tokens).
3. **Degradado verde→azul** = firma; usar en hero/acentos (validar el azul `#2E9BD6`).
4. **Contorno** de la ilustración: `#1E201C` (look marcado) o `#3B3B3B` (look más suave/marca).
5. Mapeo a producto: **A** = marketing/hero · **B** = insights/devs · **C** = consumidor.

> Decisión pendiente del operador: (a) elegir opción A/B/C (o mezcla), (b) validar el azul del degradado. Con eso, la paleta del arte queda fija y se cablea a los design tokens (v13.0) y al parámetro `colors` de generación.
