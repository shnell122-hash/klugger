# Micro-Roadmap: Dashboard de Valuación Cimatario - Profesionalización y Alta Calidad

**Repo:** https://github.com/vilarkptl-lang/klugger  
**Dashboard:** klugger/dashboard-financial/app/valuacion-cimatario/ValuacionDashboard.tsx (y archivos relacionados: Map*.tsx, *FinObra*.tsx)  
**Live URL objetivo:** http://localhost:3020/valuacion-cimatario  
**Fecha inicio:** 2026-06-25  
**Objetivo final:** Dashboard con **muy alta calidad profesional y presentable** (sin alucinaciones, datos exhaustivos del MD de estudio de mercado 2023, mapas precisos, animaciones premium sin logos, gráficas interactivas atractivas). Seguir estrictamente los 5 puntos del query. Avanzar **sesión por sesión**, actualizar este archivo con status + evidencias al final de cada sesión. Usar git commit/push + MCP GitHub al final de cada sesión clave.

## Principios de trabajo (siempre)
- **Cero alucinaciones en datos/zonas:** Usar solo coordenadas, tablas, textos y hechos del `cases/terreno-cimatario-queretaro/transcripcionEstudioMercado2023.md`, `terrenos_full.json`, comps, y descripciones reales (calle Carlos Septién 53, colindancias, Av. Constituyentes, C. Wenceslao S. De la Barquera, etc.). Para geo: heuristic + offsets realistas basados en texto del MD + conocimiento público verificable de colonias (Cimatario, Cumbres, Villas del Sur, Centro Sur/Juriquilla).
- **Calidad visual premium:** Glassmorphism consistente (del dashboard-financial), Recharts interactivos con tooltips ricos, colores Klugger (verde #10b981 / #00FF66 acento fuerte, violeta #7c3aed, acentos naranja/cream), responsive perfecto, estados de carga, hover states, sin texto "floors grow windows".
- **Gratis / OSS primero:** Mantener MapLibre eliminado. Mapbox solo con token del usuario. 3D con three.js/react-three ya en package. GIFs generados localmente con Python (PIL/imageio/numpy) sin deps pagos.
- **Datos del inmueble target:** "Lic. Carlos Septién 53, Cimatario, Querétaro (CP 76030)", 660m², CUS 2.4, 12u multifamiliar recomendado.
- **Verificación cada sesión:** Matar node, lanzar dev server limpio (ver INSTRUCCIONES-INICIO.md o start-valuation.ps1), esperar "Compiled", hard-refresh (Ctrl+Shift+R) en Chrome a 127.0.0.1 o localhost:3020/valuacion-cimatario. Confirmar 200 y UX.
- **Push:** Al final de sesión, `git add -A; git commit -m "microroadmap sesion X: ..."; git push`. Usar también MCP github si push falla.
- **Calidad alta:** Todo debe "verse muy profesional". Revisar con ojo crítico (espaciado, alineación, leyendas claras, interacciones fluidas, sin bugs visuales).

## Sesiones planeadas (1 por "sesión de trabajo" con el usuario)

### Sesión 1: Eliminación MapLibre + Marcador inconfundible del bien inmueble + Mejora mapeo de zonas (Puntos 1+2+3 del query)
**Status:** COMPLETADA 2026-06-25 (verificada compilación + server 200)

**Notas de entrega:**
- Dynamic import MapLibre eliminado + grid 2-col reemplazado por wrapper único Mapbox (altura 420px para mejor viz con 1000 pts).
- LeafletMap.tsx movido a .bak (limpieza completa).
- MapboxMap.tsx: zonas ampliadas con 6 features (Cimatario core ajustado a Carlos Septién 53 + colindancias descritas en MD, target lime #00FF66 small zone, Cumbres, Centro Sur/Juriquilla + nuevo Centro Histórico/Alameda azul, perif saturadas). Coords realistas derivadas de distancias MD (2.7km centro, 18.6km Juriquilla) + layout vialidades (Constituyentes, Corregidora, etc). Sin alucinar nombres/áreas.
- Marcador inconfundible: HTML Marker 42px con glow verde Klugger #00FF66 + borde blanco + sombra fuerte + ★ grande. Label/popup rico con dirección exacta, specs (660m2 CUS 2.4 12u), auto-abre 4s al load + click para reabrir. Se destaca claramente sobre clusters de puntos.
- Textos actualizados en dashboard + badge del mapa + leyenda refieren a "Sesión 1 microroadmap", "pin target inconfundible", "zonas sin alucinar".
- Compilación exitosa ("Compiled /valuacion-cimatario in 11.3s"). Server live PID escuchando 3020.
- microroadmap.md creado + pusheado a GitHub main vía MCP.
- Próximo: usuario hard-refresh + ir a tab 🏗️ HBU/HBV + Estudio Colonia para inspeccionar el mapa único + ★ pin + zonas verdes ampliadas. Aprobar para Sesión 2.

**Evidencia GitHub:** https://github.com/vilarkptl-lang/klugger/blob/main/microroadmap.md (commit inicial e4f5851) + cambios en ValuacionDashboard.tsx + MapboxMap.tsx.

**Siguiente:** Sesión 2 (animaciones).

### Sesión 2: Eliminar anim "floors grow windows" + Mejorar sustancialmente la 3D (usando preview + .cad-skill / py) (Punto 4)
**Status:** EN PROGRESO / Parcialmente completada (Framer eliminado + 3D mucho mejorado; GIF py pendiente de run local)

**Notas de entrega (esta sesión):**
- FramerFinObra.tsx (el de "floors grow windows" + lighting delays 2D) movido a .bak y removido del UI/código (dynamic eliminado, grid 2-col para anim ahora single 3D + video + GIF ref).
- Inline simple box "FinObra3D" en ValuacionDashboard.tsx completamente eliminado (causaba código dangling post-git; ahora solo usa el external mejorado vía dynamic import).
- [FinObra3DBuilding.tsx](/klugger/dashboard-financial/app/valuacion-cimatario/FinObra3DBuilding.tsx) **mejorado por mucho**: detailed I-beam columns (flanges + web completos del py renderer + preview TSX), extra rebar (algunos en verde Klugger #00FF66 con emissive), glass panels transparentes con tint verde + emissive en fachada (terminado look), workers simples (cuerpo/cabeza/brazo anim bob en trigger), grid + lot con acento verde, prop-driven num floors (soporta sliders 2-5), useFrame curve rotate mejor (base lenta + pulse en anim), Orbit zoom habilitado, lights/fog/anti alias premium. Colores: C.green #00FF66 dominante en acentos/glows/workers/grid, sin logos. Caption actualizado con refs exactas a preview y .cad-skill py.
- UI en sección "🎥 Simulador FinObra": caption actualizado "Sesion 2... mejorado por mucho... sin floors grow windows (Framer eliminado)". Añadido bloque para GIF /assets/finobra-hero-3d-v2.gif con instrucción para regenerar.
- py existente en public/assets/finobra-hero-3d-v2.py ya adaptado Klugger green (de trabajo previo); deps (numpy pillow imageio) para generar GIF (user: correr py en terminal con python PATH correcto).
- Git push de cambios + microroadmap update.
- Próximo: usuario genera GIF (python public/assets/finobra-hero-3d-v2.py), hard refresh, verifica solo 3D premium + video + (GIF) en tab HBU, sin Framer 2D.

**Evidencia:** commits en main. Siguiente: terminar GIF + pulir + Sesion 3 "Estudio de mercado".

**Entregables:**
- Eliminar completamente `FramerFinObra.tsx` (archivo + dynamic import + uso en grid de animaciones + cualquier mención "floors grow windows").
- En sección "Simulador FinObra" de HbuTab: grid pasa a 1 columna o solo el 3D mejorado + video + (opcional) GIF. Actualizar todos los textos/captions para reflejar "Mejor animación FinObra 3D (inspirada en preview TSX de FinObra + generado vía Python renderer tipo .cad-skill)".
- **Mejorar por mucho `FinObra3DBuilding.tsx`** (el "la otra"):
  - Incorporar **la mejor animacion** elementos del preview: I-beam columns detallados (flanges + web completos como en el py), slabs con wireframe edges, rebar visible (horizontal + vertical), grid de piso, workers (meshes simples tipo cilindros + cubos con anim walk/carry o estáticos distribuidos), glass panels (material transparente + slight emissive/reflective en fachadas, clipping si aplica), edges/lineSegments para estructura.
  - Auto-rotate mejorado: usar curvas de cámara (keyframe bezier o useFrame con ease), orbit suave + pause ocasional en ángulos clave (frente, esquina 45°, vista aérea).
  - Colores Klugger: verde #00FF66 / #10b981 **en especial** para acentos (rebar glow, grid lines, worker highlights, glass tint), purple/violet para slabs, steel/cream para estructura, orange para highlights.
  - Sin logos absolutamente.
  - Agregar efectos de calidad: emissive para "terminado", slight bloom sim (vía múltiples luces + material emissive), LOD básico (detalle alto cerca, simplificado lejos), fog, mejor ground + shadows sutiles.
  - Props: floors/units/scenario/anim siguen funcionando, pero anim ahora más rica (reveal progresivo de pisos + workers + glass lighting cuando anim=true).
  - Referencia en código: "Elementos de https://github.com/vilarkptl-lang/FinObra/.../src/preview/ (HeroScene, Building, I-beams, workers, glass) + .cad-skill renderer".
- **Python renderer (usar skill .cad-skill o manual):** 
  - Refinar/actualizar `public/assets/finobra-hero-3d-v2.py` (o crear v3) fiel al ejemplo linked: wireframe 3D con numpy/PIL, progressive build, glow, workers, scanlines, data viz overlay sutil, 600x600 o 720p, 12fps, ~100 frames, output .gif.
  - **Colores Klugger verde fuerte**, sin logos.
  - Ejecutar el py (asegurar deps: `pip install numpy pillow imageio` si falta) para generar `finobra-hero-3d-v2.gif` (o v3) actualizado.
  - Colocar GIF en public/assets/, mostrarlo en la UI FinObra section como "GIF generado (Python renderer estilo .cad-skill)" junto al 3D interactivo y el mp4.
- Live: 3D se ve "mucho mejor" (detalle industrial realista, verde Klugger pops, movimiento profesional). GIF nuevo generado visible y de calidad.
- Actualizar microroadmap + push.

**Comandos clave:**
- En PS admin: taskkill /F /IM node.exe ; cd C:\Users\noela\klugger\dashboard-financial ; & "C:\Program Files\nodejs\npm.cmd" run dev
- Para py (en dashboard-financial): python public/assets/finobra-hero-3d-v2.py (o instalar deps primero).
- Verificar GIF aparece y se ve bien (sin logos, verde dominante).

**Siguiente:** Sesión 3 tras aprobación.

### Sesión 3: Nuevo navbar item "Estudio de mercado" + gráficas interactivas exhaustivas (Punto 5)
**Status:** PENDIENTE

**Entregables:**
- Nuevo item en navbar/tabs: `'estudio-mercado'` con label **"📈 Estudio de Mercado"** (mover o deprecate el viejo "marketing + Estudio" si overlap; mantener "HBU/HBV" y "Agentes" ).
- Nuevo componente/función `EstudioMercadoTab()` (o integrado).
- **Gráficas interactivas muy atractivas** usando Recharts (ya importado) que **comuniquen de manera exhaustiva TODO el contenido clave** del `transcripcionEstudioMercado2023.md`:
  - **Demografía y proyecciones:** LineChart (población estado + municipio 2022-2030, con puntos, tooltip con números exactos del MD, ReferenceLine en 2023/2026, área bajo curva). + KPI cards de bono demográfico, edad mediana 30, dependencia 41%.
  - **Puntos de interés (POI):** BarChart horizontal o vertical de distancias/tiempos desde el predio Cimatario (tabla completa del MD: Juriquilla 18.6km/18min, Centro 2.7km/11min, Aeropuerto 32.6km/31min, etc). Click bar → highlight info extra. Leyenda "Movilidad excelente: 11 min al Centro Histórico".
  - **Migración:** BarChart ranking % población inmigrante por estado (Querétaro 11.3% 4to lugar nacional, con top 5-6 del MD). Anotar "Querétaro 4to en atracción de inmigrantes → demanda vivienda".
  - **Vivienda:** Donut/PieChart + bars: % casa única en terreno (82.2% estado / 84.9% mun), casa que comparte terreno, etc. + texto "Predominio vivienda horizontal → oportunidad multifamiliar/plurifamiliar en Cimatario (H2)".
  - **Salud y Educación (exhaustivo):** 
    - Pie afiliación salud (IMSS etc).
    - GroupedBar: matrícula educación superior por área (Ingeniería, Admin/Negocios, Sociales/Derecho) desglosado Hombres/Mujeres (números exactos 2019 del MD).
  - **Mercado Inmobiliario / Co-living (la parte más exhaustiva):** 
    - BarChart grande de precios promedio renta co-living del MD (20+ listings con precios $6,000 a $49,000 mensual, descripciones completas: Netflix, coworking, limpieza, rooftops, etc). Sortable, filter por "incluye servicios", "estudiantil vs profesional", hover con descripción literal del MD.
    - Línea o barras de "PROMEDIOS MERCADO INFORMAL $3,837" vs "Nuestro nicho profesional Cimatario".
    - Tabla searchable/filterable de los co-living comparables (nombre, ubicación, precio, features del MD).
    - Segmentos residenciales: bars 1.5-3.2M (residencial), 3.2-6.6M (plus), >7M (premium) — ligar a nuestro asking 7M + modelo.
  - **Inversiones y Economía:** Timeline o Bar horizontal de proyectos públicos/privados destacados (carretera 210, polideportivo, subestación, torres hospital, hoteles, 14,942 MDP etc). KPI ICE, inversión por PEA.
  - **Datos específicos del predio + zoning + conclusiones:** 
    - Cards + visual: Dirección exacta, colindancias, H2 (habitacional plurifamiliar hasta 200 hab/ha), dimensiones (30m frente Carlos Septién, etc), CAS, infraestructura educativa/salud/empleo en inmediaciones (del MD).
    - SWOT visual (cards 2x2 glass con colores).
    - Conclusión MD literal: "Carlos Septién es excelente opción... mercado co-living/millennial/profesional... bono demográfico... movilidad... H2 permite vivienda plurifamiliar". + link directo a sliders HBU y FinObra 3D (recomienda 12u).
  - **Extras interactivos de calidad:** 
    - Filtros globales (slider año proyecciones, toggle "solo Cimatario data", "ver solo co-living profesional").
    - Cross-highlight: seleccionar un POI → resalta en mapa si integramos (o nota "ver en tab HBU").
    - Export CSV/JSON de los datasets del estudio.
    - "Datos fuente: transcripcion literal Estudio de Mercado 2023 (VDD)" + año.
- Diseño: Múltiples secciones glass con headings claros ("1. Panorama Socio-Demográfico", "2. Puntos de Interés y Movilidad", "3. Mercado de Renta Compartida / Co-Living (exhaustivo)", "4. Oportunidad para el Terreno Cimatario (link HBU)").
- Actualizar tabs array y render condicional. Posiblemente renombrar/reducir el viejo "marketing" tab o integrarlo.
- Live: Gráficas "muy atractivas", ricas en datos del MD, comunican exhaustivamente (usuario puede explorar todo el estudio sin leer el MD entero). Alta interactividad.
- Actualizar microroadmap + push.

**Datos a hardcodear (fieles al MD, arrays de objetos):**
- projections = [{year:2022, estado:2358758, municipio:1007923}, ... 2030]
- pois = [{lugar:"Juriquilla", dist_km:18.6, tiempo_min:18}, ...]
- migration = [{estado:"Querétaro", pct:11.3, rank:4}, ...]
- etc para coLivingListings (array de 15-25 objetos con precio, desc literal).
- Usar los números exactos del archivo MD.

**Siguiente:** Sesión 4 tras aprobación.

### Sesión 4: Pulido final de zonas/áreas, integraciones cruzadas, calidad visual general + limpieza
**Status:** PENDIENTE

**Entregables:**
- Refinar aún más zonas en Mapbox (agregar 1-2 polígonos más precisos si el MD da más hints, ajustar bordes del target pin zone, legend más clara con fuente "basado en Plan Parcial + datos Cimatario 2023").
- Integración cruzada: desde Estudio de Mercado graphs → botones "Aplicar a HBU" (ej. elige proyecciones → actualiza numUnits o roi est). O highlights que abren el mapa HBU con el pin.
- Pulir 3D/GIF si feedback de Sesión 2.
- Calidad general dashboard: 
  - Consistencia spacing/typo (revisar todos tabs).
  - Mejorar loading states de maps/3D.
  - Añadir "Exportar Estudio Completo (JSON)" que incluya datos de valuación + estudio mercado + HBU sliders.
  - Responsive: probar mobile (las graphs deben colapsar bonito).
  - Texto final en hero/header: "Estudio de Mercado 2023 + Datos 2026 + HBU interactivo + Simulador FinObra".
  - Remover cualquier resto de "floors grow" o comparaciones obsoletas de mapas.
- Actualizar `docs/` si hay referencias (ej. estudio-mercado-...roadmap.md).
- Live test exhaustivo de todos los 5 puntos.
- Actualizar microroadmap (checklist por sesión).

### Sesión 5: Verificación final, push completo, presentación
**Status:** PENDIENTE

**Entregables:**
- Restart limpio del server (kill + full npm run dev + clear .next si HMR issues).
- Capturas mentales / notas: "Mapa: solo Mapbox + pin inconfundible + zonas ampliadas precisas", "Anim: solo 3D premium + GIF generado verde Klugger", "Nuevo tab: 8+ gráficas interactivas cubriendo 100% del MD de estudio (pop, POI, co-living prices exhaustivo, etc)".
- Git push final de todo (código + microroadmap actualizado con "COMPLETADO - Dashboard profesional listo").
- (Opcional) Actualizar README o casos/ con link al dashboard.
- Entregar al usuario: link live + "Listo para usar en pitches. Alta calidad."
- Si feedback, iterar en sesiones futuras (agregar más del roadmap original).

## Comandos de lanzamiento / test (copiar-pegar en PS Admin cada sesión)
```powershell
# 1. Kill previo
taskkill /F /IM node.exe

# 2. (Opcional) limpiar cache si HMR raro
cd C:\Users\noela\klugger\dashboard-financial
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue

# 3. Lanzar (dejar ventana abierta)
& "C:\Program Files\nodejs\npm.cmd" run dev
```
Luego abrir: http://localhost:3020/valuacion-cimatario (o 127.0.0.1). Ir a tab HBU para mapas/anim, nuevo tab para estudio.

Para py GIF (Sesión 2, en terminal separado):
```powershell
cd C:\Users\noela\klugger\dashboard-financial
pip install numpy pillow imageio  # si falta
python public/assets/finobra-hero-3d-v2.py
# Resultado: finobra-hero-3d-v2.gif (o el nombre que defina el script)
```

## Status general actual (actualizar al final de cada sesión)
**Data restaurada (2026-07-05):** Base de datos real (1025 entradas de Lamudi sin fakes) ya restaurada desde dev-2 y commiteada (commit `413caa6`). `terrenos_enriched.json` (1025 enriquecidas con lat/lng, offer_price, dirección, floor_size), `terrenos_full_real.json` (659 comps venta), `terrenos_excluidos.json` (366 renta/ruido). Reemplaza el dataset 82% inventado. Pendiente: wire de datos reales al dashboard (Tarea 10).

- [x] Sesión 1 completada + push (map cleanup, target pin, zones; code restored + verified compile; live after manual launch)
- [ ] Sesión 2 completada + push (Framer eliminado, 3D mejorado, GIF generado)
- [ ] Sesión 3 completada + push (Nuevo tab Estudio de Mercado, gráficas interactivas)
- [ ] Sesión 4 completada + push (Pulido zonas/mapeo, integraciones cruzadas)
- [ ] Sesión 5 completada + push + dashboard "muy profesional y presentable"

**Próxima acción del usuario:** Revisar live tras cada entrega (hard refresh + navegar tabs), aprobar o dar feedback específico para la sesión actual. Seguiremos este microroadmap hasta que el dashboard quede impecable y de muy alta calidad.

---
*Este archivo se mantiene vivo. No borrar. Actualizar status + agregar notas de lo entregado en cada sesión.*