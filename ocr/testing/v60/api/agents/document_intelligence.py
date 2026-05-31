# v60 - nueva funcionalidad
"""
DocumentIntelligenceAgent — analiza documentos legales/contables con visión multimodal.
Extrae partes, importes, fechas, obligaciones y flags de riesgo.
Adaptación Python de financial-bot/agents/DocumentIntelligenceAgent.js.
"""
import os, json, base64, logging
from tools.litellm_router import route_by_tier, extract_text, TIER_MULTIMODAL, TIER_REDACTION

log = logging.getLogger('doc_intelligence')

_SYSTEM = (
    "Eres un especialista en análisis de documentos legales y contables mexicanos. "
    "Extraes entidades clave, importes, fechas y obligations de cualquier documento "
    "(contratos, CFDI, estados de cuenta, poderes notariales, escrituras, juicios). "
    "Respondes siempre en JSON válido, sin texto adicional."
)

_SCHEMA = """{
  "summary": "resumen ejecutivo en 2-3 líneas",
  "doc_type": "tipo de documento detectado",
  "parties": [{"role": "parte", "name": "nombre", "rfc": "RFC si aparece"}],
  "amounts": [{"concept": "concepto", "amount": 0.0, "currency": "MXN"}],
  "dates": [{"event": "evento", "date": "YYYY-MM-DD o descripción"}],
  "obligations": ["obligación 1", "obligación 2"],
  "risk_flags": [{"flag": "descripción", "severity": "alta|media|baja"}],
  "raw_text": "primeros 400 caracteres del texto extraído"
}"""


def analyze_document(file_path: str, context: str = '', doc_type: str = 'legal') -> dict:
    """
    Analiza un documento y retorna sus entidades clave.
    Soporta: .jpg .jpeg .png .webp .pdf .txt .md .docx (texto extraído)
    """
    if not os.path.exists(file_path):
        return {'error': f'Archivo no encontrado: {file_path}'}

    ext = os.path.splitext(file_path)[1].lower()
    try:
        if ext in ('.jpg', '.jpeg', '.png', '.webp', '.gif'):
            return _analyze_image(file_path, context, doc_type)
        elif ext == '.pdf':
            return _analyze_pdf(file_path, context, doc_type)
        else:
            return _analyze_text(file_path, context, doc_type)
    except Exception as e:
        log.error('doc_intelligence: %s', e)
        return {'error': str(e)}


def _prompt(context: str, doc_type: str) -> str:
    base = f"Analiza el documento y extrae en JSON con este esquema exacto:\n{_SCHEMA}\n"
    if context:
        base += f'\nContexto: {context}'
    if doc_type == 'fiscal':
        base += '\nEnfoque fiscal: RFC, CFDI, periodo fiscal, tipo comprobante, Art. 69-B CFF.'
    elif doc_type == 'contractual':
        base += '\nEnfoque contractual: partes, vigencia, penalizaciones, rescisión, incumplimiento.'
    elif doc_type == 'judicial':
        base += '\nEnfoque judicial: actor, demandado, pretensiones, resolución, firmas.'
    return base


def _analyze_image(file_path: str, context: str, doc_type: str) -> dict:
    with open(file_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    ext = os.path.splitext(file_path)[1].lstrip('.').lower()
    media = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
             'webp': 'image/webp', 'gif': 'image/gif'}.get(ext, 'image/jpeg')

    messages = [
        {'role': 'system', 'content': _SYSTEM},
        {'role': 'user', 'content': [
            {'type': 'image_url', 'image_url': {'url': f'data:{media};base64,{b64}'}},
            {'type': 'text', 'text': _prompt(context, doc_type)},
        ]},
    ]
    resp = route_by_tier(TIER_MULTIMODAL, messages, max_tokens=2000,
                         response_format={'type': 'json_object'})
    return json.loads(extract_text(resp))


def _analyze_pdf(file_path: str, context: str, doc_type: str) -> dict:
    try:
        import fitz
        doc = fitz.open(file_path)
        text = '\n'.join(page.get_text() for page in doc)
        doc.close()
    except ImportError:
        return {'error': 'PyMuPDF no instalado'}

    messages = [
        {'role': 'system', 'content': _SYSTEM},
        {'role': 'user', 'content': f"{_prompt(context, doc_type)}\n\nPDF:\n{text[:8000]}"},
    ]
    resp = route_by_tier(TIER_MULTIMODAL, messages, max_tokens=2000,
                         response_format={'type': 'json_object'})
    return json.loads(extract_text(resp))


def _analyze_text(file_path: str, context: str, doc_type: str) -> dict:
    with open(file_path, 'r', errors='replace') as f:
        text = f.read(8000)
    messages = [
        {'role': 'system', 'content': _SYSTEM},
        {'role': 'user', 'content': f"{_prompt(context, doc_type)}\n\nCONTENIDO:\n{text}"},
    ]
    resp = route_by_tier(TIER_REDACTION, messages, max_tokens=2000,
                         response_format={'type': 'json_object'})
    return json.loads(extract_text(resp))
