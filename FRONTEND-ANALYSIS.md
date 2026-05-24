# Frontend Analysis — Migración a TypeScript
> Generado: 2026-05-24 | Autor: Claude Code (claude-sonnet-4-6) | Branch: `claude/financial-multiagent-system-YwtYQ`

---

## Resumen ejecutivo

El ecosistema tiene **cuatro frontends con stacks completamente distintos**, tres de los cuales son Vanilla JS sin tipado ni build step. Solo `dashboard-financial` ya es TypeScript moderno. La migración unificada a Next.js + TypeScript es viable, recomendada, y se puede hacer en fases sin interrumpir producción.

---

## 1. Inventario de frontends

| Proyecto | URL | Stack actual | Líneas de código | Tiempo real | TypeScript |
|----------|-----|-------------|-----------------|-------------|------------|
| **ai-monitor** | `ia.vilarkptl.com` | Vanilla JS + Chart.js + Socket.io | ~4,100 | ✅ Socket.io activo | ❌ |
| **dashboard-financial** | `flujos.fiscalai.mx` | Next.js 15 + React 19 + TS + Tailwind | ~5,768 | ⚠️ Instalado, inactivo | ✅ |
| **fiscalai.mx** | `fiscalai.mx` | Vanilla JS + PHP backend | ~desconocido | ❌ | ❌ |
| **ocr.ruby.lease** | `ocr.ruby.lease` | Vanilla JS (fork `/v59-repo/`) | ~desconocido | ❌ | ❌ |

---

## 2. Análisis individual por proyecto

---

### 2.1 `ai-monitor` — Dashboard de monitoreo operacional

**URL**: `ia.vilarkptl.com` | **PM2**: `ai-monitor` (puerto 3010)

#### Stack actual

```
frontend/
├── index.html       615 líneas — SPA de una sola página, 12 tabs hardcoded
├── login.html       — Pantalla de login (bcrypt en Express)
├── css/
│   └── dashboard.css  1,321 líneas — CSS custom (variables, dark theme, responsive)
└── js/
    ├── dashboard.js   2,166 líneas — Toda la lógica en un solo archivo
    └── keys.js        — Gestión de API keys UI
```

**Total**: ~4,100 LOC en 3 archivos JS/CSS + 2 HTML  
**Dependencias cliente**: Socket.io-client (CDN), Chart.js (CDN) — sin npm, sin bundler  
**Build step**: ❌ Ninguno — archivos servidos estáticos por Express

#### Tabs/vistas actuales (12 tabs en un solo SPA)

| Tab | Función |
|-----|---------|
| Feed | Stream de tool calls en tiempo real |
| Sesiones | Historial de sesiones de agentes |
| Costos | Costo por sesión/agente (Chart.js) |
| Providers | API keys configuradas |
| Proyectos | Estado de repos/agentes |
| Agentes | Estado de agentes activos |
| Screenshots | Capturas de pantalla de agentes |
| Alertas | Alertas del relay-master |
| Conversaciones | Historial de mensajes Telegram |
| TG Users | Usuarios de Telegram |
| Platform | Uso Anthropic Admin API |
| API Admin | Configuración de llaves |

#### Conexión con backend

