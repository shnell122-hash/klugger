#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# Setup script for ai-monitor on vilar-desarrollo
# Run as root (or with sudo) from /home/user/agentic-repo
# Usage: bash deploy/setup-server.sh
# ────────────────────────────────────────────────────────────────
set -e

REPO_DIR="/var/www/html/vilarkptl.com/ai-monitor"
DB_NAME="ai_monitoring"
DB_USER="root"
DB_PASS="${DB_PASS:-VilarRoot2026!}"  # override via env var
LOG_DIR="/var/log/ai-monitor"
NGINX_SITES="/etc/nginx/sites-available"
NGINX_ENABLED="/etc/nginx/sites-enabled"

echo "╔══════════════════════════════════════════╗"
echo "║   ai.vilarkptl.com — Monitor Setup       ║"
echo "╚══════════════════════════════════════════╝"

# 1. Create log directory
echo "→ Creating log directory..."
mkdir -p "$LOG_DIR"

# 2. MySQL: create database and tables
echo "→ Setting up MySQL database..."
mysql -u "$DB_USER" -p"$DB_PASS" < "$REPO_DIR/backend/db/schema.sql"
echo "  ✓ Database $DB_NAME ready"

# 3. Create backend .env
echo "→ Creating backend .env..."
cat > "$REPO_DIR/backend/.env" << EOF
PORT=3010
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=$DB_USER
DB_PASS=$DB_PASS
DB_NAME=$DB_NAME
EOF
echo "  ✓ .env created"

# 4. Install Node.js dependencies
echo "→ Installing npm dependencies..."
cd "$REPO_DIR/backend" && npm install --production
echo "  ✓ Dependencies installed"

# 5. Start pm2 process
echo "→ Starting pm2 process..."
cd "$REPO_DIR"
pm2 delete ai-monitor 2>/dev/null || true
pm2 start deploy/ecosystem.config.js
pm2 save
echo "  ✓ pm2 process ai-monitor started"

# 6. Nginx config
echo "→ Configuring Nginx..."
cp "$REPO_DIR/deploy/nginx-ai.vilarkptl.com.conf" \
   "$NGINX_SITES/ai.vilarkptl.com"
ln -sf "$NGINX_SITES/ai.vilarkptl.com" "$NGINX_ENABLED/" 2>/dev/null || true
nginx -t && systemctl reload nginx
echo "  ✓ Nginx configured for ai.vilarkptl.com"

# 7. SSL (optional — requires domain to point to this server)
echo ""
echo "→ To enable SSL run:"
echo "  certbot --nginx -d ai.vilarkptl.com"

# 8. Install hooks for the current user
echo ""
echo "→ Para activar hooks de Claude Code (usuario root):"
echo "  mkdir -p ~/.claude && cp $REPO_DIR/.claude/settings.json ~/.claude/settings.json"
echo "  # Para el usuario claude-agent (relay FiscalAI):"
echo "  mkdir -p /home/claude-agent/.claude && cp $REPO_DIR/.claude/settings.json /home/claude-agent/.claude/settings.json"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Setup complete!                        ║"
echo "║   Dashboard: http://ai.vilarkptl.com     ║"
echo "║   API:       http://localhost:3010/api   ║"
echo "╚══════════════════════════════════════════╝"
