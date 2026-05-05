#!/bin/bash
# Fase 0 — Diagnóstico previo para exponer llm.vilarkptl.com
# Solo lectura. No modifica nada.

echo "=== DIAGNÓSTICO: llm.vilarkptl.com Apache + TLS ==="
echo ""

echo "─── [1] Virtual hosts habilitados ───────────────────────────────────────"
ls -la /etc/apache2/sites-enabled/ 2>/dev/null || echo "  ⚠️  No se encontró directorio sites-enabled"
echo ""

echo "─── [2] Virtual hosts disponibles ───────────────────────────────────────"
ls -la /etc/apache2/sites-available/ 2>/dev/null
echo ""

echo "─── [3] ¿Existe ya un vhost para llm.vilarkptl.com? ─────────────────────"
grep -rl "llm.vilarkptl.com" /etc/apache2/ 2>/dev/null || echo "  No existe aún — correcto"
echo ""

echo "─── [4] certbot instalado? ───────────────────────────────────────────────"
which certbot 2>/dev/null && certbot --version 2>/dev/null || echo "  certbot NO instalado"
echo ""

echo "─── [5] Certificados existentes ─────────────────────────────────────────"
certbot certificates 2>/dev/null || echo "  Sin certificados o certbot no disponible"
echo ""

echo "─── [6] DNS — NS records de vilarkptl.com ────────────────────────────────"
dig NS vilarkptl.com +short 2>/dev/null || echo "  dig no disponible"
echo ""

echo "─── [7] DNS — IP de vilarkptl.com ───────────────────────────────────────"
dig A vilarkptl.com +short 2>/dev/null || echo "  dig no disponible"
echo ""

echo "─── [8] DNS — ¿llm.vilarkptl.com ya existe? ────────────────────────────"
RESULT=$(dig A llm.vilarkptl.com +short 2>/dev/null)
if [ -n "$RESULT" ]; then
  echo "  ✅ Resuelve a: $RESULT"
else
  echo "  Aún no existe — hay que crear registro A en DNS"
fi
echo ""

echo "─── [9] Módulos Apache relevantes ───────────────────────────────────────"
apache2ctl -M 2>/dev/null | grep -E "proxy|ssl|rewrite|headers" || echo "  apache2ctl no disponible"
echo ""

echo "─── [10] Referencia: virtual hosts existentes (primeros 80 líneas) ──────"
for f in /etc/apache2/sites-enabled/*.conf; do
  echo "  === $f ==="
  head -40 "$f" 2>/dev/null
  echo ""
done
echo ""

echo "─── [11] IP del servidor ────────────────────────────────────────────────"
curl -s ifconfig.me 2>/dev/null || hostname -I
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "DIAGNÓSTICO COMPLETADO — pegar resultado completo en el chat"
echo "═══════════════════════════════════════════════════════════"
