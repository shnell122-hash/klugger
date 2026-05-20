## Resultados — Episodio #1747 (Score 77.8%)
✅ **gemini-2.0-flash** — DocumentIntelligenceAgent y vision-agent: `gemini-1.5-flash` deprecado → `gemini-2.0-flash`
✅ **deepseek-chat para TransactionOrchestrator** — `deepseek-v4-pro` mapeaba a `deepseek-reasoner` que no soporta `tool_choice` → cambiado a `deepseek-chat`
✅ **responder_info fallback** — cuando TO decide `responder_info` sin `mensaje_respuesta`, bot responde con saldo directo (`$${saldoCtx}`) en lugar de timeout
✅ **TO prompt mejorado** — prompt explícito: `responder_info` DEBE incluir saldo real en `mensaje_respuesta`
✅ **Deploy completo** — 4 commits pusheados, git checkout HEAD ejecutado, `financial-bot` restartado (restart #5, status: online)

## Issues
- Ninguno requiere atención humana — monitorear score en próximos episodios (esperado: 85%+)

STATUS: done
CHANGED: financial/bot/agents/DocumentIntelligenceAgent.js:4, financial/bot/agents/vision-agent.js:82, financial/bot/agents/TransactionOrchestrator.js:17-23, financial/bot/financial-bot.js:1161-1165
DEPLOYED: yes
PENDING: ninguno
USER_REQUIRED: no
