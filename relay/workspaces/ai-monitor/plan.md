# Plan de proyecto — AI Monitor (dashboard)

_Actualiza este archivo al terminar cada sesión de trabajo relevante._

## Objetivo actual

(Sin objetivo activo — dashboard en mantenimiento)

## Estado actual
- Repo: `/var/www/html/vilarkptl.com/ai-monitor`
- Dashboard: `https://ia.vilarkptl.com`
- Backend: Express + Socket.io en puerto 3010
- PM2: `ai-monitor-backend`
- DB: MySQL `ai_monitoring` (migración actual: v9)

## Trabajo reciente

(Vacío — se llenará tras la primera sesión)

## Problemas conocidos

(Sin problemas registrados)

## Restricciones activas
- No tocar `relay/master.js` desde este agente (riesgo de romper el relay)
- Cambios al backend requieren `pm2 restart ai-monitor-backend` después de deploy
- Frontend es HTML/CSS/JS estático en `frontend/`
