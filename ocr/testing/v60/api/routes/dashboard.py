import os, logging
from flask import Blueprint, jsonify, session
from tools.db import query
from routes.auth import require_login, ADMIN_EMAILS

dashboard_bp = Blueprint('dashboard', __name__)
log = logging.getLogger('dashboard')

MXN_PER_USD = 19.0
USER_MARKUP  = 5.5          # precio cliente = costo_real × 5.5 × 19


def _mask(key: str) -> str:
    if not key or len(key) < 8:
        return '(no configurada)'
    return key[:10] + '••••••••••••' + key[-4:]


def _pmxn(cost_usd) -> float:
    """Precio cliente MXN = costo_real_USD × markup × tipo_cambio."""
    return round(float(cost_usd or 0) * USER_MARKUP * MXN_PER_USD, 2)


@dashboard_bp.route('/api/dashboard/costs')
@dashboard_bp.route('/api/v1/dashboard')
@require_login
def costs():
    user_id    = session.get('user_id')
    user_email = session.get('user_email', '')
    is_master  = user_email in ADMIN_EMAILS
    is_sm      = session.get('is_sub_master', False)
    is_org_adm = session.get('is_org_admin', False)
    if is_master:
        return _admin_dashboard()
    if is_sm:
        return _sub_master_dashboard(user_id)
    if is_org_adm:
        return _org_admin_dashboard(user_id)
    return _user_dashboard(user_id)


# ── Admin ────────────────────────────────────────────────────────────────────

def _admin_dashboard():
    # 1. Por usuario + expediente
    uc = query(
        """SELECT u.user_id, u.name, u.email, u.role AS urole,
                  c.case_id, c.case_name,
                  COALESCE(SUM(au.input_tokens),0)  AS inp,
                  COALESCE(SUM(au.output_tokens),0) AS out_,
                  COALESCE(SUM(au.cost_usd),0)      AS cost_usd
           FROM users u
           LEFT JOIN api_usage au ON u.user_id = au.user_id
           LEFT JOIN cases c ON au.case_id COLLATE utf8mb4_unicode_ci = c.case_id
           GROUP BY u.user_id, u.name, u.email, u.role, c.case_id, c.case_name
           ORDER BY u.email, cost_usd DESC""",
        many=True
    ) or []

    # 2. Series de tiempo — últimos 30 días
    ts = query(
        """SELECT au.user_id,
                  au.case_id COLLATE utf8mb4_unicode_ci AS case_id,
                  DATE(au.created_at)                   AS day,
                  COALESCE(SUM(au.cost_usd),0)                          AS cost_usd,
                  COALESCE(SUM(au.input_tokens+au.output_tokens),0)      AS tokens
           FROM api_usage au
           WHERE au.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
           GROUP BY au.user_id, case_id, day
           ORDER BY day""",
        many=True
    ) or []

    # 3. Artefactos por expediente + tipo
    arts = query(
        """SELECT case_id, artifact_type, COUNT(*) AS cnt
           FROM system_artifacts
           GROUP BY case_id, artifact_type""",
        many=True
    ) or []

    # Índices auxiliares
    ts_idx = {}   # ts_idx[uid][cid] = [{day,cost_usd,price_mxn,tokens}]
    for r in ts:
        uid  = r['user_id']
        cid  = r['case_id'] or ''
        cost = float(r['cost_usd'] or 0)
        ts_idx.setdefault(uid, {}).setdefault(cid, []).append({
            'day':      str(r['day']),
            'cost_usd': cost,
            'price_mxn': _pmxn(cost),
            'tokens':    int(r['tokens'] or 0),
        })

    art_idx = {}  # art_idx[cid] = [{type, count}]
    for r in arts:
        art_idx.setdefault(r['case_id'] or '', []).append(
            {'type': r['artifact_type'], 'count': int(r['cnt'])}
        )

    # Agrupar por usuario
    users = {}
    for r in uc:
        uid  = r['user_id']
        cid  = r['case_id'] or ''
        cost = float(r['cost_usd'] or 0)
        inp  = int(r['inp']  or 0)
        out_ = int(r['out_'] or 0)
        if uid not in users:
            users[uid] = {
                'email':         r['email'] or '',
                'name':          r['name'] or r['email'] or '',
                'role':          r['urole'] or 'user',
                'cost_usd':      0.0,
                'input_tokens':  0,
                'output_tokens': 0,
                'by_case':       [],
            }
        users[uid]['cost_usd']      += cost
        users[uid]['input_tokens']  += inp
        users[uid]['output_tokens'] += out_
        if cost > 0:
            users[uid]['by_case'].append({
                'case_id':     cid,
                'case_name':   r['case_name'] or '(sin expediente)',
                'cost_usd':    round(cost, 6),
                'price_mxn':   _pmxn(cost),
                'tokens':      inp + out_,
                'time_series': ts_idx.get(uid, {}).get(cid, []),
                'artifacts':   art_idx.get(cid, []),
            })

    by_user = sorted(users.values(), key=lambda u: u['cost_usd'], reverse=True)
    grand   = sum(u['cost_usd'] for u in by_user)

    return jsonify({
        'role': 'admin',
        'totals': {
            'cost_usd':      round(grand, 6),
            'price_mxn':     _pmxn(grand),
            'markup':        USER_MARKUP,
            'fx':            MXN_PER_USD,
            'input_tokens':  sum(u['input_tokens']  for u in by_user),
            'output_tokens': sum(u['output_tokens'] for u in by_user),
        },
        'by_user': [{
            **u,
            'cost_usd':  round(u['cost_usd'], 6),
            'price_mxn': _pmxn(u['cost_usd']),
        } for u in by_user],
        'api_keys': {k: _mask(os.getenv(k, ''))
                     for k in ('ANTHROPIC_API_KEY', 'FAL_KEY', 'OPENAI_API_KEY')},
    })


