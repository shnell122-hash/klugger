#!/usr/bin/env bash
# deploy/safe-restart.sh
# Reinicia relay-master solo cuando no hay tareas corriendo.
# Uso: bash deploy/safe-restart.sh [--force] [--timeout 300]

FORCE=0
WAIT_MAX=300   # segundos máximos de espera
LOCK_PATTERN="/tmp/relay-lock-*"

while [[ $# -gt 0 ]]; do
  case $1 in
    --force)   FORCE=1 ;;
    --timeout) WAIT_MAX="$2"; shift ;;
  esac; shift
done

echo "[safe-restart] Verificando tareas en curso…"

WAITED=0
while true; do
  LOCKS=$(ls $LOCK_PATTERN 2>/dev/null)
  if [ -z "$LOCKS" ]; then
    echo "[safe-restart] Sin tareas activas — reiniciando relay-master"
    break
  fi

  if [ "$FORCE" = "1" ] || [ "$WAITED" -ge "$WAIT_MAX" ]; then
    echo "[safe-restart] Forzando reinicio (locks: $LOCKS)"
    rm -f $LOCK_PATTERN
    break
  fi

  echo "[safe-restart] Tarea en curso: $LOCKS — esperando… (${WAITED}s/${WAIT_MAX}s)"
  sleep 10
  WAITED=$((WAITED + 10))
done

cd /var/www/html/vilarkptl.com/ai-monitor
git pull --rebase origin claude/agent-monitoring-dashboard-4v8iq --quiet
pm2 restart relay-master
echo "[safe-restart] ✅ relay-master reiniciado con código nuevo"
