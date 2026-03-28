import os, re, json, traceback, threading, queue, time, logging, uuid
import concurrent.futures
from flask import Blueprint, request, Response, stream_with_context, jsonify, session
import anthropic

from tools.db import query, execute
from openclaw.tool_router import handle_tool
from routes.auth import require_login

chat_bp = Blueprint('chat', __name__)
log = logging.getLogger('chat')

# Señal que Claude emite al final de un turno masivo para auto-continuar
_AUTO_CONTINUE = '↩️ Continúo'

# Detecta cuando Claude anuncia herramientas en texto pero no las ejecuta (stop_reason=end_turn)
_EXECUTION_LANGUAGE = re.compile(
    r'(lanzo|ejecuto|'
    r'voy a (?:llamar|lanzar|ejecutar|guardar|generar|crear|analizar|proceder)|'
    r'llamo ahora|procedo a (?:llamar|ejecutar|guardar|generar)|'
    r'ahora (?:lanzo|ejecuto|llamo|guardo|genero|procedo)|'
    r'llamar[eé] a|ejecutar[eé]|anali[zs]o ahora|'
    r'guardo directamente|genero ahora|generando (?:el|la|un|una)\s|'
    r'guardarlo.{0,40}save_artifact|save_artifact|analyze_audio)',
    re.IGNORECASE
)

# Mensajes de estado por herramienta, con umbral de tiempo en segundos
# (t_seg_mínimo, mensaje)  — se emite cuando elapsed >= t_seg y el mensaje cambia
_STATUS_STEPS = {
    'analyze_audio': [
        (0,   'Subiendo audio a Whisper API…'),
        (20,  'Transcribiendo con timestamps de palabras y segmentos…'),
        (60,  'Procesando — archivos grandes pueden tardar 2–4 min más…'),
        (120, 'Detectando pausas y marcadores paralingüísticos…'),
        (180, 'Calculando pitch F0 y energía RMS con librosa…'),
        (240, 'Construyendo reporte forense vocal…'),
    ],
    'generate_image': [
        (0,  'Enviando prompt a Flux.1 (fal.ai)…'),
        (15, 'Renderizando — procesando composición y detalles…'),
        (40, 'Finalizando imagen y guardando en el expediente…'),
    ],
    'save_artifact': [
        (0, 'Guardando artefacto en base de datos…'),
    ],
    'append_artifact': [
        (0, 'Añadiendo contenido al artefacto…'),
    ],
    'list_case_contents': [
        (0, 'Consultando inventario completo del expediente…'),
    ],
    'search_precedents': [
        (0, 'Buscando jurisprudencia y precedentes legales…'),
    ],
    'validate_document': [
        (0, 'Verificando requisitos legales del documento…'),
    ],
    'export_to_jotform': [
        (0, 'Exportando datos del caso a JotForm…'),
    ],
    'create_case': [
        (0, 'Creando nuevo expediente en la base de datos…'),
    ],
    'save_session_notes': [
        (0, 'Guardando notas de sesión…'),
    ],
}

# ── Modelos disponibles ────────────────────────────────────────────────────────
_MODEL_HAIKU  = "claude-haiku-4-5-20251001"
_MODEL_SONNET = "claude-sonnet-4-6"
_MODEL_OPUS   = "claude-opus-4-6"

# Modelo por tipo de artefacto
_MODEL_BY_TYPE = {
    "summary":   _MODEL_HAIKU,    # resúmenes → Haiku (rápido y barato)
    "checklist": _MODEL_HAIKU,    # checklists → Haiku
    "html":      _MODEL_SONNET,   # HTML / reportes visuales → Sonnet
    "contract":  _MODEL_SONNET,   # contratos → Sonnet
    "brief":     _MODEL_SONNET,   # escritos → Sonnet
    "analysis":  _MODEL_SONNET,   # análisis → Sonnet por defecto
}

# Palabras clave que escalan a Opus (solo para análisis forense muy exigente)
_OPUS_KEYWORDS = re.compile(
    r'\b(usa opus|con opus|'
    r'análisis (?:muy )?(?:profundo|exhaustivo|completo) (?:de todos|de cada|forense)|'
    r'revisión exhaustiva completa)\b',
    re.IGNORECASE
)

def _select_model(artifact_type: str, message: str) -> str:
    """Elige el modelo más económico suficiente para la tarea."""
    if _OPUS_KEYWORDS.search(message or ''):
        return _MODEL_OPUS
    return _MODEL_BY_TYPE.get(artifact_type, _MODEL_SONNET)


# ── Orquestador multi-agente ───────────────────────────────────────────────────
_ORCHESTRATOR_PROMPT = (
    "Classify this legal assistant request. Reply ONLY with compact JSON, no explanation.\n"
    "Categories:\n"
    "  forensic   — audio analysis, vocal profile, transcription, mendacity\n"
    "  document   — generate HTML report, contract, brief, written analysis\n"
    "  management — case ops, notes, checklists, export, create case\n"
    "  legal      — jurisprudence, precedents, document validation\n"
    "  general    — conversation, questions, anything else\n"
    'Reply format: {"a":"category"}'
)

_AGENT_CONFIGS: dict = {
    'forensic': {
        'model': _MODEL_SONNET,
        'tools': {'analyze_audio', 'save_artifact', 'append_artifact', 'list_case_contents', 'save_session_notes'},
        'icon':  '🎵',
        'label': 'Forense',
        'focus': (
            "═══ AGENTE FORENSE ACTIVO ═══\n"
            "Especialidad: análisis de audio forense, perfil vocal, detección de mendacidad.\n"
            "PROTOCOLO OBLIGATORIO:\n"
            "1. Usa list_case_contents si no conoces los audios del expediente.\n"
            "2. Llama analyze_audio para CADA audio relevante — puedes llamar varios en un mismo turno para ejecución paralela.\n"
            "3. Con todos los resultados, llama save_artifact(artifact_type='html') generando el reporte completo sin cortar.\n"
            "PROHIBIDO: declarar análisis completo sin haber llamado las herramientas y recibido sus resultados reales."
        ),
    },
    'document': {
        'model': _MODEL_SONNET,
        'tools': {'save_artifact', 'append_artifact', 'list_case_contents'},
        'icon':  '📄',
        'label': 'Documentos',
        'focus': (
            "═══ AGENTE DE DOCUMENTOS ACTIVO ═══\n"
            "Especialidad: generación de documentos legales y reportes HTML completos.\n"
            "PROTOCOLO OBLIGATORIO:\n"
            "1. Genera el documento COMPLETO de una sola vez — sin cortar ni resumir.\n"
            "2. Llama save_artifact INMEDIATAMENTE, sin texto previo de anuncio.\n"
            "3. Para HTML: incluir CSS glassmorphism completo + JS interactivo + todo el contenido analítico.\n"
            "PROHIBIDO: anunciar que guardarás sin llamar save_artifact de inmediato."
        ),
    },
    'management': {
        'model': _MODEL_HAIKU,
        'tools': {'create_case', 'list_case_contents', 'save_session_notes', 'export_to_jotform'},
        'icon':  '📁',
        'label': 'Gestión',
        'focus': (
            "═══ AGENTE DE GESTIÓN ACTIVO ═══\n"
            "Especialidad: gestión de expedientes, notas de sesión, exportaciones.\n"
            "Sé eficiente y directo. Ejecuta las herramientas de gestión sin demora."
        ),
    },
    'legal': {
        'model': _MODEL_SONNET,
        'tools': {'search_precedents', 'validate_document', 'save_artifact', 'append_artifact', 'list_case_contents'},
        'icon':  '⚖️',
        'label': 'Legal',
        'focus': (
            "═══ AGENTE LEGAL ACTIVO ═══\n"
            "Especialidad: jurisprudencia mexicana, precedentes, validación de documentos legales.\n"
            "Cita fuentes específicas (SCJN, Tribunales Colegiados, DOF) y aplica rigor técnico-legal."
        ),
    },
    'general': {
        'model': None,   # usa _select_model()
        'tools': None,   # todas las herramientas
        'icon':  '🌐',
        'label': 'General',
        'focus': None,
    },
}

