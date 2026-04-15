#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# relay/watcher.sh — AI Monitor relay watcher
# pm2 process: ai-monitor-relay
#
# Detecta cambios en relay/inbox.md cada 15s y ejecuta Claude.
# Equivalente al relay de FiscalAI pero para este proyecto.
# ─────────────────────────────────────────────────────────────

REPO_DIR="/var/www/html/vilarkptl.com/ai-monitor"
INBOX="$REPO_DIR/relay/inbox.md"
ENV_FILE="$REPO_DIR/relay/.env"
WATCHER_LOG="$REPO_DIR/relay/watcher.log"
LAST_HASH_FILE="/tmp/ai-monitor-inbox-hash"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$WATCHER_LOG"; }

# Cargar variables de entorno del relay
[ -f "$ENV_FILE" ] && source "$ENV_FILE"

# Configurar git remote con token para push/pull sin passphrase
if [ -n "$GITHUB_TOKEN" ]; then
  cd "$REPO_DIR"
  git remote set-url origin "https://${GITHUB_TOKEN}@github.com/vilarkptl-lang/agentic-repo.git" 2>/dev/null
fi

log "=== AI Monitor Relay iniciado ==="
log "Monitoreando: $INBOX"

LAST_HASH=$(cat "$LAST_HASH_FILE" 2>/dev/null || echo "")

while true; do
  # Pull silencioso
  cd "$REPO_DIR" && git pull origin claude/agent-monitoring-dashboard-4v8iq --quiet 2>/dev/null

  CURRENT_HASH=$(md5sum "$INBOX" 2>/dev/null | cut -d' ' -f1)

  if [ "$CURRENT_HASH" != "$LAST_HASH" ] && [ -n "$CURRENT_HASH" ]; then
    LAST_HASH="$CURRENT_HASH"
    echo "$LAST_HASH" > "$LAST_HASH_FILE"
    log "inbox.md cambió — ejecutando Claude..."

    # Crear task.md para claude-agent
    cp "$INBOX" /home/claude-agent/task.md 2>/dev/null

    # Ejecutar como claude-agent (no-root, --dangerously-skip-permissions)
    su - claude-agent -c "
      source /home/claude-agent/.bashrc 2>/dev/null
      export ANTHROPIC_API_KEY='$ANTHROPIC_API_KEY'
      export CLAUDE_MONITOR_URL='http://127.0.0.1:3010'
      cd $REPO_DIR
      /usr/local/bin/claude --dangerously-skip-permissions \
        --print \
        \"\$(cat /home/claude-agent/task.md)\" \
        > /home/claude-agent/result.txt 2>&1
    " && EXITCODE=0 || EXITCODE=1

    RESULT=$(cat /home/claude-agent/result.txt 2>/dev/null | head -200)
    TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S CST')

    # Escribir outbox.md
    cat > "$REPO_DIR/relay/outbox.md" << EOF
# AI Monitor — Relay Outbox
_Resultado: $TIMESTAMP_

$RESULT
EOF

    # Commit y push
    cd "$REPO_DIR"
    git add relay/outbox.md
    git commit -m "relay: resultado $TIMESTAMP" --quiet
    git push origin claude/agent-monitoring-dashboard-4v8iq --quiet 2>&1 | tee -a "$WATCHER_LOG"

    # Notificar via Telegram
    if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_ID" ]; then
      if [ "$EXITCODE" -eq 0 ]; then
        MSG="✅ *ai-monitor relay completado*%0A$(echo "$RESULT" | head -5 | sed 's/$/\\n/' | tr -d '\n')"
      else
        MSG="❌ *ai-monitor relay ERROR*%0A$(echo "$RESULT" | tail -5 | sed 's/$/\\n/' | tr -d '\n')"
      fi
      curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d "chat_id=${TELEGRAM_CHAT_ID}" \
        -d "text=${MSG}" \
        -d "parse_mode=Markdown" > /dev/null 2>&1
    fi

    log "Relay completado (exit: $EXITCODE)"
  fi

  sleep 15
done
