import os, hashlib, uuid, zipfile, io, mimetypes
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
    'text/plain',
}
ZIP_MIMES = {'application/zip', 'application/x-zip-compressed', 'application/octet-stream'}

def _process_file(case_id, filename, raw, mime):
    """Procesa un archivo (bytes) y lo guarda. Retorna dict resultado."""
    sha  = hashlib.sha256(raw).hexdigest()
    size = len(raw)

    dup = query(
        "SELECT artifact_id FROM user_artifacts WHERE checksum_sha256=%s AND case_id=%s",
        (sha, case_id)
    )
    if dup:
        return {"filename": filename, "status": "duplicate", "artifact_id": dup['artifact_id']}

    cached = query(
        "SELECT extracted_text FROM extraction_cache WHERE checksum_sha256=%s AND mime_type=%s",
        (sha, mime)
    )
    if cached:
        text = cached['extracted_text']
    else:
        tmp_path = os.path.join(UPLOAD_DIR, f"tmp_{sha[:16]}")
        with open(tmp_path, 'wb') as fh:
            fh.write(raw)
        text = extract_text(tmp_path, mime, raw)
        os.remove(tmp_path)
        execute(
            "INSERT INTO extraction_cache (checksum_sha256, mime_type, extracted_text) "
            "VALUES (%s, %s, %s) ON DUPLICATE KEY UPDATE extracted_text=VALUES(extracted_text)",
            (sha, mime, text)
        )

    ext      = os.path.splitext(filename)[1] or ''
    safe     = f"{uuid.uuid4().hex}{ext}"
    dest     = os.path.join(UPLOAD_DIR, safe)
    with open(dest, 'wb') as fh:
        fh.write(raw)

    art_id = str(uuid.uuid4())
    execute(
        """INSERT INTO user_artifacts
           (artifact_id, case_id, filename, mime_type, file_path,
            file_size_bytes, checksum_sha256, extracted_text, source)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,'user')""",
        (art_id, case_id, filename, mime, dest, size, sha, text)
    )
    return {"artifact_id": art_id, "filename": filename, "size": size,
            "text_len": len(text), "status": "ok"}


@upload_bp.route('/api/upload', methods=['POST'])
@upload_bp.route('/api/v1/upload', methods=['POST'])
def upload():
    case_id = request.form.get('case_id', '')

    files = request.files.getlist('files') or request.files.getlist('file')
    if not files:
        return jsonify({"error": "No se recibieron archivos"}), 400

    results = []
    for f in files:
        raw  = f.read()
        mime = f.mimetype or 'application/octet-stream'

        # ── ZIP: extraer y procesar cada archivo interno ──────────────
        is_zip = (mime in ZIP_MIMES or f.filename.lower().endswith('.zip'))
        if is_zip:
            try:
                with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                    for zname in zf.namelist():
                        if zname.endswith('/') or zname.startswith('__MACOSX'):
                            continue
                        zraw  = zf.read(zname)
                        zmime = mimetypes.guess_type(zname)[0] or 'application/octet-stream'
                        if zmime not in ALLOWED_MIME:
                            results.append({"filename": zname, "error": f"Tipo no permitido: {zmime}"})
                            continue
                        results.append(_process_file(case_id, os.path.basename(zname), zraw, zmime))
            except zipfile.BadZipFile:
                results.append({"filename": f.filename, "error": "ZIP inválido o corrupto"})
            continue

        # ── Archivo normal ────────────────────────────────────────────
        if mime not in ALLOWED_MIME:
            results.append({"filename": f.filename, "error": f"Tipo no permitido: {mime}"})
            continue
        results.append(_process_file(case_id, f.filename, raw, mime))

    return jsonify({"results": results})
