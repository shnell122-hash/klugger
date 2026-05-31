# VILAR Legal OS v59 — Autodiagnóstico del Sistema

> Generado automáticamente · 2026-05-13

---

## Índice

1. [Stack tecnológico](#1-stack-tecnológico)
2. [Árbol de documentos](#2-árbol-de-documentos)
3. [Árbol de agentes](#3-árbol-de-agentes)
4. [Herramientas disponibles](#4-herramientas-disponibles)
5. [API — Rutas completas](#5-api--rutas-completas)
6. [Esquema de base de datos](#6-esquema-de-base-de-datos)
7. [Capacidades del sistema](#7-capacidades-del-sistema)
8. [Problemas actuales conocidos](#8-problemas-actuales-conocidos)
9. [Ventajas y desventajas](#9-ventajas-y-desventajas)
10. [Autodiagnóstico](#10-autodiagnóstico)

---

## 1. Stack tecnológico

| Capa | Tecnología | Versión / Detalles |
|------|-----------|-------------------|
| **Servidor** | Ubuntu + Apache2 | Reverse proxy → Flask |
| **Proceso** | PM2 | `vilar-legal-os-v59` |
| **Backend** | Python / Flask | Puerto 5005, virtualenv aislado |
| **Base de datos** | MySQL | UTF-8, 10 tablas |
| **IA principal** | Anthropic Claude | claude-sonnet-4-6 · claude-haiku-4-5-20251001 · claude-opus-4-6 |
| **Generación de imágenes** | fal.ai Flux.1 | API REST, `FAL_KEY` |
| **Transcripción** | OpenAI Whisper | `OPENAI_API_KEY` |
| **Análisis de audio** | librosa + pydub | Local, sin API externa |
| **OCR / visión** | Claude Vision | Extracción de texto de imágenes/PDF |
| **Frontend** | HTML + JS vanilla | SPA, sin framework, SSE para streaming |
| **Autenticación** | Google OAuth 2.0 + magic links + contraseña | Sesiones Flask |
| **Email** | SendGrid (primario) / SMTP (fallback) | `SENDGRID_API_KEY` |
| **Exportación** | JotForm API | Backup de expedientes |
| **Generación DOCX** | python-docx + htmldocx | Conversión Markdown → Word |

### Variables de entorno requeridas

```
ANTHROPIC_API_KEY   — Claude (crítico)
FAL_KEY             — Generación de imágenes
OPENAI_API_KEY      — Transcripción Whisper
DB_HOST / DB_NAME / DB_USER / DB_PASS
SENDGRID_API_KEY    — Email (opcional, fallback SMTP)
APP_BASE_URL        — https://ocr.ruby.lease
APP_BASE_PATH       — /OCR/v59
```

---

## 2. Árbol de documentos

```
ocr/v59/
├── api/
│   ├── app.py                    ← Flask app, blueprints, CORS, sesiones
│   ├── .env                      ← Variables de entorno (producción)
│   ├── routes/
│   │   ├── auth.py               ← OAuth, magic links, contraseña, /api/auth/*
│   │   ├── admin.py              ← Orgs, usuarios, invitaciones, logos, /api/admin/*
│   │   ├── chat.py               ← Loop agéntico, streaming SSE, modelos, /api/chat
│   │   ├── artifacts.py          ← CRUD artefactos, DOCX, share slug, /api/artifacts/*
│   │   ├── cases.py              ← CRUD expedientes, /api/cases/*
│   │   ├── upload.py             ← Subida archivos, OCR, ZIP recursivo, /api/upload
│   │   ├── dashboard.py          ← Costos por rol (admin/sub-master/org-admin/user)
│   │   ├── imagen.py             ← Generación imágenes Flux.1, /api/imagen/*
│   │   └── transcribe.py         ← Jobs de transcripción Whisper, /api/transcribe/*
│   └── tools/
│       ├── db.py                 ← Helper MySQL (query / execute)
│       ├── claude_vision.py      ← Extracción de texto con Claude Vision
│       └── jotform_tools.py      ← Exportación a JotForm
├── openclaw/
│   ├── soul-v59.md               ← Identidad, reglas y comportamiento del agente
│   ├── tool_definitions.json     ← Definiciones JSON de herramientas (10 tools)
│   └── tool_router.py            ← Despacho de llamadas a herramientas
├── frontend/
│   ├── index.html                ← SPA completa (~3600 líneas)
│   ├── logos/                    ← Logos de organizaciones subidos
│   └── docs/
│       └── diagnostico-sistema.md  ← Este documento
└── uploads/                      ← Archivos subidos por usuarios (filesystem)
```

---

## 3. Árbol de agentes

El sistema usa un **router de intención** (Haiku, < 800 ms) que clasifica cada mensaje y activa el agente especializado correspondiente.

```
Mensaje del usuario
       │
       ▼
┌──────────────────┐
│  _classify_intent│  claude-haiku-4-5-20251001 · max_tokens=12
│  (< 800 ms)      │  Retorna: { "a": "<agent_key>" }
└────────┬─────────┘
         │
    ┌────▼────────────────────────────────────────────────────┐
    │                  Router de agentes                       │
    └────┬──────────┬───────────┬────────────┬────────────────┘
         │          │           │            │
    ┌────▼───┐ ┌────▼───┐ ┌────▼───┐ ┌──────▼──────┐
    │forensic│ │document│ │ legal  │ │ management  │
    │  🎵    │ │  📄    │ │  ⚖️   │ │    📁       │
    │Sonnet  │ │Sonnet  │ │Sonnet  │ │   Haiku     │
    └────────┘ └────────┘ └────────┘ └─────────────┘
         │                                  │
    analyze_audio               create_case, export_to_jotform
    save_artifact               list_case_contents
    list_case_contents          save_session_notes
    save_session_notes
                      ┌─────────────┐
                      │   general   │
                      │    🌐       │
                      │ auto-model  │  (Haiku / Sonnet / Opus según tipo)
                      │ all tools   │
                      └─────────────┘
```

### Selección de modelo por tipo de artefacto

| Tipo de artefacto | Modelo | max_tokens |
|-------------------|--------|-----------|
| `contract` | claude-sonnet-4-6 | 64 000 |
| `brief` | claude-sonnet-4-6 | 64 000 |
| `html` | claude-sonnet-4-6 | 64 000 |
| `analysis` | claude-sonnet-4-6 | 64 000 |
| `summary` | claude-haiku-4-5-20251001 | 4 096 |
| `checklist` | claude-haiku-4-5-20251001 | 4 096 |
| Opus explícito | claude-opus-4-6 | según tipo |

### Caché de prompts (3 breakpoints)

```
[System bloque 1: SOUL]          ← cache_control: ephemeral  (TTL 5 min)
[System bloque 2: contexto caso] ← cache_control: ephemeral  (TTL 5 min)
[Historial: msg 1…N-1]          ← cache_control: ephemeral en msg N-1
[Mensaje actual del usuario]
```

---

## 4. Herramientas disponibles

| # | Herramienta | Descripción |
|---|-------------|-------------|
| 1 | `save_artifact` | Guarda documentos generados (contratos, análisis, briefs, HTML, checklists) en BD |
| 2 | `append_artifact` | Continúa/completa artefactos que exceden max_tokens (estrategia multi-parte) |
| 3 | `list_case_contents` | Inventario completo del expediente: docs subidos, artefactos generados, notas |
| 4 | `analyze_audio` | Análisis forense vocal: transcripción, timestamps, pitch/energía, detección de engaño |
| 5 | `generate_image` | Genera imágenes fotorrealistas vía Flux.1 (fal.ai) |
| 6 | `search_precedents` | Busca jurisprudencia y precedentes legales |
| 7 | `validate_document` | Verifica cumplimiento y requisitos legales de documentos |
| 8 | `create_case` | Crea nuevo expediente en base de datos |
| 9 | `export_to_jotform` | Exporta datos del expediente a JotForm (backup) |
| 10 | `save_session_notes` | Almacena notas de continuación para flujos multi-sesión |

---

## 5. API — Rutas completas

### Autenticación `/api/auth/`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/auth/google` | Inicia Google OAuth |
| GET | `/api/auth/google/callback` | Callback Google OAuth |
| GET | `/api/auth/invite` | Login por magic link |
| POST | `/api/auth/logout` | Cierre de sesión |
| GET | `/api/auth/me` | Datos del usuario actual + branding org |
| POST | `/api/auth/login-password` | Login email + contraseña |
| POST | `/api/auth/set-password` | Establecer/cambiar contraseña |
| POST | `/api/auth/request-link` | Solicitar magic link (self-service) |

### Chat `/api/chat/`
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/chat` | Loop agéntico síncrono |
| POST | `/api/v1/chat/stream` | Loop agéntico con streaming SSE |
| GET | `/api/chat/history/<case_id>` | Obtener historial (últimos 200) |
| DELETE | `/api/chat/history/<case_id>` | Limpiar historial |

### Administración `/api/admin/`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET/POST | `/api/admin/organizations` | Listar / crear organizaciones |
| PUT/DELETE | `/api/admin/organizations/<id>` | Actualizar / eliminar org |
| GET/PUT | `/api/admin/my-org` | Leer / actualizar mi org (colores, límites) |
| POST | `/api/admin/my-org/logo` | Subir logo de org |
| GET | `/api/admin/org-logo/<filename>` | Servir logo (público) |
| GET | `/api/admin/sub-masters` | Listar sub-masters + tasas |
| POST | `/api/admin/sub-masters/promote` | Promover a sub-master |
| PUT | `/api/admin/sub-masters/<id>` | Configurar tasas y orgs |
| GET | `/api/admin/sm/my-orgs` | Mis orgs asignadas (sub-master) |
| GET/PUT/DELETE | `/api/admin/users/<id>` | Gestión de usuarios |
| GET/POST/DELETE | `/api/admin/invitations` | Gestión de invitaciones |
| GET/PUT | `/api/admin/cases` | Ver / reasignar expedientes |
| GET | `/api/admin/stats` | Estadísticas globales |
| POST | `/api/admin/set-my-branding` | Aplicar branding de org |

### Artefactos `/api/artifacts/`
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/artifacts/<case_id>` | Listar artefactos del expediente |
| GET | `/api/artifacts/file/<id>` | Descargar archivo |
| GET | `/api/artifacts/<id>/download` | Descarga forzada |
| DELETE | `/api/artifacts/<id>` | Eliminar artefacto |
| GET | `/api/artifacts/<case_id>/zip` | Exportar expediente como ZIP |
| GET | `/caso/<slug>` | Vista pública por slug compartible |
| GET | `/api/artifacts/<id>/share-slug` | Obtener/generar slug compartible |
| POST | `/api/artifacts/search` | Buscar en artefactos |

### Otros
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/upload` `/api/v1/upload` | Subir archivos (ZIP recursivo, OCR) |
| POST | `/api/transcribe` | Iniciar job de transcripción |
| GET | `/api/transcribe/<job_id>` | Estado del job |
| GET | `/api/dashboard/costs` | Costos por rol (admin/sub-master/org-admin/usuario) |
| POST | `/api/imagen/generate` | Generar imagen con Flux.1 |
| GET/POST | `/api/cases` `/api/v1/cases` | CRUD expedientes |

---

## 6. Esquema de base de datos

```
┌─────────────┐       ┌──────────────────┐       ┌──────────────────┐
│    users    │──────▶│  organizations   │◀──────│  sub_master_rates│
│─────────────│       │──────────────────│       │──────────────────│
│ user_id PK  │       │ org_id PK        │       │ sub_master_id PK │
│ email UNIQ  │       │ org_name         │       │ cost_mxn_per_usd │
│ name        │       │ domain UNIQ      │       │ price_mxn_per_usd│
│ role        │       │ logo_path        │       └──────────────────┘
│ org_id FK   │       │ primary_color    │
│ is_org_admin│       │ accent_color     │
│ is_sub_master       │ sub_master_id FK │
│ approved    │       │ monthly_budget   │
│ token_limit │       │ token_limit      │
│ password_*  │       │ is_active        │
└─────────────┘       └──────────────────┘

┌──────────────┐       ┌──────────────────┐       ┌──────────────────┐
│    cases     │──────▶│  user_artifacts  │       │ system_artifacts │
│──────────────│       │──────────────────│       │──────────────────│
│ case_id PK   │       │ artifact_id PK   │       │ artifact_id PK   │
│ case_name    │       │ case_id FK       │       │ case_id FK       │
│ matter_type  │       │ filename         │       │ artifact_name    │
│ status       │       │ mime_type        │       │ artifact_type    │
│ owner_email  │       │ extracted_text   │       │ content (texto)  │
│ org_id FK    │       │ file_path        │       │ share_slug UNIQ  │
└──────────────┘       │ checksum_sha256  │       │ file_size_bytes  │
                       │ source           │       └──────────────────┘
                       └──────────────────┘

┌──────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ chat_history │       │   api_usage      │       │  invitations     │
│──────────────│       │──────────────────│       │──────────────────│
│ case_id FK   │       │ usage_id PK      │       │ invite_id PK     │
│ role         │       │ user_id FK       │       │ email            │
│ content      │       │ case_id FK       │       │ org_id FK        │
│ created_at   │       │ model            │       │ role             │
└──────────────┘       │ input_tokens     │       │ token UNIQ       │
                       │ output_tokens    │       │ is_sub_master    │
                       │ cache_read_tokens│       │ expires_at       │
                       │ cost_usd         │       │ used             │
                       └──────────────────┘       └──────────────────┘
```

---

## 7. Capacidades del sistema

### Gestión documental
- ✅ Subida de PDF, DOCX, XLSX, PPTX, imágenes (JPG/PNG/WebP), HTML, TXT
- ✅ Subida de audio/video (MP3, MP4, WAV, OGG, WebM, AAC, FLAC, MOV, AVI)
- ✅ ZIP con carpetas anidadas y ZIPs dentro de ZIPs (extracción recursiva)
- ✅ Extracción de texto automática vía Claude Vision (OCR)
- ✅ Cache de extracción por SHA-256 (no re-procesa duplicados)
- ✅ Exportación de expedientes completos como ZIP

### Generación de artefactos
- ✅ Contratos legales en Markdown → descargables en Word (.docx)
- ✅ Análisis jurídicos extensos (hasta 64 000 tokens de salida)
- ✅ Briefs y memorandos legales
- ✅ Informes HTML con formato rico
- ✅ Resúmenes ejecutivos y checklists
- ✅ Generación de imágenes fotorrealistas (Flux.1)
- ✅ Artefactos multi-parte (append_artifact para documentos muy largos)
- ✅ Links públicos compartibles por slug (`/caso/<slug>`)

### Análisis forense de audio
- ✅ Transcripción con timestamps (OpenAI Whisper)
- ✅ Análisis de pitch y energía vocal
- ✅ Detección de patrones de engaño
- ✅ Separación por hablantes
- ✅ Exportación como artefacto de texto

### Gestión organizacional (multi-tenant)
- ✅ Jerarquía: Master Admin → Sub-Master → Org Admin → Usuario
- ✅ Branding por org: logo + color primario + acento (herencia desde sub-master)
- ✅ Límites de presupuesto mensual y tokens por org
- ✅ Tasas de resale configurables por sub-master (costo vs precio MXN)
- ✅ Dashboard de utilidades para sub-master (costo vs precio vs margen)
- ✅ Invitaciones por magic link con roles pre-asignados
- ✅ Control granular de acceso a expedientes (todos / asignados)

### Autenticación y seguridad
- ✅ Google OAuth 2.0
- ✅ Magic links (7 días, single-use)
- ✅ Login con contraseña (PBKDF2-SHA256, 200 000 iteraciones)
- ✅ Rate limiting en solicitud de magic links (3/15min)
- ✅ Aprobación manual de usuarios
- ✅ Límites de tokens por usuario

---

## 8. Problemas actuales conocidos

### 🔴 Críticos (funcionalidad rota)
| # | Problema | Módulo | Estado |
|---|---------|--------|--------|
| — | — | — | No hay críticos activos en producción |

### 🟡 Menores / Edge cases
| # | Problema | Módulo | Workaround |
|---|---------|--------|-----------|
| 1 | **Max tokens exhaustion** en documentos muy largos | `chat.py` | `append_artifact` automático |
| 2 | **HTML incompleto** si save_artifact se corta | `chat.py:1400` | Auto-detectado, fuerza `append_artifact` |
| 3 | **Model anuncia herramientas sin ejecutarlas** ("execution language") | `chat.py:1267` | Auto-reintento con `tool_choice=any` |
| 4 | **Email** puede fallar si no hay SendGrid/SMTP configurado | `auth.py:560` | Devuelve el link directo en la respuesta |
| 5 | **Logos legados** con path `/api/admin/org-logo/...` en BD | `auth.py + _applyOrgBranding` | Normalización automática en frontend |
| 6 | **Transcripciones > 300 s** fallan por límite de librosa | `transcribe.py` | Dividir audio manualmente |
| 7 | **`_log_usage` falla** no bloquea el chat (silencioso) | `chat.py:318` | Non-blocking, no afecta usuario |

### 🔵 Limitaciones de diseño
| # | Limitación | Impacto |
|---|-----------|---------|
| 1 | Sin análisis espontáneo de documentos (regla soul #2) | El usuario debe pedir explícitamente el análisis |
| 2 | Sin invención de datos (regla soul #1) | Si falta información en el doc, Claude señala `[PENDIENTE]` |
| 3 | Audio máximo ~5 min (librosa) | Audios largos requieren división previa |
| 4 | Sin soporte de `.eml`, `.msg` o formatos propietarios | Solo MIME types en `ALLOWED_MIME` |
| 5 | Historial de chat en BD (no en sesión) | Alto volumen puede ralentizar queries |

---

## 9. Ventajas y desventajas

### ✅ Ventajas

**Arquitectura**
- **Sin dependencias JS** — SPA en vanilla JS, carga instantánea, sin bundler
- **Multi-modelo** — enruta automáticamente entre Haiku/Sonnet/Opus según complejidad
- **Prompt caching activo** — 3 breakpoints de caché reducen costos hasta 90% en conversaciones largas
- **Loop agéntico** — hasta 15 iteraciones con tool use encadenado sin intervención del usuario
- **SSE nativo** — streaming de respuestas sin WebSockets ni polling

**Negocio**
- **Multi-tenant con resale** — sub-masters pueden vender el sistema con su propio margen MXN
- **Branding completo** — logo + colores heredables por organización
- **Facturación granular** — costo real USD vs precio MXN con tasas configurables
- **Acceso offline-first** — los documentos se almacenan localmente (filesystem + BD)

**Legal**
- **Reglas de no-invención** estrictas → confianza en documentos generados
- **Análisis forense de audio** integrado → diferenciador único en el mercado legal
- **Búsqueda de jurisprudencia** y validación de cumplimiento normativo
- **Exportación Word** → documentos editables listos para firma

### ❌ Desventajas

**Escalabilidad**
- **Single-server** — PM2 en un solo VPS, sin load balancer ni réplicas
- **Filesystem uploads** — archivos en disco local, no en S3/CDN; backup manual necesario
- **MySQL single-instance** — sin réplica de lectura, cuello de botella en reportes
- **Sesiones en memoria Flask** — no distribuibles horizontalmente

**Mantenimiento**
- **SPA monolítica** — `index.html` de ~3 600 líneas, difícil de mantener en equipo
- **Sin tests automatizados** — no hay suite de pruebas unitarias ni E2E
- **Sin CI/CD** — deploy manual vía SSH + `cp` + `pm2 restart`
- **Dependencia de API keys externas** — si Anthropic/fal.ai/OpenAI caen, el sistema se degrada

**Funcional**
- **Sin versionado de artefactos** — sobrescritura sin historial de cambios
- **Sin búsqueda full-text** en documentos (solo por nombre/tipo)
- **Sin notificaciones** — el usuario debe consultar manualmente el estado
- **Chat history en BD** — no hay límite configurable de retención

---

## 10. Autodiagnóstico

### Estado general del sistema: 🟢 Operativo

```
Componente              Estado    Notas
──────────────────────  ────────  ──────────────────────────────────────────
Flask API               🟢 OK     Puerto 5005, PM2 activo
MySQL                   🟢 OK     10 tablas, migraciones aplicadas
Anthropic Claude        🟢 OK     claude-sonnet-4-6 / haiku / opus
Prompt caching          🟢 OK     3 breakpoints activos (SOUL + ctx + historia)
Flux.1 (imágenes)       🟢 OK     FAL_KEY configurada
OpenAI Whisper          🟢 OK     OPENAI_API_KEY configurada
Google OAuth            🟢 OK     Client ID configurado
Subida de archivos      🟢 OK     ZIP recursivo, 9 MIME groups, OCR
Branding / logos        🟢 OK     Path normalizado /OCR/v59/api/...
Dashboard sub-master    🟢 OK     Utilidad MXN con desglose por org/usuario
Dashboard org-admin     🟢 OK     Consumo MXN por usuario/expediente/artefacto
Herencia de branding    🟢 OK     sub_master → org si org no tiene logo/colores
Word (.docx)            🟢 OK     Tablas Markdown → python-docx (una tabla por bloque)
```

### Métricas de costo estimadas (por 1 000 tokens de input)

| Modelo | Sin caché | Con caché (hit 80%) |
|--------|----------|---------------------|
| Haiku | $0.0008 | $0.00016 |
| Sonnet | $0.003 | $0.0006 |
| Opus | $0.015 | $0.003 |

> Con 3 breakpoints de caché activos, una conversación de 10 turnos en el mismo expediente
> puede reducir el costo de tokens de entrada en **70–85%** respecto a llamadas sin caché.

### Rutas de mejora prioritarias

| Prioridad | Mejora | Impacto |
|-----------|--------|---------|
| 🔴 Alta | Tests automatizados (pytest + playwright) | Evita regresiones en deploy |
| 🔴 Alta | Almacenamiento en objeto (S3/R2) para uploads | Escalabilidad y backup |
| 🟡 Media | Versionado de artefactos (historial de cambios) | Trazabilidad legal |
| 🟡 Media | Búsqueda full-text en documentos (MySQL FULLTEXT o Elasticsearch) | UX |
| 🟡 Media | CI/CD (GitHub Actions → deploy automático) | Velocidad de iteración |
| 🟢 Baja | Split de `index.html` en componentes | Mantenibilidad |
| 🟢 Baja | Réplica de lectura MySQL | Performance en reportes |

---

*VILAR Legal OS v59 · `claude/ocr-v59-implementation-vOcPD` · 2026-05-13*
