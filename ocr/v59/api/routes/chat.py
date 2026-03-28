import os, re, json, traceback, threading, queue, time, logging, uuid
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
    "contract": 16000,
    "brief":    16000,
    "html":     16000,
    "analysis": 16000,
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
    max_tokens   = MAX_TOKENS_BY_TYPE.get(artifact_type, 16000)

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
    max_tokens   = MAX_TOKENS_BY_TYPE.get(artifact_type, 16000)

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

        try:
            current_messages = list(messages)
            _force_tool = False   # cuando True: próxima iteración usa tool_choice=any
            for iteration in range(15):   # 15 = 5 tool-use + hasta 10 auto-continuaciones
                text_this_round = ""
                t_round = time.time()

                stream_kwargs = dict(
                    model=model,
                    max_tokens=max_tokens,
                    system=system_blocks,
                    tools=TOOL_DEFS,
                    messages=current_messages,
                )
                if _force_tool:
                    # Forzar al modelo a ejecutar AL MENOS una herramienta
                    stream_kwargs["tool_choice"] = {"type": "any"}
                    _force_tool = False
                    log.info('tool_choice=any forced at iteration %d', iteration)

                _ka_time    = [time.time()]   # último keepalive/text emitido
                _early_tools = set()           # tools ya anunciadas en content_block_start

                def _maybe_keepalive():
                    now = time.time()
                    if now - _ka_time[0] >= 8:
                        q.put(('keepalive', None))
                        _ka_time[0] = now

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
                                    if _steps_e:
                                        q.put(('tool_status', {'tool': tname, 'msg': _steps_e[0][1]}))
                                    _ka_time[0] = time.time()

                        elif etype == 'content_block_delta' and hasattr(event, 'delta'):
                            dtype = getattr(event.delta, 'type', None)
                            if dtype == 'text_delta':
                                chunk = event.delta.text
                                if t_first[0] is None:
                                    t_first[0] = time.time()
                                    log.info('first token %.2fs', t_first[0] - t_start)
                                text_this_round += chunk
                                accumulated.append(chunk)
                                q.put(('text', chunk))
                                _ka_time[0] = time.time()
                            elif dtype == 'input_json_delta':
                                # Claude construyendo el JSON del tool call — mantener SSE vivo
                                _maybe_keepalive()

                    final_msg = stream.get_final_message()

                u = final_msg.usage
                cached = getattr(u, 'cache_read_input_tokens', 0)
                log.info('stream round=%d stop=%s in=%.0f cached=%.0f out=%.0f %.2fs',
                         iteration, final_msg.stop_reason,
                         u.input_tokens, cached, u.output_tokens,
                         time.time() - t_round)
                _log_usage(user_id, case_id, model, u)

                if final_msg.stop_reason != 'tool_use':
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

                tool_result_content = []
                for b in final_msg.content:
                    if b.type != 'tool_use':
                        continue
                    # tool_start ya fue emitido en content_block_start; sólo emitir
                    # si por algún motivo no se detectó antes (fallback)
                    if b.name not in _early_tools:
                        q.put(('tool_start', b.name))
                        _steps = _STATUS_STEPS.get(b.name, [])
                        if _steps:
                            q.put(('tool_status', {'tool': b.name, 'msg': _steps[0][1]}))
                    t_tool = time.time()
                    _steps = _STATUS_STEPS.get(b.name, [])
                    _last_status = [_steps[0][1] if _steps else None]

                    # Ejecutar tool en hilo propio; enviar keepalives cada 10s
                    # para evitar timeout SSE en tools lentas (analyze_audio, etc.)
                    _tool_result = [None]
                    _tool_done   = [False]
                    def _run_tool(name=b.name, inp=dict(b.input)):
                        _tool_result[0] = handle_tool(name, inp, case_id)
                        _tool_done[0] = True
                    _tt = threading.Thread(target=_run_tool, daemon=True)
                    _tt.start()
                    while not _tool_done[0]:
                        _tt.join(timeout=10)
                        if not _tool_done[0]:
                            q.put(('keepalive', None))
                            # Actualizar mensaje de estado según tiempo transcurrido
                            t_el = time.time() - t_tool
                            msg = None
                            for t_s, m in reversed(_steps):
                                if t_el >= t_s:
                                    msg = m
                                    break
                            if msg and msg != _last_status[0]:
                                _last_status[0] = msg
                                q.put(('tool_status', {'tool': b.name, 'msg': msg}))
                    result = _tool_result[0]
                    log.info('tool %s %.2fs', b.name, time.time() - t_tool)
                    q.put(('tool_result', {'tool': b.name, 'result': result}))
                    tool_result_content.append({
                        "type": "tool_result",
                        "tool_use_id": b.id,
                        "content": json.dumps(result, ensure_ascii=False),
                    })

                current_messages.append({"role": "assistant", "content": assistant_content})
                current_messages.append({"role": "user", "content": tool_result_content})

        except anthropic.APIError as e:
            q.put(('error', f'API Error: {str(e)}'))
        except Exception:
            err = traceback.format_exc()
            log.error('chat_stream worker:\n%s', err)
            q.put(('error', 'Error interno del servidor'))
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

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        }
    )
