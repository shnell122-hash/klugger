import os, logging
from flask import Blueprint, jsonify, session
from tools.db import query
from routes.auth import require_login

dashboard_bp = Blueprint('dashboard', __name__)
log = logging.getLogger('dashboard')

MXN_PER_USD = 18.5
USER_MARKUP = 3.5


def _mask(key: str) -> str:
    if not key or len(key) < 8:
        return '(no configurada)'
    return key[:10] + '••••••••••••' + key[-4:]


@dashboard_bp.route('/api/dashboard/costs')
@require_login
def costs():
    role    = session.get('user_role', 'user')
    user_id = session['user_id']

    if role == 'admin':
        # ── Por usuario ───────────────────────────────────────────────
        rows = query(
            """SELECT u.name, u.email, u.role,
                      COALESCE(SUM(au.input_tokens), 0)      AS total_input,
                      COALESCE(SUM(au.output_tokens), 0)     AS total_output,
                      COALESCE(SUM(au.cache_read_tokens), 0) AS total_cache,
                      COALESCE(SUM(au.cost_usd), 0)          AS total_usd
               FROM users u
               LEFT JOIN api_usage au ON u.user_id = au.user_id
               GROUP BY u.user_id, u.name, u.email, u.role
               ORDER BY total_usd DESC""",
            many=True
        ) or []

        # ── Serie de tiempo (últimos 30 días) ─────────────────────────
        time_series = query(
            """SELECT DATE(created_at) AS day,
                      COALESCE(SUM(cost_usd), 0)                        AS cost_usd,
                      COALESCE(SUM(input_tokens + output_tokens), 0)     AS tokens
               FROM api_usage
               WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
               GROUP BY DATE(created_at)
               ORDER BY day ASC""",
            many=True
        ) or []

        # ── Por modelo ────────────────────────────────────────────────
        by_model = query(
            """SELECT model,
                      COALESCE(SUM(cost_usd), 0)             AS cost_usd,
                      COALESCE(SUM(input_tokens), 0)         AS input_tokens,
                      COALESCE(SUM(output_tokens), 0)        AS output_tokens
               FROM api_usage
               GROUP BY model
               ORDER BY cost_usd DESC""",
            many=True
        ) or []

        # ── Totales ───────────────────────────────────────────────────
        grand_usd     = float(sum(r.get('total_usd') or 0 for r in rows))
        grand_rev_usd = round(grand_usd * USER_MARKUP, 6)
        grand_rev_mxn = round(grand_usd * USER_MARKUP * MXN_PER_USD, 2)
        profit_usd    = round(grand_rev_usd - grand_usd, 6)
        margin_pct    = round((profit_usd / grand_rev_usd * 100) if grand_rev_usd > 0 else 0, 1)

        return jsonify({
            'role': 'admin',
            'totals': {
                'cost_usd':    round(grand_usd, 6),
                'revenue_usd': grand_rev_usd,
                'revenue_mxn': grand_rev_mxn,
                'profit_usd':  profit_usd,
                'margin_pct':  margin_pct,
                'input_tokens':  int(sum(r.get('total_input') or 0 for r in rows)),
                'output_tokens': int(sum(r.get('total_output') or 0 for r in rows)),
                'cache_tokens':  int(sum(r.get('total_cache') or 0 for r in rows)),
            },
            'rows': [{
                'name':         r.get('name') or r.get('email') or '(desconocido)',
                'email':        r.get('email') or '',
                'role':         r.get('role') or 'user',
                'total_input':  int(r.get('total_input') or 0),
                'total_output': int(r.get('total_output') or 0),
                'total_cache':  int(r.get('total_cache') or 0),
                'cost_usd':     round(float(r.get('total_usd') or 0), 6),
                'price_usd':    round(float(r.get('total_usd') or 0) * USER_MARKUP, 4),
                'price_mxn':    round(float(r.get('total_usd') or 0) * USER_MARKUP * MXN_PER_USD, 2),
            } for r in rows],
            'time_series': [{
                'day':      str(t.get('day') or ''),
                'cost_usd': round(float(t.get('cost_usd') or 0), 6),
                'tokens':   int(t.get('tokens') or 0),
            } for t in time_series],
            'by_model': [{
                'model':         m.get('model') or '(desconocido)',
                'cost_usd':      round(float(m.get('cost_usd') or 0), 6),
                'input_tokens':  int(m.get('input_tokens') or 0),
                'output_tokens': int(m.get('output_tokens') or 0),
            } for m in by_model],
            'api_keys': {
                'ANTHROPIC_API_KEY': _mask(os.getenv('ANTHROPIC_API_KEY', '')),
                'FAL_KEY':           _mask(os.getenv('FAL_KEY', '')),
                'OPENAI_API_KEY':    _mask(os.getenv('OPENAI_API_KEY', '')),
            },
        })

    else:
        # ── Vista usuario: MXN con markup ─────────────────────────────
        try:
            # Siempre resolver user_id desde email (fuente de verdad)
            user_email = session.get('user_email', '')
            user_row = query(
                "SELECT user_id FROM users WHERE email COLLATE utf8mb4_unicode_ci = %s",
                (user_email,)
            )
            if user_row:
                user_id = user_row['user_id']
            log.info('dashboard user_id=%s email=%s', user_id, user_email)

            totals = query(
                """SELECT COALESCE(SUM(input_tokens), 0)      AS total_input,
                          COALESCE(SUM(output_tokens), 0)     AS total_output,
                          COALESCE(SUM(cost_usd), 0)          AS total_usd
                   FROM api_usage WHERE user_id=%s""",
                (user_id,)
            ) or {}

            by_case = query(
                """SELECT c.case_name,
                          COALESCE(SUM(au.cost_usd), 0)                      AS cost_usd,
                          COALESCE(SUM(au.input_tokens + au.output_tokens), 0) AS tokens
                   FROM api_usage au
                   JOIN cases c ON au.case_id = c.case_id
                   WHERE au.user_id = %s
                   GROUP BY au.case_id, c.case_name
                   ORDER BY cost_usd DESC""",
                (user_id,), many=True
            ) or []

            cost_usd = float(totals.get('total_usd') or 0)
            return jsonify({
                'role':          'user',
                'input_tokens':  int(totals.get('total_input') or 0),
                'output_tokens': int(totals.get('total_output') or 0),
                'cost_mxn':      round(cost_usd * USER_MARKUP * MXN_PER_USD, 2),
                'by_case': [{
                    'case_name': c.get('case_name') or '',
                    'cost_mxn':  round(float(c.get('cost_usd') or 0) * USER_MARKUP * MXN_PER_USD, 2),
                    'tokens':    int(c.get('tokens') or 0),
                } for c in by_case],
            })
        except Exception as e:
            log.exception('dashboard user error user_id=%s', user_id)
            return jsonify({'error': str(e), 'role': 'user', 'input_tokens': 0,
                            'output_tokens': 0, 'cost_mxn': 0, 'by_case': []}), 200
