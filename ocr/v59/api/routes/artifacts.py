import os
import io
import uuid
from flask import Blueprint, request, jsonify, send_file, Response
from tools.db import query, execute

artifacts_bp = Blueprint('artifacts', __name__)


@artifacts_bp.route('/api/artifacts/<case_id>', methods=['GET'])
def list_artifacts_by_case(case_id):
    """Frontend-compatible: case_id as path param."""
    src_filter    = request.args.get('type', 'all')
    artifact_type = request.args.get('artifact_type', '')
    limit         = min(int(request.args.get('limit', 60)), 200)
    results = []

    if src_filter in ('all', 'user'):
        rows = query(
            """SELECT artifact_id, case_id, filename AS name, mime_type,
                      file_size_bytes, checksum_sha256,
                      CHAR_LENGTH(extracted_text) AS text_len,
                      uploaded_at AS created_at,
                      'user' AS source, NULL AS artifact_type
               FROM user_artifacts
               WHERE case_id=%s AND COALESCE(source,'user')='user'
               ORDER BY uploaded_at DESC
               LIMIT %s""",
            (case_id, limit), many=True
        )
        results.extend(rows or [])

    if src_filter in ('all', 'system'):
        # Imágenes generadas por IA (guardadas en user_artifacts con source='system')
        rows = query(
            """SELECT artifact_id, case_id, filename AS artifact_name,
                      'image' AS artifact_type, mime_type, file_size_bytes,
                      uploaded_at AS created_at, 'system' AS source
               FROM user_artifacts
               WHERE case_id=%s AND source='system'
               ORDER BY uploaded_at DESC
               LIMIT %s""",
            (case_id, limit), many=True
        )
        results.extend(rows or [])

        atype_clause = "AND artifact_type=%s" if artifact_type else ""
        params = [case_id]
        if artifact_type:
            params.append(artifact_type)
        params.append(limit)
        rows = query(
            f"""SELECT artifact_id, case_id, artifact_name, artifact_type,
                       mime_type, file_size_bytes,
                       created_at, 'system' AS source
                FROM system_artifacts
                WHERE case_id=%s {atype_clause}
                ORDER BY created_at DESC
                LIMIT %s""",
            params, many=True
        )
        results.extend(rows or [])

    results.sort(key=lambda x: str(x.get('created_at', '')), reverse=True)
    return jsonify({"artifacts": results[:limit]})


@artifacts_bp.route('/api/artifacts/file/<artifact_id>', methods=['GET'])
def serve_artifact_file(artifact_id):
    row = query("SELECT file_path, mime_type, filename FROM user_artifacts WHERE artifact_id=%s", (artifact_id,))
    if not row or not os.path.exists(row['file_path']):
        return jsonify({"error": "Archivo no encontrado"}), 404
    return send_file(row['file_path'], mimetype=row['mime_type'],
                     download_name=row['filename'], as_attachment=False)


@artifacts_bp.route('/api/artifacts/<artifact_id>/text', methods=['GET'])
def get_artifact_text(artifact_id):
    row = query("SELECT extracted_text FROM user_artifacts WHERE artifact_id=%s", (artifact_id,))
    if not row:
        row = query("SELECT content AS extracted_text FROM system_artifacts WHERE artifact_id=%s", (artifact_id,))
    if not row:
        return jsonify({"error": "Artefacto no encontrado"}), 404
    return jsonify({"text": row.get('extracted_text', '')})


@artifacts_bp.route('/api/artifacts/<artifact_id>', methods=['DELETE'])
def delete_artifact_compat(artifact_id):
    execute("DELETE FROM system_artifacts WHERE artifact_id=%s", (artifact_id,))
    execute("DELETE FROM user_artifacts WHERE artifact_id=%s", (artifact_id,))
    return jsonify({"status": "deleted"})


