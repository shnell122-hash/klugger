import logging
from flask import Blueprint, jsonify, session
from tools.db import query
from routes.auth import require_login

dashboard_bp = Blueprint('dashboard', __name__)
log = logging.getLogger('dashboard')

MXN_PER_USD = 18.5
USER_MARKUP = 3.5


@dashboard_bp.route('/api/dashboard/costs')
@require_login
def costs():
    role    = session.get('user_role', 'user')
    user_id = session['user_id']

    if role == 'admin':
        # Vista admin: USD real + tokens, agrupado por usuario
        rows = query(
            """SELECT u.name, u.email, u.role,
                      COALESCE(SUM(au.input_tokens), 0)      AS total_input,
                      COALESCE(SUM(au.output_tokens), 0)     AS total_output,
                      COALESCE(SUM(au.cache_read_tokens), 0) AS total_cache,
                      COALESCE(SUM(au.cost_usd), 0)          AS total_usd
               FROM api_usage au
               LEFT JOIN users u ON au.user_id = u.user_id
               GROUP BY au.user_id
               ORDER BY total_usd DESC""",
            many=True
        ) or []

        grand_usd    = float(sum(r.get('total_usd') or 0 for r in rows))
        grand_input  = int(sum(r.get('total_input') or 0 for r in rows))
        grand_output = int(sum(r.get('total_output') or 0 for r in rows))
        grand_cache  = int(sum(r.get('total_cache') or 0 for r in rows))

        return jsonify({
            'role': 'admin',
            'rows': [{
                'name':         r.get('name') or r.get('email') or '(desconocido)',
                'email':        r.get('email') or '',
                'role':         r.get('role') or 'user',
                'total_input':  int(r.get('total_input') or 0),
                'total_output': int(r.get('total_output') or 0),
                'total_cache':  int(r.get('total_cache') or 0),
                'total_usd':    float(r.get('total_usd') or 0),
            } for r in rows],
            'grand_total_usd':    round(grand_usd, 6),
            'grand_input_tokens': grand_input,
            'grand_output_tokens': grand_output,
            'grand_cache_tokens': grand_cache,
        })

    else:
        # Usuario individual: MXN con markup ×3.5
        row = query(
            """SELECT COALESCE(SUM(input_tokens), 0)      AS total_input,
                      COALESCE(SUM(output_tokens), 0)     AS total_output,
                      COALESCE(SUM(cost_usd), 0)          AS total_usd
               FROM api_usage WHERE user_id=%s""",
            (user_id,)
        ) or {}

        cost_usd = float(row.get('total_usd') or 0)
        cost_mxn = round(cost_usd * USER_MARKUP * MXN_PER_USD, 2)

        return jsonify({
            'role':     'user',
            'cost_mxn': cost_mxn,
        })