# ── Usuario ──────────────────────────────────────────────────────────────────

def _user_dashboard(user_id):
    log.info('dashboard user session_uid=%s', user_id)

    totals = query(
        """SELECT COALESCE(SUM(au.input_tokens),0)  AS total_input,
                  COALESCE(SUM(au.output_tokens),0) AS total_output,
                  COALESCE(SUM(au.cost_usd),0)      AS total_usd
           FROM api_usage au
           INNER JOIN users u ON au.user_id = u.user_id
           WHERE u.user_id = %s""",
        (user_id,)
    ) or {}

    by_case_rows = query(
        """SELECT c.case_id, c.case_name,
                  COALESCE(SUM(au.cost_usd),0)                      AS cost_usd,
                  COALESCE(SUM(au.input_tokens+au.output_tokens),0)  AS tokens
           FROM api_usage au
           INNER JOIN users u ON au.user_id = u.user_id
           JOIN cases c ON au.case_id COLLATE utf8mb4_unicode_ci = c.case_id
           WHERE u.user_id = %s
           GROUP BY c.case_id, c.case_name
           ORDER BY cost_usd DESC""",
        (user_id,), many=True
    ) or []

    ts_rows = query(
        """SELECT au.case_id COLLATE utf8mb4_unicode_ci AS case_id,
                  DATE(au.created_at)                   AS day,
                  COALESCE(SUM(au.cost_usd),0)                     AS cost_usd,
                  COALESCE(SUM(au.input_tokens+au.output_tokens),0) AS tokens
           FROM api_usage au
           INNER JOIN users u ON au.user_id = u.user_id
           WHERE u.user_id = %s
             AND au.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
           GROUP BY case_id, day
           ORDER BY day""",
        (user_id,), many=True
    ) or []

    case_ids = [r['case_id'] for r in by_case_rows if r.get('case_id')]
    art_rows = []
    if case_ids:
        ph = ','.join(['%s'] * len(case_ids))
        art_rows = query(
            f"SELECT case_id, artifact_type, COUNT(*) AS cnt "
            f"FROM system_artifacts WHERE case_id IN ({ph}) "
            f"GROUP BY case_id, artifact_type",
            tuple(case_ids), many=True
        ) or []

    ts_idx = {}
    for r in ts_rows:
        cid  = r['case_id']
        cost = float(r['cost_usd'] or 0)
        ts_idx.setdefault(cid, []).append({
            'day':       str(r['day']),
            'price_mxn': _pmxn(cost),
            'tokens':    int(r['tokens'] or 0),
        })

    art_idx = {}
    for r in art_rows:
        art_idx.setdefault(r['case_id'], []).append(
            {'type': r['artifact_type'], 'count': int(r['cnt'])}
        )

    cost_usd = float(totals.get('total_usd') or 0)
    log.info('dashboard totals cost_usd=%.6f price_mxn=%.2f', cost_usd, _pmxn(cost_usd))

    return jsonify({
        'role':          'user',
        'input_tokens':  int(totals.get('total_input')  or 0),
        'output_tokens': int(totals.get('total_output') or 0),
        'price_mxn':     _pmxn(cost_usd),
        'by_case': [{
            'case_id':     r['case_id'],
            'case_name':   r['case_name'] or '',
            'price_mxn':   _pmxn(r['cost_usd']),
            'tokens':      int(r['tokens'] or 0),
            'time_series': ts_idx.get(r['case_id'], []),
            'artifacts':   art_idx.get(r['case_id'], []),
        } for r in by_case_rows],
    })


# ── Org Admin ────────────────────────────────────────────────────────────────

