import os
import io
import uuid
import zipfile
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
               WHERE case_id=%s AND COALESCE(source,'') != 'system'
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
    return jsonify({"artifacts": results})


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
               WHERE case_id=%s AND COALESCE(source,'') != 'system'
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
    return jsonify({"artifacts": results})


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

    if fmt == 'pdf':
        try:
            import markdown as md_lib
            from weasyprint import HTML as WH
            # Markdown → HTML completo
            html_body = md_lib.markdown(content, extensions=['tables', 'fenced_code'])
            html = f"""<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>{name}</title>
<style>
  @page {{margin:2cm}}
  body{{font-family:Arial,sans-serif;font-size:11pt;line-height:1.6;color:#111}}
  h1{{font-size:18pt;border-bottom:2px solid #c47a5a;padding-bottom:4pt;color:#1a202c}}
  h2{{font-size:14pt;color:#2d3748;margin-top:16pt}}
  h3{{font-size:12pt;color:#4a5568}}
  table{{border-collapse:collapse;width:100%;margin:10pt 0}}
  td,th{{border:1px solid #ccc;padding:6pt 8pt;font-size:10pt}}
  th{{background:#f5f0eb;font-weight:bold}}
  tr:nth-child(even){{background:#faf6f1}}
  code{{background:#f0ede8;padding:1pt 4pt;border-radius:3pt;font-size:9.5pt}}
  pre{{background:#f0ede8;padding:10pt;border-radius:5pt;overflow-x:auto}}
  ul,ol{{margin:6pt 0;padding-left:20pt}}
  strong{{color:#1a202c}}
  hr{{border:none;border-top:1px solid #ddd;margin:14pt 0}}
</style>
</head><body>{html_body}</body></html>"""
            pdf_bytes = WH(string=html).write_pdf()
            return Response(
                pdf_bytes,
                mimetype='application/pdf',
                headers={'Content-Disposition': f'attachment; filename="{name}.pdf"'}
            )
        except ImportError:
            return jsonify({"error": "weasyprint no instalado. Ejecuta: pip install weasyprint markdown"}), 500
        except Exception as e:
            return jsonify({"error": f"Error generando PDF: {str(e)}"}), 500

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


@artifacts_bp.route('/api/artifacts/<case_id>/zip', methods=['GET'])
def download_case_zip(case_id):
    """Descarga todos los artefactos generados del expediente en un ZIP."""
    buf = io.BytesIO()
    used_names = {}

    def unique_name(name):
        if name not in used_names:
            used_names[name] = 1
            return name
        used_names[name] += 1
        base, ext = os.path.splitext(name)
        return f"{base}_{used_names[name]}{ext}"

    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Artefactos de texto generados por Claude
        rows = query(
            """SELECT artifact_name, artifact_type, content
               FROM system_artifacts
               WHERE case_id=%s AND COALESCE(artifact_type,'') != 'session_notes'
               ORDER BY created_at ASC""",
            (case_id,), many=True
        ) or []
        for r in rows:
            safe = (r.get('artifact_name') or 'documento').replace('/', '_').replace('\\', '_')
            fname = unique_name(f"{safe}.md")
            zf.writestr(fname, r.get('content') or '')

        # Imágenes y archivos generados por IA (user_artifacts source='system')
        img_rows = query(
            "SELECT file_path, filename FROM user_artifacts WHERE case_id=%s AND source='system' ORDER BY uploaded_at ASC",
            (case_id,), many=True
        ) or []
        for r in img_rows:
            fp = r.get('file_path', '')
            if fp and os.path.exists(fp):
                fname = unique_name(r.get('filename') or os.path.basename(fp))
                zf.write(fp, fname)

    buf.seek(0)
    case_row = query("SELECT case_name FROM cases WHERE case_id=%s", (case_id,))
    case_name = (case_row or {}).get('case_name', case_id)
    zip_name = f"{case_name.replace(' ', '_')}.zip"
    return send_file(buf, mimetype='application/zip', as_attachment=True, download_name=zip_name)


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
