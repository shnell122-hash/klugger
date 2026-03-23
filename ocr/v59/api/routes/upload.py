import os, hashlib, uuid
from flask import Blueprint, request, jsonify
from tools.db import query, execute
from tools.claude_vision import extract_text

upload_bp = Blueprint('upload', __name__)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_MIME = {
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp',
    'image/gif', 'image/tiff',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
}

@upload_bp.route('/api/v1/upload', methods=['POST'])
def upload():
    case_id = request.form.get('case_id')
    if not case_id:
        return jsonify({"error": "case_id requerido"}), 400

    files = request.files.getlist('files')
    if not files:
        return jsonify({"error": "No se recibieron archivos"}), 400

    results = []
    for f in files:
        mime = f.mimetype or 'application/octet-stream'
        if mime not in ALLOWED_MIME:
            results.append({"filename": f.filename, "error": f"Tipo no permitido: {mime}"})
            continue

        raw = f.read()
        sha = hashlib.sha256(raw).hexdigest()
        size = len(raw)

        # Verificar duplicado en este caso
        dup = query(
            "SELECT artifact_id FROM user_artifacts WHERE checksum_sha256=%s AND case_id=%s",
            (sha, case_id)
        )
        if dup:
            results.append({"filename": f.filename, "status": "duplicate", "artifact_id": dup['artifact_id']})
            continue

        # Verificar cache de extracción
        cached = query(
            "SELECT extracted_text FROM extraction_cache WHERE checksum_sha256=%s AND mime_type=%s",
            (sha, mime)
        )
        if cached:
            text = cached['extracted_text']
        else:
            # Guardar temporalmente y extraer
            tmp_path = os.path.join(UPLOAD_DIR, f"tmp_{sha[:16]}")
            with open(tmp_path, 'wb') as fh:
                fh.write(raw)
            text = extract_text(tmp_path, mime, raw)
            os.remove(tmp_path)
            # Guardar en cache
            execute(
                "INSERT INTO extraction_cache (checksum_sha256, mime_type, extracted_text) "
                "VALUES (%s, %s %s) ON DUPLICATE KEY UPDATE extracted_text=VALUES(extracted_text)",
                (sha, mime, text)
            )

        # Guardar archivo en disco
        ext = os.path.splitext(f.filename)[1] or ''
        safe_name = f"{uuid.uuid4().hex}{ext}"
        dest = os.path.join(UPLOAD_DIR, safe_name)
        with open(dest, 'wb') as fh:
            fh.write(raw)

        art_id = str(uuid.uuid4())
        execute(
            """INSERT INTO user_artifacts
               (artifact_id, case_id, filename, mime_type, file_path,
                file_size_bytes, checksum_sha256, extracted_text, source)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'user')""",
            (art_id, case_id, f.filename, mime, dest, size, sha, text)
        )
        results.append({
            "artifact_id": art_id,
            "filename": f.filename,
            "size": size,
            "text_len": len(text),
            "status": "ok"
        })

    return jsonify({"results": results})
