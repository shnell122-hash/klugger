# /masterplan — Hero 3D nativo: el mundo + el zorro como animación scroll-triggered (no video)

> Orden: **SEGURIDAD → CALIDAD → COSTO**. Craft de animación = Emil Kowalski / Linear. Referencia de ambición visual = **igloo.inc**.
> **Objetivo:** que el **mundo low-poly de CDMX + el zorro** se rendericen como **animación nativa en el frontend** (WebGL/Three.js en React), **controlada por scroll**, **sin cielo** (canvas transparente que compone con el fondo de la página) y **sin ser un video**. Hoy es un `<video>`; la meta es geometría 3D real en el navegador (como igloo.inc), no un MP4.

---

## 0. Por qué (y qué cambia)
El hero actual es un **video renderizado** (Gemini). Limitaciones: no es interactivo, el scroll no lo controla de verdad (en iOS ni siquiera se puede scrub-ear), trae cielo horneado y marca de agua, y no escala a retina. **igloo.inc** demuestra el estándar: **la escena vive en WebGL**, el scroll **mueve la cámara** por el mundo, y todo es geometría + shaders (no video). Queremos eso para el zorro recorriendo CDMX.

## 1. Investigación (hallazgos)

### 1a. Cómo está hecho igloo.inc (referencia canónica)
- **Stack:** Three.js + Svelte + GSAP + **Blender/Houdini** (modelado) + Vite + `three-mesh-bvh`. Toda la UI en **WebGL** (no HTML), texto con **SDF** (glitch/scramble por shader, sin relayout del DOM).
- **Scroll = cámara:** el usuario recorre un paisaje congelado; **la cámara se desplaza entre escenas** (cada proyecto en su bloque de hielo) con aberración cromática y disoluciones. Intro en tiempo real.
- **Optimización:** exportador propio **VDB→browser** (volumen comprimido más chico que una imagen web), **exportadores de geometría** a medida para bajar el peso inicial, y **medición continua de performance en low-end**.
- **Lección:** los flujos procedurales dan libertad pero cuestan tiempo de setup; hay que balancear contra deadline. *(Awwwards case study — ver Referencias.)*

### 1b. Técnica concreta para NUESTRO stack (React Three Fiber — ya instalado)
El patrón "Apple-style scroll 3D" en R3F es directo y encaja con Next.js/React:
1. **Cargar modelo:** `useGLTF(URL)` (drei) + `useGLTF.preload(URL)`; modelo en CDN (R2), texturas comprimidas y malla decimada.
2. **Progreso de scroll 0→1:** `scrollY / (scrollHeight - innerHeight)` (o `<ScrollControls>`/`useScroll` de drei para escena pinneada).
3. **Rig de animación:** en `useFrame`, mapear `progress` a rotación/posición de la cámara o del mundo, con **lerp** (`x += (target - x) * min(dt*6,1)`) para suavizar (nada de jitter).
4. **Canvas transparente:** `<Canvas gl={{ alpha: true }}>` **sin** `<color attach="background">` y **sin** skybox → el mundo flota sobre el fondo de la página (**sin cielo**, justo lo pedido).
5. **Iluminación:** `ambientLight` + `Environment` (HDRI) para reflejos; sin sombras costosas.

> Ya tenemos `@react-three/fiber` + `@react-three/drei` + `three` en `dashboard-financial/package.json`. **No hay que instalar el motor**, solo loaders (Draco/meshopt) y el modelo.

### 1c. El nudo crítico: **necesitamos el modelo 3D (GLB), no el video**
El video fue generado por IA (Gemini/Veo) a partir de una imagen — **no existe un modelo 3D detrás que se pueda extraer**. Para renderizar nativo hay que **conseguir/crear el GLB** del mundo + zorro. Vías (de mayor a menor fidelidad/control):
| Vía | Qué es | Pros | Contras |
|-----|--------|------|---------|
| **A. Operador entrega GLB** | german exporta la escena de Blender/Spline si existe | máxima fidelidad, rig real | requiere que la escena exista en 3D |
| **B. Blender/Spline a medida** | modelar el mundo low-poly + zorro (Spline exporta GLB y encaja con R3F) | control total, rig de caminar | trabajo de modelado 3D |
| **C. Image-to-3D (IA)** | Meshy/Rodin/Tripo/Luma generan zorro + landmarks desde el arte, se ensambla la escena | rápido, aprovecha el arte existente | calidad variable, ensamblaje/retopo manual |
| **D. Procedural en R3F** | reconstruir con primitivas low-poly (cajas/conos) + instancing | 0 assets externos, liviano | estética menos rica, más código |

