import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

app.register_blueprint(upload_bp)
app.register_blueprint(chat_bp)
app.register_blueprint(cases_bp)
app.register_blueprint(artifacts_bp)
app.register_blueprint(imagen_bp)
app.register_blueprint(transcribe_bp)

@app.route('/api/health')
def health():
    return {"status": "ok", "version": "v59"}

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5005))
    app.run(host='0.0.0.0', port=port, debug=False)
