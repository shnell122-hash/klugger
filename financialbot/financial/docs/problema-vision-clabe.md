# Diagnóstico: Bot no extrae CLABEs de capturas de pantalla

> Fecha: 2026-04-25  
> Branch: `claude/financial-multiagent-system-YwtYQ`  
> Síntoma: El usuario envía una foto de una tabla de Excel con CLABEs mientras la sesión está en `esperando_datos_bancarios` y el bot responde: *"No pude extraer cuentas del archivo. Por favor envíame los números directamente como texto."*

---

## 1. Stack tecnológico

| Capa | Tecnología | Rol |
|------|-----------|-----|
| Telegram | grammy v1.31 | Interfaz de usuario, recepción de mensajes/archivos |
| Orquestador | `financial-bot.js` (Node.js, PM2) | Router de estados, coordinación de agentes |
| LLM texto | DeepSeek v3 (OpenAI-compatible API) | Parsing de lenguaje natural, detección de intención, respuestas |
| LLM visión | Claude Haiku (`claude-haiku-4-5-20251001`, Anthropic SDK) | OCR de imágenes: tablas bancarias, facturas |
| Base de datos | MySQL 5.7 / MariaDB | Sesiones, clientes, operaciones, saldos, historial |
| Archivos estructurados | `xlsx` + `csv-parse` | Parsing de archivos Excel/CSV reales |
| Infraestructura | Ubuntu / Apache / PM2 | Servidor `143.198.228.78` |

---

## 2. Árbol de archivos

```
financial/
├── .env.example
├── bot/
│   ├── financial-bot.js          ← Orquestador principal (1211 líneas)
│   ├── package.json
│   ├── agents/
│   │   ├── parser.js             ← Extrae tipo/monto de texto natural
│   │   ├── calculator.js         ← Calcula monto neto, comisión, saldo proyectado
│   │   ├── balance-manager.js    ← Lee/escribe saldos en MySQL
│   │   ├── banking-manager.js    ← Parsea CLABE de texto, Excel, CSV
│   │   ├── invoice-agent.js      ← Detecta facturas/comprobantes (DeepSeek)
│   │   ├── vision-agent.js       ← OCR de imágenes (Claude Haiku)
│   │   ├── context-reader.js     ← Lee historial y decide respuesta (DeepSeek)
│   │   ├── context-manager.js    ← Guarda historial en fin_chats / fin_messages
│   │   ├── poll-handler.js       ← Maneja confirmaciones por encuesta de Telegram
│   │   ├── response-gen.js       ← Genera respuestas en lenguaje natural
│   │   └── verifier.js           ← Valida consistencia de datos antes de guardar
│   ├── config/
│   │   └── commissions.js        ← Tasas por tipo de operación (IAS 5.5%, SPEI 3%, etc.)
│   └── tools/
│       └── file-handler.js       ← Descarga archivos de Telegram, guarda en disco
├── db/
│   ├── migrate-financial-v1.sql  ← fin_clients, fin_operations, fin_balances
│   ├── migrate-financial-v2.sql  ← fin_pending_payments
│   ├── migrate-financial-v3.sql  ← fin_operation_types, instrucciones_pago
│   ├── migrate-financial-v4.sql  ← fin_bank_accounts
│   ├── migrate-financial-v5.sql  ← fin_chats, fin_messages
│   ├── migrate-financial-v6.sql  ← fin_clients.rol + fin_pending_payment_intent
│   └── migrate-financial-v7.sql  ← ENUM estado extendido (fix crítico)
└── docs/
    └── problema-vision-clabe.md  ← Este archivo
```

---

## 3. Árbol de agentes y responsabilidades

