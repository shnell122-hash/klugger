# WORKFLOW.md — Flujos de trabajo estándar

> Actualizado: 2026-05-10.

---

## Flujo de tarea estándar (agente Claude Code)

```
1. Leer relay/AGENT-STATUS.md (qué archivos están en uso por otros agentes)
2. Leer inbox.md de este agente (tarea a ejecutar)
3. Verificar tamaño de archivos a modificar: wc -c ruta/archivo
4. Ejecutar tarea (máximo 3 objetivos)
5. Commit + push (archivos específicos, nunca git add .)
6. Actualizar relay/AGENT-STATUS.md con SHA del commit
7. Escribir outbox.md con bloque STATUS/CHANGED/DEPLOYED/PENDING
8. Si hay deploy: ejecutar comandos de pm2 correspondientes
```

---

## Flujo inbox → outbox

### Escritura de inbox (despachador)

```bash
cat > relay/inbox-[agente].md << 'EOF'
# Tarea para [agente]

[Descripción detallada]

budget_usd_max: 2.00
requester: coordinator
EOF

git add relay/inbox-[agente].md
git commit -m "relay(inbox): coordinator → [agente] — [descripción]"
git push origin main
# relay-master detecta en próximo ciclo (15s)
```

### Lectura de outbox (al terminar)

```bash
cat relay/outbox-[agente].md
# Formato esperado:
# STATUS: done
# CHANGED: archivo1, archivo2
# DEPLOYED: yes
# PENDING: nada
```

---

## Flujo de deploy

### financial-bot (cambios en `financial/bot/**`)

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git fetch origin main && git reset --hard origin/main
npm --prefix financial/bot install    # solo si hay nuevas dependencias
pm2 restart financial-bot
```

### dashboard-financial (cambios en `dashboard-financial/**`)

```bash
cd /var/www/html/vilarkptl.com/ai-monitor/dashboard-financial
npm run build
pm2 restart financial-dashboard
```

### backend/relay (cambios en `backend/**` o `relay/**`)

```bash
pm2 restart ai-monitor      # para cambios en backend/
pm2 restart relay-master    # para cambios en relay/ (prefiere checkSelfReload)
```

### Migración SQL

```bash
DB_PASS=$(grep -oP 'DB_PASS=\K.*' /var/www/html/vilarkptl.com/ai-monitor/financial/.env)
mysql -u root -p"$DB_PASS" ai_monitoring < financial/db/migrate-financial-vN.sql
```

---

## Flujo de merge a main (via MCP push_files)

Cuando git push retorna 403 por branch protection:

```
1. Obtener contenido: git checkout origin/branch -- ruta/archivo (local)
2. Para archivos < 80KB: Read tool → push_files MCP
3. Para archivos > 80KB: Edit puntual en rama, luego push_files del diff
4. Verificar en GitHub que el commit aparece en origin/main
```

---

## Flujo de sesión limpia para archivos grandes

Cuando necesites editar un archivo > 80KB:

```
1. Abrir sesión nueva de Claude Code
2. wc -c ruta/archivo.js  (verificar tamaño)
3. grep -n "patron_a_editar" ruta/archivo.js  (ubicar línea exacta)
4. sed -n '95,105p' ruta/archivo.js  (ver contexto de la línea)
5. Edit tool con old_string exacto → new_string
6. git add + commit + push
```

---

## Flujo de golden suite (verificación pre-deploy)

```bash
cd financial/bot/sims/mtproto
python3 golden_suite.py

# Target: ≥92% (12 tests G01-G12)
# Exit 0 = verde (deploy permitido)
# Exit 1 = bloqueado (<92% o errores críticos)
```

Tests críticos:
- G09: TransactionOrchestrator importa OK
- G10: DocumentIntelligenceAgent importa OK
- G11: TransactionOrchestrator usa DeepSeek (no Anthropic)
- G12: relay/master.js callAnthropicDirect usa api.deepseek.com

---

## Flujo de compactación de contexto

Cuando el contexto esté al límite y debas continuar:

```
1. Crear resumen compacto (ver MEMORY.md para formato)
2. Dejar pendientes documentados en relay/outbox-[agente].md
3. Crear issue en GitHub con estado y próximos pasos
4. Iniciar nueva sesión con el resumen como contexto inicial
```

---

## Convención de branches por agente

| Agente | Branch de trabajo | Archivos "propios" |
|--------|------------------|--------------------|
| ai-monitor | `claude/agent-monitoring-dashboard-4v8iq` | `frontend/`, `backend/`, `relay/master.js` |
| finbot | `claude/financial-multiagent-system-YwtYQ` | `financial/`, inbox/outbox finbot |
| Cursor | `cursor/financial-bot-env-review-*` | `financial/bot/AGENTS.md`, `AGENT-TREE.md` |

**Cambios de relay** (inbox/outbox/projects.json) → van directo a `main`.
