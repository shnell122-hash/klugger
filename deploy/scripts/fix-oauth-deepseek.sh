#!/bin/bash
# fix-oauth-deepseek.sh — Corrige credenciales OAuth + verifica IDs DeepSeek V4
# Ejecutar como root en el servidor: bash deploy/scripts/fix-oauth-deepseek.sh
# Repo: /var/www/html/vilarkptl.com/ai-monitor

set -euo pipefail
RELAY_DIR="/var/www/html/vilarkptl.com/ai-monitor/relay"
ENV_FILE="$RELAY_DIR/.env"
ROOT_CREDS="/root/.claude/.credentials.json"

echo "====== FIX OAUTH + DEEPSEEK V4 — $(date) ======"

# ── 1. Leer CLAUDE_USER del .env ──────────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  CLAUDE_USER=$(grep -oP 'CLAUDE_USER=\K.*' "$ENV_FILE" | tr -d '"' | tr -d "'" | xargs || true)
fi
CLAUDE_USER="${CLAUDE_USER:-claude-agent}"
echo ""
echo "── CLAUDE_USER: $CLAUDE_USER ──"

# Determinar home real
CLAUDE_HOME=$(getent passwd "$CLAUDE_USER" 2>/dev/null | cut -d: -f6 || echo "/home/$CLAUDE_USER")
CLAUDE_CLAUDE_DIR="$CLAUDE_HOME/.claude"
CLAUDE_CREDS="$CLAUDE_CLAUDE_DIR/.credentials.json"
echo "   Home real   : $CLAUDE_HOME"
echo "   Creds target: $CLAUDE_CREDS"

# ── 2. Estado actual de credenciales ─────────────────────────────────────────
echo ""
echo "── Estado credenciales OAuth ──"
if [ -f "$ROOT_CREDS" ]; then
  echo "   ✅ /root/.claude/.credentials.json existe"
  # Mostrar tipo de auth sin exponer el token
  python3 -c "
