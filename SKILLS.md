# SKILLS.md — Catálogo de skills para agentes del sistema

> Generado: 2026-05-22 | Proyectos: FiscalAI (DeCabeceraTax) + Financial Bot (agentic-repo)

Skills son capacidades atómicas que un agente puede ejecutar en una sola sesión.
Cada skill tiene: objetivo, precondiciones, pasos, criterios de aceptación y riesgos.

---

## Índice por proyecto

### FiscalAI (sat-api / DeCabeceraTax)
- [S01 fiel-session-init](#s01-fiel-session-init)
- [S02 cfdi-sync-rfc](#s02-cfdi-sync-rfc)
- [S03 dyp-scrape](#s03-dyp-scrape)
- [S04 buzon-discover](#s04-buzon-discover)
- [S05 buzon-scrape](#s05-buzon-scrape)
- [S06 declaraciones-calc](#s06-declaraciones-calc)
- [S07 fix-isr-pagado](#s07-fix-isr-pagado)
- [S08 fix-omisiones-estimado](#s08-fix-omisiones-estimado)
- [S09 rfc-completo-verify](#s09-rfc-completo-verify)
- [S10 fix-fiel-sync-301](#s10-fix-fiel-sync-301)
- [S11 auditoria-populate](#s11-auditoria-populate)
- [S12 perdidas-fiscales-schema](#s12-perdidas-fiscales-schema)

### Financial Bot (agentic-repo/financial)
- [S20 balance-init-telethon](#s20-balance-init-telethon)
- [S21 cfdi-parse-document](#s21-cfdi-parse-document)
- [S22 banking-extract-validate](#s22-banking-extract-validate)
- [S23 saldo-recalc-full](#s23-saldo-recalc-full)
- [S24 real-chat-onboard](#s24-real-chat-onboard)

### Infraestructura / Repo Separation
- [S30 repo-separation](#s30-repo-separation)
- [S31 dashboard-testing-route](#s31-dashboard-testing-route)
- [S32 ekatena-auth-probe](#s32-ekatena-auth-probe)

---

## FiscalAI — Skills

### S01 fiel-session-init

**Descripción**: Verificar y renovar la sesión FIEL (e.firma) del sistema.

**Precondiciones**:
- `VILAR_CER_PATH` y `VILAR_KEY_PATH` existen en servidor
- `.cer` válido (verificar fecha expiración, vigente hasta 2028-10-23)
- `sat-api` PM2 online

**Pasos**:
1. `GET http://localhost:3003/api/fiel/session/status`
2. Si `activo:false` o `cer_existe:false` → diagnosticar causa
3. `POST http://localhost:3003/api/fiel/session/init`
4. Verificar que `token_preview` en respuesta es no-nulo y `activo:true`

**Criterios de aceptación**:
- `GET /fiel/session/status` retorna `activo:true`, `segundos_restantes > 200`

**Riesgos**:
- Si `.key` requiere contraseña y `VILAR_KEY_PASS` es incorrecto → `openssl` error
- Los tokens SAT duran solo 5 minutos; el bridge los renueva automáticamente

---

### S02 cfdi-sync-rfc

**Descripción**: Descargar todos los CFDIs de un RFC desde el SAT via FIEL.

**Precondiciones**:
- S01 completado (sesión FIEL activa)
- RFC en `sat_org_rfc_access`

**Pasos**:
1. `POST /api/fiel/sync/:rfc` → obtener `jobId`
2. Polling `GET /api/fiel/sync/status/:jobId` cada 30s
3. Esperar estado `Terminada` o `Error`
4. Verificar registros en `sat_facturas WHERE rfc_emisor=:rfc`

**Criterios de aceptación**:
- Job termina con `CodEstatus:5000` (éxito)
- `SELECT COUNT(*) FROM sat_facturas WHERE rfc_emisor=:rfc` > 0

**Riesgos**:
- `CodEstatus:301` = fecha fuera de rango (ver S10)
- SAT puede retornar solicitudes vacías para períodos sin actividad

---

### S03 dyp-scrape

**Descripción**: Scrapear el portal Declaraciones y Pagos para obtener declaraciones reales con `isr_pagado`, `fecha_presentacion` y `linea_captura`.

**Precondiciones**:
- `VILAR_CER_PATH`, `VILAR_KEY_PATH`, `VILAR_CIEC` en .env del sat-api
- Chromium instalado en servidor (`CHROMIUM_PATH`)
- sat-api PM2 online

**Pasos**:
1. S01 (FIEL activa) como precondición
2. `POST /api/bridge/scrape/declaraciones/:rfc` → obtener `jobId`
3. Polling `GET /api/bridge/scrape/status/:jobId` cada 15s
4. Verificar `sat_declaraciones WHERE rfc=:rfc AND fuente='sat_portal'`
5. Verificar que `isr_pagado` en nuevos registros **NO es null** (post S07)

**Criterios de aceptación**:
- `SELECT COUNT(*) FROM sat_declaraciones WHERE rfc=:rfc AND fuente='sat_portal'` > n_previo
- Al menos 1 registro con `isr_pagado IS NOT NULL`

**Notas**:
- Test RFC: `VKP200224M58` (EID: 182344, `https://fiscalai.mx?id=VKP200224M58&eid=182344`)
- CIEC fallback activo automáticamente si e.firma falla

---

### S04 buzon-discover

**Descripción**: Sesión de descubrimiento del Buzón Tributario para identificar los endpoints REST internos del SPA `wwwmat.sat.gob.mx`.

**Precondiciones**:
- Entorno con display (xvfb o escritorio remoto) para `HEADLESS=false`
- FIEL o CIEC configurado
- `SAT_BUZON_DISCOVER=true` en .env

**Pasos**:
1. Configurar `.env`: `SAT_BUZON_DISCOVER=true`, `SAT_SCRAPER_HEADLESS=false`
2. Reiniciar sat-api: `pm2 restart sat-api`
3. `POST /api/bridge/scrape/buzon/:rfc`
4. Recopilar logs: `pm2 logs sat-api | grep "\[interceptado\]\|\[buzon\]"`
5. Identificar URLs con patrones `/notif`, `/bandeja`, `/comunicado`
6. Documentar los endpoints encontrados en este archivo (S05)

**Criterios de aceptación**:
- Al menos 1 URL REST JSON identificada que devuelve notificaciones
- URL documentada en ENDPOINTS.md §5.2

**Tecnología**: Puppeteer con `page.on('response', ...)` ya implementado.

---

### S05 buzon-scrape

**Descripción**: Ejecutar scraping completo del Buzón Tributario una vez que los endpoints estén identificados (S04).

**Precondiciones**:
- S04 completado — endpoints REST identificados
- `NOTIF_PATTERNS` en `scraper-buzon.js` actualizado con URLs reales

**Pasos**:
1. Actualizar `scraper-buzon.js`: reemplazar patrones genéricos con URL exacta descubierta
2. `POST /api/bridge/scrape/buzon/:rfc`
3. Polling `GET /api/bridge/scrape/buzon/status/:jobId`
4. Verificar `SELECT COUNT(*) FROM sat_buzon_notificaciones WHERE rfc=:rfc`
5. Verificar clasificación en auditorías: `GET /api/fiel/auditorias/:rfc`

**Criterios de aceptación**:
- `sat_buzon_notificaciones` tiene registros para el RFC
- `GET /fiel/auditorias/:rfc` retorna `total > 0`

---

### S06 declaraciones-calc

**Descripción**: Calcular/recalcular declaraciones provisionales ISR/IVA para un RFC desde sus CFDIs.

**Precondiciones**:
- `sat_facturas` tiene datos para el RFC
- PHP disponible en servidor

**Pasos**:
1. Verificar que CFDIs existen: `SELECT COUNT(*) FROM sat_facturas WHERE rfc_emisor=:rfc AND YEAR(fecha_emision)=:anio`
2. `POST /api/bridge/declaraciones/:rfc/recalc` con `?ejercicio=YYYY`
3. Verificar `sat_declaraciones WHERE rfc=:rfc AND ejercicio=:anio AND fuente='calculado'`
4. Revisar que `coeficiente` no es 0 (si hay pérdida fiscal, el coef = 0.01 mínimo)

**Criterios de aceptación**:
- 12 registros mensuales + 1 anual (periodo=0) en `sat_declaraciones`
- `isr_cargo` calculado es coherente con ingresos de `sat_facturas`

---

### S07 fix-isr-pagado

**Descripción**: Corregir el bug que impide almacenar `isr_pagado` del portal DyP.

**Contexto**: `scraper-dyp.js` intercepta el response JSON del Angular app de `clouda.sat.gob.mx` pero no mapea `isr_pagado` al INSERT de `sat_declaraciones`.

**Pasos**:
1. Ejecutar scraper DyP en modo debug: agregar log temporal de todos los campos del response JSON interceptado
2. Identificar el campo exacto (`isr_pagado`, `impuestoPagado`, `isr_efectivamente_pagado`, etc.)
3. En `scraper-dyp.js:709-717` (función `guardarDeclaraciones`): agregar mapeo del campo al UPDATE de `sat_declaraciones`
4. Commit + deploy: `pm2 restart sat-api`
5. Ejecutar S03 para verificar que nuevos registros tienen `isr_pagado IS NOT NULL`

**Archivos a modificar**:
- `sat-api/routes/scraper-dyp.js` (líneas ~709-717, función `guardarDeclaraciones`)
- `sat-api/sql/declaraciones.sql` (verificar que columna `isr_pagado` existe)

---

### S08 fix-omisiones-estimado

**Descripción**: Corregir el bug que hace que el panel de omisiones siempre muestre "ESTIMADO" en lugar de "CONFIRMADO".

**Contexto**: `omisiones_api.php` nunca llena `declarado_isr`/`declarado_iva` (líneas 110-111). La tabla `sat_declaraciones` tiene 36 registros reales con `fuente='sat_portal'` para `VKP200224M58`.

**Pasos**:
1. En `omisiones_api.php`: para cada mes del ejercicio, hacer JOIN con `sat_declaraciones WHERE rfc=:rfc AND CONCAT(ejercicio,'-',LPAD(periodo,2,'0'))=:mes AND fuente IN ('sat_portal','calculado')`
2. Mapear `isr_cargo` → `declarado_isr` y `iva_cargo` → `declarado_iva`
3. En `omisiones.js:113-127`: revisar la lógica de comparación CFDI vs declarado para cambiar badge a "CONFIRMADO" cuando `declarado_isr IS NOT NULL`

**Archivos a modificar**:
- `catalogos/SAT_API/php/omisiones_api.php` (líneas 110-111 + nueva query JOIN)
- `fiscalai/assets/js/omisiones.js` (líneas 113-127)

---

### S09 rfc-completo-verify

**Descripción**: Verificar que el endpoint fusionado `/api/rfc-completo/:rfc` retorna datos correctos de ambas fuentes (SAT Bridge + Ekatena).

**Pasos**:
1. `GET http://localhost:3003/api/rfc-completo/VKP200224M58?ekatena_id=182344`
2. Verificar `_meta.fuente === 'fusionado'`
3. Verificar `_meta.sat_ok === true` y `_meta.ekatena_ok === true`
4. Revisar `fiscal.declaraciones_ekatena` → debe tener registros si Ekatena tiene datos
5. Si `ekatena_ok === false`: diagnosticar `GET http://localhost:3000/api/analisis-resumen/182344`

**Criterios de aceptación**:
- `_meta.fuente` es `fusionado` o al menos `sat_api`
- `empresa.nombre` no es null
- `declaraciones` tiene al menos 12 registros

---

### S10 fix-fiel-sync-301

**Descripción**: Investigar y corregir el error `CodEstatus:301` que retorna el servicio CFDI del SAT.

**Contexto**: `CodEstatus:301` = "El rango de fechas de solicitud no es válido". El SAT limita las solicitudes por tipo:
- Tipo `CFDI`: cualquier fecha
- Tipo `Metadata`: últimos 60 días
- Tipo `XML`: últimos 60 días (en algunos periodos)

**Pasos**:
1. Leer `fiel-vilar.js` función `solicitarDescarga`: verificar el tipo de solicitud y rango de fechas
2. Si la solicitud usa rango > 60 días: dividirla en solicitudes de 30 días
3. Si el error persiste con fechas válidas: revisar el SOAP request con log del request XML
4. Verificar que el RFC solicitante (`VILAR_RFC`) tiene acceso al RFC objetivo en `sat_org_rfc_access`

**Archivos a modificar**:
- `sat-api/routes/fiel-vilar.js` (función de solicitud FIEL SOAP)

---

### S11 auditoria-populate

**Descripción**: Poblar datos reales de auditorías SAT para el RFC de prueba.

**Precondiciones**:
- S04+S05 completados (Buzón Tributario scraping funcional)
- `sat_buzon_notificaciones` tiene registros para el RFC

**Pasos**:
1. Verificar que `sat-auditorias.js` clasifica correctamente las notificaciones del buzón
2. `GET /api/fiel/auditorias/VKP200224M58` → verificar `total > 0`
3. Si sigue en 0: revisar los clasificadores en `sat-auditorias.js:43-66`
4. Alternativamente: escribir directamente en `cache/auditorias_VKP200224M58.json` con datos test

**Criterios de aceptación**:
- `GET /api/fiel/auditorias/:rfc` retorna `{total: N, cartas: [...], revisiones: [...], creditos: [...]}` con N > 0

---

### S12 perdidas-fiscales-schema

**Descripción**: Crear la tabla `sat_perdidas_fiscales` e integrarla en el cálculo de coeficiente de utilidad.

**Pasos**:
1. Crear tabla:
   ```sql
   CREATE TABLE sat_perdidas_fiscales (
     id INT AUTO_INCREMENT PRIMARY KEY,
     rfc VARCHAR(13) NOT NULL,
     ejercicio SMALLINT NOT NULL,
     monto_perdida DECIMAL(18,2) NOT NULL,
     monto_amortizado DECIMAL(18,2) DEFAULT 0,
     fuente ENUM('declaracion','calculado') DEFAULT 'calculado',
     UNIQUE KEY uk_pf (rfc, ejercicio)
   );
   ```
2. En `CalcularDeclaraciones.php`: antes de calcular `coeficiente`, leer pérdidas pendientes del ejercicio anterior y restarlas de la base
3. En `sat-derivado.js:fiel/obligaciones`: incluir pérdidas en `opinion_cumplimiento`

**Archivos a modificar**:
- Nuevo archivo: `sat-api/sql/migrate_perdidas_v1.sql`
- `sat-api/php/CalcularDeclaraciones.php`
- `sat-api/routes/sat-derivado.js`

---

## Financial Bot — Skills

### S20 balance-init-telethon

**Descripción**: Inicializar saldos de clientes reales leyendo el historial completo de Telegram via Telethon.

**Archivo**: `financial/bot/sims/mtproto/balance_initializer.py`

**Precondiciones**:
- Sesión Telethon `gv` autenticada (`sims/mtproto/sessions/gv.session`)
- MySQL `ai_monitoring` accesible
- `financial/.env` con `MTPROTO_API_ID`, `MTPROTO_API_HASH`

**Pasos**:
1. `python3 balance_initializer.py --chat -5135719373 --dry-run` → revisar output
2. Verificar que montos detectados son coherentes con historial real
3. `python3 balance_initializer.py --chat -5135719373 --commit` → escribir a `fin_clients`
4. Verificar en dashboard: `flujos.fiscalai.mx/clients`

**Criterios de aceptación**:
- `fin_clients` tiene registros con `saldo_neto > 0` para los participantes del grupo
- Montos son coherentes con los cuadros de retorno del historial

**Nota**: Las imágenes sin texto requieren OCR manual. El script marca estas ops como `pendiente_ocr:true`.

---

### S21 cfdi-parse-document

**Descripción**: Validar que DocumentIntelligenceAgent.js parsea correctamente facturas CFDI desde imágenes y PDFs.

**Test cases**:
- Factura CFDI standard (XML QR)
- Factura con IVA 0% y 16%
- Nota de crédito (efecto_comprobante=E)
- Factura cancelada

**Pasos**:
1. Subir imagen de factura test al grupo Testing (`-5142407305`)
2. Verificar en `fin_operations`: `tipo_operacion='IAS'`, `monto_bruto`, `monto_neto`, `emisor_rfc`
3. Verificar que `DocumentIntelligenceAgent` extrae `uuid`, `rfc_emisor`, `monto_total`, `iva`
4. Verificar que `datos_bancarios[]` se llena si la factura tiene cuenta destino

**Archivos relevantes**:
- `financial/bot/agents/DocumentIntelligenceAgent.js`
- `financial/bot/agents/vision-agent.js` (fallback)

---

### S22 banking-extract-validate

**Descripción**: Verificar extracción y validación de cuentas bancarias (CLABE 18 dígitos, tarjeta 16 dígitos).

**Test cases**:
- CLABE válida con dígito verificador correcto
- CLABE inválida (17 dígitos, dígito incorrecto)
- Número de tarjeta (16 dígitos)
- Cuenta SPEI (10-11 dígitos)

**Pasos**:
1. Enviar mensaje de texto con cuenta bancaria al grupo Testing
2. Verificar en `fin_banking_accounts`: cuenta registrada con `tipo`, `banco`, `titular`
3. Verificar que CLABEs inválidas son rechazadas con mensaje al usuario

**Archivos relevantes**:
- `financial/bot/agents/banking-manager.js`
- `financial/bot/agents/vision-agent.js` (extracción desde imágenes)

---

### S23 saldo-recalc-full

**Descripción**: Recalcular saldos de todos los clientes activos desde `fin_operations` (en caso de inconsistencias).

**Pasos**:
1. Para cada cliente activo: `SELECT SUM(CASE WHEN es_entrada THEN monto_neto ELSE -monto_neto END) FROM fin_operations WHERE client_id=:id AND estado='completada'`
2. Comparar con `fin_clients.saldo`
3. Si hay diferencia > $1: `UPDATE fin_clients SET saldo=:recalculado WHERE id=:id`
4. Verificar en dashboard `flujos.fiscalai.mx`

**Archivos relevantes**:
- `financial/bot/agents/balance-manager.js`
- `financial/db/financial-queries.js`

---

### S24 real-chat-onboard

**Descripción**: Registrar un nuevo chat real de producción (Operaciones G, Operaciones LT u otro) en `fin_chats`.

**Pasos**:
1. El usuario del chat real envía cualquier mensaje al bot
2. Verificar que `fin_chats` registra el `chat_id` automáticamente
3. Actualizar `REAL_CHAT_IDS` en `financial/backend/routes/financial.js`:
   ```js
   const REAL_CHAT_IDS = [-5135719373, <nuevo_chat_id>];
   ```
4. Commit + deploy backend: `pm2 restart ai-monitor`
5. Verificar que `flujos.fiscalai.mx` (mode=real) incluye las operaciones del nuevo chat

---

## Infraestructura — Skills

### S30 repo-separation

**Descripción**: Migrar el código del financial bot de `agentic-repo` al nuevo repo `vilarkptl-lang/financial-bot`.

**Ver**: Plan completo en conversación anterior (5 fases).

**Resumen de fases**:
1. Crear `/var/www/html/vilarkptl.com/flujos/` con el nuevo repo
2. Copiar archivos: `financial/bot/` → `bot/`, `dashboard-financial/` → `dashboard/`, `financial/db/` → `db/`
3. Actualizar `relay/projects.json` en agentic-repo: rutas de proyectos financieros → nuevo repo
4. Cutover PM2: stop → copy .env → npm install → pm2 start con nuevo ecosystem
5. Cleanup agentic-repo: eliminar `financial/` y `dashboard-financial/`

**Archivos críticos**:
- `deploy/ecosystem.config.js` (separar en dos: ai-monitor vs financial)
- `relay/projects.json` (actualizar paths de flujos, finbot-tester, finbot-verifier)
- `relay/master.js` (hardcoded path `/ai-monitor/financial/.env` → actualizar)

---

### S31 dashboard-testing-route

**Descripción**: Verificar que el build del dashboard Next.js incluye la ruta `/testing`.

**Estado actual**: Build completado (2026-05-22). Verificar:

**Pasos**:
1. `GET https://flujos.fiscalai.mx/testing` → debe cargar sin 404
2. Verificar banner amarillo "Estas operaciones provienen del grupo de simulación"
3. Verificar que KPIs muestran solo operaciones del grupo Testing (`-5142407305`)
4. Verificar que main dashboard `/` muestra 0 ops (hasta que Operaciones G tenga actividad real)

---

### S32 ekatena-auth-probe

**Descripción**: Investigar si `ruby.lease/api-prod` requiere autenticación y si el frontend está exponiendo la URL de forma segura.

**Pasos**:
1. Revisar respuesta de `https://ruby.lease/api-prod/analisis-resumen/182344` sin headers auth
2. Si retorna 401/403: investigar qué token/API key usa el sistema actualmente
3. Implementar proxy PHP para que el frontend no llame directo a ruby.lease:
   - Crear `catalogos/SAT_API/php/ekatena_proxy.php?eid=N&endpoint=analisis-resumen`
   - Actualizar `omisiones.js:7`: `var EKATENA = '/catalogos/SAT_API/php/ekatena_proxy.php'`

**Por qué**: Si Ekatena implementa auth o cambia dominio, el frontend rompe silenciosamente.

---

## Guía de uso

### Cómo usar este catálogo

Cuando el relay-master o un usuario asigna una tarea a un agente, el agente debe:

1. Leer `relay/AGENT-STATUS.md` para ver qué archivos están en uso
2. Identificar el skill más cercano a la tarea solicitada
3. Seguir los pasos del skill como checklist
4. Al terminar: actualizar `relay/AGENT-STATUS.md` y escribir outbox con formato estructurado

### Dependencias entre skills

```
S01 → S02 → S03/S04
S04 → S05 → S11
S03 + S07 → isr_pagado fix completo
S06 + S08 → omisiones CONFIRMADO funcional
S20 → S23 → saldos reales en dashboard
S30 → S31 → separación de repos completa
```
