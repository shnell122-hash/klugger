import os, json, traceback, threading, queue, time, logging, uuid
from flask import Blueprint, request, Response, stream_with_context, jsonify, session
import anthropic

from tools.db import query, execute
from openclaw.tool_router import handle_tool
from routes.auth import require_login

chat_bp = Blueprint('chat', __name__)
log = logging.getLogger('chat')

# Señal que Claude emite al final de un turno masivo para auto-continuar
_AUTO_CONTINUE = '↩️ Continúo'

# Precios por token (claude-opus-4-6)
_PRICE_INPUT      = 15.0  / 1_000_000   # $15 / MTok
_PRICE_OUTPUT     = 75.0  / 1_000_000   # $75 / MTok
_PRICE_CACHE_READ = 1.5   / 1_000_000   # $1.5 / MTok


def _log_usage(user_id, case_id, model, usage):
    """Registra uso de tokens + costo estimado en api_usage."""
    if not user_id:
        return
    try:
        inp   = getattr(usage, 'input_tokens', 0) or 0
        out   = getattr(usage, 'output_tokens', 0) or 0
        cache = getattr(usage, 'cache_read_input_tokens', 0) or 0
        cost  = inp * _PRICE_INPUT + out * _PRICE_OUTPUT + cache * _PRICE_CACHE_READ
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
    "contract": 8192,
    "brief": 8192,
    "html": 8192,
    "analysis": 4096,
    "summary": 2048,
    "checklist": 2048,
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
    """Obtiene contexto de artefactos específicos seleccionados por el usuario."""
    if not artifact_ids:
        return _get_case_context(case_id)

    placeholders = ','.join(['%s'] * len(artifact_ids))

    # Separar audio/video (sin texto extraíble) del resto
    all_rows = query(
        f"""SELECT artifact_id, filename, mime_type,
                   LEFT(extracted_text, 12000) AS snippet,
                   file_size_bytes
            FROM user_artifacts
            WHERE artifact_id IN ({placeholders})
              AND case_id = %s
            ORDER BY uploaded_at DESC""",
        (*artifact_ids, case_id), many=True
    ) or []

    audio_rows = [r for r in all_rows if (r.get('mime_type') or '').startswith(('audio/', 'video/'))]
    text_rows  = [r for r in all_rows if r not in audio_rows
                  and r.get('snippet') and (r.get('snippet') or '').strip()]

    parts = []

    # Archivos de texto con contenido
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
    if audio_rows:
        parts.append("\n<audio_files_in_context>")
        parts.append("INSTRUCCIÓN: Para analizar estos audios llama analyze_audio con el audio_id correspondiente.")
        for r in audio_rows:
            parts.append(
                f'  audio_id={r["artifact_id"]} | {r["filename"]} '
                f'({round((r.get("file_size_bytes") or 0)/1048576, 1)} MB)'
            )
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
    rows = query(
        "SELECT role, content, created_at FROM chat_history WHERE case_id=%s ORDER BY created_at ASC LIMIT 100",
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
    max_tokens   = MAX_TOKENS_BY_TYPE.get(artifact_type, 4096)

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

    t0 = time.time()
    log.info('chat start | case=%s type=%s', case_id, artifact_type)
    try:
        full_text, tool_results = _run_agentic_loop(
            client=client,
            model="claude-opus-4-6",
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
    max_tokens   = MAX_TOKENS_BY_TYPE.get(artifact_type, 4096)

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
    q: queue.Queue = queue.Queue()   # ilimitado — worker escribe, SSE lee
    t_start = time.time()
    log.info('chat_stream start | case=%s type=%s', case_id, artifact_type)

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
            for iteration in range(15):   # 15 = 5 tool-use + hasta 10 auto-continuaciones
                text_this_round = ""
                t_round = time.time()

                with client.messages.stream(
                    model="claude-opus-4-6",
                    max_tokens=max_tokens,
                    system=system_blocks,
                    tools=TOOL_DEFS,
                    messages=current_messages,
                ) as stream:
                    for event in stream:
                        if (hasattr(event, 'type')
                                and event.type == 'content_block_delta'
                                and hasattr(event, 'delta')
                                and getattr(event.delta, 'type', None) == 'text_delta'):
                            chunk = event.delta.text
                            if t_first[0] is None:
                                t_first[0] = time.time()
                                log.info('first token %.2fs', t_first[0] - t_start)
                            text_this_round += chunk
                            accumulated.append(chunk)
                            q.put(('text', chunk))
                    final_msg = stream.get_final_message()

                u = final_msg.usage
                cached = getattr(u, 'cache_read_input_tokens', 0)
                log.info('stream round=%d stop=%s in=%.0f cached=%.0f out=%.0f %.2fs',
                         iteration, final_msg.stop_reason,
                         u.input_tokens, cached, u.output_tokens,
                         time.time() - t_round)
                _log_usage(user_id, case_id, 'claude-opus-4-6', u)

                if final_msg.stop_reason != 'tool_use':
                    # Detectar señal de auto-continuación (tareas masivas §11)
                    if _AUTO_CONTINUE in text_this_round:
                        log.info('auto-continue detected at iteration %d', iteration)
                        current_messages.append({"role": "assistant", "content": text_this_round})
                        current_messages.append({"role": "user",
                                                 "content": "Continúa con los entregables pendientes."})
                        q.put(('auto_continue', None))
                        continue   # siguiente iteración sin esperar al usuario
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
                    q.put(('tool_start', b.name))   # avisa al frontend antes de ejecutar
                    t_tool = time.time()
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

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        }
    )