@artifacts_bp.route('/api/v1/artifacts', methods=['GET'])
def list_artifacts():
    case_id       = request.args.get('case_id', '')
    limit         = min(int(request.args.get('limit', 60)), 200)
    src_filter    = request.args.get('type', 'all')      # all | user | system
    artifact_type = request.args.get('artifact_type', '')

    if not case_id:
        return jsonify({"error": "case_id requerido"}), 400

    results = []

    # --- user_artifacts (subidos por usuario) ---
    if src_filter in ('all', 'user'):
        rows = query(
            """SELECT artifact_id, case_id, filename AS name, mime_type,
                      file_size_bytes, checksum_sha256,
                      CHAR_LENGTH(extracted_text) AS text_len,
                      uploaded_at AS created_at,
                      'user' AS source, NULL AS artifact_type
               FROM user_artifacts
               WHERE case_id=%s AND COALESCE(source,'user')='user'
               ORDER BY uploaded_at DESC
               LIMIT %s""",
            (case_id, limit), many=True
        )
        results.extend(rows or [])

    # --- system_artifacts + imágenes generadas ---
    if src_filter in ('all', 'system'):
        rows = query(
            """SELECT artifact_id, case_id, filename AS artifact_name,
                      'image' AS artifact_type, mime_type, file_size_bytes,
                      uploaded_at AS created_at, 'system' AS source
               FROM user_artifacts
               WHERE case_id=%s AND source='system'
               ORDER BY uploaded_at DESC
               LIMIT %s""",
            (case_id, limit), many=True
        )
        results.extend(rows or [])

        atype_clause = "AND artifact_type=%s" if artifact_type else ""
        params = [case_id]
        if artifact_type:
            params.append(artifact_type)
        params.append(limit)

        rows = query(
            f"""SELECT artifact_id, case_id, artifact_name, artifact_type,
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
    return jsonify({"artifacts": results[:limit]})


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


@artifacts_bp.route('/api/artifacts/<artifact_id>/download', methods=['GET'])
@artifacts_bp.route('/api/v1/artifacts/<artifact_id>/download', methods=['GET'])
def download_artifact(artifact_id):
    """Descarga un artefacto como .md, .html o .docx según el parámetro fmt."""
    fmt = request.args.get('fmt', 'md')

    # Imágenes generadas (guardadas en user_artifacts con source='system')
    img_row = query(
        "SELECT file_path, mime_type, filename FROM user_artifacts WHERE artifact_id=%s AND source='system'",
        (artifact_id,)
    )
    if img_row and img_row.get('file_path') and os.path.exists(img_row['file_path']):
        return send_file(
            img_row['file_path'],
            mimetype=img_row['mime_type'],
            as_attachment=True,
            download_name=img_row['filename']
        )

    row = query("SELECT artifact_name, artifact_type, content FROM system_artifacts WHERE artifact_id=%s", (artifact_id,))
    if not row:
        return jsonify({"error": "Artefacto no encontrado"}), 404

    content = row.get('content', '')
    name    = row.get('artifact_name', 'documento').replace(' ', '_')

    if fmt == 'html':
        # Envolver en HTML completo con estilos básicos para impresión
        html_body = content.replace('\n', '<br>') if not content.strip().startswith('<') else content
        html = f"""<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>{name}</title>
<style>body{{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;line-height:1.6}}
h1,h2,h3{{color:#1a202c}}table{{border-collapse:collapse;width:100%}}
td,th{{border:1px solid #ccc;padding:8px}}@media print{{body{{margin:0}}}}</style>
</head><body>{html_body}</body></html>"""
        return Response(
            html,
            mimetype='text/html',
            headers={'Content-Disposition': f'attachment; filename="{name}.html"'}
        )

    if fmt == 'docx':
        try:
            from docx import Document
            from docx.shared import Pt
            doc = Document()
            doc.add_heading(name, 0)
            for line in content.split('\n'):
                stripped = line.strip()
                if stripped.startswith('# '):
                    doc.add_heading(stripped[2:], level=1)
                elif stripped.startswith('## '):
                    doc.add_heading(stripped[3:], level=2)
                elif stripped.startswith('### '):
                    doc.add_heading(stripped[4:], level=3)
                elif stripped.startswith('- ') or stripped.startswith('* '):
                    doc.add_paragraph(stripped[2:], style='List Bullet')
                elif stripped == '---':
                    doc.add_paragraph('─' * 40)
                elif stripped:
                    p = doc.add_paragraph()
                    # Bold markers
                    parts = stripped.split('**')
                    for idx, part in enumerate(parts):
                        run = p.add_run(part)
                        run.bold = (idx % 2 == 1)
                else:
                    doc.add_paragraph('')
            buf = io.BytesIO()
            doc.save(buf)
            buf.seek(0)
            return send_file(
                buf,
                mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                as_attachment=True,
                download_name=f'{name}.docx'
            )
        except Exception as e:
            return jsonify({"error": f"Error generando DOCX: {str(e)}"}), 500

    # Default: markdown
    return Response(
        content,
        mimetype='text/markdown',
        headers={'Content-Disposition': f'attachment; filename="{name}.md"'}
    )


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
