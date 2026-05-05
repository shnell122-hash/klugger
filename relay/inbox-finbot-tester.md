## Tarea: Ejecutar suite de pruebas T01-T10

Ejecuta la suite completa de pruebas contra el financial-bot (Flujos AI) en el grupo Testing.
Todos los valores necesarios ya están en `financial/.env`.
Usa curl directo a la Telegram Bot API (sin grammy). Espera 6 segundos entre cada test para que el bot procese.

### Setup

```bash
ENV=/var/www/html/vilarkptl.com/ai-monitor/financial/.env
GV_TOKEN=$(grep -oP 'SIM_GV_BOT_TOKEN=\K.*' "$ENV")
VBPP2_TOKEN=$(grep -oP 'SIM_VBPP2_BOT_TOKEN=\K.*' "$ENV")
C2_TOKEN=$(grep -oP 'SIM_CHRISTIAN2_BOT_TOKEN=\K.*' "$ENV")
CHAT_ID=$(grep -oP 'SIM_CHAT_ID=\K.*' "$ENV")
RELAY_BOT=$(grep -oP 'TELEGRAM_BOT_TOKEN=\K.*' /var/www/html/vilarkptl.com/ai-monitor/relay/.env | head -1)
REPORT_CHAT=$(grep -oP 'FINBOT_TEST_REPORT_CHAT_ID=\K.*' "$ENV")
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/backend/.env)

send_gv() { curl -s "https://api.telegram.org/bot${GV_TOKEN}/sendMessage" -d "chat_id=${CHAT_ID}&text=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$1'))")" | python3 -c "import json,sys; d=json.load(sys.stdin); print('OK:'+str(d.get('result',{}).get('message_id','?')) if d.get('ok') else 'FAIL:'+d.get('description','?'))"; }

db() { mysql -u root -p"$DB_PASS" ai_monitoring -sN -e "$1" 2>/dev/null; }

echo "CHAT_ID=$CHAT_ID"
echo "Setup OK"
```

### T01 — /saldo

```bash
echo "=== T01: /saldo ==="
send_gv "/saldo"
sleep 6
# Verificar que el bot procesó el mensaje (fin_messages reciente)
RECIENTE=$(db "SELECT COUNT(*) FROM fin_messages WHERE chat_id=${CHAT_ID} AND created_at > NOW() - INTERVAL 30 SECOND")
echo "T01: mensajes recientes en DB=$RECIENTE"
[ "$RECIENTE" -gt 0 ] && echo "T01 ✅ Bot procesó el mensaje" || echo "T01 ❌ Sin actividad en DB (bot puede no estar en este chat)"
```

### T02 — /operacion IAS neto 10000

```bash
echo "=== T02: /operacion IAS neto 10000 ==="
send_gv "/operacion IAS neto 10000"
sleep 6
SESION=$(db "SELECT estado FROM fin_sessions WHERE chat_id=${CHAT_ID} ORDER BY updated_at DESC LIMIT 1")
echo "T02: estado sesion=$SESION"
[ -n "$SESION" ] && echo "T02 ✅ Sesión creada: $SESION" || echo "T02 ❌ Sin sesión en DB"
```

### T03 — Enviar CLABE

```bash
echo "=== T03: CLABE Banregio ==="
send_gv "058597000030773833"
sleep 6
DRAFT=$(db "SELECT operation_draft_json FROM fin_sessions WHERE chat_id=${CHAT_ID} ORDER BY updated_at DESC LIMIT 1")
echo "T03: draft=$(echo $DRAFT | python3 -c "import json,sys; d=json.loads(sys.stdin.read() or '{}'); print('monto='+str(d.get('monto_bruto','?'))+' clabe='+str(d.get('instrucciones_pago',{}).get('clabe','?') if isinstance(d.get('instrucciones_pago'),dict) else '?'))" 2>/dev/null || echo "$DRAFT" | head -c 80)"
echo "T03 verificado"
```

### T04 — Cancelar operación (no confirmar en producción real)

```bash
echo "=== T04: Cancelar operación de prueba ==="
send_gv "cancelar"
sleep 4
ESTADO=$(db "SELECT estado FROM fin_sessions WHERE chat_id=${CHAT_ID} ORDER BY updated_at DESC LIMIT 1")
echo "T04: estado=$ESTADO"
[ "$ESTADO" = "cancelado" ] || [ "$ESTADO" = "inicial" ] && echo "T04 ✅ Operación cancelada/reseteada" || echo "T04 ⚠️ Estado=$ESTADO (puede ser normal)"
```

### T08 — Verificar saldo actual de un cliente de prueba

```bash
echo "=== T08: Saldo clientes ==="
CLIENTES=$(db "SELECT nombre, saldo FROM fin_clients ORDER BY updated_at DESC LIMIT 3")
echo "T08: $CLIENTES"
[ -n "$CLIENTES" ] && echo "T08 ✅ Tabla fin_clients accesible" || echo "T08 ❌ Sin clientes en DB"
```

### T09 — Dashboard KPIs

```bash
echo "=== T09: Dashboard API ==="
KPI=$(curl -s http://localhost:3020/api/financial/kpis 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print('operaciones='+str(d.get('total_operaciones','?'))+' saldo_total='+str(d.get('saldo_total','?')))" 2>/dev/null || echo "FAIL: dashboard no responde")
echo "T09: $KPI"
[[ "$KPI" == *"operaciones="* ]] && echo "T09 ✅ Dashboard responde" || echo "T09 ❌ Dashboard: $KPI"
```

### T10 — Verificar operaciones con margen (costo_pct)

```bash
echo "=== T10: Columna margen/costo_pct ==="
MARGEN=$(db "SELECT COUNT(*) FROM fin_operations WHERE costo_pct IS NOT NULL")
echo "T10: operaciones con costo_pct=$MARGEN"
COL=$(db "SHOW COLUMNS FROM fin_operations LIKE 'costo_pct'")
[ -n "$COL" ] && echo "T10 ✅ Columna costo_pct existe" || echo "T10 ❌ Columna costo_pct NO existe (falta migración v14)"
```

### Reporte final

```bash
echo ""
echo "=== REPORTE FINAL ==="
curl -s "https://api.telegram.org/bot${RELAY_BOT}/sendMessage" \
  -d "chat_id=${REPORT_CHAT}&text=Suite T01-T10 ejecutada. Ver outbox para resultados completos." | python3 -c "import json,sys; d=json.load(sys.stdin); print('REPORT OK' if d.get('ok') else 'REPORT FAIL')"
```

### Formato de salida OBLIGATORIO

```
STATUS: done | partial | failed
CHANGED: ninguno
DEPLOYED: no
PENDING: tests que necesitan assets binarios (T05/T06/T07)

T01: ✅/❌ — descripción
T02: ✅/❌ — descripción
T03: ✅/❌ — descripción
T04: ✅/❌ — descripción
T08: ✅/❌ — descripción
T09: ✅/❌ — descripción
T10: ✅/❌ — descripción
```
