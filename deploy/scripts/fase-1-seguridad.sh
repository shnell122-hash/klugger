#!/bin/bash
# FASES 1.2 + 1.3 + 2 — Rotación de credenciales y creación del vault
# Ejecutar como root en 143.198.228.78
# Uso: bash fase-1-seguridad.sh
# IMPORTANTE: Leer TODO el script antes de ejecutar.

set -euo pipefail
LOG_FILE="/tmp/security-rotation-$(date +%Y%m%d-%H%M).log"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "====== ROTACIÓN DE CREDENCIALES $(date) ======"

AI_DIR="/var/www/html/vilarkptl.com/ai-monitor"

# ──────────────────────────────────────────────────────────────────────────────
# FASE 2 primero: crear el vault ANTES de generar las nuevas credenciales
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── FASE 2: Crear /opt/kptl-secrets/ vault ──"
mkdir -p /opt/kptl-secrets
chmod 700 /opt/kptl-secrets
chown root:root /opt/kptl-secrets

cat > /opt/kptl-secrets/README.txt << 'EOF'
/opt/kptl-secrets — Vault de credenciales KPTL
================================================
Permisos: chmod 700 en el directorio, chmod 600 en cada archivo.
Solo accesible como root.

Archivos:
  server-credentials.txt  — SSH root, MySQL root (con fecha de rotación)
  github-pat.txt          — Token GitHub + fecha de expiración
  api-keys.env            — TODAS las API keys del ecosistema

NUNCA commitear estos archivos a git.
NUNCA mostrar el contenido en logs públicos.

Para rotar una credencial:
  1. Generar nueva
  2. Actualizar el archivo aquí
  3. Actualizar todos los .env que la usen
  4. Documentar fecha de rotación en server-credentials.txt
EOF

# Crear api-keys.env con estructura (valores vacíos — Vilar los llena)
cat > /opt/kptl-secrets/api-keys.env << 'EOF'
# KPTL Ecosystem — API Keys Master File
# Permisos: chmod 600 — solo root
# Actualizar este archivo cada vez que se rote una key

# ─── LLM PROVIDERS ───────────────────────────────────────
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
ELEVENLABS_API_KEY=

# ─── COMMUNICATION ───────────────────────────────────────
TELEGRAM_BOT_TOKEN=

# ─── PAYMENTS & ECOMMERCE ────────────────────────────────
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
SKYDROPX_API_KEY=
SKYDROPX_API_SECRET=

# ─── SERVICES ────────────────────────────────────────────
JOTFORM_API_KEY=

# ─── DATABASE ────────────────────────────────────────────
MYSQL_ROOT_PASSWORD=
MYSQL_KPTL_PASSWORD=

# ─── GITHUB ──────────────────────────────────────────────
GITHUB_PAT=
EOF

chmod 600 /opt/kptl-secrets/api-keys.env
chmod 600 /opt/kptl-secrets/README.txt
echo "✓ Vault creado en /opt/kptl-secrets/"

# ──────────────────────────────────────────────────────────────────────────────
# FASE 1.3: Buscar todos los archivos que usan la contraseña actual ANTES de cambiarla
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── FASE 1.3a: Buscar archivos con contraseña MySQL actual ──"
echo "(Esto puede tardar unos segundos)"
AFFECTED_FILES=$(grep -rln "VilarRoot2026" /var/www/ /root/ /etc/ /opt/ 2>/dev/null || true)
if [ -n "$AFFECTED_FILES" ]; then
  echo "Archivos que contienen la contraseña actual:"
  echo "$AFFECTED_FILES"
  echo ""
  echo "DETENIENDO: actualizar estos archivos manualmente ANTES de continuar."
  echo "Luego volver a ejecutar este script con el flag --skip-search"
  echo ""
  echo "Instrucción: para cada archivo listado, reemplazar 'VilarRoot2026!'"
  echo "con la nueva contraseña que se generará en el siguiente paso."
  echo ""
  echo "Cuando todos los archivos estén actualizados, ejecutar:"
  echo "  bash fase-1-seguridad.sh --skip-search"
  exit 0
else
  echo "✓ No se encontraron referencias a la contraseña actual en archivos de texto"
fi

# ──────────────────────────────────────────────────────────────────────────────
# FASE 1.3b: Generar nuevas contraseñas
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── FASE 1.3b: Generar nuevas contraseñas ──"
NEW_SSH_PASS=$(openssl rand -base64 24 | tr -d '/+=')
NEW_MYSQL_PASS=$(openssl rand -base64 24 | tr -d '/+=')
TODAY=$(date +%Y-%m-%d)

# Guardar en vault PRIMERO antes de cambiar nada
cat > /opt/kptl-secrets/server-credentials.txt << CREDEOF
# KPTL Server Credentials — Actualizado $TODAY
# Permisos: chmod 600 — solo root

# SSH
HOST=143.198.228.78
SSH_USER=root
SSH_PASSWORD=$NEW_SSH_PASS
SSH_ROTATED=$TODAY

# MySQL
MYSQL_HOST=127.0.0.1
MYSQL_USER=root
MYSQL_PASSWORD=$NEW_MYSQL_PASS
MYSQL_ROTATED=$TODAY

# NOTA: Revocar el PAT anterior en github.com/settings/tokens
# Ver github-pat.txt para el token actual
CREDEOF
chmod 600 /opt/kptl-secrets/server-credentials.txt

