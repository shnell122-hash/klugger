"""
admin.py — Gestión de organizaciones, usuarios e invitaciones.

Jerarquía:
  Master Admin  (vilarkptl@gmail.com)  — control total
  Org Admin     (is_org_admin=1)       — gestión de su organización
  User          (default)              — sin acceso a este módulo
"""
import os, uuid, secrets, logging, mimetypes
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, session, send_file
from tools.db import query, execute

admin_bp = Blueprint('admin', __name__)
log = logging.getLogger('admin')

MASTER_EMAILS = {'vilarkptl@gmail.com'}
INVITE_TTL_DAYS = 7
APP_BASE_URL = os.getenv('APP_BASE_URL', 'https://ocr.ruby.lease')

# Directorio correcto: admin.py está en api/routes/, necesitamos subir 3 niveles para llegar a v59/
_V59_ROOT  = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
LOGO_DIR   = os.path.join(_V59_ROOT, 'frontend', 'logos')
# Fallback para archivos subidos antes de la corrección del path
_LOGO_DIR_LEGACY = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'frontend', 'logos')
os.makedirs(LOGO_DIR, exist_ok=True)
LOGO_ALLOWED_MIME = {'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'}
LOGO_MAX_BYTES = 2 * 1024 * 1024  # 2 MB


# ── Helpers ──────────────────────────────────────────────────────────────────

def _is_master():
    return session.get('user_email', '') in MASTER_EMAILS


def _is_sub_master():
    return bool(session.get('is_sub_master', False))


def _sm_org_ids():
    """IDs de orgs asignadas al sub master actual."""
    sm_id = session.get('user_id')
    if not sm_id:
        return []
    rows = query(
        "SELECT org_id FROM organizations WHERE sub_master_id=%s AND is_active=1",
        (sm_id,), many=True
    ) or []
    return [r['org_id'] for r in rows]


def _is_any_admin():
    return _is_master() or bool(session.get('is_org_admin')) or _is_sub_master()


def _my_org():
    org = session.get('org_id')
    if org:
        return org
    # Fallback: re-read from DB if session is stale (e.g. org assigned after login)
    user_id = session.get('user_id')
    if user_id:
        row = query("SELECT org_id FROM users WHERE user_id=%s", (user_id,))
        if row and row.get('org_id'):
            session['org_id'] = row['org_id']
            return row['org_id']
    return None


def _require_admin(f):
    from functools import wraps
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'No autenticado'}), 401
        if not _is_any_admin():
            return jsonify({'error': 'Acceso denegado'}), 403
        return f(*args, **kwargs)
    return wrapper


def _require_master(f):
    from functools import wraps
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'No autenticado'}), 401
        if not _is_master():
            return jsonify({'error': 'Solo el Master Admin puede realizar esta acción'}), 403
        return f(*args, **kwargs)
    return wrapper


