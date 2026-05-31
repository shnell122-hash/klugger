import os, uuid, hashlib, io, requests
from flask import Blueprint, request, jsonify
from tools.db import execute

imagen_bp = Blueprint('imagen', __name__)

FAL_URL   = 'https://fal.run/fal-ai/flux-2-pro'
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


def _degrade_image(raw_bytes: bytes, blur: float = TRAINING_BLUR_RADIUS,
                   quality: int = TRAINING_JPEG_QUALITY) -> bytes:
    """Aplica blur leve y baja calidad JPEG para simular foto de campo con celular barato."""
    try:
        from PIL import Image, ImageFilter
        img = Image.open(io.BytesIO(raw_bytes)).convert('RGB')
        if blur > 0:
            img = img.filter(ImageFilter.GaussianBlur(radius=blur))
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=quality, optimize=True)
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

    blur    = min(max(float(body.get('blur',    TRAINING_BLUR_RADIUS)),  0.0), 5.0)
    quality = min(max(int(  body.get('quality', TRAINING_JPEG_QUALITY)), 10),  95)

    if not case_id:
        return jsonify(error='case_id requerido'), 400
    if not prompt:
        return jsonify(error='prompt requerido'), 400

    # Flux 2 Pro usa nombres de tamaño, no dimensiones explícitas
    sizes = {
        'portrait':  'portrait_4_3',
        'landscape': 'landscape_4_3',
        'square':    'square_hd',
    }
    image_size = sizes.get(aspect, 'portrait_4_3')

    headers = {'Authorization': f'Key {fal_key}', 'Content-Type': 'application/json'}
    # Flux 2 Pro es zero-config: sin steps, sin guidance_scale, sin num_images
    payload = {
        'prompt':            f"{prompt}, {_STYLE_SUFFIX}",
        'image_size':        image_size,
        'safety_tolerance':  '2',
        'output_format':     'jpeg',
    }

    # Flux 2 Pro genera una imagen por llamada; iterar para count > 1
    images_out = []
    try:
        for _ in range(count):
            resp = requests.post(FAL_URL, json=payload, headers=headers, timeout=120)
            resp.raise_for_status()
            fal_data = resp.json()
            imgs = fal_data.get('images', [])
            if imgs:
                images_out.extend(imgs)
    except requests.exceptions.HTTPError as e:
        return jsonify(error=f'fal.ai error: {e.response.status_code} — {e.response.text[:300]}'), 502
    except Exception as e:
        return jsonify(error=f'Error llamando fal.ai: {str(e)}'), 502

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
        processed    = _degrade_image(img_bytes, blur, quality)
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
            'width':       img_info.get('width', 0),
            'height':      img_info.get('height', 0),
        })

    if not saved:
        return jsonify(error='No se pudo guardar ninguna imagen'), 500

    return jsonify(images=saved, count=len(saved))
