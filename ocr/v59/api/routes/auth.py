import os, uuid, secrets, logging, time
from functools import wraps
from urllib.parse import urlencode
import requests
from flask import Blueprint, request, redirect, session, jsonify
from tools.db import query, execute

auth_bp = Blueprint('auth', __name__)
log = logging.getLogger('auth')

GOOGLE_CLIENT_ID     = '159215313260-v84tnd2m9r7tgg9b8efgqij6cpk1svnh.apps.googleusercontent.com'
GOOGLE_CLIENT_SECRET = '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'
GOOGLE_REDIRECT_URI  = os.getenv('GOOGLE_REDIRECT_URI', 'https://ocr.ruby.lease/OCR/v59/api/auth/google/callback')

_OAUTH_STATES: dict = {}
_STATE_TTL = 600

ADMIN_EMAILS = {'vilarkptl@gmail.com', 'german@vilarkptl.com'}


def init_tables():
    """Crea tablas de users y api_usage si no existen."""
    execute("""CREATE TABLE IF NOT EXISTS users (
        user_id      VARCHAR(36)  PRIMARY KEY,
        email        VARCHAR(255) UNIQUE NOT NULL,
        name         VARCHAR(255),
        picture      VARCHAR(512),
        role         VARCHAR(20)  NOT NULL DEFAULT 'user',
        org_id       VARCHAR(36)  DEFAULT NULL,
        is_org_admin TINYINT(1)   DEFAULT 0,
        approved     TINYINT(1)   DEFAULT 1,
        token_limit  INT          DEFAULT NULL,
        created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )""")
    execute("""CREATE TABLE IF NOT EXISTS api_usage (
        usage_id          VARCHAR(36)   PRIMARY KEY,
        user_id           VARCHAR(36),
        case_id           VARCHAR(36),
        model             VARCHAR(100),
        input_tokens      INT           DEFAULT 0,
        output_tokens     INT           DEFAULT 0,
        cache_read_tokens INT           DEFAULT 0,
        cost_usd          DECIMAL(12,8) DEFAULT 0.0,
        created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
    )""")
    # Idempotent migrations
    for col_sql in [
        "ALTER TABLE cases ADD COLUMN owner_email VARCHAR(255) DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN org_id        VARCHAR(36)  DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN is_org_admin  TINYINT(1)   DEFAULT 0",
        "ALTER TABLE users ADD COLUMN approved      TINYINT(1)   DEFAULT 1",
        "ALTER TABLE users ADD COLUMN token_limit   INT          DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) DEFAULT NULL",
        "ALTER TABLE users ADD COLUMN password_salt VARCHAR(64)  DEFAULT NULL",
    ]:
        try:
            execute(col_sql)
        except Exception:
            pass


# ── Password helpers (stdlib only, no bcrypt needed) ─────────────────────────

def _hash_password(plain: str, salt: str = None):
    import hashlib, os
    salt = salt or os.urandom(32).hex()
    h = hashlib.pbkdf2_hmac('sha256', plain.encode('utf-8'), salt.encode('utf-8'), 200_000)
    return h.hex(), salt


def _verify_password(plain: str, stored_hash: str, salt: str) -> bool:
    h, _ = _hash_password(plain, salt)
    return h == stored_hash


def _auto_org_for_email(email: str):
    """Devuelve org_id si el dominio del correo coincide con una organización activa."""
    domain = email.split('@')[1] if '@' in email else ''
    if not domain:
        return None
    row = query("SELECT org_id FROM organizations WHERE domain=%s AND is_active=1", (domain,))
    return row['org_id'] if row else None


def _apply_org_to_user(user_id: str, email: str, org_id: str):
    """Asigna org_id al usuario y actualiza sus expedientes sin org."""
    execute("UPDATE users SET org_id=%s WHERE user_id=%s AND org_id IS NULL", (org_id, user_id))
    execute("UPDATE cases SET org_id=%s WHERE owner_email=%s AND org_id IS NULL", (org_id, email))


