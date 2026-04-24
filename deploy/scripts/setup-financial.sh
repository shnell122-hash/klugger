#!/bin/bash
# =============================================================================
# SETUP PRIMERA VEZ — Sistema Financiero Multiagente
# Servidor: 143.198.228.78 | flujos.fiscalai.mx
# Ejecutar como root desde: /var/www/html/vilarkptl.com/ai-monitor
# =============================================================================
set -euo pipefail

REPO_DIR="/var/www/html/vilarkptl.com/ai-monitor"
DB_NAME="ai_monitoring"
DASHBOARD_DIR="$REPO_DIR/dashboard-financial"
BOT_DIR="$REPO_DIR/financial/bot"
APACHE_CONF="/etc/apache2/sites-available/flujos.fiscalai.mx.conf"
DOMAIN="flujos.fiscalai.mx"

echo "=== Setup Sistema Financiero Multiagente ==="
echo "Repo: $REPO_DIR"
echo ""

cd "$REPO_DIR"

# ── 1. Pull más reciente ──────────────────────────────────────────────────────
echo "[1/8] Git pull..."
git pull origin claude/financial-multiagent-system-YwtYQ 2>/dev/null || \
git pull origin main 2>/dev/null || echo "  (ya actualizado)"

# ── 2. Migración de base de datos ─────────────────────────────────────────────
echo "[2/8] Migrando base de datos..."
if mysql "$DB_NAME" -e "SHOW TABLES LIKE 'fin_clients';" 2>/dev/null | grep -q fin_clients; then
  echo "  Tablas financieras ya existen, omitiendo migración."
else
  mysql "$DB_NAME" < "$REPO_DIR/financial/db/migrate-financial-v1.sql"
  echo "  ✓ Migración aplicada"
fi

# ── 3. .env del bot ───────────────────────────────────────────────────────────
echo "[3/8] Configurando .env del bot..."
FIN_ENV="$REPO_DIR/financial/.env"
if [ ! -f "$FIN_ENV" ]; then
  cp "$REPO_DIR/financial/.env.example" "$FIN_ENV"
  echo ""
  echo "  ⚠️  IMPORTANTE: Edita $FIN_ENV con:"
  echo "       FIN_TELEGRAM_BOT_TOKEN=<token del nuevo bot>"
  echo "       FIN_ADMIN_USER_IDS=<tu telegram user id>"
  echo "       FIN_ALLOWED_CHAT_IDS=<id del grupo de operaciones>"
  echo "       FIN_DATOS_BANCARIOS=<CLABE, banco, nombre>"
  echo "       DEEPSEEK_API_KEY=<tu key>"
  echo "       DB_PASS=<password de MySQL>"
  echo ""
  read -p "  Presiona ENTER cuando hayas editado el archivo..." _
else
  echo "  .env ya existe"
fi

# Inyectar DB_PASS desde backend/.env si no está en financial/.env
if grep -q "^DB_PASS=$" "$FIN_ENV" 2>/dev/null; then
  BACKEND_PASS=$(grep "^DB_PASS=" "$REPO_DIR/backend/.env" 2>/dev/null | cut -d= -f2-)
  if [ -n "$BACKEND_PASS" ]; then
    sed -i "s/^DB_PASS=$/DB_PASS=$BACKEND_PASS/" "$FIN_ENV"
    echo "  ✓ DB_PASS copiado desde backend/.env"
  fi
fi

# ── 4. npm install — bot ──────────────────────────────────────────────────────
echo "[4/8] npm install (bot)..."
cd "$BOT_DIR" && npm install --production --silent
echo "  ✓ Dependencias del bot instaladas"

# ── 5. .env del dashboard ─────────────────────────────────────────────────────
echo "[5/8] Configurando .env del dashboard..."
DASH_ENV="$DASHBOARD_DIR/.env.local"
if [ ! -f "$DASH_ENV" ]; then
  echo "BACKEND_INTERNAL_URL=http://localhost:3010" > "$DASH_ENV"
  echo "  ✓ .env.local creado"
else
  echo "  .env.local ya existe"
fi

# ── 6. Build del dashboard Next.js ────────────────────────────────────────────
echo "[6/8] Construyendo dashboard Next.js (puede tardar 2-3 min)..."
cd "$DASHBOARD_DIR"
npm install --silent
npm run build
echo "  ✓ Build completado"

# ── 7. Apache vhost ───────────────────────────────────────────────────────────
echo "[7/8] Configurando Apache para $DOMAIN..."

# Copiar config
cp "$REPO_DIR/deploy/apache/flujos.fiscalai.mx.conf" "$APACHE_CONF"

# Habilitar módulos necesarios
a2enmod proxy proxy_http rewrite headers ssl 2>/dev/null || true

# Certificado SSL con certbot
if ! [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo ""
  echo "  Generando certificado SSL con certbot..."
  # Primero habilitar vhost en HTTP para el challenge
  cat > "$APACHE_CONF" << TMPCONF
<VirtualHost *:80>
    ServerName $DOMAIN
    DocumentRoot /var/www/html
    Alias /.well-known /var/www/html/.well-known
</VirtualHost>
TMPCONF
  a2ensite "$(basename $APACHE_CONF .conf)" 2>/dev/null || true
  systemctl reload apache2
  certbot certonly --webroot -w /var/www/html -d "$DOMAIN" --non-interactive --agree-tos \
    -m admin@fiscalai.mx 2>/dev/null || \
  certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos \
    -m admin@fiscalai.mx
  # Restaurar config completa con SSL
  cp "$REPO_DIR/deploy/apache/flujos.fiscalai.mx.conf" "$APACHE_CONF"
fi

a2ensite "$(basename $APACHE_CONF .conf)" 2>/dev/null || true
apache2ctl configtest && systemctl reload apache2
echo "  ✓ Apache configurado y recargado"

# ── 8. PM2 — iniciar procesos ─────────────────────────────────────────────────
echo "[8/8] Iniciando procesos PM2..."
cd "$REPO_DIR"

pm2 start deploy/ecosystem.config.js --only financial-bot      2>/dev/null || \
  pm2 restart financial-bot 2>/dev/null || true

pm2 start deploy/ecosystem.config.js --only financial-dashboard 2>/dev/null || \
  pm2 restart financial-dashboard 2>/dev/null || true

pm2 save
echo "  ✓ Procesos PM2 iniciados"

echo ""
echo "========================================"
echo "  ✅ Deploy completo"
echo "  URL: https://$DOMAIN"
echo "  Bot PM2: financial-bot"
echo "  Dashboard PM2: financial-dashboard (puerto 3020)"
echo ""
echo "  Verifica:"
echo "    pm2 status"
echo "    pm2 logs financial-bot --lines 20"
echo "    pm2 logs financial-dashboard --lines 20"
echo "    curl -I https://$DOMAIN"
echo "========================================"