import json, sys
data = json.load(open('$ROOT_CREDS'))
print('   authMethod      :', data.get('authMethod','?'))
print('   subscriptionType:', data.get('subscriptionType','?'))
print('   oauthAccount    :', data.get('oauthAccount','?')[:40] if data.get('oauthAccount') else '?')
" 2>/dev/null || grep -o '"authMethod":"[^"]*"' "$ROOT_CREDS" || true
else
  echo "   ❌ /root/.claude/.credentials.json NO existe — ejecutar: claude auth login"
fi

if [ -f "$CLAUDE_CREDS" ]; then
  echo "   ✅ $CLAUDE_CREDS ya existe"
  NEEDS_COPY=false
else
  echo "   ❌ $CLAUDE_CREDS NO existe — será copiado desde root"
  NEEDS_COPY=true
fi

# ── 3. Copiar credenciales si faltan ─────────────────────────────────────────
if $NEEDS_COPY && [ -f "$ROOT_CREDS" ]; then
  echo ""
  echo "── Copiando credenciales → $CLAUDE_CREDS ──"
  mkdir -p "$CLAUDE_CLAUDE_DIR"
  cp "$ROOT_CREDS" "$CLAUDE_CREDS"
  chown -R "$CLAUDE_USER:$CLAUDE_USER" "$CLAUDE_CLAUDE_DIR"
  chmod 600 "$CLAUDE_CREDS"
  echo "   ✅ Copiado y permisos OK"
elif $NEEDS_COPY; then
  echo "   ⚠️  No hay credenciales en /root/.claude/ para copiar"
  echo "   → Ejecutar primero: claude auth login"
fi

# ── 4. Test: subprocess como CLAUDE_USER ─────────────────────────────────────
echo ""
echo "── Test subprocess claude --print como $CLAUDE_USER ──"
CLAUDE_BIN=$(grep -oP 'CLAUDE_BIN=\K.*' "$ENV_FILE" 2>/dev/null | tr -d '"' | tr -d "'" | xargs || echo "claude")

TEST_CMD="HOME=$CLAUDE_HOME $CLAUDE_BIN --print --model claude-haiku-4-5-20251001"
set +e
RESULT=$(su -s /bin/bash -c "$TEST_CMD <<< 'di: pong'" "$CLAUDE_USER" 2>&1 | head -3)
EXIT=$?
set -e
if [ $EXIT -eq 0 ] && echo "$RESULT" | grep -qi "pong\|hola\|ok\|ping\|asistente\|ayudar"; then
  echo "   ✅ OAuth funciona: $CLAUDE_USER usa Pro/Max (\$0)"
else
  echo "   ⚠️  Respuesta (exit=$EXIT): ${RESULT:0:120}"
  echo "   → Si dice 'Invalid API key': necesita claude auth login como $CLAUDE_USER"
  echo "   → Si dice 'permission': verificar que $CLAUDE_USER exista (id $CLAUDE_USER)"
fi

# ── 5. Verificar IDs DeepSeek V4 ─────────────────────────────────────────────
echo ""
echo "── DeepSeek V4 — IDs disponibles en la API ──"
DS_KEY=$(grep -oP 'DEEPSEEK_API_KEY=\K.*' "$ENV_FILE" 2>/dev/null | tr -d '"' | tr -d "'" | xargs || true)

if [ -z "$DS_KEY" ]; then
  echo "   ❌ DEEPSEEK_API_KEY no configurada en $ENV_FILE"
else
  echo "   Clave: ...${DS_KEY: -6}"
  MODELS_JSON=$(curl -s --max-time 10 https://api.deepseek.com/v1/models \
    -H "Authorization: Bearer $DS_KEY" 2>/dev/null || echo '{"error":"timeout"}')

  if echo "$MODELS_JSON" | grep -q '"error"'; then
    echo "   ❌ Error al consultar modelos: $(echo "$MODELS_JSON" | head -c 200)"
  else
    AVAILABLE=$(echo "$MODELS_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
ids = [m['id'] for m in data.get('data', [])]
print('\n'.join(ids))
" 2>/dev/null || echo "$MODELS_JSON" | grep -oP '"id":"[^"]+"' | tr -d '"id:' )
    echo "   Modelos disponibles:"
    echo "$AVAILABLE" | sed 's/^/     - /'

    # Verificar V4 IDs
    FLASH_MODEL=$(grep -oP 'DEEPSEEK_FLASH_MODEL=\K.*' "$ENV_FILE" 2>/dev/null | xargs || echo "deepseek-v4-flash")
    PRO_MODEL=$(grep -oP 'DEEPSEEK_PRO_MODEL=\K.*' "$ENV_FILE" 2>/dev/null | xargs || echo "deepseek-v4-pro")

    echo ""
    if echo "$AVAILABLE" | grep -q "^${FLASH_MODEL}$"; then
      echo "   ✅ FLASH ($FLASH_MODEL) — ID válido"
    else
      echo "   ❌ FLASH ($FLASH_MODEL) — ID no encontrado en la API"
      # Sugerir alternativa
      SUGGESTION=$(echo "$AVAILABLE" | grep -i "flash\|fast\|v4" | head -1 || echo "deepseek-chat")
      echo "      → Sugerencia: $SUGGESTION"
      echo "      → Agregar a relay/.env: DEEPSEEK_FLASH_MODEL=$SUGGESTION"
    fi

    if echo "$AVAILABLE" | grep -q "^${PRO_MODEL}$"; then
      echo "   ✅ PRO ($PRO_MODEL) — ID válido"
    else
      echo "   ❌ PRO ($PRO_MODEL) — ID no encontrado en la API"
      SUGGESTION=$(echo "$AVAILABLE" | grep -i "pro\|reason\|v4\|chat" | head -1 || echo "deepseek-chat")
      echo "      → Sugerencia: $SUGGESTION"
      echo "      → Agregar a relay/.env: DEEPSEEK_PRO_MODEL=$SUGGESTION"
    fi
  fi
fi

# ── 6. Estado PM2 proxy ───────────────────────────────────────────────────────
echo ""
echo "── Claude Proxy (puerto 5001) ──"
if pm2 list 2>/dev/null | grep -q "claude-proxy"; then
  pm2 list | grep "claude-proxy"
  if curl -s --max-time 3 http://127.0.0.1:5001/health 2>/dev/null | grep -q '"ok":true'; then
    echo "   ✅ claude-proxy respondiendo en :5001"
  else
    echo "   ❌ claude-proxy process existe pero no responde en :5001"
  fi
else
  echo "   ❌ claude-proxy NO está en PM2"
  echo "   → Iniciar: pm2 start /var/www/html/vilarkptl.com/ai-monitor/deploy/claude-proxy.js --name claude-proxy -- --port 5001"
fi

PROXY_URL=$(grep -oP 'ANTHROPIC_PROXY_URL=\K.*' "$ENV_FILE" 2>/dev/null | xargs || true)
if [ -n "$PROXY_URL" ]; then
  echo "   ANTHROPIC_PROXY_URL=$PROXY_URL ✅"
else
  echo "   ❌ ANTHROPIC_PROXY_URL no seteada → callAnthropicDirect usa API de pago"
  echo "   → Agregar a relay/.env: ANTHROPIC_PROXY_URL=http://127.0.0.1:5001"
fi

# ── 7. Resumen ────────────────────────────────────────────────────────────────
echo ""
echo "====== RESUMEN ======"
echo "1. OAuth $CLAUDE_USER   : $([ -f "$CLAUDE_CREDS" ] && echo '✅' || echo '❌')"
echo "2. claude-proxy :5001   : $(curl -s --max-time 2 http://127.0.0.1:5001/health 2>/dev/null | grep -q '"ok":true' && echo '✅' || echo '❌')"
echo "3. ANTHROPIC_PROXY_URL  : $([ -n "${PROXY_URL:-}" ] && echo "✅ $PROXY_URL" || echo '❌ no seteada')"
echo "4. DEEPSEEK_FLASH_MODEL : ${FLASH_MODEL:-no leído}"
echo "5. DEEPSEEK_PRO_MODEL   : ${PRO_MODEL:-no leído}"
echo ""
echo "── Comando de deploy final ──"
echo "cd /var/www/html/vilarkptl.com/ai-monitor"
echo "git fetch origin main && git reset --hard origin/main"
echo "cd relay && npm install @langchain/langgraph @langchain/core --save 2>/dev/null; cd .."
echo "pm2 restart relay-master ai-monitor"