def _load_user_session(user_id, email, name, picture, role):
    """Carga datos completos del usuario a la sesión, incluyendo org y permisos."""
    row = query(
        "SELECT org_id, is_org_admin, is_sub_master, approved, token_limit, password_hash, "
        "can_create_cases, case_access FROM users WHERE user_id=%s",
        (user_id,)
    ) or {}
    session.clear()   # evita que keys de sesión anterior contaminen la nueva
    session.permanent          = True
    session['user_id']         = user_id
    session['user_email']      = email
    session['user_name']       = name
    session['user_pic']        = picture
    session['user_role']       = role
    session['org_id']          = row.get('org_id')
    session['is_org_admin']    = bool(row.get('is_org_admin', 0))
    session['is_sub_master']   = bool(row.get('is_sub_master', 0))
    session['token_limit']     = row.get('token_limit')
    session['has_password']    = bool(row.get('password_hash'))
    session['can_create_cases']= bool(row.get('can_create_cases', 1))
    session['case_access']     = row.get('case_access') or 'all'


def require_login(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'No autenticado', 'authenticated': False}), 401
        return f(*args, **kwargs)
    return wrapper


@auth_bp.route('/api/auth/google')
def google_login():
    state = secrets.token_urlsafe(32)
    _OAUTH_STATES[state] = time.time()
    cutoff = time.time() - _STATE_TTL
    for k in [k for k, v in _OAUTH_STATES.items() if v < cutoff]:
        del _OAUTH_STATES[k]
    params = {
        'client_id':     GOOGLE_CLIENT_ID,
        'redirect_uri':  GOOGLE_REDIRECT_URI,
        'response_type': 'code',
        'scope':         'openid email profile',
        'state':         state,
        'access_type':   'online',
        'prompt':        'select_account',
    }
    return redirect(f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}")


@auth_bp.route('/api/auth/google/callback')
def google_callback():
    err = request.args.get('error')
    if err:
        return redirect(f"/OCR/v59/frontend/?auth_error={err}")

    got_state = request.args.get('state', '')
    if got_state not in _OAUTH_STATES:
        return redirect("/OCR/v59/frontend/?auth_error=state_mismatch")
    del _OAUTH_STATES[got_state]

    code = request.args.get('code', '')
    if not code:
        return redirect("/OCR/v59/frontend/?auth_error=no_code")

    try:
        token_resp = requests.post('https://oauth2.googleapis.com/token', data={
            'code':          code,
            'client_id':     GOOGLE_CLIENT_ID,
            'client_secret': GOOGLE_CLIENT_SECRET,
            'redirect_uri':  GOOGLE_REDIRECT_URI,
            'grant_type':    'authorization_code',
        }, timeout=10)
        token_resp.raise_for_status()
        access_token = token_resp.json().get('access_token', '')
    except Exception as e:
        log.error('token exchange failed: %s', e)
        return redirect("/OCR/v59/frontend/?auth_error=token_exchange")

    try:
        user_resp = requests.get(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            headers={'Authorization': f'Bearer {access_token}'}, timeout=10
        )
        user_resp.raise_for_status()
        info = user_resp.json()
    except Exception as e:
        log.error('userinfo failed: %s', e)
        return redirect("/OCR/v59/frontend/?auth_error=userinfo")

    email = info.get('email', '').lower()
    if not email:
        return redirect("/OCR/v59/frontend/?auth_error=no_email")

    name    = info.get('name', '')
    picture = info.get('picture', '')
    role    = 'admin' if email in ADMIN_EMAILS else 'user'

    # ── Auto-detect org by email domain ──────────────────────────────────────
    auto_org = _auto_org_for_email(email)

    # ── Global access control: admin, org-domain, valid invite, or existing user ──
    if email not in ADMIN_EMAILS:
        already_registered = query("SELECT user_id FROM users WHERE email=%s", (email,))
        has_invite = query(
            "SELECT invite_id FROM invitations WHERE email=%s AND used=0 AND expires_at > NOW()",
            (email,)
        )
        if not already_registered and not has_invite and not auto_org:
            return redirect("/OCR/v59/frontend/?auth_error=not_authorized")

    existing = query("SELECT user_id, org_id FROM users WHERE email=%s", (email,))
    if existing:
        user_id = existing['user_id']
        execute("UPDATE users SET name=%s, picture=%s, role=%s WHERE user_id=%s",
                (name, picture, role, user_id))
        if auto_org and not existing.get('org_id'):
            _apply_org_to_user(user_id, email, auto_org)
    else:
        user_id = str(uuid.uuid4())
        execute(
            "INSERT INTO users (user_id, email, name, picture, role, org_id) VALUES (%s,%s,%s,%s,%s,%s)",
            (user_id, email, name, picture, role, auto_org)
        )

    _load_user_session(user_id, email, name, picture, role)
    log.info('login ok: %s (%s)', email, role)
    return redirect('/OCR/v59/frontend/')