def init_org_tables():
    """Crea tablas de organizaciones e invitaciones si no existen."""
    execute("""CREATE TABLE IF NOT EXISTS organizations (
        org_id             VARCHAR(36)    PRIMARY KEY,
        org_name           VARCHAR(255)   NOT NULL,
        domain             VARCHAR(255)   UNIQUE,
        logo_path          VARCHAR(512),
        primary_color      VARCHAR(20)    DEFAULT '#c47a5a',
        accent_color       VARCHAR(20)    DEFAULT '#8b5cf6',
        monthly_budget_mxn DECIMAL(12,2),
        token_limit        INT,
        is_active          TINYINT(1)     DEFAULT 1,
        created_at         TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
    )""")
    execute("""CREATE TABLE IF NOT EXISTS sub_master_rates (
        sub_master_id       VARCHAR(36)   PRIMARY KEY,
        cost_mxn_per_usd    DECIMAL(10,4) NOT NULL DEFAULT 19.0,
        price_mxn_per_usd   DECIMAL(10,4) NOT NULL DEFAULT 104.5,
        notes               VARCHAR(500),
        updated_at          TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )""")
    execute("""CREATE TABLE IF NOT EXISTS invitations (
        invite_id   VARCHAR(36)  PRIMARY KEY,
        email       VARCHAR(255),
        org_id      VARCHAR(36),
        role        VARCHAR(20)  NOT NULL DEFAULT 'user',
        token       VARCHAR(64)  UNIQUE NOT NULL,
        expires_at  DATETIME     NOT NULL,
        used        TINYINT(1)   DEFAULT 0,
        created_by  VARCHAR(255) NOT NULL,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )""")
    execute("""CREATE TABLE IF NOT EXISTS user_case_access (
        id          INT          AUTO_INCREMENT PRIMARY KEY,
        user_id     VARCHAR(36)  NOT NULL,
        case_id     VARCHAR(36)  NOT NULL,
        granted_by  VARCHAR(255),
        granted_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY  uk_uca (user_id, case_id)
    )""")
    # Idempotent columns on users
    for col_sql in [
        "ALTER TABLE users ADD COLUMN org_id           VARCHAR(36)   DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN is_org_admin     TINYINT(1)    DEFAULT 0",
        "ALTER TABLE users ADD COLUMN approved         TINYINT(1)    DEFAULT 1",
        "ALTER TABLE users ADD COLUMN token_limit      INT           DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN can_create_cases TINYINT(1)    DEFAULT 1",
        "ALTER TABLE users ADD COLUMN case_access      VARCHAR(20)   DEFAULT 'all'",
        "ALTER TABLE users ADD COLUMN is_sub_master    TINYINT(1)    DEFAULT 0",
        "ALTER TABLE organizations ADD COLUMN sub_master_id VARCHAR(36) DEFAULT NULL",
        "ALTER TABLE invitations ADD COLUMN is_sub_master TINYINT(1) DEFAULT 0",
    ]:
        try:
            execute(col_sql)
        except Exception:
            pass
    # Migrar rutas de logos antiguas (frontend/logos/) a la nueva ruta de API
    try:
        execute(
            "UPDATE organizations SET logo_path = CONCAT('/api/admin/org-logo/', SUBSTRING_INDEX(logo_path,'/',-1)) "
            "WHERE logo_path LIKE '/OCR/v59/frontend/logos/%'"
        )
    except Exception:
        pass


# ── Organizations ─────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/organizations', methods=['GET'])
@_require_master
def list_orgs():
    orgs = query(
        "SELECT o.*, COUNT(u.user_id) AS member_count "
        "FROM organizations o "
        "LEFT JOIN users u ON u.org_id=o.org_id "
        "GROUP BY o.org_id ORDER BY o.org_name",
        many=True
    ) or []
    return jsonify({'organizations': orgs})


@admin_bp.route('/api/admin/organizations', methods=['POST'])
@_require_master
def create_org():
    body     = request.get_json(force=True) or {}
    org_name = (body.get('org_name') or '').strip()
    if not org_name:
        return jsonify({'error': 'org_name requerido'}), 400
    domain   = (body.get('domain') or '').strip().lower() or None
    budget   = body.get('monthly_budget_mxn') or None
    tok_lim  = body.get('token_limit') or None
    primary  = (body.get('primary_color') or '#c47a5a').strip()
    accent   = (body.get('accent_color')  or '#8b5cf6').strip()
    org_id   = str(uuid.uuid4())
    execute(
        "INSERT INTO organizations (org_id, org_name, domain, monthly_budget_mxn, token_limit, primary_color, accent_color) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (org_id, org_name, domain, budget, tok_lim, primary, accent)
    )
    return jsonify({'org_id': org_id, 'org_name': org_name})


@admin_bp.route('/api/admin/organizations/<org_id>', methods=['PUT'])
@_require_master
def update_org(org_id):
    body   = request.get_json(force=True) or {}
    fields, vals = [], []
    for f in ('org_name', 'domain', 'monthly_budget_mxn', 'token_limit',
              'is_active', 'primary_color', 'accent_color'):
        if f in body:
            fields.append(f'{f}=%s')
            vals.append(body[f] if body[f] != '' else None)
    if not fields:
        return jsonify({'error': 'Nada que actualizar'}), 400
    vals.append(org_id)
    execute(f"UPDATE organizations SET {','.join(fields)} WHERE org_id=%s", vals)
    return jsonify({'ok': True})