def _org_admin_dashboard(user_id):
    """Dashboard para org admin: ve todos los usuarios de su org con desglose."""
    row = query("SELECT org_id FROM users WHERE user_id=%s", (user_id,))
    org_id = (row or {}).get('org_id')
    if not org_id:
        return _user_dashboard(user_id)

    usage = query(
        """SELECT u.user_id, u.name, u.email,
                  c.case_id, c.case_name,
                  COALESCE(SUM(au.input_tokens),0)  AS inp,
                  COALESCE(SUM(au.output_tokens),0) AS out_,
                  COALESCE(SUM(au.cost_usd),0)      AS cost_usd
           FROM api_usage au
           JOIN users u ON au.user_id = u.user_id
           LEFT JOIN cases c ON au.case_id COLLATE utf8mb4_unicode_ci = c.case_id
           WHERE u.org_id = %s
           GROUP BY u.user_id, u.name, u.email, c.case_id, c.case_name
           ORDER BY cost_usd DESC""",
        (org_id,), many=True
    ) or []

    case_ids = list({r['case_id'] for r in usage if r.get('case_id')})
    art_idx  = _fetch_artifact_idx(case_ids)

    users = {}
    for r in usage:
        uid  = r['user_id']
        cid  = r['case_id'] or ''
        cost = float(r['cost_usd'] or 0)
        inp  = int(r['inp']  or 0)
        out_ = int(r['out_'] or 0)
        if uid not in users:
            users[uid] = {'email': r['email'] or '', 'name': r['name'] or r['email'] or '',
                          'cost_usd': 0.0, 'price_mxn': 0.0,
                          'input_tokens': 0, 'output_tokens': 0, 'by_case': []}
        users[uid]['cost_usd']      += cost
        users[uid]['price_mxn']     += _pmxn(cost)
        users[uid]['input_tokens']  += inp
        users[uid]['output_tokens'] += out_
        if cost > 0:
            users[uid]['by_case'].append({
                'case_id':   cid,
                'case_name': r['case_name'] or '(sin expediente)',
                'price_mxn': _pmxn(cost),
                'tokens':    inp + out_,
                'artifacts': art_idx.get(cid, []),
            })

    by_user = sorted(users.values(), key=lambda u: u['cost_usd'], reverse=True)
    grand   = sum(u['cost_usd'] for u in by_user)
    return jsonify({
        'role':    'org_admin',
        'totals':  {
            'price_mxn':     _pmxn(grand),
            'input_tokens':  sum(u['input_tokens']  for u in by_user),
            'output_tokens': sum(u['output_tokens'] for u in by_user),
        },
        'by_user': [{
            'email':         u['email'],
            'name':          u['name'],
            'price_mxn':     round(u['price_mxn'], 2),
            'input_tokens':  u['input_tokens'],
            'output_tokens': u['output_tokens'],
            'by_case':       u['by_case'],
        } for u in by_user],
    })


# ── Sub Master ───────────────────────────────────────────────────────────────

def _fetch_artifact_idx(case_ids):
    """Devuelve dict case_id → [{type, count}] para los case_ids dados."""
    if not case_ids:
        return {}
    ph = ','.join(['%s'] * len(case_ids))
    arts = query(
        f"SELECT case_id, artifact_type, COUNT(*) AS cnt "
        f"FROM system_artifacts WHERE case_id IN ({ph}) GROUP BY case_id, artifact_type",
        tuple(case_ids), many=True
    ) or []
    idx = {}
    for r in arts:
        idx.setdefault(r['case_id'], []).append({'type': r['artifact_type'], 'count': int(r['cnt'])})
    return idx


