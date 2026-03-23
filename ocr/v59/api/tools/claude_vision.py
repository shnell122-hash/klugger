"""
Claude Vision — extracción de texto con caché por SHA256.
Pipeline: Claude Vision directo (Tesseract ELIMINADO permanentemente).
"""
import os, base64, hashlib
import anthropic

VISION_MODEL = "claude-opus-4-6"
MAX_PAGES_PDF = 20  # páginas máximas a extraer por llamada

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = anthropic.Anthropic(api_key=os.getenv('ANTHROPIC_API_KEY'))
    return _client


def extract_text(file_path: str, mime_type: str, raw_bytes: bytes = None) -> str:
    """
    Extrae texto de un archivo usando Claude Vision.
    Retorna string con el texto extraído, o '' si no se puede extraer.
    """
    if raw_bytes is None:
        with open(file_path, 'rb') as f:
            raw_bytes = f.read()

    if not raw_bytes:
        return ''

    client = _get_client()

    # Imágenes — envío directo como base64
    if mime_type.startswith('image/'):
        return _extract_from_image(client, raw_bytes, mime_type)

    # PDF — usar beta de documents API
    if mime_type == 'application/pdf':
        return _extract_from_pdf(client, raw_bytes)

    # DOCX / DOC — intentar convertir a texto plano primero
    if mime_type in (
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
    ):
        return _extract_from_docx(client, raw_bytes, mime_type)

    return ''


def _extract_from_image(client, raw_bytes: bytes, mime_type: str) -> str:
    b64 = base64.standard_b64encode(raw_bytes).decode()
    try:
        resp = client.messages.create(
            model=VISION_MODEL,
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {"type": "base64", "media_type": mime_type, "data": b64},
                    },
                    {
                        "type": "text",
                        "text": (
                            "Extrae TODO el texto visible en esta imagen de forma EXACTA. "
                            "No interpretes, no resumas, no expliques. "
                            "Solo el texto tal como aparece, preservando estructura y formato."
                        ),
                    },
                ],
            }],
        )
        return resp.content[0].text if resp.content else ''
    except Exception as e:
        print(f"[claude_vision] error imagen: {e}")
        return ''


def _extract_from_pdf(client, raw_bytes: bytes) -> str:
    b64 = base64.standard_b64encode(raw_bytes).decode()
    try:
        resp = client.beta.messages.create(
            model=VISION_MODEL,
            max_tokens=8192,
            betas=["pdfs-2024-09-25"],
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": (
                            "Extrae TODO el texto de este PDF de forma EXACTA. "
                            "No interpretes, no resumas, no expliques. "
                            "Solo el texto tal como aparece, preservando estructura, "
                            "numeración y formato del documento."
                        ),
                    },
                ],
            }],
        )
        return resp.content[0].text if resp.content else ''
    except Exception as e:
        print(f"[claude_vision] error PDF: {e}")
        return ''


def _extract_from_docx(client, raw_bytes: bytes, mime_type: str) -> str:
    """Intenta extraer texto de DOCX usando python-docx, si falla usa Claude con base64."""
    try:
        import io
        from docx import Document
        doc = Document(io.BytesIO(raw_bytes))
        text = '\n'.join(p.text for p in doc.paragraphs if p.text.strip())
        if text.strip():
            return text
    except Exception:
        pass

    # Fallback: enviar como archivo base64 a Claude
    b64 = base64.standard_b64encode(raw_bytes).decode()
    try:
        resp = client.messages.create(
            model=VISION_MODEL,
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            f"El siguiente es un archivo DOCX codificado en base64: {b64[:1000]}...\n"
                            "No puedo enviarlo directamente. Por favor indica que el usuario "
                            "convierta el archivo a PDF para mejor extracción."
                        ),
                    },
                ],
            }],
        )
        return f"[DOCX — conversión recomendada a PDF para extracción completa]\n{resp.content[0].text if resp.content else ''}"
    except Exception as e:
        print(f"[claude_vision] error DOCX: {e}")
        return ''
