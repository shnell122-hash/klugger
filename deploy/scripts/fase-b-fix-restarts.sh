#!/bin/bash
# FASE B — Fix de restarts de relay-master
# Ejecutar SOLO después de revisar el output de fase-a-diagnostico.sh
# y confirmar con Vilar qué causa aplica.
# Uso: bash fase-b-fix-restarts.sh [causa: dir|reload|memory]

CAUSA="${1:-auto}"
AI_DIR="/var/www/html/vilarkptl.com/ai-monitor"

echo "====== FIX RESTARTS relay-master — causa: $CAUSA ======"
echo "Timestamp: $(date)"

# ── Fix A: directorio de dispatches no existe (ENOENT) ──
if [[ "$CAUSA" == "dir" || "$CAUSA" == "auto" ]]; then
  echo ""
  echo "── Fix A: crear /var/lib/ai-monitor/ ──"
  if [ ! -d "/var/lib/ai-monitor" ]; then
    mkdir -p /var/lib/ai-monitor
    echo '[]' > /var/lib/ai-monitor/pending-dispatches.json
    chmod 755 /var/lib/ai-monitor
    echo "✓ Directorio creado"
  else
    echo "El directorio ya existe — Fix A no aplica"
  fi
fi

# ── Fix B: sincronizar código en producción con HEAD del repo ──
if [[ "$CAUSA" == "reload" ]]; then
  echo ""
  echo "── Fix B: sincronizar repo en producción ──"
  cd "$AI_DIR"
  git stash 2>/dev/null || true
  git pull origin main
  echo "✓ Repo sincronizado"
fi

# ── Fix C: aplicar nuevo max_memory_restart (256M) ──
echo ""
echo "── Fix C: aplicar ecosystem.config.js con max_memory_restart=256M ──"
cd "$AI_DIR"
pm2 reload deploy/ecosystem.config.js --update-env
echo "✓ PM2 recargado"

# Esperar 10 segundos y verificar
echo ""
echo "── Verificación (10s) ──"
sleep 10
pm2 show relay-master | grep -E "restart_time|uptime|status"

echo ""
echo "Si restart_time no sigue aumentando después de 2 minutos, el fix funcionó."
echo "Verificar: pm2 logs relay-master --lines 20 --nostream"
echo "====== FIN FIX ======"