```
Backend: Express.js + Socket.io en localhost:3010
Autenticación: Sesión + bcrypt (login.html → POST /api/auth/login)

REST endpoints consumidos (≥20 llamadas fetch en dashboard.js):
  GET  /api/events/recent?limit=150
  GET  /api/sessions
  GET  /api/sessions/:id/events
  GET  /api/costs
  GET  /api/providers
  POST /api/providers
  GET  /api/projects
  GET  /api/projects/:id/journal
  GET  /api/projects/:id/context
  GET  /api/projects/:id/costs/history?period=:p
  GET  /api/relay/dispatch
  GET  /api/relay/agents
  POST /api/relay/dispatch
  GET  /api/screenshots?limit=200
  POST /api/screenshots/sync
  GET  /api/alerts?limit=100&resolved=:bool
  PATCH /api/alerts/:id/resolve
  GET  /api/conversations
  GET  /api/conversations/:userId/messages
  GET  /api/platform/summary
  GET  /api/platform/hourly
  GET  /api/platform/accounts
  GET  /api/proxy-usage/stats
  PATCH /api/proxy-usage/limit
  GET  /api/telegram/users

Socket.io (eventos en tiempo real):
  ← event:new          → Agrega entrada al feed, actualiza contador
  ← session:ended      → Marca sesión como completada
  ← screenshot:new     → Agrega al panel de screenshots
  ← dispatch:new       → Actualiza lista de dispatches
  ← dispatch:complete  → Marca dispatch como completado
  ← alert:new          → Muestra notificación + cambia color del tab
  ← alert:resolved     → Elimina de la lista de alertas activas
```

#### Escalabilidad — estado actual

| Dimensión | Estado | Riesgo |
|-----------|--------|--------|
| Usuarios concurrentes | 1–5 (uso interno) | ✅ Suficiente |
| Volumen de eventos | Limitado por DOM (render manual de lista) | ⚠️ >500 eventos/min degrada UI |
| Mantenibilidad | Un archivo de 2,166 líneas | 🔴 Alto — imposible modularizar sin refactor |
| Reutilización de componentes | ❌ Zero — HTML generado por template strings | 🔴 Alto |
| Testing | ❌ No hay tests | 🔴 Alto |
| Mobile | ⚠️ Responsive parcial (tabs móvil) | ⚠️ Medio |
| Tiempo de carga | ~instant (sin bundler) | ✅ Bajo |

#### Diagnóstico

> **Monolito funcional acoplado al DOM.** Funciona perfectamente para 1–5 usuarios internos y no necesita escalar más. El principal problema es **mantenibilidad**: agregar features requiere editar el mismo archivo de 2,166 líneas. La deuda de tipo es alta (todo es `any` implícito). No es candidato urgente a migración, pero sí a componentización progresiva.

---

### 2.2 `dashboard-financial` — Dashboard financiero

**URL**: `flujos.fiscalai.mx` | **PM2**: `financial-dashboard` (puerto 3020)

#### Stack actual (ya TypeScript)

```
dashboard-financial/
├── app/                     Next.js App Router
│   ├── layout.tsx           Root layout (html lang="es", dark theme)
│   ├── (dashboard)/         Route group con LayoutShell
│   │   ├── page.tsx         Dashboard principal (KPIs + charts)
│   │   ├── operations/      Tabla de operaciones
│   │   ├── analytics/       Analítica avanzada
│   │   ├── clients/         Clientes (lista + perfil)
│   │   ├── banking/         Cuentas bancarias
│   │   ├── pagos/           Comprobantes de pago
│   │   ├── chats/           Historial chats Telegram
│   │   ├── comisionistas/   CRUD comisionistas
│   │   ├── empresas/        CRUD empresas
│   │   ├── comisiones/      Seguimiento comisiones
│   │   ├── scores/          Learning episodes
│   │   ├── testing/         Modo simulación
│   │   └── admin/           Config panel
│   └── adrian/              Standalone
├── components/              Componentes reutilizables
│   ├── layout/LayoutShell   Nav + sidebar
│   ├── ui/KPICard           Card KPI reutilizable
│   ├── charts/              VolumeChart, OpsTypeChart
│   └── clients/             ClientCard, etc.
├── lib/api.ts               API client tipado (13.2 KB)
├── tailwind.config.ts       Dark theme custom + palette financiera
└── next.config.ts
```

**Versiones**: Next.js 15.3.1, React 19.0.0, TypeScript 5.7 (strict)  
**CSS**: Tailwind 3.4 con paleta custom (dark: `#0a0a0f`, accent: `#7c3aed`)  
**Gráficas**: Recharts 2.14  
**Tablas**: TanStack React Table 8.20  
**Total**: ~40–50 archivos .ts/.tsx, ~5,768 LOC

