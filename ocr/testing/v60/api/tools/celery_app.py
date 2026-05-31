# v60 - nueva funcionalidad
"""
Celery worker — background tasks para /masivo y jobs largos.
Iniciar worker: celery -A tools.celery_app worker --loglevel=info
"""
import os, uuid, logging
from celery import Celery

log = logging.getLogger('celery_app')

BROKER  = os.getenv('CELERY_BROKER',         'redis://localhost:6379/1')
BACKEND = os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/1')

celery_app = Celery('vilar_v60', broker=BROKER, backend=BACKEND)
celery_app.conf.update(
    task_serializer='json',
    result_serializer='json',
    accept_content=['json'],
    timezone='America/Mexico_City',
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    task_soft_time_limit=3600,   # 1h por tarea
    task_time_limit=7200,        # 2h límite duro
)


@celery_app.task(bind=True, name='generate_bulk', max_retries=2)
def generate_bulk(self, case_id: str, user_id: str, prompts: list,
                  artifact_type: str = 'contract', base_name: str = 'Documento'):
    """
    Genera múltiples artefactos en background usando tier ultra-cheap o redaction.
    Actualiza estado en Redis para polling desde el frontend.
    Retorna: {done, total, results: [{artifact_id, ok, error?}]}
    """
    from tools.litellm_router import route_by_tier, extract_text, TIER_ULTRA_CHEAP, TIER_REDACTION
    from tools.db import execute

    tier = TIER_ULTRA_CHEAP if artifact_type in ('summary', 'checklist') else TIER_REDACTION
    results = []
    total = len(prompts)

    for i, prompt in enumerate(prompts):
        self.update_state(
            state='PROGRESS',
            meta={'current': i, 'total': total, 'status': f'Generando {i+1}/{total}…'}
        )
        art_name = f'{base_name} #{i+1}'
        try:
            resp = route_by_tier(
                tier,
                [{'role': 'user', 'content': prompt}],
                max_tokens=4000,
            )
            content = extract_text(resp)
            art_id = str(uuid.uuid4())
            execute(
                "INSERT INTO system_artifacts "
                "(artifact_id, case_id, artifact_name, artifact_type, content, created_by) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (art_id, case_id, art_name, artifact_type, content, user_id)
            )
            results.append({'artifact_id': art_id, 'artifact_name': art_name, 'ok': True})
            log.info('bulk item %d/%d created: %s', i+1, total, art_id)
        except Exception as e:
            log.error('bulk item %d/%d failed: %s', i+1, total, e)
            results.append({'artifact_name': art_name, 'ok': False, 'error': str(e)})

    return {'done': total, 'total': total, 'results': results}
