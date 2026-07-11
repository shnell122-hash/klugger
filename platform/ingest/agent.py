#!/usr/bin/env python3
"""
Agente de ingesta de inmuebles (VLM) — Klugger plataforma.

Toma un listado (texto libre del agente + fotos opcionales) → extrae campos
estructurados con Gemini (visión) → normaliza → inserta en `properties`.

Requiere env:
  KLUGGER_DB_URL         (Infisical)
  GEMINI_API_KEY         (paga; para data privada de agentes)
  GEMINI_KEY_FREE        (opcional; NO se usa aquí — data de agente = privada)

Uso:
  from agent import ingest
  rec = ingest(text, photo_paths=[...], agent_id="<uuid>")   # inserta y devuelve el registro

Diseño: la data de un agente es PRIVADA → allow_free=False (nunca el free tier que entrena con la data).
"""
import os, json, re, time, urllib.request, urllib.error, pathlib

BASE = "https://generativelanguage.googleapis.com"

EXTRACT_INSTRUCTIONS = """Eres un extractor de datos inmobiliarios. Del TEXTO y las FOTOS de este listado, extrae un JSON ESTRICTO con exactamente estas claves (usa null si el dato no aparece; NO inventes):
{
 "title": string|null,
 "description": string|null,
 "price": number|null,            // solo el número, en la moneda del listado
 "currency": "MXN"|"USD"|null,
 "operation": "venta"|"renta"|null,
 "property_type": "casa"|"departamento"|"terreno"|"local"|"oficina"|"bodega"|"otro"|null,
 "size_m2": number|null,          // construcción en m2
 "land_m2": number|null,          // terreno en m2
 "bedrooms": integer|null,
 "bathrooms": number|null,        // 2.5 permitido
 "parking": integer|null,
 "address": string|null,
 "colonia": string|null,
 "municipio": string|null,
 "estado": string|null,
 "amenities": [string]            // lista; [] si ninguna
}
Reglas: precios como número puro (sin $, comas ni "MXN"). m2 como número. Deriva property_type y operation del contexto. Las FOTOS ayudan a confirmar tipo, estado y amenidades (alberca, jardín, etc.). Devuelve SOLO el JSON, sin texto adicional ni ```."""


def _upload(key, path, mime):
    size = os.path.getsize(path)
    sh = {"X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
          "X-Goog-Upload-Header-Content-Length": str(size),
          "X-Goog-Upload-Header-Content-Type": mime, "Content-Type": "application/json"}
    meta = json.dumps({"file": {"display_name": os.path.basename(path)}}).encode()
    r = urllib.request.Request(f"{BASE}/upload/v1beta/files?key={key}", data=meta, headers=sh, method="POST")
    up = urllib.request.urlopen(r, timeout=120).headers["X-Goog-Upload-URL"]
    uh = {"X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0", "Content-Length": str(size)}
    with open(path, "rb") as fh:
        info = json.loads(urllib.request.urlopen(
            urllib.request.Request(up, data=fh.read(), headers=uh, method="POST"), timeout=300).read())
    return info["file"]["uri"]


def _guess_mime(p):
    e = pathlib.Path(p).suffix.lower()
    return {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}.get(e, "image/jpeg")


def extract(text, photo_paths=None, model="gemini-2.5-flash", retries=3):
    """Llama a Gemini (visión) con texto+fotos y devuelve el dict extraído. Data privada → key de paga."""
    key = os.environ["GEMINI_API_KEY"]
    parts = []
    for p in (photo_paths or [])[:8]:
        parts.append({"file_data": {"mime_type": _guess_mime(p), "file_uri": _upload(key, p, _guess_mime(p))}})
    parts.append({"text": EXTRACT_INSTRUCTIONS + "\n\n=== TEXTO DEL LISTADO ===\n" + (text or "")})
    body = json.dumps({"contents": [{"parts": parts}],
                       "generationConfig": {"temperature": 0, "maxOutputTokens": 4096,
                                            "responseMimeType": "application/json"}}).encode()
    last = None
    for a in range(retries):
        try:
            r = urllib.request.Request(f"{BASE}/v1beta/models/{model}:generateContent?key={key}",
                                       data=body, headers={"Content-Type": "application/json"}, method="POST")
            d = json.loads(urllib.request.urlopen(r, timeout=180).read())
            txt = "".join(x.get("text", "") for x in d["candidates"][0]["content"]["parts"])
            return json.loads(txt)
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}"
            if e.code in (429, 503) and a < retries - 1:
                time.sleep(3 * (2 ** a)); continue
            raise
    raise RuntimeError(f"extract falló: {last}")


_NUM = re.compile(r"[-+]?\d*\.?\d+")


def _num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return v
    m = _NUM.search(str(v).replace(",", ""))
    return float(m.group()) if m else None


def normalize(rec):
    out = dict(rec)
    for k in ("price", "size_m2", "land_m2", "bathrooms"):
        out[k] = _num(rec.get(k))
    for k in ("bedrooms", "parking"):
        n = _num(rec.get(k)); out[k] = int(n) if n is not None else None
    op = (rec.get("operation") or "").lower()
    out["operation"] = "renta" if "renta" in op or "rent" in op else ("venta" if "venta" in op or op else None)
    if not rec.get("amenities"):
        out["amenities"] = []
    out["currency"] = rec.get("currency") or "MXN"
    return out


def insert(rec, agent_id, photos=None, source="agent_upload", raw=None):
    import psycopg2, psycopg2.extras
    dsn = os.environ["KLUGGER_DB_URL"]
    cols = ["agent_id", "title", "description", "price", "currency", "operation", "property_type",
            "size_m2", "land_m2", "bedrooms", "bathrooms", "parking", "address", "colonia",
            "municipio", "estado", "amenities", "photos", "source", "raw_ingest"]
    vals = [agent_id, rec.get("title"), rec.get("description"), rec.get("price"), rec.get("currency"),
            rec.get("operation"), rec.get("property_type"), rec.get("size_m2"), rec.get("land_m2"),
            rec.get("bedrooms"), rec.get("bathrooms"), rec.get("parking"), rec.get("address"),
            rec.get("colonia"), rec.get("municipio"), rec.get("estado"),
            psycopg2.extras.Json(rec.get("amenities") or []), psycopg2.extras.Json(photos or []),
            source, psycopg2.extras.Json(raw or rec)]
    with psycopg2.connect(dsn) as con, con.cursor() as cur:
        cur.execute(f"INSERT INTO properties ({','.join(cols)}) VALUES ({','.join(['%s']*len(cols))}) RETURNING id", vals)
        return str(cur.fetchone()[0])


def ingest(text, photo_paths=None, agent_id=None, photos=None):
    raw = extract(text, photo_paths)
    rec = normalize(raw)
    pid = insert(rec, agent_id, photos=photos or [], raw=raw) if agent_id else None
    return {"property_id": pid, "extracted": rec}


if __name__ == "__main__":
    import sys
    txt = sys.stdin.read() if not sys.stdin.isatty() else (sys.argv[1] if len(sys.argv) > 1 else "")
    print(json.dumps(ingest(txt, agent_id=os.environ.get("TEST_AGENT_ID")), ensure_ascii=False, indent=2))
