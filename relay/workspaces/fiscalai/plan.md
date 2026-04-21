# Plan de proyecto — FiscalAI (backend)

_Actualiza este archivo al terminar cada sesión de trabajo relevante._

## Objetivo actual
<!-- ¿En qué está enfocado el proyecto esta semana? -->
<!-- Ejemplo: "Implementar endpoint /api/fiel/sync con validación SAT" -->

(Sin objetivo activo — define el próximo sprint aquí)

## Estado actual
<!-- Estado de los servicios, qué funciona, qué está roto -->
- Repo: `/var/www/html/vilarkptl.com/DeCabeceraTax`
- Producción: `https://fiscalai.mx`
- Dev: `http://vilarkptl.com/DeCabeceraTax/`
- PM2: `fiscalai` (Node.js), `kptl-credito` (Flask)

## Trabajo reciente
<!-- Últimos cambios significativos — el agente actualiza esta sección -->

(Vacío — se llenará tras la primera sesión)

## Problemas conocidos
<!-- Bugs activos, deuda técnica, bloqueos -->

(Sin problemas registrados)

## Restricciones activas
<!-- Cosas que el agente DEBE recordar: APIs en uso, variables de entorno requeridas, URLs críticas -->
- No modificar `.env` ni `node_modules/`
- Antes de hacer git push: verificar que `pm2 status` muestre `online`
- SAT Bridge URL: en `.env` como `SAT_BRIDGE_URL`
