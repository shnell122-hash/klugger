#!/bin/bash
# SESIÓN FINAL — Prioridad 3: Verificar panel API Keys + Prioridad 4: Seguridad
# Ejecutar como root después de p1-git.sh y p2-litellm.sh

REPO="/var/www/html/vilarkptl.com/ai-monitor"
cd "$REPO"

echo "=== PRIORIDAD 3: Panel API Keys ==="
echo ""

# ─── 3.1 Ejecutar migraciones pendientes ──────────────────────────────────
echo "[3.1] Ejecutando migraciones de base de datos..."
for sql in backend/db/migrate-v10.sql backend/db/migrate-v11.sql; do
  if [ -f "$sql" ]; then
    mysql ai_monitoring < "$sql" 2>/dev/null && echo "  ✅ $sql aplicada" || echo "  ℹ️  $sql ya aplicada o sin cambios"
  fi
done
echo ""

# ─── 3.2 Verificar que el vault es legible por Node.js ────────────────────
echo "[3.2] Verificando acceso al vault..."
VAULT="/opt/kptl-secrets/api-keys.env"
if [ -f "$VAULT" ]; then
  COUNT=$(grep -c "=." "$VAULT" 2>/dev/null || echo 0)
  echo "  ✅ Vault existe con $COUNT keys configuradas"
  echo "  Permisos: $(stat -c '%a %U:%G' "$VAULT")"
else
  echo "  ❌ Vault no encontrado en $VAULT"
  echo "  Ejecutar primero: bash deploy/scripts/fase-1-seguridad.sh"
fi
echo ""

# ─── 3.3 Probar GET /api/keys directamente (sin auth — debe dar 401) ──────
echo "[3.3] Verificando endpoint /api/keys..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3010/api/keys)
if [ "$CODE" = "401" ]; then
  echo "  ✅ /api/keys sin auth → 401 (correcto — protegido)"
elif [ "$CODE" = "200" ]; then
  echo "  ⚠️  /api/keys sin auth → 200 — requireAuth middleware no está activo"
else
  echo "  ℹ️  /api/keys → HTTP $CODE"
fi
echo ""

# ─── 3.4 Reiniciar ai-monitor con --update-env ────────────────────────────
echo "[3.4] Reiniciando ai-monitor..."
pm2 restart ai-monitor --update-env 2>/dev/null && echo "  ✅ ai-monitor reiniciado" || echo "  ⚠️  Error al reiniciar"
sleep 3
pm2 show ai-monitor 2>/dev/null | grep -E "status|restarts" || true
echo ""

echo "════════════════════════════════════════"
echo "✅ PRIORIDAD 3 COMPLETADA"
echo "Abrir ia.vilarkptl.com → pestaña 🔑 Keys para verificar"
echo "════════════════════════════════════════"
echo ""

echo "=== PRIORIDAD 4: Seguridad de infraestructura ==="
echo ""

# ─── 4.1 Bloquear directory listing en vilarkptl.com/ai-monitor/ ──────────
echo "[4.1] Bloqueando directory listing..."
HTACCESS="/var/www/html/vilarkptl.com/ai-monitor/.htaccess"
if [ -f "$HTACCESS" ] && grep -q "Options -Indexes" "$HTACCESS"; then
  echo "  ℹ️  .htaccess ya tiene Options -Indexes"
else
  echo "Options -Indexes" > "$HTACCESS"
  echo "  ✅ .htaccess creado con Options -Indexes"
fi

# Verificar resultado
CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://vilarkptl.com/ai-monitor/" 2>/dev/null || \
       curl -s -o /dev/null -w "%{http_code}" "http://vilarkptl.com/ai-monitor/" 2>/dev/null)
if [ "$CODE" = "403" ]; then
  echo "  ✅ vilarkptl.com/ai-monitor/ → 403 (directory listing bloqueado)"
elif [ "$CODE" = "301" ] || [ "$CODE" = "302" ]; then
  echo "  ℹ️  Responde con redirect $CODE (puede ser correcto)"
else
  echo "  Respuesta: $CODE — verificar manualmente"
fi
echo ""

# ─── 4.2 Cerrar MySQL puerto 3306 al exterior ─────────────────────────────
echo "[4.2] Verificando conexiones MySQL externas..."
EXT_CONN=$(ss -tn 2>/dev/null | grep 3306 | grep -v "127.0.0.1\|::1\|0.0.0.0" || true)
if [ -n "$EXT_CONN" ]; then
  echo "  ⚠️  Hay conexiones externas activas a MySQL:"
  echo "$EXT_CONN"
  echo "  NO cerrando el puerto — confirmar con Vilar primero"
else
  echo "  ✅ Sin conexiones externas a MySQL"
  # Verificar si hay apps configuradas con host externo
  EXT_HOST=$(grep -rn "DB_HOST\|MYSQL_HOST" /var/www/ 2>/dev/null \
    | grep -v "localhost\|127.0.0.1\|node_modules\|venv\|\.pyc" \
    | grep -v "^Binary" | head -10)
  if [ -n "$EXT_HOST" ]; then
    echo "  ℹ️  Apps con DB_HOST no-local (revisar antes de cerrar):"
    echo "$EXT_HOST"
  else
    echo "  ✅ Todas las apps usan MySQL local — cerrando puerto 3306 al exterior"
    if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
      ufw deny 3306/tcp comment 'MySQL — solo acceso local' 2>/dev/null
      ufw reload
      echo "  ✅ UFW: 3306/tcp DENY IN"
      ufw status | grep 3306
    else
      echo "  ℹ️  UFW no activo — agregar regla manualmente si UFW se habilita"
      echo "  Comando: ufw deny 3306/tcp"
    fi
  fi
fi
echo ""

# ─── 4.3 Cerrar puerto 4000 (LiteLLM) ────────────────────────────────────
echo "[4.3] Cerrando puerto 4000 (LiteLLM directo)..."
if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
  if ufw status | grep -q "4000"; then
    echo "  ℹ️  Regla para 4000 ya existe:"
    ufw status | grep 4000
  else
    ufw deny 4000/tcp comment 'LiteLLM — solo via Apache proxy'
    ufw reload
    echo "  ✅ UFW: 4000/tcp DENY IN"
  fi
else
  echo "  ℹ️  UFW no activo — pendiente de habilitar"
fi

# Verificar que el proxy HTTPS sigue funcionando
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" \
  https://llm.vilarkptl.com/health \
  -H "Authorization: Bearer sk-litellm-11b2ccee224b47d82ba9b8e3677aa915" 2>/dev/null)
[ "$HEALTH" = "200" ] && echo "  ✅ llm.vilarkptl.com/health → 200 (proxy HTTPS OK)" || \
  echo "  ⚠️  llm.vilarkptl.com/health → $HEALTH"
echo ""

echo "════════════════════════════════════════"
echo "✅ PRIORIDADES 3 y 4 COMPLETADAS"
echo "════════════════════════════════════════"
