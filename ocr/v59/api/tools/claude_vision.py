"""
Claude Vision — extracción de texto con caché por SHA256.
Pipeline: Claude Vision directo (Tesseract ELIMINADO permanentemente).
"""
import os, base64
import anthropic

VISION_MODEL = "claude-opus-4-6"

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

    # DOCX / DOC — python-docx primero
    if mime_type in (
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
    ):
        return _extract_from_docx(raw_bytes)

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


def _extract_from_docx(raw_bytes: bytes) -> str:
    """Extrae texto de DOCX usando python-docx (párrafos + tablas)."""
    try:
        import io
        from docx import Document
        doc = Document(io.BytesIO(raw_bytes))
        parts = []

        # Párrafos
        for p in doc.paragraphs:
            if p.text.strip():
                parts.append(p.text)

        # Tablas
        for table in doc.tables:
            for row in table.rows:
                cells = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if cells:
                    parts.append(' | '.join(cells))

        return '\n'.join(parts)
    except Exception as e:
        print(f"[claude_vision] error DOCX: {e}")
        return ''
