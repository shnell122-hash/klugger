# v60 - nueva funcionalidad
"""
VisionAgent — OCR y análisis visual de documentos e imágenes de evidencia.
Usa Gemini Flash (tier multimodal) como modelo principal.
"""
import os, base64, json, logging
from tools.litellm_router import route_by_tier, extract_text, TIER_MULTIMODAL

log = logging.getLogger('vision_agent')


def ocr_image(file_path: str, output_format: str = 'markdown') -> str:
    """
    OCR de una imagen. Retorna el texto extraído.
    output_format: 'markdown' | 'plain' | 'structured'
    """
    if not os.path.exists(file_path):
        return f'[Error: archivo no encontrado: {file_path}]'

    with open(file_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    ext = os.path.splitext(file_path)[1].lstrip('.').lower()
    media = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
             'png': 'image/png', 'webp': 'image/webp'}.get(ext, 'image/jpeg')

    instructions = {
        'markdown':   'Extrae todo el texto preservando estructura con Markdown (headers, tablas, listas).',
        'plain':      'Extrae solo el texto plano tal como aparece, sin formato adicional.',
        'structured': ('Extrae en JSON: {"title":"","sections":[{"heading":"","content":""}],'
                       '"tables":[{"headers":[],"rows":[[]]}]}'),
    }.get(output_format, 'Extrae el texto preservando estructura.')

    messages = [{
        'role': 'user',
        'content': [
            {'type': 'image_url', 'image_url': {'url': f'data:{media};base64,{b64}'}},
            {'type': 'text', 'text': f'Realiza OCR de esta imagen. {instructions}'},
        ],
    }]
    try:
        resp = route_by_tier(TIER_MULTIMODAL, messages, max_tokens=4000)
        return extract_text(resp)
    except Exception as e:
        log.error('vision_agent.ocr_image: %s', e)
        return f'[Error OCR: {e}]'


def describe_evidence(file_path: str, legal_context: str = '') -> dict:
    """
    Describe una imagen como evidencia legal con análisis objetivo.
    Retorna: {description, elements, metadata_visible, legal_relevance, observations}
    """
    if not os.path.exists(file_path):
        return {'error': f'Archivo no encontrado: {file_path}'}

    with open(file_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()
    ext = os.path.splitext(file_path)[1].lstrip('.').lower()
    media = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
             'png': 'image/png', 'webp': 'image/webp'}.get(ext, 'image/jpeg')

    prompt = (
        'Analiza esta imagen como evidencia legal. Responde en JSON:\n'
        '{"description":"descripción objetiva de lo que se ve",'
        '"elements":["elemento visible 1","elemento visible 2"],'
        '"metadata_visible":{"fecha":null,"lugar":null,"dispositivo":null,"hora":null},'
        '"legal_relevance":"alta|media|baja",'
        '"observations":"observaciones legalmente relevantes"}'
    )
    if legal_context:
        prompt += f'\n\nContexto del caso: {legal_context}'

    messages = [{
        'role': 'user',
        'content': [
            {'type': 'image_url', 'image_url': {'url': f'data:{media};base64,{b64}'}},
            {'type': 'text', 'text': prompt},
        ],
    }]
    try:
        resp = route_by_tier(TIER_MULTIMODAL, messages, max_tokens=1000,
                             response_format={'type': 'json_object'})
        return json.loads(extract_text(resp))
    except Exception as e:
        log.error('vision_agent.describe_evidence: %s', e)
        return {'error': str(e)}


def ocr_pdf_native(file_path: str, output_format: str = 'markdown') -> str:
    """
    OCR de un PDF usando Gemini nativo (sin PyMuPDF).
    Pasa el PDF como inline_data — mejor para documentos con tablas, sellos, firmas.
    Limite: ~20MB. Para PDFs mayores usar fallback a PyMuPDF.
    """
    MAX_PDF_BYTES = 20 * 1024 * 1024  # 20 MB
    if not os.path.exists(file_path):
        return f'[Error: archivo no encontrado: {file_path}]'

    size = os.path.getsize(file_path)
    if size > MAX_PDF_BYTES:
        # Fallback: extraer texto con PyMuPDF
        return _ocr_pdf_fallback(file_path, output_format)

    with open(file_path, 'rb') as f:
        b64 = base64.b64encode(f.read()).decode()

    instructions = {
        'markdown':   'Extrae todo el texto del PDF preservando estructura con Markdown (headers, tablas, listas). Incluye todos los datos numéricos y fechas exactamente como aparecen.',
        'plain':      'Extrae el texto plano de todas las páginas del PDF tal como aparece.',
        'structured': ('Extrae en JSON: {"title":"","pages":[{"page":1,"sections":[{"heading":"","content":""}],"tables":[{"headers":[],"rows":[[]]}]}]}'),
    }.get(output_format, 'Extrae el texto del PDF preservando estructura.')

    messages = [{
        'role': 'user',
        'content': [
            # Gemini acepta PDF como image_url con data URI y mime application/pdf
            {'type': 'image_url', 'image_url': {'url': f'data:application/pdf;base64,{b64}'}},
            {'type': 'text', 'text': f'Realiza OCR completo de este PDF. {instructions}'},
        ],
    }]
    try:
        resp = route_by_tier(TIER_MULTIMODAL, messages, max_tokens=8000)
        return extract_text(resp)
    except Exception as e:
        log.warning('ocr_pdf_native failed (%s), using fallback', e)
        return _ocr_pdf_fallback(file_path, output_format)


def _ocr_pdf_fallback(file_path: str, output_format: str) -> str:
    """Extrae texto de PDF usando PyMuPDF. Fallback para PDFs grandes o cuando Gemini falla."""
    try:
        import fitz
        doc = fitz.open(file_path)
        pages_text = [page.get_text() for page in doc]
        doc.close()
        text = '\n\n--- Página siguiente ---\n\n'.join(pages_text)
        if output_format == 'markdown':
            return text  # PyMuPDF ya retorna texto plano; marcado mínimo
        return text
    except ImportError:
        return '[Error: ni Gemini ni PyMuPDF disponibles para OCR de PDF]'
    except Exception as e:
        return f'[Error extrayendo PDF: {e}]'


def batch_ocr(file_paths: list, output_format: str = 'markdown') -> list:
    """OCR de múltiples archivos. Detecta tipo y usa el método apropiado."""
    def _ocr_one(path):
        ext = os.path.splitext(path)[1].lower()
        if ext == '.pdf':
            return ocr_pdf_native(path, output_format)
        return ocr_image(path, output_format)
    return [_ocr_one(p) for p in file_paths]
