#!/bin/bash
# =============================================================================
# SETUP — Sistema Financiero Multiagente en ia.vilarkptl.com
# URL destino: flujos.fiscalai.mx → localhost:3020 (Next.js)
# Ejecutar como root en: /var/www/html/vilarkptl.com/ai-monitor
#
# ANTES de correr este script:
#   1. Agregar DNS: flujos.fiscalai.mx A <IP de ia.vilarkptl.com>
#      Verificar: dig +short flujos.fiscalai.mx
# =============================================================================
set -euo pipefail

REPO_DIR="/var/www/html/vilarkptl.com/ai-monitor"
DB_NAME="ai_monitoring"
DASHBOARD_DIR="$REPO_DIR/dashboard-financial"
BOT_DIR="$REPO_DIR/financial/bot"
APACHE_CONF_SRC="$REPO_DIR/deploy/apache/flujos.fiscalai.mx.conf"
APACHE_CONF_DST="/etc/apache2/sites-available/flujos.fiscalai.mx.conf"
DOMAIN="flujos.fiscalai.mx"

echo "==================================================="
echo "  Setup Sistema Financiero — $DOMAIN"
echo "==================================================="
echo ""

cd "$REPO_DIR"

# ── Extraer DB_PASS desde backend/.env ───────────────────────────────────────
DB_PASS=$(grep "^DB_PASS=" "$REPO_DIR/backend/.env" 2>/dev/null | cut -d= -f2-)
DB_USER=$(grep "^DB_USER=" "$REPO_DIR/backend/.env" 2>/dev/null | cut -d= -f2- || echo "root")
if [ -z "$DB_PASS" ]; then
  echo "ERROR: No se encontró DB_PASS en backend/.env"
  exit 1
fi
MYSQL="mysql -u $DB_USER -p$DB_PASS"
echo "  DB user: $DB_USER | pass: ${DB_PASS:0:4}****"

# ── 1. Git pull del branch ────────────────────────────────────────────────────
echo "[1/7] Git pull..."
git fetch origin claude/financial-multiagent-system-YwtYQ
git checkout claude/financial-multiagent-system-YwtYQ
git reset --hard origin/claude/financial-multiagent-system-YwtYQ
echo "  ✓ Código actualizado"

# ── 2. Migración de base de datos ─────────────────────────────────────────────
echo "[2/7] Migrando base de datos ($DB_NAME)..."
if $MYSQL "$DB_NAME" -e "SHOW TABLES LIKE 'fin_clients';" 2>/dev/null | grep -q fin_clients; then
  echo "  Tablas financieras ya existen, omitiendo."
else
  $MYSQL "$DB_NAME" < "$REPO_DIR/financial/db/migrate-financial-v1.sql"
  echo "  ✓ Tablas fin_* creadas en $DB_NAME"
fi

# ── 3. .env del bot ───────────────────────────────────────────────────────────
echo "[3/7] Verificando financial/.env..."
FIN_ENV="$REPO_DIR/financial/.env"

if [ ! -f "$FIN_ENV" ]; then
  cp "$REPO_DIR/financial/.env.example" "$FIN_ENV"
  # Copiar DB_PASS desde backend/.env si existe
  BACKEND_PASS=$(grep "^DB_PASS=" "$REPO_DIR/backend/.env" 2>/dev/null | cut -d= -f2- || echo "")
  if [ -n "$BACKEND_PASS" ]; then
    sed -i "s/^DB_PASS=.*/DB_PASS=$BACKEND_PASS/" "$FIN_ENV"
    echo "  ✓ DB_PASS copiado desde backend/.env"
  fi
  echo ""
  echo "  ⚠️  Edita $FIN_ENV con los siguientes valores:"
  echo ""
  echo "       FIN_TELEGRAM_BOT_TOKEN=   ← token del bot (@BotFather)"
  echo "       FIN_ADMIN_USER_IDS=       ← tu Telegram user ID numérico"
  echo "       FIN_ALLOWED_CHAT_IDS=     ← ID del grupo de operaciones"
  echo "       FIN_DATOS_BANCARIOS=      ← CLABE/banco para pagos"
  echo "       DEEPSEEK_API_KEY=         ← ya está en relay/.env"
  echo ""
  echo "  Tip: DEEPSEEK_API_KEY está en relay/.env"
  echo "       DEEPSEEK_KEY=\$(grep DEEPSEEK_API_KEY relay/.env | cut -d= -f2-)"
  echo ""
  read -rp "  Presiona ENTER cuando hayas editado el archivo: " _