@admin_bp.route('/api/admin/my-org', methods=['GET'])
@_require_admin
def get_my_org():
    """Org admin / sub master: lee los datos de su(s) organización(es)."""
    if _is_sub_master():
        # Orgs asignadas por el master (sub_master_id) más la propia org del usuario (fallback)
        org_ids = _sm_org_ids()
        own_org = _my_org()
        if own_org and own_org not in org_ids:
            org_ids = org_ids + [own_org]
        if not org_ids:
            return jsonify({'error': 'Sin organizaciones asignadas'}), 404
        ph = ','.join(['%s'] * len(org_ids))
        rows = query(
            f"SELECT org_id, org_name, domain, monthly_budget_mxn, token_limit, "
            f"primary_color, accent_color, logo_path FROM organizations WHERE org_id IN ({ph})",
            org_ids, many=True
        ) or []
        return jsonify({'org': rows[0] if len(rows) == 1 else None, 'orgs': rows})
    org_id = _my_org()
    if not org_id:
        return jsonify({'error': 'Sin organización asignada'}), 404
    row = query(
        "SELECT org_id, org_name, domain, monthly_budget_mxn, token_limit, "
        "primary_color, accent_color, logo_path FROM organizations WHERE org_id=%s", (org_id,)
    )
    if not row:
        return jsonify({'error': 'Organización no encontrada'}), 404
    return jsonify({'org': row})


@admin_bp.route('/api/admin/my-org', methods=['PUT'])
@_require_admin
def update_my_org():
    """Org admin / sub master: actualiza límites de organización."""
    body = request.get_json(force=True) or {}
    if _is_sub_master():
        org_id = body.get('org_id')
        if not org_id or org_id not in set(_sm_org_ids()):
            return jsonify({'error': 'Org no válida o no asignada'}), 403
    else:
        org_id = _my_org()
        if not org_id:
            return jsonify({'error': 'Sin organización asignada'}), 404
    # Org admins only allowed to change budget/token limits, not name/domain/colors
    allowed = ('monthly_budget_mxn', 'token_limit')
    fields, vals = [], []
    for f in allowed:
        if f in body:
            fields.append(f'{f}=%s')
            vals.append(body[f] if body[f] != '' else None)
    if not fields:
        return jsonify({'error': 'Nada que actualizar'}), 400
    vals.append(org_id)
    execute(f"UPDATE organizations SET {','.join(fields)} WHERE org_id=%s", vals)
    return jsonify({'ok': True})


@admin_bp.route('/api/admin/my-org/logo', methods=['POST'])
@_require_admin
def upload_org_logo():
    """Org admin / sub master: sube el logo de una organización."""
    if _is_sub_master():
        org_id = request.args.get('org_id') or request.form.get('org_id')
        allowed = set(_sm_org_ids())
        own_org = _my_org()
        if own_org:
            allowed.add(own_org)
        if not org_id or org_id not in allowed:
            return jsonify({'error': 'Org no válida o no asignada'}), 403
    else:
        org_id = _my_org()
        if not org_id:
            return jsonify({'error': 'Sin organización asignada'}), 404
    f = request.files.get('logo')
    if not f:
        return jsonify({'error': 'No se envió archivo'}), 400
    raw = f.read(LOGO_MAX_BYTES + 1)
    if len(raw) > LOGO_MAX_BYTES:
        return jsonify({'error': 'Archivo demasiado grande (máx 2 MB)'}), 400
    mime = (f.content_type or '').split(';')[0].strip()
    if not mime:
        mime = mimetypes.guess_type(f.filename or '')[0] or ''
    if mime not in LOGO_ALLOWED_MIME:
        return jsonify({'error': f'Tipo no permitido: "{mime}". Usa PNG, JPG, GIF, WebP o SVG'}), 400
    ext = os.path.splitext(f.filename or '')[1].lower() or '.png'
    filename = f'org_{org_id}{ext}'
    dest = os.path.join(LOGO_DIR, filename)
    log.info('logo upload: org=%s mime=%s dest=%s', org_id, mime, dest)
    try:
        os.makedirs(LOGO_DIR, exist_ok=True)
        with open(dest, 'wb') as fh:
            fh.write(raw)
    except OSError as e:
        log.error('logo write failed: %s', e)
        return jsonify({'error': f'Error al guardar: {e}'}), 500
    logo_url = f'/api/admin/org-logo/{filename}'
    execute("UPDATE organizations SET logo_path=%s WHERE org_id=%s", (logo_url, org_id))
    log.info('org logo saved: org=%s url=%s', org_id, logo_url)
    return jsonify({'ok': True, 'logo_path': logo_url})


