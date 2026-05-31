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
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # docx
    'application/msword',                                                         # doc
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         # xlsx
    'application/vnd.ms-excel',                                                   # xls
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', # pptx
    'application/vnd.ms-powerpoint',                                              # ppt
    'text/plain', 'text/html',
    # Audio y video
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/x-wav',
    'audio/ogg', 'audio/webm', 'audio/aac', 'audio/flac',
    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo',
}
ZIP_MIMES = {'application/zip', 'application/x-zip-compressed'}

# Extensiones de formatos Office Open XML (son ZIP internamente pero NO deben
# abrirse como ZIP — deben procesarse como documentos completos)
_OFFICE_EXTS = {'.docx', '.docm', '.xlsx', '.xlsm', '.pptx', '.pptm',
                '.odt', '.ods', '.odp'}

def _is_zip(raw: bytes, filename: str, mime: str) -> bool:
    """Detecta ZIP por firma de bytes (PK\\x03\\x04), excluyendo Office Open XML."""
    ext = os.path.splitext(filename.lower())[1]
    if ext in _OFFICE_EXTS:
        return False  # Documento Office — procesar como un solo archivo
    return raw[:4] == b'PK\x03\x04' or filename.lower().endswith('.zip')


def _should_skip_zip_entry(name: str) -> bool:
    """Descarta entradas de directorio, metadatos macOS y archivos de sistema."""
    base = os.path.basename(name)
    if not base or name.endswith('/'):
        return True
    if name.startswith('__MACOSX') or base.startswith('._') or base.startswith('.'):
        return True
    if base in ('Thumbs.db', 'desktop.ini', 'ehthumbs.db', '.gitkeep'):
        return True
    return False


def _extract_zip_entries(raw: bytes, *, _top=True) -> list:
    """
    Extrae recursivamente todos los archivos de un ZIP (incluidos ZIPs anidados).
    Retorna lista de (filename, raw_bytes, mime_type).
    Lanza zipfile.BadZipFile si _top=True y el ZIP está corrupto.
    """
    entries = []
    try:
        with zipfile.ZipFile(io.BytesIO(raw)) as zf:
            for zname in zf.namelist():
                if _should_skip_zip_entry(zname):
                    continue
                try:
                    zraw = zf.read(zname)
                except Exception:
                    continue
                if not zraw:
                    continue
                base  = os.path.basename(zname)
                zmime = mimetypes.guess_type(zname)[0] or 'application/octet-stream'
                if _is_zip(zraw, base, zmime):
                    entries.extend(_extract_zip_entries(zraw, _top=False))
                else:
                    entries.append((base, zraw, zmime))
    except zipfile.BadZipFile:
        if _top:
            raise
    return entries


def _process_file(case_id, filename, raw, mime):
    """Procesa un archivo (bytes) y lo guarda. Retorna dict resultado."""
    sha  = hashlib.sha256(raw).hexdigest()
    size = len(raw)

    dup = query(
        "SELECT artifact_id FROM user_artifacts WHERE checksum_sha256=%s AND case_id=%s AND source='user'",
        (sha, case_id)
    )
    if dup:
        return {"filename": filename, "status": "duplicate", "artifact_id": dup['artifact_id']}

    cached = query(
        "SELECT extracted_text FROM extraction_cache WHERE checksum_sha256=%s AND mime_type=%s",
        (sha, mime)
    )
    cached_text = (cached or {}).get('extracted_text', '') or ''
    if cached and cached_text.strip():
        text = cached_text
    else:
        tmp_path = os.path.join(UPLOAD_DIR, f"tmp_{sha[:16]}")
        with open(tmp_path, 'wb') as fh:
            fh.write(raw)
        text = extract_text(tmp_path, mime, raw)
        os.remove(tmp_path)
        if text.strip():  # solo cachear si hay contenido real
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


def _safe_process(case_id, filename, raw, mime):
    """Envuelve _process_file capturando cualquier excepción como error JSON."""
    try:
        return _process_file(case_id, filename, raw, mime)
    except Exception as e:
        import logging, traceback
        logging.getLogger('upload').error('_process_file %s: %s\n%s', filename, e, traceback.format_exc())
        return {"filename": filename, "error": str(e)}


@upload_bp.route('/api/upload', methods=['POST'])
@upload_bp.route('/api/v1/upload', methods=['POST'])
def upload():
    try:
        case_id = request.form.get('case_id', '')

        files = request.files.getlist('files') or request.files.getlist('file')
        if not files:
            return jsonify({"error": "No se recibieron archivos"}), 400

        results = []
        for f in files:
            raw  = f.read()
            mime = f.mimetype or 'application/octet-stream'
            # Normalizar MIME cuando el browser manda octet-stream para tipos conocidos
            if mime == 'application/octet-stream':
                guessed = mimetypes.guess_type(f.filename)[0]
                if guessed:
                    mime = guessed

            # ── ZIP: extraer recursivamente (incluye ZIPs anidados y carpetas) ──
            is_zip = _is_zip(raw, f.filename, mime)
            if is_zip:
                try:
                    entries = _extract_zip_entries(raw, _top=True)
                except zipfile.BadZipFile:
                    results.append({"filename": f.filename, "error": "ZIP inválido o corrupto"})
                    continue
                if not entries:
                    results.append({"filename": f.filename, "error": "ZIP vacío o sin archivos procesables"})
                    continue
                for fname, fraw, fmime in entries:
                    if fmime not in ALLOWED_MIME:
                        results.append({"filename": fname, "error": f"Tipo no permitido: {fmime}"})
                        continue
                    results.append(_safe_process(case_id, fname, fraw, fmime))
                continue

            # ── Archivo normal ────────────────────────────────────────────
            if mime not in ALLOWED_MIME:
                results.append({"filename": f.filename, "error": f"Tipo no permitido: {mime}"})
                continue
            results.append(_safe_process(case_id, f.filename, raw, mime))

    except Exception as e:
        import logging
        logging.getLogger('upload').error('upload route: %s', e)
        return jsonify({"error": str(e)}), 500

    return jsonify({"results": results})
