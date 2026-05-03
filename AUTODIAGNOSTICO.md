# Autodiagnóstico del Sistema — ia.vilarkptl.com
_Generado 2026-05-03 por Claude Code (sesión claude/agent-monitoring-dashboard-4v8iq)_

---

## Resumen ejecutivo

El sistema funciona pero opera cerca de sus límites de recursos y tiene varios puntos de fragilidad que han causado pérdidas económicas reales ($250+ en créditos Anthropic) y degradación de servicios. Las mejoras prioritarias están identificadas abajo.

---

## Estado actual de procesos

| Proceso | Restarts | Estado | Problema |
|---------|----------|--------|---------|
| `ai-monitor` | 43 | ✅ online | Branch divergence frecuente |
| `relay-master` | 154 | ✅ online | Kill-switch ahora activo |
| `claude-chat-bot` | 14 | ✅ online | OK |
| `cursor-worker` | 0 | ✅ online | OK |
| `financial-bot` | 136k+ | ✅ online | Crash loop histórico |
| `conversation-engine` | 6 | ✅ online | OK |
| `kptl-credito` | 4011 | ⚠️ online | Inestable |
| `kptl-credito-worker` | 213 | ⚠️ online | Depende de kptl-credito |
| `vilar-legal-os-v59` | 146k+ | 🔴 online | **Crash loop crítico** |
| `vilar-legal-os-v58` | 53 | ⚠️ online | Inestable |

**RAM:** ~50% usada (1.9 GB / 3.8 GB total)
**Swap:** 70-73% — próximo a saturación (límite real ~94%)

---

## Problemas identificados

### 🔴 CRÍTICO

**1. vilar-legal-os-v59 — 146,000+ reinicios**
- Causa: crash loop no diagnosticado. PM2 lo reinicia automáticamente cada vez que falla.
- Impacto: consume CPU en reinicio constante, contamina logs, oculta errores reales.
- Fix: `pm2 logs vilar-legal-os-v59 --lines 50` para ver el error. Probablemente un `require()` que falla o un puerto ocupado.

**2. Directorio git compartido entre procesos PM2**
- Todos los procesos apuntan a `/var/www/html/vilarkptl.com/ai-monitor/` como working directory.
- Cuando un agente hace `git reset --hard` para un proceso (ej: `conversation-engine`), sobreescribe los archivos de TODOS los demás procesos incluyendo `ai-monitor`.
- Impacto observado: el redesign del dashboard se revirtió 3+ veces en esta sesión.
- Fix: cada proceso debería tener su propio directorio de trabajo.

**3. Kill-switch diario no existía hasta hoy**
- Pérdida documentada: $250 en créditos en una sola noche por finbot-verifier en loop.
- El kill-switch de $7/día y $100/proyecto/mes ya está implementado (migrate-v12).
- Pendiente: verificar que relay-master lo respeta correctamente en producción.

### 🟠 ALTO

**4. /detente no mata procesos activos**
- El comando marca `journal.state = 'stopped'` pero el proceso Claude CLI continúa ejecutándose hasta timeout (25 min).
- No hay forma de parada inmediata desde Telegram sin usar bash.
- Fix recomendado: agregar `SIGTERM` al proceso CLI activo cuando se recibe `/detente`.

**5. Swap al 70-73% — riesgo de OOM**
- Con 19 procesos activos y swap casi lleno, un pico de memoria causaría que el kernel mate procesos aleatoriamente.
- Fix inmediato:
  ```bash
  fallocate -l 1G /swapfile2 && chmod 600 /swapfile2 && mkswap /swapfile2 && swapon /swapfile2
  ```

**6. Branch chaos — código fragmentado en 3 branches sin merge a main**
- `main` no tiene: redesign, auth/login, LiteLLM, kill-switch, multi-account tracking.
- Producción corre features de branches que se revierten con cada gitPull.
- Fix: merge PRs #21 y onboard-ai-monitor → main esta semana.

**7. Login con pattern HTML que rechaza caracteres especiales**
- El campo de contraseña tiene un atributo `pattern` que no permite `:` ni otros caracteres.
- Contraseña "romanos12:2" falla la validación del browser antes de llegar al servidor.
- Fix: eliminar el atributo `pattern` del input de contraseña en el login HTML.

**8. financial-bot — 136,000+ reinicios**
- Crash loop histórico. El proceso actual está estable pero el contador es acumulado.
- Indica que en algún momento estuvo en crash loop severo.
- Fix: `pm2 reset financial-bot` para limpiar el contador después de confirmar estabilidad.

