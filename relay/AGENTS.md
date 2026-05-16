# AGENTS.md — Registro de Agentes Activos
> Leer al inicio de cada sesión. Actualizar al agregar o modificar un agente. Última actualización: 2026-05-16.

**Regla fundamental:** Lee `relay/AGENT-STATUS.md` ANTES de empezar. Lee este archivo para entender roles y zonas de propiedad.

---

## Agentes activos

### coordinator
| Campo | Valor |
|-------|-------|
| **Rol** | Dispatcher central — orquesta tareas entre agentes, no escribe código |
| **Modelo** | claude-haiku-4-5-20251001 |
| **Modo** | plan-execute |
| **Inbox** | `/var/www/html/vilarkptl.com/DeCabeceraTax/relay/coordinator-inbox.md` |
| **Outbox** | `/var/www/html/vilarkptl.com/DeCabeceraTax/relay/coordinator-outbox.md` |
| **Repo** | `/var/www/html/vilarkptl.com/DeCabeceraTax` |
| **Branch** | `claude/ml-backend-69bis-module-5iap0` |
| **Archivos propios** | Solo lee y despacha — no modifica código |
| **SLA** | Debe completar en <60s (solo escribe inbox.md de otro agente) |

### ai-monitor
| Campo | Valor |
|-------|-------|
| **Rol** | Dashboard de monitoreo — frontend glassmorphism, backend Express, relay-master, deploy |
| **Modelo** | claude-haiku-4-5-20251001 (código real: claude-sonnet-4-6 si se necesita) |
| **Modo** | full-claude-code |
| **Inbox** | `/var/www/html/vilarkptl.com/ai-monitor/relay/inbox.md` |
| **Outbox** | `/var/www/html/vilarkptl.com/ai-monitor/relay/outbox.md` |
| **Repo** | `/var/www/html/vilarkptl.com/ai-monitor` |
| **Branch** | `main` |
| **Archivos propios** | `frontend/`, `backend/`, `relay/master.js`, `deploy/ecosystem.config.js` |
| **Prompt** | `relay/agents/ai-monitor.md` |

> ⚠️ **`relay/master.js` — DOMINIO EXCLUSIVO de ai-monitor.** Ningún otro agente debe modificarlo.

### fiscalai
| Campo | Valor |
|-------|-------|
| **Rol** | Backend Node.js — APIs SAT, MySQL, lógica de negocio fiscal |
| **Modelo** | claude-sonnet-4-6 |
| **Modo** | plan-execute |
| **Inbox** | `/var/www/html/vilarkptl.com/DeCabeceraTax/relay/inbox.md` |
| **Outbox** | `/var/www/html/vilarkptl.com/DeCabeceraTax/relay/outbox.md` |
| **Repo** | `/var/www/html/vilarkptl.com/DeCabeceraTax` |
| **Branch** | `claude/ml-backend-69bis-module-5iap0` |
| **Archivos propios** | `backend/`, `db/`, `routes/`, `services/` |
| **Prompt** | `relay/agents/fiscalai.md` |

### fiscalai-front
| Campo | Valor |
|-------|-------|
| **Rol** | Frontend HTML/CSS/JS vanilla — UI fiscalai.mx |
| **Modelo** | claude-sonnet-4-6 |
| **Modo** | full-claude-code |
| **Inbox** | `/var/www/html/vilarkptl.com/DeCabeceraTax/relay/inbox-front.md` |
| **Outbox** | `/var/www/html/vilarkptl.com/DeCabeceraTax/relay/outbox-front.md` |
| **Repo** | `/var/www/html/vilarkptl.com/DeCabeceraTax` |
| **Branch** | `claude/ml-backend-69bis-module-5iap0` |
| **Archivos propios** | `public/`, `views/`, archivos CSS/JS de frontend |
| **Prompt** | `relay/agents/fiscalai-front.md` |

### flujos
| Campo | Valor |
|-------|-------|
| **Rol** | Bot financiero — flujos.fiscalai.mx (financial-bot en producción) |
| **Modelo** | claude-sonnet-4-6 |
| **Modo** | full-claude-code |
| **Inbox** | `/var/www/html/vilarkptl.com/ai-monitor/relay/inbox-flujos.md` |
| **Outbox** | `/var/www/html/vilarkptl.com/ai-monitor/relay/outbox-flujos.md` |
| **Repo** | `/var/www/html/vilarkptl.com/ai-monitor` |
| **Branch** | `main` |
| **Working dir** | `financial/bot` |
| **Post-deploy** | `pm2 restart financial-bot` |
| **Archivos propios** | `financial/bot/` |

