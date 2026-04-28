#!/bin/bash
# Fase 2 — Obtener certificado TLS con certbot para llm.vilarkptl.com
set -e

DOMAIN="llm.vilarkptl.com"
EMAIL="admin@vilarkptl.com"

echo "=== FASE 2: Certificado TLS para ${DOMAIN} ==="
echo ""

# ─── Instalar certbot si no está ──────────────────────────────────────────
echo "[1] Verificando certbot..."
if ! which certbot &>/dev/null; then
  echo "  certbot no encontrado — instalando..."
  apt-get install -y certbot python3-certbot-apache
  echo "  ✅ certbot instalado"
else
  echo "  ✅ certbot disponible: $(certbot --version 2>/dev/null)"
fi
echo ""

# ─── Verificar que el DNS sigue resolviendo ───────────────────────────────
echo "[2] Verificando DNS..."
RESOLVED=$(dig A "$DOMAIN" +short 2>/dev/null | head -1)
if [ "$RESOLVED" != "143.198.228.78" ]; then
  echo "  ❌ $DOMAIN resuelve a '${RESOLVED:-vacío}' — esperado 143.198.228.78"
  echo "  Certbot fallará si el DNS no apunta a este servidor. Abortar."
  exit 1
fi
echo "  ✅ DNS OK — $DOMAIN → $RESOLVED"
echo ""

# ─── Obtener certificado ──────────────────────────────────────────────────
echo "[3] Obteniendo certificado Let's Encrypt..."
certbot --apache \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  --redirect

echo ""
echo "[4] Verificando certificado instalado..."
certbot certificates 2>/dev/null | grep -A5 "$DOMAIN" || echo "  (usar 'certbot certificates' para ver detalle)"
echo ""

echo "════════════════════════════════════════"
echo "✅ FASE 2 COMPLETADA"
echo ""
echo "Siguiente paso: bash deploy/scripts/llm-3-verificacion.sh"
echo "════════════════════════════════════════"
