# v60 - nueva funcionalidad
"""
LiteLLM cost router — 5 tiers de modelos ordenados por costo ascendente.

Backends disponibles (en orden de preferencia cuando LiteLLM está caído):
  1. claude-proxy (puerto 5001)  — para modelos anthropic/*
  2. LiteLLM local (puerto 4000) — gateway unificado para todo lo demás
  3. OpenRouter                  — si OPENROUTER_API_KEY está configurada
  4. OpenAI directo              — solo para openai/gpt-4o-mini como último recurso

Variables de entorno:
  LITELLM_BASE_URL    — default http://localhost:4000
  LITELLM_MASTER_KEY  — autenticación con LiteLLM local
  CLAUDE_PROXY_URL    — default http://127.0.0.1:5001
  OPENAI_API_KEY      — habilita fallback directo a OpenAI
  OPENROUTER_API_KEY  — habilita OpenRouter como backend alternativo (soporta
                        Groq, Gemini, DeepSeek, etc. con la misma interfaz)
  USD_TO_MXN          — tipo de cambio para logs de costo
"""
import os
import time
import logging
import requests
from typing import Any

log = logging.getLogger('litellm_router')

LITELLM_BASE_URL = os.getenv('LITELLM_BASE_URL',  'http://localhost:4000')
LITELLM_KEY      = os.getenv('LITELLM_MASTER_KEY', '')
CLAUDE_PROXY_URL = os.getenv('CLAUDE_PROXY_URL',   'http://127.0.0.1:5001')
_USD_MXN         = float(os.getenv('USD_TO_MXN',   '18.0'))

_CLAUDE_PRICES = {
    'claude-opus-4-6':           {'in': 15.0,  'out': 75.0},
    'claude-sonnet-4-6':         {'in':  3.0,  'out': 15.0},
    'claude-haiku-4-5-20251001': {'in':  0.25, 'out': 1.25},
}

# ── Tiers ──────────────────────────────────────────────────────────────────────
TIER_ULTRA_CHEAP = 0   # Bulk / resúmenes / checklists
TIER_MULTIMODAL  = 1   # OCR / visión / imágenes
TIER_REDACTION   = 2   # Redacción / contratos simples (DeepSeek-chat, fast)
TIER_LEGAL       = 3   # Legal crítico / validación — solo claude-proxy
TIER_REDACT_PRO  = 4   # Razonamiento complejo: grafos, análisis contractual profundo, lógica jurídica

_TIER_MODELS: dict[int, list[str]] = {
    TIER_ULTRA_CHEAP: [
        'groq/llama-3.3-70b-versatile',
        'together_ai/Qwen/Qwen2.5-72B-Instruct-Turbo',
        'openai/gpt-4o-mini',
    ],
    TIER_MULTIMODAL: [
        'gemini/gemini-2.5-flash',
        'gemini/gemini-2.5-flash-lite',
        'openai/gpt-4o-mini',
    ],
    TIER_REDACTION: [
        'deepseek/deepseek-chat',
        'together_ai/Qwen/Qwen2.5-72B-Instruct-Turbo',
        'openai/gpt-4o-mini',
    ],
    TIER_LEGAL: [
        'anthropic/claude-sonnet-4-6',
        'anthropic/claude-haiku-4-5-20251001',
    ],
    TIER_REDACT_PRO: [
        'deepseek/deepseek-reasoner',          # R1 — razonamiento nativo
        'anthropic/claude-haiku-4-5-20251001', # fallback: Haiku vía proxy
    ],
}

_TIER_NAMES = {
    TIER_ULTRA_CHEAP: 'ultra-cheap',
    TIER_MULTIMODAL:  'multimodal',
    TIER_REDACTION:   'redaction',
    TIER_LEGAL:       'legal',
    TIER_REDACT_PRO:  'redact-pro',
}

# ── LiteLLM health cache (evita un TCP check por cada llamada) ─────────────────
_litellm_cache: dict[str, Any] = {'up': None, 'ts': 0.0}
_LITELLM_CACHE_TTL = 60  # segundos


def _litellm_is_up() -> bool:
    now = time.monotonic()
    if _litellm_cache['up'] is not None and now - _litellm_cache['ts'] < _LITELLM_CACHE_TTL:
        return _litellm_cache['up']
    try:
        r = requests.get(f'{LITELLM_BASE_URL}/health', timeout=2)
        up = r.status_code < 500
    except Exception:
        up = False
    _litellm_cache.update({'up': up, 'ts': now})
    return up


# ── Backends ───────────────────────────────────────────────────────────────────

