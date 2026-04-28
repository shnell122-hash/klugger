#!/bin/bash
# Fix: ia.vilarkptl.com mostraba dashboard sin login porque Apache servía
# el frontend directamente con DocumentRoot, bypasseando el auth de Node.js.
# Solución: quitar DocumentRoot y proxear TODO el tráfico a Node.js:3010.
set -e

HTTP_CONF="/etc/apache2/sites-available/ia.vilarkptl.com.conf"
SSL_CONF="/etc/apache2/sites-available/ia.vilarkptl.com-le-ssl.conf"

echo "=== FIX: Auth dashboard ia.vilarkptl.com ==="
echo ""

echo "[1] Actualizando vhost HTTP..."
cat > "$HTTP_CONF" << 'APACHEEOF'
<VirtualHost *:80>
    ServerName ia.vilarkptl.com

    ProxyPreserveHost On
    ProxyPass        /socket.io/ http://127.0.0.1:3010/socket.io/
    ProxyPassReverse /socket.io/ http://127.0.0.1:3010/socket.io/
    ProxyPass        / http://127.0.0.1:3010/
    ProxyPassReverse / http://127.0.0.1:3010/

    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule ^/socket\.io/(.*)$ ws://127.0.0.1:3010/socket.io/$1 [P,L]

    ErrorLog  /var/log/apache2/ai-monitor-error.log
    CustomLog /var/log/apache2/ai-monitor-access.log combined
</VirtualHost>
APACHEEOF
echo "  ✅ vhost HTTP actualizado"

echo "[2] Actualizando vhost HTTPS (SSL)..."
if [ -f "$SSL_CONF" ]; then
  # Preservar las líneas de certificado SSL que certbot generó
  SSL_CERT=$(grep "SSLCertificateFile"    "$SSL_CONF" | head -1 | xargs)
  SSL_KEY=$(grep  "SSLCertificateKeyFile" "$SSL_CONF" | head -1 | xargs)
  SSL_INC=$(grep  "Include.*options-ssl"  "$SSL_CONF" | head -1 | xargs)

  cat > "$SSL_CONF" << SSLEOF
<IfModule mod_ssl.c>
<VirtualHost *:443>
    ServerName ia.vilarkptl.com

    ProxyPreserveHost On
    ProxyPass        /socket.io/ http://127.0.0.1:3010/socket.io/
    ProxyPassReverse /socket.io/ http://127.0.0.1:3010/socket.io/
    ProxyPass        / http://127.0.0.1:3010/
    ProxyPassReverse / http://127.0.0.1:3010/

    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule ^/socket\\.io/(.*)$ ws://127.0.0.1:3010/socket.io/\$1 [P,L]

    ErrorLog  /var/log/apache2/ai-monitor-error.log
    CustomLog /var/log/apache2/ai-monitor-access.log combined

${SSL_CERT}
${SSL_KEY}
${SSL_INC}
</VirtualHost>
</IfModule>
SSLEOF
  echo "  ✅ vhost HTTPS actualizado (certificados preservados)"
else
  echo "  ℹ️  $SSL_CONF no existe — solo HTTP actualizado"
fi

echo "[3] Verificando configuración Apache..."
if apache2ctl configtest 2>&1 | grep -q "Syntax OK"; then
  echo "  ✅ Syntax OK"
  systemctl reload apache2
  echo "  ✅ Apache recargado"
else
  echo "  ❌ Error de configuración:"
  apache2ctl configtest 2>&1
  exit 1
fi
echo ""

echo "[4] Verificando que / redirige a /login (sin cookies)..."
sleep 1
LOCATION=$(curl -s -o /dev/null -w "%{redirect_url}" \
  -H "Host: ia.vilarkptl.com" \
  "http://127.0.0.1:3010/" 2>/dev/null)
if echo "$LOCATION" | grep -q "login"; then
  echo "  ✅ Node.js redirige / → $LOCATION"
else
  echo "  ⚠️  Respuesta de Node.js: '$LOCATION'"
  echo "  Verificar manualmente en ia.vilarkptl.com en ventana incógnito"
fi
echo ""

echo "════════════════════════════════════════"
echo "✅ FIX APLICADO"
echo ""
echo "Abrir https://ia.vilarkptl.com en ventana incógnito"
echo "Debe aparecer pantalla de login."
echo "════════════════════════════════════════"
