# Relay Outbox — FinBot — Coordinador de Diagnóstico
_20/5/2026, 3:55:58 p.m. | 439s | exit:0_

RELAY_DIAG user=claude-agent home=/home/claude-agent task=ok resume=e68d0e4f-f740-4c33-a275-de2485d501ba
Analizando ep#1765. Hay tres patrones distintos. Voy a leer los logs y el código en paralelo.Logs revelan dos causas raíz críticas:
1. **`gemini-2.0-flash` no disponible** → `comprobante_noela` + `reintegro_factura` OCR failures
2. **SALDO_QUERY_RE interceptado por `confirmando_cuentas`** → `saldo_kevin`, `saldo_gv`

Voy a buscar los agentes Gemini y preparar los tres fixes en paralelo.Diagnóstico completo. Tres causas raíz:
1. `gemini-2.0-flash` deprecado → 404 en todas las imágenes
2. `SALDO_QUERY_RE` interceptado por `confirmando_cuentas` → saldo queries bloqueadas  
3. `monto_invalido_0` no detectado en bloque `!parsed.monto`

Voy a preparar los 4 archivos a parchear simultáneamente.Now the financial-bot.js fixes. Read the exact context needed:Now applying all three fixes to financial-bot.js:

**Fix 1**: Move SALDO_QUERY_RE to before session state handlers (after stale reset block):**Fix 2**: Remove the old SALDO_QUERY_RE block from after isImplicitOperacion:**Fix 3**: Add monto_invalido_0 detection in the `!parsed.monto` block:Now commit via git plumbing on top of the current remote HEAD:Pushed. Now deploy to server via exec endpoint:All files deployed. Now restart:`financial-bot` online, restarts = 6 (incrementó). Ahora escribir el outbox y restaurar el índice local:## Resultados
✅ Fix aplicado — 3 causas raíz, 3 archivos: `financial-bot.js:817`, `DocumentIntelligenceAgent.js:4`, `vision-agent.js:82`
✅ Sintaxis verificada — `node --check` OK en los 3 archivos
✅ Committed — `654a6e52` "fix: gemini-2.0-flash-001 + saldo-priority + monto_invalido_0 — ep#1765"
✅ Pushed — `claude/financial-multiagent-system-YwtYQ`
✅ Deployed — `pm2 restart financial-bot` ✓ (restarts: 6, uptime: 0s → online)
✅ Outbox — `relay/outbox-finbot-coordinator.md` escrito en main

## Causa raíz

**1. `comprobante_noela` + `reintegro_factura` (OCR failure)**: `gemini-2.0-flash` fue deprecado por Google para "nuevos usuarios" con error 404. Todos los handlers de imagen (DocumentIntelligenceAgent + vision-agent) fallaban silenciosamente con `"No pude leer los números"`. Fix: ambos modelos actualizados a `gemini-2.0-flash-001` (versión GA estable).

**2. `saldo_kevin` + `saldo_gv` → "Cuenta guardada"**: La consulta de saldo llegaba mientras la sesión estaba en `confirmando_cuentas`. Este handler tiene un `return` incondicional, bloqueando el `SALDO_QUERY_RE` que estaba más abajo. Fix: movido el check de saldo a línea 817, antes de todos los state handlers.

**3. `monto_invalido_0` → "Operación IAS. ¿Cuánto deseas operar?"**: Para "manda 0 a IAS neto", `parseCommand` retorna `monto=null` (0 es falsy en `if (m)`), entrando al bloque `!parsed.monto` y pidiendo el monto en vez de rechazarlo. Fix: dentro del bloque `!parsed.monto`, `parseNaturalText(input).monto` detecta explícitamente el 0 y devuelve `❌ Monto inválido`.

## Issues
- `tarjetas_kevin_80000`: sesión queda en `esperando_entrega` tras la primera frase. El CLABE llega como dirección → el poll summary (texto + poll vacío) hace que `wait()` retorne `""`. El fix de `conversation_engine.py` (last-non-empty) está en el branch pero no fue incluido en este deploy. Incluirlo en el próximo checkout resuelve este patrón.