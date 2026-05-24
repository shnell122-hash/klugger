import uuid
from flask import Blueprint, request, jsonify, session
from tools.db import query, execute
from routes.auth import require_login

cases_bp = Blueprint('cases', __name__)


def _is_admin():
    return session.get('user_role') == 'admin'


def _init_cases_table():
    """Agrega org_id a cases si no existe (idempotente)."""
    try:
        execute("ALTER TABLE cases ADD COLUMN org_id VARCHAR(36) DEFAULT NULL")
    except Exception:
        pass
    try:
        execute("ALTER TABLE cases ADD INDEX idx_cases_org (org_id)")
    except Exception:
        pass


@cases_bp.route('/api/cases', methods=['GET'])
@cases_bp.route('/api/v1/cases', methods=['GET'])
@cases_bp.route('/api/v1/matters', methods=['GET'])
@require_login
def list_cases():
    if _is_admin():
        rows = query(
            "SELECT case_id, case_name, matter_type, status, created_at, updated_at, owner_email, org_id "
            "FROM cases ORDER BY updated_at DESC LIMIT 100",
            many=True
        )
    else:
        email   = session.get('user_email', '')
        org_id  = session.get('org_id')
        is_org_admin = session.get('is_org_admin', 0)
        if org_id and is_org_admin:
            # Org admin: ve todos los expedientes de su organización
            rows = query(
                "SELECT case_id, case_name, matter_type, status, created_at, updated_at, owner_email, org_id "
                "FROM cases WHERE org_id=%s OR owner_email=%s ORDER BY updated_at DESC LIMIT 100",
                (org_id, email), many=True
            )
        elif org_id:
            case_access = session.get('case_access', 'all')
            if case_access == 'assigned':
                # Usuario con acceso restringido: solo expedientes asignados explícitamente
                rows = query(
                    "SELECT c.case_id, c.case_name, c.matter_type, c.status, "
                    "       c.created_at, c.updated_at, c.owner_email, c.org_id "
                    "FROM cases c "
                    "INNER JOIN user_case_access uca ON uca.case_id=c.case_id AND uca.user_id=%s "
                    "WHERE c.org_id=%s ORDER BY c.updated_at DESC LIMIT 100",
                    (session.get('user_id'), org_id), many=True
                )
            else:
                # Usuario normal en org: ve los suyos + los de la org sin dueño específico
                rows = query(
                    "SELECT case_id, case_name, matter_type, status, created_at, updated_at, owner_email, org_id "
                    "FROM cases WHERE owner_email=%s OR (org_id=%s AND owner_email IS NULL) "
                    "ORDER BY updated_at DESC LIMIT 100",
                    (email, org_id), many=True
                )
        else:
            rows = query(
                "SELECT case_id, case_name, matter_type, status, created_at, updated_at, owner_email, org_id "
                "FROM cases WHERE owner_email=%s ORDER BY updated_at DESC LIMIT 100",
                (email,), many=True
            )
    return jsonify({"cases": rows or []})


@cases_bp.route('/api/cases', methods=['POST'])
@cases_bp.route('/api/v1/cases', methods=['POST'])
@cases_bp.route('/api/v1/matters', methods=['POST'])
@require_login
def create_case():
    body  = request.get_json(force=True, silent=True) or {}
    name  = body.get('case_name', '').strip()
    mtype = body.get('matter_type', 'general').strip()
    if not name:
        return jsonify({"error": "case_name requerido"}), 400

    if not _is_admin() and not session.get('can_create_cases', True):
        return jsonify({"error": "No tienes permiso para crear expedientes"}), 403

    email  = session.get('user_email', '')
    org_id = session.get('org_id')
    cid    = str(uuid.uuid4())
    execute(
        "INSERT INTO cases (case_id, case_name, matter_type, status, owner_email, org_id) "
        "VALUES (%s,%s,%s,'active',%s,%s)",
        (cid, name, mtype, email, org_id)
    )
    return jsonify({"case_id": cid, "case_name": name, "matter_type": mtype,
                    "status": "active", "owner_email": email, "org_id": org_id}), 201


@cases_bp.route('/api/cases/<case_id>', methods=['GET'])
@cases_bp.route('/api/v1/cases/<case_id>', methods=['GET'])
@cases_bp.route('/api/v1/matters/<case_id>', methods=['GET'])
@require_login
def get_case(case_id):
    row = query("SELECT * FROM cases WHERE case_id=%s", (case_id,))
    if not row:
        return jsonify({"error": "Caso no encontrado"}), 404
    email  = session.get('user_email', '')
    org_id = session.get('org_id')
    if not _is_admin():
        owns = row.get('owner_email') == email
        same_org = org_id and row.get('org_id') == org_id
        if not owns and not same_org:
            return jsonify({"error": "Sin acceso"}), 403
    return jsonify({"case": row})


@cases_bp.route('/api/cases/<case_id>', methods=['PUT', 'PATCH'])
@cases_bp.route('/api/v1/cases/<case_id>', methods=['PUT', 'PATCH'])
@require_login
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
@require_login
def delete_case(case_id):
    execute("DELETE FROM cases WHERE case_id=%s", (case_id,))
    return jsonify({"status": "deleted"})

