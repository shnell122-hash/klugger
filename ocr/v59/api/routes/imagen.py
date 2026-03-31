import os, uuid, hashlib, io, requests
from flask import Blueprint, request, jsonify
from tools.db import execute

imagen_bp = Blueprint('imagen', __name__)

FAL_URL   = 'https://fal.run/fal-ai/flux/dev'
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), '..', 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Parámetros de degradación — simula foto de campo tomada con celular barato
TRAINING_BLUR_RADIUS  = 1.4   # 0 = sin blur; 1-2 = leve; 3+ = muy borroso
TRAINING_JPEG_QUALITY = 48    # 1-95; 85 = default fal.ai; 40-55 = degradado notorio

_STYLE_SUFFIX = (
    "photo taken on a cheap smartphone, slightly blurry, poor lighting, candid shot, "
    "low resolution, grainy, natural imperfections, documentary, photorealistic, no text"
)
_NEGATIVE = (
    "painting, illustration, drawing, cartoon, render, cgi, watermark, logo, text, "
    "signature, border, frame, artistic, stylized, professional photography, studio lighting"
)


def _degrade_image(raw_bytes: bytes) -> bytes:
    """Aplica blur leve y baja calidad JPEG para simular foto de campo con celular barato."""
    try:
        from PIL import Image, ImageFilter
        img = Image.open(io.BytesIO(raw_bytes)).convert('RGB')
        if TRAINING_BLUR_RADIUS > 0:
            img = img.filter(ImageFilter.GaussianBlur(radius=TRAINING_BLUR_RADIUS))
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=TRAINING_JPEG_QUALITY, optimize=True)
        return buf.getvalue()
    except ImportError:
        return raw_bytes  # Pillow no instalado — guardar sin procesar


@imagen_bp.route('/api/imagen/generate', methods=['POST'])
def generate_image():
    fal_key = os.getenv('FAL_KEY', '')
    if not fal_key:
        return jsonify(error='FAL_KEY no configurado en el servidor'), 503

    body    = request.get_json(force=True) or {}
    case_id = body.get('case_id', '').strip()
    prompt  = body.get('prompt', '').strip()
    count   = min(max(int(body.get('count', 1)), 1), 4)
    aspect  = body.get('aspect', 'portrait')

    if not case_id:
        return jsonify(error='case_id requerido'), 400
    if not prompt:
        return jsonify(error='prompt requerido'), 400

    sizes = {
        'portrait':  {'width': 768,  'height': 1024},
        'landscape': {'width': 1024, 'height': 768},
        'square':    {'width': 1024, 'height': 1024},
    }
    size = sizes.get(aspect, sizes['portrait'])

    headers = {'Authorization': f'Key {fal_key}', 'Content-Type': 'application/json'}
    payload = {
        'prompt':              f"{prompt}, {_STYLE_SUFFIX}",
        'negative_prompt':     _NEGATIVE,
        'num_images':          count,
        'image_size':          size,
        'num_inference_steps': 28,
        'guidance_scale':      3.5,
        'enable_safety_checker': True,
        'output_format':       'jpeg',
    }

    try:
        resp = requests.post(FAL_URL, json=payload, headers=headers, timeout=120)
        resp.raise_for_status()
        fal_data = resp.json()
    except requests.exceptions.HTTPError as e:
        return jsonify(error=f'fal.ai error: {e.response.status_code} — {e.response.text[:300]}'), 502
    except Exception as e:
        return jsonify(error=f'Error llamando fal.ai: {str(e)}'), 502

    images_out = fal_data.get('images', [])
    if not images_out:
        return jsonify(error='fal.ai no devolvió imágenes'), 502

    saved = []
    for img_info in images_out:
        img_url = img_info.get('url', '')
        if not img_url:
            continue
        try:
            dl = requests.get(img_url, timeout=30)
            dl.raise_for_status()
            img_bytes = dl.content
        except Exception:
            continue

        artifact_id  = str(uuid.uuid4())
        filename     = f"capacitacion_{artifact_id[:8]}.jpg"
        file_path    = os.path.join(UPLOAD_DIR, f"{artifact_id}.jpg")
        processed    = _degrade_image(img_bytes)
        sha256       = hashlib.sha256(processed).hexdigest()
        with open(file_path, 'wb') as fh:
            fh.write(processed)

        execute(
            """INSERT INTO user_artifacts
               (artifact_id, case_id, filename, mime_type, file_path,
                file_size_bytes, checksum_sha256, extracted_text, source, uploaded_at)
               VALUES (%s, %s, %s, 'image/jpeg', %s, %s, %s, %s, 'system', NOW())""",
            (artifact_id, case_id, filename, file_path,
             len(processed), sha256, f'[Imagen generada — capacitación] {prompt}')
        )
        saved.append({
            'artifact_id': artifact_id,
            'filename':    filename,
            'url':         f'/OCR/v59/api/artifacts/file/{artifact_id}',
            'width':       img_info.get('width', size['width']),
            'height':      img_info.get('height', size['height']),
        })

    if not saved:
        return jsonify(error='No se pudo guardar ninguna imagen'), 500

    return jsonify(images=saved, count=len(saved))
