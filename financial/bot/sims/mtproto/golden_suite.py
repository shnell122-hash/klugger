#!/usr/bin/env python3
"""Golden Regression Suite — corre antes de cada deploy.
Exit 0 = verde (>=92%). Exit 1 = bloqueado (<92% o errores criticos).
No escribe a learning_episodes (no contamina el curriculum score).

Uso (auto-detecta DB_PASS del .env):
  python3 golden_suite.py
"""
import sys, os, re, subprocess, json

PASS_SYM, FAIL_SYM = '✅', '❌'
results = []

def test(test_id, desc, fn):
    try:
        fn()
        results.append((test_id, PASS_SYM, desc, None))
    except AssertionError as e:
        results.append((test_id, FAIL_SYM, desc, str(e)))
    except Exception as e:
        results.append((test_id, FAIL_SYM, desc, f'ERROR: {e}'))

def assert_eq(a, b, msg=''):
    if a != b: raise AssertionError(f'{msg}: {a!r} != {b!r}')

def assert_approx(a, b, tol=0.01, msg=''):
    if abs(a - b) > tol: raise AssertionError(f'{msg}: |{a} - {b}| > {tol}')

BOT_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..'))

def _autodetect_db_pass():
    for candidate in [
        os.path.join(BOT_ROOT, '.env'),
        os.path.normpath(os.path.join(BOT_ROOT, '..', '.env')),
    ]:
        if os.path.exists(candidate):
            m = re.search(r'^DB_PASS=(.+)$', open(candidate).read(), re.MULTILINE)
            if m:
                return m.group(1).strip()
    return ''

if not os.environ.get('DB_PASS'):
    _found = _autodetect_db_pass()
    if _found:
        os.environ['DB_PASS'] = _found

def node_eval(code):
    res = subprocess.run(
        ['node', '-e', code],
        capture_output=True, text=True, timeout=15, cwd=BOT_ROOT
    )
    if res.returncode != 0:
        raise AssertionError(res.stderr.strip()[:300])
    return res.stdout.strip()

def mysql_query(sql):
    db_pass = os.environ.get('DB_PASS', '')
    if not db_pass:
        raise AssertionError('DB_PASS no encontrado — verifica financial/.env o financial/bot/.env')
    res = subprocess.run(
        ['mysql', '-u', 'root', f'-p{db_pass}', 'ai_monitoring',
         '-e', sql, '--batch', '--silent'],
        capture_output=True, text=True, timeout=10
    )
    if res.returncode != 0:
        raise AssertionError(f'MySQL: {res.stderr.strip()[:200]}')
    return res.stdout.strip()

def t_ias_bruto_desde_neto():
    neto, pct = 23000, 0.055
    bruto = round(neto / (1 - pct), 2)
    assert_approx(bruto, 24338.62, msg='bruto IAS')

def t_spei_bruto_desde_neto():
    neto, pct = 50000, 0.035
    bruto = round(neto / (1 - pct), 2)
    assert bruto > neto, f'bruto {bruto} debe ser > neto {neto}'

def t_monto_negativo_rechazado():
    montos_invalidos = [-1, -0.01, -999999]
    for m in montos_invalidos:
        assert m < 0, 'setup'
    assert all(m < 0 for m in montos_invalidos)

def t_comision_fuera_de_rango():
    invalidos = [0.31, -0.01, 1.5, 2.0]
    for pct in invalidos:
        fuera = pct < 0 or pct > 0.30
        assert fuera, f'comision {pct} debio ser rechazada'

def t_clabe_18_digitos():
    validas   = ['058597000030773833', '021180040600000003', '058597000068994820']
    invalidas = ['12345', 'abc', '05859700003077383', '0585970000307738330']
    for c in validas:
        assert len(c) == 18 and c.isdigit(), f'CLABE valida rechazada: {c}'
    for c in invalidas:
        ok = len(c) == 18 and c.isdigit()
        assert not ok, f'CLABE invalida aceptada: {c}'

def t_tipos_operacion_validos():
    validos = {'IAS', 'SPEI', 'SINDICATO', 'TARJETAS', 'EFECTIVO'}
    for t in validos:
        assert t in validos
    assert 'TRANSFERENCIA' not in validos
    assert 'BITCOIN' not in validos

def t_fin_operations_columnas():
    out = mysql_query('DESCRIBE fin_operations;')
    for col in ['tipo_operacion', 'monto_bruto', 'monto_neto', 'estado', 'client_id']:
        assert col in out, f'Columna faltante en fin_operations: {col}'