def _sub_master_dashboard(sm_id):
    """Dashboard para sub master admin: solo MXN, nunca expone tasas ni cost_usd."""
    rates = query(
        "SELECT cost_mxn_per_usd, price_mxn_per_usd FROM sub_master_rates WHERE sub_master_id=%s",
        (sm_id,)
    ) or {}
    cost_rate  = float(rates.get('cost_mxn_per_usd')  or MXN_PER_USD)
    price_rate = float(rates.get('price_mxn_per_usd') or MXN_PER_USD * USER_MARKUP)

    # Orgs asignadas por el master + la propia org del sub master
    orgs = query(
        "SELECT org_id, org_name FROM organizations WHERE sub_master_id=%s AND is_active=1 ORDER BY org_name",
        (sm_id,), many=True
    ) or []
    own_row    = query("SELECT org_id FROM users WHERE user_id=%s", (sm_id,))
    own_org_id = (own_row or {}).get('org_id')
    assigned_ids = {o['org_id'] for o in orgs}
    if own_org_id and own_org_id not in assigned_ids:
        own_org_row = query(
            "SELECT org_id, org_name FROM organizations WHERE org_id=%s AND is_active=1",
            (own_org_id,)
        )
        if own_org_row:
            orgs.append(own_org_row)

    if not orgs:
        # Sin ninguna org asignada — mostrar propio consumo como fallback
        return _user_dashboard(sm_id)

    org_ids = [o['org_id'] for o in orgs]
    ph = ','.join(['%s'] * len(org_ids))

    usage = query(
        f"""SELECT u.user_id, u.name, u.email, u.org_id,
                   c.case_id, c.case_name,
                   COALESCE(SUM(au.input_tokens),0)  AS inp,
                   COALESCE(SUM(au.output_tokens),0) AS out_,
                   COALESCE(SUM(au.cost_usd),0)      AS cost_usd
            FROM api_usage au
            JOIN users u ON au.user_id = u.user_id
            LEFT JOIN cases c ON au.case_id COLLATE utf8mb4_unicode_ci = c.case_id
            WHERE u.org_id IN ({ph})
            GROUP BY u.user_id, u.name, u.email, u.org_id, c.case_id, c.case_name""",
        tuple(org_ids), many=True
    ) or []

    # También incluir consumo propio del sub master si no está en ninguna org
    self_in_orgs = any(r['user_id'] == sm_id for r in usage)
    if not self_in_orgs:
        self_usage = query(
            """SELECT %s AS user_id, u.name, u.email, u.org_id,
                      c.case_id, c.case_name,
                      COALESCE(SUM(au.input_tokens),0)  AS inp,
                      COALESCE(SUM(au.output_tokens),0) AS out_,
                      COALESCE(SUM(au.cost_usd),0)      AS cost_usd
               FROM api_usage au
               JOIN users u ON au.user_id = u.user_id
               LEFT JOIN cases c ON au.case_id COLLATE utf8mb4_unicode_ci = c.case_id
               WHERE au.user_id = %s
               GROUP BY u.name, u.email, u.org_id, c.case_id, c.case_name""",
            (sm_id, sm_id), many=True
        ) or []
        usage = usage + self_usage

    # Artifact breakdown por case
    case_ids = list({r['case_id'] for r in usage if r.get('case_id')})
    art_idx  = _fetch_artifact_idx(case_ids)

    org_map = {o['org_id']: {'org_name': o['org_name'], 'costo': 0.0, 'precio': 0.0, 'users': {}}
               for o in orgs}
    # Bucket para consumo sin org asignada
    org_map.setdefault('__self__', {'org_name': 'Consumo propio', 'costo': 0.0, 'precio': 0.0, 'users': {}})

    for r in usage:
        oid  = r.get('org_id') or '__self__'
        if oid not in org_map:
            oid = '__self__'
        uid  = r['user_id']
        cost = float(r['cost_usd'] or 0)
        costo  = cost * cost_rate
        precio = cost * price_rate
        om = org_map[oid]
        om['costo']  += costo
        om['precio'] += precio
        cid = r['case_id'] or ''
        ud  = om['users'].setdefault(uid, {'name': r['name'] or r['email'] or '',
                                           'email': r['email'] or '',
                                           'costo': 0.0, 'precio': 0.0, 'tokens': 0,
                                           'by_case': []})
        ud['costo']  += costo
        ud['precio'] += precio
        ud['tokens'] += int(r['inp'] or 0) + int(r['out_'] or 0)
        if cost > 0:
            ud['by_case'].append({
                'case_id':   cid,
                'case_name': r.get('case_name') or '(sin expediente)',
                'costo_mxn': round(costo, 2),
                'precio_mxn': round(precio, 2),
                'tokens':    int(r['inp'] or 0) + int(r['out_'] or 0),
                'artifacts': art_idx.get(cid, []),
            })

    orgs_out, total_c, total_p = [], 0.0, 0.0
    for oid, od in org_map.items():
        if od['costo'] == 0 and oid == '__self__':
            continue   # omitir bucket vacío
        c, p = round(od['costo'], 2), round(od['precio'], 2)
        total_c += c; total_p += p
        orgs_out.append({
            'org_id':       oid,
            'org_name':     od['org_name'],
            'costo_mxn':    c,
            'precio_mxn':   p,
            'utilidad_mxn': round(p - c, 2),
            'users': sorted([{
                'name':         u['name'],
                'email':        u['email'],
                'costo_mxn':    round(u['costo'], 2),
                'precio_mxn':   round(u['precio'], 2),
                'utilidad_mxn': round(u['precio'] - u['costo'], 2),
                'tokens':       u['tokens'],
                'by_case':      u['by_case'],
            } for u in od['users'].values()],
            key=lambda x: x['costo_mxn'], reverse=True),
        })
    orgs_out.sort(key=lambda o: o['costo_mxn'], reverse=True)

    return jsonify({
        'role': 'sub_master',
        'totals': {
            'costo_mxn':    round(total_c, 2),
            'precio_mxn':   round(total_p, 2),
            'utilidad_mxn': round(total_p - total_c, 2),
        },
        'orgs': orgs_out,
    })
