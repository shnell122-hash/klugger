# Plan Maestro — VILAR Legal OS v60 "Artifact Factory"

> Versión: 1.0 · Fecha: 2026-05-13  
> Estado: **Planificación** · Despliegue objetivo: `/testing/v60`  
> Producción actual (`/OCR/v59`) se mantiene **intacta en todo momento**

---

## Índice

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Reglas estrictas del proyecto](#2-reglas-estrictas-del-proyecto)
3. [Stack tecnológico](#3-stack-tecnológico)
4. [Árbol de agentes costo-eficiente](#4-árbol-de-agentes-costo-eficiente)
5. [Slash commands](#5-slash-commands)
6. [Árbol de archivos objetivo](#6-árbol-de-archivos-objetivo)
7. [Plan de despliegue seguro](#7-plan-de-despliegue-seguro)
8. [Fases de implementación](#8-fases-de-implementación)
9. [Estado actual por fase](#9-estado-actual-por-fase)
10. [Instrucciones para Claude Code](#10-instrucciones-para-claude-code)

---

## 1. Resumen ejecutivo

Transformar `ocr/v59` en un sistema ultra-escalable de **generación masiva de artefactos** legales y contables, manteniendo el 100% del backend actual y migrando solo el frontend a un stack moderno, atractivo y multi-plataforma (web + iOS + Android).

**Foco:** contratos, briefs, análisis, memorandos, checklists, reportes contables, imágenes de capacitación, materialidad fiscal/contractual, evidencias visuales.  
**Fuera de alcance:** todo lo relacionado con arrendamientos/leases.

---

## 2. Reglas estrictas del proyecto

| # | Regla |
|---|-------|
| 1 | **Nunca modificar nada fuera de `ocr/testing/v60/`** |
| 2 | Mantener todos los archivos de `v59` intactos — solo copiar y modificar dentro de `v60` |
| 3 | Usar el mismo `soul-v59.md` copiado tal cual |
| 4 | Generar código completo para cada archivo nuevo o modificado |
| 5 | Incluir comentarios `# v60 - nueva funcionalidad` en cada adición |
| 6 | Priorizar costo-eficiencia y belleza visual |
| 7 | Flutter 3.29+ con Material 3 y tema oscuro premium |
| 8 | Dashboard estilo Obsidian + Notion + Figma |
| 9 | Implementar exactamente el árbol de agentes y routing LiteLLM descrito |

---

## 3. Stack tecnológico

| Capa | v59 (actual) | v60 (nuevo) | Razón |
|------|-------------|-------------|-------|
| **Backend** | Python + Flask | Mantener Flask + nuevos módulos | Estabilidad y multi-tenant |
| **Orquestación** | Router Haiku inline | LangGraph + LiteLLM | Persistencia y jobs largos |
| **AI Routing** | Claude directo | LiteLLM tiers (ver §4) | Costo-eficiencia extrema |
| **Frontend** | Vanilla JS ~3 600 líneas | Flutter 3.29+ (web + iOS + Android) | UI atractiva, grafos, mobile-first |
| **Background jobs** | — | Celery + Redis | Soporte `/masivo` |
| **Grafos** | — | Mermaid.js + Cytoscape.js (en Flutter) | Dashboard Obsidian-like |
| **Almacenamiento** | Filesystem local | Filesystem + R2/S3 opcional | Escalabilidad |
| **Puerto** | 5005 (producción) | **5006** (testing, aislado) | Sin colisión con v59 |
| **PM2** | `vilar-legal-os-v59` | `vilar-legal-os-v60-testing` | Procesos independientes |

### Dependencias nuevas (`requirements.txt` additions)

```
litellm>=1.35.0
langgraph>=0.1.0
celery>=5.3.0
redis>=5.0.0
```

---

## 4. Árbol de agentes costo-eficiente

```
Mensaje del usuario
       │
       ▼
┌─────────────────────────────────┐
│  Supervisor / Intent Router     │  claude-haiku-4-5 ó Gemini Flash
│  (clasificación < 800 ms)       │
└───────────────┬─────────────────┘
                │
       ┌────────▼────────┐
       │  LiteLLM Cost   │  ← LangGraph orchestrator
       │     Router      │
       └──┬──┬──┬──┬─────┘
          │  │  │  │
   ┌──────┘  │  │  └──────────────────┐
   │         │  │                     │
   ▼         ▼  ▼                     ▼
TIER 0    TIER 1  TIER 2           TIER 3
Ultra-    Multim. Redacción        Legal
Cheap     Barato  & Código         Crítico
Llama 3.3 Gemini  DeepSeek         Claude
Qwen 2.5  Flash   V4 Pro           Sonnet
GPT-4o-m          │                4.6
   │        │     │                 │
   ▼        ▼     ▼                 ▼
Bulk     Vision  Artifact        Legal &
Generator & OCR  Generator       Validator
Agent    Agent   Agent +         Agent
                 append
          └──────┬──────┘
                 ▼
    DocumentIntelligenceAgent
    (tropicalizado de financial-bot)
                 │
                 ▼
    Financial / Accounting Reasoning
```

### Reglas de routing LiteLLM

| Condición | Tier | Modelo |
|-----------|------|--------|
| Tarea `/masivo` o bulk | 0 | Llama 3.3 / Qwen 2.5 / GPT-4o-mini |
| OCR, visión, imágenes | 1 | Gemini Flash 2.0 |
| Redacción, contratos simples | 2 | DeepSeek V4 Pro |
| Legal crítico, validación, análisis complejo | 3 | Claude Sonnet 4.6 |
| Solicitado explícitamente por el usuario | — | Claude Opus 4.6 |

---

## 5. Slash commands

| Comando | Descripción | Agente | Modelo principal |
|---------|-------------|--------|-----------------|
| `/masivo` | Generación masiva en background (Celery) | Bulk Generator Agent | Ultra-Cheap + DeepSeek |
| `/materialidad` | Análisis de materialidad fiscal y contractual | MaterialidadAgent | Claude Sonnet + DeepSeek |
| `/evidencia` | Generación masiva de imágenes de capacitación | EvidenceImageAgent | Flux.1.1 Pro Ultra |
| `/grafico` | Genera grafo Mermaid + Cytoscape del expediente | GraphAgent | Gemini Flash |
| `/ultra` | Fuerza Tier 0 (ultra-barato) para tarea actual | — | Llama / Qwen |
| `/sonnet` | Fuerza Claude Sonnet para tarea actual | — | Claude Sonnet 4.6 |

---

## 6. Árbol de archivos objetivo

```
ocr/testing/v60/
├── api/
│   ├── app.py                          ← copia v59 + APP_BASE_PATH="/testing/v60", PORT=5006
│   ├── .env                            ← copia v59 + REDIS_URL, CELERY_BROKER
│   ├── requirements.txt                ← v59 + litellm, langgraph, celery, redis
│   ├── routes/
│   │   ├── auth.py                     ← copia exacta v59
│   │   ├── admin.py                    ← copia exacta v59
│   │   ├── artifacts.py                ← copia exacta v59
│   │   ├── cases.py                    ← copia exacta v59
│   │   ├── upload.py                   ← copia exacta v59
│   │   ├── transcribe.py               ← copia exacta v59
│   │   ├── dashboard.py                ← copia exacta v59
│   │   ├── imagen.py                   ← copia exacta v59
│   │   └── chat.py                     ← v59 + pre-procesador slash commands + router LiteLLM
│   ├── tools/
│   │   ├── db.py                       ← copia exacta v59
│   │   ├── claude_vision.py            ← copia exacta v59
│   │   ├── jotform_tools.py            ← copia exacta v59
│   │   ├── litellm_router.py           ← NUEVO: routing costo-eficiente
│   │   └── celery_app.py               ← NUEVO: worker Celery + tarea masivo
│   └── agents/
│       ├── __init__.py
│       ├── document_intelligence.py    ← NUEVO: tropicalización de financial-bot
│       ├── vision_agent.py             ← NUEVO: agente OCR/visión multimodal
│       ├── bulk_generator.py           ← NUEVO: generación masiva /masivo
│       ├── materialidad_agent.py       ← NUEVO: análisis fiscal/contractual
│       └── graph_agent.py             ← NUEVO: genera Mermaid + Cytoscape JSON
├── openclaw/
│   ├── soul-v59.md                     ← copia exacta sin cambios
│   ├── tool_definitions.json           ← v59 + nuevas herramientas slash
│   └── tool_router.py                  ← v59 + dispatch nuevos agentes
├── frontend-flutter/                   ← NUEVO: app Flutter completa
│   ├── pubspec.yaml
│   ├── lib/
│   │   ├── main.dart
│   │   ├── core/
│   │   │   ├── theme.dart              ← tema oscuro premium (Obsidian-like)
│   │   │   ├── router.dart             ← go_router
│   │   │   └── api_client.dart         ← HTTP + SSE client
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   │   ├── auth_screen.dart
│   │   │   │   └── auth_provider.dart
│   │   │   ├── cases/
│   │   │   │   ├── cases_screen.dart
│   │   │   │   └── cases_provider.dart
│   │   │   ├── chat/
│   │   │   │   ├── chat_screen.dart    ← burbujas modernas + preview artefactos
│   │   │   │   ├── chat_provider.dart
│   │   │   │   └── slash_commands.dart ← handler /masivo /materialidad etc.
│   │   │   ├── artifacts/
│   │   │   │   ├── artifacts_screen.dart
│   │   │   │   └── artifact_viewer.dart
│   │   │   ├── dashboard/
│   │   │   │   ├── dashboard_screen.dart ← Timeline + Graph + List views
│   │   │   │   └── costs_widget.dart
│   │   │   └── graph/
│   │   │       ├── graph_screen.dart   ← Cytoscape/graphview interactivo
│   │   │       └── mermaid_widget.dart
│   │   └── widgets/
│   │       ├── sidebar.dart            ← collapsible, como Obsidian
│   │       ├── artifact_card.dart
│   │       └── op_log_panel.dart       ← panel de operaciones en tiempo real
│   └── web/
│       └── index.html                  ← Flutter web entry point
└── ecosystem.config.js                 ← PM2: vilar-legal-os-v60-testing, port 5006
```

---

## 7. Plan de despliegue seguro

```
Servidor producción:
  Puerto 5005  ←→  /OCR/v59/       (INTOCABLE)
  Puerto 5006  ←→  /testing/v60/   (nuevo)
```

### Pasos en servidor

```bash
# 1. Clonar estructura
cp -r /var/www/catalogos/OCR/v59 /var/www/catalogos/testing/v60

# 2. Editar variables
nano /var/www/catalogos/testing/v60/api/.env
# Cambiar: APP_BASE_PATH=/testing/v60
# Añadir:  REDIS_URL=redis://localhost:6379/1
#          CELERY_BROKER=redis://localhost:6379/1
#          V60_TESTING=true

# 3. Instalar nuevas deps en venv de v60
/var/www/catalogos/testing/v60/venv/bin/pip install litellm langgraph celery redis

# 4. Iniciar proceso PM2 aislado
pm2 start /var/www/catalogos/testing/v60/ecosystem.config.js

# 5. Añadir proxy Apache (sin tocar reglas de v59)
# ProxyPass /testing/v60/api/ http://127.0.0.1:5006/api/
# ProxyPassReverse /testing/v60/api/ http://127.0.0.1:5006/api/
```

### `ecosystem.config.js` para v60

```js
module.exports = {
  apps: [{
    name: 'vilar-legal-os-v60-testing',
    script: '/var/www/catalogos/testing/v60/api/app.py',
    interpreter: '/var/www/catalogos/testing/v60/venv/bin/python3',
    env: {
      PORT: 5006,
      APP_BASE_PATH: '/testing/v60',
      V60_TESTING: 'true',
    }
  }]
};
```

---

## 8. Fases de implementación

### Fase 0 — Preparación *(~1 día)*

- [ ] Crear carpeta `ocr/testing/v60/` en el repo
- [ ] Copiar todo desde `ocr/v59/`
- [ ] Actualizar `.env` y `APP_BASE_PATH`
- [ ] Crear `requirements.txt` con nuevas deps
- [ ] Crear `ecosystem.config.js` para PM2 en puerto 5006

### Fase 1 — Backend: nuevos módulos *(~3-4 días)*

- [ ] `api/tools/litellm_router.py` — routing por tiers con fallback
- [ ] `api/tools/celery_app.py` — worker + tarea `generate_bulk`
- [ ] `api/agents/document_intelligence.py` — tropicalización Python de financial-bot
- [ ] `api/agents/vision_agent.py` — agente OCR/visión multimodal
- [ ] `api/agents/bulk_generator.py` — generación masiva asíncrona
- [ ] `api/agents/materialidad_agent.py` — materialidad fiscal/contractual
- [ ] `api/agents/graph_agent.py` — genera Mermaid JSON + Cytoscape graph data
- [ ] `routes/chat.py` — añadir pre-procesador de slash commands + llamar LiteLLM router
- [ ] `openclaw/tool_definitions.json` — añadir `generate_bulk`, `analyze_materialidad`, `generate_graph`
- [ ] `openclaw/tool_router.py` — dispatch a nuevos agentes

### Fase 2 — Frontend Flutter *(~7-10 días)*

- [ ] `pubspec.yaml` con dependencias clave
- [ ] `core/theme.dart` — tema oscuro premium
- [ ] `core/router.dart` — navegación con go_router
- [ ] `core/api_client.dart` — cliente HTTP + SSE
- [ ] Feature **auth** — pantalla de login (Google OAuth + contraseña)
- [ ] Feature **cases** — lista de expedientes
- [ ] Feature **chat** — burbujas modernas + preview artefactos en tiempo real
- [ ] Feature **chat** — handler de slash commands
- [ ] Feature **artifacts** — vista y descarga de artefactos
- [ ] Feature **dashboard** — Timeline + Graph + List views + costos MXN
- [ ] Feature **graph** — Cytoscape interactivo por expediente
- [ ] Widget **sidebar** — collapsible estilo Obsidian
- [ ] Widget **op_log_panel** — log de operaciones en tiempo real
- [ ] Build Flutter Web → `frontend-flutter/web/`

### Fase 3 — Integración y pulido *(~3 días)*

- [ ] Slash commands end-to-end (`/masivo`, `/materialidad`, `/evidencia`, `/grafico`)
- [ ] Toggle "Ultra-Cheap mode" en UI
- [ ] Dashboard de costos en tiempo real (MXN por tier)
- [ ] Prueba de generación masiva (100 → 1 000 artefactos)
- [ ] Ajuste de prompts por tier en `soul-v60.md`

### Fase 4 — Testing y Go-Live

- [ ] Smoke test completo en `https://ocr.ruby.lease/testing/v60/`
- [ ] Verificar que `/OCR/v59/` sigue 100% intacto
- [ ] Revisión de seguridad (sesiones, CORS, orgs)
- [ ] Aprobación del equipo
- [ ] Merge / rename a producción (cuando se decida)

---

## 9. Estado actual por fase

### Lo que ya existe en `ocr/v59` y se reutiliza directamente

| Módulo | Archivo | Reutilización |
|--------|---------|--------------|
| Auth completa | `routes/auth.py` | ✅ Copia exacta |
| Admin multi-tenant | `routes/admin.py` | ✅ Copia exacta |
| Artefactos + ZIP nativo | `routes/artifacts.py` | ✅ Copia exacta (incluye fix formato ZIP) |
| Upload + ZIP recursivo | `routes/upload.py` | ✅ Copia exacta |
| Dashboard por rol | `routes/dashboard.py` | ✅ Copia exacta |
| Transcripción Whisper | `routes/transcribe.py` | ✅ Copia exacta |
| Generación imágenes | `routes/imagen.py` | ✅ Copia exacta |
| Loop agéntico + SSE | `routes/chat.py` | 🔧 Base + slash commands + LiteLLM pre-hook |
| Soul del agente | `openclaw/soul-v59.md` | ✅ Copia exacta |
| Tool definitions | `openclaw/tool_definitions.json` | 🔧 Base + nuevas tools |
| Tool router | `openclaw/tool_router.py` | 🔧 Base + dispatch nuevos agentes |
| DB helper | `tools/db.py` | ✅ Copia exacta |
| Claude Vision | `tools/claude_vision.py` | ✅ Copia exacta |
| Prompt caching | `chat.py` (`_cache_last_msg`) | ✅ Ya implementado |
| Branding herencia | `auth.py` (`me()`) | ✅ Ya implementado |
| Dashboard org-admin | `dashboard.py` | ✅ Ya implementado |

### Lo que se crea nuevo en v60

| Módulo | Archivo | Prioridad |
|--------|---------|-----------|
| LiteLLM cost router | `tools/litellm_router.py` | 🔴 Fase 1 |
| Celery worker | `tools/celery_app.py` | 🔴 Fase 1 |
| DocumentIntelligence | `agents/document_intelligence.py` | 🔴 Fase 1 |
| Vision Agent | `agents/vision_agent.py` | 🟡 Fase 1 |
| Bulk Generator | `agents/bulk_generator.py` | 🔴 Fase 1 |
| Materialidad Agent | `agents/materialidad_agent.py` | 🟡 Fase 1 |
| Graph Agent | `agents/graph_agent.py` | 🟡 Fase 1 |
| Flutter app completa | `frontend-flutter/` | 🔴 Fase 2 |

---

## 10. Instrucciones para Claude Code

Cuando ejecutes este plan, sigue este orden estrictamente:

```
1. FASE 0: Crea ocr/testing/v60/ copiando v59 completo
2. FASE 1: Crea los archivos nuevos en tools/ y agents/
3. Modifica SOLO routes/chat.py (añade pre-procesador al inicio, no toques el loop)
4. Modifica SOLO tool_definitions.json (añade al array, no elimines nada)
5. FASE 2: Crea frontend-flutter/ completo con Flutter 3.29+
6. No toques NADA en ocr/v59/
7. Todos los archivos nuevos llevan comentario # v60 - nueva funcionalidad
8. Cada archivo nuevo debe ser funcional y completo (no placeholders)
```

### Siguiente paso inmediato

```
Ejecuta Fase 0: crea ocr/testing/v60/, copia v59, 
crea ecosystem.config.js y requirements.txt actualizados.
```

---

*VILAR Legal OS v60 "Artifact Factory" · Plan Maestro v1.0 · 2026-05-13*  
*Branch: `claude/ocr-v59-implementation-vOcPD`*
