#!/bin/bash
set -e

echo "=== FASE 1: Seguridad del servidor KPTL ==="
echo ""

# ─── PASO 1: Crear vault de secretos ───────────────────────────────────────
echo "[1/6] Creando vault /opt/kptl-secrets/..."
mkdir -p /opt/kptl-secrets
chmod 700 /opt/kptl-secrets
chown root:root /opt/kptl-secrets

# Crear api-keys.env si no existe
if [ ! -f /opt/kptl-secrets/api-keys.env ]; then
cat > /opt/kptl-secrets/api-keys.env << 'ENVEOF'
# KPTL Ecosystem — API Keys Master File
# Permisos: chmod 600 — solo root lee/escribe
# Editar desde el dashboard de ai-monitor o directamente como root

# ─── LLM PROVIDERS ───────────────────────────────────────
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
DEEPSEEK_API_KEY=
GROQ_API_KEY=
GEMINI_API_KEY=
ELEVENLABS_API_KEY=

# ─── COMMUNICATION ───────────────────────────────────────
TELEGRAM_BOT_TOKEN=

# ─── PAYMENTS ────────────────────────────────────────────
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
ENVEOF
  chmod 600 /opt/kptl-secrets/api-keys.env
  echo "    ✅ api-keys.env creado (vacío — llenar desde dashboard)"
else
  echo "    ℹ️  api-keys.env ya existe, no se sobreescribe"
fi

# Crear server-credentials.txt
touch /opt/kptl-secrets/server-credentials.txt
chmod 600 /opt/kptl-secrets/server-credentials.txt
touch /opt/kptl-secrets/github-pat.txt
chmod 600 /opt/kptl-secrets/github-pat.txt

echo "    ✅ Vault creado en /opt/kptl-secrets/"
echo ""

# ─── PASO 2: Detectar archivos con contraseña vieja ────────────────────────
echo "[2/6] Buscando archivos con contraseña actual de MySQL..."
AFFECTED=$(grep -rln "VilarRoot2026" /var/www/ /root/ /etc/ 2>/dev/null || true)

if [ -z "$AFFECTED" ]; then
  echo "    ℹ️  No se encontraron archivos con la contraseña vieja"
  echo "    (puede que ya fue cambiada o que usa otra contraseña)"
else
  echo "    ⚠️  Archivos que usan la contraseña actual:"
  echo "$AFFECTED" | while read f; do echo "    - $f"; done
  echo ""
  echo "    IMPORTANTE: Debes actualizar estos archivos DESPUÉS de cambiar"
  echo "    la contraseña en el Paso 4. El script lo hará automáticamente."
fi
echo ""

# ─── PASO 3: Rotar contraseña SSH root ─────────────────────────────────────
echo "[3/6] Generando nueva contraseña SSH root..."
NEW_SSH_PASS=$(openssl rand -base64 20 | tr -d "=+/" | cut -c1-20)
echo "root:$NEW_SSH_PASS" | chpasswd
echo "$(date '+%Y-%m-%d %H:%M') | SSH root | $NEW_SSH_PASS" >> /opt/kptl-secrets/server-credentials.txt
echo "    ✅ Contraseña SSH root cambiada y guardada en /opt/kptl-secrets/server-credentials.txt"
echo ""

# ─── PASO 4: Rotar contraseña MySQL root ───────────────────────────────────
echo "[4/6] Generando nueva contraseña MySQL root..."
NEW_MYSQL_PASS=$(openssl rand -base64 20 | tr -d "=+/" | cut -c1-20)

# Cambiar en MySQL
mysql -u root -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '$NEW_MYSQL_PASS'; FLUSH PRIVILEGES;" 2>/dev/null || \
mysql -u root -p"VilarRoot2026!" -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '$NEW_MYSQL_PASS'; FLUSH PRIVILEGES;" 2>/dev/null || \
{ echo "    ❌ No se pudo cambiar contraseña MySQL. Hazlo manualmente."; }

echo "$(date '+%Y-%m-%d %H:%M') | MySQL root | $NEW_MYSQL_PASS" >> /opt/kptl-secrets/server-credentials.txt
echo "    ✅ Contraseña MySQL root cambiada y guardada"
echo ""

# ─── PASO 5: Actualizar archivos afectados con nueva contraseña MySQL ──────
echo "[5/6] Actualizando archivos que usaban la contraseña vieja..."
if [ -n "$AFFECTED" ]; then
  echo "$AFFECTED" | while read f; do
    sed -i "s/VilarRoot2026!/$NEW_MYSQL_PASS/g" "$f"
    echo "    ✅ Actualizado: $f"
  done
else
  echo "    ℹ️  Ningún archivo que actualizar"
fi
echo ""

# ─── PASO 6: Rotar GitHub PAT en remote URL ────────────────────────────────
echo "[6/6] Actualizando remote URL de git..."
CURRENT_REMOTE=$(git -C /var/www/html/vilarkptl.com/ai-monitor remote get-url origin 2>/dev/null || echo "")
if [[ "$CURRENT_REMOTE" == *"ghp_"* ]]; then
  # Extraer el repo path
  REPO_PATH=$(echo "$CURRENT_REMOTE" | sed 's|.*github.com/||')
  # Leer nuevo PAT si existe
  NEW_PAT=$(cat /opt/kptl-secrets/github-pat.txt 2>/dev/null | head -1 | tr -d '[:space:]')
  if [ -n "$NEW_PAT" ]; then
    git -C /var/www/html/vilarkptl.com/ai-monitor remote set-url origin "https://$NEW_PAT@github.com/$REPO_PATH"
    echo "    ✅ Remote URL actualizado con nuevo PAT"
  else
    echo "    ⚠️  github-pat.txt está vacío. Actualiza el remote manualmente:"
    echo "    git remote set-url origin https://NUEVO_PAT@github.com/$REPO_PATH"
    echo "    Luego revoca el PAT anterior en github.com/settings/tokens"
  fi
else
  echo "    ℹ️  Remote URL no contiene PAT hardcoded (ya está limpio)"
fi
echo ""

# ─── RESUMEN FINAL ─────────────────────────────────────────────────────────
echo "════════════════════════════════════════"
echo "✅ FASE 1 COMPLETADA"
echo ""
echo "Credenciales guardadas en: /opt/kptl-secrets/server-credentials.txt"
echo ""
echo "ACCIÓN MANUAL REQUERIDA:"
echo "→ Revocar PAT anterior en: https://github.com/settings/tokens"
echo "   (el que empieza con ghp_9ijW4483...)"
echo "════════════════════════════════════════"
