"""
JotForm integration — envío asíncrono en background thread.
Campos 3-15 (NUNCA 1-2) — requerimiento legal inmutable.
"""
import os, threading, requests

JOTFORM_API_KEY  = os.getenv('JOTFORM_API_KEY', '')
JOTFORM_FORM_ID  = os.getenv('JOTFORM_FORM_ID', '')
JOTFORM_BASE_URL = 'https://api.jotform.com'


def _submit_async(form_id: str, submission_data: dict):
    """Envía datos a JotForm en thread separado (no bloquea respuesta al usuario)."""
    if not JOTFORM_API_KEY or not form_id:
        print("[jotform] API key o form_id no configurados — skip")
        return

    url = f"{JOTFORM_BASE_URL}/form/{form_id}/submissions"
    # Formatear campos para JotForm (campo 3 en adelante)
    payload = {'apiKey': JOTFORM_API_KEY}
    for field_num, value in submission_data.items():
        key = f"submission[{field_num}]"
        payload[key] = value

    try:
        resp = requests.post(url, data=payload, timeout=30)
        if resp.status_code == 200:
            print(f"[jotform] Enviado OK — form {form_id}")
        else:
            print(f"[jotform] Error {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        print(f"[jotform] Exception: {e}")


def submit_to_jotform(form_id: str, fields: dict):
    """
    Dispara envío en background. No bloquea.
    fields: {campo_num: valor} — números del 3 al 15
    """
    # Validar que no usen campos 1-2
    for k in fields.keys():
        if int(k) < 3:
            print(f"[jotform] ADVERTENCIA: campo {k} < 3 bloqueado (requerimiento legal)")
            return

    t = threading.Thread(
        target=_submit_async,
        args=(form_id or JOTFORM_FORM_ID, fields),
        daemon=True
    )
    t.start()
    return t


def export_case_to_jotform(case_id: str, case_data: dict):
    """
    Exporta datos de un caso al formulario JotForm configurado.
    Mapeo de campos (3-15):
      3  → case_id
      4  → case_name
      5  → matter_type
      6  → status
      7  → created_at
      8  → client_name (si disponible)
      9  → client_email (si disponible)
      10 → notes
    """
    fields = {
        '3':  case_id,
        '4':  case_data.get('case_name', ''),
        '5':  case_data.get('matter_type', ''),
        '6':  case_data.get('status', ''),
        '7':  str(case_data.get('created_at', '')),
        '8':  case_data.get('client_name', ''),
        '9':  case_data.get('client_email', ''),
        '10': case_data.get('notes', ''),
    }
    return submit_to_jotform(JOTFORM_FORM_ID, fields)
