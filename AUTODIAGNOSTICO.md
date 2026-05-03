# Autodiagnóstico del Sistema — ia.vilarkptl.com
_Generado 2026-05-03 por Claude Code (sesión `claude/agent-monitoring-dashboard-4v8iq`)_
_Actualizado con stack completo, costos históricos y recomendaciones priorizadas_

---

## Índice
1. [Stack técnico](#stack-técnico)
2. [Árbol de agentes](#árbol-de-agentes)
3. [Estado de procesos](#estado-de-procesos)
4. [Costos históricos del sistema](#costos-históricos-del-sistema)
5. [Costos ocultos](#costos-ocultos)
6. [Ventajas del sistema](#ventajas-del-sistema)
7. [Debilidades](#debilidades)
8. [Recomendaciones priorizadas](#recomendaciones-priorizadas)
9. [Control de emergencia](#control-de-emergencia)

---

## Stack técnico

### Infraestructura
| Componente | Tecnología | Versión | Notas |
|------------|-----------|---------|-------|
| Servidor | DigitalOcean Droplet | Ubuntu 22.04 LTS | 143.198.228.78 — 2 vCPU, 3.8 GB RAM |
| Runtime | Node.js (via NVM) | v22.17.0 | Todos los procesos backend |
| Gestor de procesos | PM2 | — | 19 procesos activos |
| Base de datos | MySQL / MariaDB | 5.7.x | DB: `ai_monitoring` |
| Web server | Apache2 | — | `mod_proxy` + `mod_proxy_wstunnel` para WebSocket |
| Proxy reverso | Apache → localhost:3010 | — | ia.vilarkptl.com → ai-monitor |

### Backend
| Componente | Tecnología | Notas |
|------------|-----------|-------|
| API / Dashboard | Express.js + Socket.io | Puerto 3010 |
| Orquestador de agentes | Node.js custom (`relay/master.js`) | PM2: relay-master |
| Bot Telegram directo | Grammy + Anthropic SDK (`chat-agent.js`) | PM2: claude-chat-bot |
| Revisor de código | DeepSeek V3 API (`code-reviewer.js`) | PM2: code-reviewer, $0.001/audit |
| Proxy LLM | LiteLLM (Python) | Puerto 4000, chains de fallback |
| Worker Cursor | Node.js bridge (`cursor-worker.js`) | PM2: cursor-worker |

### Frontend
| Componente | Tecnología | Notas |
|------------|-----------|-------|
| Dashboard | HTML / CSS / JS vanilla | Glassmorphism light + dark toggle |
| Charts | Chart.js | Donut, bar, line, stacked |
| WebSocket | Socket.io client | Actualizaciones en tiempo real |
| Auth | bcrypt hash en .env | Login con contraseña única |

### APIs externas
| Proveedor | Uso | Modelos / Servicios | Costo aprox. |
|-----------|-----|---------------------|-------------|
| **Anthropic** | Agentes principales | claude-sonnet-4-6, claude-haiku-4-5 | $3/$15 por M tokens |
| **DeepSeek** | Planning, memory summaries, code review | deepseek-chat (V3), deepseek-reasoner (R1) | $0.27/$1.10 por M tokens |
| **OpenAI** | Fallback via LiteLLM | gpt-4o, gpt-4o-mini | $2.50/$10 por M tokens |
| **FAL.ai** | Generación de imágenes | — | Variable por imagen |
| **ElevenLabs** | Síntesis de voz | — | Por caracteres |
| **Telegram** | Bot notifications + control | Bot API | Gratis |

### LiteLLM — Cadenas de fallback
```
kptl-chat:       Sonnet 4.6 → DeepSeek V3 → GPT-4o
kptl-chat-fast:  Haiku 4.5  → GPT-4o-mini → Gemini
kptl-reasoning:  DeepSeek R1 → Opus 4.x
```

---

## Árbol de agentes

```
Usuario / Telegram
       │
       ├──▶ claude-chat-bot (chat-agent.js)
       │         Grammy + Anthropic SDK — interfaz conversacional directa
       │         Herramientas: bash, leer/escribir archivos, despachar tareas
       │
       └──▶ relay-master (master.js)  ◄── polling cada 15s por proyecto
                 │
                 ├──▶ coordinator (claude-haiku-4-5)
                 │         Orquesta, descompone tareas complejas en sub-tareas
                 │         No escribe código — solo gestiona dispatches
                 │
                 ├──▶ fiscalai (claude-sonnet-4-6)
                 │         Backend Node.js + SAT APIs + MySQL
                 │         Repo: DeCabeceraTax | fiscalai.mx
                 │
                 ├──▶ fiscalai-front (claude-sonnet-4-6)
                 │         Frontend HTML/CSS/JS vanilla
                 │         Páginas fiscales, formularios, UX
                 │
                 ├──▶ ai-monitor (claude-haiku-4-5)
                 │         Este mismo dashboard
                 │         Backend Express + Socket.io
                 │
                 ├──▶ financial-bot (claude-sonnet-4-6)
                 │         Bot de operaciones bancarias en Telegram
                 │         CLABE, saldo, transferencias
                 │
                 └──▶ (proyectos adicionales vía projects.json)

Procesos auxiliares (no manejados por relay-master):
  ├── code-reviewer    — DeepSeek V3, audita commits cada 5 min
  ├── cursor-worker    — Cursor Cloud Agents (self-hosted)
  ├── cost-monitor     — Monitoreo de costos en tiempo real
  ├── conversation-engine — Simulaciones financieras (testing)
  ├── kptl-credito     — Webhook crédito
  └── vilar-legal-os-v59 — Agente legal (en crash loop)
```

### Flujo de una tarea
```
1. Usuario escribe en Telegram: "/tarea fiscalai Corrige el login SAT"
2. relay-master recibe → coordinator descompone el plan
3. coordinator escribe inbox.md en el repo de fiscalai
4. relay-master detecta cambio en inbox.md (polling 15s)
5. Spawns: claude --model claude-sonnet-4-6 (proceso hijo)
6. Claude Code edita archivos, commit, push
7. Outbox.md con resultados → relay-master lo parsea
8. Telegram recibe resumen + screenshots automáticos
```

---

## Estado de procesos

| Proceso | Restarts | RAM est. | Estado | Diagnóstico |
|---------|----------|----------|--------|------------|
| `ai-monitor` | 43 | ~120 MB | ✅ | Branch divergence frecuente |
| `relay-master` | 154 | ~180 MB | ✅ | Kill-switch activo desde hoy |
| `claude-chat-bot` | 14 | ~80 MB | ✅ | Estable |
| `cursor-worker` | 0 | ~60 MB | ✅ | Estable |
| `code-reviewer` | 4 | ~40 MB | ✅ | Estable |
| `conversation-engine` | 6 | ~80 MB | ✅ | Estable |
| `financial-bot` | 136k+ | ~120 MB | ✅ | Estable hoy; contador histórico |
| `kptl-credito` | 4011 | ~80 MB | ⚠️ | Inestable — SyntaxError recurrente |
| `kptl-credito-worker` | 213 | ~60 MB | ⚠️ | Dependiente de kptl-credito |
| `vilar-legal-os-v59` | 146k+ | ~40 MB | 🔴 | **Crash loop** — nunca estable |
| `vilar-legal-os-v58` | 53 | ~40 MB | ⚠️ | Semi-estable |
| `sat-api` | 93 | ~80 MB | ⚠️ | Moderado |
| `litellm` | — | ~357 MB | ✅ | Mayor consumidor de RAM |

**RAM total estimada:** ~1.8 GB de 3.8 GB
**Swap actual:** 70-73% — riesgo moderado-alto

---

## Costos históricos del sistema

> Los costos reales de Anthropic se ven en ia.vilarkptl.com → Tab "Plataforma" → Cuentas Anthropic.
> Los estimados están en Tab "API Admin" → Gasto histórico total.

### Cuentas Anthropic activas
| Cuenta | Admin Key | Estado |
|--------|-----------|--------|
| vilarkptl@gmail.com | `ANTHROPIC_ADMIN_KEY` | ✅ Configurada |
| gva.server@gmail.com | `ANTHROPIC_ADMIN_KEY_GVA` | ❌ Pendiente |
| leasingagata@gmail.com | `ANTHROPIC_ADMIN_KEY_LEASINGAGATA` | ❌ Pendiente |

### Incidentes de costo documentados
| Fecha | Cuenta | Gasto visible | Causa | Estado |
|-------|--------|--------------|-------|--------|
| 2026-05-01 | vilarkptl | ~$4 | Actividad normal agentes | Normal |
| 2026-05-02 | vilarkptl | ~$5 | Actividad normal agentes | Normal |
| 2026-05-03 | vilarkptl | **~$28-30** | Finbot-verifier loop + agentes simultáneos | Kill-switch activo |
| **Total Mayo** | vilarkptl | **$34.15** | Ver platform.claude.com → Cost | Créditos: $98.04 |

> Nota: El usuario recargó $250 y luego $100 en créditos. El gasto real visible en la consola
> es $34.15. El spike del 3 de mayo (~$28) es el que motivó el kill-switch de $7/día.

### Límites configurados (desde hoy, migrate-v12)
| Nivel | Límite | Acción |
|-------|--------|--------|
| Total diario | $7 USD | Pausa todo el relay |
| Por proveedor/día | Anthropic $6, OpenAI $2, DeepSeek $1 | Pausa proveedor |
| Por proyecto/mes | $100 USD | Pausa ese proyecto |

### Costo estimado mensual si el sistema opera normal
| Servicio | Uso esperado | Costo/mes est. |
|---------|-------------|----------------|
| Anthropic (Sonnet 4.6) | ~500k tokens/día | $15-25 |
| Anthropic (Haiku 4.5) | ~200k tokens/día | $2-4 |
| DeepSeek V3 | planning + reviews | $3-8 |
| OpenAI (fallback) | occasional | $2-5 |
| DigitalOcean | Droplet 4GB | $24 |
| **Total estimado** | — | **$46-66/mes** |

---

## Costos ocultos

Estos no aparecen en ningún dashboard pero son reales:

### 1. Tiempo de ingeniería perdido en incidentes
- ~8h diagnosticando crash loops y branch divergence en esta semana
- Costo si se valoriza a $50/h: **~$400 en tiempo**
- Causa raíz: arquitectura de directorio compartido + branches sin merge

### 2. Tokens quemados en loops sin resultado
- finbot-verifier ejecutó 40-44 iteraciones el 3 de mayo
- Las últimas iteraciones fallaron por "Credit balance too low" — pero las anteriores sí consumieron tokens
- El spike de ~$28 en un solo día (vs ~$4-5 días normales) indica un ciclo de trabajo ineficiente
- Los tokens gastados en iteraciones fallidas no producen valor = **desperdicio puro**

### 3. Swap como "RAM prestada"
- 70-73% de swap = el sistema está pidiendo prestada RAM al disco
- El disco es SSD pero sigue siendo 10-100x más lento que RAM
- Procesos en swap corren MÁS LENTO → agentes tardan más → más tokens por tarea → más costo

### 4. 146,000+ reinicios de vilar-legal-os-v59
- Cada reinicio: Node.js startup (~200ms CPU + disk I/O)
- 146,000 × 200ms = **~8 horas de CPU gastadas solo en reinicios**
- Más el swap pressure que genera cada proceso nuevo

### 5. DeepSeek sin prompt caching
- El sistema de relay usa prompt caching para Anthropic pero NO para DeepSeek
- Cada llamada re-envía el system prompt completo
- Ahorro potencial con caching: 40-60% en costos DeepSeek

### 6. Modelos premium donde no es necesario
- coordinator y ai-monitor usan Haiku (correcto)
- Pero el coordinator despachó tareas a Sonnet para cosas que Haiku puede resolver
- Estimado: 20-30% de llamadas a Sonnet podrían ser Haiku

### 7. Sin staged rollouts
- Un error de código en producción afecta a todos los usuarios inmediatamente
- El costo de un bug en prod es 10x mayor que en staging

---

## Ventajas del sistema

### Arquitectura
- **Multi-agente real funcionando**: coordinación automática entre 5+ agentes especializados
- **Self-hosting**: control total sobre datos, sin dependencia de plataformas third-party
- **Fallback chains via LiteLLM**: si Anthropic falla, el sistema continúa con DeepSeek/OpenAI
- **Prompt caching activo**: ahorra ~60% en tokens de contexto en llamadas a Anthropic
- **Outbox watchdog**: detecta agentes atascados y los termina automáticamente
- **Kill-switch económico**: pausa automática si el gasto supera umbral (nuevo)
- **Dashboard en tiempo real**: visibilidad completa vía Socket.io

### Operacional
- **Control por Telegram**: despachar, monitorear y parar agentes desde el celular
- **Screenshots automáticos**: verificación visual de cambios frontend sin intervención manual
- **Code reviewer automático**: DeepSeek V3 audita cada commit silenciosamente
- **Cross-agent state sharing**: AGENT-STATUS.md previene que agentes se pisen entre sí
- **Memoria persistente por proyecto**: los agentes recuerdan contexto entre sesiones
- **Deploy vía git**: los agentes hacen commit + push, el servidor hace pull automático

### Económico
- **DeepSeek V3 para planning**: 10x más barato que Sonnet para razonamiento
- **Haiku para coordinator**: 25x más barato que Sonnet para orquestación
- **Self-hosted LiteLLM**: sin markup de proveedores intermediarios

---

## Debilidades

### Debilidad #1 — Directorio git compartido (CRÍTICA)
Todos los procesos PM2 apuntan al mismo `/var/www/html/vilarkptl.com/ai-monitor/`. Cuando un agente hace `git reset --hard` para actualizar su código, sobreescribe los archivos de TODOS los demás procesos. Esto causó que el redesign del dashboard se revirtiera 3+ veces.

### Debilidad #2 — Sin límite de gasto hasta hoy (CRÍTICA)
El sistema podía gastar ilimitadamente. Dos incidentes de >$100 USD en loops en 2 semanas. Resuelto parcialmente con migrate-v12, pero falta integrar el kill-switch de proyecto en relay-master.

### Debilidad #3 — /detente no es instantáneo
El comando para emergencias no mata el proceso activo. Un agente en loop puede continuar 25 minutos más después de `/detente`. No hay forma de parada real desde Telegram sin acceso al servidor.

### Debilidad #4 — Branches desincronizadas con producción
`main` no tiene auth, no tiene LiteLLM, no tiene kill-switch, no tiene redesign. El servidor corre un mix de branches que se revierten con cada gitPull automático. Requiere coordinar merges manualmente.

### Debilidad #5 — Un solo servidor, sin redundancia
Si el droplet de DigitalOcean cae, todo el sistema cae. No hay failover, no hay backups automáticos de la base de datos, no hay health checks externos.

### Debilidad #6 — Swap saturado
Con 19 procesos activos y 3.8 GB de RAM, el sistema opera crónicamente con swap. Un pico de memoria mata procesos aleatoriamente (OOM killer). vilar-legal-os-v59 en crash loop agrava esto.

### Debilidad #7 — Sin staging
Todo cambio va directo a producción. Un error de migración SQL (como el de esta sesión) afecta producción inmediatamente. Un bug en server.js tumba el dashboard.

### Debilidad #8 — Logs sin rotación
Con 146k+ reinicios de vilar-legal-os-v59, los logs pueden estar en gigabytes. Sin rotación configurada, el disco puede llenarse silenciosamente hasta que el sistema falla.

### Debilidad #9 — Seguridad de credenciales mixta
- Contraseña MySQL en texto plano en `backend/.env`
- Admin API keys de Anthropic en `relay/.env`
- Hash de login en `/opt/kptl-secrets/api-keys.env`
- Sin rotación de credenciales configurada
- 28 vulnerabilidades de seguridad del OS sin parchear

### Debilidad #10 — Dependencia de Anthropic sin cap por proyecto en relay-master
El `GLOBAL_KILLED` flag existe pero el relay-master no consulta los flags de `project_killed_*` todavía. Los límites por proyecto están en la base de datos pero no se aplican al despacho de tareas.

---

## Recomendaciones priorizadas

### 🔴 Hacer HOY

**R1 — Agregar swap ahora**
```bash
fallocate -l 1G /swapfile2 && chmod 600 /swapfile2 && mkswap /swapfile2 && swapon /swapfile2
echo '/swapfile2 none swap sw 0 0' >> /etc/fstab
```

**R2 — Diagnosticar y detener vilar-legal-os-v59**
```bash
pm2 logs vilar-legal-os-v59 --lines 30 --nostream
# Si el error es irreparable:
pm2 stop vilar-legal-os-v59 && pm2 delete vilar-legal-os-v59
```

**R3 — Configurar log rotation**
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
```

### 🟠 Esta semana

**R4 — Merge de branches a main**
1. Merge PR `claude/agent-monitoring-dashboard-4v8iq` → main (redesign + kill-switch)
2. Merge `claude/onboard-ai-monitor-subproject-zXvki` → main (auth + LiteLLM)
3. En servidor: `git reset --hard origin/main && pm2 restart ai-monitor`

**R5 — Fix /detente para parada inmediata**
En `relay/master.js`, cuando se recibe `/detente`, también hacer:
```js
// Después de marcar journals como stopped:
for (const [pid, info] of ACTIVE_PIDS.entries()) {
  if (info.kill) info.kill('SIGTERM');
}
GLOBAL_KILLED = true;
```

**R6 — Integrar project_killed en relay-master**
Antes de `processProject()`, consultar:
```js
const [[killed]] = await db.query("SELECT value FROM system_state WHERE key=?", [`project_killed_${projectId}`]);
if (killed?.value === '1') return; // skip
```

**R7 — Fix login — quitar pattern restrictivo**
```bash
grep -r "pattern" /var/www/html/vilarkptl.com/ai-monitor/frontend/
# Editar el archivo y eliminar el atributo pattern del input de contraseña
```

### 🟡 Próximo mes

**R8 — Repositorios separados por proceso**
Cada proceso PM2 debería tener su propio clone del repo en un directorio separado:
```
/var/www/ai-monitor/     ← ai-monitor exclusivo
/var/www/conversation/   ← conversation-engine exclusivo
/var/www/relay/          ← relay-master exclusivo
```

**R9 — Backup automático de MySQL**
```bash
# Cron diario a las 3am
0 3 * * * mysqldump -u root -p"$DB_PASS" ai_monitoring | gzip > /var/backups/ai_monitoring_$(date +%Y%m%d).sql.gz
# Retener 30 días
find /var/backups/ -name "ai_monitoring_*.sql.gz" -mtime +30 -delete
```

**R10 — Admin API keys de las 3 cuentas**
Obtener en console.anthropic.com → Settings → API Keys para:
- gva.server@gmail.com → `ANTHROPIC_ADMIN_KEY_GVA`
- leasingagata@gmail.com → `ANTHROPIC_ADMIN_KEY_LEASINGAGATA`

**R11 — Alerta de swap por Telegram**
Agregar a relay-master: si swap > 80%, enviar alerta a Telegram cada hora.

**R12 — Actualizar el servidor**
```bash
apt update && apt upgrade -y
# Programar restart en ventana de bajo tráfico (ej: lunes 3am)
```

### 🟢 Largo plazo (1-3 meses)

**R13 — Ambiente de staging**
Clonar el stack en puerto 3011 para pruebas antes de producción.

**R14 — Health check externo**
Configurar UptimeRobot o similar para alertar si ia.vilarkptl.com no responde.

**R15 — Rotación de credenciales**
Implementar rotación automática de API keys cada 90 días.

**R16 — Migrar a servidor con más RAM**
Con 19 procesos activos, un droplet de 8 GB ($48/mes) eliminaría el problema de swap permanentemente y daría headroom para crecer.

---

## Control de emergencia

### Parar relay-master
```bash
# Desde servidor (inmediato):
pm2 stop relay-master

# Desde Telegram — decirle al chat-bot Claude:
"Para el relay master con pm2 stop relay-master"

# Desde Telegram — bot relay-master:
/detente
# ⚠️ Solo detiene nuevas tareas. Procesos activos continúan hasta 25 min.
```

### Reanudar relay-master
```bash
pm2 restart relay-master

# O desde Telegram — bot relay-master:
/activar
```

### Kill de emergencia total (mata procesos Claude activos)
```bash
pm2 stop relay-master && pkill -f "claude-code\|claude --model"
```

### Consultar gasto actual (desde servidor)
```bash
curl -s http://localhost:3010/api/apiAdmin/spendingSummary | python3 -m json.tool
```

### Reset kill-switch si fue activado por error
```bash
curl -s -X POST http://localhost:3010/api/platform/resume
curl -s -X POST http://localhost:3010/api/apiAdmin/resume
```

---

## Comandos de diagnóstico rápido

```bash
# Ver estado de memoria
free -h && pm2 list

# Ver qué proceso consume más RAM
pm2 monit

# Ver errores de proceso en crash
pm2 logs vilar-legal-os-v59 --lines 30 --nostream
pm2 logs financial-bot --lines 30 --nostream

# Tamaño de logs
du -sh /root/.pm2/logs/ /var/log/ai-monitor/

# Gasto de hoy
curl -s http://localhost:3010/api/platform/kill-check | python3 -m json.tool

# Estado de proyectos vs presupuesto $100/mes
curl -s http://localhost:3010/api/apiAdmin/projectBudgets | python3 -m json.tool

# Resetear contador de reinicios (cosmético, no afecta el proceso)
pm2 reset financial-bot
pm2 reset vilar-legal-os-v59
```

---

_Próxima revisión recomendada: 2026-05-10_
_Link permanente: https://github.com/vilarkptl-lang/agentic-repo/blob/claude/agent-monitoring-dashboard-4v8iq/AUTODIAGNOSTICO.md_
