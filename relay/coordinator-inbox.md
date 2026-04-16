# Orquestador Central — Inicialización

## Sistema
Lee `/var/www/html/vilarkptl.com/ai-monitor/relay/COORDINATOR.md` para entender tu rol y las herramientas disponibles.

## Primera tarea: Verificación de estado

1. Verifica que el API de dispatch responde: `curl -s http://localhost:3010/api/health`
2. Lista los agentes disponibles: `curl -s http://localhost:3010/api/relay/agents`
3. Revisa el estado actual de los outboxes de FiscalAI backend y frontend
4. Reporta en coordinator-outbox.md:
   - Estado del sistema (API OK / No responde)
   - Qué agentes están disponibles
   - Cuál fue la última tarea de cada agente (fecha + resumen del outbox)
   - Si hay algo pendiente que requiera atención
