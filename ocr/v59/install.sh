#!/usr/bin/env bash
# ============================================================
# VILAR Legal OS v59 — Script de instalación
# ============================================================
#
# ONE-LINER — Descarga e instala v59 directo desde el repo:
#
#   curl -fsSL https://raw.githubusercontent.com/vilarkptl-lang/agentic-repo/claude%2Focr-v59-implementation-vOcPD/ocr/v59/install.sh | bash
#
# O con git clone completo (recomendado — incluye todos los archivos):
#
#   git clone --depth=1 --branch claude/ocr-v59-implementation-vOcPD \
#     https://github.com/vilarkptl-lang/agentic-repo.git /tmp/vilar-v59 \
#     && bash /tmp/vilar-v59/ocr/v59/install.sh
#
# ============================================================
set -euo pipefail

# ── Colores ──────────────────────────────────────────────────
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}[OK]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
info() { echo -e "  → $*"; }

# ── Rutas ────────────────────────────────────────────────────
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="/var/www/catalogos/OCR/v59"
VENV="$DEST/venv"
PYTHON="python3.10"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   VILAR Legal OS v59 — Instalación       ║"
echo "╚══════════════════════════════════════════╝"
echo "  Origen:  $SRC"
echo "  Destino: $DEST"
echo ""

# ── 1. Crear estructura de directorios ───────────────────────
info "Creando estructura de directorios..."
mkdir -p "$DEST"/{api/routes,api/tools,openclaw,frontend,uploads}
ok "Directorios creados"

# ── 2. Copiar archivos ───────────────────────────────────────
info "Copiando archivos al destino..."
if command -v rsync &>/dev/null; then
    rsync -a --exclude='venv' --exclude='__pycache__' --exclude='*.pyc' \
          --exclude='.env' "$SRC/" "$DEST/"
else
    cp -r "$SRC/." "$DEST/"
fi
ok "Archivos copiados"

# ── 3. Permisos de uploads ───────────────────────────────────
chown -R www-data:www-data "$DEST/uploads" 2>/dev/null || \
    chmod 777 "$DEST/uploads"
chmod 775 "$DEST/uploads"
ok "Permisos de uploads configurados"

# ── 4. Python venv ───────────────────────────────────────────
info "Creando entorno virtual Python ($PYTHON)..."
if [ ! -d "$VENV" ]; then
    $PYTHON -m venv "$VENV"
    ok "venv creado en $VENV"
else
    warn "venv ya existe — omitiendo creación"
fi

info "Instalando dependencias Python..."
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet \
    flask flask-cors python-dotenv \
    anthropic \
    mysql-connector-python \
    requests \
    python-docx
ok "Dependencias instaladas"

# ── 5. .env ──────────────────────────────────────────────────
ENV_FILE="$DEST/api/.env"
if [ ! -f "$ENV_FILE" ]; then
    cp "$DEST/api/.env.example" "$ENV_FILE"
    warn ".env creado desde .env.example"
    warn "IMPORTANTE: edita $ENV_FILE y pon tu ANTHROPIC_API_KEY"
    warn "  La key correcta termina en: ...GEqyVVAGA..."
else
    ok ".env ya existe — no sobreescrito"
fi

# ── 6. MySQL schema ──────────────────────────────────────────
echo ""
echo "── MySQL Schema ────────────────────────────"
read -rp "  ¿Aplicar schema_v59.sql? [s/N]: " APPLY_SQL
if [[ "$APPLY_SQL" =~ ^[sS]$ ]]; then
    read -rp "  Usuario MySQL (default: root): " MYSQL_USER
    MYSQL_USER="${MYSQL_USER:-root}"
    mysql -u"$MYSQL_USER" -p < "$DEST/schema_v59.sql" && ok "Schema aplicado" || err "Error al aplicar schema"
else
    warn "Schema omitido — aplícalo manualmente:"
    info "mysql -u root -p < $DEST/schema_v59.sql"
fi

# ── 7. PM2 ───────────────────────────────────────────────────
echo ""
echo "── PM2 ─────────────────────────────────────"
if command -v pm2 &>/dev/null; then
    # Detener instancia previa si existe
    pm2 delete vilar-legal-os-v59 2>/dev/null && warn "Instancia previa detenida" || true
    # Iniciar con ecosystem
    pm2 start "$DEST/ecosystem.config.js"
    pm2 save
    ok "PM2 iniciado: vilar-legal-os-v59 en :5005"
else
    err "pm2 no encontrado — instálalo con: npm install -g pm2"
    info "Luego: pm2 start $DEST/ecosystem.config.js"
fi

# ── 8. Health check ──────────────────────────────────────────
echo ""
info "Esperando 3 segundos para que Flask arranque..."
sleep 3
if curl -sf http://localhost:5005/api/health &>/dev/null; then
    ok "API respondiendo en :5005"
    curl -s http://localhost:5005/api/health
    echo ""
else
    warn "API no responde aún en :5005 — revisar logs:"
    info "pm2 logs vilar-legal-os-v59 --lines 30"
fi

# ── 9. Apache & SSL ──────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  PASOS MANUALES RESTANTES                                ║"
echo "╚══════════════════════════════════════════════════════════╝"
cat <<'APACHE'

1. DNS — Crear registro A en tu proveedor:
   Tipo: A  |  Nombre: ocr  |  Valor: 143.198.228.78  |  TTL: 3600

2. Apache VirtualHost — crear /etc/apache2/sites-available/ocr.ruby.lease.conf:

   <VirtualHost *:80>
       ServerName ocr.ruby.lease
       RewriteEngine on
       RewriteRule ^ https://%{SERVER_NAME}%{REQUEST_URI} [END,NE,R=permanent]
   </VirtualHost>

   Luego habilitar:
   a2ensite ocr.ruby.lease.conf && systemctl reload apache2

3. SSL con Certbot:
   certbot --apache -d ocr.ruby.lease

4. El VirtualHost HTTPS resultante debe incluir:

   <VirtualHost *:443>
       ServerName ocr.ruby.lease
       DocumentRoot /var/www/catalogos/

       <Directory /var/www/catalogos>
           Options FollowSymLinks
           AllowOverride All
           Require all granted
       </Directory>

       ProxyRequests Off
       ProxyPreserveHost On
       ProxyTimeout 300
       RewriteEngine On
       RewriteRule ^/?$ /OCR/v59/frontend/ [R=301,L]

       Include /etc/letsencrypt/options-ssl-apache.conf
       SSLCertificateFile /etc/letsencrypt/live/ocr.ruby.lease/fullchain.pem
       SSLCertificateKeyFile /etc/letsencrypt/live/ocr.ruby.lease/privkey.pem
   </VirtualHost>

5. Verificación final:
   curl http://localhost:5005/api/health
   curl https://ocr.ruby.lease/OCR/v59/api/health
   # → {"status":"ok","version":"v59"}

APACHE

echo ""
ok "Instalación completada. Revisa los pasos manuales arriba."
echo ""