```
financial-bot.js (orquestador)
│
├── ContextManager          ← Middleware pasivo
│   └── Registra TODOS los mensajes en fin_chats/fin_messages (MySQL)
│       Sin LLM, solo logging.
│
├── Parser                  ← Sin LLM, regex + heurística
│   └── parseCommand(), parseNaturalText(), isOperacionCommand()
│
├── Calculator              ← Sin LLM, aritmética pura
│   └── calcularMontos(tipo, bruto) → { neto, comision, pct }
│
├── BalanceManager          ← Sin LLM, MySQL
│   └── getSaldo(), registrarPago(), registrarRetorno()
│
├── BankingManager          ← Sin LLM, regex + xlsx
│   ├── parsearTexto(text)  → busca CLABEs/tarjetas en string
│   ├── parsearXlsx(buffer) → detecta columnas, extrae cuentas de Excel real
│   └── parsearCsv(text)    → idem para CSV
│
├── InvoiceAgent            ← LLM: DeepSeek v3
│   └── procesarBuffer(buffer, mimeType, fileName)
│       · PDF → extrae texto con pdf-parse, analiza con DeepSeek
│       · xlsx/csv → lee celdas con xlsx, analiza con DeepSeek
│       · imagen → devuelve { tipo: 'imagen_sin_ocr' }  ← sin capacidad OCR
│
├── VisionAgent             ← LLM: Claude Haiku (visión)
│   ├── extraerCuentasBancarias(buffer, mimeType)
│   │   → { cuentas: [{tipo,numero,titular,banco,monto,confianza}], notas }
│   └── analizarFactura(buffer, mimeType)
│       → { tipo, monto_total, emisor_nombre, datos_bancarios, ... }
│
├── ContextReader           ← LLM: DeepSeek v3
│   └── analizar(mensajes, clienteInfo, nuevoMensaje)
│       → { responder, mensaje, accion }
│
├── ResponseGen             ← LLM: DeepSeek v3
│   └── Genera respuestas conversacionales
│
├── PollHandler             ← Sin LLM, Telegram polls
│   └── Confirmación/cancelación de operaciones
│
└── Verifier                ← Sin LLM, validación de datos
    └── Verifica consistencia antes de guardar operación
```

---

## 4. Máquina de estados de sesión (`fin_sessions.estado`)

```
idle
 │
 ├─[/operacion o texto implícito]──► esperando_tipo
 │                                       │
 │   [/operacion IAS 106000]             │ [usuario escribe tipo]
 │        │                              ▼
 │        └──────────────────────► esperando_monto
 │                                       │
 │                                       │ [usuario escribe monto]
 │                                       ▼
 │                                  esperando_entrega  (solo EFECTIVO)
 │                                       │
 │                                       ▼
 │                               ◄── esperando_datos_bancarios ◄──┐
 │                                       │                        │
 │                                       │ [xlsx/csv/texto]       │ [imagen: BUG]
 │                                       ▼                        │
 │                               confirmando_cuentas ─────────────┘
 │                                       │
 │                                       ▼
 │                               [poll de confirmación]
 │                                       │
 │                               esperando_confirmacion
 │                                       │
 │                                       ▼
 │                                 completado
 │
 ├─[comprobante/factura detectada]──► confirmando_comprobante
 │                                       │
 │                                       ▼
 │                                 confirmando_factura
 │                                       │
 │                                       ▼
 │                                   completado
 │
 └─[/reset]──────────────────────────► idle
```

---

## 5. Routing de archivos/imágenes (el problema)

Cuando el bot recibe un documento o foto (`bot.on(['message:document', 'message:photo'])`), ejecuta este árbol de decisión:

