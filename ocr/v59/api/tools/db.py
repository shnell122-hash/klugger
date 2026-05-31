import os
import mysql.connector
from mysql.connector import pooling

_pool = None

def _get_pool():
    global _pool
    if _pool is None:
        _pool = pooling.MySQLConnectionPool(
            pool_name="vilar_v59",
            pool_size=10,
            host=os.getenv('DB_HOST', '127.0.0.1'),
            port=int(os.getenv('DB_PORT', 3306)),
            database=os.getenv('DB_NAME', 'vilar_legal_os'),
            user=os.getenv('DB_USER', 'vilar_legal'),
            password=os.getenv('DB_PASS', ''),
            charset='utf8mb4',
            collation='utf8mb4_0900_ai_ci',
            autocommit=True,
        )
    return _pool


def _serialize(row):
    """Convierte tipos no-JSON (datetime, Decimal, bytes) a str."""
    if row is None:
        return None
    import datetime, decimal
    out = {}
    for k, v in row.items():
        if isinstance(v, (datetime.datetime, datetime.date)):
            out[k] = v.isoformat()
        elif isinstance(v, decimal.Decimal):
            out[k] = float(v)
        elif isinstance(v, bytes):
            out[k] = v.decode('utf-8', errors='replace')
        else:
            out[k] = v
    return out


def query(sql: str, params=None, many: bool = False):
    """Ejecuta SELECT y retorna dict o lista de dicts."""
    conn = _get_pool().get_connection()
    cur = None
    try:
        cur = conn.cursor(dictionary=True, buffered=True)
        cur.execute(sql, params or ())
        if many:
            rows = cur.fetchall()
            return [_serialize(r) for r in rows]
        row = cur.fetchone()
        return _serialize(row)
    finally:
        if cur is not None:
            try: cur.close()
            except Exception: pass
        conn.close()


def execute(sql: str, params=None) -> int:
    """Ejecuta INSERT/UPDATE/DELETE, retorna lastrowid."""
    conn = _get_pool().get_connection()
    cur = None
    try:
        cur = conn.cursor()
        cur.execute(sql, params or ())
        conn.commit()
        return cur.lastrowid
    finally:
        if cur is not None:
            try: cur.close()
            except Exception: pass
        conn.close()
