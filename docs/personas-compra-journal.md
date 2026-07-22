# Journal — Klugger `/personas` (landing de compra para personas físicas)

> Bitácora de la sesión donde se construyó la landing de compra para clientes
> personas físicas dentro de `dashboard-financial` (Next.js, klugger.shnell.mx).
> Actualizado 2026-07-22.

## 2026-07-22

**1. Migración de repo**
Se hizo push del proyecto local `C:\Users\Ricardo\Downloads\klugger` al nuevo
repo `github.com/shnell122-hash/klugger` (rama `main`). El repo original,
`vilarkptl-lang/klugger`, no es accesible con la cuenta de GitHub actual.

**2. Investigación del sistema de diseño**
La guía viva en `/style` y sus componentes (`components/klugger/*`) no vivían en
`main`, sino en la rama `testing` — que es la que Cloudflare Pages despliega a
`klugger.shnell.mx` vía `.github/workflows/deploy-testing.yml`. Se creó una rama
local `testing` (basada en `origin/testing` del remoto original, cacheado
localmente) para trabajar sobre el sistema de diseño real: átomos, moléculas,
organismos, iconografía, tokens de marca (`tokens.css`), tema `data-theme="consumer"`
("personas físicas — light/amigable").

**3. Primera versión de `/personas`**
Landing compuesta 100% con piezas existentes del sistema (`Navbar`, hero
canónico + `ChatPill`, `SearchBar`/`Segmented`, `Chip`s de filtro, `MapFirst` +
`PropertyCard`, `Marquee`, zonas con `ScrollReveal`, `VerificationPanel`,
`Shortlist`, `Accordion` de FAQ, CTA final). Verificada con `next build`
(export estático) y dev server.

**4. Corrección de duplicados**
Se detectaron y quitaron: un `ChatPill` + `Segmented` sueltos que duplicaban el
buscador ya incluido en `SearchBar`, y un `Marquee` de colonias que repetía los
mismos nombres que la grilla de "Zonas". Copy reescrito para audiencia
exclusivamente compradora (sin lenguaje de renta/venta de la propia página).

**5. Conexión a filtros reales**
- Buscador (ubicación) + chips ("Solo verificadas" / "Con plusvalía") +
  `FilterDrawer` (precio, recámaras, tipo, uso de suelo) ahora filtran de
  verdad un dataset mock (`app/personas/data.ts`, 6 propiedades).
- `SearchBar`, `Pagination` y `FilterDrawer` se hicieron **controlables** (props
  opcionales, con fallback al estado interno original) para no romper su uso en
  `/style`.
- El slider de precio del drawer se reconfiguró de renta ($/mes) a venta (MXN).
- Paginación real (3 por página), pines del mapa dinámicos según resultados
  filtrados, estado vacío con "limpiar filtros".

**6. Página de detalle de propiedad**
Nueva ruta `/personas/propiedad/[id]` (`generateStaticParams` para el export
estático — 6 páginas pre-generadas). Reusa `Gallery`, `FloorPlan` y
`VerificationPanel`; las tarjetas de la lista ahora navegan ahí.

**7. Persistencia sin backend**
`useFavorite` (nuevo hook en `organisms.tsx`) y `Shortlist` guardan su estado en
`localStorage` — sobreviven a un refresh, aunque sin cuenta de usuario todavía.

**8. Extras conectados**
Command palette (⌘K) enlazado al botón "Preguntar" del buscador. Metadata
propia (`title`/`description`) para `/personas` vía `layout.tsx`, y por
propiedad vía `generateMetadata` — antes heredaba la de "Valuación Cimatario".

**9. Reordenamiento de la página**
A pedido explícito: el buscador + filtros rápidos se movieron a una barra
**sticky** debajo del navbar (visible sin importar el scroll), y se agregó un
"Ir a:" en el header con anclas a cada sección (Propiedades, Zonas,
Transparencia, Preguntas, Contacto).

**10. Deploy**
Todo el trabajo vive en `shnell122-hash/klugger`, rama `testing`. **No hay URL
pública todavía** — el pipeline real (`klugger.shnell.mx`) depende de secretos
de Cloudflare Pages configurados en el repo original (`vilarkptl-lang/klugger`),
al que no se tiene acceso con la cuenta actual. Mientras tanto, la página se
revisó en vivo vía dev server local (`npm run dev`, puerto 3020).

## Archivos clave tocados esta sesión

| Archivo | Qué cambió |
|---|---|
| `dashboard-financial/app/personas/page.tsx` | Landing completa (nueva) |
| `dashboard-financial/app/personas/layout.tsx` | Metadata SEO (nuevo) |
| `dashboard-financial/app/personas/data.ts` | Dataset mock de propiedades (nuevo) |
| `dashboard-financial/app/personas/propiedad/[id]/page.tsx` | Ruta de detalle + `generateStaticParams` (nuevo) |
| `dashboard-financial/app/personas/propiedad/[id]/PropertyDetailClient.tsx` | UI de detalle (nuevo) |
| `dashboard-financial/components/klugger/organisms.tsx` | `useFavorite`, `Shortlist` persistente, `MapFirst` con pines dinámicos, `Prop.tipo`/`usoSuelo` |
| `dashboard-financial/components/klugger/molecules.tsx` | `SearchBar` y `Pagination` controlables |
| `dashboard-financial/components/klugger/FilterDrawer.tsx` | Controlable + precio configurable (venta vs. renta) |
| `dashboard-financial/app/style/klugger.css` | Estado visual del corazón "guardado" |

Todos los cambios en componentes compartidos son **aditivos** (props
opcionales con fallback al comportamiento original) — `/style` sigue
funcionando sin cambios visibles.