@admin_bp.route('/api/admin/org-logo/<filename>')
def serve_org_logo(filename):
    """Sirve el logo de una organización (sin auth — es imagen pública)."""
    safe = os.path.basename(filename)
    mime = mimetypes.guess_type(safe)[0] or 'image/png'
    for d in [LOGO_DIR, _LOGO_DIR_LEGACY]:
        path = os.path.join(d, safe)
        if os.path.isfile(path):
            return send_file(path, mimetype=mime)
    log.warning('org logo not found: %s (looked in %s and %s)', safe, LOGO_DIR, _LOGO_DIR_LEGACY)
    return '', 404


@admin_bp.route('/api/admin/organizations/<org_id>', methods=['DELETE'])
@_require_master
def delete_org(org_id):
    execute("UPDATE users SET org_id=NULL, is_org_admin=0 WHERE org_id=%s", (org_id,))
    execute("DELETE FROM invitations WHERE org_id=%s", (org_id,))
    execute("DELETE FROM organizations WHERE org_id=%s", (org_id,))
    return jsonify({'ok': True})


# ── Sub Master Admins ─────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/sub-masters', methods=['GET'])
@_require_master
def list_sub_masters():
    rows = query(
        """SELECT u.user_id, u.name, u.email, u.approved,
                  smr.cost_mxn_per_usd, smr.price_mxn_per_usd, smr.notes,
                  GROUP_CONCAT(o.org_id ORDER BY o.org_name SEPARATOR ',')   AS org_ids,
                  GROUP_CONCAT(o.org_name ORDER BY o.org_name SEPARATOR '|') AS org_names
           FROM users u
           LEFT JOIN sub_master_rates smr ON u.user_id = smr.sub_master_id
           LEFT JOIN organizations o ON o.sub_master_id = u.user_id
           WHERE u.is_sub_master = 1
           GROUP BY u.user_id, u.name, u.email, u.approved,
                    smr.cost_mxn_per_usd, smr.price_mxn_per_usd, smr.notes
           ORDER BY u.name""",
        many=True
    ) or []
    # Also return all orgs for the assignment UI
    all_orgs = query(
        "SELECT org_id, org_name, sub_master_id FROM organizations WHERE is_active=1 ORDER BY org_name",
        many=True
    ) or []
    return jsonify({'sub_masters': rows, 'all_orgs': all_orgs})