def _classify_intent(client, message: str) -> str:
    """Usa Haiku para clasificar la intención en < 800ms."""
    try:
        resp = client.messages.create(
            model=_MODEL_HAIKU,
            max_tokens=12,
            system=_ORCHESTRATOR_PROMPT,
            messages=[{"role": "user", "content": message[:600]}],
        )
        text = resp.content[0].text.strip() if resp.content else '{}'
        return json.loads(text).get('a', 'general')
    except Exception:
        return 'general'

def _filter_tool_defs(allowed: set | None) -> list:
    """Filtra TOOL_DEFS por conjunto de nombres permitidos."""
    if not allowed:
        return TOOL_DEFS
    return [t for t in TOOL_DEFS if t['name'] in allowed]


_MODEL_SHORT = {
    _MODEL_HAIKU:  'Haiku',
    _MODEL_SONNET: 'Sonnet',
    _MODEL_OPUS:   'Opus',
}

def _auto_diagnose(tb: str, model: str, artifact_type: str, max_tokens: int) -> dict:
    """Traduce un traceback en diagnóstico amigable para usuario y desarrollador."""
    lines   = [l.strip() for l in tb.strip().split('\n') if l.strip()]
    last    = lines[-1] if lines else 'Error desconocido'
    file_   = next((l for l in lines if 'File "' in l), '')

    user_msg   = '⚠️ Ocurrió un error procesando tu solicitud.'
    dev_steps  = [
        f'Traceback: {last}',
        f'Archivo: {file_}',
        f'Modelo: {model} · tipo: {artifact_type} · max_tokens: {max_tokens}',
        'Ver logs completos: pm2 logs vilar-legal-os-v59 --lines 200',
    ]
    fix_code = None

    tb_low = tb.lower()
    if 'max_tokens' in tb_low or ("stop_reason" in tb_low and "tool_use" not in tb_low):
        user_msg  = '⚠️ El documento generado excedió el límite de longitud configurado.'
        new_limit = min(max_tokens * 2, 64000)
        fix_code  = (f"# En ocr/v59/api/routes/chat.py:\n"
                     f"MAX_TOKENS_BY_TYPE['{artifact_type}'] = {new_limit}")
        dev_steps = [
            f'Causa: max_tokens={max_tokens} insuficiente para tipo "{artifact_type}"',
            f'El modelo truncó la respuesta (stop_reason=max_tokens)',
            f'Fix recomendado: aumentar a {new_limit}',
            f'Ver: grep MAX_TOKENS_BY_TYPE /var/www/catalogos/OCR/v59/api/routes/chat.py',
        ]
    elif 'apierror' in tb_low or 'authenticationerror' in tb_low or 'rate_limit' in tb_low:
        user_msg = '⚠️ Error al conectar con la API de Anthropic.'
        dev_steps = [
            'Verificar ANTHROPIC_API_KEY en /var/www/catalogos/OCR/v59/api/.env',
            'Verificar créditos: console.anthropic.com → Settings → Billing',
            f'Modelo fallido: {model}',
            'pm2 logs vilar-legal-os-v59 --lines 50 | grep -i error',
        ]
    elif 'mysql' in tb_low or 'operationalerror' in tb_low or 'database' in tb_low:
        user_msg = '⚠️ Error de base de datos.'
        dev_steps = [
            'Verificar DB_HOST, DB_NAME, DB_USER, DB_PASS en .env',
            'systemctl status mysql',
            'mysql -u $DB_USER -p$DB_PASS -e "SELECT 1"',
        ]
    elif 'memoryerror' in tb_low or 'oom' in tb_low:
        user_msg = '⚠️ El audio es demasiado grande para procesar en memoria.'
        dev_steps = [
            'librosa cargó demasiados frames — audio muy largo o alta frecuencia',
            'Verificar límite en tool_router.py: sr=16000, duration=300',
            'Considerar aumentar RAM del servidor o dividir el audio',
        ]
    elif 'timeout' in tb_low or 'timed out' in tb_low:
        user_msg = '⚠️ La operación tardó demasiado (timeout).'
        dev_steps = [
            'Verificar timeout del cliente OpenAI en tool_router.py',
            'El archivo de audio puede ser demasiado grande para Whisper API',
            'Límite Whisper: 25MB — verificar tamaño del archivo',
        ]
    elif 'json' in tb_low and ('decode' in tb_low or 'parse' in tb_low):
        user_msg = '⚠️ Error al interpretar la respuesta del modelo.'
        dev_steps = [
            'El modelo generó JSON malformado — posible truncamiento',
            f'Aumentar max_tokens (actual: {max_tokens}) → 64000',
            'Revisar tool_definitions.json para esquema correcto',
        ]

    return {
        'user_msg': user_msg,
        'dev_steps': dev_steps,
        'fix_code':  fix_code,
        'last_error': last,
        'model': model,
        'artifact_type': artifact_type,
        'max_tokens': max_tokens,
    }


# ── Precios por modelo (USD / token) ──────────────────────────────────────────
_PRICES = {
    _MODEL_HAIKU:  dict(inp=0.80/1e6,  out=4.0/1e6,   cache=0.08/1e6),
    _MODEL_SONNET: dict(inp=3.0/1e6,   out=15.0/1e6,  cache=0.30/1e6),
    _MODEL_OPUS:   dict(inp=15.0/1e6,  out=75.0/1e6,  cache=1.50/1e6),
}

# Compatibilidad con código viejo que usa las constantes sueltas
_PRICE_INPUT      = _PRICES[_MODEL_OPUS]['inp']
_PRICE_OUTPUT     = _PRICES[_MODEL_OPUS]['out']
_PRICE_CACHE_READ = _PRICES[_MODEL_OPUS]['cache']


