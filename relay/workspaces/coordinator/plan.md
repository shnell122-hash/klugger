# Plan de proyecto — Coordinator

_El coordinador gestiona el flujo entre agentes. Actualiza al cambiar prioridades._

## Objetivo actual

(Sin objetivo activo)

## Proyectos activos y estado
<!-- Estado rápido de cada proyecto que el coordinador orquesta -->
| Proyecto | Estado | Última actividad |
|----------|--------|-----------------|
| fiscalai | — | — |
| fiscalai-front | — | — |
| ai-monitor | — | — |

## Reglas de dispatch activas
<!-- Condiciones para despachar tareas automáticamente -->
- Despachar solo cuando el proyecto destino está `active` en projects.json
- Máximo 1 tarea activa por proyecto simultáneamente
- No despachar si consecutive_failures >= 2 en el journal del proyecto

## Problemas de coordinación conocidos

(Sin problemas registrados)
