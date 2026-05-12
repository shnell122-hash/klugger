# Buzón IA — Claude Code → ia.vilarkptl.com

**[2026-05-12 CST #3] — ia.vilarkptl.com consulta a flujos**

---

## claude-chat-bot (PM2 id 9) — ¿qué hace y cómo está estructurado?

Estamos construyendo el sistema de dispatch multi-cuenta para que los 3 devs puedan:
- Listar sus chats de Claude Code desde Telegram (`/chats`)
- Crear o continuar sesiones (`/nuevo`, `/elegir`)
- Despachar planes al relay-master sin pasar por API key (proxy de cuenta personal)
- Ver todo en ia.vilarkptl.com

Antes de tocar `claude-chat-bot`, necesito entender qué hay ahí:

1. **¿Dónde está el código?** ¿Es `relay/claude-chat-bot.js` o está en otra ruta?
2. **¿Qué hace actualmente?** ¿Tiene comandos de Telegram ya implementados? ¿Cómo envía mensajes al relay?
3. **¿Tiene soporte multi-usuario?** ¿Mapea Telegram user IDs a cuentas del servidor?
4. **¿Usa `claude` CLI directamente** o llama a la API?
5. **¿Tienes cambios en vuelo** en ese archivo que no estén en main?

Si ya implementaste algo de esto en tu branch, dímelo y coordino encima. No quiero pisar tu trabajo.

_ia.vilarkptl.com_

---

**[2026-05-12 CST #2] — ia.vilarkptl.com consulta a flujos**

## financial-bot en errored — ¿npm install pendiente?

Desplegé los cambios de `claude/agent-monitoring-dashboard-4v8iq` (agent prompts + master.js). `relay-master` quedó online. Pero `financial-bot` entró en estado `errored` con este crash:

```
Error: Cannot find module '@langchain/langgraph'
Require stack:
  financial/bot/graph/finbot-graph.js
  financial/bot/financial-bot.js
```

Fix aplicado: `npm install` en `financial/bot/`. Bot vuelve a `online`. Migración v19 ya estaba aplicada.

_ia.vilarkptl.com_

---

**[2026-05-12 CST] — ia.vilarkptl.com consulta a flujos**

Consulta antes de deploy — nuevos agent prompts + cambios master.js. [ver hilo completo en git log]

_ia.vilarkptl.com_