def _log_usage(user_id, case_id, model, usage):
    """Registra uso de tokens + costo estimado en api_usage."""
    if not user_id:
        return
    try:
        inp   = getattr(usage, 'input_tokens', 0) or 0
        out   = getattr(usage, 'output_tokens', 0) or 0
        cache = getattr(usage, 'cache_read_input_tokens', 0) or 0
        p     = _PRICES.get(model, _PRICES[_MODEL_OPUS])
        cost  = inp * p['inp'] + out * p['out'] + cache * p['cache']
        execute(
            """INSERT INTO api_usage
               (usage_id, user_id, case_id, model,
                input_tokens, output_tokens, cache_read_tokens, cost_usd)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
            (str(uuid.uuid4()), user_id, case_id or None, model,
             inp, out, cache, round(cost, 8))
        )
    except Exception as e:
        log.warning('_log_usage failed: %s', e)

SOUL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                         '..', 'openclaw', 'soul-v59.md')
with open(SOUL_PATH, 'r', encoding='utf-8') as _f:
    SOUL = _f.read()

TOOL_DEFS_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                              '..', 'openclaw', 'tool_definitions.json')
with open(TOOL_DEFS_PATH, 'r', encoding='utf-8') as _f:
    TOOL_DEFS = json.load(_f)

ARTIFACT_TEMPLATES = {
    "contract": (
        "Genera el CONTRATO COMPLETO Y EJECUTABLE. "
        "OBLIGATORIO incluir: todas las partes con datos completos, "
        "TODAS las cláusulas numeradas completas (no resumidas), "
        "declaraciones, antecedentes, firmas, fecha y lugar. "
        "El documento debe poder firmarse sin modificaciones. "
        "NO resumir ninguna cláusula. Si es largo, entregarlo completo. "
        "Usa los datos EXACTOS del documento fuente, sin inventar."
    ),
    "analysis": (
        "Genera un ANÁLISIS LEGAL COMPLETO Y EXHAUSTIVO. "
        "Incluye: resumen ejecutivo, identificación de partes, "
        "obligaciones clave, riesgos, fechas críticas y recomendaciones."
    ),
    "summary": (
        "Genera un RESUMEN EJECUTIVO conciso pero completo. "
        "Incluye los puntos más importantes del documento."
    ),
    "brief": (
        "Genera un ESCRITO LEGAL COMPLETO con formato profesional. "
        "Incluir encabezado, fundamentos de hecho y derecho, petitorio y firma."
    ),
    "html": (
        "Genera el documento completo en HTML limpio y semántico. "
        "Sin scripts ni estilos inline peligrosos."
    ),
    "checklist": (
        "Genera un CHECKLIST detallado en formato markdown con checkboxes [ ] "
        "para cada punto de acción o revisión necesario."
    ),
}

MAX_TOKENS_BY_TYPE = {
    "contract": 64000,
    "brief":    64000,
    "html":     64000,
    "analysis": 64000,
    "summary":  4096,
    "checklist":4096,
}


def _get_case_info(case_id: str) -> str:
    """Obtiene info del caso activo para incluir en el system prompt."""
    if not case_id:
        return ""
    row = query(
        "SELECT case_name, matter_type, status FROM cases WHERE case_id=%s",
        (case_id,)
    )
    if not row:
        return ""
    return (
        f"\n\n**EXPEDIENTE ACTIVO (YA EXISTE — NO CREAR NUEVO):**\n"
        f"- ID: {case_id}\n"
        f"- Nombre: {row['case_name']}\n"
        f"- Materia: {row.get('matter_type', '')}\n"
        f"- Estado: {row.get('status', '')}\n"
        f"REGLA: El expediente ya está creado y seleccionado. "
        f"NUNCA llamar a `create_case` para este caso. "
        f"Proceder directamente con el análisis o tarea solicitada."
    )


def _get_case_context(case_id: str) -> str:
    """Obtiene contexto de documentos del caso. Filtra texto vacío (fix CERO INVENCIÓN)."""
    rows = query(
        """SELECT artifact_id, filename, mime_type,
                  LEFT(extracted_text, 8000) AS snippet,
                  file_size_bytes, uploaded_at
           FROM user_artifacts
           WHERE case_id = %s
             AND extracted_text IS NOT NULL
             AND TRIM(extracted_text) != ''
           ORDER BY uploaded_at DESC
           LIMIT 10""",
        (case_id,), many=True
    )
    if not rows:
        return (
            "\n\n**IMPORTANTE:** No hay documentos con texto extraído en este caso. "
            "Si el usuario pregunta sobre documentos, responder: "
            "'No tengo acceso al contenido de los documentos. Por favor vuelve a subir el archivo.'"
        )

    parts = ["<documents>"]
    for i, r in enumerate(rows, 1):
        parts.append(
            f'<document index="{i}" '
            f'filename="{r["filename"]}" '
            f'type="{r["mime_type"]}" '
            f'size="{r.get("file_size_bytes", 0)}">'
            f'\n{r.get("snippet", "")}\n'
            f'</document>'
        )
    parts.append("</documents>")
    return "\n".join(parts)


def _get_specific_context(case_id: str, artifact_ids: list) -> str:
    """Obtiene contexto de artefactos específicos seleccionados por el usuario.
    Consulta tanto user_artifacts (archivos subidos) como system_artifacts
    (análisis, transcripciones y artefactos generados por Claude).
    """
    if not artifact_ids:
        return _get_case_context(case_id)

    placeholders = ','.join(['%s'] * len(artifact_ids))

    # ── 1. user_artifacts (archivos subidos, audio, imágenes) ────────────────
    user_rows = query(
        f"""SELECT artifact_id, filename, mime_type,
                   LEFT(extracted_text, 12000) AS snippet,
                   file_size_bytes
            FROM user_artifacts
            WHERE artifact_id IN ({placeholders})
              AND case_id = %s
            ORDER BY uploaded_at DESC""",
        (*artifact_ids, case_id), many=True
    ) or []

    found_ids = {r['artifact_id'] for r in user_rows}

    # ── 2. system_artifacts (análisis vocales, transcripciones, contratos…) ──
    sys_ids = [aid for aid in artifact_ids if aid not in found_ids]
    sys_rows = []
    if sys_ids:
        sys_ph = ','.join(['%s'] * len(sys_ids))
        sys_rows = query(
            f"""SELECT artifact_id,
                       artifact_name AS filename,
                       artifact_type AS mime_type,
                       LEFT(content, 12000) AS snippet,
                       file_size_bytes
                FROM system_artifacts
                WHERE artifact_id IN ({sys_ph})
                  AND case_id = %s
                ORDER BY created_at DESC""",
            (*sys_ids, case_id), many=True
        ) or []

    audio_rows = [r for r in user_rows
                  if (r.get('mime_type') or '').startswith(('audio/', 'video/'))]
    text_rows  = [r for r in user_rows
                  if r not in audio_rows
                  and r.get('snippet') and (r.get('snippet') or '').strip()]
    # system_artifacts son siempre texto/markdown
    text_rows += [r for r in sys_rows
                  if r.get('snippet') and (r.get('snippet') or '').strip()]

    parts = []

    # Archivos de texto con contenido (user + system)
    if text_rows:
        parts.append("<documents>")
        for i, r in enumerate(text_rows, 1):
            parts.append(
                f'<document index="{i}" '
                f'filename="{r["filename"]}" '
                f'type="{r["mime_type"]}" '
                f'size="{r.get("file_size_bytes", 0)}">'
                f'\n{r.get("snippet", "")}\n'
                f'</document>'
            )
        parts.append("</documents>")

    # Archivos de audio/video: proveer audio_id para que Claude use analyze_audio
    # SOLO si NO hay ya un análisis vocal en el contexto
    has_vocal_analysis = any(
        'Análisis vocal' in (r.get('filename') or '') for r in text_rows
    )
    if audio_rows and not has_vocal_analysis:
        parts.append("\n<audio_files_in_context>")
        parts.append("INSTRUCCIÓN: Para analizar estos audios llama analyze_audio con el audio_id correspondiente.")
        for r in audio_rows:
            parts.append(
                f'  audio_id={r["artifact_id"]} | {r["filename"]} '
                f'({round((r.get("file_size_bytes") or 0)/1048576, 1)} MB)'
            )
        parts.append("</audio_files_in_context>")
    elif audio_rows and has_vocal_analysis:
        # Los análisis vocales ya están en el contexto — no re-analizar
        parts.append("\n<audio_files_in_context>")
        parts.append("NOTA: Los análisis vocales de estos audios ya están disponibles en los documentos de contexto. "
                      "NO llames analyze_audio de nuevo. Usa los resultados ya obtenidos.")
        for r in audio_rows:
            parts.append(f'  {r["filename"]} — análisis ya completado, ver documentos de contexto')
        parts.append("</audio_files_in_context>")

    if not parts:
        return (
            "\n\n**IMPORTANTE:** Los documentos seleccionados no tienen texto extraído. "
            "Por favor vuelve a subirlos."
        )
    return "\n".join(parts)


def _make_system(soul: str, dynamic: str) -> list:
    """
    Dos bloques: SOUL con prompt caching (estático, se reutiliza entre llamadas)
    + contexto dinámico sin cache (inventario, documentos, etc.)
    """
    return [
        {"type": "text", "text": soul, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": dynamic},
    ]


def _get_case_inventory(case_id: str) -> str:
    """
    Genera un inventario compacto del expediente para inyectar en cada system prompt.
    Claude siempre sabrá qué existe sin necesidad de llamar list_case_contents.
    """
    if not case_id:
        return ""
    try:
        user_files = query(
            """SELECT artifact_id, filename, mime_type, file_size_bytes,
                      CHAR_LENGTH(COALESCE(extracted_text,'')) AS text_len
               FROM user_artifacts
               WHERE case_id=%s AND (
                   COALESCE(source,'') != 'system'
                   OR mime_type LIKE 'audio/%%'
                   OR mime_type LIKE 'video/%%'
               )
               ORDER BY uploaded_at ASC""",
            (case_id,), many=True
        ) or []

        gen_arts = query(
            """SELECT artifact_id, artifact_name, artifact_type, created_at,
                      LEFT(content, 5000) AS preview
               FROM system_artifacts
               WHERE case_id=%s AND COALESCE(artifact_type,'') != 'session_notes'
               ORDER BY created_at ASC""",
            (case_id,), many=True
        ) or []

        img_row = query(
            "SELECT COUNT(*) AS cnt FROM user_artifacts WHERE case_id=%s AND source='system'",
            (case_id,)
        )
        img_cnt = (img_row or {}).get('cnt', 0)

        notes_row = query(
            """SELECT content, created_at FROM system_artifacts
               WHERE case_id=%s AND artifact_type='session_notes'
               ORDER BY created_at DESC LIMIT 1""",
            (case_id,)
        )

        lines = ["<case_inventory>"]

        if user_files:
            lines.append(f"\nDOCUMENTOS SUBIDOS ({len(user_files)}):")
            for f in user_files:
                kb  = round((f.get('file_size_bytes') or 0) / 1024)
                mime = f.get('mime_type', '')
                if mime.startswith('audio/') or mime.startswith('video/'):
                    txt = f"audio_id={f['artifact_id']}"
                else:
                    txt = "texto ✅" if (f.get('text_len') or 0) > 100 else "sin texto ⚠️"
                lines.append(f"  - {f['filename']} ({kb} KB, {txt})")
        else:
            lines.append("\nDOCUMENTOS SUBIDOS: Ninguno")

        if gen_arts:
            lines.append(f"\nARTEFACTOS GENERADOS ({len(gen_arts)}):")
            for a in gen_arts:
                dt = str(a.get('created_at', ''))[:16]
                lines.append(f"  - [{a['artifact_id']}] {a['artifact_name']} [{a['artifact_type']}] — {dt}")
        else:
            lines.append("\nARTEFACTOS GENERADOS: Ninguno aún")

        if img_cnt:
            lines.append(f"\nIMÁGENES GENERADAS: {img_cnt}")

        if notes_row:
            dt = str(notes_row.get('created_at', ''))[:16]
            lines.append(f"\nNOTAS DE SESIÓN ANTERIOR ({dt}):")
            lines.append(notes_row['content'])

        # Inyectar contenido completo de artefactos generados
        if gen_arts:
            lines.append("\n<generated_artifacts_content>")
            total_chars = 0
            char_limit  = 24000   # tope total para no saturar el contexto
            for a in gen_arts:
                preview = (a.get('preview') or '').strip()
                if not preview:
                    continue
                header = (
                    f'\n<artifact id="{a["artifact_id"]}" '
                    f'name="{a["artifact_name"]}" '
                    f'type="{a["artifact_type"]}">'
                )
                # Para HTML: no inyectar el código crudo (principalmente CSS/JS)
                # — consume tokens sin aportar contexto analítico útil
                if a.get('artifact_type') == 'html':
                    lines.append(
                        f'{header}\n[HTML artefacto — {len(preview):,} chars — '
                        f'disponible para ver en Generados]\n</artifact>'
                    )
                    continue
                block = f"{header}\n{preview}\n</artifact>"
                if total_chars + len(block) > char_limit:
                    lines.append(f"<!-- {a['artifact_name']}: omitido por límite de contexto -->")
                    continue
                lines.append(block)
                total_chars += len(block)
            lines.append("</generated_artifacts_content>")

        lines.append("</case_inventory>")
        return "\n".join(lines)
    except Exception:
        return ""


def _run_agentic_loop(client, model, max_tokens, system, init_messages, case_id, user_id=None, max_iterations=5):
    """
    Ejecuta el loop agéntico completo:
    1. Llama a Claude
    2. Si hay tool calls, ejecuta las tools y alimenta los resultados de vuelta
    3. Repite hasta que no haya más tool calls o se alcance max_iterations
    Retorna (texto_final, lista_tool_results)
    """
    messages = list(init_messages)
    final_text = ""
    all_tool_results = []
    t0 = time.time()

    for iteration in range(max_iterations):
        text_this_round = ""
        t_round = time.time()

        with client.messages.stream(
            model=model,
            max_tokens=max_tokens,
            system=system,
            tools=TOOL_DEFS,
            messages=messages,
        ) as stream:
            for event in stream:
                if (hasattr(event, 'type')
                        and event.type == 'content_block_delta'
                        and hasattr(event, 'delta')
                        and getattr(event.delta, 'type', None) == 'text_delta'):
                    text_this_round += event.delta.text
            final_msg = stream.get_final_message()

        u = final_msg.usage
        cached = getattr(u, 'cache_read_input_tokens', 0)
        log.info('loop round=%d stop=%s in=%.0f cached=%.0f out=%.0f elapsed=%.2fs',
                 iteration, final_msg.stop_reason,
                 u.input_tokens, cached, u.output_tokens,
                 time.time() - t_round)
        _log_usage(user_id, case_id, model, u)

        final_text += text_this_round

        # Si no hay tool calls, terminamos
        if final_msg.stop_reason != 'tool_use':
            break

        # Construir el turno del asistente con todos los content blocks
        assistant_content = []
        for b in final_msg.content:
            if b.type == 'text':
                assistant_content.append({"type": "text", "text": b.text})
            elif b.type == 'tool_use':
                assistant_content.append({
                    "type": "tool_use",
                    "id": b.id,
                    "name": b.name,
                    "input": dict(b.input),
                })

        # Ejecutar cada tool y recolectar resultados
        tool_result_content = []
        for b in final_msg.content:
            if b.type != 'tool_use':
                continue
            t_tool = time.time()
            result = handle_tool(b.name, dict(b.input), case_id)
            log.info('tool %s took %.2fs', b.name, time.time() - t_tool)
            all_tool_results.append({"tool": b.name, "result": result})
            tool_result_content.append({
                "type": "tool_result",
                "tool_use_id": b.id,
                "content": json.dumps(result, ensure_ascii=False),
            })

        messages.append({"role": "assistant", "content": assistant_content})
        messages.append({"role": "user", "content": tool_result_content})

    log.info('agentic_loop done total=%.2fs words=%d', time.time() - t0, len(final_text.split()))
    return final_text, all_tool_results


@chat_bp.route('/api/chat/history/<case_id>', methods=['GET'])
def get_chat_history(case_id):
    # Fetch the 200 most-recent messages and return them in chronological order
    rows = query(
        """SELECT role, content, created_at
           FROM (
             SELECT role, content, created_at
             FROM chat_history
             WHERE case_id = %s
             ORDER BY created_at DESC
             LIMIT 200
           ) t
           ORDER BY created_at ASC""",
        (case_id,), many=True
    )
    return jsonify({"history": rows or []})


@chat_bp.route('/api/chat/history/<case_id>', methods=['DELETE'])
def clear_chat_history(case_id):
    execute("DELETE FROM chat_history WHERE case_id=%s", (case_id,))
    return jsonify({"status": "cleared"})


@chat_bp.route('/api/chat', methods=['POST'])
@require_login
def chat():
    """Main chat endpoint with full agentic loop support."""
    body = request.get_json(force=True, silent=True) or {}
    message       = body.get('message', '').strip()
    history       = body.get('history', [])[-22:]
    case_id       = body.get('case_id', '')
    artifact_type = body.get('artifact_type', 'analysis')
    selected_ids  = body.get('context_artifact_ids', body.get('selected_artifacts', []))
    user_id       = session.get('user_id')

    if not message:
        return jsonify({"error": "message requerido"}), 400

    if selected_ids:
        case_context = _get_specific_context(case_id, selected_ids)
    elif case_id:
        case_context = _get_case_context(case_id)
    else:
        case_context = ""

    case_info    = _get_case_info(case_id)
    art_template = ARTIFACT_TEMPLATES.get(artifact_type, ARTIFACT_TEMPLATES["analysis"])
    max_tokens   = MAX_TOKENS_BY_TYPE.get(artifact_type, 32000)

    long_types = {'contract', 'brief', 'html'}
    length_rule = (
        "**REGLA DE LONGITUD:** Para este artefacto NO hay límite de longitud. "
        "Entregar el documento COMPLETO sin cortar ni resumir."
        if artifact_type in long_types else
        "**REGLA DE LONGITUD:** Ser conciso pero exhaustivo."
    )

    case_inventory = _get_case_inventory(case_id)
    dynamic = (
        f"{case_inventory}\n\n"
        f"{case_info}\n\n"
        f"{length_rule}\n\n"
        f"**TIPO DE ARTEFACTO ACTIVO:** {artifact_type}\n"
        f"{art_template}\n"
        f"{case_context}"
    )
    system_blocks = _make_system(SOUL, dynamic)

    messages = []
    for h in history:
        role = h.get('role', 'user')
        if role not in ('user', 'assistant'):
            continue
        messages.append({"role": role, "content": h.get('content', '')})
    messages.append({"role": "user", "content": message})

    client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
    model  = _select_model(artifact_type, message)

    t0 = time.time()
    log.info('chat start | case=%s type=%s model=%s', case_id, artifact_type, model)
    try:
        full_text, tool_results = _run_agentic_loop(
            client=client,
            model=model,
            max_tokens=max_tokens,
            system=system_blocks,
            init_messages=messages,
            case_id=case_id,
            user_id=user_id,
        )

        log.info('chat done | %.2fs | words=%d', time.time() - t0, len(full_text.split()))
        if case_id and full_text:
            try:
                execute(
                    "INSERT INTO chat_history (case_id, role, content) VALUES (%s,'user',%s)",
                    (case_id, message)
                )
                execute(
                    "INSERT INTO chat_history (case_id, role, content) VALUES (%s,'assistant',%s)",
                    (case_id, full_text)
                )
            except Exception as e:
                log.error('chat_history save failed: %s', e)

        # Recargar artefactos si se guardó alguno
        saved = any(r.get('tool') == 'save_artifact' and r.get('result', {}).get('status') == 'saved'
                    for r in tool_results)

        resp = {"response": full_text}
        if tool_results:
            resp["tool_results"] = tool_results
        if saved:
            resp["artifact_saved"] = True
        return jsonify(resp)

    except anthropic.APIError as e:
        return jsonify({"error": f"API Error: {str(e)}"}), 502
    except Exception:
        err = traceback.format_exc()
        print(err)
        return jsonify({"error": "Error interno del servidor"}), 500


@chat_bp.route('/api/v1/chat/stream', methods=['POST'])
@require_login
def chat_stream():
    body = request.get_json(force=True, silent=True) or {}
    message       = body.get('message', '').strip()
    history       = body.get('history', [])[-22:]
    case_id       = body.get('case_id', '')
    artifact_type = body.get('artifact_type', 'analysis')
    selected_ids  = body.get('selected_artifacts', [])
    user_id       = session.get('user_id')

    if not message:
        return jsonify({"error": "message requerido"}), 400

    if selected_ids:
        case_context = _get_specific_context(case_id, selected_ids)
    elif case_id:
        case_context = _get_case_context(case_id)
    else:
        case_context = ""

    case_info    = _get_case_info(case_id)
    art_template = ARTIFACT_TEMPLATES.get(artifact_type, ARTIFACT_TEMPLATES["analysis"])
    max_tokens   = MAX_TOKENS_BY_TYPE.get(artifact_type, 32000)

    long_types = {'contract', 'brief', 'html'}
    length_rule = (
        "**REGLA DE LONGITUD:** Para este artefacto NO hay límite de longitud. "
        "Entregar el documento COMPLETO sin cortar ni resumir."
        if artifact_type in long_types else
        "**REGLA DE LONGITUD:** Ser conciso pero exhaustivo."
    )

    case_inventory = _get_case_inventory(case_id)
    dynamic = (
        f"{case_inventory}\n\n"
        f"{case_info}\n\n"
        f"{length_rule}\n\n"
        f"**TIPO DE ARTEFACTO ACTIVO:** {artifact_type}\n"
        f"{art_template}\n"
        f"{case_context}"
    )
    system_blocks = _make_system(SOUL, dynamic)

    messages = []
    for h in history:
        role = h.get('role', 'user')
        if role not in ('user', 'assistant'):
            continue
        messages.append({"role": role, "content": h.get('content', '')})
    messages.append({"role": "user", "content": message})

    client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
    model  = _select_model(artifact_type, message)
    q: queue.Queue = queue.Queue()   # ilimitado — worker escribe, SSE lee
    t_start = time.time()
    log.info('chat_stream start | case=%s type=%s model=%s', case_id, artifact_type, model)

    def worker():
        """
        Corre el loop agéntico en un hilo independiente.
        Pone eventos en `q` para que el SSE los sirva.
        Guarda en chat_history en el bloque `finally`,
        independientemente de si el cliente sigue conectado.
        """
        accumulated: list[str] = []
        t_first = [None]

        def emit_op(icon: str, msg: str, detail: str = None, level: str = 'info'):
            """Emite un evento de log operacional al frontend."""
            q.put(('op_log', {'icon': icon, 'msg': msg, 'detail': detail, 'level': level}))

        # ── Clasificar intención → seleccionar agente especializado ──────────
        agent_key    = _classify_intent(client, message)
        agent_cfg    = _AGENT_CONFIGS.get(agent_key, _AGENT_CONFIGS['general'])
        _model       = agent_cfg['model'] or model
        _agent_tools = _filter_tool_defs(agent_cfg.get('tools'))
        mshort       = _MODEL_SHORT.get(_model, _model)
        agent_icon   = agent_cfg['icon']
        agent_label  = agent_cfg['label']
        # Añadir foco del agente al system prompt dinámico
        _system_blocks = system_blocks
        if agent_cfg.get('focus'):
            _dyn_with_focus = dynamic + f"\n\n{agent_cfg['focus']}"
            _system_blocks  = _make_system(SOUL, _dyn_with_focus)

        # Contexto inicial
        n_ctx = len(selected_ids) if selected_ids else 0
        emit_op('🚀', f'Iniciando · {mshort} · caso {case_id or "sin caso"}',
                detail=f'Tipo: {artifact_type} · max_tokens: {max_tokens:,} · contexto: {n_ctx} artefactos')
        emit_op(agent_icon, f'Agente {agent_label} activado',
                detail=f'Clasificación: {agent_key} · Herramientas: {len(_agent_tools)}')

        try:
            current_messages = list(messages)
            _force_tool = False   # cuando True: próxima iteración usa tool_choice=any
            for iteration in range(15):   # 15 = 5 tool-use + hasta 10 auto-continuaciones
                emit_op('🧠', f'Consultando {mshort} — iteración {iteration + 1}…',
                        detail=f'Historial: {len(current_messages)} mensajes · tool_choice: {"any" if _force_tool else "auto"}')
                text_this_round = ""
                t_round = time.time()

                stream_kwargs = dict(
                    model=_model,
                    max_tokens=max_tokens,
                    system=_system_blocks,
                    tools=_agent_tools,
                    messages=current_messages,
                )
                if _force_tool:
                    # Forzar al modelo a ejecutar AL MENOS una herramienta
                    stream_kwargs["tool_choice"] = {"type": "any"}
                    _force_tool = False
                    log.info('tool_choice=any forced at iteration %d', iteration)

                _ka_time         = [time.time()]  # último keepalive/text emitido
                _early_tools     = set()          # tools ya anunciadas en content_block_start
                _gen_tool        = [None]          # tool cuyo JSON se está generando ahora
                _gen_start       = [0.0]           # cuándo empezó la generación del JSON
                _gen_status_at   = [0.0]           # cuándo se emitió el último status de generación

                # Mensajes de estado durante la fase de generación del JSON del tool call
                _GEN_STATUS = {
                    'save_artifact': [
                        (0,  'Generando contenido del artefacto…'),
                        (20, 'Redactando — documentos HTML largos tardan 1–2 min…'),
                        (45, 'Construyendo secciones del análisis…'),
                        (80, 'Generando gráficas Chart.js y visualizaciones…'),
                        (120,'Redactando veredictos y recomendaciones…'),
                    ],
                    'append_artifact': [
                        (0,  'Generando segunda parte del documento…'),
                        (20, 'Redactando secciones restantes del análisis…'),
                        (45, 'Finalizando veredictos y recomendaciones…'),
                        (75, 'Finalizando referencias y estructura…'),
                        (110,'Completando el documento…'),
                    ],
                    'analyze_audio': [
                        (0,  'Preparando análisis de audio…'),
                    ],
                }

                def _maybe_keepalive():
                    now = time.time()
                    if now - _ka_time[0] >= 8:
                        q.put(('keepalive', None))
                        _ka_time[0] = now

                def _maybe_gen_status():
                    """Emite mensajes de estado progresivos mientras Claude genera el JSON."""
                    if not _gen_tool[0]:
                        return
                    now  = time.time()
                    if now - _gen_status_at[0] < 18:   # como máximo cada 18 segundos
                        return
                    elapsed = now - _gen_start[0]
                    steps   = _GEN_STATUS.get(_gen_tool[0], [])
                    msg     = None
                    for t_s, m in reversed(steps):
                        if elapsed >= t_s:
                            msg = m
                            break
                    if msg:
                        q.put(('tool_status', {'tool': _gen_tool[0], 'msg': msg}))
                        _gen_status_at[0] = now

                with client.messages.stream(**stream_kwargs) as stream:
                    for event in stream:
                        etype = getattr(event, 'type', None)

                        # Anunciar tool call en cuanto Claude lo declara (antes del JSON)
                        if etype == 'content_block_start':
                            cb = getattr(event, 'content_block', None)
                            if cb and getattr(cb, 'type', None) == 'tool_use':
                                tname = cb.name
                                if tname not in _early_tools:
                                    _early_tools.add(tname)
                                    q.put(('tool_start', tname))
                                    _steps_e = _STATUS_STEPS.get(tname, [])
                                    init_msg = _GEN_STATUS.get(tname, [(0, None)])[0][1]
                                    if init_msg:
                                        q.put(('tool_status', {'tool': tname, 'msg': init_msg}))
                                    _ka_time[0]       = time.time()
                                    _gen_tool[0]      = tname
                                    _gen_start[0]     = time.time()
                                    _gen_status_at[0] = time.time()

                        elif etype == 'content_block_stop':
                            _gen_tool[0] = None   # terminó de generar el JSON

                        elif etype == 'content_block_delta' and hasattr(event, 'delta'):
                            dtype = getattr(event.delta, 'type', None)
                            if dtype == 'text_delta':
                                chunk = event.delta.text
                                if t_first[0] is None:
                                    t_first[0] = time.time()
                                    log.info('first token %.2fs', t_first[0] - t_start)
                                    emit_op('📡', f'Primer token en {t_first[0]-t_start:.1f}s — generando respuesta…')
                                text_this_round += chunk
                                accumulated.append(chunk)
                                q.put(('text', chunk))
                                _ka_time[0] = time.time()
                            elif dtype == 'input_json_delta':
                                # Claude construyendo el JSON del tool call — mantener SSE vivo
                                _maybe_keepalive()
                                _maybe_gen_status()

                    final_msg = stream.get_final_message()

                u = final_msg.usage
                cached = getattr(u, 'cache_read_input_tokens', 0)
                log.info('stream round=%d stop=%s in=%.0f cached=%.0f out=%.0f %.2fs',
                         iteration, final_msg.stop_reason,
                         u.input_tokens, cached, u.output_tokens,
                         time.time() - t_round)
                _log_usage(user_id, case_id, _model, u)
                p_    = _PRICES.get(_model, _PRICES[_MODEL_OPUS])
                cost_ = (u.input_tokens * p_['inp'] +
                         u.output_tokens * p_['out'] +
                         cached * p_['cache'])
                emit_op('📊',
                        f'Tokens · {u.input_tokens:,} entrada + {u.output_tokens:,} salida',
                        detail=f'Cache: {cached:,} · Costo: ${cost_:.4f} USD · Modelo: {mshort}')
                q.put(('token_usage', {
                    'model':      mshort,
                    'iteration':  iteration + 1,
                    'input':      u.input_tokens,
                    'output':     u.output_tokens,
                    'cache':      cached,
                    'cost_usd':   round(cost_, 6),
                    'stop':       final_msg.stop_reason,
                }))

                if final_msg.stop_reason != 'tool_use':
                    # ── Detectar truncamiento de tool call por max_tokens ─────────
                    if final_msg.stop_reason == 'max_tokens':
                        truncated = [b for b in final_msg.content if b.type == 'tool_use']
                        if truncated and iteration < 3:
                            tnames = ', '.join(b.name for b in truncated)
                            emit_op('⚠️',
                                    f'Contenido truncado ({tnames}) — reintentando compacto…',
                                    detail=f'max_tokens={max_tokens:,} insuficiente. '
                                           f'Solicitando HTML compacto.',
                                    level='warn')
                            log.warning('max_tokens truncation of tool_use %s at iter %d',
                                        tnames, iteration)
                            # Añadir solo el texto generado (sin el tool_use incompleto)
                            if text_this_round:
                                current_messages.append({
                                    "role": "assistant", "content": text_this_round
                                })
                            current_messages.append({"role": "user", "content": (
                                f"El contenido de {tnames} fue truncado (excedió "
                                f"{max_tokens:,} tokens). "
                                f"NO reduzcas el contenido analítico — usa estrategia de "
                                f"dos llamadas:\n"
                                f"1. save_artifact con la PRIMERA PARTE completa "
                                f"(HTML head + <style> completo + primeras secciones "
                                f"analíticas hasta aproximadamente la mitad del cuerpo)\n"
                                f"2. append_artifact(artifact_id=ID_de_paso_1, "
                                f"content_chunk=SEGUNDA_PARTE con las secciones restantes "
                                f"+ </body></html>)\n"
                                f"El sistema concatena ambas partes automáticamente. "
                                f"El análisis debe ser COMPLETO Y RICO — todos los datos, "
                                f"gráficas, valoraciones y veredictos sin reducir."
                            )})
                            _force_tool = True
                            continue   # reintentar con contenido compacto

                    # Detectar señal de auto-continuación (tareas masivas §11)
                    if _AUTO_CONTINUE in text_this_round:
                        log.info('auto-continue detected at iteration %d', iteration)
                        current_messages.append({"role": "assistant", "content": text_this_round})
                        current_messages.append({"role": "user",
                                                 "content": "Continúa con los entregables pendientes."})
                        q.put(('auto_continue', None))
                        continue   # siguiente iteración sin esperar al usuario

                    # Detectar lenguaje de ejecución sin tool_use — máx 1 reintento
                    if _EXECUTION_LANGUAGE.search(text_this_round) and iteration < 1:
                        log.warning('[WARN] execution language but 0 tool_calls emitted '
                                    '(round=%d) — forcing tool_choice=any on retry', iteration)
                        current_messages.append({"role": "assistant", "content": text_this_round})
                        # Detectar si ya hay análisis vocales en el contexto
                        ctx_str = ' '.join(
                            m.get('content', '') if isinstance(m.get('content'), str)
                            else str(m.get('content', ''))
                            for m in current_messages
                        )
                        has_analysis_in_ctx = 'Análisis vocal' in ctx_str
                        extra = (
                            " IMPORTANTE: el análisis vocal ya está en el contexto — "
                            "llama save_artifact para guardar el HTML/reporte, NO analyze_audio."
                            if has_analysis_in_ctx else ""
                        )
                        current_messages.append({
                            "role": "user",
                            "content": (
                                "NO ejecutaste ninguna herramienta. "
                                "Está PROHIBIDO declarar que un análisis fue completado sin haber "
                                "llamado la herramienta. "
                                "Llama save_artifact o la herramienta apropiada AHORA. "
                                "Solo tool call — cero texto." + extra
                            )
                        })
                        _force_tool = True   # próxima iteración: tool_choice=any
                        continue   # reintentar

                    break          # fin normal

                assistant_content = []
                for b in final_msg.content:
                    if b.type == 'text':
                        assistant_content.append({"type": "text", "text": b.text})
                    elif b.type == 'tool_use':
                        assistant_content.append({
                            "type": "tool_use", "id": b.id,
                            "name": b.name, "input": dict(b.input),
                        })

                tool_use_blocks    = [b for b in final_msg.content if b.type == 'tool_use']
                tool_result_content = []

                if tool_use_blocks:
                    # ── 1. Anunciar todas las herramientas ────────────────────────
                    for b in tool_use_blocks:
                        if b.name not in _early_tools:
                            q.put(('tool_start', b.name))
                            _steps0 = _STATUS_STEPS.get(b.name, [])
                            if _steps0:
                                q.put(('tool_status', {'tool': b.name, 'msg': _steps0[0][1]}))
                        emit_op('🔧', f'Ejecutando: {b.name}',
                                detail=f'Input keys: {list(dict(b.input).keys())}')

                    # ── 2. Lanzar todas en paralelo ───────────────────────────────
                    _exec      = concurrent.futures.ThreadPoolExecutor(
                                     max_workers=min(len(tool_use_blocks), 4))
                    _t_starts  = {}
                    _futs      = {}
                    _last_stat = {}
                    for b in tool_use_blocks:
                        _t_starts[b.id]  = time.time()
                        _last_stat[b.name] = None
                        _futs[b.id] = (b, _exec.submit(handle_tool, b.name,
                                                        dict(b.input), case_id))

                    # ── 3. Esperar con keepalives y estados progresivos ────────────
                    _pending = {b.id for b in tool_use_blocks}
                    while _pending:
                        done_ids = {tid for tid in _pending if _futs[tid][1].done()}
                        _pending -= done_ids
                        if _pending:
                            time.sleep(0.5)
                            _maybe_keepalive()
                            for tid in list(_pending):
                                b_    = _futs[tid][0]
                                t_el  = time.time() - _t_starts[tid]
                                _st   = _STATUS_STEPS.get(b_.name, [])
                                smsg  = None
                                for t_s, m in reversed(_st):
                                    if t_el >= t_s:
                                        smsg = m
                                        break
                                if smsg and smsg != _last_stat.get(b_.name):
                                    _last_stat[b_.name] = smsg
                                    q.put(('tool_status', {'tool': b_.name, 'msg': smsg}))

                    _exec.shutdown(wait=False)

                    # ── 4. Recolectar resultados en orden original ─────────────────
                    for b in tool_use_blocks:
                        result   = _futs[b.id][1].result()
                        log.info('tool %s %.2fs', b.name, time.time() - _t_starts[b.id])
                        status_r = result.get('status', '?') if isinstance(result, dict) else '?'
                        if status_r == 'saved':
                            emit_op('✅', f'Artefacto guardado — {result.get("artifact_name","?")}',
                                    detail=f'ID: {result.get("artifact_id","?")} · tipo: {result.get("artifact_type","?")}')
                        elif status_r == 'appended':
                            kb = round((result.get("total_bytes") or 0) / 1024, 1)
                            emit_op('📎', f'Documento ampliado — {result.get("artifact_name","?")}',
                                    detail=f'ID: {result.get("artifact_id","?")} · total: {kb} KB')
                        elif status_r == 'error':
                            emit_op('❌', f'Error en {b.name}: {result.get("error","?")}',
                                    level='error')
                        else:
                            emit_op('✅', f'{b.name} completado', detail=str(status_r))
                        q.put(('tool_result', {'tool': b.name, 'result': result}))
                        tool_result_content.append({
                            "type": "tool_result",
                            "tool_use_id": b.id,
                            "content": json.dumps(result, ensure_ascii=False),
                        })

                current_messages.append({"role": "assistant", "content": assistant_content})
                current_messages.append({"role": "user", "content": tool_result_content})

        except anthropic.APIError as e:
            diag = _auto_diagnose(traceback.format_exc(), model, artifact_type, max_tokens)
            emit_op('❌', f'Error API Anthropic: {str(e)[:120]}', level='error')
            q.put(('diagnosis', diag))
            q.put(('error', diag['user_msg']))
        except Exception:
            tb_ = traceback.format_exc()
            log.error('chat_stream worker:\n%s', tb_)
            diag = _auto_diagnose(tb_, model, artifact_type, max_tokens)
            emit_op('❌', f'Error interno: {diag["last_error"][:120]}', level='error')
            q.put(('diagnosis', diag))
            q.put(('error', diag['user_msg']))
        finally:
            full_text = ''.join(accumulated)
            # Guardar en DB siempre, aunque el cliente haya cerrado el tab
            if case_id and full_text:
                try:
                    execute(
                        "INSERT INTO chat_history (case_id, role, content) VALUES (%s,'user',%s)",
                        (case_id, message)
                    )
                    execute(
                        "INSERT INTO chat_history (case_id, role, content) VALUES (%s,'assistant',%s)",
                        (case_id, full_text)
                    )
                    log.info('chat_history saved | words=%d | total=%.2fs',
                             len(full_text.split()), time.time() - t_start)
                except Exception as e:
                    log.error('chat_history save failed: %s', e)
            elapsed_ = time.time() - t_start
            emit_op('🏁', f'Completado en {elapsed_:.1f}s · {len(full_text.split()):,} palabras')
            q.put(('done', None))

    threading.Thread(target=worker, daemon=True).start()

    def generate():
        while True:
            try:
                type_, data = q.get(timeout=600)  # 10 min máximo entre eventos
            except queue.Empty:
                yield f"data: {json.dumps({'type': 'error', 'text': 'Timeout: sin respuesta en 10 minutos'})}\n\n"
                break
            if type_ == 'done':
                yield "data: [DONE]\n\n"
                break
            elif type_ == 'error':
                yield f"data: {json.dumps({'type': 'error', 'text': str(data)})}\n\n"
                yield "data: [DONE]\n\n"
                break
            elif type_ == 'text':
                yield f"data: {json.dumps({'type': 'text', 'text': data})}\n\n"
            elif type_ == 'tool_start':
                yield f"data: {json.dumps({'type': 'tool_start', 'tool': data})}\n\n"
            elif type_ == 'tool_result':
                yield f"data: {json.dumps({'type': 'tool_result', 'tool': data['tool'], 'result': data['result']})}\n\n"
            elif type_ == 'keepalive':
                yield f"data: {json.dumps({'type': 'keepalive'})}\n\n"
            elif type_ == 'auto_continue':
                yield f"data: {json.dumps({'type': 'auto_continue'})}\n\n"
            elif type_ == 'tool_status':
                yield f"data: {json.dumps({'type': 'tool_status', 'tool': data['tool'], 'msg': data['msg']})}\n\n"
            elif type_ == 'op_log':
                yield f"data: {json.dumps({'type': 'op_log', 'icon': data.get('icon','•'), 'msg': data['msg'], 'detail': data.get('detail'), 'level': data.get('level','info')})}\n\n"
            elif type_ == 'token_usage':
                yield f"data: {json.dumps({'type': 'token_usage', **data})}\n\n"
            elif type_ == 'diagnosis':
                yield f"data: {json.dumps({'type': 'diagnosis', **data})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        }
    )
