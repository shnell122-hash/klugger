#!/usr/bin/env python3
"""
balance_initializer.py — Lee el historial completo de Telegram via Telethon
y calcula el saldo inicial de cada cliente a partir de los mensajes reales.

Uso:
  python3 balance_initializer.py --chat -5135719373 --dry-run
  python3 balance_initializer.py --chat -5135719373

Estrategia:
  1. Itera TODOS los mensajes del chat (limitado por --limit, default=5000)
  2. Detecta cuadros de retorno (imágenes con Gemini OCR)
  3. Detecta operaciones de texto (IAS/SPEI con montos)
  4. Agrupa por sender_id → calcula saldo_neto acumulado
  5. Inserta/actualiza fin_clients y fin_operations (si --commit)

Notas:
  - Los comprobantes de pago (saldo a favor) suman al saldo
  - Las retiradas/SPEI (dinero enviado) restan
  - Estado: draft (no confirmado por admin hasta verificar)
"""

import argparse
import asyncio
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from client import get_client, env, read_backend_env

try:
    from telethon.tl.types import MessageMediaPhoto, MessageMediaDocument
except ImportError:
    print("Telethon no instalado. Corre: ./setup-venv.sh")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────

REAL_CHAT_IDS = [
    -5135719373,  # Operaciones G
    # Agregar LT cuando esté registrado
]

# Regex para montos en mensajes de texto: $1,234,567 o 1234567 o 1,234,567
MONTO_RE = re.compile(r'\$?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:pesos?|mxn)?', re.IGNORECASE)

# Palabras clave que indican operación de entrada (nómina/cobro)
ENTRADA_KW = ['ias', 'nómina', 'nomina', 'cuadro', 'retorno', 'cobro', 'deposito', 'depósito']
SALIDA_KW  = ['spei', 'transferencia', 'pago', 'envio', 'envío', 'efectivo', 'retiro']


def parse_monto(text: str) -> float | None:
    """Extrae el primer monto relevante del texto."""
    matches = MONTO_RE.findall(text or '')
    for m in matches:
        try:
            val = float(m.replace(',', ''))
            if val >= 1000:  # montos menores a $1,000 probablemente no son operaciones
                return val
        except ValueError:
            pass
    return None


def clasificar_mensaje(text: str) -> tuple[str | None, bool]:
    """Retorna (tipo_operacion, es_entrada) o (None, True) si no aplica."""
    text_l = (text or '').lower()
    if any(kw in text_l for kw in ENTRADA_KW):
        tipo = 'IAS' if 'ias' in text_l or 'cuadro' in text_l or 'retorno' in text_l else 'SPEI'
        return tipo, True
    if any(kw in text_l for kw in SALIDA_KW):
        return 'SPEI', False
    return None, True


async def leer_historial(chat_id: int, limit: int, account: str = 'gv'):
    """Retorna lista de mensajes del chat."""
    client = get_client(account)
    await client.start()
    print(f"[balance_init] Leyendo historial de chat {chat_id} (limit={limit})...")
    mensajes = []
    async for msg in client.iter_messages(chat_id, limit=limit):
        mensajes.append(msg)
    await client.disconnect()
    print(f"[balance_init] {len(mensajes)} mensajes leídos")
    return mensajes


def procesar_mensajes(mensajes) -> dict[int, dict]:
    """
    Procesa la lista de mensajes y acumula operaciones por sender_id.
    Retorna: {sender_id: {ops: [...], saldo_neto: float, nombre: str}}
    """
    senders: dict[int, dict] = {}

    for msg in reversed(mensajes):  # procesar en orden cronológico
        if not msg.sender_id or msg.out:
            continue  # ignorar mensajes del bot mismo

        sid = msg.sender_id
        if sid not in senders:
            nombre = ''
            if hasattr(msg, 'sender') and msg.sender:
                s = msg.sender
                nombre = getattr(s, 'first_name', '') or ''
                ln = getattr(s, 'last_name', '') or ''
                if ln:
                    nombre = f"{nombre} {ln}".strip()
            senders[sid] = {'nombre': nombre, 'ops': [], 'saldo_neto': 0.0}

        text = msg.text or msg.message or ''
        monto = parse_monto(text)
        tiene_media = msg.media is not None

        if monto and monto >= 1000:
            tipo, es_entrada = clasificar_mensaje(text)
            if tipo:
                op = {
                    'sender_id': sid,
                    'tipo_operacion': tipo,
                    'monto_neto': monto,
                    'es_entrada': es_entrada,
                    'fecha': msg.date.isoformat() if msg.date else None,
                    'texto': text[:200],
                    'tiene_media': tiene_media,
                }
                senders[sid]['ops'].append(op)
                senders[sid]['saldo_neto'] += monto if es_entrada else -monto

        elif tiene_media and not text:
            # Imagen sin texto — probablemente cuadro de retorno o comprobante
            op = {
                'sender_id': sid,
                'tipo_operacion': 'IAS',  # asumir IAS hasta que OCR confirme
                'monto_neto': 0.0,
                'es_entrada': True,
                'fecha': msg.date.isoformat() if msg.date else None,
                'texto': '[imagen sin parsear]',
                'tiene_media': True,
                'pendiente_ocr': True,
            }
            senders[sid]['ops'].append(op)

    return senders