else
  echo "  .env ya existe"
fi

# ── 4. npm install — bot ──────────────────────────────────────────────────────
echo "[4/7] npm install del bot..."
cd "$BOT_DIR" && npm install --production --silent
echo "  ✓ Dependencias del bot instaladas"

# ── 5. Build del dashboard Next.js ────────────────────────────────────────────
echo "[5/7] Build del dashboard Next.js (2-3 min)..."
cd "$DASHBOARD_DIR"

# .env.local
if [ ! -f ".env.local" ]; then
  echo "BACKEND_INTERNAL_URL=http://localhost:3010" > .env.local
  echo "  ✓ .env.local creado"
fi

npm install --silent
npm run build
echo "  ✓ Build completado (.next/)"

# ── 6. Apache vhost + certbot ─────────────────────────────────────────────────
echo "[6/7] Configurando Apache para $DOMAIN..."
cd "$REPO_DIR"

# Módulos
a2enmod proxy proxy_http 2>/dev/null || true

# Copiar vhost
cp "$APACHE_CONF_SRC" "$APACHE_CONF_DST"
a2ensite flujos.fiscalai.mx 2>/dev/null || true

# Verificar y recargar
apache2ctl configtest
systemctl reload apache2
echo "  ✓ VirtualHost HTTP activado (puerto 80 → 3020)"

# SSL
if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "  Certificado SSL ya existe, omitiendo certbot."
else
  echo "  Generando SSL con certbot --apache..."
  certbot --apache -d "$DOMAIN" --non-interactive --agree-tos \
    -m admin@fiscalai.mx --redirect
  echo "  ✓ SSL configurado (certbot reescribió el vhost con HTTPS)"
fi

systemctl reload apache2

# ── 7. PM2 ───────────────────────────────────────────────────────────────────
echo "[7/7] Actualizando procesos PM2..."
cd "$REPO_DIR"

# financial-bot: ya existe en PM2, solo actualizar/restartar
if pm2 describe financial-bot &>/dev/null; then
  pm2 restart financial-bot
  echo "  ✓ financial-bot reiniciado"
else
  pm2 start deploy/ecosystem.config.js --only financial-bot
  echo "  ✓ financial-bot iniciado"
fi

# financial-dashboard: nuevo proceso
if pm2 describe financial-dashboard &>/dev/null; then
  pm2 restart financial-dashboard
  echo "  ✓ financial-dashboard reiniciado"
else
  pm2 start deploy/ecosystem.config.js --only financial-dashboard
  echo "  ✓ financial-dashboard iniciado"
fi

pm2 save

echo ""
echo "==================================================="
echo "  ✅ Setup completado"
echo ""
echo "  URLs:"
echo "    https://$DOMAIN            ← Dashboard Next.js"
echo "    http://localhost:3020      ← Next.js interno"
echo "    http://localhost:3010/api  ← Backend Express (ai-monitor)"
echo ""
echo "  Verificación:"
echo "    pm2 status"
echo "    pm2 logs financial-bot --lines 30"
echo "    pm2 logs financial-dashboard --lines 30"
echo "    curl -s http://127.0.0.1:3020"
echo "    curl -Is https://$DOMAIN | head -5"
echo ""
echo "  DNS (si no lo has hecho):"
echo "    $DOMAIN  A  \$(curl -s ifconfig.me)  TTL 300"
echo "==================================================="
