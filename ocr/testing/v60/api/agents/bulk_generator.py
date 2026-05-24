# v60 - nueva funcionalidad
"""
BulkGeneratorAgent — generación síncrona y asíncrona de artefactos en lote (/masivo).
Modo sync: retorna resultados directamente (hasta ~10 documentos).
Modo async: despacha a Celery y retorna task_id para polling.
"""
import uuid, logging
from tools.db import execute
from tools.litellm_router import route_by_tier, extract_text, TIER_ULTRA_CHEAP, TIER_REDACTION

log = logging.getLogger('bulk_generator')


def generate_bulk_sync(case_id: str, user_id: str, prompts: list,
                       artifact_type: str = 'contract',
                       base_name: str = 'Documento') -> list:
    """
    Genera múltiples artefactos de forma síncrona.
    Retorna lista de {artifact_id, artifact_name, ok, error?}
    """
    tier = TIER_ULTRA_CHEAP if artifact_type in ('summary', 'checklist') else TIER_REDACTION
    results = []
    total = len(prompts)

    for i, prompt in enumerate(prompts):
        art_name = f'{base_name} #{i+1}'
        log.info('bulk_sync %d/%d: %s', i+1, total, art_name)
        try:
            resp = route_by_tier(tier, [{'role': 'user', 'content': prompt}], max_tokens=4000)
            content = extract_text(resp)
            art_id = str(uuid.uuid4())
            execute(
                "INSERT INTO system_artifacts "
                "(artifact_id, case_id, artifact_name, artifact_type, content, created_by) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (art_id, case_id, art_name, artifact_type, content, user_id)
            )
            results.append({'artifact_id': art_id, 'artifact_name': art_name, 'ok': True})
        except Exception as e:
            log.error('bulk_sync item %d failed: %s', i+1, e)
            results.append({'artifact_name': art_name, 'ok': False, 'error': str(e)})

    return results


def generate_bulk_async(case_id: str, user_id: str, prompts: list,
                        artifact_type: str = 'contract',
                        base_name: str = 'Documento') -> str:
    """
    Despacha generación masiva a Celery.
    Retorna task_id para polling en /api/v1/bulk/status/<task_id>.
    """
    from tools.celery_app import generate_bulk
    task = generate_bulk.delay(case_id, user_id, prompts, artifact_type, base_name)
    log.info('bulk_async dispatched task_id=%s case=%s count=%d', task.id, case_id, len(prompts))
    return task.id


def get_bulk_status(task_id: str) -> dict:
    """
    Consulta el estado de una tarea Celery.
    Retorna: {state, current, total, status, result?}
    """
    try:
        from tools.celery_app import celery_app
        task = celery_app.AsyncResult(task_id)
        if task.state == 'PENDING':
            return {'state': 'PENDING', 'status': 'En cola…'}
        elif task.state == 'PROGRESS':
            info = task.info or {}
            return {
                'state':   'PROGRESS',
                'current': info.get('current', 0),
                'total':   info.get('total', 0),
                'status':  info.get('status', 'Procesando…'),
            }
        elif task.state == 'SUCCESS':
            return {'state': 'SUCCESS', 'result': task.result}
        else:
            return {'state': task.state, 'error': str(task.info)}
    except Exception as e:
        return {'state': 'ERROR', 'error': str(e)}
