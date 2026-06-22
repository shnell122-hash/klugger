#!/usr/bin/env bash
# Crea el virtualenv y lo activa para las sims MTProto
# Ejecutar una sola vez desde el directorio mtproto/
set -e

VENV_DIR="$(dirname "$0")/venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "[setup-venv] Creando virtualenv en $VENV_DIR"
    python3 -m venv "$VENV_DIR"
fi

echo "[setup-venv] Instalando dependencias"
"$VENV_DIR/bin/pip" install --upgrade pip -q
"$VENV_DIR/bin/pip" install -r "$(dirname "$0")/requirements.txt" -q

echo ""
echo "✅ Virtualenv listo."
echo ""
echo "Para activarlo manualmente:"
echo "  source $VENV_DIR/bin/activate"
echo ""
echo "Para autenticar cuentas (primera vez):"
echo "  $VENV_DIR/bin/python setup-sessions.py"
echo ""
echo "Para correr la suite T01-T10:"
echo "  $VENV_DIR/bin/python suite.py"
