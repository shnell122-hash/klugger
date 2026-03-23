import uuid
from flask import Blueprint, request, jsonify
from tools.db import query, execute

artifacts_bp = Blueprint('artifacts', __name__)


@artifacts_bp.route('/api/v1/artifacts', methods=['GET'])
def list_artifacts():
    case_id       = request.args.get('case_id', '')
    limit         = min(int(request.args.get('limit', 60)), 200)
    src_filter    = request.args.get('type', 'all')      # all | user | system
    artifact_type = request.args.get('artifact_type', '')

    if not case_id:
        return jsonify({"error": "case_id requerido"}), 400

    results = []

    # --- user_artifacts ---
    if src_filter in ('all', 'user'):
        rows = query(
            """SELECT artifact_id, case_id, filename AS name, mime_type,
                      file_size_bytes, checksum_sha256,
                      CHAR_LENGTH(extracted_text) AS text_len,
                      uploaded_at AS created_at,
                      'user' AS source, NULL AS artifact_type
               FROM user_artifacts
               WHERE case_id=%s
               ORDER BY uploaded_at DESC
               LIMIT %s""",
            (case_id, limit), many=True
        )
        results.extend(rows or [])

    # --- system_artifacts ---
    if src_filter in ('all', 'system'):
        atype_clause = "AND artifact_type=%s" if artifact_type else ""
        params = [case_id]
        if artifact_type:
            params.append(artifact_type)
        params.append(limit)

        rows = query(
            f"""SELECT artifact_id, case_id, artifact_name AS name, artifact_type,
                       mime_type, file_size_bytes,
                       created_at, 'system' AS source
                FROM system_artifacts
                WHERE case_id=%s {atype_clause}
                ORDER BY created_at DESC
                LIMIT %s""",
            params, many=True
        )
        results.extend(rows or [])

    # Ordenar mezclados por fecha
    results.sort(key=lambda x: str(x.get('created_at', '')), reverse=True)
    return jsonify(results[:limit])


@artifacts_bp.route('/api/v1/artifacts/<artifact_id>', methods=['GET'])
def get_artifact(artifact_id):
    # Buscar en ambas tablas
    row = query(
        "SELECT * FROM system_artifacts WHERE artifact_id=%s", (artifact_id,)
    )
    if not row:
        row = query(
            "SELECT * FROM user_artifacts WHERE artifact_id=%s", (artifact_id,)
        )
    if not row:
        return jsonify({"error": "Artefacto no encontrado"}), 404
    return jsonify(row)


@artifacts_bp.route('/api/v1/artifacts/<artifact_id>', methods=['DELETE'])
def delete_artifact(artifact_id):
    execute("DELETE FROM system_artifacts WHERE artifact_id=%s", (artifact_id,))
    execute("DELETE FROM user_artifacts WHERE artifact_id=%s", (artifact_id,))
    return jsonify({"status": "deleted"})


@artifacts_bp.route('/api/v1/artifacts/save', methods=['POST'])
def save_artifact():
    """Guardar artefacto generado por Claude (tool call save_artifact)."""
    body = request.get_json(force=True, silent=True) or {}
    required = ['case_id', 'artifact_name', 'artifact_type', 'content']
    for field in required:
        if not body.get(field):
            return jsonify({"error": f"{field} requerido"}), 400

    art_id = str(uuid.uuid4())
    content = body['content']
    execute(
        """INSERT INTO system_artifacts
           (artifact_id, case_id, artifact_name, artifact_type, content,
            mime_type, file_size_bytes, source, selected_ctx_json)
           VALUES (%s,%s,%s,%s,%s,'text/markdown',%s,'system',%s)""",
        (
            art_id,
            body['case_id'],
            body['artifact_name'],
            body['artifact_type'],
            content,
            len(content.encode()),
            body.get('selected_ctx_json'),
        )
    )
    return jsonify({"artifact_id": art_id, "status": "saved"}), 201
