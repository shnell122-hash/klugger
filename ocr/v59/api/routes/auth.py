import os, uuid, secrets, logging
from functools import wraps
from urllib.parse import urlencode
import requests
from flask import Blueprint, request, redirect, session, jsonify
from tools.db import query, execute

auth_bp = Blueprint('auth', __name__)
log = logging.getLogger('auth')

GOOGLE_CLIENT_ID     = os.getenv('GOOGLE_CLIENT_ID', '')
GOOGLE_CLIENT_SECRET = os.getenv('GOOGLE_CLIENT_SECRET', '')
GOOGLE_REDIRECT_URI  = os.getenv(
    'GOOGLE_REDIRECT_URI',
    'https://ocr.ruby.lease/OCR/v59/api/auth/google/callback'
)

# vilarkptl@gmail.com → admin (all cases + real USD + tokens)
ADMIN_EMAILS = {'vilarkptl@gmail.com'}


def init_tables():
    """Crea tablas de users y api_usage si no existen."""
    execute("""CREATE TABLE IF NOT EXISTS users (
        user_id  VARCHAR(36)  PRIMARY KEY,
        email    VARCHAR(255) UNIQUE NOT NULL,
        name     VARCHAR(255),
        picture  VARCHAR(512),
        role     VARCHAR(20)  NOT NULL DEFAULT 'user',
        created_at TIMESTAMP  DEFAULT CURRENT_TIMESTAMP
    )""")
    execute("""CREATE TABLE IF NOT EXISTS api_usage (
        usage_id         VARCHAR(36)    PRIMARY KEY,
        user_id          VARCHAR(36),
        case_id          VARCHAR(36),
        model            VARCHAR(100),
        input_tokens     INT            DEFAULT 0,
        output_tokens    INT            DEFAULT 0,
        cache_read_tokens INT           DEFAULT 0,
        cost_usd         DECIMAL(12,8)  DEFAULT 0.0,
        created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
    )""")
    # Columna owner_email en cases (idempotente)
    try:
        execute("ALTER TABLE cases ADD COLUMN owner_email VARCHAR(255) DEFAULT NULL")
    except Exception:
        pass  # Ya existe


def require_login(f):
    """Decorator: 401 si no hay sesión activa."""
    @wraps(f)
    def wrapper(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'No autenticado', 'authenticated': False}), 401
        return f(*args, **kwargs)
    return wrapper


@auth_bp.route('/api/auth/google')
def google_login():
    state = secrets.token_urlsafe(32)
    session['oauth_state'] = state
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
        return redirect(f"/OCR/v59/?auth_error={err}")

    got_state      = request.args.get('state', '')
    expected_state = session.pop('oauth_state', None)
    if got_state != expected_state:
        log.warning('state_mismatch got=%s expected=%s session_keys=%s',
                    got_state[:8] if got_state else '', expected_state, list(session.keys()))
        return redirect("/OCR/v59/?auth_error=state_mismatch")

    code = request.args.get('code', '')
    if not code:
        return redirect("/OCR/v59/?auth_error=no_code")

    # Intercambiar código por token
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
        return redirect("/OCR/v59/?auth_error=token_exchange")

    # Obtener datos del usuario
    try:
        user_resp = requests.get(
            'https://www.googleapis.com/oauth2/v3/userinfo',
            headers={'Authorization': f'Bearer {access_token}'}, timeout=10
        )
        user_resp.raise_for_status()
        info = user_resp.json()
    except Exception as e:
        log.error('userinfo failed: %s', e)
        return redirect("/OCR/v59/?auth_error=userinfo")

    email = info.get('email', '').lower()
    if not email:
        return redirect("/OCR/v59/?auth_error=no_email")

    name    = info.get('name', '')
    picture = info.get('picture', '')
    role    = 'admin' if email in ADMIN_EMAILS else 'user'

    # Upsert usuario
    existing = query("SELECT user_id FROM users WHERE email=%s", (email,))
    if existing:
        user_id = existing['user_id']
        execute("UPDATE users SET name=%s, picture=%s, role=%s WHERE user_id=%s",
                (name, picture, role, user_id))
    else:
        user_id = str(uuid.uuid4())
        execute("INSERT INTO users (user_id, email, name, picture, role) VALUES (%s,%s,%s,%s,%s)",
                (user_id, email, name, picture, role))

    session.permanent = True
    session['user_id']    = user_id
    session['user_email'] = email
    session['user_name']  = name
    session['user_pic']   = picture
    session['user_role']  = role
    log.info('login ok: %s (%s) user_id=%s session_keys=%s', email, role, user_id, list(session.keys()))
    return redirect('/OCR/v59/')


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
        'user_id':  session['user_id'],
        'email':    session['user_email'],
        'name':     session['user_name'],
        'picture':  session.get('user_pic', ''),
        'role':     session['user_role'],
    })
