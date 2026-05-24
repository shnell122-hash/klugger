# v60 - nueva funcionalidad
"""
GraphAgent — genera grafo de relaciones del expediente en formato Mermaid y Cytoscape (/grafico).
El grafo muestra entidades (personas, empresas, contratos, operaciones) y sus relaciones.
"""
import json, logging
from tools.db import query
from tools.litellm_router import route_by_tier, extract_text, TIER_REDACTION

log = logging.getLogger('graph_agent')

_SYSTEM = (
    "Eres un analista legal que modela expedientes como grafos de relaciones. "
    "Identificas todas las entidades (personas, empresas, contratos, operaciones, fechas, documentos) "
    "y sus relaciones directas. Respondes en JSON válido sin texto adicional."
)

_SCHEMA = """{
  "nodes": [
    {"id": "n1", "label": "Nombre de entidad", "type": "persona|empresa|contrato|operacion|fecha|documento"}
  ],
  "edges": [
    {"source": "n1", "target": "n2", "label": "tipo de relación", "weight": 1}
  ],
  "summary": "descripción de las relaciones principales en 2-3 líneas"
}"""

_REL_EXAMPLES = (
    "Relaciones comunes: firmó, es_parte_de, pagó_a, recibió_de, "
    "representa_a, celebró_con, incumplió, demandó_a, tiene_contrato_con, "
    "es_filial_de, controla_a, es_socio_de, garantizó_a."
)

# Colores por tipo de nodo para Cytoscape
_NODE_COLORS = {
    'persona':    '#4A90D9',
    'empresa':    '#7ED321',
    'contrato':   '#F5A623',
    'operacion':  '#BD10E0',
    'fecha':      '#9B9B9B',
    'documento':  '#50E3C2',
    'default':    '#B8B8B8',
}


def generate_case_graph(case_id: str) -> dict:
    """
    Analiza el contenido del expediente y genera un grafo de relaciones.
    Retorna: {mermaid, cytoscape, summary, case_id}
    """
    context = _load_case_context(case_id)
    if not context:
        return {'error': 'Expediente vacío o no encontrado', 'case_id': case_id}

    messages = [
        {'role': 'system', 'content': _SYSTEM},
        {'role': 'user', 'content': (
            f"Analiza el contenido de este expediente y genera el grafo de relaciones.\n\n"
            f"CONTENIDO:\n{context[:5000]}\n\n"
            f"Responde en JSON con este esquema:\n{_SCHEMA}\n\n"
            f"{_REL_EXAMPLES}"
        )},
    ]
    try:
        resp = route_by_tier(TIER_REDACTION, messages, max_tokens=2000,
                             response_format={'type': 'json_object'})
        graph = json.loads(extract_text(resp))
        return {
            'mermaid':   _to_mermaid(graph),
            'cytoscape': _to_cytoscape(graph),
            'summary':   graph.get('summary', ''),
            'case_id':   case_id,
            'node_count': len(graph.get('nodes', [])),
            'edge_count': len(graph.get('edges', [])),
        }
    except Exception as e:
        log.error('graph_agent: %s', e)
        return {'error': str(e), 'case_id': case_id}


def _load_case_context(case_id: str) -> str:
    artifacts = query(
        "SELECT artifact_name, content FROM system_artifacts "
        "WHERE case_id=%s ORDER BY created_at DESC LIMIT 5",
        (case_id,), many=True
    ) or []
    uploads = query(
        "SELECT filename FROM user_artifacts WHERE case_id=%s ORDER BY created_at DESC LIMIT 10",
        (case_id,), many=True
    ) or []

    parts = []
    for a in artifacts:
        parts.append(f"[{a['artifact_name']}]\n{(a['content'] or '')[:800]}")
    if uploads:
        parts.append('Archivos del expediente: ' + ', '.join(u['filename'] for u in uploads))
    return '\n\n'.join(parts)


def _to_mermaid(graph: dict) -> str:
    """Convierte el grafo al formato Mermaid flowchart LR."""
    lines = ['graph LR']
    id_map: dict[str, str] = {}

    for n in graph.get('nodes', []):
        safe_id = n['id'].replace('-', '_').replace(' ', '_')
        id_map[n['id']] = safe_id
        label = n['label'].replace('"', "'")
        ntype = n.get('type', 'default')
        # Formas por tipo
        shape = {
            'persona':    f'([{label}])',
            'empresa':    f'[{label}]',
            'contrato':   f'>{label}]',
            'operacion':  f'({label})',
            'fecha':      f'[/{label}/]',
            'documento':  f'["{label}"]',
        }.get(ntype, f'[{label}]')
        lines.append(f'    {safe_id}{shape}')

    for e in graph.get('edges', []):
        src = id_map.get(e['source'], e['source'].replace('-', '_'))
        tgt = id_map.get(e['target'], e['target'].replace('-', '_'))
        label = e.get('label', '').replace('"', "'")
        lines.append(f'    {src} -->|{label}| {tgt}')

    return '\n'.join(lines)


def _to_cytoscape(graph: dict) -> dict:
    """Convierte el grafo al formato Cytoscape.js elements array."""
    elements = []
    for n in graph.get('nodes', []):
        ntype = n.get('type', 'default')
        elements.append({'data': {
            'id':    n['id'],
            'label': n['label'],
            'type':  ntype,
            'color': _NODE_COLORS.get(ntype, _NODE_COLORS['default']),
        }})
    for i, e in enumerate(graph.get('edges', [])):
        elements.append({'data': {
            'id':     f'e{i}',
            'source': e['source'],
            'target': e['target'],
            'label':  e.get('label', ''),
            'weight': e.get('weight', 1),
        }})
    return {'elements': elements}