@admin_bp.route('/api/admin/sub-masters/promote', methods=['POST'])
@_require_master
def promote_sub_master_by_email():
    """Promueve a sub master buscando por email (registrado o invitación pendiente)."""
    body  = request.get_json(force=True) or {}
    email = (body.get('email') or '').strip().lower()
    cost  = body.get('cost_mxn_per_usd')
    price = body.get('price_mxn_per_usd')
    if not email:
        return jsonify({'error': 'Email requerido'}), 400

    user_row = query("SELECT user_id, name FROM users WHERE LOWER(email)=%s", (email,))
    if user_row:
        uid  = user_row['user_id']
        name = user_row['name']
        execute("UPDATE users SET is_sub_master=1 WHERE user_id=%s", (uid,))
        # Upsert rates if provided
        if cost is not None or price is not None:
            existing = query("SELECT sub_master_id FROM sub_master_rates WHERE sub_master_id=%s", (uid,))
            if existing:
                execute(
                    "UPDATE sub_master_rates SET cost_mxn_per_usd=%s, price_mxn_per_usd=%s WHERE sub_master_id=%s",
                    (float(cost or 19.0), float(price or 104.5), uid)
                )
            else:
                execute(
                    "INSERT INTO sub_master_rates (sub_master_id, cost_mxn_per_usd, price_mxn_per_usd) VALUES (%s,%s,%s)",
                    (uid, float(cost or 19.0), float(price or 104.5))
                )
        log.info('promoted to sub_master: %s uid=%s', email, uid)
        return jsonify({'ok': True, 'user_id': uid, 'name': name})

    # User hasn't registered yet — mark their pending invitation
    invite_row = query(
        "SELECT invite_id FROM invitations WHERE LOWER(email)=%s AND used=0 AND expires_at > NOW()",
        (email,)
    )
    if invite_row:
        execute("UPDATE invitations SET is_sub_master=1 WHERE invite_id=%s", (invite_row['invite_id'],))
        # Pre-store rates keyed by email so they can be applied at registration
        # We store in sub_master_rates using email as a temporary key; auth.py will fix the key after registration
        if cost is not None or price is not None:
            execute(
                "INSERT INTO sub_master_rates (sub_master_id, cost_mxn_per_usd, price_mxn_per_usd, notes) "
                "VALUES (%s,%s,%s,'pending') ON DUPLICATE KEY UPDATE "
                "cost_mxn_per_usd=%s, price_mxn_per_usd=%s, notes='pending'",
                (email, float(cost or 19.0), float(price or 104.5),
                 float(cost or 19.0), float(price or 104.5))
            )
        log.info('pre-marked invite as sub_master: %s', email)
        return jsonify({'ok': True, 'user_id': None, 'name': email,
                        'pending': True, 'msg': 'Invitación marcada. Será Sub Master al registrarse.'})

    return jsonify({'error': f'No existe usuario ni invitación activa para "{email}"'}), 404


@admin_bp.route('/api/admin/sub-masters/<sm_id>', methods=['PUT'])
@_require_master
def update_sub_master(sm_id):
    """Promueve/configura un sub master admin: flags, rates y orgs asignadas."""
    body = request.get_json(force=True) or {}

    # Promote / demote
    if 'is_sub_master' in body:
        execute("UPDATE users SET is_sub_master=%s WHERE user_id=%s",
                (int(bool(body['is_sub_master'])), sm_id))

    # Upsert rates (only master sees/sets these — sub master never receives them)
    cost  = body.get('cost_mxn_per_usd')
    price = body.get('price_mxn_per_usd')
    notes = body.get('notes', '')
    if cost is not None or price is not None:
        existing = query("SELECT sub_master_id FROM sub_master_rates WHERE sub_master_id=%s", (sm_id,))
        if existing:
            fields, vals = [], []
            if cost  is not None: fields.append('cost_mxn_per_usd=%s');  vals.append(cost)
            if price is not None: fields.append('price_mxn_per_usd=%s'); vals.append(price)
            if 'notes' in body:   fields.append('notes=%s');              vals.append(notes)
            vals.append(sm_id)
            execute(f"UPDATE sub_master_rates SET {','.join(fields)} WHERE sub_master_id=%s", vals)
        else:
            execute(
                "INSERT INTO sub_master_rates (sub_master_id, cost_mxn_per_usd, price_mxn_per_usd, notes) "
                "VALUES (%s,%s,%s,%s)",
                (sm_id, cost or 19.0, price or 104.5, notes)
            )

    # Re-assign orgs
    if 'org_ids' in body:
        execute("UPDATE organizations SET sub_master_id=NULL WHERE sub_master_id=%s", (sm_id,))
        for oid in (body['org_ids'] or []):
            execute("UPDATE organizations SET sub_master_id=%s WHERE org_id=%s", (sm_id, oid))

    log.info('sub_master updated: %s', sm_id)
    return jsonify({'ok': True})