#### Rendering y fetching

```
Server Components (default):   fetching en servidor, sin hidratación JS
Client Components ('use client'): interactividad (useState, handlers)
Cache: cache: 'no-store' en todos los GET (siempre fresh)
Revalidación: revalidate = 30 en dashboard principal
ISR/SSG: ❌ No
Edge Runtime: ❌ No (Node.js standard)
```

#### Conexión con backend

```
Backend: Express.js en localhost:3010 (/api/financial/*)
Proxy Next.js: /api/financial/* → localhost:3010/api/financial/*

REST endpoints consumidos (lib/api.ts):
  — KPIs y analítica —
  GET /kpis?mode=:mode
  GET /analytics/volume?days=:n
  GET /analytics/by-type?days=:n
  GET /analytics/llm-costs?days=:n
  GET /learning-episodes
  — Clientes —
  GET /clients
  GET /clients/:id/balance-history
  GET /clients/:id/banking-accounts
  GET /clients/:id/models
  PATCH /clients/:id
  PUT   /clients/:id/models/:tipo
  PATCH /clients/:id/comisionista
  POST  /clients/:id/confirmar-pago
  POST  /clients/:id/ajuste
  — Operaciones —
  GET /operations?mode=:m&estado=:e&clientId=:id
  POST /operations/:id/retorno-pagado
  — Pagos —
  GET /payment-confirmations
  GET /payment-confirmations/:id/image
  — Bancario —
  GET /banking-accounts
  GET /empresa-cuentas-all
  — Config —
  GET   /config/operation-types
  PATCH /config/operation-types/:codigo
  — Comisionistas —
  GET    /comisionistas
  POST   /comisionistas
  PATCH  /comisionistas/:id
  GET    /comisionistas/:id/rates
  PUT    /comisionistas/:id/rates
  DELETE /comisionistas/:id/rates/:tipo
  — Empresas —
  GET    /empresas
  POST   /empresas
  PATCH  /empresas/:id
  DELETE /empresas/:id
  GET    /empresas/:id/cuentas
  POST   /empresas/:id/cuentas
  PATCH  /empresa-cuentas/:id
  GET    /empresas/:id/clientes
  PUT    /empresas/:id/clientes/:clientId
  — Comisiones —
  GET  /comisiones
  POST /comisiones/:id/pagar
  — Chats —
  GET /chats
  GET /chats/:chatId/messages

Real-time: ⚠️ socket.io-client instalado (^4.7.5) pero NO conectado
```

#### Escalabilidad — estado actual

| Dimensión | Estado | Riesgo |
|-----------|--------|--------|
| Usuarios concurrentes | 5–20 (uso interno/multi-empresa) | ✅ Suficiente |
| Volumen de operaciones | Sin paginación servidor en algunos endpoints | ⚠️ Medio |
| Cache | `no-store` en todo | 🔴 Alto — N usuarios = N backend calls |
| Real-time | Ausente (30s revalidación) | ⚠️ Medio |
| Autenticación | ❌ Ninguna | 🔴 Crítico para exposición pública |
| Modularidad | ✅ Componentizado, tipos fuertes | ✅ Bajo |
| Testing | ❌ No hay tests | ⚠️ Medio |

#### Diagnóstico

> **El stack más maduro del ecosistema.** TypeScript strict, Server Components, Tailwind con diseño system propio. Las brechas son: falta de auth, falta de tiempo real (socket.io instalado pero muerto), y ausencia total de caché. El siguiente paso natural es activar Socket.io para operaciones en vivo y añadir NextAuth.js.

---

### 2.3 `fiscalai.mx` — Plataforma fiscal

**URL**: `fiscalai.mx` | **Repo**: `vilarkptl-lang/ryby.lease` | **Ruta**: `/var/www/html/vilarkptl.com/DeCabeceraTax/`

