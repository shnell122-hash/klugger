"""
Tool router — ejecuta las herramientas de Claude y retorna resultados.
"""
import os, uuid
from tools.db import query, execute
from tools.jotform_tools import export_case_to_jotform


def handle_tool(tool_name: str, inputs: dict, case_id: str = None) -> dict:
    """Despacha tool calls de Claude al handler correspondiente."""
    handlers = {
        'generate_image':   _generate_image,
        'save_artifact':    _save_artifact,
        'create_case':      _create_case,
        'search_precedents':_search_precedents,
        'validate_document':_validate_document,
        'export_to_jotform':_export_to_jotform,
    }
    handler = handlers.get(tool_name)
    if not handler:
        return {"error": f"Tool desconocida: {tool_name}"}

    # Inyectar case_id si no viene en inputs pero lo tenemos del contexto
    if case_id and 'case_id' not in inputs:
        inputs = {**inputs, 'case_id': case_id}

    try:
        return handler(inputs)
    except Exception as e:
        return {"error": str(e)}


def _save_artifact(inputs: dict) -> dict:
    required = ['case_id', 'artifact_name', 'artifact_type', 'content']
    for f in required:
        if not inputs.get(f):
            return {"error": f"{f} requerido"}

    art_id = str(uuid.uuid4())
    content = inputs['content']
    execute(
        """INSERT INTO system_artifacts
           (artifact_id, case_id, artifact_name, artifact_type, content,
            mime_type, file_size_bytes, source)
           VALUES (%s,%s,%s,%s,%s,'text/markdown',%s,'system')""",
        (
            art_id,
            inputs['case_id'],
            inputs['artifact_name'],
            inputs['artifact_type'],
            content,
            len(content.encode()),
        )
    )
    return {
        "status": "saved",
        "artifact_id": art_id,
        "artifact_name": inputs['artifact_name'],
        "artifact_type": inputs['artifact_type'],
    }


def _create_case(inputs: dict) -> dict:
    if not inputs.get('case_name'):
        return {"error": "case_name requerido"}

    cid = str(uuid.uuid4())
    execute(
        "INSERT INTO cases (case_id, case_name, matter_type, status) VALUES (%s,%s,%s,'active')",
        (cid, inputs['case_name'], inputs.get('matter_type', 'general'))
    )
    return {"status": "created", "case_id": cid, "case_name": inputs['case_name']}


def _search_precedents(inputs: dict) -> dict:
    q = inputs.get('query', '').strip()
    if not q:
        return {"error": "query requerido"}

    # Búsqueda en system_artifacts como base de precedentes internos
    rows = query(
        """SELECT artifact_id, case_id, artifact_name, artifact_type,
                  LEFT(content, 500) AS snippet, created_at
           FROM system_artifacts
           WHERE MATCH(content) AGAINST (%s IN BOOLEAN MODE)
              OR artifact_name LIKE %s
           ORDER BY created_at DESC
           LIMIT 10""",
        (q, f"%{q}%"), many=True
    )
    # Si no hay FTS, fallback a LIKE
    if rows is None:
        rows = query(
            """SELECT artifact_id, case_id, artifact_name, artifact_type,
                      LEFT(content, 500) AS snippet, created_at
               FROM system_artifacts
               WHERE artifact_name LIKE %s OR content LIKE %s
               ORDER BY created_at DESC
               LIMIT 10""",
            (f"%{q}%", f"%{q}%"), many=True
        )

    return {
        "query": q,
        "results": rows or [],
        "count": len(rows) if rows else 0,
        "note": "Resultados de precedentes internos del sistema."
    }


def _validate_document(inputs: dict) -> dict:
    artifact_id   = inputs.get('artifact_id', '')
    document_type = inputs.get('document_type', '')

    if not artifact_id or not document_type:
        return {"error": "artifact_id y document_type requeridos"}

    row = query(
        "SELECT content, artifact_type, artifact_name FROM system_artifacts WHERE artifact_id=%s",
        (artifact_id,)
    )
    if not row:
        return {"error": "Artefacto no encontrado"}

    content = row.get('content', '')
    issues  = []
    warnings = []

    # Validaciones básicas por tipo
    if 'contrato' in document_type.lower():
        if 'PRIMERA' not in content.upper() and 'CLÁUSULA' not in content.upper() and 'Cláusula' not in content:
            issues.append("No se encontraron cláusulas numeradas")
        if 'firma' not in content.lower() and 'FIRMA' not in content:
            warnings.append("No se detectó sección de firmas")
        if 'fecha' not in content.lower():
            warnings.append("No se detectó fecha del documento")

    if 'poder' in document_type.lower():
        if 'OTORGA' not in content.upper() and 'otorga' not in content:
            issues.append("No se encontró declaración de otorgamiento")
        if 'notari' not in content.lower():
            warnings.append("Considerar protocolización ante Notario Público")

    status = "válido" if not issues else "con_observaciones"
    return {
        "artifact_id": artifact_id,
        "document_type": document_type,
        "status": status,
        "issues": issues,
        "warnings": warnings,
        "chars": len(content),
    }


