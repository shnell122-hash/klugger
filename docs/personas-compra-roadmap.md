# Roadmap — Klugger `/personas` (landing de compra para personas físicas)

> Actualizado 2026-07-22. Ver [personas-compra-journal.md](./personas-compra-journal.md)
> para el detalle de lo ya construido.

## ✅ Hecho

- Landing `/personas` compuesta con el sistema de diseño existente (tema
  `consumer`), sin componentes duplicados, copy enfocado en compra.
- Buscador + chips + drawer conectados a un filtrado real (client-side) sobre
  dataset mock de 6 propiedades.
- Paginación real, mapa con pines dinámicos según resultados filtrados.
- Página de detalle por propiedad (`/personas/propiedad/[id]`), estática.
- Favoritos y shortlist persistidos en `localStorage`.
- Command palette (⌘K) conectado.
- Metadata SEO propia (landing + detalle).
- Buscador/filtros fijos (sticky) + navegación rápida por secciones ("Ir a:").
- Build de export estático verificado (`next build`, Cloudflare Pages-ready).

## 🚧 Pendiente

### Bloqueante para "producción real" (necesita backend/infraestructura)

- [ ] **Backend de propiedades**: reemplazar `app/personas/data.ts` (mock) por
      una API/base de datos real — listado, búsqueda y filtros del lado del
      servidor en vez de un array hardcodeado.
- [ ] **Mapa real**: Mapbox GL con geocoding real (ya está `mapbox-gl` en
      dependencias y hay un patrón reusable en `app/casocimatario/MapboxMap.tsx`),
      en vez del mock de posiciones fijas en `MapFirst`. Requiere
      `NEXT_PUBLIC_MAPBOX_TOKEN`.
- [ ] **Cuentas de usuario**: login real (el botón "Entrar" del navbar no hace
      nada todavía), sesiones, favoritos/shortlist ligados a la cuenta en vez
      de solo `localStorage` del navegador.
- [ ] **Captura de leads real**: "Hablar con un asesor" y "Crear alerta de
      precio" hoy solo muestran un toast de confirmación — falta que generen
      un lead real (CRM, email, base de datos) y que las alertas de precio se
      evalúen y notifiquen de verdad.
- [ ] **Deploy público**: resolver el acceso a `klugger.shnell.mx`. Opciones
      discutidas con el usuario:
      1. Conseguir acceso/colaborador en `vilarkptl-lang/klugger` (dueño del
         pipeline actual de Cloudflare Pages).
      2. Levantar un proyecto de Cloudflare Pages nuevo conectado a
         `shnell122-hash/klugger` (URL distinta a `klugger.shnell.mx`).

### Mejoras deseables (no bloqueantes)

- [ ] Compartir el dataset mock con más propiedades / variedad de zonas para
      que los filtros se sientan más útiles.
- [ ] Fotos reales por propiedad en `Gallery`/`PropertyCard` (hoy son bloques
      de color, no fotos).
- [ ] Analytics/tracking de conversión (búsquedas, clics a detalle, leads).
- [ ] Pase de accesibilidad dedicado (hoy se hereda la de los componentes
      compartidos, no se auditó específicamente para `/personas`).
- [ ] Tests automatizados (hoy la validación es build + smoke test manual).
- [ ] Revisar responsive/mobile de la barra sticky de buscador+filtros en
      viewports chicos (no se probó en un dispositivo real, solo build).

## Decisiones abiertas para el usuario

- ¿Cómo prefieres capturar los leads de "asesor"/"alertas" — backend propio,
  un servicio de formularios (p. ej. Formspree), o algo distinto?
- ¿Seguimos con acceso a `vilarkptl-lang/klugger` o migramos el pipeline de
  deploy por completo a `shnell122-hash/klugger`?