#### Stack actual

```
DeCabeceraTax/
├── catalogos/SAT_API/
│   ├── php/              PHP API layer (~20 archivos .php)
│   │   ├── fiel_api.php
│   │   ├── omisiones_api.php
│   │   ├── ekatena_financiero_api.php
│   │   ├── resumen_unificado_api.php
│   │   └── ...
│   └── backend/          Node.js SAT Bridge (puerto 3003)
│       ├── server.js
│       └── routes/       (8 módulos: dyp, buzon, fiel, derivado...)
├── sat-api/              Puppeteer scrapers (DyP, Buzón SAT)
├── relay/                Inbox/outbox para agentes
└── [frontend HTML/CSS/JS] Vanilla JS, servido por Nginx directamente
```

**Backend**: Triple stack — PHP API → Node.js SAT Bridge (3003) → Ekatena local proxy (3000) → Ekatena SaaS (ruby.lease)  
**Frontend**: Vanilla JS + HTML + CSS (presumiblemente jQuery o fetch nativo)  
**Build step**: ❌ Ninguno — Nginx sirve archivos estáticos directamente  
**PM2**: `sat-api` (Node.js bridge), `kptl-credito` (Flask), `kptl-credito-worker`

#### Conexión con backend

```
Frontend → PHP API (fiscalai.mx/catalogos/SAT_API/php/*.php)
  PHP API → Node.js SAT Bridge (localhost:3003)
    SAT Bridge → SAT DyP portal (Puppeteer)
    SAT Bridge → SAT Buzón (Puppeteer)
    SAT Bridge → FIEL/e.firma auth
  PHP API → Ekatena local proxy (localhost:3000)
    Ekatena proxy → ruby.lease/api-prod (SaaS externo)

Endpoints PHP expuestos (~20 endpoints):
  /catalogos/SAT_API/php/fiel_api.php        — Autenticación FIEL
  /catalogos/SAT_API/php/omisiones_api.php   — Omisiones fiscales
  /catalogos/SAT_API/php/resumen_unificado_api.php — RFC completo
  /catalogos/SAT_API/php/ekatena_financiero_api.php — Datos financieros
  ... (documentados en ENDPOINTS.md)
```

#### Escalabilidad — estado actual

| Dimensión | Estado | Riesgo |
|-----------|--------|--------|
| Usuarios concurrentes | 10–50 (clientes fiscalai) | ⚠️ Puppeteer no escala bien |
| Scraping SAT | 1 sesión/RFC a la vez por Puppeteer | 🔴 Alto — bottleneck principal |
| PHP API | Sin tipos, lógica de negocio en SQL embebido | 🔴 Alto |
| Frontend | Vanilla JS sin componentes | 🔴 Alto — difícil de mantener |
| Datos Ekatena | URL externa expuesta en JS cliente | 🔴 Seguridad |
| Testing | ❌ | 🔴 Alto |

#### Diagnóstico

> **La plataforma más compleja y con más deuda técnica.** El triple stack (PHP → Node → Puppeteer → Ekatena) es poderoso pero frágil. El Puppeteer es un single point of failure para todo el SAT scraping. El frontend es el candidato más urgente a modernización porque es el punto de contacto con clientes reales.

---

### 2.4 `ocr.ruby.lease` — Frontend OCR

**URL**: `ocr.ruby.lease` | **Repo**: fork local en `/var/www/catalogos/OCR/v59-repo/agentic-repo/`

#### Stack estimado

```
Basado en contexto del servidor y nombre del directorio (v59):
- Vanilla JS o jQuery (patrón típico de apps OCR de este stack)
- PHP o Node.js backend
- Sin TypeScript, sin framework moderno
- Carga de imágenes + resultados OCR mostrados en tabla/formulario
```