### fiscalai-test
| Campo | Valor |
|-------|-------|
| **Rol** | Entorno de testing — fiscalai.mx en branch `testing` |
| **Modelo** | claude-sonnet-4-6 |
| **Modo** | plan-execute |
| **Inbox** | `/var/www/html/vilarkptl.com/DeCabeceraTax/relay/inbox-test.md` |
| **Outbox** | `/var/www/html/vilarkptl.com/DeCabeceraTax/relay/outbox-test.md` |
| **Branch** | `testing` |
| **Prompt** | `relay/agents/fiscalai-test.md` |

### finbot-tester
| Campo | Valor |
|-------|-------|
| **Rol** | Tester automatizado de financial-bot vía Telethon/MTProto |
| **Modelo** | claude-sonnet-4-6 |
| **Modo** | full-claude-code |
| **Inbox** | `/var/www/html/vilarkptl.com/ai-monitor/relay/inbox-finbot-tester.md` |
| **Outbox** | `/var/www/html/vilarkptl.com/ai-monitor/relay/outbox-finbot-tester.md` |
| **Branch** | `main` |
| **Archivos propios** | `financial/telethon-bridge.py`, `financial/run-telethon-tests.sh`, `financial/sims/` |

### finbot-verifier
| Campo | Valor |
|-------|-------|
| **Rol** | Verificador continuo — monitorea errores en producción de financial-bot |
| **Modelo** | claude-sonnet-4-6 |
| **Modo** | full-claude-code |
| **Inbox** | `/var/www/html/vilarkptl.com/ai-monitor/relay/inbox-finbot-verifier.md` |
| **Outbox** | `/var/www/html/vilarkptl.com/ai-monitor/relay/outbox-finbot-verifier.md` |
| **Branch** | `main` |

### finbot-coordinator
| Campo | Valor |
|-------|-------|
| **Rol** | Coordinación LangGraph y diagnóstico de financial-bot |
| **Modelo** | claude-sonnet-4-6 |
| **Modo** | full-claude-code |
| **Inbox** | `/var/www/html/vilarkptl.com/ai-monitor/relay/inbox-finbot-coordinator.md` |
| **Outbox** | `/var/www/html/vilarkptl.com/ai-monitor/relay/outbox-finbot-coordinator.md` |
| **Branch** | `claude/financial-multiagent-system-YwtYQ` |
| **Post-deploy** | `pm2 restart financial-bot` |
| **Archivos propios** | `financial/bot/graph/`, `financial/bot/agents/` |

---

## Zonas de propiedad — NO modificar sin coordinar

| Archivo/Directorio | Agente responsable | Qué hacer si necesitas tocarlo |
|-------------------|-------------------|--------------------------------|
| `relay/master.js` | **ai-monitor** | Despachar tarea a ai-monitor via inbox |
| `relay/projects.json` | ai-monitor (coordinado) | Proponer cambio en inbox de coordinator |
| `relay/chat-agent.js` | ai-monitor | Despachar a ai-monitor |
| `financial/bot/` | flujos + finbot-coordinator | Coordinar con ambos antes de modificar |
| `financial/bot/agents/` | finbot-coordinator | Preguntar a finbot-coordinator |
| `financial/telethon-bridge.py` | finbot-tester | |
| `frontend/`, `backend/` | ai-monitor | |

---

## Protocolo inter-agente

### Despachar tarea a otro agente
```bash
# 1. Escribir en inbox del destino
cat >> relay/inbox-[destino].md << 'EOF'
# TAREA: [descripción]
[cuerpo de la tarea]
EOF

# 2. Commit y push a main
git add relay/inbox-[destino].md
git commit -m "dispatch: [origen]→[destino] [descripción corta]"
git push origin main
# relay-master detecta en ~15s
```

### Agregar nuevo agente
1. Editar `relay/projects.json` — nueva entrada con todos los campos
2. Crear `relay/agents/[id].md` — prompt del agente
3. Crear `relay/inbox-[id].md` y `relay/outbox-[id].md`
4. Clonar workspace en servidor: `cd relay/workspaces && git clone <repo> [id]`
5. Registrar en MySQL: `INSERT INTO projects ...`
6. Commit + push a main
7. relay-master detecta cambio en projects.json en el siguiente ciclo (15s)
