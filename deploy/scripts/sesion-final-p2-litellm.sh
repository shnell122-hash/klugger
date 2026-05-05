#!/bin/bash
# SESIÓN FINAL — Prioridad 2: Feature flags LiteLLM en apps
# Lee el código actual, aplica el patch si el patrón es reconocible.
# Si no puede aplicar automáticamente, reporta qué hay y pide intervención manual.

LITELLM_URL="https://llm.vilarkptl.com"
LITELLM_KEY="sk-litellm-11b2ccee224b47d82ba9b8e3677aa915"

echo "=== PRIORIDAD 2: Feature flags LiteLLM ==="
echo ""

# ─── Helper: verificar que app sigue online tras restart ──────────────────
check_pm2_status() {
  local name="$1"
  sleep 4
  local status
  status=$(pm2 show "$name" 2>/dev/null | grep "│ status" | awk '{print $4}')
  if [ "$status" = "online" ]; then
    echo "  ✅ $name online"
  else
    echo "  ❌ $name status: ${status:-desconocido} — revisar logs:"
    pm2 logs "$name" --lines 20 --nostream 2>/dev/null | tail -15
    return 1
  fi
}

# ─── 2.1 financial-bot.js ─────────────────────────────────────────────────
echo "═══ 2.1: financial-bot ═══"
SCRIPT=$(pm2 describe financial-bot 2>/dev/null | grep "script path" | awk -F'│' '{gsub(/ /,"",$3); print $3}' | head -1)
[ -z "$SCRIPT" ] && SCRIPT=$(pm2 describe financial-bot 2>/dev/null | grep "script path" | grep -oP '(/\S+\.js)')

if [ -z "$SCRIPT" ] || [ ! -f "$SCRIPT" ]; then
  echo "  ⚠️  No se encontró financial-bot.js — saltando"
  echo "  pm2 describe output:"
  pm2 describe financial-bot 2>/dev/null | grep "script\|path" | head -5
else
  echo "  Script: $SCRIPT"
  DIR=$(dirname "$SCRIPT")

  # Mostrar líneas de cliente LLM actuales
  echo "  Líneas LLM actuales:"
  grep -n "new OpenAI\|new Anthropic\|baseURL\|apiKey\|DEEPSEEK\|OPENAI\|model\s*=" "$SCRIPT" 2>/dev/null | head -15
  echo ""

  if grep -q "LITELLM_BASE_URL" "$SCRIPT"; then
    echo "  ✅ Ya tiene feature flag LITELLM_BASE_URL — no se modifica"
  else
    # Detectar patrón: new OpenAI({ apiKey: X, baseURL: Y })
    if grep -qE "new OpenAI\s*\(" "$SCRIPT"; then
      # Backup
      cp "$SCRIPT" "${SCRIPT}.bak.$(date +%Y%m%d-%H%M%S)"

      # Insertar vars LITELLM después del último require/const de configuración LLM
      # y antes del new OpenAI
      LINENO=$(grep -n "new OpenAI\s*(" "$SCRIPT" | head -1 | cut -d: -f1)
      if [ -n "$LINENO" ]; then
        # Insertar las líneas de feature flag antes de la línea del new OpenAI
        sed -i "${LINENO}i \\
const LITELLM_BASE_URL = process.env.LITELLM_BASE_URL || '';\\
const LITELLM_KEY      = process.env.LITELLM_MASTER_KEY || '';" "$SCRIPT"

        # Reemplazar la instanciación del cliente
        # Busca el patrón exacto para envolverlo en condicional
        python3 - "$SCRIPT" "$LINENO" <<'PYEOF'
import sys, re

filepath = sys.argv[1]
with open(filepath) as f:
    content = f.read()

# Replace: const llm = new OpenAI({...}) with feature-flag version
# Pattern: const <varname> = new OpenAI({ ... });
pattern = r'(const\s+(\w+)\s*=\s*)new OpenAI\(\{([^}]+)\}\);'

def replacer(m):
    prefix = m.group(1)
    varname = m.group(2)
    body = m.group(3)
    # Extract model if present
    model_match = re.search(r'model\s*:\s*(\S+)', body)
    orig_model = model_match.group(1).rstrip(',') if model_match else 'undefined'
    result = (
        f"{prefix}LITELLM_BASE_URL\n"
        f"  ? new OpenAI({{ apiKey: LITELLM_KEY, baseURL: LITELLM_BASE_URL + '/v1' }})\n"
        f"  : new OpenAI({{{body}}});\n"
        f"const MODEL = LITELLM_BASE_URL ? 'kptl-chat' : {orig_model};"
    )
    return result

new_content, n = re.subn(pattern, replacer, content, count=1, flags=re.DOTALL)
if n > 0:
    with open(filepath, 'w') as f:
        f.write(new_content)
    print(f"  ✅ Patch aplicado: {n} sustitución")
else:
    print("  ⚠️  Patrón no reconocido — patch no aplicado automáticamente")
    print("  Aplicar manualmente según Tarea 2.1 del prompt")