@admin_bp.route('/api/admin/sm/my-orgs', methods=['GET'])
@_require_admin
def sm_my_orgs():
    """Orgs asignadas al sub master actual (incluye logo_path para mostrar en panel)."""
    if not _is_sub_master():
        return jsonify({'orgs': []})
    org_ids = _sm_org_ids()
    own_org = _my_org()
    if own_org and own_org not in org_ids:
        org_ids = org_ids + [own_org]
    if not org_ids:
        return jsonify({'orgs': []})
    ph = ','.join(['%s'] * len(org_ids))
    rows = query(
        f"SELECT org_id, org_name, logo_path, primary_color, accent_color, "
        f"monthly_budget_mxn, token_limit FROM organizations WHERE org_id IN ({ph}) ORDER BY org_name",
        org_ids, many=True
    ) or []
    return jsonify({'orgs': rows})


# ── Users ─────────────────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/users', methods=['GET'])
@_require_admin
def list_users():
    if _is_master():
        rows = query(
            "SELECT u.user_id, u.email, u.name, u.picture, u.role, u.org_id, "
            "       u.is_org_admin, u.approved, u.token_limit, o.org_name "
            "FROM users u LEFT JOIN organizations o ON u.org_id=o.org_id "
            "ORDER BY u.created_at DESC",
            many=True
        ) or []
    else:
        rows = query(
            "SELECT u.user_id, u.email, u.name, u.picture, u.role, u.org_id, "
            "       u.is_org_admin, u.approved, u.token_limit, o.org_name "
            "FROM users u LEFT JOIN organizations o ON u.org_id=o.org_id "
            "WHERE u.org_id=%s ORDER BY u.created_at DESC",
            (_my_org(),), many=True
        ) or []
    return jsonify({'users': rows})


@admin_bp.route('/api/admin/users/<user_id>', methods=['PUT'])
@_require_admin
def update_user(user_id):
    body = request.get_json(force=True) or {}
    if _is_master():
        allowed = ('org_id', 'is_org_admin', 'is_sub_master', 'approved', 'token_limit', 'role',
                   'can_create_cases', 'case_access')
    else:
        # Org admins can only manage users in their own org
        target = query("SELECT org_id FROM users WHERE user_id=%s", (user_id,))
        if not target or target.get('org_id') != _my_org():
            return jsonify({'error': 'Acceso denegado'}), 403
        allowed = ('approved', 'token_limit', 'is_org_admin', 'can_create_cases', 'case_access')

    fields, vals = [], []
    for f in allowed:
        if f in body:
            fields.append(f'{f}=%s')
            vals.append(body[f] if body[f] != '' else None)
    if not fields:
        return jsonify({'error': 'Nada que actualizar'}), 400
    vals.append(user_id)
    execute(f"UPDATE users SET {','.join(fields)} WHERE user_id=%s", vals)
    return jsonify({'ok': True})


@admin_bp.route('/api/admin/users/<user_id>', methods=['DELETE'])
@_require_admin
def delete_user(user_id):
    if not _is_master():
        target = query("SELECT org_id FROM users WHERE user_id=%s", (user_id,))
        if not target or target.get('org_id') != _my_org():
            return jsonify({'error': 'Acceso denegado'}), 403
    execute("DELETE FROM users WHERE user_id=%s", (user_id,))
    return jsonify({'ok': True})


# ── Per-user case access ───────────────────────────────────────────────────────

@admin_bp.route('/api/admin/users/<user_id>/cases', methods=['GET'])
@_require_admin
def list_user_assigned_cases(user_id):
    """Lista los expedientes asignados explícitamente a un usuario."""
    if not _is_master():
        target = query("SELECT org_id FROM users WHERE user_id=%s", (user_id,))
        if not target or target.get('org_id') != _my_org():
            return jsonify({'error': 'Acceso denegado'}), 403
    rows = query(
        "SELECT c.case_id, c.case_name, c.matter_type, c.status, uca.granted_at "
        "FROM user_case_access uca "
        "JOIN cases c ON c.case_id=uca.case_id "
        "WHERE uca.user_id=%s ORDER BY c.case_name",
        (user_id,), many=True
    ) or []
    return jsonify({'cases': rows})


