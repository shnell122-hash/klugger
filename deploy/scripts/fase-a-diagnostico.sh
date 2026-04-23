#!/bin/bash
# FASE A — Diagnóstico del servidor (solo lectura, sin cambios)
# Ejecutar como root en 143.198.228.78
# Uso: bash fase-a-diagnostico.sh 2>&1 | tee /tmp/diagnostico-$(date +%Y%m%d-%H%M).txt

set -euo pipefail
echo "====== DIAGNÓSTICO AI-MONITOR $(date) ======"

echo ""
echo "── PM2: estado relay-master ──"
pm2 describe relay-master 2>&1 || true

echo ""
echo "── Directorio de dispatches ──"
ls -la /var/lib/ai-monitor/ 2>&1 || echo "DIRECTORIO NO EXISTE ← causa probable de crash loop"

echo ""
echo "── Últimas 80 líneas de error log (relay-master) ──"
tail -80 /var/log/ai-monitor/relay-master-error.log 2>/dev/null || echo "(no hay log o ruta incorrecta)"

echo ""
echo "── Últimas 50 líneas de stdout log (relay-master) ──"
tail -50 /var/log/ai-monitor/relay-master-out.log 2>/dev/null || echo "(no hay log o ruta incorrecta)"

echo ""
echo "── Memoria del sistema ──"
free -h
echo ""
ps aux --sort=-%mem | head -15

echo ""
echo "── Estado git del repo en producción ──"
cd /var/www/html/vilarkptl.com/ai-monitor 2>/dev/null || { echo "RUTA NO EXISTE"; exit 1; }
git log --oneline -5
git status --short

echo ""
echo "── Diferencias con HEAD (relay-master y chat-agent) ──"
git diff HEAD -- relay/master.js | head -40 || true
git diff HEAD -- relay/chat-agent.js | head -20 || true

echo ""
echo "── Proxy LLM existente en el sistema ──"
ps aux | grep -E "litellm|ollama|vllm|openrouter" | grep -v grep || echo "ninguno encontrado"
curl -s --max-time 3 http://localhost:4000/health 2>&1 || echo "nada en puerto 4000"

echo ""
echo "── Relay de DeCabeceraTax ──"
ls -la /var/www/html/vilarkptl.com/DeCabeceraTax/relay/ 2>/dev/null || echo "(ruta no existe)"

echo ""
echo "── Auditoría de usuario german ──"
id german 2>/dev/null || echo "german: no existe como usuario Linux"
wc -l /root/.ssh/authorized_keys 2>/dev/null || echo "(no hay authorized_keys)"
echo "Llaves SSH autorizadas:"
cat /root/.ssh/authorized_keys 2>/dev/null | awk '{print NR": "$NF}' || true

echo ""
echo "── PM2: todos los procesos ──"
pm2 status

echo ""
echo "====== FIN DIAGNÓSTICO ======"