echo "✓ Credenciales guardadas en /opt/kptl-secrets/server-credentials.txt"
echo ""
echo "  Nueva contraseña SSH:   $NEW_SSH_PASS"
echo "  Nueva contraseña MySQL: $NEW_MYSQL_PASS"
echo ""
echo "GUARDAR ESTAS CONTRASEÑAS ANTES DE CONTINUAR."
echo "Están en /opt/kptl-secrets/server-credentials.txt"

# Pausa de seguridad
read -p "¿Confirmas que guardaste las contraseñas? (escribe 'si' para continuar): " CONFIRM
if [ "$CONFIRM" != "si" ]; then
  echo "Abortado. Las contraseñas están guardadas en /opt/kptl-secrets/server-credentials.txt"
  exit 0
fi

# ──────────────────────────────────────────────────────────────────────────────
# Cambiar contraseña MySQL
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Cambiar contraseña MySQL root ──"

# Actualizar backend/.env del ai-monitor
if [ -f "$AI_DIR/backend/.env" ]; then
  sed -i "s/DB_PASS=.*/DB_PASS=$NEW_MYSQL_PASS/" "$AI_DIR/backend/.env"
  echo "✓ backend/.env actualizado"
fi

# Cambiar la contraseña en MySQL
mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '$NEW_MYSQL_PASS'; FLUSH PRIVILEGES;" 2>/dev/null || \
mysql -u root -pVilarRoot2026! -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '$NEW_MYSQL_PASS'; FLUSH PRIVILEGES;" 2>/dev/null
echo "✓ Contraseña MySQL cambiada"

# Actualizar api-keys.env
sed -i "s/MYSQL_ROOT_PASSWORD=.*/MYSQL_ROOT_PASSWORD=$NEW_MYSQL_PASS/" /opt/kptl-secrets/api-keys.env

# Reiniciar ai-monitor backend para que tome el nuevo .env
pm2 restart ai-monitor 2>/dev/null && echo "✓ ai-monitor backend reiniciado" || true

# ──────────────────────────────────────────────────────────────────────────────
# Cambiar contraseña SSH
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── Cambiar contraseña SSH root ──"
echo "root:$NEW_SSH_PASS" | chpasswd
echo "✓ Contraseña SSH cambiada"

# ──────────────────────────────────────────────────────────────────────────────
# FASE 1.2: Actualizar el remote URL de git con nuevo PAT
# ──────────────────────────────────────────────────────────────────────────────
echo ""
echo "── FASE 1.2: Verificar remote URL de git ──"
cd "$AI_DIR"
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
echo "Remote actual: ${CURRENT_REMOTE:0:60}..."

if echo "$CURRENT_REMOTE" | grep -q "ghp_"; then
  echo "⚠️  El remote URL contiene un PAT hardcoded."
  echo ""
  echo "ACCIÓN MANUAL REQUERIDA:"
  echo "1. Generar un nuevo PAT en https://github.com/settings/tokens"
  echo "   - Scope mínimo: repo (solo lectura/escritura al repo)"
  echo "   - Expiración: 90 días recomendado"
  echo "2. Ejecutar:"
  echo "   git remote set-url origin https://<NUEVO_TOKEN>@github.com/vilarkptl-lang/agentic-repo.git"
  echo "   git pull  # verificar que funciona"
  echo "3. Guardar el nuevo token en /opt/kptl-secrets/github-pat.txt"
  echo "4. Revocar el PAT anterior en https://github.com/settings/tokens"

  # Crear el archivo de PAT con instrucciones
  cat > /opt/kptl-secrets/github-pat.txt << 'PATEOF'
# GitHub Personal Access Token — KPTL
# Permisos: chmod 600 — solo root
#
# INSTRUCCIONES:
# 1. Generar en: https://github.com/settings/tokens
# 2. Scope necesario: repo
# 3. Expiración recomendada: 90 días
# 4. Actualizar remote URL: git remote set-url origin https://<TOKEN>@github.com/vilarkptl-lang/agentic-repo.git
#
# TOKEN_ACTUAL=<pegar aquí el nuevo token>
# CREADO=
# EXPIRA=
# REVOCADO=  ← dejar en blanco hasta que se revoque
PATEOF
  chmod 600 /opt/kptl-secrets/github-pat.txt
  echo "✓ Instrucciones guardadas en /opt/kptl-secrets/github-pat.txt"
else
  echo "✓ Remote URL no contiene PAT hardcoded"
fi

echo ""
echo "====== ROTACIÓN COMPLETADA $(date) ======"
echo ""
echo "Resumen:"
echo "  ✓ Vault /opt/kptl-secrets/ creado con permisos 700"
echo "  ✓ server-credentials.txt creado (permisos 600)"
echo "  ✓ api-keys.env creado con estructura (valores vacíos)"
echo "  ✓ Contraseña MySQL cambiada"
echo "  ✓ Contraseña SSH cambiada"
echo "  ⚠️  PAT de GitHub — requiere acción manual (ver /opt/kptl-secrets/github-pat.txt)"
echo ""
echo "Log guardado en: $LOG_FILE"
echo ""
echo "PRÓXIMOS PASOS para Vilar:"
echo "  1. Revocar PAT anterior: https://github.com/settings/tokens"
echo "  2. Crear nuevo PAT y actualizar remote URL (instrucciones en github-pat.txt)"
echo "  3. Llenar /opt/kptl-secrets/api-keys.env con todas las API keys actuales"
echo "  4. Verificar que todos los servicios funcionan: pm2 status"
