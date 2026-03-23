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


@chat_bp.route('/api/v1/chat/stream', methods=['POST'])
def chat_stream():
    body = request.get_json(force=True, silent=True) or {}
    message      = body.get('message', '').strip()
    history      = body.get('history', [])[-22:]
    case_id      = body.get('case_id', '')
    artifact_type = body.get('artifact_type', 'analysis')
    selected_ids = body.get('selected_artifacts', [])

    if not message:
        return jsonify({"error": "message requerido"}), 400

    # Contexto de documentos
    if selected_ids:
        case_context = _get_specific_context(case_id, selected_ids)
    elif case_id:
        case_context = _get_case_context(case_id)
    else:
        case_context = ""

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
        f"{length_rule}\n\n"
        f"**TIPO DE ARTEFACTO ACTIVO:** {artifact_type}\n"
        f"{art_template}\n"
        f"{case_context}"
    )

    # Construir mensajes para Anthropic
    messages = []
    for h in history:
        role = h.get('role', 'user')
        if role not in ('user', 'assistant'):
            continue
        messages.append({"role": role, "content": h.get('content', '')})
    messages.append({"role": "user", "content": message})

    client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))

    def generate():
        tool_calls_pending = {}
        full_response_text = ""

        try:
            with client.messages.stream(
                model="claude-opus-4-6",
                max_tokens=max_tokens,
                system=system,
                tools=TOOL_DEFS,
                messages=messages,
            ) as stream:
                for event in stream:
                    if hasattr(event, 'type'):
                        et = event.type

                        if et == 'content_block_start':
                            cb = getattr(event, 'content_block', None)
                            if cb and cb.type == 'tool_use':
                                tool_calls_pending[cb.id] = {
                                    'name': cb.name,
                                    'input_str': ''
                                }

                        elif et == 'content_block_delta':
                            delta = getattr(event, 'delta', None)
                            if delta:
                                if delta.type == 'text_delta':
                                    chunk = delta.text
                                    full_response_text += chunk
                                    yield f"data: {json.dumps({'type': 'text', 'text': chunk})}\n\n"
                                elif delta.type == 'input_json_delta':
                                    # Acumular input de tool
                                    cb_id = getattr(event, 'index', None)
                                    # Buscar tool activo
                                    for tid, tc in tool_calls_pending.items():
                                        if not tc.get('done'):
                                            tc['input_str'] += delta.partial_json
                                            break

                        elif et == 'content_block_stop':
                            pass

                        elif et == 'message_stop':
                            pass

                # Ejecutar tool calls si los hay
                for tool_id, tc in tool_calls_pending.items():
                    try:
                        inp = json.loads(tc['input_str']) if tc['input_str'] else {}
                    except Exception:
                        inp = {}
                    tool_result = handle_tool(tc['name'], inp, case_id)
                    yield f"data: {json.dumps({'type': 'tool_result', 'tool': tc['name'], 'result': tool_result})}\n\n"

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
