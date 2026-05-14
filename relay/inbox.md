# Tarea — Resolver conflicto de merge en guía de desarrolladores

> De: **German (usuario)**
> Para: **ai-monitor**
> Fecha: 2026-05-14
> Prioridad: Media

---

## Contexto

Hay un conflicto de merge entre `claude/agent-monitoring-dashboard-4v8iq` y `main`
en un archivo de documentación (guía de desarrolladores / onboarding). Los marcadores
`<<<<<<<`, `=======`, `>>>>>>>` están activos en el repo del servidor.

## Paso 1 — Encontrar el archivo con conflicto

```bash
cd /var/www/html/vilarkptl.com/ai-monitor
grep -rl "<<<<<<< claude/agent-monitoring-dashboard-4v8iq" . --include="*.md"
```

## Paso 2 — Estrategia de merge

Las dos versiones del archivo son complementarias, no contradictorias. Combinarlas así:

| Sección | Tomar de |
|---------|----------|
| Título y destinatario ("Para: Israel") | `4v8iq` — más personal |
| "Visión del proyecto" + Quick wins | `main` — sección que falta en 4v8iq, vale la pena |
| Diagrama de arquitectura | `main` — más completo (incluye LiteLLM proxy) |
| Setup inicial (4 pasos + proxy) | `main` — más completo |
| Comandos Telegram (`/tarea`, `/chat`) | `4v8iq` — más limpio y práctico |
| Workflow recomendado | `4v8iq` — mejor para Israel como primer dev |
| "Conectar nuevo proyecto al relay" | `main` — sección crítica que no está en 4v8iq |
| Tabla de proyectos disponibles | `main` — tiene más proyectos y columna "Qué puede hacer" |
| Modelos que usa el sistema | `main` — más detallado |
| Dashboard ia.vilarkptl.com | `main` — tiene tabs detallados |
| Coordinación entre agentes | `main` — tiene ejemplo de @coordinator |
| Troubleshooting | `main` — más completo (5 casos vs 0) |
| Tips y soporte | `4v8iq` — mantener los tips específicos para Israel |
| Tabla ventajas vs desarrollo tradicional | `main` — buena para convencer al equipo |

## Paso 3 — Resultado esperado

Un solo archivo Markdown sin marcadores de conflicto, que combine ambas versiones.
Estructura sugerida:

```
# Dev Onboarding — Sistema Multi-Agente Vilar
> Para: Israel (y futuros devs del equipo)

## Visión del proyecto          ← de main
## Quick wins inmediatos        ← de main
## Arquitectura                 ← de main (diagrama completo con LiteLLM)
## Setup inicial                ← de main (4 pasos)
## Cómo despachar tareas        ← de 4v8iq (con /tarea, /chat, /claude)
## Workflow recomendado         ← de 4v8iq
## Conectar nuevo proyecto      ← de main (sección crítica)
## Proyectos disponibles        ← de main (tabla más completa)
## Modelos que usa el sistema   ← de main
## Dashboard                    ← de main
## Coordinación entre agentes   ← de main
## Troubleshooting              ← de main
## Tips                         ← de 4v8iq
## Soporte                      ← de 4v8iq
## Ventajas                     ← de main
```

## Paso 4 — Commit

```bash
git add <archivo>
git commit -m "docs: merge guía onboarding 4v8iq + main — combina Telegram commands + arquitectura completa"
git push origin <branch-actual>
```

---

STATUS: pendiente
USER_REQUIRED: no — resuelve el conflicto y commitea