def db_conn():
    import mysql.connector
    return mysql.connector.connect(
        host=env('DB_HOST', 'localhost'),
        user=env('DB_USER', 'root'),
        password=env('DB_PASS', '') or read_backend_env('DB_PASS'),
        database=env('DB_NAME', 'ai_monitoring'),
        charset='utf8mb4',
    )


def commit_resultados(chat_id: int, senders: dict, dry_run: bool):
    """Inserta/actualiza fin_clients con los saldos calculados."""
    if dry_run:
        print("\n[DRY RUN] No se escribirá a la DB. Resultados:\n")
        total_ops = sum(len(d['ops']) for d in senders.values())
        print(f"  {len(senders)} clientes | {total_ops} operaciones detectadas")
        for sid, data in senders.items():
            print(f"  user_id={sid} nombre={data['nombre']!r:<30} saldo_neto=${data['saldo_neto']:>14,.2f} ops={len(data['ops'])}")
            for op in data['ops'][:3]:
                print(f"    {op['tipo_operacion']} {'↑' if op['es_entrada'] else '↓'} ${op['monto_neto']:,.2f} {op['fecha'][:10] if op['fecha'] else '?'}")
            if len(data['ops']) > 3:
                print(f"    ... y {len(data['ops'])-3} más")
        return

    conn = db_conn()
    cur  = conn.cursor()
    try:
        for sid, data in senders.items():
            cur.execute(
                """INSERT INTO fin_clients (telegram_user_id, chat_id, nombre, saldo, saldo_neto, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, %s, NOW(3), NOW(3))
                   ON DUPLICATE KEY UPDATE
                     nombre = IF(nombre IS NULL OR nombre='', VALUES(nombre), nombre),
                     saldo  = VALUES(saldo),
                     saldo_neto = VALUES(saldo_neto),
                     updated_at = NOW(3)""",
                (sid, chat_id, data['nombre'] or None, data['saldo_neto'], data['saldo_neto'])
            )
        conn.commit()
        print(f"[balance_init] {len(senders)} clientes actualizados en fin_clients")
    finally:
        cur.close()
        conn.close()


async def main():
    parser = argparse.ArgumentParser(description='Inicializar saldos desde historial Telegram')
    parser.add_argument('--chat', type=int, required=True, help='chat_id del grupo')
    parser.add_argument('--limit', type=int, default=5000, help='Máx. mensajes a leer (default 5000)')
    parser.add_argument('--account', default='gv', help='Cuenta Telethon: gv | noela | kevin')
    parser.add_argument('--dry-run', action='store_true', help='No escribe a DB, solo muestra resultados')
    parser.add_argument('--commit', action='store_true', help='Escribe resultados a fin_clients')
    args = parser.parse_args()

    if args.chat not in REAL_CHAT_IDS:
        print(f"⚠️  chat_id {args.chat} no está en REAL_CHAT_IDS. Agrégalo si es un chat real.")
        print(f"   REAL_CHAT_IDS = {REAL_CHAT_IDS}")
        if not args.dry_run:
            sys.exit(1)

    mensajes  = await leer_historial(args.chat, args.limit, args.account)
    senders   = procesar_mensajes(mensajes)
    dry_run   = not args.commit
    commit_resultados(args.chat, senders, dry_run=dry_run)

    if dry_run and not args.commit:
        print("\n💡 Para escribir a DB: agrega --commit")


if __name__ == '__main__':
    asyncio.run(main())