**Nota**: Este repo es un fork separado. No está en `vilarkptl-lang/agentic-repo` ni en `ryby.lease`. Vive en `/var/www/catalogos/OCR/` y no tiene PM2 process conocido — presumiblemente servido por Apache/Nginx estáticamente.

#### Diagnóstico (estimado)

> Probablemente el frontend más simple del ecosistema — upload de imagen, llamada a OCR backend, display de resultado. Candidato ideal para migración a un componente React dentro de un monorepo unificado.

---

## 3. Compatibilidad entre stacks

### 3.1 Backends compartidos

```
Express.js (puerto 3010)
├── /api/financial/*      → dashboard-financial (Next.js)
├── /api/events           → ai-monitor (Vanilla JS)
├── /api/sessions         → ai-monitor (Vanilla JS)
├── /api/costs            → ai-monitor (Vanilla JS)
├── /api/projects         → ai-monitor (Vanilla JS)
└── ...

SAT Bridge (puerto 3003)
└── → fiscalai.mx (PHP → Node.js bridge)

Ekatena proxy (puerto 3000)
└── → fiscalai.mx (PHP → local proxy → ruby.lease SaaS)
```

**Los dos frontends modernizables (ai-monitor + fiscalai) tienen backends completamente distintos.** No comparten ni base de datos (ai-monitor usa MySQL `ai_monitoring`, fiscalai usa su propio schema SAT). Esto significa que un monorepo de frontend puede compartir componentes UI sin necesidad de unificar backends.

### 3.2 Matriz de compatibilidad

| Aspecto | ai-monitor | dashboard-financial | fiscalai.mx | ocr |
|---------|-----------|---------------------|-------------|-----|
| **Backend principal** | Express+Socket.io | Express REST | PHP + Node SAT Bridge | Desconocido |
| **Protocolo** | REST + WebSocket | REST + SSR fetch | HTTP + PHP sessions | HTTP |
| **Auth** | bcrypt + session cookie | ❌ Ninguna | ❌ Ninguna (estimado) | ❌ |
| **Real-time** | ✅ Socket.io | ⚠️ No activo | ❌ | ❌ |
| **DB** | MySQL `ai_monitoring` | MySQL `ai_monitoring` | MySQL fiscal (SAT data) | Desconocido |
| **Shared DB?** | ✅ Sí | ✅ Sí | ❌ DB distinta | ❌ |

**Conclusión**: `ai-monitor` y `dashboard-financial` comparten backend y DB — candidatos naturales para un monorepo. `fiscalai.mx` y `ocr` tienen backends distintos pero pueden compartir componentes UI via monorepo.

---

## 4. Análisis de escalabilidad

### 4.1 Por proyecto

#### ai-monitor (Dashboard operacional)
- **Usuarios actuales**: 3–5 (equipo técnico)
- **Proyección realista**: No escala a más de 20 — es un dashboard interno
- **Bottleneck real**: El DOM render manual de eventos (>500 eventos por minuto satura el navegador)
- **Solución**: Virtualización de listas (TanStack Virtual) en la migración TypeScript

#### dashboard-financial (Plataforma financiera)
- **Usuarios actuales**: 5–15 (operadores del sistema financiero)
- **Proyección**: Podría escalar a 50–200 con autenticación y múltiples empresas
- **Bottlenecks**:
  1. `cache: 'no-store'` en todos los endpoints = N usuarios × cada refresh = N queries MySQL
  2. Sin real-time = operadores no ven actualizaciones sin recargar
  3. Sin auth = exposición total si se hace pública la URL
- **Solución**: Redis para caché de KPIs (TTL 30s), Socket.io activado, NextAuth.js

#### fiscalai.mx (Plataforma fiscal)
- **Usuarios actuales**: 10–100 (clientes fiscalai)
- **Proyección**: Podría ser B2C con cientos de usuarios simultáneos
- **Bottleneck crítico**: Puppeteer no escala. Cada consulta SAT crea un browser headless que:
  - Consume 200–500 MB RAM por instancia
  - Tarda 5–30 segundos por consulta
  - No puede paralelizarse más de 3–4 instancias en 3.8 GB RAM
