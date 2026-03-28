"""
Tool router — ejecuta las herramientas de Claude y retorna resultados.
"""
import os, uuid
from tools.db import query, execute
from tools.jotform_tools import export_case_to_jotform


def handle_tool(tool_name: str, inputs: dict, case_id: str = None) -> dict:
    """Despacha tool calls de Claude al handler correspondiente."""
    handlers = {
        'generate_image':     _generate_image,
        'save_artifact':      _save_artifact,
        'create_case':        _create_case,
        'search_precedents':  _search_precedents,
        'validate_document':  _validate_document,
        'export_to_jotform':  _export_to_jotform,
        'list_case_contents': _list_case_contents,
        'save_session_notes': _save_session_notes,
        'analyze_audio':      _analyze_audio,
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
                file_size_bytes, checksum_sha256, extracted_text, source, uploaded_at)
               VALUES (%s, %s, %s, 'image/jpeg', %s, %s, %s, %s, 'system', NOW())""",
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


def _list_case_contents(inputs: dict) -> dict:
    cid = inputs.get('case_id', '').strip()
    if not cid:
        return {"error": "case_id requerido"}

    user_files = query(
        """SELECT artifact_id, filename, mime_type, file_size_bytes,
                  CHAR_LENGTH(COALESCE(extracted_text,'')) AS text_len,
                  uploaded_at
           FROM user_artifacts
           WHERE case_id=%s AND (
               COALESCE(source,'') != 'system'
               OR mime_type LIKE 'audio/%%'
               OR mime_type LIKE 'video/%%'
           )
           ORDER BY uploaded_at ASC""",
        (cid,), many=True
    ) or []

    gen_arts = query(
        """SELECT artifact_id, artifact_name, artifact_type,
                  file_size_bytes, created_at
           FROM system_artifacts
           WHERE case_id=%s AND COALESCE(artifact_type,'') != 'session_notes'
           ORDER BY created_at ASC""",
        (cid,), many=True
    ) or []

    img_row = query(
        "SELECT COUNT(*) AS cnt FROM user_artifacts WHERE case_id=%s AND source='system'",
        (cid,)
    )
    img_count = (img_row or {}).get('cnt', 0)

    notes_row = query(
        """SELECT content, created_at FROM system_artifacts
           WHERE case_id=%s AND artifact_type='session_notes'
           ORDER BY created_at DESC LIMIT 1""",
        (cid,)
    )

    return {
        "uploaded_files": [
            {
                "artifact_id": r["artifact_id"],
                "filename": r["filename"],
                "type": r["mime_type"],
                "size_kb": round((r.get("file_size_bytes") or 0) / 1024, 1),
                "has_text": (r.get("text_len") or 0) > 100,
                "text_chars": r.get("text_len") or 0,
                "uploaded_at": str(r.get("uploaded_at", "")),
            }
            for r in user_files
        ],
        "generated_artifacts": [
            {
                "artifact_id": r["artifact_id"],
                "name": r["artifact_name"],
                "type": r["artifact_type"],
                "created_at": str(r.get("created_at", "")),
            }
            for r in gen_arts
        ],
        "generated_images_count": img_count,
        "session_notes": notes_row["content"] if notes_row else None,
        "session_notes_date": str(notes_row["created_at"]) if notes_row else None,
        "totals": {
            "uploaded": len(user_files),
            "artifacts": len(gen_arts),
            "images": img_count,
        },
    }


def _save_session_notes(inputs: dict) -> dict:
    cid   = inputs.get('case_id', '').strip()
    notes = inputs.get('notes', '').strip()
    if not cid or not notes:
        return {"error": "case_id y notes son requeridos"}

    art_id = str(uuid.uuid4())
    execute(
        """INSERT INTO system_artifacts
           (artifact_id, case_id, artifact_name, artifact_type, content,
            mime_type, file_size_bytes, source)
           VALUES (%s,%s,'Notas de sesión','session_notes',%s,'text/plain',%s,'system')""",
        (art_id, cid, notes, len(notes.encode()))
    )
    return {"status": "saved", "artifact_id": art_id,
            "message": "Notas guardadas. La próxima sesión las recibirá automáticamente."}


def _analyze_audio(inputs: dict) -> dict:
    """
    Análisis forense vocal:
    1. Whisper verbose_json → transcripción con timestamps por palabra y segmento
    2. Detección de pausas (>300ms), vacilaciones y marcadores paralingüísticos
    3. Velocidad del habla (PPM) por segmento
    4. Features acústicas con librosa: pitch F0, energía RMS (si disponible)
    5. Guarda reporte completo como system_artifact
    """
    import re, json as _json

    audio_id      = inputs.get('audio_id', '').strip()
    case_id       = inputs.get('case_id', '').strip()
    analysis_type = inputs.get('analysis_type', 'full')

    if not audio_id or not case_id:
        return {"error": "audio_id y case_id son requeridos"}

    row = query(
        "SELECT file_path, filename FROM user_artifacts WHERE artifact_id=%s AND case_id=%s",
        (audio_id, case_id)
    )
    if not row or not row.get('file_path'):
        return {"error": "Audio no encontrado en el expediente"}

    audio_path = row['file_path']
    if not os.path.exists(audio_path):
        return {"error": f"Archivo no encontrado en disco: {audio_path}"}

    openai_key = os.getenv('OPENAI_API_KEY', '')
    if not openai_key:
        return {"error": "OPENAI_API_KEY no configurado en el servidor"}

    # ── 1. Whisper verbose con timestamps por palabra ─────────────────────────
    import openai as _oai
    oai = _oai.OpenAI(api_key=openai_key)

    with open(audio_path, 'rb') as fh:
        transcript = oai.audio.transcriptions.create(
            model='whisper-1',
            file=fh,
            response_format='verbose_json',
            timestamp_granularities=['word', 'segment'],
        )

    words    = transcript.words    or []
    segments = transcript.segments or []
    full_text = transcript.text    or ''

    # ── 2. Pausas entre palabras ──────────────────────────────────────────────
    pauses = []
    for i in range(1, len(words)):
        gap = words[i].start - words[i - 1].end
        if gap >= 0.3:
            pauses.append({
                "time_sec":     round(words[i - 1].end, 2),
                "duration_sec": round(gap, 2),
                "type":         "larga" if gap >= 1.0 else "breve",
                "context":      f"…{words[i-1].word} [PAUSA {gap:.1f}s] {words[i].word}…",
            })

    # ── 3. Vacilaciones y marcadores paralingüísticos ─────────────────────────
    hes_re = re.compile(
        r'^\s*(eh|ehm|um|uh|este|o sea|bueno|pues|mmm|este que|o|aa+|eee+)\s*$',
        re.IGNORECASE
    )
    hesitations = [
        {"time_sec": round(w.start, 2), "word": w.word.strip()}
        for w in words if hes_re.match(w.word)
    ]

    # ── 4. Velocidad del habla por segmento (palabras por minuto) ────────────
    segment_rates = []
    for seg in segments:
        dur = seg.end - seg.start
        wc  = len(seg.text.split())
        segment_rates.append({
            "start_sec": round(seg.start, 1),
            "end_sec":   round(seg.end, 1),
            "ppm":       round((wc / dur) * 60) if dur > 0 else 0,
            "text":      seg.text[:120],
        })

    # ── 5. Features acústicas con librosa (opcional) ──────────────────────────
    acoustic = {}
    try:
        import librosa, numpy as np
        y, sr = librosa.load(audio_path, sr=None, mono=True)

        # Pitch F0
        f0, voiced, _ = librosa.pyin(
            y,
            fmin=librosa.note_to_hz('C2'),
            fmax=librosa.note_to_hz('C7'),
        )
        f0_v = f0[voiced] if voiced is not None and f0 is not None else np.array([])

        # Energía RMS
        rms = librosa.feature.rms(y=y)[0]

        acoustic = {
            "duration_sec": round(float(len(y) / sr), 1),
            "pitch_hz": {
                "mean": round(float(np.nanmean(f0_v)), 1) if len(f0_v) > 0 else None,
                "std":  round(float(np.nanstd(f0_v)), 1)  if len(f0_v) > 0 else None,
                "min":  round(float(np.nanmin(f0_v)), 1)  if len(f0_v) > 0 else None,
                "max":  round(float(np.nanmax(f0_v)), 1)  if len(f0_v) > 0 else None,
            },
            "energy_rms": {
                "mean": round(float(np.mean(rms)), 5),
                "std":  round(float(np.std(rms)), 5),
                "max":  round(float(np.max(rms)), 5),
            },
        }
    except ImportError:
        acoustic = {"note": "librosa no instalado — instalar con: pip install librosa"}
    except Exception as e:
        acoustic = {"error": str(e)}

    # ── 6. Resumen ────────────────────────────────────────────────────────────
    summary = {
        "word_count":       len(words),
        "total_pauses":     len(pauses),
        "long_pauses":      len([p for p in pauses if p["type"] == "larga"]),
        "hesitation_count": len(hesitations),
        "avg_ppm":          round(sum(s["ppm"] for s in segment_rates) / len(segment_rates))
                            if segment_rates else None,
        "acoustic_available": "pitch_hz" in acoustic,
    }

    # ── 7. Construir reporte Markdown y guardar ───────────────────────────────
    pause_lines = "\n".join(
        f"- `[{p['time_sec']}s]` Pausa **{p['type']}** de {p['duration_sec']}s — {p['context']}"
        for p in pauses[:30]
    ) or "_Ninguna_"

    hes_lines = "\n".join(
        f"- `[{h['time_sec']}s]` «{h['word']}»"
        for h in hesitations[:40]
    ) or "_Ninguna_"

    rate_lines = "\n".join(
        f"- `[{s['start_sec']}s–{s['end_sec']}s]` {s['ppm']} PPM — {s['text']}"
        for s in segment_rates
    ) or "_Sin segmentos_"

    acoustic_block = _json.dumps(acoustic, ensure_ascii=False, indent=2)

    art_name = f"Análisis vocal [{analysis_type}] — {row['filename'][:50]}"
    content_md = f"""# {art_name}