**Recomendación:** **C para el zorro** (image-to-3D del imagotipo/mascota, que es la estrella) + **D/B para el mundo** (landmarks low-poly como piezas, que ya tenemos en R2 como arte de referencia y son geometrías simples). Si german consigue **A**, gana todo.

### 1d. Transparencia "sin cielo"
`gl={{ alpha: true, antialias: true }}`, `<Canvas>` sin fondo, y **no** montar sky/HDRI visible (el `Environment` puede usarse solo para reflejos con `background={false}`). El planeta/isla queda recortado sobre el fondo de la página (degradado de marca o blanco), componiendo nativo.

## 2. Decisiones técnicas (la vía más eficiente y de calidad)
1. **Motor:** React Three Fiber + drei (ya instalado; nativo a React/Next, SSR-safe con `dynamic(..., {ssr:false})`).
2. **Modelo:** GLB comprimido con **Draco** (o **meshopt**), servido desde **R2** (`brand-assets/3d/`), `useGLTF.preload`. Presupuesto: **< 3–4 MB** el mundo, **< 1 MB** el zorro.
3. **Scroll:** `<ScrollControls pages=N>` + `useScroll` (drei) para escena pinneada; la cámara orbita el mundo y el zorro camina/gira según `offset`. Alternativa GSAP ScrollTrigger si se quiere timeline fino. **Lerp** siempre.
4. **Transparente sin cielo:** `gl={{alpha:true}}`, sin background, `Environment` solo para reflejo (`background={false}`).
5. **Zorro animado:** si el GLB trae rig → `useAnimations` (drei) para el ciclo de caminar; si es estático → animar transform (bob + avance) con `useFrame`.
6. **Performance:** `dpr={[1, 2]}` clamp, `<AdaptiveDpr>`/`<AdaptiveEvents>`, `frameloop="demand"` cuando no anima, `three-mesh-bvh` si hay raycast, lazy-load del canvas (IntersectionObserver), y **degradación**: `prefers-reduced-motion` o móvil de gama baja → **póster estático / el video actual** como fallback (ya existe). El canvas nunca bloquea el scroll.
7. **Aislamiento:** componente `HeroWorld3D` client-only (`dynamic ssr:false`), en su carpeta; no toca el dashboard financiero ni rompe el build estático (probar `NEXT_STATIC_EXPORT`).

## 3. Tabla `/masterplan` de construcción

