# v60 - nueva funcionalidad
"""
BulkGeneratorAgent — generación síncrona y asíncrona de artefactos en lote (/masivo).
Modo sync:  ThreadPoolExecutor (hasta ~8 workers) — cae de ~100s a ~12s para 20 docs.
Modo async: threading.Thread + tabla MySQL bulk_tasks (sin Celery ni Redis).
"""
import json
import logging
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

from tools.db import execute, query
from tools.litellm_router import (
    TIER_REDACTION,
    TIER_ULTRA_CHEAP,
    extract_text,
    route_by_tier,
)

log = logging.getLogger('bulk_generator')


# ---------------------------------------------------------------------------
# Helpers internos
# ---------------------------------------------------------------------------

def _init_bulk_tasks_table():
    """Crea tabla bulk_tasks si no existe (idempotente)."""
    try:
        execute("""
            CREATE TABLE IF NOT EXISTS bulk_tasks (
                task_id      VARCHAR(36) PRIMARY KEY,
                case_id      VARCHAR(36),
                status       ENUM('PENDING','PROGRESS','SUCCESS','ERROR') DEFAULT 'PENDING',
                current_count INT DEFAULT 0,
                total_count  INT DEFAULT 0,
                result       JSON,
                error_msg    TEXT,
                created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_bt_case   (case_id),
                INDEX idx_bt_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
    except Exception as e:
        log.debug('bulk_tasks table check: %s', e)


def _generate_one(case_id, user_id, prompt, idx, artifact_type, base_name, tier):
    """Genera un solo artefacto. Llamado en paralelo desde generate_bulk_sync/_run_bulk_thread."""
    art_name = f'{base_name} #{idx + 1}'
    try:
        resp = route_by_tier(tier, [{'role': 'user', 'content': prompt}], max_tokens=4000)
        content = extract_text(resp)
        art_id = str(uuid.uuid4())
        execute(
            "INSERT INTO system_artifacts "
            "(artifact_id, case_id, artifact_name, artifact_type, content, created_by) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (art_id, case_id, art_name, artifact_type, content, user_id),
        )
        return {'artifact_id': art_id, 'artifact_name': art_name, 'ok': True, '_idx': idx}
    except Exception as e:
        log.error('bulk item %d failed: %s', idx + 1, e)
        return {'artifact_name': art_name, 'ok': False, 'error': str(e), '_idx': idx}


# ---------------------------------------------------------------------------
# API pública — modo síncrono
# ---------------------------------------------------------------------------

def generate_bulk_sync(case_id: str, user_id: str, prompts: list,
                       artifact_type: str = 'contract',
                       base_name: str = 'Documento') -> list:
    """
    Genera múltiples artefactos en paralelo (ThreadPoolExecutor).
    Retorna lista ordenada de {artifact_id?, artifact_name, ok, error?}.
    """
    tier = TIER_ULTRA_CHEAP if artifact_type in ('summary', 'checklist') else TIER_REDACTION
    max_workers = min(8, len(prompts))
    results = [None] * len(prompts)

    log.info('bulk_sync start case=%s count=%d workers=%d', case_id, len(prompts), max_workers)

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {
            pool.submit(_generate_one, case_id, user_id, p, i, artifact_type, base_name, tier): i
            for i, p in enumerate(prompts)
        }
        for fut in as_completed(futures):
            r = fut.result()
            results[r['_idx']] = r

    for r in results:
        r.pop('_idx', None)

    ok = sum(1 for r in results if r.get('ok'))
    log.info('bulk_sync done case=%s ok=%d/%d', case_id, ok, len(prompts))
    return results


# ---------------------------------------------------------------------------
# API pública — modo asíncrono (threading + MySQL)
# ---------------------------------------------------------------------------

def generate_bulk_async(case_id: str, user_id: str, prompts: list,
                        artifact_type: str = 'contract',
                        base_name: str = 'Documento') -> str:
    """
    Despacha generación masiva a un thread daemon con seguimiento en bulk_tasks.
    Retorna task_id para polling en /api/v1/bulk/status/<task_id>.
    """
    _init_bulk_tasks_table()
    task_id = str(uuid.uuid4())
    execute(
        "INSERT INTO bulk_tasks (task_id, case_id, status, current_count, total_count) "
        "VALUES (%s, %s, 'PENDING', %s, %s)",
        (task_id, case_id, 0, len(prompts)),
    )
    thread = threading.Thread(
        target=_run_bulk_thread,
        args=(task_id, case_id, user_id, prompts, artifact_type, base_name),
        daemon=True,
        name=f'bulk-{task_id[:8]}',
    )
    thread.start()
    log.info('bulk_async task_id=%s case=%s count=%d', task_id, case_id, len(prompts))
    return task_id


def _run_bulk_thread(task_id, case_id, user_id, prompts, artifact_type, base_name):
    """Worker del thread: genera en paralelo y actualiza bulk_tasks."""
    tier = TIER_ULTRA_CHEAP if artifact_type in ('summary', 'checklist') else TIER_REDACTION
    total = len(prompts)
    results = [None] * total

    try:
        execute("UPDATE bulk_tasks SET status='PROGRESS' WHERE task_id=%s", (task_id,))
        max_workers = min(6, total)

        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {
                pool.submit(_generate_one, case_id, user_id, p, i, artifact_type, base_name, tier): i
                for i, p in enumerate(prompts)
            }
            for fut in as_completed(futures):
                r = fut.result()
                results[r['_idx']] = r
                done = sum(1 for x in results if x is not None)
                execute(
                    "UPDATE bulk_tasks SET current_count=%s WHERE task_id=%s",
                    (done, task_id),
                )

        for r in results:
            r.pop('_idx', None)

        execute(
            "UPDATE bulk_tasks SET status='SUCCESS', current_count=%s, result=%s WHERE task_id=%s",
            (total, json.dumps(results), task_id),
        )
        log.info('bulk_thread task=%s done ok=%d/%d', task_id,
                 sum(1 for r in results if r.get('ok')), total)

    except Exception as e:
        log.error('bulk_thread task=%s failed: %s', task_id, e)
        execute(
            "UPDATE bulk_tasks SET status='ERROR', error_msg=%s WHERE task_id=%s",
            (str(e), task_id),
        )


# ---------------------------------------------------------------------------
# API pública — consulta de estado
# ---------------------------------------------------------------------------

def get_bulk_status(task_id: str) -> dict:
    """
    Consulta el estado de una tarea en bulk_tasks.
    Retorna: {state, current?, total?, status?, result?, error?}
    """
    _init_bulk_tasks_table()
    row = query(
        "SELECT status, current_count, total_count, result, error_msg "
        "FROM bulk_tasks WHERE task_id=%s",
        (task_id,),
    )
    if not row:
        return {'state': 'NOT_FOUND'}

    s = row['status']
    if s == 'PENDING':
        return {'state': 'PENDING', 'status': 'En cola…'}
    elif s == 'PROGRESS':
        return {
            'state':   'PROGRESS',
            'current': row['current_count'],
            'total':   row['total_count'],
            'status':  f"Generando {row['current_count']}/{row['total_count']}…",
        }
    elif s == 'SUCCESS':
        r = row['result']
        return {'state': 'SUCCESS', 'result': json.loads(r) if isinstance(r, str) else r}
    else:
        return {'state': 'ERROR', 'error': row['error_msg']}