@auth_bp.route('/api/auth/invite')
def invite_login():
    """Magic link: logea al usuario directamente desde el token de invitación."""
    token = request.args.get('token', '')
    if not token:
        return redirect('/OCR/v59/frontend/?auth_error=missing_token')

    invite = query(
        "SELECT * FROM invitations WHERE token=%s AND used=0 AND expires_at > NOW()",
        (token,)
    )
    if not invite:
        return redirect('/OCR/v59/frontend/?auth_error=invalid_or_expired_invite')

    email  = (invite.get('email') or '').lower()
    if not email:
        return redirect('/OCR/v59/frontend/?auth_error=invite_requires_email')

    org_id       = invite.get('org_id') or _auto_org_for_email(email)
    role_tag     = invite.get('role', 'user')
    role         = 'admin' if role_tag == 'master_admin' else 'user'
    is_org_admin = 1 if role_tag == 'org_admin' else 0

    existing = query("SELECT user_id, name, picture, org_id FROM users WHERE email=%s", (email,))
    if existing:
        user_id = existing['user_id']
        execute(
            "UPDATE users SET role=%s, org_id=%s, is_org_admin=%s, approved=1 WHERE user_id=%s",
            (role, org_id, is_org_admin, user_id)
        )
        if org_id and not existing.get('org_id'):
            execute("UPDATE cases SET org_id=%s WHERE owner_email=%s AND org_id IS NULL",
                    (org_id, email))
        name    = existing.get('name') or email.split('@')[0]
        picture = existing.get('picture') or ''
    else:
        user_id = str(uuid.uuid4())
        name    = email.split('@')[0]
        picture = ''
        execute(
            "INSERT INTO users (user_id, email, name, picture, role, org_id, is_org_admin, approved) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,1)",
            (user_id, email, name, picture, role, org_id, is_org_admin)
        )

    execute("UPDATE invitations SET used=1 WHERE invite_id=%s", (invite['invite_id'],))

    # Si la invitación fue pre-marcada como sub master, aplicar y transferir tasas
    if invite.get('is_sub_master'):
        execute("UPDATE users SET is_sub_master=1 WHERE user_id=%s", (user_id,))
        # Mover tasas pre-almacenadas bajo el email al user_id real
        pre_rates = query(
            "SELECT cost_mxn_per_usd, price_mxn_per_usd FROM sub_master_rates WHERE sub_master_id=%s",
            (email,)
        )
        if pre_rates:
            execute(
                "INSERT INTO sub_master_rates (sub_master_id, cost_mxn_per_usd, price_mxn_per_usd) "
                "VALUES (%s,%s,%s) ON DUPLICATE KEY UPDATE "
                "cost_mxn_per_usd=%s, price_mxn_per_usd=%s",
                (user_id,
                 float(pre_rates['cost_mxn_per_usd'] or 19.0),
                 float(pre_rates['price_mxn_per_usd'] or 104.5),
                 float(pre_rates['cost_mxn_per_usd'] or 19.0),
                 float(pre_rates['price_mxn_per_usd'] or 104.5))
            )
            execute("DELETE FROM sub_master_rates WHERE sub_master_id=%s", (email,))
        log.info('sub_master flag applied from invite: %s uid=%s', email, user_id)

    _load_user_session(user_id, email, name, picture, role)
    log.info('invite login ok: %s role_tag=%s', email, role_tag)
    return redirect('/OCR/v59/frontend/?welcome=1')


@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'status': 'logged_out'})


