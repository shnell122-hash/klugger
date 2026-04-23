#!/bin/bash
# FASE C — Instalación de LiteLLM en producción (localhost:4000, Phase 1a)
# Ejecutar SOLO después de:
#   1. relay-master estable (sin restarts en 5+ minutos)
#   2. free -h muestra >= 300MB libres
#   3. Confirmar con Vilar qué API keys agregar
# Uso: bash fase-c-instalar-litellm.sh

set -euo pipefail
echo "====== INSTALACIÓN LiteLLM Phase 1a $(date) ======"

# ── Verificar memoria antes de continuar ──
FREE_MB=$(free -m | awk '/^Mem:/ {print $7}')
echo "Memoria disponible: ${FREE_MB}MB"
if [ "$FREE_MB" -lt 300 ]; then
  echo "ERROR: Memoria insuficiente (${FREE_MB}MB < 300MB mínimo)."
  echo "Resolver antes de continuar: agregar swap o reducir uso de memoria existente."
  exit 1
fi
echo "✓ Memoria OK"

# ── Crear usuario y directorio ──
echo ""
echo "── Crear usuario litellm ──"
if ! id litellm &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin litellm
  echo "✓ Usuario litellm creado"
else
  echo "Usuario litellm ya existe"
fi

mkdir -p /opt/litellm
chown litellm:litellm /opt/litellm
chmod 750 /opt/litellm

# ── Virtualenv e instalación ──
echo ""
echo "── Instalar LiteLLM en virtualenv ──"
python3 -m venv /opt/litellm/venv
/opt/litellm/venv/bin/pip install --upgrade pip --quiet
/opt/litellm/venv/bin/pip install "litellm[proxy]" --quiet
echo "✓ LiteLLM instalado"
/opt/litellm/venv/bin/litellm --version

# ── Generar master key ──
echo ""
echo "── Generar LITELLM_MASTER_KEY ──"
MASTER_KEY="sk-litellm-$(openssl rand -hex 24)"
echo "LITELLM_MASTER_KEY generada: $MASTER_KEY"
echo "(guardar este valor — se usará en /opt/litellm/.env y en relay/.env)"

# ── Crear config.yaml ──
# IMPORTANTE: editar las cadenas de fallback según los proveedores disponibles
# Comentar/descomentar los modelos según las API keys que tengas
echo ""
echo "── Crear /opt/litellm/config.yaml ──"
cat > /opt/litellm/config.yaml << 'EOF'
model_list:

  # ── kptl-chat: Claude Sonnet 4.6 → DeepSeek V3 → GPT-4o → Groq Llama 3.3 ──
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

  # ── kptl-chat-fast: Claude Haiku 4.5 → GPT-4o-mini → Gemini 2.0 Flash → Groq ──
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
      model: gemini/gemini-2.0-flash
      api_key: os.environ/GEMINI_API_KEY
  - model_name: kptl-chat-fast
    litellm_params:
      model: groq/llama-3.3-70b-versatile
      api_key: os.environ/GROQ_API_KEY

  # ── kptl-vision: Claude Vision → GPT-4o Vision → Gemini Flash Vision ──
  - model_name: kptl-vision
    litellm_params:
      model: claude-sonnet-4-6
      api_key: os.environ/ANTHROPIC_API_KEY
  - model_name: kptl-vision
    litellm_params:
      model: gpt-4o
      api_key: os.environ/OPENAI_API_KEY
  - model_name: kptl-vision
    litellm_params:
      model: gemini/gemini-2.0-flash
      api_key: os.environ/GEMINI_API_KEY

  # ── kptl-reasoning: DeepSeek R1 → Claude Opus 4.7 → o1-mini ──
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
      model: o1-mini
      api_key: os.environ/OPENAI_API_KEY

  # ── kptl-tts: OpenAI TTS → ElevenLabs ──
  - model_name: kptl-tts
    litellm_params:
      model: openai/tts-1
      api_key: os.environ/OPENAI_API_KEY
  # Descomentar cuando se tenga cuenta ElevenLabs:
  # - model_name: kptl-tts
  #   litellm_params:
  #     model: elevenlabs/eleven_multilingual_v2
  #     api_key: os.environ/ELEVENLABS_API_KEY

  # ── kptl-asr: OpenAI Whisper (sin fallback) ──
  - model_name: kptl-asr
    litellm_params:
      model: whisper-1
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
EOF

chown litellm:litellm /opt/litellm/config.yaml
chmod 640 /opt/litellm/config.yaml
echo "✓ config.yaml creado"

# ── Crear .env (el usuario debe editar esto antes de arrancar) ──
echo ""
echo "── Crear /opt/litellm/.env (EDITAR antes de iniciar el servicio) ──"
cat > /opt/litellm/.env << ENVEOF
# /opt/litellm/.env — API keys para LiteLLM proxy
# Editar con las keys reales antes de iniciar el servicio
# Permisos: 600 (solo root puede leer)

ANTHROPIC_API_KEY=sk-ant-EDITAR
DEEPSEEK_API_KEY=sk-EDITAR
OPENAI_API_KEY=sk-EDITAR
GROQ_API_KEY=gsk_EDITAR
GEMINI_API_KEY=EDITAR
# ELEVENLABS_API_KEY=EDITAR

LITELLM_MASTER_KEY=${MASTER_KEY}
ENVEOF

chown litellm:litellm /opt/litellm/.env
chmod 600 /opt/litellm/.env
echo "✓ .env creado (EDITAR antes de iniciar el servicio)"

# ── Crear servicio systemd ──
echo ""
echo "── Crear /etc/systemd/system/litellm.service ──"
cat > /etc/systemd/system/litellm.service << 'SVCEOF'
[Unit]
Description=LiteLLM Proxy — KPTL AI Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=litellm
Group=litellm
WorkingDirectory=/opt/litellm
EnvironmentFile=/opt/litellm/.env
ExecStart=/opt/litellm/venv/bin/litellm \
    --config /opt/litellm/config.yaml \
    --port 4000 \
    --host 127.0.0.1 \
    --num_workers 1
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=litellm
MemoryMax=350M
MemorySwapMax=0

[Install]
WantedBy=multi-user.target
SVCEOF

systemctl daemon-reload
echo "✓ Servicio systemd creado"

echo ""
echo "====== INSTALACIÓN COMPLETADA ======"
echo ""
echo "PRÓXIMOS PASOS (NO automatizados):"
echo ""
echo "1. Editar /opt/litellm/.env con las API keys reales:"
echo "   nano /opt/litellm/.env"
echo ""
echo "2. Iniciar el servicio:"
echo "   systemctl enable litellm"
echo "   systemctl start litellm"
echo "   systemctl status litellm"
echo "   journalctl -u litellm -f"
echo ""
echo "3. Smoke test:"
echo "   curl -s http://localhost:4000/health"
echo '   curl -s http://localhost:4000/v1/chat/completions \'
echo '     -H "Authorization: Bearer '"$MASTER_KEY"'" \'
echo '     -H "Content-Type: application/json" \'
echo "     -d '{\"model\":\"kptl-chat\",\"messages\":[{\"role\":\"user\",\"content\":\"di hola\"}],\"max_tokens\":10}'"
echo ""
echo "4. Activar en chat-agent — agregar a relay/.env:"
echo "   LITELLM_BASE_URL=http://localhost:4000"
echo "   LITELLM_MASTER_KEY=$MASTER_KEY"
echo "   pm2 restart claude-chat-bot"