@admin_bp.route('/api/admin/users/<user_id>/cases', methods=['POST'])
@_require_admin
def add_user_case(user_id):
    """Asigna un expediente específico a un usuario."""
    if not _is_master():
        target = query("SELECT org_id FROM users WHERE user_id=%s", (user_id,))
        if not target or target.get('org_id') != _my_org():
            return jsonify({'error': 'Acceso denegado'}), 403
    body    = request.get_json(force=True) or {}
    case_id = (body.get('case_id') or '').strip()
    if not case_id:
        return jsonify({'error': 'case_id requerido'}), 400
    execute(
        "INSERT IGNORE INTO user_case_access (user_id, case_id, granted_by) VALUES (%s,%s,%s)",
        (user_id, case_id, session.get('user_email'))
    )
    return jsonify({'ok': True})


@admin_bp.route('/api/admin/users/<user_id>/cases/<case_id>', methods=['DELETE'])
@_require_admin
def remove_user_case(user_id, case_id):
    """Quita el acceso de un usuario a un expediente específico."""
    if not _is_master():
        target = query("SELECT org_id FROM users WHERE user_id=%s", (user_id,))
        if not target or target.get('org_id') != _my_org():
            return jsonify({'error': 'Acceso denegado'}), 403
    execute(
        "DELETE FROM user_case_access WHERE user_id=%s AND case_id=%s",
        (user_id, case_id)
    )
    return jsonify({'ok': True})


# ── Invitations (magic links) ─────────────────────────────────────────────────

@admin_bp.route('/api/admin/invitations', methods=['GET'])
@_require_admin
def list_invitations():
    if _is_master():
        rows = query(
            "SELECT i.*, o.org_name FROM invitations i "
            "LEFT JOIN organizations o ON i.org_id=o.org_id "
            "ORDER BY i.created_at DESC",
            many=True
        ) or []
    elif _is_sub_master():
        org_ids = _sm_org_ids()
        if not org_ids:
            rows = []
        else:
            ph = ','.join(['%s'] * len(org_ids))
            rows = query(
                f"SELECT i.*, o.org_name FROM invitations i "
                f"LEFT JOIN organizations o ON i.org_id=o.org_id "
                f"WHERE i.org_id IN ({ph}) ORDER BY i.created_at DESC",
                org_ids, many=True
            ) or []
    else:
        rows = query(
            "SELECT i.*, o.org_name FROM invitations i "
            "LEFT JOIN organizations o ON i.org_id=o.org_id "
            "WHERE i.org_id=%s ORDER BY i.created_at DESC",
            (_my_org(),), many=True
        ) or []
    # Attach the full invite URL
    for r in rows:
        r['url'] = f"{APP_BASE_URL}/OCR/v59/api/auth/invite?token={r['token']}"
    return jsonify({'invitations': rows})


@admin_bp.route('/api/admin/invitations', methods=['POST'])
@_require_admin
def create_invitation():
    body  = request.get_json(force=True) or {}
    email = (body.get('email') or '').strip().lower() or None
    role  = body.get('role', 'user')          # 'user' | 'org_admin' | 'master_admin'
    org_id = body.get('org_id') or None

    if role == 'master_admin' and not _is_master():
        return jsonify({'error': 'Solo el Master Admin puede crear otros Master Admins'}), 403

    valid_roles = ('user', 'org_admin', 'master_admin') if _is_master() else ('user', 'org_admin')
    if role not in valid_roles:
        return jsonify({'error': f'Rol inválido: {role}'}), 400

    # Sub masters can invite into any of their assigned orgs
    if _is_sub_master():
        allowed = set(_sm_org_ids())
        if not org_id or org_id not in allowed:
            return jsonify({'error': 'Solo puedes invitar a tus organizaciones asignadas'}), 403
    # Org admins can only invite into their own org
    elif not _is_master():
        org_id = _my_org()

    token     = secrets.token_urlsafe(32)
    invite_id = str(uuid.uuid4())
    expires   = datetime.utcnow() + timedelta(days=INVITE_TTL_DAYS)
    execute(
        "INSERT INTO invitations (invite_id, email, org_id, role, token, expires_at, created_by) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (invite_id, email, org_id, role, token,
         expires.strftime('%Y-%m-%d %H:%M:%S'), session.get('user_email'))
    )
    invite_url = f"{APP_BASE_URL}/OCR/v59/api/auth/invite?token={token}"
    return jsonify({
        'invite_id':  invite_id,
        'url':        invite_url,
        'role':       role,
        'expires_at': expires.isoformat(),
    })