def _call_claude_proxy(model: str, messages: list, **kwargs) -> dict:
    """Calls claude-proxy (port 5001) for anthropic/* models. No API key consumed."""
    model_name = model.replace('anthropic/', '')
    payload = {
        'model':      model_name,
        'messages':   messages,
        'max_tokens': kwargs.get('max_tokens', 4096),
    }
    if 'temperature' in kwargs:
        payload['temperature'] = kwargs['temperature']

    resp = requests.post(
        f'{CLAUDE_PROXY_URL}/v1/messages',
        headers={'Content-Type': 'application/json', 'x-api-key': 'claude-proxy'},
        json=payload,
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()

    content  = data.get('content') or [{}]
    text     = content[0].get('text', '') if content else ''
    usage    = data.get('usage', {})
    input_t  = usage.get('input_tokens', 0)
    output_t = usage.get('output_tokens', 0)
    model_key = next((k for k in _CLAUDE_PRICES if k in model_name), 'claude-sonnet-4-6')
    p        = _CLAUDE_PRICES[model_key]
    usd      = (input_t * p['in'] + output_t * p['out']) / 1_000_000
    log.info('COST src=proxy model=%s in=%d out=%d usd=%.5f mxn=%.3f',
             model_name, input_t, output_t, usd, usd * _USD_MXN)

    return {
        'choices': [{'message': {'role': 'assistant', 'content': text}}],
        'usage':   {'prompt_tokens': input_t, 'completion_tokens': output_t},
    }


def _call_litellm(model: str, messages: list, **kwargs) -> dict:
    """POST al proxy LiteLLM local y retorna la respuesta en formato OpenAI."""
    payload = {'model': model, 'messages': messages, **kwargs}
    resp = requests.post(
        f'{LITELLM_BASE_URL}/chat/completions',
        headers={
            'Authorization': f'Bearer {LITELLM_KEY}',
            'Content-Type':  'application/json',
        },
        json=payload,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _call_openai_direct(model: str, messages: list, **kwargs) -> dict:
    """
    Fallback directo a OpenAI sin pasar por LiteLLM.
    Solo se usa cuando LiteLLM está caído y el modelo es openai/gpt-4o-mini.
    """
    api_key = os.getenv('OPENAI_API_KEY', '')
    if not api_key:
        raise RuntimeError('OPENAI_API_KEY no configurada')

    # LiteLLM añade el prefijo 'openai/' que la API real no acepta
    model_name = model.replace('openai/', '')
    payload: dict[str, Any] = {
        'model':    model_name,
        'messages': messages,
    }
    for key in ('max_tokens', 'temperature', 'response_format'):
        if key in kwargs:
            payload[key] = kwargs[key]

    resp = requests.post(
        'https://api.openai.com/v1/chat/completions',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type':  'application/json',
        },
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def _call_gemini_direct(model: str, messages: list, **kwargs) -> dict:
    """
    Gemini via endpoint OpenAI-compatible de Google AI.
    Soporta visión (image_url con base64) y PDFs nativos.
    """
    api_key = os.getenv('GEMINI_API_KEY', '')
    if not api_key:
        raise RuntimeError('GEMINI_API_KEY no configurada')

    model_name = model.replace('gemini/', '')
    payload: dict[str, Any] = {'model': model_name, 'messages': messages}
    for key in ('max_tokens', 'temperature', 'response_format'):
        if key in kwargs:
            payload[key] = kwargs[key]

    resp = requests.post(
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
        json=payload,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _call_groq_direct(model: str, messages: list, **kwargs) -> dict:
    """Groq API (OpenAI-compatible). Fastest inference for Llama-3.3-70B."""
    api_key = os.getenv('GROQ_API_KEY', '')
    if not api_key:
        raise RuntimeError('GROQ_API_KEY no configurada')

    model_name = model.replace('groq/', '')
    payload: dict[str, Any] = {'model': model_name, 'messages': messages}
    for key in ('max_tokens', 'temperature'):
        if key in kwargs:
            payload[key] = kwargs[key]

    resp = requests.post(
        'https://api.groq.com/openai/v1/chat/completions',
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


def _call_deepseek_direct(model: str, messages: list, **kwargs) -> dict:
    """
    Fallback directo a DeepSeek API (OpenAI-compatible).
    Soporta deepseek-chat (V3) y deepseek-reasoner (R1).
    """
    api_key = os.getenv('DEEPSEEK_API_KEY', '')
    if not api_key:
        raise RuntimeError('DEEPSEEK_API_KEY no configurada')

    model_name = model.replace('deepseek/', '')
    payload: dict[str, Any] = {'model': model_name, 'messages': messages}
    for key in ('max_tokens', 'temperature', 'response_format'):
        if key in kwargs:
            payload[key] = kwargs[key]

    resp = requests.post(
        'https://api.deepseek.com/v1/chat/completions',
        headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
        json=payload,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _call_openrouter(model: str, messages: list, **kwargs) -> dict:
    """
    OpenRouter soporta Groq, Gemini, DeepSeek, OpenAI y más con la misma
    interfaz. Úsalo cuando LiteLLM está caído y OPENROUTER_API_KEY está set.
    Acepta el prefijo provider/ que ya usan los nombres de modelos en este router.
    """
    api_key = os.getenv('OPENROUTER_API_KEY', '')
    if not api_key:
        raise RuntimeError('OPENROUTER_API_KEY no configurada')

    payload: dict[str, Any] = {
        'model':    model,
        'messages': messages,
    }
    for key in ('max_tokens', 'temperature', 'response_format'):
        if key in kwargs:
            payload[key] = kwargs[key]

    resp = requests.post(
        'https://openrouter.ai/api/v1/chat/completions',
        headers={
            'Authorization': f'Bearer {api_key}',
            'Content-Type':  'application/json',
            'HTTP-Referer':  'https://ocr.ruby.lease',
        },
        json=payload,
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


# ── Public API ─────────────────────────────────────────────────────────────────

def check_tier_health() -> dict:
    """Retorna qué backends están disponibles en este momento."""
    return {
        'litellm':        _litellm_is_up(),
        'openrouter':     bool(os.getenv('OPENROUTER_API_KEY')),
        'openai_direct':  bool(os.getenv('OPENAI_API_KEY')),
        'deepseek_direct': bool(os.getenv('DEEPSEEK_API_KEY')),
        'gemini_direct':  bool(os.getenv('GEMINI_API_KEY')),
        'groq_direct':    bool(os.getenv('GROQ_API_KEY')),
        'claude_proxy':   _probe_claude_proxy(),
    }


def _probe_claude_proxy() -> bool:
    try:
        r = requests.get(f'{CLAUDE_PROXY_URL}/health', timeout=2)
        return r.status_code < 500
    except Exception:
        return False


def route_by_tier(tier: int, messages: list, **kwargs) -> dict:
    """
    Intenta cada modelo del tier en orden con fallback automático.

    Prioridad de backend por modelo:
      1. anthropic/*    → claude-proxy (nunca consume API key)
      2. LiteLLM up     → _call_litellm
      3. OpenRouter set → _call_openrouter
      4. openai/*       → _call_openai_direct (si OPENAI_API_KEY set)

    kwargs: max_tokens, response_format, temperature, etc.
    """
    kwargs.pop('_timeout', None)

    models = _TIER_MODELS.get(tier, _TIER_MODELS[TIER_LEGAL])
    last_err: Exception | None = None
    litellm_up = _litellm_is_up()
    openrouter_key = os.getenv('OPENROUTER_API_KEY', '')
    openai_key     = os.getenv('OPENAI_API_KEY', '')

    for model in models:
        try:
            if model.startswith('anthropic/'):
                log.info('backend=claude-proxy tier=%s model=%s',
                         _TIER_NAMES.get(tier, tier), model)
                return _call_claude_proxy(model, messages, **kwargs)

            if litellm_up:
                log.info('backend=litellm tier=%s model=%s',
                         _TIER_NAMES.get(tier, tier), model)
                return _call_litellm(model, messages, **kwargs)

            if openrouter_key:
                log.info('backend=openrouter tier=%s model=%s',
                         _TIER_NAMES.get(tier, tier), model)
                return _call_openrouter(model, messages, **kwargs)

            if 'openai/' in model and openai_key:
                log.info('backend=openai-direct tier=%s model=%s',
                         _TIER_NAMES.get(tier, tier), model)
                return _call_openai_direct(model, messages, **kwargs)

            if 'deepseek/' in model and os.getenv('DEEPSEEK_API_KEY'):
                log.info('backend=deepseek-direct tier=%s model=%s',
                         _TIER_NAMES.get(tier, tier), model)
                return _call_deepseek_direct(model, messages, **kwargs)

            if 'gemini/' in model and os.getenv('GEMINI_API_KEY'):
                log.info('backend=gemini-direct tier=%s model=%s',
                         _TIER_NAMES.get(tier, tier), model)
                return _call_gemini_direct(model, messages, **kwargs)

            if 'groq/' in model and os.getenv('GROQ_API_KEY'):
                log.info('backend=groq-direct tier=%s model=%s',
                         _TIER_NAMES.get(tier, tier), model)
                return _call_groq_direct(model, messages, **kwargs)

            log.warning('no backend available for tier=%s model=%s — skipping',
                        _TIER_NAMES.get(tier, tier), model)

        except Exception as e:
            log.warning('tier=%s model=%s failed: %s',
                        _TIER_NAMES.get(tier, tier), model, e)
            last_err = e

    raise RuntimeError(
        f'Todos los modelos tier={_TIER_NAMES.get(tier, tier)} fallaron: {last_err}'
    )


def extract_text(response: dict) -> str:
    """Extrae el texto de la respuesta (formato OpenAI/LiteLLM)."""
    try:
        return response['choices'][0]['message']['content'] or ''
    except (KeyError, IndexError, TypeError):
        return ''


def tier_for_task(task: str) -> int:
    """Infiere el tier adecuado a partir del nombre de la tarea."""
    task = task.lower()
    if any(k in task for k in ('masivo', 'bulk', 'summary', 'checklist', 'resumen')):
        return TIER_ULTRA_CHEAP
    if any(k in task for k in ('ocr', 'imagen', 'vision', 'photo', 'evidencia')):
        return TIER_MULTIMODAL
    # TIER_REDACT_PRO: razonamiento estructurado, no es crítico-legal pero sí complejo
    if any(k in task for k in ('grafico', 'graph', 'materialidad',
                                'razonamiento', 'logica', 'codigo')):
        return TIER_REDACT_PRO
    # TIER_REDACTION: redacción rápida de contratos y documentos
    if any(k in task for k in ('contrato', 'redact')):
        return TIER_REDACTION
    return TIER_LEGAL
