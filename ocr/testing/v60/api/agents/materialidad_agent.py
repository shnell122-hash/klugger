# v60 - nueva funcionalidad
"""
MaterialidadAgent — análisis de materialidad fiscal y contractual (/materialidad).
Aplica estándares SAT (Art. 69-B CFF) y compliance contractual mexicano.
"""
import json, logging
from tools.litellm_router import route_by_tier, extract_text, TIER_LEGAL, TIER_REDACTION

log = logging.getLogger('materialidad')

_SYSTEM = (
    "Eres un experto en derecho fiscal y corporativo mexicano con 20 años de experiencia. "
    "Analizas materialidad de operaciones bajo los estándares del SAT (Art. 69-B CFF), "
    "razón de negocios (Art. 5-A CFF), y compliance contractual. "
    "Siempre citas artículos específicos del CFF, LISR, LIVA según corresponda. "
    "Respondes en JSON válido sin texto adicional."
)

_SCHEMA = """{
  "score": <0-100, donde 100 = máxima materialidad demostrable>,
  "verdict": "materialidad_alta|materialidad_media|materialidad_baja|sin_materialidad",
  "risks": [
    {"risk": "descripción del riesgo", "severity": "alta|media|baja", "article": "Art. X CFF"}
  ],
  "evidence_needed": ["documento o evidencia requerida 1", "..."],
  "recommendations": ["recomendación práctica 1", "..."],
  "legal_references": ["Art. 69-B CFF", "Art. 5-A CFF", "..."],
  "summary": "resumen ejecutivo en 3 líneas"
}"""


def analyze_materialidad(case_id: str, content: str,
                         analysis_type: str = 'fiscal',
                         context: str = '') -> dict:
    """
    Analiza la materialidad de una operación o documento.
    analysis_type: 'fiscal' | 'contractual' | 'full'
    """
    prompt = _build_prompt(content, analysis_type, context)
    tier = TIER_LEGAL if analysis_type == 'full' else TIER_REDACTION

    messages = [
        {'role': 'system', 'content': _SYSTEM},
        {'role': 'user', 'content': prompt},
    ]
    try:
        resp = route_by_tier(tier, messages, max_tokens=3000,
                             response_format={'type': 'json_object'})
        result = json.loads(extract_text(resp))
        result['case_id'] = case_id
        result['analysis_type'] = analysis_type
        return result
    except Exception as e:
        log.error('materialidad: %s', e)
        return {'error': str(e), 'case_id': case_id, 'analysis_type': analysis_type}


def _build_prompt(content: str, analysis_type: str, context: str) -> str:
    prompt = (
        f"Analiza la materialidad de la siguiente operación/documento.\n\n"
        f"CONTENIDO:\n{content[:6000]}\n\n"
    )
    if context:
        prompt += f"CONTEXTO ADICIONAL: {context}\n\n"

    prompt += f"Responde en JSON con este esquema:\n{_SCHEMA}\n\n"

    if analysis_type == 'fiscal':
        prompt += (
            "Enfoque FISCAL: razón de negocios (Art. 5-A CFF), sustancia económica, "
            "EFOS/EDOS (Art. 69 CFF), Art. 69-B CFF. "
            "¿La operación tiene razón de negocios demostrable? "
            "¿Hay riesgo de presunción de inexistencia?"
        )
    elif analysis_type == 'contractual':
        prompt += (
            "Enfoque CONTRACTUAL: cumplimiento vs incumplimiento material, "
            "cláusulas pactadas vs ejecutadas, incumplimiento esencial, "
            "daños y perjuicios aplicables."
        )
    elif analysis_type == 'full':
        prompt += (
            "Análisis COMPLETO: fiscal + contractual + riesgo penal "
            "(defraudación fiscal Art. 108-109 CFF). "
            "Evalúa todos los ángulos de riesgo."
        )
    return prompt
