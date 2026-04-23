#!/bin/bash
set -e

echo "=== FASE 3: Instalación LiteLLM Proxy (KPTL AI Gateway) ==="
echo ""

REPO="/var/www/html/vilarkptl.com/ai-monitor"

# ─── Leer API keys de sus archivos de origen ───────────────────────────────
extract_env() {
  local var="$1" file="$2"
  grep -E "^${var}=" "$file" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

ANTHROPIC_KEY=$(extract_env ANTHROPIC_API_KEY "$REPO/relay/.env")
DEEPSEEK_KEY=$(extract_env  DEEPSEEK_API_KEY  "$REPO/relay/.env")
OPENAI_KEY=$(extract_env    OPENAI_API_KEY    "/var/www/html/credit-agents/api/.env")
GROQ_KEY=$(extract_env      GROQ_API_KEY      "/var/www/html/vilarkptl.com/DeCabeceraTax/catalogos/SAT_API/php/.env")

echo "[0/6] Verificando keys encontradas..."
[ -n "$ANTHROPIC_KEY" ] && echo "    ✅ ANTHROPIC_API_KEY" || echo "    ❌ ANTHROPIC_API_KEY no encontrada"
[ -n "$DEEPSEEK_KEY"  ] && echo "    ✅ DEEPSEEK_API_KEY"  || echo "    ⚠️  DEEPSEEK_API_KEY no encontrada (fallback omitido)"
[ -n "$OPENAI_KEY"    ] && echo "    ✅ OPENAI_API_KEY"    || echo "    ⚠️  OPENAI_API_KEY no encontrada (fallback omitido)"
[ -n "$GROQ_KEY"      ] && echo "    ✅ GROQ_API_KEY"      || echo "    ⚠️  GROQ_API_KEY no encontrada (fallback omitido)"

if [ -z "$ANTHROPIC_KEY" ]; then
  echo ""
  echo "    ❌ ANTHROPIC_API_KEY es requerida. Abortando."
  exit 1
fi
echo ""

# ─── PASO 1: Crear usuario y directorio ────────────────────────────────────
echo "[1/6] Preparando directorio /opt/litellm/..."
useradd --system --no-create-home --shell /usr/sbin/nologin litellm 2>/dev/null || true
mkdir -p /opt/litellm
chown litellm:litellm /opt/litellm
echo "    ✅ Directorio listo"
echo ""

# ─── PASO 2: Instalar LiteLLM en venv ──────────────────────────────────────
echo "[2/6] Instalando LiteLLM en Python venv (puede tardar 2-3 min)..."
python3 -m venv /opt/litellm/venv
/opt/litellm/venv/bin/pip install --upgrade pip --quiet
/opt/litellm/venv/bin/pip install "litellm[proxy]" --quiet
echo "    ✅ LiteLLM instalado"
echo ""

# ─── PASO 3: Crear config.yaml ─────────────────────────────────────────────
echo "[3/6] Creando /opt/litellm/config.yaml..."
cat > /opt/litellm/config.yaml << 'YAMLEOF'
model_list:
  # kptl-chat: Sonnet 4.6 → DeepSeek V3 → GPT-4o → Groq Llama 3.3
  - model_name: kptl-chat
    litellm_params:
      model: claude-sonnet-4-6
      api_key: os.environ/ANTHROPIC_API_KEY
  - model_name: kptl-chat
    litellm_params:
      model: deepseek/deepseek-chat
      api_key: os.environ/DEEPSEEK_API_KEY
      api_base: https://api.deepseek.com/v1
  - model_name: kptl-chat
    litellm_params:
      model: gpt-4o
      api_key: os.environ/OPENAI_API_KEY
  - model_name: kptl-chat
    litellm_params:
      model: groq/llama-3.3-70b-versatile
      api_key: os.environ/GROQ_API_KEY

  # kptl-chat-fast: Haiku 4.5 → GPT-4o-mini → Groq
  - model_name: kptl-chat-fast
    litellm_params:
      model: claude-haiku-4-5-20251001
      api_key: os.environ/ANTHROPIC_API_KEY
  - model_name: kptl-chat-fast
    litellm_params:
      model: gpt-4o-mini
      api_key: os.environ/OPENAI_API_KEY
  - model_name: kptl-chat-fast
    litellm_params:
      model: groq/llama-3.3-70b-versatile
      api_key: os.environ/GROQ_API_KEY

  # kptl-vision: Claude Sonnet → GPT-4o
  - model_name: kptl-vision
    litellm_params:
      model: claude-sonnet-4-6
      api_key: os.environ/ANTHROPIC_API_KEY
  - model_name: kptl-vision
    litellm_params:
      model: gpt-4o
      api_key: os.environ/OPENAI_API_KEY

  # kptl-reasoning: DeepSeek R1 → Claude Opus 4.7 → GPT-4o
  - model_name: kptl-reasoning
    litellm_params:
      model: deepseek/deepseek-reasoner
      api_key: os.environ/DEEPSEEK_API_KEY
      api_base: https://api.deepseek.com/v1
  - model_name: kptl-reasoning
    litellm_params:
      model: claude-opus-4-7
      api_key: os.environ/ANTHROPIC_API_KEY
  - model_name: kptl-reasoning
    litellm_params:
      model: gpt-4o
      api_key: os.environ/OPENAI_API_KEY

router_settings:
  num_retries: 2
  retry_after: 5
  allowed_fails: 1

litellm_settings:
  drop_params: true
  request_timeout: 600

general_settings:
  master_key: os.environ/LITELLM_MASTER_KEY
YAMLEOF
chmod 640 /opt/litellm/config.yaml
chown root:litellm /opt/litellm/config.yaml
echo "    ✅ config.yaml creado"
echo ""

# ─── PASO 4: Crear .env con las keys ───────────────────────────────────────
echo "[4/6] Creando /opt/litellm/.env con keys..."
LITELLM_MASTER=$(openssl rand -hex 16)

cat > /opt/litellm/.env << ENVEOF
ANTHROPIC_API_KEY=${ANTHROPIC_KEY}
DEEPSEEK_API_KEY=${DEEPSEEK_KEY}
OPENAI_API_KEY=${OPENAI_KEY}
GROQ_API_KEY=${GROQ_KEY}
LITELLM_MASTER_KEY=sk-litellm-${LITELLM_MASTER}
ENVEOF
chmod 600 /opt/litellm/.env
chown litellm:litellm /opt/litellm/.env
echo "    ✅ .env creado (permisos 600)"
echo ""

# ─── PASO 5: Crear e iniciar servicio systemd ───────────────────────────────
echo "[5/6] Instalando servicio systemd litellm..."
cat > /etc/systemd/system/litellm.service << 'SVCEOF'
[Unit]
Description=LiteLLM Proxy — KPTL AI Gateway
After=network-online.target

[Service]
Type=simple
User=litellm
WorkingDirectory=/opt/litellm
EnvironmentFile=/opt/litellm/.env
ExecStart=/opt/litellm/venv/bin/litellm --config /opt/litellm/config.yaml --port 4000 --host 127.0.0.1 --num_workers 1
Restart=on-failure
RestartSec=10
MemoryMax=350M
MemorySwapMax=0

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
systemctl enable litellm
systemctl start litellm
echo "    ✅ Servicio litellm iniciado"
echo ""

# ─── PASO 6: Esperar arranque y activar en relay/.env ──────────────────────
echo "[6/6] Verificando health y activando en relay/.env..."
sleep 5

HEALTH=$(curl -s http://localhost:4000/health 2>/dev/null || echo "no-response")
if echo "$HEALTH" | grep -q "healthy\|status\|ok"; then
  echo "    ✅ LiteLLM responde en localhost:4000"

  # Agregar vars al relay/.env si no existen aún
  RELAY_ENV="$REPO/relay/.env"
  if ! grep -q "^LITELLM_BASE_URL=" "$RELAY_ENV" 2>/dev/null; then
    echo "" >> "$RELAY_ENV"
    echo "# LiteLLM proxy fallback" >> "$RELAY_ENV"
    echo "LITELLM_BASE_URL=http://localhost:4000" >> "$RELAY_ENV"
    echo "LITELLM_MASTER_KEY=sk-litellm-${LITELLM_MASTER}" >> "$RELAY_ENV"
    echo "    ✅ LITELLM_BASE_URL y LITELLM_MASTER_KEY agregadas a relay/.env"
  else
    echo "    ℹ️  LITELLM_BASE_URL ya existe en relay/.env"
  fi

  # Reiniciar claude-chat-bot para que tome las nuevas vars
  pm2 restart claude-chat-bot 2>/dev/null && echo "    ✅ claude-chat-bot reiniciado" || true
else
  echo "    ⚠️  LiteLLM aún no responde. Verificar con: systemctl status litellm"
  echo "    Respuesta recibida: $HEALTH"
fi
echo ""

# ─── RESUMEN ───────────────────────────────────────────────────────────────
echo "════════════════════════════════════════"
echo "✅ FASE 3 COMPLETADA"
echo ""
echo "LiteLLM escucha en: http://localhost:4000"
echo "Master key:         sk-litellm-${LITELLM_MASTER}"
echo ""
echo "Chains de fallback activas:"
echo "  kptl-chat      → Claude Sonnet → DeepSeek → GPT-4o → Groq"
echo "  kptl-chat-fast → Claude Haiku  → GPT-4o-mini → Groq"
echo "  kptl-vision    → Claude Sonnet → GPT-4o"
echo "  kptl-reasoning → DeepSeek R1   → Claude Opus → GPT-4o"
echo ""
echo "Para ver logs: journalctl -u litellm -f"
echo "Para probar:   curl http://localhost:4000/health"
echo "════════════════════════════════════════"