### 🟡 MEDIO

**9. Solo 1 de 3 cuentas Anthropic monitoreadas**
- `gva.server@gmail.com` y `leasingagata@gmail.com` no tienen Admin API keys configuradas.
- No hay visibilidad del gasto en esas cuentas.

**10. MySQL password inconsistente**
- `VilarRoot2026!` no funciona para el usuario `root`.
- La contraseña correcta está en `backend/.env` como `DB_PASS`.
- Documentar la contraseña correcta en `/opt/kptl-secrets/server-credentials.txt`.

**11. Sin ambiente de staging**
- Todo deploy va directo a producción.
- Un error en una migración SQL (como el de esta sesión con `IF NOT EXISTS`) afecta producción directamente.

**12. relay-master en modo cluster con una sola instancia**
- `ai-monitor` corre en modo `cluster` (según pm2 status) pero debería ser `fork` para un proceso único.
- En modo cluster, PM2 usa el cluster module de Node — innecesario para este caso.

### 🟢 BAJO

**13. 86 actualizaciones de sistema pendientes (28 de seguridad)**
- El servidor no se ha actualizado. Hay vulnerabilidades conocidas.
- Fix: `apt update && apt upgrade -y` en ventana de mantenimiento.

**14. Restart del sistema pendiente**
- El sistema muestra `*** System restart required ***` desde hace días.
- Reiniciar en horario de bajo tráfico para aplicar actualizaciones de kernel.

**15. Logs sin rotación configurada**
- PM2 escribe logs a `/var/log/ai-monitor/` sin rotación.
- Con 146k+ reinicios de vilar-legal-os-v59, esos logs pueden estar en GB.
- Fix: `pm2 install pm2-logrotate`

---

## Plan de acción — prioridades

### Esta semana (urgente)
```bash
# 1. Agregar swap ahora
fallocate -l 1G /swapfile2 && chmod 600 /swapfile2 && mkswap /swapfile2 && swapon /swapfile2

# 2. Diagnosticar vilar-legal-os-v59
pm2 logs vilar-legal-os-v59 --lines 100 --nostream

# 3. Configurar log rotation
pm2 install pm2-logrotate

# 4. Ver tamaño real de logs
du -sh /var/log/ai-monitor/ /root/.pm2/logs/
```

### Próximas 2 semanas
1. **Merge branches a main** — PR #21 + auth + LiteLLM → producción estable
2. **Directorio separado por proceso** — mover `conversation-engine` a su propio repo clone
3. **Fix /detente** — agregar kill real al proceso CLI activo
4. **Configurar Admin API keys** para gva.server y leasingagata

### Este mes
1. **Ambiente staging** — clonar stack en puerto diferente (3011) para pruebas
2. **Actualizar servidor** — apt upgrade + kernel restart
3. **Monitoreo de swap** — alerta en Telegram cuando swap > 80%

---

## Comandos de control rápido

```bash
# PARAR relay inmediatamente (servidor)
pm2 stop relay-master

# REANUDAR
pm2 restart relay-master

# Ver qué está consumiendo RAM
pm2 monit

# Ver errores de un proceso
pm2 logs vilar-legal-os-v59 --lines 50 --nostream
pm2 logs financial-bot --lines 50 --nostream

# Estado del kill-switch
curl -s http://localhost:3010/api/platform/kill-check | python3 -m json.tool

# Gasto actual por proyecto
curl -s http://localhost:3010/api/apiAdmin/spendingSummary | python3 -m json.tool

# Resetear contador de reinicios (solo cosmético)
pm2 reset financial-bot

# Ver swap
free -h
```

---

## Cómo parar relay-master desde Telegram

**Método 1 — Chat Claude bot** (texto libre):
> "Para el relay master con pm2 stop relay-master"

El chat-bot tiene acceso a bash y lo ejecuta directamente.

**Método 2 — Bot relay-master** (comando):
> `/detente`

⚠️ Solo detiene nuevas tareas, no mata el proceso CLI activo. El proceso actual termina en hasta 25 min.

**Método 3 — Servidor:**
```bash
pm2 stop relay-master    # detener
pm2 restart relay-master # reanudar
```

**Para parada de emergencia TOTAL** (incluye matar procesos Claude activos):
```bash
pm2 stop relay-master && pkill -f "claude-code\|claude --model"
```

---

_Actualizado: 2026-05-03 | Próxima revisión recomendada: 2026-05-10_