@admin_bp.route('/api/admin/invitations/<invite_id>', methods=['DELETE'])
@_require_admin
def revoke_invitation(invite_id):
    execute("DELETE FROM invitations WHERE invite_id=%s", (invite_id,))
    return jsonify({'ok': True})


# ── Cases assignment ──────────────────────────────────────────────────────────

@admin_bp.route('/api/admin/cases', methods=['GET'])
@_require_admin
def admin_list_cases():
    if _is_master():
        rows = query(
            """SELECT c.case_id, c.case_name, c.matter_type, c.status,
                      c.owner_email, c.org_id, c.created_at, c.updated_at,
                      o.org_name
               FROM cases c
               LEFT JOIN organizations o ON c.org_id = o.org_id
               ORDER BY c.updated_at DESC LIMIT 200""",
            many=True
        ) or []
    else:
        rows = query(
            """SELECT c.case_id, c.case_name, c.matter_type, c.status,
                      c.owner_email, c.org_id, c.created_at, c.updated_at,
                      o.org_name
               FROM cases c
               LEFT JOIN organizations o ON c.org_id = o.org_id
               WHERE c.org_id=%s
               ORDER BY c.updated_at DESC LIMIT 200""",
            (_my_org(),), many=True
        ) or []
    return jsonify({'cases': rows})


@admin_bp.route('/api/admin/cases/<case_id>', methods=['PUT'])
@_require_admin
def admin_update_case(case_id):
    body = request.get_json(force=True) or {}
    fields, vals = [], []

    if 'org_id' in body:
        # Verify org_admin only assigns to their own org
        if not _is_master() and body['org_id'] != _my_org():
            return jsonify({'error': 'Solo puedes asignar expedientes a tu organización'}), 403
        fields.append('org_id=%s')
        vals.append(body['org_id'] or None)

    if 'owner_email' in body and _is_master():
        fields.append('owner_email=%s')
        vals.append(body['owner_email'] or None)

    if 'status' in body:
        fields.append('status=%s')
        vals.append(body['status'])

    if not fields:
        return jsonify({'error': 'Nada que actualizar'}), 400

    vals.append(case_id)
    execute(f"UPDATE cases SET {','.join(fields)} WHERE case_id=%s", vals)
    return jsonify({'ok': True})


# ── Stats for admin dashboard ─────────────────────────────────────────────────

@admin_bp.route('/api/admin/stats', methods=['GET'])
@_require_admin
def admin_stats():
    if _is_master():
        orgs  = query("SELECT COUNT(*) AS n FROM organizations")[  'n']
        users = query("SELECT COUNT(*) AS n FROM users")[           'n']
        pending_inv = query(
            "SELECT COUNT(*) AS n FROM invitations WHERE used=0 AND expires_at > NOW()"
        )['n']
    else:
        org_id = _my_org()
        orgs   = 1
        users  = query("SELECT COUNT(*) AS n FROM users WHERE org_id=%s", (org_id,))['n']
        pending_inv = query(
            "SELECT COUNT(*) AS n FROM invitations WHERE org_id=%s AND used=0 AND expires_at > NOW()",
            (org_id,)
        )['n']
    return jsonify({'orgs': orgs, 'users': users, 'pending_invitations': pending_inv})
