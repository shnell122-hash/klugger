#!/bin/bash
# verify-agents.sh — Verifica modelos activos en PM2 logs
# Uso: bash verify-agents.sh [--lines N]

LINES=${2:-800}
if [[ "$1" == "--lines" ]]; then LINES="$2"; fi

G='\033[0;32m' R='\033[0;31m' Y='\033[1;33m' B='\033[0;34m' C='\033[0;36m' W='\033[1;37m' NC='\033[0m'

section() { echo -e "\n${B}══════════════════════════════════════${NC}"; echo -e "${W} $1${NC}"; echo -e "${B}══════════════════════════════════════${NC}"; }
ok()   { printf "  ${G}✅ %-42s${NC} ×%s hits\n" "$1" "$2"; }
fail() { printf "  ${R}❌ %-42s${NC} ×%s hits\n" "$1" "$2"; }
warn() { printf "  ${Y}🚨 %-42s${NC} ×%s hits — INESPERADO\n" "$1" "$2"; }
info() { printf "  ${C}ℹ  %-42s${NC} %s\n" "$1" "$2"; }

chk_present() {
  local label="$1" pat="$2" log="$3"
  local n; n=$(echo "$log" | grep -ciE "$pat" 2>/dev/null); n=${n:-0}
  [ "$n" -gt 0 ] && ok "$label" "$n" || fail "$label" "$n"
}
chk_absent() {
  local label="$1" pat="$2" log="$3"
  local n; n=$(echo "$log" | grep -ciE "$pat" 2>/dev/null); n=${n:-0}
  [ "$n" -eq 0 ] && ok "SIN $label" "0" || warn "DETECTADO $label" "$n"
}

echo -e "\n${W}▶ Cargando últimas $LINES líneas de logs...${NC}"
FB=$(pm2 logs financial-bot        --lines "$LINES" --nostream 2>/dev/null)
RM=$(pm2 logs relay-master         --lines "$LINES" --nostream 2>/dev/null)
CE=$(pm2 logs conversation-engine  --lines "$LINES" --nostream 2>/dev/null || \
     pm2 logs conversation-engi    --lines "$LINES" --nostream 2>/dev/null)

# ─────────────────────────────────────────────────────────────
section "1 · ÁRBOL DE AGENTES — FinBot (financial-bot)"
# ─────────────────────────────────────────────────────────────
echo -e "\n  ${C}TransactionOrchestrator${NC}"
chk_present "DeepSeek V4-Pro (accion=)" \
  "TransactionOrchestrator/deepseek-pro|deepseek-pro\] accion=" "$FB"
chk_absent  "claude-sonnet en Orchestrator" \
  "TransactionOrchestrator.*sonnet|sonnet.*accion=" "$FB"

echo -e "\n  ${C}DocumentIntelligenceAgent / VisionAgent${NC}"
chk_present "Gemini Flash (procesando imagen)" \
  "gemini-1\.5|generativelanguage\.googleapis|gemini.*flash|docAgent" "$FB"
chk_absent  "Claude Vision (VisionAgent)" \
  "visionAgent.*anthropic|haiku.*vision" "$FB"

echo -e "\n  ${C}ContextReader / ResponseGen / InvoiceAgent${NC}"
chk_present "DeepSeek Flash (context/response/invoice)" \
  "deepseek-chat|deepseek.*flash|DEEPSEEK_CHAT" "$FB"

echo -e "\n  ${C}Guardia global — zero Anthropic en financial-bot${NC}"
chk_absent  "claude-sonnet en financial-bot" \
  "claude-sonnet-4" "$FB"
chk_absent  "api\.anthropic\.com en financial-bot" \
  "api\.anthropic\.com" "$FB"

# ─────────────────────────────────────────────────────────────
section "2 · ÁRBOL DE AGENTES — Fix Loop iterativo (relay-master)"
# ─────────────────────────────────────────────────────────────
echo -e "\n  ${C}Buzón bidireccional → DeepSeek Flash${NC}"
chk_present "callAnthropicDirect→DeepSeek Flash" \
  "deepseek-flash|deepseek-chat|cache_hit=|deepseek.*tok" "$RM"

echo -e "\n  ${C}Pre-diagnóstico → DeepSeek V4-Pro${NC}"
chk_present "Pre-diagnóstico V4-Pro generado" \
  "v4-pro.*pre-diagnóstico|pre-diagnóstico.*generado|v4-pro.*chars" "$RM"

echo -e "\n  ${C}claude-code-suborq → runDeepSeekCodeFix (V4-Pro)${NC}"
chk_present "runDeepSeekCodeFix: generando fix" \
  "deepseek-pro\] generando fix" "$RM"
chk_present "runDeepSeekCodeFix: patch aplicado" \
  "deepseek-pro\] ✓ patched|deepseek-pro.*Fix aplicado" "$RM"
chk_absent  "Claude CLI para claude-code-suborq" \
  "RELAY_DIAG.*claude-code-suborq|suborq.*stream-json|claude.*suborq.*dangerously" "$RM"

echo -e "\n  ${C}Guardia global — zero Sonnet en relay-master${NC}"
chk_absent  "claude-sonnet en relay" \
  "claude-sonnet-4" "$RM"
chk_absent  "api\.anthropic\.com en relay" \
  "api\.anthropic\.com" "$RM"

# ─────────────────────────────────────────────────────────────
section "3 · MOTOR DE PRUEBAS — conversation-engine"
# ─────────────────────────────────────────────────────────────
echo -e "\n  ${C}Rondas activas${NC}"
chk_present "Score ronda completada" \
  "Score ronda #|Ronda #[0-9].*Tier" "$CE"
chk_present "Episodios registrados" \
  "start_episode|episode_id|Episodio #" "$CE"
chk_present "dispatch_fix disparado" \
  "dispatch_fix|fix.*inbox|claude-code-inbox" "$CE"

echo -e "\n  ${C}Auto-exclusión de cuentas rotas${NC}"
chk_present "Auto-exclusión activada (si GV bloqueado)" \
  "Auto-excluyendo|send_failures.*threshold" "$CE"

# ─────────────────────────────────────────────────────────────
section "4 · ÚLTIMAS ACTIVIDADES detectadas"
# ─────────────────────────────────────────────────────────────
echo -e "\n  ${C}Último fix de claude-code-suborq:${NC}"
echo "$RM" | grep -iE "deepseek-pro|suborq" | tail -5 | sed 's/^/    /'

echo -e "\n  ${C}Último score de conversation-engine:${NC}"
echo "$CE" | grep -iE "Score ronda|Score global" | tail -3 | sed 's/^/    /'

echo -e "\n  ${C}Último uso de TransactionOrchestrator:${NC}"
echo "$FB" | grep -iE "TransactionOrchestrator|deepseek-pro.*accion" | tail -3 | sed 's/^/    /'

echo -e "\n${W}▶ Verificación completa.${NC}\n"
