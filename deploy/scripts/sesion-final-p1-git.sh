#!/bin/bash
# SESIÓN FINAL — Prioridad 1: Limpiar git + Prioridad 4: Seguridad infraestructura
# Ejecutar como root en /var/www/html/vilarkptl.com/ai-monitor
set -e

REPO="/var/www/html/vilarkptl.com/ai-monitor"
cd "$REPO"

echo "=== PRIORIDAD 1: Limpiar git ==="
echo ""

echo "[1] Estado actual..."
git status 2>&1 | head -20
echo ""

echo "[2] Abortando rebase/merge pendiente si existe..."
git rebase --abort 2>/dev/null && echo "  ✅ rebase abortado" || echo "  ℹ️  No había rebase en curso"
git merge --abort  2>/dev/null && echo "  ✅ merge abortado"  || true
echo ""

echo "[3] Moviendo archivos no trackeados que bloquean..."
mkdir -p /tmp/kptl-backup-git
for d in dashboard-financial financial .claude/plans; do
  if [ -e "$d" ]; then
    mv "$d" /tmp/kptl-backup-git/ 2>/dev/null && echo "  📦 $d → /tmp/kptl-backup-git/" || true
  fi
done
echo ""

echo "[4] Checkout main + pull..."
git checkout main 2>&1 | tail -3
git pull --rebase origin main 2>&1 | tail -5
echo ""

echo "[5] Restaurar archivos movidos..."
for d in dashboard-financial financial; do
  [ -e "/tmp/kptl-backup-git/$d" ] && mv "/tmp/kptl-backup-git/$d" . && echo "  ✅ $d restaurado" || true
done
echo ""

echo "[6] Estado final git..."
git branch
git status
echo ""

echo "════════════════════════════════════════"
echo "✅ PRIORIDAD 1 COMPLETADA"
echo "════════════════════════════════════════"
