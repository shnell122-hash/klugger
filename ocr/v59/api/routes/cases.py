import uuid
from flask import Blueprint, request, jsonify
from tools.db import query, execute

cases_bp = Blueprint('cases', __name__)


@cases_bp.route('/api/cases', methods=['GET'])
@cases_bp.route('/api/v1/cases', methods=['GET'])
@cases_bp.route('/api/v1/matters', methods=['GET'])
def list_cases():
    rows = query(
        "SELECT case_id, case_name, matter_type, status, created_at, updated_at "
        "FROM cases ORDER BY updated_at DESC LIMIT 100",
        many=True
    )
    return jsonify({"cases": rows or []})


@cases_bp.route('/api/cases', methods=['POST'])
@cases_bp.route('/api/v1/cases', methods=['POST'])
@cases_bp.route('/api/v1/matters', methods=['POST'])
def create_case():
    body = request.get_json(force=True, silent=True) or {}
    name  = body.get('case_name', '').strip()
    mtype = body.get('matter_type', 'general').strip()
    if not name:
        return jsonify({"error": "case_name requerido"}), 400

    cid = str(uuid.uuid4())
    execute(
        "INSERT INTO cases (case_id, case_name, matter_type, status) VALUES (%s,%s,%s,'active')",
        (cid, name, mtype)
    )
    return jsonify({"case_id": cid, "case_name": name, "matter_type": mtype, "status": "active"}), 201


@cases_bp.route('/api/cases/<case_id>', methods=['GET'])
@cases_bp.route('/api/v1/cases/<case_id>', methods=['GET'])
@cases_bp.route('/api/v1/matters/<case_id>', methods=['GET'])
def get_case(case_id):
    row = query("SELECT * FROM cases WHERE case_id=%s", (case_id,))
    if not row:
        return jsonify({"error": "Caso no encontrado"}), 404
    return jsonify({"case": row})


@cases_bp.route('/api/cases/<case_id>', methods=['PUT', 'PATCH'])
@cases_bp.route('/api/v1/cases/<case_id>', methods=['PUT', 'PATCH'])
def update_case(case_id):
    body = request.get_json(force=True, silent=True) or {}
    name   = body.get('case_name')
    mtype  = body.get('matter_type')
    status = body.get('status')

    sets, vals = [], []
    if name:   sets.append("case_name=%s");   vals.append(name)
    if mtype:  sets.append("matter_type=%s"); vals.append(mtype)
    if status: sets.append("status=%s");      vals.append(status)
    if not sets:
        return jsonify({"error": "Nada que actualizar"}), 400

    vals.append(case_id)
    execute(f"UPDATE cases SET {', '.join(sets)} WHERE case_id=%s", vals)
    return jsonify({"status": "updated"})


@cases_bp.route('/api/cases/<case_id>', methods=['DELETE'])
@cases_bp.route('/api/v1/cases/<case_id>', methods=['DELETE'])
def delete_case(case_id):
    execute("DELETE FROM cases WHERE case_id=%s", (case_id,))
    return jsonify({"status": "deleted"})
