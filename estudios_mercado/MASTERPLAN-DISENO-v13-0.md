# /masterplan v13.0 — Sistema de diseño Klugger: design tokens + theming por tipo de usuario

> Orden: SEGURIDAD → CALIDAD → COSTO. Orquestador: Opus 4.8.
> **Prerequisito de v13** (plataforma). Bloquea la construcción de UI (sitios de agentes, subida, buscador).
> Insumos: `brandbook-analysis.md` (extracción Gemini Flash del brandbook 2017) + requisitos de estilo por audiencia del operador.
> Objetivo: un **sistema de design tokens** anclado al brandbook + **3 temas por segmento** + guía de aplicación, para que toda la plataforma multi-tenant use una sola fuente de verdad visual.

---

## I. Insumos (del brandbook + operador)

**Marca (brandbook 2017):** logo **zorro + bombilla** (inteligencia + audacia/seguridad), estilo **minimalista**, **degradado verde→azul** con textura suave, target contemporáneo.

**Paleta institucional (valores exactos del brandbook):**
| Token | RGB | HEX | Nota |
|-------|-----|-----|------|
| Verde 1 (primario) | 46 / 214 / 102 | `#2ED666` | acento/CTA principal |
| Verde 2 (oscuro) | 41 / 191 / 92 | `#29BF5C` | acento secundario, inicio del degradado |
| Gris oscuro (neutral marca) | 59 / 59 / 59 | `#3B3B3B` | fondo dark / texto en light |
| **Azul (fin del degradado)** | — | **⚠️ a definir** | el brandbook NO detalla el valor; proponer y validar vs logo |
| Blanco | 255/255/255 | `#FFFFFF` | fondo light |

**Tipografía (brandbook):** **Nexa Black** (marca/imagotipo/display) + **Open Sans** (secundaria/cuerpo).

**Requisitos de estilo por audiencia (operador):**
- **Valuaciones/estudios** (uso prolongado, lectura densa) → **tema oscuro** (se mantiene; el dashboard actual ya es así).
- **Desarrolladores/insights** → **toggle día/noche estilo Claude** (a decisión del usuario).
- **Personas físicas/compradores** → **versión clara y amigable**: animaciones, arte, prototipos, elementos de **ciudad / equipamiento / valuación**. Menos "monolito de lectura", más comunicación visual.

---

## II. Design tokens (fuente única de verdad)

### II.1 Color — tokens primitivos
```
--k-green-1: #2ED666;   /* Verde 1  RGB 46,214,102 */
--k-green-2: #29BF5C;   /* Verde 2  RGB 41,191,92  */
--k-blue:    #2E9BD6;   /* PROPUESTO (fin del degradado) — validar vs logo */
--k-gray-900:#1A1A1A;   /* near-black para dark real */
--k-gray-800:#3B3B3B;   /* gris marca */
--k-gray-100:#F4F6F5;   /* light surface */
--k-white:   #FFFFFF;
--k-gradient: linear-gradient(135deg, var(--k-green-2), var(--k-blue));
```

### II.2 Color — tokens semánticos (se re-mapean por tema, §III)
`--bg`, `--surface`, `--text`, `--text-muted`, `--accent` (=green-1), `--accent-2` (=green-2), `--gradient`, `--border`, `--success` (=green), `--warning`, `--danger`.

### II.3 Tipografía
```
--font-display: "Nexa Black", "Montserrat", system-ui, sans-serif;  /* marca/títulos */
--font-body:    "Open Sans", system-ui, sans-serif;                  /* cuerpo */
```
Escala (rem): display 3/2.25/1.75 · body 1/0.875/0.75 · line-height 1.5 cuerpo, 1.15 display.

### II.4 Forma
`--radius: 12px` (cards) / 999px (pills) · `--elev-1/2/3` sombras suaves · textura sutil (del brandbook) solo en fondos, discreta.

---

## III. Los 3 temas por segmento (mapeo de tokens semánticos)

| Semántico | 🌑 Valuaciones (dark, fijo) | 🌓 Desarrolladores (toggle) | ☀️ Personas físicas (light, amigable) |
|-----------|----------------------------|------------------------------|----------------------------------------|
| `--bg` | `#1A1A1A` | día `#FFFFFF` / noche `#1A1A1A` | `#F4F6F5` |
| `--surface` | `#3B3B3B` | día `#FFFFFF` / noche `#242424` | `#FFFFFF` |
| `--text` | `#FFFFFF` | día `#3B3B3B` / noche `#F4F6F5` | `#1A1A1A` |
| `--accent` | `#2ED666` | `#29BF5C` | `#2ED666` |
| `--gradient` | sutil en headers/nav | banners/CTA | **protagonista** (hero, arte) |
| Tono | sobrio, denso, informacional | funcional, limpio, adaptable | **acogedor, visual, animado** |
| Extras | imagotipo blanco s/ oscuro | zorro como marca de agua sutil | **animaciones + arte de ciudad/equipamiento**, ilustración, micro-interacciones |

**Implementación:** tokens semánticos como CSS variables; el **tema se resuelve por tenant/ruta** (data-theme). El toggle día/noche (segmento dev) alterna el atributo. Personas físicas = tema light + capa de motion/ilustración.

---

## IV. Tabla de tareas