```
archivo recibido
│
├── ¿Es link? → registrar link, return
│
└── No es link → continuar
    │
    ├── Calcular tryInvoice:
    │   tryInvoice = !ACTIVE_ESTADOS_BANKING.includes(session.estado)
    │               && (esPDF || captionEsPago || !ACTIVE_ESTADOS_BLOCK_IMG.includes(session.estado))
    │
    │   ACTIVE_ESTADOS_BANKING = ['esperando_datos_bancarios', 'confirmando_cuentas']
    │
    │   ┌─────────────────────────────────────────────────────────────────┐
    │   │  Si session.estado === 'esperando_datos_bancarios':             │
    │   │    tryInvoice = !true && (...) = false                          │
    │   │                                                                  │
    │   │  ← AQUÍ: el VisionAgent es INALCANZABLE                        │
    │   └─────────────────────────────────────────────────────────────────┘
    │
    ├── [tryInvoice = true] → InvoiceAgent.procesarBuffer()
    │       │
    │       ├── imagen → { tipo: 'imagen_sin_ocr' }
    │       │       │
    │       │       └── [visionAgent disponible]
    │       │               │
    │       │               ├── extraerCuentasBancarias() → cuentas
    │       │               │       └── if (session.estado === 'esperando_datos_bancarios')
    │       │               │               ← CÓDIGO MUERTO: nunca se alcanza
    │       │               │
    │       │               └── analizarFactura() → monto_total
    │       │
    │       └── pdf/xlsx/csv → detectar factura/comprobante
    │
    └── [session.estado === 'esperando_datos_bancarios'] (línea 776)
            │
            ├── mimeType es spreadsheet/excel/xlsx → BankingManager.parsearXlsx() ✅
            ├── mimeType es csv/txt               → BankingManager.parsearCsv()  ✅
            └── mimeType es image/jpeg o image/png → cuentas = []                ← BUG
                    │
                    └── "No pude extraer cuentas del archivo..." ← MENSAJE DE ERROR
```

---

## 6. El bug raíz: código muerto + rama de imagen no cubierta

### Contradicción lógica

El código tiene **dos bloques que intentan manejar imágenes en `esperando_datos_bancarios`**, pero uno de ellos bloquea al otro:

**Bloque A** — `tryInvoice` (línea 641), contiene la lógica del VisionAgent:
```js
// financial-bot.js línea 639
const tryInvoice = !ACTIVE_ESTADOS_BANKING.includes(session.estado) && (...)
//                  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//                  false cuando estado === 'esperando_datos_bancarios'
//                  → todo el bloque, incluyendo VisionAgent, es INALCANZABLE

if (tryInvoice) {            // nunca entra aquí en banking state
  ...
  if (detected?.tipo === 'imagen_sin_ocr') {
    if (visionAgent) {
      const { cuentas } = await visionAgent.extraerCuentasBancarias(...)
      if (cuentas.length) {
        if (session.estado === 'esperando_datos_bancarios') { // ← CÓDIGO MUERTO
          ...
        }
      }
    }
  }
}
```

**Bloque B** — `esperando_datos_bancarios` handler (línea 776), solo maneja archivos estructurados:
```js
// financial-bot.js línea 776
if (session.estado === 'esperando_datos_bancarios') {
  const buffer = await downloadTelegramFileAsBuffer(...)

  if (fileInfo.mimeType?.includes('spreadsheet') || ...) {
    cuentas = BankingManager.parsearXlsx(buffer)   // ✅ xlsx real
  } else {
    cuentas = BankingManager.parsearCsv(...)       // ✅ CSV/TXT
  }
  // ← No hay rama para image/jpeg, image/png, image/webp
  // ← cuentas = [] siempre para imágenes

  if (!cuentas.length) {
    await ctx.reply('No pude extraer cuentas del archivo...')  // ← siempre para imágenes
  }
}
```

### Por qué no se resolvió en iteraciones anteriores

Cada intento de fix se aplicó **dentro del bloque `tryInvoice`** (Bloque A), pero el problema está en **el Bloque B**, que es el que realmente ejecuta para imágenes en estado `esperando_datos_bancarios`. El Bloque A nunca llega a ejecutarse en ese estado. El código en las líneas 659-677 (`if (session.estado === 'esperando_datos_bancarios')` dentro de `tryInvoice`) es **código muerto** — existe en el source pero es lógicamente inalcanzable.

---

## 7. Condiciones del entorno que agravan el problema

### 7.1 Calidad de imagen de capturas de Excel

La imagen enviada por el cliente es una captura de pantalla de Excel en iOS con:
- Fondo oscuro (modo oscuro del sistema)
- Celdas con colores: amarillo, verde, con bordess
- Fuente pequeña (tabla densa con 8 filas × 6 columnas)
- Resolución reducida por la compresión de Telegram (máx. ~1280px en modo foto)

