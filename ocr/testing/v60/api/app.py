import sys, os, logging
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(name)s: %(message)s',
    stream=sys.stdout,
)

from datetime import timedelta
from flask import Flask
from flask_cors import CORS
from flask_session import Session
from dotenv import load_dotenv
from werkzeug.middleware.proxy_fix import ProxyFix

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

from routes.upload     import upload_bp
from routes.chat       import chat_bp
from routes.cases      import cases_bp, _init_cases_table
from routes.artifacts  import artifacts_bp
from routes.imagen     import imagen_bp
from routes.transcribe import transcribe_bp
from routes.auth       import auth_bp, init_tables
from routes.dashboard  import dashboard_bp
from routes.admin      import admin_bp, init_org_tables

app = Flask(__name__)
# Trust Apache reverse-proxy headers (X-Forwarded-Proto, X-Forwarded-Host)
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# Secret key (needed even with filesystem sessions for CSRF protection)
_secret = (os.getenv('FLASK_SECRET_KEY') or '').strip()
app.secret_key = _secret or 'vilar-legal-os-v60-change-me'

# Server-side filesystem sessions — only a session ID goes in the browser cookie,
# no signing/encoding issues, works reliably behind Apache proxy
app.config['SESSION_TYPE']             = 'filesystem'
app.config['SESSION_FILE_DIR']         = '/tmp/vilar-v60-sessions'
app.config['SESSION_PERMANENT']        = True
app.config['SESSION_USE_SIGNER']       = True   # signs the session ID cookie
app.config['SESSION_COOKIE_HTTPONLY']  = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE']   = False   # Apache terminates TLS
app.config['SESSION_COOKIE_PATH']     = '/'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)
Session(app)

CORS(app, resources={r"/api/*": {"origins": "*"}})

app.register_blueprint(upload_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(cases_bp)
app.register_blueprint(artifacts_bp)
app.register_blueprint(imagen_bp)
app.register_blueprint(transcribe_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(admin_bp)

# Inicializar tablas en startup
with app.app_context():
    try:
        init_tables()
    except Exception as e:
        logging.getLogger('app').warning('init_tables: %s', e)
    try:
        init_org_tables()
    except Exception as e:
        logging.getLogger('app').warning('init_org_tables: %s', e)
    try:
        _init_cases_table()
    except Exception as e:
        logging.getLogger('app').warning('_init_cases_table: %s', e)


@app.route('/api/health')
def health():
    return {"status": "ok", "version": "v60-testing"}


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5006))
    app.run(host='0.0.0.0', port=port, debug=False)