| # | Tarea → Subtareas | Owner/Modelo | Razón (sec/cal/costo) | Ola ∥ (worktree?) | Deps | Verificación |
|---|-------------------|--------------|------------------------|-------------------|------|--------------|
| **H0** | **Conseguir el modelo 3D** (GLB mundo + zorro): decidir vía A/B/C/D; si C, correr image-to-3D del zorro + curar; exportar/optimizar (Draco) | **TÚ** (orquestación) + operador (german) | calidad: es la fuente de verdad visual; irreversible elegir mal | 0 | — | GLB abre en three-gltf-viewer; < presupuesto de peso |
| **H1** | **Spike técnico R3F**: `<Canvas alpha>` + cubo low-poly + scroll→rotación con lerp, transparente, en `/style` aislado | **Sonnet** + TÚ (review) | calidad: valida el patrón antes de invertir en el modelo | 0 ∥ | — | canvas transparente 60fps; scroll rota; SSR ok; build estático verde |
| **H2** | **Cargar el GLB real** + encuadre (Bounds/center), iluminación (ambient+Environment sin fondo), materiales low-poly | **Sonnet** | calidad estándar con spec | 1 | H0, H1 | el mundo se ve sin cielo, recortado sobre la página |
| **H3** | **Rig de scroll**: `<ScrollControls>`+`useScroll`; cámara orbita el mundo + zorro camina/gira por `offset`; lerp; beats/copys sincronizados | **Sonnet** + TÚ (timing/craft) | calidad: el "sentir" es el producto | 1 | H1 | scroll controla la escena suave; sin jitter; reduce-motion ok |
| **H4** | **Performance & fallback**: dpr clamp, AdaptiveDpr, frameloop demand, lazy canvas, `prefers-reduced-motion`/móvil → póster/video actual | **Opus** (perf crítico) + Sonnet | calidad: no romper móvil/low-end | 2 | H2, H3 | 60fps en desktop; móvil no crashea; fallback visible; Lighthouse perf aceptable |
| **H5** | **Integración `/style` + deploy** + medición | **TÚ** + Sonnet | seguridad: prod/deploy lo hace el orquestador | 3 | H2–H4 | live en klugger.shnell.mx; smoke gate abajo |
| **H6** | **(opcional) Shaders/pulido** estilo igloo: aberración cromática sutil, disolución al entrar, SDF si hay texto | **Sonnet** + Fable (dirección estética) | costo: solo tras lo funcional | ∥ | H5 | efectos <300ms, 60fps, reduce-motion |

> **Worktree** solo si H1/H2/H3 se paralelizan sobre archivos compartidos; como van en olas, no hace falta.

## 4. Gate de smoke tests
1. **Es geometría, no video:** el hero es un `<canvas>` WebGL (inspeccionable), no un `<video>`.
2. **Sin cielo / transparente:** el mundo se recorta sobre el fondo de la página (canvas alpha, sin skybox).
3. **Scroll lo controla:** al hacer scroll, la cámara/mundo se mueve y el zorro camina/gira, suave (lerp), sin jitter, **en iOS Safari** (¡el video fallaba ahí!).
4. **Performance:** 60fps en desktop; en móvil/low-end degrada a póster o al video actual sin bloquear scroll; respeta `prefers-reduced-motion`.
5. **Build estático:** `NEXT_STATIC_EXPORT=true npm run build` verde; canvas es `ssr:false`; no rompe casocimatario ni el dashboard financiero.
6. **Peso:** GLB dentro de presupuesto (< ~4 MB total), servido/cacheado desde R2/Pages.

## 5. Pendientes del operador (german)
- **Decidir/entregar el modelo 3D (H0):** ¿existe la escena en Blender/Spline (vía A)? Si no, ¿aprobamos image-to-3D del zorro (vía C) + landmarks low-poly (D)? Es la dependencia que desbloquea todo.
- Validar licencias de cualquier herramienta 3D/IA usada (Meshy/Rodin/Spline export).
- Aprobar peso/tradeoff visual (fidelidad vs. peso) y el fallback móvil.

## 6. Secuencia
H0 ∥ H1 (ola 0) → H2 ∥ H3 (ola 1) → H4 (ola 2) → H5 (ola 3, deploy) → H6 (pulido opcional). El video actual se mantiene como **fallback** hasta que H5 pase el gate.

## Referencias
- Igloo Inc — Awwwards case study: https://www.awwwards.com/igloo-inc-case-study.html
- Igloo Inc — WebGPU/WebGL showcase (crystal growth, shader UI, volume data): https://www.webgpu.com/showcase/igloo-inc-procedural-crystals/
- Igloo Inc — three.js forum (stack: Three.js/Svelte/GSAP/Blender/`three-mesh-bvh`): https://discourse.threejs.org/t/landing-site-igloo-inc/67249
- Apple-style 3D scroll en Three.js/R3F (useGLTF + scroll progress + lerp + canvas): https://www.builder.io/blog/webgl-scroll-animation
- Scroll-based animation — Three.js Journey: https://threejs-journey.com/lessons/scroll-based-animation
- WebGL gallery con GSAP + Three.js + scroll (Codrops): https://tympanus.net/codrops/2026/02/02/building-a-scroll-revealed-webgl-gallery-with-gsap-three-js-astro-and-barba-js/
