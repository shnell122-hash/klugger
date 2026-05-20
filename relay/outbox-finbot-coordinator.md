STATUS: done
CHANGED: financial/bot/financial-bot.js, financial/bot/agents/DocumentIntelligenceAgent.js, financial/bot/agents/vision-agent.js
DEPLOYED: yes
ROOT_CAUSE: 1) gemini-2.0-flash deprecado (404 en todas las imágenes) → actualizado a gemini-2.0-flash-001; 2) SALDO_QUERY_RE interceptado por confirmando_cuentas handler → movido antes de todos los state handlers; 3) monto_invalido_0 no detectado en !parsed.monto → detectado con parseNaturalText()
PENDING: tarjetas_kevin_80000 (session contamination esperando_entrega) — no fijado en esta sesión; reintegro_factura/comprobante_noela dependen de Gemini fix
