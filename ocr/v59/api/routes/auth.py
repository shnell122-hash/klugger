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

ADMIN_EMAILS = {'vilarkptl@gmail.com'}


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
    ]:
        try:
            execute(col_sql)
        except Exception:
            pass


def _load_user_session(user_id, email, name, picture, role):
    """Carga datos completos del usuario a la sesión, incluyendo org y permisos."""
    row = query(
        "SELECT org_id, is_org_admin, approved, token_limit FROM users WHERE user_id=%s",
        (user_id,)
    ) or {}
    session.permanent       = True
    session['user_id']      = user_id
    session['user_email']   = email
    session['user_name']    = name
    session['user_pic']     = picture
    session['user_role']    = role
    session['org_id']       = row.get('org_id')
    session['is_org_admin'] = bool(row.get('is_org_admin', 0))
    session['token_limit']  = row.get('token_limit')


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

    # ── Gmail block: only ADMIN_EMAILS or explicitly invited gmail users ──────
    if email.endswith('@gmail.com') and email not in ADMIN_EMAILS:
        invite = query(
            "SELECT invite_id FROM invitations WHERE email=%s AND used=0 AND expires_at > NOW()",
            (email,)
        )
        if not invite:
            return redirect("/OCR/v59/frontend/?auth_error=gmail_not_allowed")

    name    = info.get('name', '')
    picture = info.get('picture', '')
    role    = 'admin' if email in ADMIN_EMAILS else 'user'

    # ── Auto-detect org by email domain ──────────────────────────────────────
    domain = email.split('@')[1] if '@' in email else ''
    auto_org = None
    if domain:
        org_row = query(
            "SELECT org_id FROM organizations WHERE domain=%s AND is_active=1", (domain,)
        )
        if org_row:
            auto_org = org_row['org_id']

    existing = query("SELECT user_id, org_id FROM users WHERE email=%s", (email,))
    if existing:
        user_id = existing['user_id']
        # Auto-assign org if not already set
        if auto_org and not existing.get('org_id'):
            execute("UPDATE users SET name=%s, picture=%s, role=%s, org_id=%s WHERE user_id=%s",
                    (name, picture, role, auto_org, user_id))
        else:
            execute("UPDATE users SET name=%s, picture=%s, role=%s WHERE user_id=%s",
                    (name, picture, role, user_id))
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

    org_id       = invite.get('org_id')
    role_tag     = invite.get('role', 'user')
    role         = 'admin' if role_tag == 'master_admin' else 'user'
    is_org_admin = 1 if role_tag == 'org_admin' else 0

    existing = query("SELECT user_id, name, picture FROM users WHERE email=%s", (email,))
    if existing:
        user_id = existing['user_id']
        execute(
            "UPDATE users SET role=%s, org_id=%s, is_org_admin=%s, approved=1 WHERE user_id=%s",
            (role, org_id, is_org_admin, user_id)
        )
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
    return jsonify({
        'authenticated': True,
        'user_id':       session['user_id'],
        'email':         session['user_email'],
        'name':          session['user_name'],
        'picture':       session.get('user_pic', ''),
        'role':          session['user_role'],
        'is_org_admin':  session.get('is_org_admin', False),
        'org_id':        session.get('org_id'),
        'token_limit':   session.get('token_limit'),
    })

