#!/bin/bash
# Fase 1 — Crear virtual host Apache para llm.vilarkptl.com
# REQUISITO: DNS llm.vilarkptl.com debe resolver a 143.198.228.78 antes de correr esto.
set -e

DOMAIN="llm.vilarkptl.com"
CONF_FILE="/etc/apache2/sites-available/${DOMAIN}.conf"

echo "=== FASE 1: Virtual host Apache para ${DOMAIN} ==="
echo ""

# ─── Verificar que el DNS ya propagó ──────────────────────────────────────
echo "[0] Verificando DNS..."
RESOLVED=$(dig A "$DOMAIN" +short 2>/dev/null | head -1)
if [ "$RESOLVED" != "143.198.228.78" ]; then
  echo "  ❌ $DOMAIN resuelve a: '${RESOLVED:-vacío}'"
  echo "  ❌ Esperado: 143.198.228.78"
  echo ""
  echo "  El registro A aún no propagó. Espera unos minutos y vuelve a correr este script."
  exit 1
fi
echo "  ✅ DNS OK — $DOMAIN → $RESOLVED"
echo ""

# ─── Verificar que el vhost no exista ya ──────────────────────────────────
if [ -f "$CONF_FILE" ]; then
  echo "  ℹ️  $CONF_FILE ya existe — se sobreescribirá"
fi

# ─── Habilitar módulos necesarios ─────────────────────────────────────────
echo "[1] Habilitando módulos Apache..."
a2enmod proxy proxy_http ssl rewrite headers
echo "  ✅ Módulos habilitados"
echo ""

# ─── Crear virtual host ───────────────────────────────────────────────────
echo "[2] Creando ${CONF_FILE}..."
cat > "$CONF_FILE" << 'APACHEEOF'
<VirtualHost *:80>
    ServerName llm.vilarkptl.com

    RewriteEngine On
    RewriteRule ^(.*)$ https://llm.vilarkptl.com$1 [R=301,L]
</VirtualHost>

<VirtualHost *:443>
    ServerName llm.vilarkptl.com

    SSLEngine on

    # Proxy hacia LiteLLM local
    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:4000/
    ProxyPassReverse / http://127.0.0.1:4000/

    # Headers de seguridad
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "DENY"
    Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"

    ErrorLog  ${APACHE_LOG_DIR}/llm-vilarkptl-error.log
    CustomLog ${APACHE_LOG_DIR}/llm-vilarkptl-access.log combined
</VirtualHost>
APACHEEOF
echo "  ✅ Virtual host creado"
echo ""

# ─── Habilitar el site ────────────────────────────────────────────────────
echo "[3] Habilitando site..."
a2ensite "${DOMAIN}.conf"
echo "  ✅ Site habilitado"
echo ""

# ─── Verificar configuración ──────────────────────────────────────────────
echo "[4] Verificando configuración Apache..."
if apache2ctl configtest 2>&1 | grep -q "Syntax OK"; then
  echo "  ✅ Syntax OK"
  systemctl reload apache2
  echo "  ✅ Apache recargado"
else
  echo "  ❌ Error de configuración — Apache NO recargado:"
  apache2ctl configtest 2>&1
  echo ""
  echo "  Corregir el error antes de continuar."
  exit 1
fi
echo ""

echo "════════════════════════════════════════"
echo "✅ FASE 1 COMPLETADA"
echo ""
echo "Virtual host activo (solo HTTP por ahora — HTTPS sin cert aún)"
echo "Siguiente paso: bash deploy/scripts/llm-2-certbot.sh"
echo "════════════════════════════════════════"
