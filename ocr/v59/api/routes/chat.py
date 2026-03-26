import os, json, traceback
from flask import Blueprint, request, Response, stream_with_context, jsonify
import anthropic

from tools.db import query, execute
from openclaw.tool_router import handle_tool

chat_bp = Blueprint('chat', __name__)

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
    rows = query(
        f"""SELECT artifact_id, filename, mime_type,
                   LEFT(extracted_text, 12000) AS snippet,
                   file_size_bytes
            FROM user_artifacts
            WHERE artifact_id IN ({placeholders})
              AND case_id = %s
              AND extracted_text IS NOT NULL
              AND TRIM(extracted_text) != ''
            ORDER BY uploaded_at DESC""",
        (*artifact_ids, case_id), many=True
    )
    if not rows:
        return (
            "\n\n**IMPORTANTE:** Los documentos seleccionados no tienen texto extraído. "
            "Por favor vuelve a subirlos."
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


def _run_agentic_loop(client, model, max_tokens, system, init_messages, case_id, max_iterations=5):
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

    for _ in range(max_iterations):
        text_this_round = ""

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
            result = handle_tool(b.name, dict(b.input), case_id)
            all_tool_results.append({"tool": b.name, "result": result})
            tool_result_content.append({
                "type": "tool_result",
                "tool_use_id": b.id,
                "content": json.dumps(result, ensure_ascii=False),
            })

        messages.append({"role": "assistant", "content": assistant_content})
        messages.append({"role": "user", "content": tool_result_content})

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
def chat():
    """Main chat endpoint with full agentic loop support."""
    body = request.get_json(force=True, silent=True) or {}
    message       = body.get('message', '').strip()
    history       = body.get('history', [])[-22:]
    case_id       = body.get('case_id', '')
    artifact_type = body.get('artifact_type', 'analysis')
    selected_ids  = body.get('context_artifact_ids', body.get('selected_artifacts', []))

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

    system = (
        f"{SOUL}\n\n"
        f"{case_info}\n\n"
        f"{length_rule}\n\n"
        f"**TIPO DE ARTEFACTO ACTIVO:** {artifact_type}\n"
        f"{art_template}\n"
        f"{case_context}"
    )

    messages = []
    for h in history:
        role = h.get('role', 'user')
        if role not in ('user', 'assistant'):
            continue
        messages.append({"role": role, "content": h.get('content', '')})
    messages.append({"role": "user", "content": message})

    client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

    try:
        full_text, tool_results = _run_agentic_loop(
            client=client,
            model="claude-opus-4-6",
            max_tokens=max_tokens,
            system=system,
            init_messages=messages,
            case_id=case_id,
        )

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
            except Exception:
                pass

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
def chat_stream():
    body = request.get_json(force=True, silent=True) or {}
    message       = body.get('message', '').strip()
    history       = body.get('history', [])[-22:]
    case_id       = body.get('case_id', '')
    artifact_type = body.get('artifact_type', 'analysis')
    selected_ids  = body.get('selected_artifacts', [])

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

    system = (
        f"{SOUL}\n\n"
        f"{case_info}\n\n"
        f"{length_rule}\n\n"
        f"**TIPO DE ARTEFACTO ACTIVO:** {artifact_type}\n"
        f"{art_template}\n"
        f"{case_context}"
    )

    messages = []
    for h in history:
        role = h.get('role', 'user')
        if role not in ('user', 'assistant'):
            continue
        messages.append({"role": role, "content": h.get('content', '')})
    messages.append({"role": "user", "content": message})

    client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

    def generate():
        try:
            current_messages = list(messages)
            for _ in range(5):
                text_this_round = ""

                with client.messages.stream(
                    model="claude-opus-4-6",
                    max_tokens=max_tokens,
                    system=system,
                    tools=TOOL_DEFS,
                    messages=current_messages,
                ) as stream:
                    for event in stream:
                        if (hasattr(event, 'type')
                                and event.type == 'content_block_delta'
                                and hasattr(event, 'delta')
                                and getattr(event.delta, 'type', None) == 'text_delta'):
                            chunk = event.delta.text
                            text_this_round += chunk
                            yield f"data: {json.dumps({'type': 'text', 'text': chunk})}\n\n"
                    final_msg = stream.get_final_message()

                if final_msg.stop_reason != 'tool_use':
                    break

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

                tool_result_content = []
                for b in final_msg.content:
                    if b.type != 'tool_use':
                        continue
                    result = handle_tool(b.name, dict(b.input), case_id)
                    yield f"data: {json.dumps({'type': 'tool_result', 'tool': b.name, 'result': result})}\n\n"
                    tool_result_content.append({
                        "type": "tool_result",
                        "tool_use_id": b.id,
                        "content": json.dumps(result, ensure_ascii=False),
                    })

                current_messages.append({"role": "assistant", "content": assistant_content})
                current_messages.append({"role": "user", "content": tool_result_content})

        except anthropic.APIError as e:
            yield f"data: {json.dumps({'type': 'error', 'text': f'API Error: {str(e)}'})}\n\n"
        except Exception:
            err = traceback.format_exc()
            yield f"data: {json.dumps({'type': 'error', 'text': 'Error interno del servidor'})}\n\n"
            print(err)

        yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        }
    )
