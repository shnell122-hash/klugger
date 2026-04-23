#!/bin/bash
set -e

REPO="/var/www/html/vilarkptl.com/ai-monitor"

echo "=== FASE 2: Mantenimiento del servidor KPTL ==="
echo ""

# ─── PASO 1: Limpiar duplicados en relay/.env ──────────────────────────────
echo "[1/3] Limpiando duplicados en relay/.env..."
ENV_FILE="$REPO/relay/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "    ⚠️  $ENV_FILE no existe — saltando"
else
  # Contar líneas antes
  BEFORE=$(wc -l < "$ENV_FILE")

  # Conservar comentarios y líneas vacías; para KEY=VALUE, solo la ÚLTIMA ocurrencia
  # (la más reciente, asumiendo que se agrega al final)
  TMP=$(mktemp)
  awk -F= '
    /^[[:space:]]*#/ { print; next }
    /^[[:space:]]*$/ { print; next }
    {
      key = $1
      lines[key] = $0
      order[key] = NR
    }
    END {
      n = asorti(order, sorted, "@val_num_asc")
      for (i = 1; i <= n; i++) {
        print lines[sorted[i]]
      }
    }
  ' "$ENV_FILE" > "$TMP"

  AFTER=$(wc -l < "$TMP")
  REMOVED=$((BEFORE - AFTER))

  if [ "$REMOVED" -gt 0 ]; then
    cp "$ENV_FILE" "${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"
    mv "$TMP" "$ENV_FILE"
    echo "    ✅ $REMOVED línea(s) duplicada(s) eliminadas (backup en ${ENV_FILE}.bak.*)"
  else
    rm -f "$TMP"
    echo "    ℹ️  No se encontraron duplicados"
  fi
fi
echo ""

# ─── PASO 2: git prune + git gc ────────────────────────────────────────────
echo "[2/3] Ejecutando git prune y git gc en el repo..."
cd "$REPO"
git prune
git gc --quiet
echo "    ✅ git prune y git gc completados"
echo ""

# ─── PASO 3: Reiniciar relay-master ────────────────────────────────────────
echo "[3/3] Reiniciando relay-master..."
pm2 restart relay-master
echo "    ✅ relay-master reiniciado"
echo ""

# ─── RESUMEN ───────────────────────────────────────────────────────────────
echo "════════════════════════════════════════"
echo "✅ FASE 2 COMPLETADA"
echo ""
pm2 show relay-master | grep -E "status|restart|uptime" || true
echo "════════════════════════════════════════"
