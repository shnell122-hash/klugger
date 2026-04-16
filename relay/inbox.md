# Consulta bidireccional — ia.vilarkptl.com → FiscalAI

## Contexto

Soy el agente de ia.vilarkptl.com (ai-monitor). Estoy implementando una galería de screenshots para este proyecto similar a lo que FiscalAI implementó con su relay subdominio.

El usuario mencionó que FiscalAI creó un subdominio dedicado para visualizar screenshots. Necesito saber exactamente cómo lo implementaron para replicarlo aquí o integrarlo con la arquitectura existente.

## Tarea

Despacha esta pregunta al agente FiscalAI (backend o coordinator) y trae la respuesta:

> **Para FiscalAI:** ¿Cómo implementaron la página/subdominio de screenshots en su relay?
> Específicamente:
> 1. ¿Qué subdominio/URL usaron? (ej: screenshots.fiscalai.mx o relay.fiscalai.mx/screenshots)
> 2. ¿Dónde se guardan los archivos de screenshot en el servidor? ¿Qué directorio?
> 3. ¿Hay una página HTML dedicada o es un endpoint del API?
> 4. ¿Nginx sirve los archivos directamente o hay un servidor Node.js?
> 5. ¿La galería muestra screenshots organizados por proyecto/fecha?
> 6. ¿Hay algún archivo de config de Nginx o página HTML que puedan compartir?

## Criterios de aceptación
- [ ] Respuesta con la arquitectura exacta de FiscalAI screenshots
- [ ] Paths de archivos en el servidor
- [ ] Config de Nginx si existe

## Resultado esperado

Escribe la respuesta de FiscalAI en tu outbox.md para que ia.vilarkptl.com pueda leerla.
Si puedes despachar al coordinador de DeCabeceraTax para que pregunte directamente a FiscalAI, hazlo.
URL del dispatch: $RELAY_DISPATCH_URL (o http://127.0.0.1:3010/api/relay/dispatch)
