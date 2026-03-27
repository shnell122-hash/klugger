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
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

from routes.upload     import upload_bp
from routes.chat       import chat_bp
from routes.cases      import cases_bp
from routes.artifacts  import artifacts_bp
from routes.imagen     import imagen_bp
from routes.transcribe import transcribe_bp
from routes.auth       import auth_bp, init_tables
from routes.dashboard  import dashboard_bp

app = Flask(__name__)

# Session config
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'vilar-legal-os-v59-change-me')
app.config['SESSION_COOKIE_HTTPONLY']  = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE']   = os.getenv('SESSION_COOKIE_SECURE', 'false').lower() == 'true'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=30)

CORS(app, resources={r"/api/*": {"origins": "*"}})

app.register_blueprint(upload_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(cases_bp)
app.register_blueprint(artifacts_bp)
app.register_blueprint(imagen_bp)
app.register_blueprint(transcribe_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(dashboard_bp)

# Inicializar tablas en startup
with app.app_context():
    try:
        init_tables()
    except Exception as e:
        logging.getLogger('app').warning('init_tables: %s', e)


@app.route('/api/health')
def health():
    return {"status": "ok", "version": "v59"}


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5005))
    app.run(host='0.0.0.0', port=port, debug=False)