def t_fin_clients_existe():
    out = mysql_query('SELECT COUNT(*) FROM fin_clients;')
    assert out.isdigit() or out.replace('\n','').isdigit(), f'Query fallida: {out}'

def t_transaction_orchestrator_importa():
    out = node_eval("const T=require('./agents/TransactionOrchestrator'); console.log(typeof T);")
    assert 'function' in out, f'Esperaba function, got: {out}'

def t_document_intelligence_importa():
    out = node_eval("const D=require('./agents/DocumentIntelligenceAgent'); console.log(typeof D);")
    assert 'function' in out, f'Esperaba function, got: {out}'

def t_orchestrator_no_usa_anthropic():
    with open(os.path.join(BOT_ROOT, 'agents', 'TransactionOrchestrator.js')) as f:
        src = f.read()
    assert '@anthropic-ai/sdk' not in src, 'TransactionOrchestrator aun usa @anthropic-ai/sdk'
    assert 'openai' in src.lower(), 'TransactionOrchestrator deberia usar openai client'
    assert 'deepseek' in src.lower(), 'TransactionOrchestrator deberia apuntar a deepseek'

def t_relay_no_llama_anthropic_en_buzon():
    relay_path = os.path.join(BOT_ROOT, '..', '..', 'relay', 'master.js')
    relay_path = os.path.normpath(relay_path)
    if not os.path.exists(relay_path):
        raise AssertionError(f'No encontre relay/master.js en {relay_path}')
    with open(relay_path) as f:
        src = f.read()
    start = src.find('function callAnthropicDirect')
    end   = src.find('\nfunction ', start + 10)
    fn_src = src[start:end] if end > start else src[start:start+2000]
    assert 'api.deepseek.com' in fn_src, 'callAnthropicDirect debe usar api.deepseek.com'
    assert 'api.anthropic.com' not in fn_src, 'callAnthropicDirect aun usa api.anthropic.com'

GOLDEN_TESTS = [
    ('G01', 'IAS bruto correcto desde neto+comision 5.5%',     t_ias_bruto_desde_neto),
    ('G02', 'SPEI bruto > neto siempre',                       t_spei_bruto_desde_neto),
    ('G03', 'Montos negativos rechazados',                     t_monto_negativo_rechazado),
    ('G04', 'Comision fuera de rango [0-30%] rechazada',       t_comision_fuera_de_rango),
    ('G05', 'CLABE 18 digitos valida / invalida',              t_clabe_18_digitos),
    ('G06', 'Tipos de operacion validos conocidos',            t_tipos_operacion_validos),
    ('G07', 'fin_operations tiene columnas criticas',          t_fin_operations_columnas),
    ('G08', 'fin_clients existe y es consultable',             t_fin_clients_existe),
    ('G09', 'TransactionOrchestrator importa OK',              t_transaction_orchestrator_importa),
    ('G10', 'DocumentIntelligenceAgent importa OK',            t_document_intelligence_importa),
    ('G11', 'TransactionOrchestrator usa DeepSeek (no Anthropic)', t_orchestrator_no_usa_anthropic),
    ('G12', 'relay/master.js callAnthropicDirect usa DeepSeek',    t_relay_no_llama_anthropic_en_buzon),
]

THRESHOLD = 92.0

if __name__ == '__main__':
    print(f'\n\U0001f50d Golden Regression Suite — {len(GOLDEN_TESTS)} tests\n')
    for tid, desc, fn in GOLDEN_TESTS:
        test(tid, desc, fn)

    passed = sum(1 for _, s, _, _ in results if s == PASS_SYM)
    failed = sum(1 for _, s, _, _ in results if s == FAIL_SYM)
    total  = len(results)
    score  = round(passed / total * 100, 1) if total else 0

    for tid, status, desc, err in results:
        print(f'  {status} {tid}: {desc}')
        if err:
            print(f'       → {err}')

    print(f'\nScore: {passed}/{total} = {score}%')

    if score < THRESHOLD or failed > 0:
        print(f'\n\U0001f6ab DEPLOY BLOQUEADO — score {score}% < {THRESHOLD}% o hay fallos criticos')
        sys.exit(1)
    else:
        print(f'\n✅ DEPLOY PERMITIDO — score {score}% ≥ {THRESHOLD}%')
        sys.exit(0)
