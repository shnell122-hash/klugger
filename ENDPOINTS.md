# ENDPOINTS.md — Inventario completo de APIs SAT, Ekatena y Financial Bot

> Generado: 2026-05-22 | Fuente: análisis directo del servidor 143.198.228.78

---

## Índice

1. [SAT Bridge API — `sat-api` localhost:3003](#1-sat-bridge-api--sat-api-localhost3003)
2. [Ekatena API local — `api-ekatena-prod` localhost:3000](#2-ekatena-api-local--api-ekatena-prod-localhost3000)
3. [Ekatena SaaS externa — ruby.lease/api-prod](#3-ekatena-saas-externa--rubyleaseapi-prod)
4. [PHP API — fiscalai.mx/catalogos/SAT_API/php](#4-php-api--fiscalaimxcatalogossat_apiphp)
5. [SAT Portal Scrapers — Puppeteer](#5-sat-portal-scrapers--puppeteer)
6. [Financial Bot — LLM APIs](#6-financial-bot--llm-apis)
7. [Estado de errores e incompletos](#7-estado-de-errores-e-incompletos)
8. [Recomendaciones de scraping](#8-recomendaciones-de-scraping)

---

## Leyenda de estado

| Ícono | Significado |
|-------|-------------|
| ✅ | Funcional con datos reales |
| ⚠️ | Funcional pero con datos parciales o bug conocido |
| ❌ | Roto o datos siempre vacíos |
| 🔍 | Requiere sesión de scraping para poblar |
| 🔒 | Requiere FIEL (e.firma) válida |
| 💾 | Sirve desde caché/DB (no llama portal SAT real) |

---

## 1. SAT Bridge API — `sat-api` localhost:3003

**PM2**: `sat-api` (id 3, fork, ↺10)  
**Código**: `/var/www/html/vilarkptl.com/DeCabeceraTax/catalogos/SAT_API/backend/`  
**DB**: MySQL `SAT_API`  
**Prefijo**: todos bajo `/api`

### 1.1 Sistema y salud

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| GET | `/api/health` | ✅ | `{"status":"ok","timestamp":"..."}` |

### 1.2 Autenticación FIEL (e.firma)

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| GET | `/api/fiel/session/status` | ✅ | Estado del token activo: `{activo, rfc, expira, segundos_restantes, cer_existe, key_existe}` |
| POST | `/api/fiel/session/init` | ⚠️ | Fuerza re-autenticación FIEL. Los tokens SAT duran 5 min; el bridge los renueva automáticamente. Requiere `.cer` y `.key` presentes en rutas del .env |
| POST | `/api/sat/login` | 🔒 | Multipart (cerFile, keyFile, password). Obtiene token JWT SAT vía SOAP. Usado internamente |

### 1.3 Descarga masiva de CFDIs (FIEL/SOAP)

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| POST | `/api/sat/solicitar` | 🔒 | Multipart (cerFile, keyFile). Inicia solicitud de descarga masiva al SAT. Devuelve `idSolicitud` |
| POST | `/api/sat/verificar` | 🔒 | Multipart (cerFile, keyFile). Verifica estado de solicitud. Estados: `Aceptada, EnProceso, Terminada, Rechazada` |
| POST | `/api/sat/descargar` | 🔒 | Multipart (cerFile, keyFile). Descarga ZIP de CFDIs desde SAT |
| POST | `/api/sat/procesar` | ✅ | Body `{zipPath, rfc}`. Procesa ZIP → inserta XMLs en `sat_facturas` |

### 1.4 Histórico de facturas

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| POST | `/api/historico/iniciar` | 🔒 | Multipart (cerFile, keyFile). Inicia job de descarga histórica masiva (años completos). Devuelve `jobId` |
| GET | `/api/historico/progreso/:jobId` | ✅ | Estado del job: `{fase, pct, mensaje}` |
| GET | `/api/historico/facturas` | 💾 | Lista facturas de DB con filtros (`?rfc=, ?tipo=, ?desde=, ?hasta=`) |
| GET | `/api/historico/resumen/:rfc` | 💾 | Resumen anual por RFC desde `sat_facturas` |

### 1.5 Bridge — datos calculados desde CFDIs

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| GET | `/api/bridge/cfdis/:rfc` | 💾 | Lista de CFDIs del RFC con paginación |
| GET | `/api/bridge/conceptos/:rfc` | 💾 | Productos/servicios facturados agrupados por clave SAT |
| GET | `/api/bridge/claves/:rfc` | 💾 | Claves SAT usadas vs registradas + score coherencia |
| GET | `/api/bridge/detalle/:rfc` | 💾 | Detalle fiscal completo (ingresos, egresos, mensual) |
| GET | `/api/bridge/resumen/:rfc` | 💾 | Resumen SAT-only (compatible con `resumen_unificado_api.php`) |
| GET | `/api/bridge/flujo/:rfc` | 💾 | Flujo mensual de ingresos/egresos derivado de CFDIs |
| GET | `/api/bridge/simulacion/:rfc` | 💾 | Simulación fiscal ISR/IVA estimado |
| GET | `/api/analisis/:rfc` | 💾 | Análisis fiscal completo del RFC |

### 1.6 Declaraciones provisionales (calculadas)

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| GET | `/api/bridge/declaraciones/:rfc` | ⚠️ | Declaraciones ISR/IVA desde `sat_declaraciones`. Si no hay datos llama PHP CalcularDeclaraciones.php. Params: `?tipo=mensual\|anual&ejercicio=YYYY`. **Bug**: `isr_pagado` siempre `null` |
| POST | `/api/bridge/declaraciones/:rfc/recalc` | ✅ | Fuerza recálculo desde CFDIs vía PHP |
| GET | `/api/bridge/coeficiente/:rfc` | 💾 | Coeficiente de utilidad (Art. 14 LISR) y proyección cierre anual |
| GET | `/api/fiel/declaraciones/:rfc` | ⚠️ | Declaraciones desde `sat_declaraciones`. Params: `?tipo=mensual\|anual&ejercicio=YYYY`. Mezcla calculadas + `sat_portal` reales. **36 registros reales disponibles para EID=182344** |
| GET | `/api/fiel/saldos/:rfc` | 💾 | Saldos ISR/IVA (a favor o cargo) por ejercicio |
| GET | `/api/fiel/retenciones/:rfc` | 💾 | ISR retenido desde nóminas CFDI tipo N |

### 1.7 Obligaciones y adeudos

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| GET | `/api/fiel/obligaciones/:rfc` | ⚠️ | 4 obligaciones derivadas de actividad CFDI: ISR-MEN, IVA-MEN, ISR-ANU, ISR-RET. `bridge_pendiente:true` (no son datos reales del SAT). Incluye `opinion_cumplimiento` |
| GET | `/api/fiel/adeudos/:rfc` | ⚠️ | Saldos a favor/cargo desde `sat_declaraciones`. No incluye multas reales del SAT |

### 1.8 Información FIEL (datos locales + estimados)

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| GET | `/api/fiel/conceptos/:rfc` | 💾 | Conceptos de productos/servicios desde `sat_facturas`. `bridge_pendiente:false` (dato real) |
| GET | `/api/fiel/contabilidad/:rfc` | ⚠️ | Balance contable desde `sat_balanza` (si existe) o derivado de `sat_facturas`. `bridge_pendiente:true` si no hay `sat_balanza`. Param: `?ejercicio=YYYY` |
| GET | `/api/fiel/avisos/:rfc` | 🔍 | Avisos del Buzón Tributario desde `sat_buzon_notificaciones`. Vacío sin scraping previo |
| GET | `/api/fiel/comercio/:rfc` | 💾 | Indicadores de comercio exterior desde `sat_facturas` |
| GET | `/api/fiel/lfpiorpi/:rfc` | 💾 | Evaluación LFPIORPI desde `sat_listas_negras` |
| GET | `/api/fiel/buzon/:rfc` | 🔍 | Cache de notificaciones del buzón. Requiere scraping previo de `/api/bridge/scrape/buzon/:rfc` |
| GET | `/api/fiel/auditorias/:rfc` | 🔍❌ | Cadena: cache-disco → `sat_auditoria_historico` → `sat_buzon_notificaciones` → respuesta vacía. **`total:0` siempre** — sin datos reales hasta poblar con scraping |

### 1.9 Sincronización FIEL masiva

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| POST | `/api/fiel/sync/:rfc` | ⚠️🔒 | Job de sincronización completo para un RFC: solicitar → verificar → descargar → procesar. **Devuelve `CodEstatus:301` (fecha inválida) actualmente** |
| POST | `/api/fiel/masivo` | 🔒 | Sync masivo de todos los RFCs registrados. Devuelve `masivoId` |
| GET | `/api/fiel/masivo/status/:masivoId` | ✅ | Estado del job masivo |
| GET | `/api/fiel/sync/status/:jobId` | ✅ | Estado de job individual |
| GET | `/api/fiel/sync/history` | ✅ | Historial de todos los jobs de sync |

### 1.10 Scrapers Puppeteer (DyP y Buzón)

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| POST | `/api/bridge/scrape/declaraciones/:rfc` | ⚠️🔒 | Inicia job Puppeteer para scrapear portal DyP (`pstcdypisr.clouda.sat.gob.mx`). Usa e.firma; CIEC como fallback. Intercepta API REST Angular. `isr_pagado` no se almacena (bug línea 709-717) |
| GET | `/api/bridge/scrape/status/:jobId` | ✅ | Estado del scraping job DyP |
| GET | `/api/bridge/scrape/history` | ✅ | Historial de jobs de scraping |
| POST | `/api/bridge/scrape/buzon/:rfc` | ⚠️🔍 | Inicia job Puppeteer para scrapear Buzón Tributario (`wwwmat.sat.gob.mx`). URLs cambiaron en 2025; endpoints internos requieren modo descubrimiento (`SAT_BUZON_DISCOVER=true`) |
| GET | `/api/bridge/scrape/buzon/status/:jobId` | ✅ | Estado del job de buzón |
| GET | `/api/bridge/scrape/buzon/check` | ✅ | Estado general del scraper de buzón |

### 1.11 Empresa y análisis fiscal

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| GET | `/api/empresa/:rfcId/analisis-fiscal` | 💾 | Ingresos/deducciones/ISR/proyección anual desde `sat_facturas`. Param: `?anio=YYYY` |
| POST | `/api/empresa/:rfcId/simular-utilidad` | 💾 | Body `{utilidadMeta}`. Simula plan de deducciones para alcanzar utilidad objetivo |
| GET | `/api/empresa/:rfcId/claves-sat` | 💾 | Claves SAT usadas vs registradas en padrones + score coherencia |

### 1.12 Datos unificados SAT + Ekatena

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| GET | `/api/rfc-completo/:rfc` | ⚠️ | Fusión SAT Bridge + Ekatena local (localhost:3000) + caché `sat_ekatena_cache`. Params: `?ekatena_id=N&ejercicio=YYYY&cfdi_limite=N`. Fuente puede ser `fusionado\|sat_api\|ekatena\|sin_datos` |

### 1.13 Admin

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| GET | `/api/admin/jobs` | ✅ | Lista de jobs de descarga activos/históricos |
| GET | `/api/admin/stats` | ✅ | Estadísticas del sistema (CFDIs, RFCs, espacio) |
| GET | `/api/admin/tabla/:nombre` | ✅ | Contenido de tabla DB (nombre de tabla como param) |
| GET | `/api/admin/rfcs` | ✅ | Lista de RFCs registrados en `sat_org_rfc_access` |
| DELETE | `/api/admin/job/:jobId` | ✅ | Eliminar job |
| DELETE | `/api/admin/rfc/:rfc` | ✅ | Eliminar RFC y sus datos |
| GET | `/api/admin/rfc/:rfc/json` | ✅ | Exportar toda la data de un RFC como JSON |

---

## 2. Ekatena API local — `api-ekatena-prod` localhost:3000

**PM2**: `api-ekatena-prod` (id 1, cluster) y `api-ekatena-test` (id 2, fork)  
**Variable de entorno**: `EKATENA_API_URL=http://127.0.0.1:3000` (default)  
**Llamado desde**: `rfc-unificado.js` (bridge), `resumen_unificado_api.php` (PHP)

Estos endpoints son los del servidor local que actúa como proxy/cache frente al Ekatena SaaS externo (`ruby.lease`).

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| GET | `/api/reports` | ⚠️ | Lista todos los reportes/RFCs registrados en Ekatena. Usado para resolver `ekatena_id` dado un RFC. Devuelve null si Ekatena no tiene el RFC |
| GET | `/api/analisis-resumen/:ekatena_id` | ⚠️ | Resumen ejecutivo del RFC: empresa, constancia, listas negras, `informacion_negocio`. Datos de Ekatena SaaS |
| GET | `/api/flujo-mensual/:ekatena_id` | ⚠️ | Flujo mensual de ingresos/egresos desde Ekatena. Incluye `flujos_detallados[]` con declaraciones Ekatena |
| GET | `/api/analisis_finan/:ekatena_id` | ⚠️ | Análisis financiero: PNL anual, márgenes, EBITDA. Datos para panel "Análisis Financiero" |
| GET | `/api/analisis-lineas/:ekatena_id` | ⚠️ | Análisis por líneas de negocio desde Ekatena |
| GET | `/api/lineas_finan/:ekatena_id` | ⚠️ | Líneas financieras detalladas |

> **Nota**: Todos retornan `null` (fast-fail en 9s) si Ekatena no tiene datos para el RFC. El bridge trata `null` como ausencia de datos Ekatena y sirve solo datos SAT.

---

## 3. Ekatena SaaS externa — ruby.lease/api-prod

**URL base**: `https://ruby.lease/api-prod`  
**Auth**: Sin auth observada en llamadas actuales (probablemente IP whitelist)  
**Llamado desde**: `ekatena_financiero_api.php`, `resumen_unificado_api.php`, `omisiones.js` (frontend directo)

| Método | Path | Estado | Descripción |
|--------|------|--------|-------------|
| GET | `/api-prod/analisis-resumen/:ekatena_id` | ⚠️ | Resumen ejecutivo (empresa, constancia, listas_negras, informacion_negocio). Timeout: 5-15s |
| GET | `/api-prod/flujo-mensual/:ekatena_id` | ⚠️ | Flujo mensual (ingresos, egresos, `flujos_detallados[]` con declaraciones). Timeout: 20s |
| GET | `/api-prod/analisis_finan/:ekatena_id` | ⚠️ | Análisis financiero: PNL, márgenes, ratios. Timeout: 20s (curl_multi en paralelo) |

> **Nota crítica**: El frontend en `omisiones.js:7` llama directamente `EKATENA = 'https://ruby.lease/api-prod'` — esto expone la URL del SaaS externo al cliente. Si Ekatena agrega auth o cambia el dominio, todos los panels se rompen silenciosamente.

---

## 4. PHP API — fiscalai.mx/catalogos/SAT_API/php

**URL base**: `https://fiscalai.mx/catalogos/SAT_API/php`  
**Auth**: Cookie de sesión (`auth_api.php`) + validación RFC por `sat_org_rfc_access`  
**Llamado desde**: JavaScript del frontend (fetch desde páginas de FiscalAI)

### 4.1 fiel_api.php — endpoint maestro de datos FIEL

`GET /catalogos/SAT_API/php/fiel_api.php?rfc=XXX&action=ACTION`

| action | Estado | Descripción |
|--------|--------|-------------|
| `metadata` | 💾 | Lista facturas (emitidas/recibidas). Params: `?tipo=Emitidos\|Recibidos&page=1&limit=50` |
| `resumen` | 💾 | Resumen fiscal: ingresos, egresos, top-contraparte, distribución mensual |
| `conceptos` | 💾 | Productos/servicios facturados agrupados por clave SAT |
| `contabilidad` | ⚠️ | Balanza contable. Param: `?periodo=YYYY-MM`. `bridge_pendiente:true` si sin `sat_balanza` |
| `enrich_xml` | 💾 | Enriquecer datos desde XMLs CFDI descargados |
| `complementarios` | 💾 | CFDIs complementarios (carta porte, pagos, nómina). Param: `?paginas=N` |
| `declaraciones` | ⚠️ | Declaraciones provisionales via bridge. Params: `?tipo=mensual\|anual&ejercicio=YYYY`. `isr_pagado` siempre `null` |
| `obligaciones` | ⚠️ | 4 obligaciones derivadas. `bridge_pendiente:true` |
| `adeudos` | ⚠️ | Saldos desde `sat_declaraciones`. Sin multas reales del SAT |
| `retenciones` | 💾 | ISR retenido desde nóminas |
| `buzon` | 🔍 | Notificaciones del Buzón. Vacío sin scraping |
| `avisos` | 🔍 | Avisos del Buzón |
| `comercio` | 💾 | Indicadores de comercio exterior |
| `lfpiorpi` | 💾 | Evaluación LFPIORPI |
| `auditorias` | 🔍❌ | Auditorías SAT. Siempre `total:0` sin datos reales |

### 4.2 omisiones_api.php

`GET /catalogos/SAT_API/php/omisiones_api.php?rfc=XXX[&ejercicio=YYYY]`

| Estado | Descripción |
|--------|-------------|
| ⚠️ | Detecta omisiones comparando volumen CFDI vs obligaciones estimadas. Devuelve `{ok, meses[], resumen_anual{}, coef_isr, alertas[]}`. **Bug**: `declarado_iva` y `declarado_isr` siempre `null` (líneas 110-111). El panel "ESTIMADO vs CONFIRMADO" siempre muestra ESTIMADO (`omisiones.js:113-127`) |

### 4.3 resumen_unificado_api.php

`GET /catalogos/SAT_API/php/resumen_unificado_api.php?rfc=XXX[&ekatena_id=N]`

| Estado | Descripción |
|--------|-------------|
| ⚠️ | Resumen fusionado SAT Bridge (localhost:3003) + Ekatena local (localhost:3000). TTL caché 24h en `sat_ekatena_cache`. Fuente: `fusionado\|sat_api\|ekatena\|sin_datos` |

### 4.4 ekatena_financiero_api.php

`GET /catalogos/SAT_API/php/ekatena_financiero_api.php?eid=N`

| Estado | Descripción |
|--------|-------------|
| ⚠️ | 4 llamadas en paralelo (curl_multi) a `ruby.lease/api-prod`: analisis-resumen, flujo-mensual, analisis_finan, analisis-lineas. Timeout: 20s. Fusiona y normaliza para el frontend "Análisis Financiero" |

### 4.5 Otros endpoints PHP

| Archivo | Params | Estado | Descripción |
|---------|--------|--------|-------------|
| `69bis_api.php` | `?action=redflags&rfc=XXX` | 💾 | Lista 69-Bis (EFOS, EDOS) + red flags |
| `cfdi_xml_api.php` | `?rfc=XXX` | 💾 | XMLs de CFDI almacenados, con complementos parseados |
| `analisis_fiscal_api.php` | `?rfc=XXX[&anio=YYYY]` | 💾 | Análisis ISR/IVA profundo |
| `omisiones_api.php` | `?rfc=XXX` | ⚠️ | (Ver 4.2) |
| `ml_api.php` | `?rfc=XXX` | 💾 | Modelos ML de riesgo fiscal (detección EFOS, score) |
| `triangulacion_api.php` | `?rfc=XXX` | 💾 | Detección de triangulación fiscal |
| `nomina_api.php` | `?rfc=XXX` | 💾 | Análisis de nómina CFDI tipo N |
| `groq_advisor.php` | POST `{rfc, pregunta}` | 💾 | Asesor fiscal IA (Groq/LLM) |
| `perplexity_reputacion.php` | `?rfc=XXX` | 💾 | Reputación empresarial vía Perplexity |
| `simular_utilidad_api.php` | `?rfc=XXX&utilidad=N` | 💾 | Simular utilidad fiscal objetivo |
| `utilidad_fiscal_api.php` | `?rfc=XXX` | 💾 | Utilidad fiscal real vs estimada |
| `resultados_historicos.php` | `?rfc=XXX` | 💾 | Histórico de resultados declarados |
| `margenes_sectoriales.php` | `?rfc=XXX` | 💾 | Márgenes sectoriales (benchmarking) |
| `efo_edo_eso_api.php` | `?rfc=XXX` | 💾 | Datos de EFO/EDO/ESO (listas negras) |
| `claves_sat_api.php` | `?rfc=XXX` | 💾 | Claves de actividad SAT registradas |
| `auth_api.php` | POST `{email, password}` | ✅ | Autenticación de usuarios |

---

## 5. SAT Portal Scrapers — Puppeteer

### 5.1 Portal Declaraciones y Pagos (DyP)

**Código**: `sat-api/routes/scraper-dyp.js` (~1000 líneas)  
**Trigger**: `POST /api/bridge/scrape/declaraciones/:rfc`

| URL | Estado | Descripción |
|-----|--------|-------------|
| `https://pstcdypisr.clouda.sat.gob.mx` | ✅🔍 | Portal DyP principal — migrado de `www.sat.gob.mx` en feb 2025. Requiere e.firma o CIEC |
| `https://www.sat.gob.mx/declaraciones-pagos` | ⚠️ | Landing informativa (fallback) |
| `https://loginda.siat.sat.gob.mx/` | 🔒 | Gateway WS-Federation para e.firma. Redirecciona a `/nidp/app/login?id=fiel` |
| `https://login.siat.sat.gob.mx/` | 🔒 | Gateway alternativo |

**Flujo de autenticación:**
1. Navega a DyP → redirige automáticamente a `loginda.siat.sat.gob.mx` (WS-Federation)
2. Click en botón "e.Firma" → formulario FIEL con `<input type="file">` para `.cer` y `.key`
3. Sube archivos + contraseña → el JS del SAT firma el challenge → autenticación
4. Intercepta llamadas REST del Angular app (patrones: `/pstcdypisr\.clouda\.sat\.gob\.mx/`)
5. **Fallback CIEC**: si e.firma falla, usa `VILAR_CIEC` en `/nidp/wsfed/ep?id=ciec`

**Bug conocido** (`scraper-dyp.js:709-717`): `isr_pagado` del response interceptado no se almacena en `sat_declaraciones`.

### 5.2 Portal Buzón Tributario

**Código**: `sat-api/routes/scraper-buzon.js`  
**Trigger**: `POST /api/bridge/scrape/buzon/:rfc`

| URL | Estado | Descripción |
|-----|--------|-------------|
| `https://wwwmat.sat.gob.mx/personas/login/mis-notificaciones` | 🔍❌ | **Nuevo portal 2025**. Los endpoints internos REST no están documentados públicamente. Requiere modo descubrimiento |
| `https://wwwmat.sat.gob.mx/iniciar-expediente/mis-notificaciones` | 🔍 | Variante de URL del nuevo portal |
| `https://buzonl.sat.gob.mx` | ❌ | **Desactivado 2025** — URL anterior |
| `https://buzon.sat.gob.mx` | ❌ | **Desactivado 2025** — URL anterior |

**Patrones interceptados** (en modo descubrimiento):
- `/personas\/.*notif/i`
- `/mis-notificaciones/i`
- `/bandeja/i`
- `/notificaciones?\/consultar/i`

> **PENDIENTE**: Los endpoints REST internos del SPA de `wwwmat.sat.gob.mx` NO están documentados. Se requiere una sesión de scraping en modo descubrimiento (`SAT_BUZON_DISCOVER=true`, `SAT_SCRAPER_HEADLESS=false`) para capturarlos.

---

## 6. Financial Bot — LLM APIs

**Código**: `/var/www/html/vilarkptl.com/ai-monitor/financial/bot/`  
**Repo**: `vilarkptl-lang/financial-bot` (nuevo) y `vilarkptl-lang/agentic-repo` (actual)

| Servicio | URL base | Auth | Estado | Descripción |
|---------|----------|------|--------|-------------|
| Google Gemini | SDK `@google/generative-ai` | `GOOGLE_API_KEY` | ✅ | Modelo `gemini-2.0-flash`. OCR de facturas/comprobantes, extracción de datos bancarios, transcripción audio |
| DeepSeek | `https://api.deepseek.com/v1` | `DEEPSEEK_API_KEY` | ✅ | Modelos `deepseek-chat` / `deepseek-pro`. Detección de tipo documento, parsing de texto financiero, orquestación |
| Anthropic Claude | SDK `@anthropic-ai/sdk` | `ANTHROPIC_API_KEY` | ✅ | `claude-sonnet-4-6`. TransactionOrchestrator, VisionAgent (fallback OCR) |
| Telegram Bot API | `https://api.telegram.org` | `FIN_TELEGRAM_BOT_TOKEN` | ✅ | Descarga archivos (imágenes, PDFs, Excel). No tiene scrapers SAT |

**No integra SAT ni Ekatena** — el financial bot procesa exclusivamente documentos subidos por usuarios (cuadros de retorno, comprobantes SPEI, facturas CFDI). La validación de RFCs y UUIDs es local + LLM, no via portal SAT.

---

## 7. Estado de errores e incompletos

### Bugs conocidos documentados

| # | Archivo | Línea | Descripción | Impacto |
|---|---------|-------|-------------|---------|
| 1 | `scraper-dyp.js` | 709-717 | `isr_pagado` del response interceptado no se almacena | `declaraciones[*].isr_pagado` siempre `null` |
| 2 | `omisiones_api.php` | 110-111 | `declarado_iva` y `declarado_isr` nunca se llenan | Panel "ESTIMADO vs CONFIRMADO" siempre muestra ESTIMADO |
| 3 | `omisiones.js` | 113-127 | Lógica de cruce nunca llega al estado CONFIRMADO | UI engañosa — aparece ESTIMADO aunque haya declaraciones reales |
| 4 | `fiel-vilar.js` | sync | `/api/fiel/sync/:rfc` retorna `CodEstatus:301` | Descarga masiva FIEL no funciona — probablemente fecha fuera de rango |
| 5 | `sat-auditorias.js` | 70 | Sin datos en `sat_auditoria_historico` ni buzón | `GET /fiel/auditorias/:rfc` retorna `total:0` siempre |
| 6 | `scraper-buzon.js` | 37-65 | URLs del portal 2025 sin endpoints REST identificados | Scraping de buzón no captura notificaciones reales |
| 7 | `fiel-stubs.js` | 69-116 | `sat_balanza` vacío para la mayoría de RFCs | `fiel/contabilidad` retorna datos estimados con `bridge_pendiente:true` |
| 8 | `sat-derivado.js` | n/a | Pérdidas fiscales sin tabla `sat_perdidas_fiscales` | No se consideran pérdidas de ejercicios anteriores en ISR |

### Endpoints con datos truncados o incompletos

| Endpoint | Campo truncado | Causa | Datos disponibles |
|----------|---------------|-------|-------------------|
| `/api/bridge/declaraciones/:rfc` | `isr_pagado`, `fecha_presentacion`, `linea_captura` | Scraper DyP no almacena estos campos | Solo `isr_cargo` calculado |
| `/api/fiel/obligaciones/:rfc` | Todo | Derivado de CFDIs, no del portal SAT | No refleja obligaciones reales del padrón |
| `fiel_api.php?action=auditorias` | Todo | Sin datos de portal | Siempre `total:0` |
| `omisiones_api.php` | `declarado_iva`, `declarado_isr` | No se alimentan desde sat_declaraciones | Solo datos CFDI (ingresos/egresos) |
| `/api/fiel/buzon/:rfc` | Todo | Requiere scraping | Vacío sin scraping previo |

---

## 8. Recomendaciones de scraping

### Prioridad ALTA

#### 8.1 Sesión de descubrimiento — Buzón Tributario wwwmat

**Por qué**: Los endpoints REST internos del SPA `wwwmat.sat.gob.mx` son desconocidos. El scraper está en modo "adivinación" con regex amplios. Una sola sesión con DevTools resuelve esto definitivamente.

**Cómo**:
```bash
# En servidor con display (o usando xvfb)
SAT_BUZON_DISCOVER=true SAT_SCRAPER_HEADLESS=false \
  pm2 restart sat-api
# Luego ejecutar: POST /api/bridge/scrape/buzon/:rfc
# Revisar logs: pm2 logs sat-api | grep "interceptado"
```

**Tecnología**: Puppeteer (ya implementado). Requiere Chrome con DevTools accesible.

#### 8.2 Fix `isr_pagado` — scraper DyP

**Por qué**: El campo `isr_pagado` está interceptado pero no almacenado. Se requiere inspeccionar el response JSON del Angular app en `clouda.sat.gob.mx` para mapear el campo correcto.

**Cómo**: Ejecutar scraper DyP en modo debug + agregar log de todo el JSON response interceptado → identificar el campo `isr_pagado` → agregar al INSERT en línea 709-717 de `scraper-dyp.js`.

#### 8.3 Fix `omisiones ESTIMADO → CONFIRMADO`

**Por qué**: El estado del panel de omisiones es misleading. Los datos declarados existen en `sat_declaraciones` (36 registros reales) pero no se cruzán correctamente.

**Fix sugerido**: Leer `sat_declaraciones WHERE fuente='sat_portal'` en `omisiones_api.php` y mapear `isr_cargo` a `declarado_isr`, `iva_cargo` a `declarado_iva`.

### Prioridad MEDIA

#### 8.4 Poblar sat_buzon_notificaciones

Una vez que los endpoints del buzón estén identificados (8.1), ejecutar scraping real para el RFC de prueba `VKP200224M58` y verificar que las auditorías se clasifican correctamente en `sat-auditorias.js`.

#### 8.5 Sincronización FIEL fix `CodEstatus:301`

Investigar el rango de fechas válido para solicitudes al SAT CFDI download service. El error 301 = "fecha de solicitud fuera del rango permitido" (generalmente no más de 60 días hacia atrás en solicitudes por tipo).

### Prioridad BAJA

#### 8.6 Tabla sat_perdidas_fiscales

Crear tabla `sat_perdidas_fiscales (rfc, ejercicio, monto_perdida, monto_amortizado)` y alimentarla desde declaraciones anuales para que el coeficiente de utilidad las considere.

#### 8.7 Autenticación ruby.lease

Investigar si `ruby.lease/api-prod` requiere API key o token. Actualmente el frontend llama directo sin auth — riesgo si Ekatena implementa auth.

---

## Apéndice: Variables de entorno requeridas

### sat-api (.env)

```
DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME=SAT_API
VILAR_RFC          # RFC del titular de la FIEL (e.firma)
VILAR_CER_PATH     # Ruta al .cer: /var/www/catalogos/SAT_API/data/fiel/vilar.cer
VILAR_KEY_PATH     # Ruta al .key: /var/www/catalogos/SAT_API/data/fiel/vilar.key
VILAR_KEY_PASS     # Contraseña del .key
VILAR_CIEC         # CIEC (fallback cuando no hay e.firma)
PORT=3003          # Puerto del servidor (default 3003)
SAT_SCRAPER_HEADLESS=true
CHROMIUM_PATH      # Binario de Chrome/Chromium del sistema
EKATENA_API_URL=http://127.0.0.1:3000  # URL del api-ekatena-prod
```

### financial-bot (.env)

```
FIN_TELEGRAM_BOT_TOKEN
ANTHROPIC_API_KEY
GOOGLE_API_KEY
DEEPSEEK_API_KEY
DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME=ai_monitoring
FIN_UPLOADS_DIR
MONITOR_API_URL
MTPROTO_API_ID, MTPROTO_API_HASH  # Para Telethon (sims)
SIM_GV_BOT_TOKEN, SIM_CHAT_ID     # Simulaciones
```
