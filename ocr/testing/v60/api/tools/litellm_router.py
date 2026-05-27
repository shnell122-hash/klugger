# v60 - nueva funcionalidad
"""
LiteLLM cost router — 4 tiers de modelos ordenados por costo ascendente.
Usa el proxy LiteLLM local (puerto 4000) como gateway unificado.
Fallback automático si el modelo primario no responde.
"""
import os, logging, requests
from typing import Any

log = logging.getLogger('litellm_router')

LITELLM_BASE_URL  = os.getenv('LITELLM_BASE_URL',  'http://localhost:4000')
LITELLM_KEY       = os.getenv('LITELLM_MASTER_KEY', '')
CLAUDE_PROXY_URL  = os.getenv('CLAUDE_PROXY_URL',   'http://127.0.0.1:5001')
_USD_MXN          = float(os.getenv('USD_TO_MXN',   '18.0'))

_CLAUDE_PRICES = {
    'claude-opus-4-6':           {'in': 15.0, 'out': 75.0},
    'claude-sonnet-4-6':         {'in':  3.0, 'out': 15.0},
    'claude-haiku-4-5-20251001': {'in':  0.25, 'out': 1.25},
}

# ── Tiers ──────────────────────────────────────────────────────────────────────
TIER_ULTRA_CHEAP = 0   # Bulk / resúmenes / checklists
TIER_MULTIMODAL  = 1   # OCR / visión / imágenes
TIER_REDACTION   = 2   # Redacción / contratos simples / grafos
TIER_LEGAL       = 3   # Legal crítico / validación / análisis complejo

_TIER_MODELS: dict[int, list[str]] = {
    TIER_ULTRA_CHEAP: [
        'groq/llama-3.3-70b-versatile',
        'together_ai/Qwen/Qwen2.5-72B-Instruct-Turbo',
        'openai/gpt-4o-mini',
    ],
    TIER_MULTIMODAL: [
        'gemini/gemini-2.0-flash',
        'gemini/gemini-1.5-flash',
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
}

# Nombres cortos para logs
_TIER_NAMES = {
    TIER_ULTRA_CHEAP: 'ultra-cheap',
    TIER_MULTIMODAL:  'multimodal',
    TIER_REDACTION:   'redaction',
    TIER_LEGAL:       'legal',
}


def _call_claude_proxy(model: str, messages: list, **kwargs) -> dict:
    """Calls claude-proxy (port 5001) for TIER_LEGAL. Returns OpenAI-compatible dict."""
    model_name = model.replace('anthropic/', '')
    payload = {'model': model_name, 'messages': messages,
               'max_tokens': kwargs.get('max_tokens', 4096)}
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

    content     = data.get('content') or [{}]
    text        = content[0].get('text', '') if content else ''
    usage       = data.get('usage', {})
    input_t     = usage.get('input_tokens', 0)
    output_t    = usage.get('output_tokens', 0)
    model_key   = next((k for k in _CLAUDE_PRICES if k in model_name), 'claude-sonnet-4-6')
    p           = _CLAUDE_PRICES[model_key]
    usd         = (input_t * p['in'] + output_t * p['out']) / 1_000_000
    log.info('COST src=proxy model=%s in=%d out=%d usd=%.5f mxn=%.3f',
             model_name, input_t, output_t, usd, usd * _USD_MXN)

    return {
        'choices': [{'message': {'role': 'assistant', 'content': text}}],
        'usage':   {'prompt_tokens': input_t, 'completion_tokens': output_t},
    }


def _call_litellm(model: str, messages: list, **kwargs) -> dict:
    """POST al proxy LiteLLM y retorna la respuesta en formato OpenAI."""
    payload = {'model': model, 'messages': messages, **kwargs}
    resp = requests.post(
        f'{LITELLM_BASE_URL}/chat/completions',
        headers={
            'Authorization': f'Bearer {LITELLM_KEY}',
            'Content-Type': 'application/json',
        },
        json=payload,
        timeout=int(kwargs.get('_timeout', 120)),
    )
    resp.raise_for_status()
    return resp.json()


def route_by_tier(tier: int, messages: list, **kwargs) -> dict:
    """
    Intenta modelos del tier dado con fallback automático al siguiente.
    TIER_LEGAL siempre usa claude-proxy (sin consumo de API key).
    kwargs: max_tokens, response_format, temperature, _timeout, etc.
    """
    kwargs.pop('_timeout', None)

    if tier == TIER_LEGAL:
        last_err = None
        for model in _TIER_MODELS[TIER_LEGAL]:
            try:
                log.info('claude-proxy tier=legal model=%s', model)
                return _call_claude_proxy(model, messages, **kwargs)
            except Exception as e:
                log.warning('claude-proxy model=%s failed: %s', model, e)
                last_err = e
        raise RuntimeError(f'Todos los modelos TIER_LEGAL fallaron: {last_err}')

    models = _TIER_MODELS.get(tier, _TIER_MODELS[TIER_LEGAL])
    last_err = None
    for model in models:
        try:
            log.info('litellm tier=%s model=%s', _TIER_NAMES.get(tier, tier), model)
            return _call_litellm(model, messages, **kwargs)
        except Exception as e:
            log.warning('litellm model=%s failed: %s', model, e)
            last_err = e
    raise RuntimeError(
        f'Todos los modelos tier {_TIER_NAMES.get(tier, tier)} fallaron: {last_err}'
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
    if any(k in task for k in ('grafico', 'graph', 'materialidad', 'contrato', 'redact')):
        return TIER_REDACTION
    return TIER_LEGAL
