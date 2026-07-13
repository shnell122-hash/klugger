#!/bin/bash
# Lanza el agente Claude Code en un contenedor Docker aislado dentro de una sesión tmux.
# El agente solo tiene un PAT scoped al repo de testing — nunca ve tokens de Cloudflare ni de prod.
#
# Uso:
#   ./run-agent.sh "Agrega la pestaña X al dashboard"
#   ./run-agent.sh   # usa la tarea por defecto
#
# Variables de entorno requeridas (exportar antes o pasar inline):
#   GITHUB_TOKEN  — fine-grained PAT scoped SOLO a vilarkptl-lang/klugger (Contents R/W)
#
# Auth de Claude: se monta ~/.claude del host — no se necesita ANTHROPIC_API_KEY.
# El contenedor hereda el proxy/OAuth que ya está configurado en el servidor.
#
# Ver sesión activa:  tmux attach -t klugger-agent
# Detach sin matar:  Ctrl+B, D

set -euo pipefail

: "${GITHUB_TOKEN:?Falta GITHUB_TOKEN — fine-grained PAT con Contents R/W en vilarkptl-lang/klugger}"

REPO="vilarkptl-lang/klugger"
BRANCH="testing"
IMAGE="klugger-agent"
SESSION="klugger-agent"
TASK="${1:-Revisa el dashboard y propón mejoras}"

# ── Matar sesión tmux previa si existe ────────────────────────────────────────
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "⚠️  Ya existe una sesión tmux '$SESSION'. Matándola..."
  tmux kill-session -t "$SESSION"
fi

# ── Matar contenedor previo si existe ─────────────────────────────────────────
if docker ps -q --filter "name=^${SESSION}$" | grep -q .; then
  echo "⚠️  Contenedor '$SESSION' corriendo. Deteniéndolo..."
  docker stop "$SESSION" 2>/dev/null || true
fi

# ── Clonar repo fresco en directorio temporal ─────────────────────────────────
WORK=$(mktemp -d)
echo "📁 Clonando $REPO (branch: $BRANCH) en $WORK ..."
git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git" \
    --branch "$BRANCH" --depth 1 "$WORK/klugger"

# Guardar credenciales dentro del clone para que el agente pueda hacer push
git -C "$WORK/klugger" config credential.helper store
echo "https://x-access-token:${GITHUB_TOKEN}@github.com" > "$WORK/.git-credentials"

# ── Construir imagen si no existe ─────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! docker image inspect "$IMAGE" &>/dev/null; then
  echo "🔨 Imagen '$IMAGE' no encontrada. Construyendo..."
  docker build -t "$IMAGE" "$SCRIPT_DIR"
fi

# ── Lanzar en tmux ────────────────────────────────────────────────────────────
echo "🚀 Lanzando agente en tmux session '$SESSION'..."

tmux new-session -d -s "$SESSION" -x 220 -y 50 "
  docker run --rm \
    --name '$SESSION' \
    --memory 1g \
    --cpus 1.5 \
    --network host \
    -e GITHUB_TOKEN='$GITHUB_TOKEN' \
    -e GIT_AUTHOR_NAME='klugger-agent' \
    -e GIT_AUTHOR_EMAIL='agent@klugger.local' \
    ${INFISICAL_CLIENT_ID:+-e INFISICAL_CLIENT_ID='$INFISICAL_CLIENT_ID'} \
    ${INFISICAL_CLIENT_SECRET:+-e INFISICAL_CLIENT_SECRET='$INFISICAL_CLIENT_SECRET'} \
    -v '$WORK/klugger:/home/agent/project' \
    -v '$WORK/.git-credentials:/home/agent/.git-credentials:ro' \
    -v '$HOME/.claude:/home/agent/.claude:ro' \
    -v '$HOME/.claude.json:/home/agent/.claude.json:ro' \
    '$IMAGE' \
    --print \
    --max-turns 40 \
    '$TASK'

  echo ''
  echo '✅ Agente terminó. Presiona Enter para cerrar.'
  read
"

echo ""
echo "────────────────────────────────────────────────"
echo "✅ Agente corriendo en tmux session: $SESSION"
echo ""
echo "  Ver en vivo:        tmux attach -t $SESSION"
echo "  Detach sin matar:   Ctrl+B, D"
echo "  Ver todas sesiones: tmux ls"
echo "  Matar sesión:       tmux kill-session -t $SESSION"
echo "────────────────────────────────────────────────"