@auth_bp.route('/api/auth/me')
def me():
    if 'user_id' not in session:
        return jsonify({'authenticated': False}), 401

    user_id = session['user_id']

    # ── Step 1: Refresh critical role flags (minimal query — only well-known cols)
    # Split into two queries so that a missing optional column never silently
    # zeroes-out the role flags.
    core_row = query(
        "SELECT org_id, is_org_admin, is_sub_master, token_limit "
        "FROM users WHERE user_id=%s",
        (user_id,)
    ) or {}
    is_org_admin  = bool(core_row.get('is_org_admin', 0))
    is_sub_master = bool(core_row.get('is_sub_master', 0))
    org_id        = core_row.get('org_id') or session.get('org_id')
    token_limit   = core_row.get('token_limit') or session.get('token_limit')

    # ── Step 2: Refresh optional columns (may not exist on older schema)
    try:
        opt_row = query(
            "SELECT can_create_cases, case_access FROM users WHERE user_id=%s",
            (user_id,)
        ) or {}
        can_create  = bool(opt_row.get('can_create_cases', 1))
        case_access = opt_row.get('case_access') or session.get('case_access', 'all')
    except Exception:
        can_create  = session.get('can_create_cases', True)
        case_access = session.get('case_access', 'all')

    # ── Step 3: Patch session if any flag changed (keeps backend routes in sync)
    if (session.get('is_org_admin')  != is_org_admin  or
            session.get('is_sub_master') != is_sub_master or
            session.get('org_id')        != org_id):
        session['is_org_admin']    = is_org_admin
        session['is_sub_master']   = is_sub_master
        session['org_id']          = org_id
        session['token_limit']     = token_limit
        session['can_create_cases']= can_create
        session['case_access']     = case_access
        log.info('me(): refreshed role flags uid=%s sub=%s org_adm=%s',
                 user_id, is_sub_master, is_org_admin)

    org_branding = {}
    if org_id:
        org_row = query(
            """SELECT o1.primary_color, o1.accent_color, o1.logo_path,
                      o2.primary_color AS sm_primary_color,
                      o2.accent_color  AS sm_accent_color,
                      o2.logo_path     AS sm_logo_path
               FROM organizations o1
               LEFT JOIN users sm_u ON o1.sub_master_id = sm_u.user_id
               LEFT JOIN organizations o2 ON sm_u.org_id = o2.org_id
               WHERE o1.org_id = %s""",
            (org_id,)
        )
        if org_row:
            org_branding = {
                'primary_color': org_row.get('primary_color') or org_row.get('sm_primary_color'),
                'accent_color':  org_row.get('accent_color')  or org_row.get('sm_accent_color'),
                'logo_path':     org_row.get('logo_path')     or org_row.get('sm_logo_path'),
            }
    return jsonify({
        'authenticated': True,
        'user_id':       session['user_id'],
        'email':         session['user_email'],
        'name':          session['user_name'],
        'picture':       session.get('user_pic', ''),
        'role':          session['user_role'],
        'is_master':        session.get('user_email', '') in ADMIN_EMAILS,
        'is_sub_master':    is_sub_master,
        'is_org_admin':     is_org_admin,
        'org_id':           org_id,
        'token_limit':      token_limit,
        'has_password':     session.get('has_password', False),
        'can_create_cases': can_create,
        'case_access':      case_access,
        **org_branding,
    })


# ── Password login ────────────────────────────────────────────────────────────

@auth_bp.route('/api/auth/login-password', methods=['POST'])
def login_password():
    """Login con email + contraseña."""
    body     = request.get_json(force=True, silent=True) or {}
    email    = (body.get('email') or '').strip().lower()
    password = (body.get('password') or '')
    if not email or not password:
        return jsonify({'error': 'Correo y contraseña requeridos'}), 400

    row = query(
        "SELECT user_id, name, picture, role, password_hash, password_salt FROM users WHERE email=%s",
        (email,)
    )
    if not row or not row.get('password_hash'):
        return jsonify({'error': 'Correo no registrado o sin contraseña configurada'}), 401

    if not _verify_password(password, row['password_hash'], row['password_salt']):
        return jsonify({'error': 'Contraseña incorrecta'}), 401

    # Auto-assign org if not already set
    if not row.get('org_id'):
        auto_org = _auto_org_for_email(email)
        if auto_org:
            _apply_org_to_user(row['user_id'], email, auto_org)

    _load_user_session(row['user_id'], email, row.get('name', ''), row.get('picture', ''), row.get('role', 'user'))
    log.info('password login ok: %s', email)
    return jsonify({'ok': True})