**Tipo de análisis:** {analysis_type}
**Archivo:** {row['filename']}
**Palabras:** {summary['word_count']} | **PPM promedio:** {summary['avg_ppm']}
**Pausas:** {summary['total_pauses']} ({summary['long_pauses']} largas) | **Vacilaciones:** {summary['hesitation_count']}

---

## Transcripción completa
{full_text}

---

## Pausas detectadas ({summary['total_pauses']})
{pause_lines}

## Marcadores paralingüísticos — vacilaciones ({summary['hesitation_count']})
{hes_lines}

## Velocidad del habla por segmento
{rate_lines}

## Features acústicas (pitch F0 y energía)
```json
{acoustic_block}
```

---
*Datos RAW disponibles para análisis adicional en artifact_id de este artefacto.*
"""

    art_id = str(uuid.uuid4())
    execute(
        """INSERT INTO system_artifacts
           (artifact_id, case_id, artifact_name, artifact_type, content,
            mime_type, file_size_bytes, source)
           VALUES (%s,%s,%s,'analysis',%s,'text/markdown',%s,'system')""",
        (art_id, case_id, art_name, content_md, len(content_md.encode()))
    )

    return {
        "status": "completed",
        "artifact_id": art_id,
        "artifact_name": art_name,
        "summary": summary,
        "pauses": pauses[:10],         # primeras 10 para no saturar el contexto
        "hesitations": hesitations[:15],
        "acoustic": acoustic,
        "message": (
            f"Análisis vocal completado y guardado. "
            f"{summary['word_count']} palabras, {summary['total_pauses']} pausas "
            f"({summary['long_pauses']} largas), {summary['hesitation_count']} vacilaciones. "
            f"Ver reporte completo en pestaña **Generados**."
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
