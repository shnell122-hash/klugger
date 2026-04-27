#!/bin/bash
# Fase 3 — Verificación completa de https://llm.vilarkptl.com
MASTER_KEY="sk-litellm-11b2ccee224b47d82ba9b8e3677aa915"
BASE="https://llm.vilarkptl.com"

echo "=== FASE 3: Verificación de ${BASE} ==="
echo ""

PASS=0
FAIL=0

check() {
  local label="$1" result="$2" expected="$3"
  if echo "$result" | grep -q "$expected"; then
    echo "  ✅ $label"
    PASS=$((PASS+1))
  else
    echo "  ❌ $label"
    echo "     Esperado: $expected"
    echo "     Recibido: $result"
    FAIL=$((FAIL+1))
  fi
}

# ─── 1. Health ────────────────────────────────────────────────────────────
echo "[1] Health endpoint..."
HEALTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/health" \
  -H "Authorization: Bearer ${MASTER_KEY}" 2>/dev/null)
check "/health HTTP status" "$HEALTH_CODE" "200"
echo ""

# ─── 2. Models list ───────────────────────────────────────────────────────
echo "[2] Lista de modelos..."
MODELS=$(curl -s "${BASE}/v1/models" \
  -H "Authorization: Bearer ${MASTER_KEY}" 2>/dev/null)
check "kptl-chat en /v1/models"      "$MODELS" "kptl-chat"
check "kptl-chat-fast en /v1/models" "$MODELS" "kptl-chat-fast"
check "kptl-reasoning en /v1/models" "$MODELS" "kptl-reasoning"
echo ""

# ─── 3. Chat completion real ──────────────────────────────────────────────
echo "[3] Test de chat (kptl-chat)..."
CHAT=$(curl -s "${BASE}/v1/chat/completions" \
  -H "Authorization: Bearer ${MASTER_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"model":"kptl-chat","messages":[{"role":"user","content":"Responde exactamente con estas dos palabras sin nada más: LLM OK"}],"max_tokens":20}' \
  2>/dev/null)
check "Respuesta contiene 'LLM'" "$CHAT" "LLM"
echo "     Respuesta completa: $(echo "$CHAT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['choices'][0]['message']['content'])" 2>/dev/null || echo "$CHAT" | head -c 200)"
echo ""

# ─── 4. Certificado TLS ───────────────────────────────────────────────────
echo "[4] Certificado TLS..."
CERT_INFO=$(echo | openssl s_client -connect llm.vilarkptl.com:443 -servername llm.vilarkptl.com 2>/dev/null | openssl x509 -noout -subject -dates 2>/dev/null)
if [ -n "$CERT_INFO" ]; then
  echo "  ✅ Certificado válido"
  echo "     $CERT_INFO"
  PASS=$((PASS+1))
else
  echo "  ❌ No se pudo obtener info del certificado"
  FAIL=$((FAIL+1))
fi
echo ""

# ─── 5. HTTPS redirect ────────────────────────────────────────────────────
echo "[5] Redirect HTTP → HTTPS..."
REDIRECT=$(curl -s -o /dev/null -w "%{http_code}" "http://llm.vilarkptl.com/health" \
  --max-redirs 0 2>/dev/null)
check "HTTP redirige (301/302)" "$REDIRECT" "30"
echo ""

# ─── Resumen ──────────────────────────────────────────────────────────────
echo "════════════════════════════════════════"
echo "RESULTADO: ${PASS} passed, ${FAIL} failed"
if [ "$FAIL" -eq 0 ]; then
  echo "✅ TODO OK — llm.vilarkptl.com operativo"
else
  echo "⚠️  Hay ${FAIL} verificación(es) fallida(s) — revisar arriba"
fi
echo "════════════════════════════════════════"