@auth_bp.route('/api/auth/set-password', methods=['POST'])
def set_password():
    """Establece o cambia la contraseña del usuario autenticado."""
    if 'user_id' not in session:
        return jsonify({'error': 'No autenticado'}), 401

    body         = request.get_json(force=True, silent=True) or {}
    new_password = (body.get('password') or '').strip()
    current_pwd  = (body.get('current_password') or '').strip()

    if len(new_password) < 8:
        return jsonify({'error': 'La contraseña debe tener al menos 8 caracteres'}), 400

    user_id = session['user_id']
    row = query("SELECT password_hash, password_salt FROM users WHERE user_id=%s", (user_id,))
    if not row:
        return jsonify({'error': 'Usuario no encontrado'}), 404

    # Si ya tiene contraseña, verificar la actual
    if row.get('password_hash'):
        if not current_pwd:
            return jsonify({'error': 'Ingresa tu contraseña actual para cambiarla'}), 400
        if not _verify_password(current_pwd, row['password_hash'], row['password_salt']):
            return jsonify({'error': 'Contraseña actual incorrecta'}), 401

    new_hash, new_salt = _hash_password(new_password)
    execute("UPDATE users SET password_hash=%s, password_salt=%s WHERE user_id=%s",
            (new_hash, new_salt, user_id))
    session['has_password'] = True
    log.info('password set for user %s', user_id)
    return jsonify({'ok': True})


# ── Email helper ──────────────────────────────────────────────────────────────

def _build_email_html(invite_url: str, name: str) -> str:
    greeting = f'Hola {name},' if name else 'Hola,'
    return f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;max-width:520px;margin:40px auto;color:#1a202c">
  <h2 style="color:#c47a5a">Acceso a VILAR Legal OS</h2>
  <p>{greeting}</p>
  <p>Tu enlace de acceso (válido por 7 días):</p>
  <p style="margin:24px 0">
    <a href="{invite_url}"
       style="background:#c47a5a;color:#fff;padding:12px 28px;border-radius:6px;
              text-decoration:none;font-weight:bold;display:inline-block">
      Entrar a VILAR Legal OS
    </a>
  </p>
  <p style="font-size:.8rem;color:#718096">
    Si el botón no funciona, copia este enlace en tu navegador:<br>
    <span style="word-break:break-all">{invite_url}</span>
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
  <p style="font-size:.75rem;color:#a0aec0">
    Este enlace es de uso único y personal. No lo compartas.<br>
    Si no solicitaste este acceso, ignora este mensaje.
  </p>