Claude Haiku puede leer estas imágenes pero requiere prompt muy preciso. Sin embargo, dado el bug del Bloque B, **el VisionAgent ni siquiera se llama** para estas imágenes.

### 7.2 Ambigüedad de mimeType

Cuando el cliente envía una imagen desde iOS:
- Si la envía como **foto** (sin comprimir): `mimeType = 'image/jpeg'`
- Si la envía como **documento**: Telegram preserva el archivo pero el mimeType depende del sistema operativo

El Bloque B no distingue ninguna de estas variantes — solo busca `spreadsheet` o `excel` en el mimeType.

### 7.3 Estado de sesión y timeout

La sesión queda en `esperando_datos_bancarios` indefinidamente (no hay timeout). El cliente puede enviar varios archivos y el error se repite cada vez, generando frustración sin feedback útil.

---

## 8. Solución propuesta

El fix mínimo es añadir manejo de imágenes al Bloque B, llamando al VisionAgent cuando el archivo no es un xlsx/csv:

```js
// financial-bot.js línea 776 — Bloque B corregido
if (session.estado === 'esperando_datos_bancarios') {
  const draft  = parseDraft(session.operation_draft_json);
  const buffer = await downloadTelegramFileAsBuffer(BOT_TOKEN, fileInfo.file.file_id);
  let cuentas  = [];

  const esImagen = fileInfo.mimeType?.startsWith('image/');
  const esXlsx   = fileInfo.mimeType?.includes('spreadsheet') ||
                   fileInfo.mimeType?.includes('excel')       ||
                   fileInfo.fileName?.match(/\.xlsx?$/i);

  if (esImagen && visionAgent) {
    // ← NUEVO: OCR de imagen con Claude Haiku
    const { cuentas: cs, notas } = await visionAgent.extraerCuentasBancarias(buffer, fileInfo.mimeType);
    cuentas = cs;
  } else if (esXlsx) {
    cuentas = BankingManager.parsearXlsx(buffer);
  } else {
    cuentas = BankingManager.parsearCsv(buffer.toString('utf-8'));
  }

  if (cuentas.length) {
    // ... resto del flujo de confirmación (ya existente)
  } else if (esImagen) {
    await ctx.reply(
      '📷 No pude leer los números en la imagen.\n\n' +
      'Para mejores resultados, envía el <b>archivo Excel (.xlsx)</b> directamente — ' +
      'no como captura de pantalla.',
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.reply('No pude extraer cuentas del archivo. Por favor envíame los números directamente como texto.');
  }
}
```

Adicionalmente, el código muerto en el Bloque A (líneas 659-677) debería eliminarse para evitar confusión futura.

---

## 9. Estado de las migraciones de base de datos

| Migración | Descripción | Estado |
|-----------|-------------|--------|
| v1 | fin_clients, fin_operations, fin_balances | ✅ Aplicada |
| v2 | fin_pending_payments | ✅ Aplicada |
| v3 | fin_operation_types, instrucciones_pago | ✅ Aplicada |
| v4 | fin_bank_accounts | ✅ Aplicada |
| v5 | fin_chats, fin_messages | ✅ Aplicada |
| v6 | fin_clients.rol + fin_pending_payment_intent | ⚠️ Pendiente verificar |
| v7 | Extiende ENUM estado de fin_sessions | ✅ Aplicada (fix crítico) |

---

## 10. Resumen ejecutivo

El bot falla al procesar capturas de pantalla de tablas bancarias porque existe una **contradicción lógica en el routing de archivos**: la condición que activa el agente de visión (`tryInvoice`) excluye explícitamente el estado `esperando_datos_bancarios`, que es precisamente cuando el cliente envía las imágenes. El manejador alternativo que sí corre en ese estado solo procesa xlsx/csv, no imágenes. El resultado es que el VisionAgent nunca se ejecuta para el caso de uso principal. La solución requiere mover la llamada al VisionAgent al manejador `esperando_datos_bancarios`, no dentro del bloque `tryInvoice`.