| # | Tarea → Subtareas | Owner/Modelo | Ola | Deps | Verificación |
|---|-------------------|--------------|-----|------|--------------|
| 0.1 | **Validar el azul del degradado** (proponer 2-3 azules vs el logo del brandbook; Gemini Flash compara contra las páginas del PDF) | **TÚ** + Gemini | 0 | brandbook | azul elegido con HEX, coherente con el logo |
| 0.2 | **Investigación de arte/animación para el consumidor** (personas físicas): referencias de proptech/fintech amigables, ilustración de ciudad/equipamiento, librerías de motion (Framer Motion, Lottie), estilo de micro-interacciones | **SONNET ×2** (research) + Fable (dirección de arte) | 0 ∥ | — | moodboard + refs citadas + decisión de librería |
| 0.3 | **Licencia tipográfica** (Nexa Black es comercial — Fontfabric): confirmar licencia web o elegir alternativa libre geométrica (Montserrat/Sora) para display; Open Sans = Google Fonts (libre) | **TÚ** (decisión) | 0 ∥ | — | fuentes con licencia resuelta para web |
| 1 | **Paquete de design tokens** (`tokens.css` / `tokens.ts` con primitivos + semánticos + los 3 temas) | **SONNET** | 1 | 0.1, 0.3 | tokens compilables; 3 temas conmutan por `data-theme` |
| 2 | **Componentes base tematizados** (botón, card, input, KPI, nav, tabla) usando solo tokens | **SONNET** + Haiku | 2 | 1 | componentes renderizan en los 3 temas sin hardcode |
| 3 | **Guía de estilo viva** (Storybook o página `/style`) mostrando tokens + los 3 temas + do/don't del logo | **SONNET** | 2 ∥ | 1 | guía navegable desplegada |
| 4 | **Integración de arte + capa de motion** para consumidor (montar el arte que entregue el operador: hero, ilustraciones, animaciones; wiring con tokens/tema) | **SONNET** (impl) | 3 | 2, 5 | landing consumidor con el arte del operador montado y optimizado |
| **5** | **CREACIÓN del arte** (dirección estética + producción) — **fuera del alcance del agente**, ver §V | **OPERADOR (humano)** + su proceso multi-IA / diseñadores | — | 0.1 | assets aprobados entregados al repo |

## V. Creación de arte — responsabilidad del operador (NO del agente)

> **Decisión (2026-07-10):** la **creación de arte la lidera german**, no el agente. El diseño estético es una **cuestión cultural y de criterio humano** que el agente no domina; una sola IA comete errores y no capta el "sentir" de la marca/mercado. german usa su **proceso multi-IA** (varias herramientas cruzadas) + su ojo. El agente **no** genera el arte de producción.
>
> **Lo que el agente SÍ hace (plomería técnica):**
> - Provee el **sistema de tokens** y el **theming** (§II-III) para que el arte encaje en la paleta/tipografía.
> - Deja **slots de integración** listos (rutas `public/assets/`, componentes con props de imagen/animación, soporte SVG/WebP/Lottie).
> - **Optimiza y wirea** el arte que german entregue (comprimir, responsive, lazy-load, dark/light variants).
> - (Opcional, si german lo pide) genera *bocetos desechables* con fal.ai solo como referencia rápida — nunca como arte final.

**Contrato de entrega (para que el agente pueda integrar):** el arte aprobado llega como SVG (vectorial, para logo/íconos/ilustración plana) o WebP/PNG (para fondos/render), + Lottie/MP4 para animación, nombrados por uso (`hero-consumer`, `illus-ciudad`, `zorro-vacio`, etc.). Con eso el agente los monta en la tarea 4.

**Dirección de arte (referencia para german, no instrucción al agente):** minimalista/geométrico coherente con el logo zorro+bombilla; paleta verdes `#2ED666`/`#29BF5C` + azul del degradado; motivos de ciudad/equipamiento/valuación; el zorro como mascota. (El brandbook 2017 no trae ilustración de producto → hay que crearla.)

## Reglas de paralelización
- Ola 0: validar azul (TÚ) ∥ research de arte (Sonnet/Fable) ∥ licencia de fuente — disjuntos.
- Tokens (Ola 1) bloquean componentes (2) y motion (4). Guía (3) ∥ componentes.
- Keys/red (Gemini para comparar el azul) = orquestador.

## Gate de smoke tests
1. Azul del degradado definido (HEX) y validado contra el logo.
2. `tokens.css`/`tokens.ts` compila; los 3 temas conmutan por `data-theme` sin hardcode de color.
3. Componentes base renderizan correctos en dark / toggle / light.
4. Guía de estilo viva desplegada; do/don't del logo presentes.
5. Landing de consumidor con el **arte del operador** montado + micro-interacciones sobre los tokens.
6. Los tokens/temas encajan con el arte entregado (paleta y tipografía consistentes).

## Pendientes del operador
- **CREAR el arte** (§V) — es tu responsabilidad (proceso multi-IA + criterio humano); el agente solo lo integra. Entregar según el contrato de §V.
- **Validar el azul** propuesto del degradado (o dar el valor original si lo tienes) — necesario para cerrar los tokens.
- **Licencia de Nexa Black** (comercial) para web, o aprobar alternativa libre (Montserrat/Sora) para display.
- **Logo en vectorial (SVG)** — el brandbook es PDF; se necesita el SVG del imagotipo para usarlo nítido en la UI.
- Confirmar **librería de motion** (Framer Motion + Lottie recomendado).