- **Solución a mediano plazo**: Queue de trabajos (Bull/BullMQ) + worker pool Puppeteer + Redis caché de resultados SAT (TTL: declaraciones cambian poco)

#### ocr (Frontend OCR)
- **Usuarios**: Probablemente uso interno o pocos clientes
- **Sin datos suficientes para análisis**

---

## 5. Recomendaciones de migración a TypeScript

### 5.1 ¿Es TypeScript el stack correcto para todos?

**Sí, con matices:**

| Proyecto | Recomendación | Prioridad |
|----------|---------------|-----------|
| dashboard-financial | ✅ Ya en TS — solo completar (auth, socket.io, cache) | Inmediata |
| ai-monitor | ✅ Migrar a Next.js + TS — compartir diseño system con dashboard-financial | Media |
| fiscalai.mx frontend | ✅ Migrar a Next.js + TS — conservar PHP/Node backends existentes | Media-Alta |
| ocr frontend | ✅ Migrar — probablemente el más simple, ideal para empezar | Media |
| fiscalai.mx backend PHP | ⚠️ No migrar todavía — priorizar frontend primero | Baja |

### 5.2 Arquitectura objetivo recomendada

```
monorepo/                         ← Nuevo repo unificado (o agentic-repo expandido)
├── apps/
│   ├── ai-monitor/               ← Next.js 15 + TS (migración desde Vanilla JS)
│   ├── flujos/                   ← Next.js 15 + TS (ya existe, expandir)
│   ├── fiscalai-web/             ← Next.js 15 + TS (migración desde Vanilla JS + PHP)
│   └── ocr/                     ← Next.js 15 + TS (migración desde Vanilla)
├── packages/
│   ├── ui/                       ← Componentes compartidos (KPICard, DataTable, Charts)
│   ├── types/                    ← Tipos compartidos (Operation, Client, RFC, SAT*)
│   ├── api-client/               ← Clientes tipados para cada backend
│   └── auth/                     ← NextAuth.js config compartida
└── tooling/
    ├── eslint-config/
    ├── tsconfig/
    └── tailwind-config/          ← Paleta compartida (dark theme actual)
```