PYEOF
      fi
    else
      echo "  ⚠️  No se detectó 'new OpenAI(' — ver archivo manualmente:"
      head -80 "$SCRIPT"
    fi
  fi

  echo ""
  echo "  Reiniciando financial-bot..."
  pm2 restart financial-bot 2>/dev/null || true
  check_pm2_status "financial-bot"
fi
echo ""

# ─── 2.2 vilar-api-v2 ─────────────────────────────────────────────────────
echo "═══ 2.2: vilar-api-v2 ═══"
API_SCRIPT=$(pm2 describe vilar-api-v2 2>/dev/null | grep "script path" | grep -oP '(/\S+\.(js|py|ts))' | head -1)

if [ -z "$API_SCRIPT" ] || [ ! -f "$API_SCRIPT" ]; then
  echo "  ⚠️  Script no encontrado. pm2 describe:"
  pm2 describe vilar-api-v2 2>/dev/null | grep -E "script|path|cwd" | head -5
else
  echo "  Script: $API_SCRIPT"
  echo "  Líneas LLM actuales:"
  grep -n "new OpenAI\|new Anthropic\|baseURL\|apiKey\|model\s*=\|DEEPSEEK\|OPENAI" "$API_SCRIPT" 2>/dev/null | head -15

  if grep -q "LITELLM_BASE_URL" "$API_SCRIPT"; then
    echo "  ✅ Ya tiene feature flag — no se modifica"
  else
    echo ""
    echo "  ⚠️  Requiere revisión manual del patrón LLM para aplicar feature flag"
    echo "  Pegar el contenido relevante en el chat para que Claude Code lo patche"
  fi

  pm2 restart vilar-api-v2 2>/dev/null || true
  check_pm2_status "vilar-api-v2"
fi
echo ""

# ─── 2.3 kptl-credito (Python) ────────────────────────────────────────────
echo "═══ 2.3: kptl-credito (Python) ═══"
APP_PY="/var/www/html/credit-agents/api/app.py"

if [ ! -f "$APP_PY" ]; then
  echo "  ⚠️  $APP_PY no encontrado — saltando"
else
  echo "  Líneas LLM actuales:"
  grep -n "openai\|anthropic\|deepseek\|base_url\|model\|client\s*=" "$APP_PY" 2>/dev/null | head -20
  echo ""

  if grep -q "LITELLM_BASE_URL" "$APP_PY"; then
    echo "  ✅ Ya tiene feature flag — no se modifica"
  else
    # Backup
    cp "$APP_PY" "${APP_PY}.bak.$(date +%Y%m%d-%H%M%S)"

    # Detectar si usa openai Python SDK con base_url
    if grep -qE "OpenAI\s*\(|AsyncOpenAI\s*\(" "$APP_PY"; then
      python3 - "$APP_PY" <<'PYEOF'
import sys, re

filepath = sys.argv[1]
with open(filepath) as f:
    lines = f.readlines()

# Find the first import or config section to insert LITELLM vars
insert_after = 0
for i, line in enumerate(lines):
    if line.strip().startswith('import ') or line.strip().startswith('from '):
        insert_after = i

litellm_vars = (
    "\n# LiteLLM feature flag — set LITELLM_BASE_URL to route through proxy\n"
    "LITELLM_BASE_URL = os.getenv('LITELLM_BASE_URL', '')\n"
    "LITELLM_KEY      = os.getenv('LITELLM_MASTER_KEY', '')\n"
    "_litellm_kwargs  = ({'base_url': LITELLM_BASE_URL + '/v1', 'api_key': LITELLM_KEY}\n"
    "                    if LITELLM_BASE_URL else {})\n"
    "ROUTER_MODEL      = 'kptl-chat-fast' if LITELLM_BASE_URL else os.getenv('ROUTER_MODEL',   'gpt-4o-mini')\n"
    "ANALYSIS_MODEL    = 'kptl-reasoning' if LITELLM_BASE_URL else os.getenv('ANALYSIS_MODEL', 'deepseek-reasoner')\n"
    "CHAT_MODEL        = 'kptl-chat'      if LITELLM_BASE_URL else os.getenv('CHAT_MODEL',     'deepseek-chat')\n"
)

lines.insert(insert_after + 1, litellm_vars)

with open(filepath, 'w') as f:
    f.writelines(lines)

print("  ✅ Feature flag vars agregadas a app.py")
print("  ⚠️  Revisar manualmente que los clientes OpenAI/AsyncOpenAI usen **_litellm_kwargs")
print("      y que los modelos estén usando ROUTER_MODEL / ANALYSIS_MODEL / CHAT_MODEL")
PYEOF
    else
      echo "  ⚠️  No se detectó OpenAI/AsyncOpenAI — revisar app.py manualmente"
      head -60 "$APP_PY"
    fi
  fi

  pm2 restart kptl-credito 2>/dev/null || true
  pm2 restart kptl-credito-worker 2>/dev/null || true
  check_pm2_status "kptl-credito"
fi
echo ""

echo "════════════════════════════════════════"
echo "✅ PRIORIDAD 2 COMPLETADA"
echo "Ver ⚠️ arriba para cualquier patch manual pendiente"
echo "════════════════════════════════════════"
