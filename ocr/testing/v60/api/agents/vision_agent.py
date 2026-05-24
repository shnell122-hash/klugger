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


def batch_ocr(file_paths: list, output_format: str = 'markdown') -> list:
    """OCR de múltiples imágenes. Retorna lista de resultados en el mismo orden."""
    return [ocr_image(p, output_format) for p in file_paths]