</body></html>"""


def _send_magic_link_email(to_email: str, invite_url: str, name: str = ''):
    """
    Envía el magic link. Prioridad:
      1. SendGrid HTTP API  → SENDGRID_API_KEY en .env  (recomendado en DO)
      2. SMTP               → SMTP_HOST + SMTP_USER + SMTP_PASS en .env
    """
    sg_key = os.getenv('SENDGRID_API_KEY', '')
    if sg_key:
        _send_via_sendgrid(to_email, invite_url, name, sg_key)
    else:
        _send_via_smtp(to_email, invite_url, name)


def _send_via_sendgrid(to_email: str, invite_url: str, name: str, api_key: str):
    import urllib.request, json as _json
    from_email = os.getenv('SMTP_FROM') or os.getenv('SENDGRID_FROM', 'noreply@ocr.ruby.lease')
    payload = _json.dumps({
        'personalizations': [{'to': [{'email': to_email}]}],
        'from': {'email': from_email, 'name': 'VILAR Legal OS'},
        'subject': 'Tu enlace de acceso — VILAR Legal OS',
        'content': [{'type': 'text/html', 'value': _build_email_html(invite_url, name)}],
    }).encode('utf-8')
    req = urllib.request.Request(
        'https://api.sendgrid.com/v3/mail/send',
        data=payload,
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
        },
        method='POST'
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        status = resp.status
    if status not in (200, 202):
        raise RuntimeError(f'SendGrid respondió con status {status}')
    log.info('magic link enviado via SendGrid a %s', to_email)


def _send_via_smtp(to_email: str, invite_url: str, name: str):
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    host  = os.getenv('SMTP_HOST', '')
    port  = int(os.getenv('SMTP_PORT', 587))
    user  = os.getenv('SMTP_USER', '')
    pwd   = os.getenv('SMTP_PASS', '')
    from_ = os.getenv('SMTP_FROM', user)

    if not host or not user or not pwd:
        raise RuntimeError(
            'Email no configurado. Agrega SENDGRID_API_KEY o '
            'SMTP_HOST+SMTP_USER+SMTP_PASS al .env'
        )

    msg = MIMEMultipart('alternative')
    msg['Subject'] = 'Tu enlace de acceso — VILAR Legal OS'
    msg['From']    = f'VILAR Legal OS <{from_}>'
    msg['To']      = to_email
    msg.attach(MIMEText(_build_email_html(invite_url, name), 'html', 'utf-8'))

    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(user, pwd)
        smtp.sendmail(from_, [to_email], msg.as_string())
    log.info('magic link enviado via SMTP a %s', to_email)


# ── Self-service: solicitar magic link ───────────────────────────────────────

@auth_bp.route('/api/auth/request-link', methods=['POST'])
def request_magic_link():
    """
    Endpoint público. El usuario ingresa su correo; si está registrado
    se genera un nuevo magic link y se envía por email.
    Rate-limit simple: máx 3 solicitudes por correo cada 15 minutos.
    """
    from datetime import datetime, timedelta

    body  = request.get_json(force=True, silent=True) or {}
    email = (body.get('email') or '').strip().lower()
    if not email or '@' not in email:
        return jsonify({'error': 'Correo inválido'}), 400

    # Verificar que el usuario está registrado
    user_row = query("SELECT user_id, name, org_id FROM users WHERE email=%s", (email,))
    if not user_row:
        # Respuesta genérica: no revelar si el correo existe o no
        return jsonify({'ok': True, 'msg': 'Si el correo está registrado recibirás el enlace en breve.'})

    # Rate-limit: máx 3 solicitudes en 15 min
    recent = query(
        """SELECT COUNT(*) AS n FROM invitations
           WHERE email=%s AND created_by='self-service'
             AND created_at > DATE_SUB(NOW(), INTERVAL 15 MINUTE)""",
        (email,)
    )
    if (recent or {}).get('n', 0) >= 3:
        return jsonify({'error': 'Demasiadas solicitudes. Espera 15 minutos e intenta de nuevo.'}), 429

    # Generar nuevo magic link (7 días de vigencia)
    token     = secrets.token_urlsafe(32)
    invite_id = str(uuid.uuid4())
    expires   = datetime.utcnow() + timedelta(days=7)
    org_id    = user_row.get('org_id')
    execute(
        "INSERT INTO invitations (invite_id, email, org_id, role, token, expires_at, created_by) "
        "VALUES (%s,%s,%s,'user',%s,%s,'self-service')",
        (invite_id, email, org_id, token, expires.strftime('%Y-%m-%d %H:%M:%S'))
    )

    base_url   = os.getenv('APP_BASE_URL', 'https://ocr.ruby.lease')
    invite_url = f"{base_url}/OCR/v59/api/auth/invite?token={token}"

    # Intentar envío por email; si falla, devolver el link directamente
    email_sent = False
    try:
        _send_magic_link_email(email, invite_url, name=user_row.get('name', ''))
        email_sent = True
    except Exception as e:
        log.warning('Email no enviado a %s (%s) — devolviendo link en respuesta', email, e)

    if email_sent:
        return jsonify({'ok': True, 'msg': 'Enlace enviado. Revisa tu correo (y la carpeta de spam).'})
    else:
        return jsonify({'ok': True, 'invite_url': invite_url,
                        'msg': 'Copia este enlace y ábrelo en tu navegador:'})