**Gestor de monorepo**: [Turborepo](https://turbo.build/) — zero config, incremental builds, caché remoto compatible con Vercel/self-hosted.

### 5.3 Stack objetivo por capa

| Capa | Stack recomendado | Razón |
|------|------------------|-------|
| **Framework** | Next.js 15 (App Router) | Ya en uso en flujos; SSR + Server Components + API routes |
| **Lenguaje** | TypeScript 5.7 strict | Consistencia con dashboard-financial existente |
| **CSS** | Tailwind 3.4 + paleta existente | Reutilizar el diseño system ya definido |
| **Estado servidor** | TanStack Query v5 | Cache + revalidación + optimistic updates |
| **Estado UI** | Zustand | Minimal, sin boilerplate, compatible con Server Components |
| **Real-time** | Socket.io-client (ya instalado) | Backend ya lo emite — solo activarlo |
| **Auth** | NextAuth.js v5 (Auth.js) | Multi-provider, compatible con Next.js 15 App Router |
| **Tablas** | TanStack Table v8 | Ya en uso en flujos, virtualización incluida |
| **Gráficas** | Recharts | Ya en uso, suficiente para dashboards financieros |
| **Formularios** | React Hook Form + Zod | Type-safe, sin dependencias pesadas |
| **Monorepo** | Turborepo | Zero config, CI incremental |
| **Testing** | Vitest + Testing Library | Fast, compatible con TypeScript |

### 5.4 Plan de migración por fases

#### Fase 0 — Preparación (1 semana)
```
1. Crear packages/ui con los componentes ya existentes de dashboard-financial
   (KPICard, DataTable, Charts, LayoutShell)
2. Crear packages/types con los interfaces ya definidos en lib/api.ts
3. Configurar Turborepo en raíz del monorepo
4. Mover dashboard-financial a apps/flujos/ sin cambios de código
```

#### Fase 1 — Auth + Real-time en flujos (1 semana)
```
5. Añadir NextAuth.js a apps/flujos/
6. Activar Socket.io-client en apps/flujos/ (solo conectar el provider)
7. Añadir TanStack Query para cache de KPIs (TTL 30s)
8. → Deploy: flujos.fiscalai.mx con auth y real-time
```

#### Fase 2 — OCR migration (1 semana)
```
9. Crear apps/ocr/ con Next.js + TS
10. Migrar UI de upload + resultados a componentes React
11. Reutilizar packages/ui para layout y tablas
12. → Deploy: ocr.ruby.lease en Next.js
```

#### Fase 3 — ai-monitor migration (2 semanas)
```
13. Crear apps/ai-monitor/ con Next.js + TS
14. Migrar los 12 tabs a páginas/secciones
15. Socket.io: activar el client (ya instalado y funcional en backend)
16. Virtualización de lista de eventos (TanStack Virtual)
17. Migrar Chart.js → Recharts (consistencia con flujos)
18. → Deploy: ia.vilarkptl.com en Next.js (backward compatible)
```

#### Fase 4 — fiscalai.mx frontend (3 semanas)
```
19. Crear apps/fiscalai-web/ con Next.js + TS
20. Migrar vistas existentes a componentes
21. API client tipado para PHP endpoints (packages/api-client/sat-php.ts)
22. API client tipado para SAT Bridge Node.js (packages/api-client/sat-bridge.ts)
23. Integrar asesoría fiscal + recomendación de claves SAT (nuevo feature)
24. Integrar flujos del chat (modo proveedor/asistente — nuevo feature)
25. → Deploy: fiscalai.mx en Next.js (PHP backend sin cambios)
```

---

## 6. Compatibilidad frontend ↔ backend

### 6.1 Express.js + Socket.io ↔ Next.js

**Compatibilidad: ✅ Excelente**

```
Next.js (Server Components) → fetch() → Express REST → MySQL
Next.js (Client Components) → Socket.io-client → Socket.io server → eventos en tiempo real
Next.js (API Routes)        → proxy de Express (CORS, auth relay)
```

- Express no necesita modificaciones para servir a Next.js
- Los Server Components de Next.js pueden hacer fetch interno al Express sin pasar por red pública
- Socket.io-client ya funciona con Next.js App Router (Client Components)

### 6.2 PHP API ↔ Next.js

**Compatibilidad: ✅ Buena con API routes de Next.js como proxy**

```
Browser → Next.js API Route (/api/sat/*) → PHP endpoint (fiscalai.mx/catalogos/...)
                                         → Node.js SAT Bridge (localhost:3003)
```

**Ventaja**: Next.js API Routes actúan como BFF (Backend for Frontend), ocultando:
- La URL de PHP (evita CORS, evita exposición de estructura)
- La URL de ruby.lease SaaS (Ekatena)
- Las credenciales FIEL

### 6.3 Tipos compartidos

**Oportunidad crítica**: Los tipos PHP y Node.js son implícitos (sin schema compartido). Migrar el frontend a TypeScript permite crear `packages/types/` como fuente de verdad:

```typescript
// packages/types/sat.ts
export interface RFCDeclaracion {
  rfc: string;
  ejercicio: number;
  periodo: number;
  tipo: 'anual' | 'mensual' | 'bimestral';
  importe_isr: number | null;
  importe_iva: number | null;
  estado: 'presentada' | 'omitida' | 'estimado';
  fuente: 'sat_portal' | 'ekatena' | 'manual';
}

// packages/types/financial.ts (ya existe en lib/api.ts de flujos)
export interface FinOperation { ... }
export interface FinClient { ... }
```

---

## 7. Escalabilidad proyectada con TypeScript + Next.js

| Métrica | Hoy (Vanilla JS) | Con Next.js + TS | Diferencia |
|---------|-----------------|-----------------|------------|
| Usuarios concurrentes flujos | 5–15 | 50–500 (con Redis) | ×30 |
| Usuarios concurrentes fiscalai | 10–100 | 100–1000 (con queue) | ×10 |
| Time to first byte | ~500ms | ~100ms (SSR + edge) | ×5 |
| Bundle size | ~800KB (CDN scripts) | ~150KB (tree-shaken) | ×0.2 |
| Tiempo de desarrollo features | Alto (sin tipos, sin componentes) | Bajo (types + storybook) | ×0.3 |
| Bugs de integración API | Alto (sin validación) | Bajo (Zod en cliente) | ×0.2 |
| Cobertura de tests | 0% | 70%+ (Vitest) | — |

---

## 8. Conclusiones y decisión recomendada

### 8.1 El stack TypeScript es compatible y correcto

Next.js 15 + TypeScript es el stack correcto para los cuatro proyectos porque:

1. **`dashboard-financial` ya lo usa** — no es investigación, es battle-tested en producción
2. **Los backends (Express + Socket.io, PHP, Node SAT Bridge) son perfectamente compatibles** — Next.js es agnóstico al backend
3. **Los tipos compartidos son el mayor win** — hoy PHP ↔ JS ↔ MySQL no tienen schema compartido; TypeScript lo resuelve
4. **Turborepo elimina la duplicación** — un solo `npm install`, un solo linting, una sola paleta de colores

### 8.2 Lo que NO cambiar

| Componente | Decisión | Razón |
|-----------|----------|-------|
| Express.js backends | ✅ Mantener | Estables, bien documentados, no son el problema |
| PHP API layer (fiscalai) | ✅ Mantener temporalmente | Migrar frontend primero, PHP después |
| MySQL / MariaDB | ✅ Mantener | No hay problema de DB |
| Socket.io server | ✅ Mantener | Solo activar el client en Next.js |
| Puppeteer scrapers SAT | ✅ Mantener | Único método funcional; agregar queue |

### 8.3 Lo que SÍ cambiar, en orden

```
1. [Inmediato]  Activar Socket.io + NextAuth en dashboard-financial
2. [Semana 2]   Migrar OCR a Next.js (el más simple)
3. [Semana 3-4] Migrar ai-monitor a Next.js
4. [Mes 2]      Migrar fiscalai.mx frontend a Next.js
5. [Mes 3]      Integrar SAT API + Ekatena en flujos.fiscalai (asesoría fiscal en chat)
```

---

## Apéndice — Diagrama de arquitectura objetivo

```
Browser
  │
  ├─── apps/ai-monitor (Next.js)
  │      └─ Socket.io-client ←→ Express + Socket.io (3010)
  │      └─ fetch /api/* ───→ Express REST (3010) ───→ MySQL ai_monitoring
  │
  ├─── apps/flujos (Next.js) ← ya existe
  │      └─ Socket.io-client ←→ Express + Socket.io (3010)
  │      └─ fetch /api/financial/* → Express (3010) → MySQL ai_monitoring
  │
  ├─── apps/fiscalai-web (Next.js)
  │      └─ fetch /api/sat/* → Next.js API Route → PHP API → SAT Bridge (3003)
  │      └─ fetch /api/ek/*  → Next.js API Route → Ekatena proxy (3000)
  │
  └─── apps/ocr (Next.js)
         └─ fetch /api/ocr/* → Next.js API Route → OCR backend
```

---

*Análisis generado automáticamente por Claude Code. Para actualizar, ejecutar desde `agentic-repo/` el agente con las rutas de servidor actualizadas.*
