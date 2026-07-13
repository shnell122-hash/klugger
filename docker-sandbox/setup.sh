#!/bin/bash
# Instala dependencias del sandbox en el servidor (correr una sola vez como root).
# Servidor: 143.198.228.78 (Ubuntu/Debian)

set -euo pipefail

echo "=== Instalando Docker ==="
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  usermod -aG docker "${SUDO_USER:-german}"
  echo "⚠️  Cierra y vuelve a abrir la sesión SSH para que el grupo docker tome efecto."
else
  echo "✓ Docker ya instalado: $(docker --version)"
fi

echo ""
echo "=== Instalando tmux ==="
if ! command -v tmux &>/dev/null; then
  apt-get update && apt-get install -y tmux
else
  echo "✓ tmux ya instalado: $(tmux -V)"
fi

echo ""
echo "=== Configurando SSH keepalive ==="
SSHD_CONF="/etc/ssh/sshd_config"
if ! grep -q "^ClientAliveInterval" "$SSHD_CONF"; then
  echo "" >> "$SSHD_CONF"
  echo "ClientAliveInterval 60" >> "$SSHD_CONF"
  echo "ClientAliveCountMax 10" >> "$SSHD_CONF"
  systemctl reload sshd
  echo "✓ SSH keepalive configurado (60s × 10 intentos)"
else
  echo "✓ SSH keepalive ya configurado"
fi

echo ""
echo "=== Construyendo imagen Docker del agente ==="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
docker build -t klugger-agent "$SCRIPT_DIR"

echo ""
echo "=== Setup completo ==="
echo ""
echo "Para lanzar el agente:"
echo "  export GITHUB_TOKEN=ghp_...        # PAT scoped a vilarkptl-lang/klugger"
echo "  $SCRIPT_DIR/run-agent.sh 'Tu tarea aquí'"
echo ""
echo "Auth de Claude: se monta ~/.claude del host automáticamente."
echo "No se necesita ANTHROPIC_API_KEY — usa el proxy/OAuth del servidor."
