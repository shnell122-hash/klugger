#!/usr/bin/env python3
"""
gemini_ingest.py — Primitiva de ingesta con Gemini y fallback free→paga.

Estrategia de costo (decisión de operador 2026-07-10):
  1) TIER FREE  : key `GEMINI_KEY_FREE` (AI Studio, cuenta @gmail personal, secreto Infisical
                  `leasingagataGEMINI`) con modelo `gemini-flash-latest`. Free tier ~1,500 req/día,
                  ~15 req/min. Para CONTENIDO PÚBLICO (papers, docs). OJO: Google puede entrenar con
                  la data del free tier → NUNCA usar con data de clientes.
  2) TIER PAGA  : key `GEMINI_API_KEY` (paga, Infisical) con modelo `gemini-2.5-flash`. Confiable,
                  para data privada o cuando el free tier está saturado.

El free tier devuelve 429 (rate limit) y 503 (saturación) con frecuencia; se reintenta con backoff y,
si persiste, se cae automáticamente al tier de paga.

Uso:
    from gemini_ingest import generate
    texto, finish, tier = generate("Transcribe fielmente", file_path="doc.pdf")

    # Solo texto (sin archivo):
    texto, finish, tier = generate("Resume esto: ...")

    # Forzar data privada (nunca free tier):
    texto, finish, tier = generate(prompt, file_path="foto.jpg", mime="image/jpeg", allow_free=False)

Env vars: GEMINI_KEY_FREE (opcional), GEMINI_API_KEY (requerida como fallback).
"""
import os, json, time, urllib.request, urllib.error

BASE = "https://generativelanguage.googleapis.com"


def _tiers(allow_free):
    t = []
    if allow_free and os.environ.get("GEMINI_KEY_FREE"):
        t.append(("free", os.environ["GEMINI_KEY_FREE"], "gemini-flash-latest"))
    if os.environ.get("GEMINI_API_KEY"):
        t.append(("paid", os.environ["GEMINI_API_KEY"], "gemini-2.5-flash"))
    if not t:
        raise RuntimeError("Falta GEMINI_API_KEY (y/o GEMINI_KEY_FREE)")
    return t


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


def _gen(key, model, parts, max_tokens):
    body = json.dumps({"contents": [{"parts": parts}],
                       "generationConfig": {"temperature": 0, "maxOutputTokens": max_tokens}}).encode()
    r = urllib.request.Request(f"{BASE}/v1beta/models/{model}:generateContent?key={key}",
                               data=body, headers={"Content-Type": "application/json"}, method="POST")
    d = json.loads(urllib.request.urlopen(r, timeout=600).read())
    cand = (d.get("candidates") or [{}])[0]
    txt = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []))
    return txt, cand.get("finishReason", "")


def generate(prompt, file_path=None, mime="application/pdf", allow_free=True,
             max_tokens=65536, retries_per_tier=3):
    """Devuelve (texto, finishReason, tier_usado). Cae de free→paga en 429/503."""
    last_err = None
    for tier, key, model in _tiers(allow_free):
        for attempt in range(retries_per_tier):
            try:
                parts = [{"text": prompt}]
                if file_path:
                    uri = _upload(key, file_path, mime)
                    parts = [{"file_data": {"mime_type": mime, "file_uri": uri}}, {"text": prompt}]
                txt, finish = _gen(key, model, parts, max_tokens)
                if not txt.strip() and attempt < retries_per_tier - 1:
                    time.sleep(3); continue
                return txt, finish, tier
            except urllib.error.HTTPError as e:
                last_err = f"{tier}:{model} HTTP {e.code}"
                if e.code in (429, 503):
                    if attempt < retries_per_tier - 1:
                        time.sleep(3 * (2 ** attempt)); continue
                    break  # agotó reintentos del tier → cae al siguiente (paga)
                raise  # 400/401/404 etc: error real, no reintentar
            except Exception as e:
                last_err = f"{tier}:{model} {e}"
                if attempt < retries_per_tier - 1:
                    time.sleep(3); continue
                break
    raise RuntimeError(f"Todos los tiers de Gemini fallaron. Último: {last_err}")


if __name__ == "__main__":
    import sys
    fp = sys.argv[1] if len(sys.argv) > 1 else None
    t, f, tier = generate("Responde solo: OK, ingesta operativa", file_path=fp)
    print(f"[{tier}] finish={f}: {t.strip()[:80]}")
