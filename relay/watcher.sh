#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# relay/watcher.sh — AI Monitor relay watcher
# pm2 process: ai-monitor-relay
# ─────────────────────────────────────────────────────────────

REPO_DIR="/var/www/html/vilarkptl.com/ai-monitor"
INBOX="$REPO_DIR/relay/inbox.md"
ENV_FILE="$REPO_DIR/relay/.env"
WATCHER_LOG="$REPO_DIR/relay/watcher.log"
LAST_HASH_FILE="/tmp/ai-monitor-inbox-hash"
BRANCH="claude/agent-monitoring-dashboard-4v8iq"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$WATCHER_LOG"; }

tg() {
  # tg "<message>" — send plain text to Telegram (URL-safe)
  local MSG="$1"
  [ -z "$TELEGRAM_BOT_TOKEN" ] && return
  curl -s -o /dev/null -X POST \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" \
    --data-urlencode "text=${MSG}" \
    -d "parse_mode=HTML"
}

[ -f "$ENV_FILE" ] && source "$ENV_FILE"

if [ -n "$GITHUB_TOKEN" ]; then
  cd "$REPO_DIR"
  git remote set-url origin "https://${GITHUB_TOKEN}@github.com/vilarkptl-lang/agentic-repo.git" 2>/dev/null
fi

log "=== AI Monitor Relay iniciado ==="

# Ver si hay tarea pendiente en inbox
PENDING_TITLE=$(grep -E '^#{1,3} ' "$INBOX" 2>/dev/null | grep -v 'Relay Inbox' | head -1 | sed 's/^#* //')
PENDING_NOTE=""
[ -n "$PENDING_TITLE" ] && PENDING_NOTE="
📋 Tarea pendiente detectada: <i>$PENDING_TITLE</i>"

tg "🟢 <b>ai-monitor-relay iniciado</b>
📡 Monitoreando inbox.md cada 15s
🖥 Servidor: vilar-desarrollo
🌐 Dashboard: http://ia.vilarkptl.com${PENDING_NOTE}"

LAST_HASH=$(cat "$LAST_HASH_FILE" 2>/dev/null || echo "")

while true; do
  cd "$REPO_DIR" && git pull origin "$BRANCH" --quiet 2>/dev/null

  CURRENT_HASH=$(md5sum "$INBOX" 2>/dev/null | cut -d' ' -f1)

  if [ "$CURRENT_HASH" != "$LAST_HASH" ] && [ -n "$CURRENT_HASH" ]; then
    LAST_HASH="$CURRENT_HASH"
    echo "$LAST_HASH" > "$LAST_HASH_FILE"

    # Leer tarea
    TASK_FULL=$(cat "$INBOX")

    # Título: primera línea ## o # que no sea el header del archivo
    TASK_TITLE=$(echo "$TASK_FULL" | grep -E '^#{1,3} ' | grep -v 'Relay Inbox' | head -1 | sed 's/^#* //')
    [ -z "$TASK_TITLE" ] && TASK_TITLE="Tarea sin título"

    # Extraer lista numerada o con guión (las tareas concretas)
    TASK_ITEMS=$(echo "$TASK_FULL" | grep -E '^[0-9]+\. |^- ' | head -10)

    # Formatear lista para Telegram
    TASK_LIST_TG=""
    while IFS= read -r line; do
      # Convertir "1. Hacer X" → "  1. Hacer X"
      TASK_LIST_TG="${TASK_LIST_TG}  ${line}
"
    done <<< "$TASK_ITEMS"

    log "Nueva tarea: $TASK_TITLE"

    # ── 1. Telegram: inicio con desglose ─────────────────────
    tg "📨 <b>Nueva tarea desde Chat Claude</b>
🗂 <b>$TASK_TITLE</b>

<b>Tareas a ejecutar:</b>
<code>$TASK_LIST_TG</code>
⏳ Ejecutando ahora en el servidor…"

    cp "$INBOX" /home/claude-agent/task.md 2>/dev/null
    START_TIME=$(date +%s)

    # ── 2. Ejecutar Claude ───────────────────────────────────
    su - claude-agent -c "
      source /home/claude-agent/.bashrc 2>/dev/null
      export ANTHROPIC_API_KEY='$ANTHROPIC_API_KEY'
      export CLAUDE_MONITOR_URL='http://127.0.0.1:3010'
      cd $REPO_DIR
      /usr/local/bin/claude --dangerously-skip-permissions \
        --print \
        \"\$(cat /home/claude-agent/task.md)\" \
        < /dev/null \
        > /home/claude-agent/result.txt 2>&1
    " && EXITCODE=0 || EXITCODE=1

    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S CST')
    RESULT_RAW=$(cat /home/claude-agent/result.txt 2>/dev/null)

    # Extraer líneas de todos completados (✅ o - [x])
    TODOS_DONE=$(echo "$RESULT_RAW" | grep -E '(✅|☑|DONE|completad|✓|\[x\])' | head -10)

    # Detectar si necesita intervención
    NEEDS_INTERVENTION=$(echo "$RESULT_RAW" | grep -iE '(error|failed|no pude|requiere|aprobación|manual|bloqueado|exception)' | head -3)

    # ── 3. Escribir outbox.md ────────────────────────────────
    cat > "$REPO_DIR/relay/outbox.md" << OUTEOF
# AI Monitor — Relay Outbox
_Resultado: $TIMESTAMP | Duración: ${DURATION}s | Exit: $EXITCODE_

$RESULT_RAW
OUTEOF

    # ── 4. Commit y push ─────────────────────────────────────
    cd "$REPO_DIR"
    git add relay/outbox.md
    git commit -m "relay: resultado $TIMESTAMP" --quiet
    git push origin "$BRANCH" --quiet 2>&1 | tee -a "$WATCHER_LOG"

    # ── 5. Telegram: resultado ───────────────────────────────
    if [ "$EXITCODE" -ne 0 ] || [ -n "$NEEDS_INTERVENTION" ]; then
      # ERROR o necesita intervención
      ERROR_SNIPPET=$(echo "$RESULT_RAW" | tail -8 | head -5)
      tg "⚠️ <b>Requiere tu intervención</b>

📋 Tarea: $TASK_SUMMARY
⏱ ${DURATION}s

❌ Problema detectado:
<code>$NEEDS_INTERVENTION</code>

Ver detalles: relay/outbox.md en GitHub
Dashboard: http://ia.vilarkptl.com"

    else
      # ÉXITO — listar todos completados
      if [ -n "$TODOS_DONE" ]; then
        TODOS_LIST=$(echo "$TODOS_DONE" | sed 's/^/✅ /' | head -8)
      else
        TODOS_LIST="✅ Tarea ejecutada sin errores"
      fi

      tg "✅ <b>Tarea completada</b>
📨 Origen: Chat Claude
⏱ ${DURATION}s

<b>Completado:</b>
$TODOS_LIST

Ver resultado completo en relay/outbox.md
Dashboard: http://ia.vilarkptl.com"
    fi

    log "Relay completado (exit: $EXITCODE, ${DURATION}s)"
  fi

  sleep 15
done
