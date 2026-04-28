#!/bin/bash
# Migración de apps al proxy LiteLLM — Tareas 1-4
# Ejecutar como root en el servidor de producción.
# Cada tarea es independiente; si una falla, las siguientes no se ejecutan.
set -e

LITELLM_URL="https://llm.vilarkptl.com"
LITELLM_KEY="sk-litellm-11b2ccee224b47d82ba9b8e3677aa915"

echo "=== MIGRACIÓN LITELLM — Apps KPTL ==="
echo ""

# ─── Helpers ───────────────────────────────────────────────────────────────
extract_env() {
  local var="$1" file="$2"
  grep -E "^${var}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

add_env_if_missing() {
  local file="$1" var="$2" val="$3"
  if grep -q "^${var}=" "$file" 2>/dev/null; then
    sed -i "s|^${var}=.*|${var}=${val}|" "$file"
    echo "    ✏️  ${var} actualizado en $file"
  else
    echo "" >> "$file"
    echo "${var}=${val}" >> "$file"
    echo "    ✅ ${var} agregado a $file"
  fi
}

# ─── TAREA 1: financial-bot ────────────────────────────────────────────────
echo "═══ TAREA 1: financial-bot ═══"
BOT_SCRIPT=$(pm2 describe financial-bot 2>/dev/null | grep "script path" | awk '{print $NF}')
if [ -z "$BOT_SCRIPT" ]; then
  echo "  ⚠️  financial-bot no encontrado en PM2 — saltando"
else
  echo "  Script: $BOT_SCRIPT"
  BOT_DIR=$(dirname "$BOT_SCRIPT")
  BOT_ENV="$BOT_DIR/.env"

  # Verificar si ya usa LiteLLM
  if grep -q "LITELLM_BASE_URL" "$BOT_ENV" 2>/dev/null; then
    echo "  ℹ️  Ya tiene LITELLM_BASE_URL — verificando valor"
  fi

  # Detectar cliente LLM actual
  echo "  Analizando uso de LLM..."
  grep -n "new OpenAI\|new Anthropic\|openai\|deepseek\|baseURL" "$BOT_SCRIPT" 2>/dev/null | head -10

  # Aplicar feature flag al .env
  [ -f "$BOT_ENV" ] || touch "$BOT_ENV"
  add_env_if_missing "$BOT_ENV" "LITELLM_BASE_URL" "$LITELLM_URL"
  add_env_if_missing "$BOT_ENV" "LITELLM_MASTER_KEY" "$LITELLM_KEY"

  # Verificar si el código necesita patch para leer LITELLM_BASE_URL
  if ! grep -q "LITELLM_BASE_URL\|litellm" "$BOT_SCRIPT"; then
    echo ""
    echo "  ⚠️  financial-bot.js NO lee LITELLM_BASE_URL todavía."
    echo "  El .env ya tiene las vars, pero el código necesita modificación manual."
    echo "  Ver Tarea 1.2 del prompt para el patrón de feature flag."
    echo ""
    echo "  Líneas LLM actuales en $BOT_SCRIPT:"
    grep -n "OpenAI\|Anthropic\|model\|baseURL\|apiKey" "$BOT_SCRIPT" 2>/dev/null | head -15
  else
    echo "  ✅ financial-bot.js ya tiene soporte LITELLM_BASE_URL"
    pm2 restart financial-bot 2>/dev/null && echo "  ✅ financial-bot reiniciado" || echo "  ⚠️  No se pudo reiniciar"
    sleep 3
    pm2 show financial-bot 2>/dev/null | grep -E "status|restarts" || true
  fi
fi
echo ""

# ─── TAREA 2: vilar-api-v2 ────────────────────────────────────────────────
echo "═══ TAREA 2: vilar-api-v2 ═══"
API_SCRIPT=$(pm2 describe vilar-api-v2 2>/dev/null | grep "script path" | awk '{print $NF}')
if [ -z "$API_SCRIPT" ]; then
  echo "  ⚠️  vilar-api-v2 no encontrado en PM2 — saltando"
else
  echo "  Script: $API_SCRIPT"
  API_DIR=$(dirname "$API_SCRIPT")
  API_ENV="$API_DIR/.env"

  echo "  Analizando uso de LLM..."
  grep -n "new OpenAI\|new Anthropic\|openai\|deepseek\|baseURL\|model" "$API_SCRIPT" 2>/dev/null | head -10

  [ -f "$API_ENV" ] || touch "$API_ENV"
  if grep -q "LITELLM_BASE_URL" "$API_ENV" 2>/dev/null; then
    echo "  ℹ️  Ya tiene LITELLM_BASE_URL"
  else
    add_env_if_missing "$API_ENV" "LITELLM_BASE_URL" "$LITELLM_URL"
    add_env_if_missing "$API_ENV" "LITELLM_MASTER_KEY" "$LITELLM_KEY"
  fi

  echo ""
  echo "  ⚠️  Revisar si vilar-api-v2 lee LITELLM_BASE_URL en su código."
  echo "  Líneas LLM actuales:"
  grep -n "OpenAI\|Anthropic\|model\|baseURL\|apiKey" "$API_SCRIPT" 2>/dev/null | head -15
fi
echo ""

# ─── TAREA 3: kptl-credito ────────────────────────────────────────────────
echo "═══ TAREA 3: kptl-credito (Python) ═══"
CREDIT_ENV="/var/www/html/credit-agents/api/.env"
CREDIT_APP="/var/www/html/credit-agents/api/app.py"

if [ ! -f "$CREDIT_APP" ]; then
  echo "  ⚠️  $CREDIT_APP no encontrado — saltando"
else
  echo "  Analizando uso de LLM..."
  grep -n "openai\|anthropic\|deepseek\|groq\|base_url\|model\|client" "$CREDIT_APP" 2>/dev/null | head -15

  [ -f "$CREDIT_ENV" ] || touch "$CREDIT_ENV"
  if grep -q "LITELLM_BASE_URL" "$CREDIT_ENV" 2>/dev/null; then
    echo "  ℹ️  Ya tiene LITELLM_BASE_URL"
  else
    add_env_if_missing "$CREDIT_ENV" "LITELLM_BASE_URL" "$LITELLM_URL"
    add_env_if_missing "$CREDIT_ENV" "LITELLM_MASTER_KEY" "$LITELLM_KEY"
    echo "  ✅ Vars LITELLM agregadas a $CREDIT_ENV"
  fi

  echo ""
  echo "  ⚠️  Verificar que app.py lee LITELLM_BASE_URL (ver Tarea 3.2 del prompt)."
fi
echo ""

# ─── TAREA 4: Vault /opt/kptl-secrets/api-keys.env ────────────────────────
echo "═══ TAREA 4: Actualizar vault de API keys ═══"
VAULT="/opt/kptl-secrets/api-keys.env"

if [ ! -f "$VAULT" ]; then
  echo "  ⚠️  Vault no existe — crear primero con fase-1-seguridad.sh"
else
  ANTHROPIC=$(extract_env ANTHROPIC_API_KEY /var/www/html/vilarkptl.com/ai-monitor/relay/.env)
  DEEPSEEK=$(extract_env  DEEPSEEK_API_KEY  /var/www/html/vilarkptl.com/ai-monitor/relay/.env)
  OPENAI=$(extract_env    OPENAI_API_KEY    /var/www/html/credit-agents/api/.env)
  GROQ=$(extract_env      GROQ_API_KEY      /var/www/html/vilarkptl.com/DeCabeceraTax/catalogos/SAT_API/php/.env)
  TELEGRAM=$(extract_env  TELEGRAM_BOT_TOKEN /var/www/html/vilarkptl.com/ai-monitor/relay/.env)
  GITHUB=$(cat /opt/kptl-secrets/github-pat.txt 2>/dev/null | tr -d '[:space:]')

  [ -n "$ANTHROPIC" ] && sed -i "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${ANTHROPIC}|" "$VAULT"
  [ -n "$DEEPSEEK"  ] && sed -i "s|^DEEPSEEK_API_KEY=.*|DEEPSEEK_API_KEY=${DEEPSEEK}|"   "$VAULT"
  [ -n "$OPENAI"    ] && sed -i "s|^OPENAI_API_KEY=.*|OPENAI_API_KEY=${OPENAI}|"         "$VAULT"
  [ -n "$GROQ"      ] && sed -i "s|^GROQ_API_KEY=.*|GROQ_API_KEY=${GROQ}|"               "$VAULT"
  [ -n "$TELEGRAM"  ] && sed -i "s|^TELEGRAM_BOT_TOKEN=.*|TELEGRAM_BOT_TOKEN=${TELEGRAM}|" "$VAULT"
  [ -n "$GITHUB"    ] && sed -i "s|^GITHUB_PAT=.*|GITHUB_PAT=${GITHUB}|"                 "$VAULT"

  echo "  ✅ Vault actualizado. Keys presentes (primeros 8 chars):"
  grep -v "^#" "$VAULT" | grep "=." | \
    awk -F= '{printf "  %-30s %s\n", $1"=", substr($2,1,8)"..."}'
fi
echo ""

# ─── TAREA 5: ai-monitor — instalar nuevas dependencias ────────────────────
echo "═══ TAREA 5: Instalar dependencias nuevas en ai-monitor ═══"
cd /var/www/html/vilarkptl.com/ai-monitor

# Pull latest main
git pull --rebase origin main 2>&1 | tail -3

# Instalar dependencias (express-session, bcryptjs)
cd backend && npm install --silent 2>&1 | tail -5
echo "  ✅ npm install completado"

# Verificar que los nuevos módulos están
node -e "require('express-session'); require('bcryptjs'); console.log('  ✅ express-session + bcryptjs OK')"

# Reiniciar ai-monitor
pm2 restart ai-monitor 2>/dev/null && echo "  ✅ ai-monitor reiniciado" || echo "  ⚠️  No se pudo reiniciar ai-monitor"
sleep 3
pm2 show ai-monitor 2>/dev/null | grep -E "status|restarts" || true
echo ""

echo "════════════════════════════════════════"
echo "✅ MIGRACIÓN COMPLETADA"
echo ""
echo "ACCIONES MANUALES PENDIENTES:"
echo "→ Verificar que financial-bot.js y vilar-api-v2 leen LITELLM_BASE_URL"
echo "→ Verificar que app.py de kptl-credito usa os.getenv('LITELLM_BASE_URL')"
echo "→ Configurar DASHBOARD_PASSWORD_HASH en backend/.env para activar login:"
echo "  node -e \"require('bcryptjs').hash('TU_PASSWORD',10).then(console.log)\""
echo "════════════════════════════════════════"