def _generate_image(inputs: dict) -> dict:
    """Genera imágenes con Flux.1 vía fal.ai y las guarda en el expediente."""
    import requests

    fal_key = os.getenv('FAL_KEY', '')
    if not fal_key:
        return {"error": "FAL_KEY no configurado. Pide al administrador que lo configure en el servidor."}

    case_id = inputs.get('case_id', '').strip()
    prompt  = inputs.get('prompt', '').strip()
    count   = min(max(int(inputs.get('count', 2)), 1), 4)
    aspect  = inputs.get('aspect', 'portrait')

    if not case_id or not prompt:
        return {"error": "case_id y prompt son requeridos"}

    sizes = {
        'portrait':  {'width': 768,  'height': 1024},
        'landscape': {'width': 1024, 'height': 768},
        'square':    {'width': 1024, 'height': 1024},
    }
    size = sizes.get(aspect, sizes['portrait'])

    upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
    os.makedirs(upload_dir, exist_ok=True)

    style_suffix = (
        "shot on a smartphone, candid documentary photo, natural lighting, "
        "slightly imperfect framing, photorealistic, no text overlays"
    )
    negative = (
        "painting, illustration, cartoon, render, cgi, watermark, logo, text, "
        "signature, border, frame, artistic, stylized"
    )

    payload = {
        'prompt':              f"{prompt}, {style_suffix}",
        'negative_prompt':     negative,
        'num_images':          count,
        'image_size':          size,
        'num_inference_steps': 28,
        'guidance_scale':      3.5,
        'enable_safety_checker': True,
        'output_format':       'jpeg',
    }
    headers = {
        'Authorization': f'Key {fal_key}',
        'Content-Type':  'application/json',
    }

    try:
        resp = requests.post(
            'https://fal.run/fal-ai/flux/dev',
            json=payload, headers=headers, timeout=120
        )
        resp.raise_for_status()
        fal_data = resp.json()
    except requests.exceptions.HTTPError as e:
        return {"error": f"fal.ai HTTP {e.response.status_code}: {e.response.text[:200]}"}
    except Exception as e:
        return {"error": f"Error llamando fal.ai: {str(e)}"}

    images_out = fal_data.get('images', [])
    if not images_out:
        return {"error": "fal.ai no devolvió imágenes"}

    saved = []
    for img_info in images_out:
        img_url = img_info.get('url', '')
        if not img_url:
            continue
        try:
            dl = requests.get(img_url, timeout=30)
            dl.raise_for_status()
            img_bytes = dl.content
        except Exception:
            continue

        import hashlib
        artifact_id = str(uuid.uuid4())
        filename    = f"capacitacion_{artifact_id[:8]}.jpg"
        file_path   = os.path.join(upload_dir, f"{artifact_id}.jpg")
        sha256      = hashlib.sha256(img_bytes).hexdigest()
        with open(file_path, 'wb') as fh:
            fh.write(img_bytes)

        execute(
            """INSERT INTO user_artifacts
               (artifact_id, case_id, filename, mime_type, file_path,
                file_size_bytes, checksum_sha256, extracted_text, uploaded_at)
               VALUES (%s, %s, %s, 'image/jpeg', %s, %s, %s, %s, NOW())""",
            (artifact_id, case_id, filename, file_path,
             len(img_bytes), sha256, f'[Imagen generada — capacitación] {prompt}')
        )
        saved.append({
            'artifact_id': artifact_id,
            'filename':    filename,
            'view_url':    f'/OCR/v59/api/artifacts/file/{artifact_id}',
        })

    if not saved:
        return {"error": "No se pudo guardar ninguna imagen"}

    return {
        "status": "generated",
        "count":  len(saved),
        "images": saved,
        "message": (
            f"Se generaron {len(saved)} imagen(es) de capacitación y se guardaron en el expediente. "
            f"Puedes verlas en la pestaña **Subidos** de la barra lateral."
        ),
    }


def _export_to_jotform(inputs: dict) -> dict:
    case_id = inputs.get('case_id', '')
    if not case_id:
        return {"error": "case_id requerido"}

    row = query("SELECT * FROM cases WHERE case_id=%s", (case_id,))
    if not row:
        return {"error": "Caso no encontrado"}

    row['notes'] = inputs.get('notes', '')
    export_case_to_jotform(case_id, row)

    return {
        "status": "export_iniciado",
        "case_id": case_id,
        "note": "Exportación enviada en background. Verificar en JotForm en unos segundos."
    }
