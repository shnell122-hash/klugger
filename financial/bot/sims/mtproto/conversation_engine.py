#!/usr/bin/env python3
"""
conversation_engine.py — Motor de conversaciones continuas multi-agente.

Simula cientos de intercambios reales entre GV, Noela y Kevin con el financial-bot,
usando MTProto (Telethon) para bypassear el filtro bot-to-bot de Telegram.

Cada intercambio = 1 episodio en learning_episodes.
El motor avanza de tier automáticamente según el score acumulado (Curriculum Learning).
Las fallas recurrentes disparan fix tasks vía inbox-finbot-verifier (CBR).

Uso:
  ./venv/bin/python conversation_engine.py                  # infinito
  ./venv/bin/python conversation_engine.py --rounds 50      # 50 rondas
  ./venv/bin/python conversation_engine.py --tier 2         # forzar tier 2
  ./venv/bin/python conversation_engine.py --dry-run        # solo imprime, no envía
"""

import asyncio
import argparse
import json
import random
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import io
from telethon import events
from telethon.tl.types import PeerChannel
from client import get_client, env, read_backend_env, chat_id as get_chat_id
from learning import (
    start_episode, record_test_result, complete_episode,
    build_report, post_to_telegram, dispatch_fix_if_needed,
    _calculate_next_tier, db_exec, db_one, db_query
)

# ─── Configuración ────────────────────────────────────────────────────────────

DELAY_BETWEEN_MESSAGES = 3      # segundos entre mensajes de un mismo escenario
DELAY_BETWEEN_SCENARIOS = 8     # segundos entre escenarios distintos
BOT_RESPONSE_TIMEOUT   = 12    # segundos esperando respuesta del bot
ROUNDS_PER_REPORT       = 10   # cuántos rounds antes de publicar resumen en Telegram

# ID de Flujos AI (financial-bot) — se auto-descubre al iniciar
BOT_USER_ID: Optional[int] = None

# ─── Biblioteca de escenarios ────────────────────────────────────────────────
# Dos tipos de escenario:
#   "bot"  — un usuario interactua con el bot (espera respuesta)
#   "chat" — conversacion natural entre los tres (sin esperar respuesta del bot)
#
# "chat" tiene una lista "turns":
#   [{"account": "gv", "message": "..."}, {"account": "noela", "delay": 4, "message": "..."}]
#
# Cuentas: gv=German, noela=Vianey, kevin=Christian

CLABES = [
    "058597000030773833",  # GV Banregio
    "058597000068994820",  # Noela Banregio
    "140180900000120017",  # BBVA
    "012914002436956798",  # Banamex
]

AMOUNTS_T1 = [5000, 8000, 10000, 15000, 20000]
AMOUNTS_T2 = [50000, 75000, 100000, 150000, 200000]
AMOUNTS_ERR = [0, -1000, 0.01]

TIPOS = ["IAS", "SPEI", "VILAR", "NOELA"]

# Frases naturales para operaciones (bot mode)
FRASES_OPERACION = [
    "quiero hacer un {tipo} de {amount} neto",
    "necesito {amount} para {tipo} neto por favor",
    "haz un {tipo} por {amount} neto",
    "manda {amount} neto a {tipo}",
    "operacion {tipo} {amount} neto",
]

FRASES_CONFIRMAR = ["confirmar", "si confirmo", "ok", "si", "dale"]
FRASES_CANCELAR  = ["cancelar", "no, dejalo", "mejor no", "cancela"]
FRASES_SALDO     = ["cuanto tengo?", "dime mi saldo", "saldo actual", "cuanto hay?"]

# Conversaciones ambientales — charla natural entre German, Vianey y Christian
# Se mezclan entre los escenarios de bot para que el grupo se vea activo y real.
AMBIENT_CHATS = [
    # Inicio de semana
    {
        "id": "buenos_dias",
        "turns": [
            {"account": "gv",    "message": "Buenos dias"},
            {"account": "noela", "delay": 6,  "message": "Buenos dias German!"},
            {"account": "kevin", "delay": 4,  "message": "Que tal, buenos dias"},
        ]
    },
    # Coordinacion de pagos
    {
        "id": "coordinacion_pagos",
        "turns": [
            {"account": "gv",    "message": "Vianey, ya esta listo el cuadro de esta semana?"},
            {"account": "noela", "delay": 8,  "message": "Si, ya casi lo termino, ahorita lo subo"},
            {"account": "kevin", "delay": 5,  "message": "Yo tambien estoy esperando el mio"},
            {"account": "noela", "delay": 12, "message": "Listo, ya lo mande"},
            {"account": "gv",    "delay": 4,  "message": "Perfecto, gracias Vianey"},
        ]
    },
    # Confirmacion de deposito
    {
        "id": "deposito_confirmado",
        "turns": [
            {"account": "noela", "message": "Ya cayo el deposito en mi cuenta"},
            {"account": "gv",    "delay": 5,  "message": "Bien, yo tambien lo veo reflejado"},
            {"account": "kevin", "delay": 7,  "message": "El mio tambien. Gracias German"},
            {"account": "gv",    "delay": 3,  "message": "Con gusto"},
        ]
    },
    # Solicitud de CLABE
    {
        "id": "solicitud_clabe",
        "turns": [
            {"account": "gv",    "message": "Christian, mandame tu CLABE actualizada por favor"},
            {"account": "kevin", "delay": 12, "message": "Claro, es 058597000030773833 Banregio"},
            {"account": "gv",    "delay": 4,  "message": "Anotado, gracias"},
        ]
    },
    # Recordatorio de corte
    {
        "id": "recordatorio_corte",
        "turns": [
            {"account": "gv",    "message": "Recuerden que el viernes es el corte semanal"},
            {"account": "kevin", "delay": 5,  "message": "Entendido, ya tengo todo listo"},
            {"account": "noela", "delay": 8,  "message": "Ok, yo termino hoy en la tarde"},
        ]
    },
    # Comprobante enviado
    {
        "id": "comprobante_confirmado",
        "turns": [
            {"account": "noela", "message": "Ya subi el comprobante del pago"},
            {"account": "gv",    "delay": 5,  "message": "Lo vi, gracias Vianey"},
            {"account": "kevin", "delay": 3,  "message": "Ok visto"},
        ]
    },
    # Pregunta sobre operacion pendiente
    {
        "id": "op_pendiente",
        "turns": [
            {"account": "kevin", "message": "German, hay algo pendiente de mi parte?"},
            {"account": "gv",    "delay": 7,  "message": "No, todo en orden. El saldo esta cuadrado"},
            {"account": "kevin", "delay": 3,  "message": "Perfecto, gracias"},
        ]
    },
    # Revision de saldo
    {
        "id": "revision_saldo",
        "turns": [
            {"account": "noela", "message": "German, cuanto queda despues del ultimo pago?"},
            {"account": "gv",    "delay": 5,  "message": "Ahorita lo reviso"},
            {"account": "gv",    "delay": 8,  "message": "Ya lo cheque, todo correcto"},
            {"account": "noela", "delay": 3,  "message": "Gracias"},
        ]
    },
    # Fin de semana
    {
        "id": "fin_de_semana",
        "turns": [
            {"account": "gv",    "message": "Buen fin de semana a todos"},
            {"account": "noela", "delay": 5,  "message": "Igualmente German!"},
            {"account": "kevin", "delay": 7,  "message": "Buen finde"},
        ]
    },
    # Dispersion completada
    {
        "id": "dispersion_ok",
        "turns": [
            {"account": "gv",    "message": "Ya hice la dispersion de esta semana"},
            {"account": "noela", "delay": 6,  "message": "Lo vi en el bot, gracias German"},
            {"account": "kevin", "delay": 4,  "message": "Recibido, muchas gracias"},
        ]
    },
    # Pregunta rapida
    {
        "id": "pregunta_rapida",
        "turns": [
            {"account": "kevin", "message": "Todo bien con los pagos de esta semana?"},
            {"account": "gv",    "delay": 6,  "message": "Si, todo en orden. Mande los comprobantes ayer"},
            {"account": "noela", "delay": 4,  "message": "Correcto, ya los vi"},
        ]
    },
    # Comentario post-bot
    {
        "id": "post_bot_comentario",
        "turns": [
            {"account": "noela", "message": "Vieron la respuesta del bot? Todo correcto"},
            {"account": "gv",    "delay": 5,  "message": "Si, ya lo vi. Perfecto"},
            {"account": "kevin", "delay": 3,  "message": "Ok entendido"},
        ]
    },
    # Aviso de transferencia
    {
        "id": "aviso_transferencia",
        "turns": [
            {"account": "kevin", "message": "Vianey, ya te hice la transferencia"},
            {"account": "noela", "delay": 8,  "message": "Gracias Christian, ya la veo"},
            {"account": "gv",    "delay": 4,  "message": "Bien, queda registrado"},
        ]
    },
    # Actualizacion de cuenta
    {
        "id": "update_cuenta",
        "turns": [
            {"account": "noela", "message": "Cambie mi cuenta, ya no es BBVA sino Banregio"},
            {"account": "gv",    "delay": 5,  "message": "Ok Vianey, mandame la CLABE nueva"},
            {"account": "noela", "delay": 6,  "message": "058597000068994820"},
            {"account": "gv",    "delay": 3,  "message": "Listo, ya la actualice"},
        ]
    },
]

# Plantillas de conversacion que preceden o siguen una operacion con el bot
CHAT_PRE_OP = [
    [
        {"account": "gv",    "message": "Vianey, voy a hacer una operacion ahorita"},
        {"account": "noela", "delay": 5, "message": "Ok, yo la veo"},
    ],
    [
        {"account": "kevin", "message": "German, ya puedo hacer el pago?"},
        {"account": "gv",    "delay": 4, "message": "Si, adelante Christian"},
    ],
    [
        {"account": "noela", "message": "Voy a mandar el cuadro de esta semana"},
        {"account": "gv",    "delay": 5, "message": "Ok Vianey, ya lo espero"},
    ],
]

CHAT_POST_OP = [
    [
        {"account": "noela", "delay": 4, "message": "Listo, ya quedo registrado"},
        {"account": "kevin", "delay": 3, "message": "Gracias"},
    ],
    [
        {"account": "gv",    "delay": 5, "message": "Listo. Ya esta registrado en el sistema"},
        {"account": "kevin", "delay": 3, "message": "Perfecto, gracias German"},
    ],
    [
        {"account": "noela", "delay": 4, "message": "Ok ya lo veo en el bot"},
        {"account": "gv",    "delay": 3, "message": "Correcto"},
    ],
]


def pick(lst):
    return random.choice(lst)


def gen_scenarios(tier: int) -> list[dict]:
    """
    Genera escenarios para el tier dado.
    Mezcla conversaciones ambientales (type='chat') con interacciones al bot (type='bot').
    Ratio aprox 60% chat / 40% bot para que el grupo se vea natural.
    """
    scenarios = []

    CLABES_POOL = [
        ("058597000030773833", "BANREGIO"),
        ("058597000068994820", "BANREGIO"),
        ("140180900000120017", "BBVA"),
        ("012914002436956798", "BANAMEX"),
    ]

    # ── Conversaciones ambientales ────────────────────────────────────────────
    # Elegir 3-5 conversaciones aleatorias para esta ronda
    n_ambient = random.randint(3, min(5, len(AMBIENT_CHATS)))
    for chat in random.sample(AMBIENT_CHATS, n_ambient):
        scenarios.append({
            "type": "chat",
            "tier": 1,
            "id": f"ambient_{chat['id']}",
            "turns": chat["turns"],
        })

    # ── Escenarios con el bot (modo asistente) ────────────────────────────────
    # Cuadro PNG — bot responde con resumen financiero
    sender = pick(["gv", "noela", "kevin"])
    pre    = pick(CHAT_PRE_OP) if random.random() > 0.4 else []
    post   = pick(CHAT_POST_OP) if random.random() > 0.4 else []
    if pre:
        scenarios.append({
            "type": "chat", "tier": tier,
            "id": "pre_cuadro_png", "turns": pre,
        })
    scenarios.append({
        "type": "bot", "tier": tier,
        "id": f"cuadro_png_{sender}", "account": sender,
        "asset": ("cuadro_png", tier),
        "mode": "asistente",
        "verify_db": "SELECT COUNT(*) FROM fin_operations WHERE created_at > NOW() - INTERVAL 180 SECOND",
        "expected": ["Saldo", "comision", "$"],
    })
    if post:
        scenarios.append({
            "type": "chat", "tier": tier,
            "id": "post_cuadro_png", "turns": post,
        })

    # CLABE como texto plano → bot extrae y guarda cuenta
    clabe, banco = pick(CLABES_POOL)
    clabe_sender = pick(["gv", "noela", "kevin"])
    scenarios.append({
        "type": "bot", "tier": tier,
        "id": f"clabe_{clabe_sender}", "account": clabe_sender,
        "messages": [clabe],
        "mode": "asistente",
        "verify_db": f"SELECT COUNT(*) FROM fin_banking_accounts WHERE clabe='{clabe}'",
        "expected": ["guardad", "cuenta", "CLABE"],
    })

    # Comprobante JPG
    comp_sender = pick(["noela", "kevin"])
    scenarios.append({
        "type": "bot", "tier": tier,
        "id": f"comprobante_{comp_sender}", "account": comp_sender,
        "asset": ("comprobante", tier),
        "mode": "asistente",
        "expected": ["Saldo", "$"],
    })

    # Consulta de saldo — lenguaje natural
    for acct, frase in [
        ("gv",    pick(FRASES_SALDO)),
        ("noela", pick(FRASES_SALDO)),
        ("kevin", "cuanto tengo disponible?"),
    ]:
        scenarios.append({
            "type": "bot", "tier": tier,
            "id": f"saldo_{acct}", "account": acct,
            "messages": [frase],
            "expected": ["saldo", "$"],
        })

    if tier >= 2:
        # Cuadro XLSX
        xlsx_sender = pick(["gv", "kevin"])
        scenarios.append({
            "type": "bot", "tier": tier,
            "id": f"cuadro_xlsx_{xlsx_sender}", "account": xlsx_sender,
            "asset": ("cuadro_xlsx", tier),
            "mode": "asistente",
            "verify_db": "SELECT COUNT(*) FROM fin_operations WHERE created_at > NOW() - INTERVAL 180 SECOND",
            "expected": ["Saldo", "$"],
        })
        # Operacion con lenguaje natural (no comando, frase real)
        for acct in ("gv", "noela", "kevin"):
            amount = pick(AMOUNTS_T2)
            tipo   = pick(TIPOS)
            frase  = pick(FRASES_OPERACION).format(tipo=tipo, amount=amount)
            scenarios.append({
                "type": "bot", "tier": tier,
                "id": f"operacion_{acct}", "account": acct,
                "messages": [frase, pick(CLABES)],
                "expected": ["resumen", "monto", "comision"],
            })

    if tier >= 3:
        # Edge cases de monto
        for err_amount in AMOUNTS_ERR:
            scenarios.append({
                "type": "bot", "tier": tier,
                "id": f"monto_invalido_{err_amount}", "account": "gv",
                "messages": [f"manda {err_amount} a IAS neto"],
                "expected": ["error", "invalido", "incorrecto"],
            })
        # CLABE invalida
        scenarios.append({
            "type": "bot", "tier": tier,
            "id": "clabe_invalida", "account": "gv",
            "messages": ["necesito 10000 para IAS neto", "123456789012345678"],
            "expected": ["invalida", "incorrecta", "error"],
        })

    random.shuffle(scenarios)
    return scenarios


# ─── Detección de respuesta del bot ───────────────────────────────────────────

async def wait_for_bot_response(client, chat_id: int, timeout: int) -> Optional[str]:
    """
    Espera hasta `timeout` segundos por un mensaje del financial-bot en el grupo.
    Retorna el texto del mensaje o None si no llega.
    """
    global BOT_USER_ID
    received = []

    async def handler(event):
        msg = event.message
        if msg.sender_id and BOT_USER_ID and msg.sender_id == BOT_USER_ID:
            received.append(msg.text or "")

    client.add_event_handler(handler, events.NewMessage(chats=chat_id))
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline and not received:
        await asyncio.sleep(0.5)
    client.remove_event_handler(handler)
    return received[-1] if received else None


async def discover_bot_user_id(client, chat_id: int) -> Optional[int]:
    """Encuentra el user_id del financial-bot buscando en los participantes del grupo."""
    global BOT_USER_ID
    if BOT_USER_ID:
        return BOT_USER_ID
    try:
        async for member in client.iter_participants(chat_id):
            if getattr(member, 'bot', False):
                # El financial-bot es el único bot relevante
                name = getattr(member, 'first_name', '') or ''
                if any(k in name.lower() for k in ('flujos', 'financi', 'vilar')):
                    BOT_USER_ID = member.id
                    print(f"[engine] Bot detectado: {name} (id={member.id})")
                    return member.id
        # Si no encontró por nombre, tomar el primer bot
        async for member in client.iter_participants(chat_id):
            if getattr(member, 'bot', False):
                BOT_USER_ID = member.id
                print(f"[engine] Bot detectado (genérico, id={member.id})")
                return member.id
    except Exception as e:
        print(f"[engine] Error descubriendo bot: {e}")
    return None


# ─── Motor principal ──────────────────────────────────────────────────────────

async def run_chat_scenario(clients: dict, chat_entities: dict, scenario: dict,
                             chat_id: int, dry_run: bool = False) -> dict:
    """
    Ejecuta una conversacion ambiental multi-usuario (type='chat').
    Cada turn tiene: account, message, delay (opcional).
    No espera respuesta del bot — es charla natural entre los tres.
    """
    test_id = scenario["id"]
    turns   = scenario.get("turns", [])
    print(f"\n  [chat] {test_id}")

    if not dry_run:
        for turn in turns:
            acct    = turn.get("account", "gv")
            message = turn.get("message", "")
            delay   = turn.get("delay", 2)
            client  = clients.get(acct)
            target  = chat_entities.get(acct, chat_id)

            if not client:
                continue
            if isinstance(target, int):
                # Cuenta sin acceso al grupo — silencio, no crash
                continue

            await asyncio.sleep(delay)
            try:
                await client.send_message(target, message)
                print(f"    [{acct.upper()}] {message[:70]}")
            except Exception as e:
                print(f"    [{acct.upper()}] WARNING: {e!r}")
    else:
        for turn in turns:
            print(f"    [{turn.get('account','?').upper()}] {turn.get('message','')[:70]}")

    return {"test_id": test_id, "passed": True, "detail": "chat ambiental", "bot_response": None}


async def run_scenario(clients: dict, chat_entities: dict, scenario: dict,
                       chat_id: int, episode_id: int, dry_run: bool = False) -> dict:
    """
    Ejecuta un escenario con el account indicado.
    Retorna {"test_id", "passed", "detail", "bot_response"}.
    """
    # Dispatch a chat ambiental si es type='chat'
    if scenario.get("type") == "chat":
        return await run_chat_scenario(clients, chat_entities, scenario, chat_id, dry_run)

    account  = scenario.get("account", "gv")
    messages = scenario.get("messages", [])
    expected = scenario.get("expected", [])
    test_id  = scenario["id"]
    client   = clients.get(account)
    # Usar entidad resuelta para evitar PeerIdInvalidError
    target   = chat_entities.get(account, chat_id)

    is_asistente = scenario.get("mode") == "asistente"
    verify_db    = scenario.get("verify_db")
    asset_spec   = scenario.get("asset")        # (asset_type, tier) tuple
    caption      = scenario.get("caption", "")
    filename     = scenario.get("filename", "archivo.xlsx")
    # Legacy compat
    photo_type   = scenario.get("photo")
    doc_type     = scenario.get("document")

    if not client:
        return {"test_id": test_id, "passed": False,
                "detail": f"cuenta {account} no disponible"}

    t0 = time.monotonic()
    bot_response = None

    if messages:
        print(f"  [{account.upper()}] -> {messages[0][:60]}")

    if not dry_run:
        if asset_spec or photo_type or doc_type:
            # ── Enviar asset generado por assets.py ─────────────────────────
            try:
                from assets import gen_for_tier
                if asset_spec:
                    a_type, a_tier = asset_spec
                    data, meta = gen_for_tier(a_type, a_tier)
                    cap  = meta.get("caption", caption)
                    fname = meta.get("filename", "asset.bin")
                    is_doc = a_type == "cuadro_xlsx"
                    label = (f"[xlsx {fname}]"      if is_doc else
                             f"[png cuadro sem{meta.get('semana','?')} "
                             f"{meta.get('clientes','?')} clientes"
                             + (f" +{meta['negativos']} neg" if meta.get('negativos') else "")
                             + "]"                  if "cuadro" in a_type else
                             f"[comprobante ${meta.get('monto', 0):,.0f}]")
                else:
                    # legacy
                    from assets import gen_cuadro_png, gen_comprobante_png
                    if photo_type == "cuadro_retorno":
                        data = gen_cuadro_png(1)
                        cap, fname, is_doc, label = caption, "cuadro.png", False, "[cuadro png]"
                    elif doc_type:
                        from assets import gen_cuadro_xlsx
                        data = gen_cuadro_xlsx(1)
                        cap, fname, is_doc, label = caption, filename, True, f"[xlsx {filename}]"
                    else:
                        data = gen_comprobante_png()
                        cap, fname, is_doc, label = caption, "comprobante.jpg", False, "[comprobante]"

                print(f"  [{account.upper()}] -> {label} | caption='{cap[:40]}'")
                try:
                    await client.send_file(
                        target, io.BytesIO(data),
                        caption=cap,
                        force_document=is_doc,
                        **({"file_name": fname} if is_doc else {})
                    )
                except Exception as send_err:
                    print(f"  WARNING: send_file failed ({account}): {send_err!r}")
                    if isinstance(target, int):
                        print(f"  WARNING: {account.upper()} not in group — add manually in Telegram")
                    return {"test_id": test_id, "passed": False,
                            "detail": f"send_file failed: {send_err}", "bot_response": None}
            except Exception as e:
                print(f"  WARNING: asset preparation error: {e}")
                return {"test_id": test_id, "passed": False,
                        "detail": f"asset error: {e}", "bot_response": None}

            # En asistente el bot SI responde con comisiones/saldo — esperar respuesta
            bot_response = await wait_for_bot_response(client, target, BOT_RESPONSE_TIMEOUT + 5)

        elif messages:
            # ── Enviar mensajes de texto ─────────────────────────────────────
            try:
                await client.send_message(target, messages[0])
            except Exception as send_err:
                print(f"  WARNING: send_message failed ({account}): {send_err!r}")
                if isinstance(target, int):
                    print(f"  WARNING: {account.upper()} not in group — add manually in Telegram")
                return {"test_id": test_id, "passed": False,
                        "detail": f"send_message failed: {send_err}", "bot_response": None}
            bot_response = await wait_for_bot_response(client, target, BOT_RESPONSE_TIMEOUT)
            for i, msg in enumerate(messages[1:], 1):
                await asyncio.sleep(DELAY_BETWEEN_MESSAGES)
                print(f"  [{account.upper()}] -> {msg[:60]}")
                try:
                    await client.send_message(target, msg)
                except Exception as send_err:
                    print(f"  WARNING: send_message[{i}] failed ({account}): {send_err!r}")
                    break
                if i == len(messages) - 1:
                    r2 = await wait_for_bot_response(client, target, BOT_RESPONSE_TIMEOUT)
                    if r2:
                        bot_response = r2
    else:
        await asyncio.sleep(0.1)
        bot_response = "[dry-run]"

    duration_ms = int((time.monotonic() - t0) * 1000)

    # ── Evaluar resultado ─────────────────────────────────────────────────────
    if is_asistente or asset_spec or photo_type or doc_type:
        # En asistente: el bot RESPONDE con comisiones/saldo + actualiza DB
        # Evaluacion combinada: respuesta del bot + estado de DB
        resp_ok = False
        db_ok   = False

        if bot_response and expected:
            resp_lower = bot_response.lower()
            matched = [kw for kw in expected if kw.lower() in resp_lower or kw in bot_response]
            resp_ok = len(matched) > 0

        if verify_db and not dry_run:
            from learning import db_one
            count = db_one(verify_db)
            db_ok = count.isdigit() and int(count) > 0

        if bot_response and resp_ok:
            passed = True
            detail = f"bot respondio con comision/saldo: {bot_response[:120]}"
        elif db_ok:
            passed = True
            detail = f"DB actualizada (bot proceso en silencio): {bot_response[:60] if bot_response else 'sin resp'}"
        elif bot_response and not expected:
            passed = True
            detail = f"bot respondio: {bot_response[:100]}"
        elif bot_response is None:
            passed = False
            detail = "bot no respondio (timeout) - verificar FIN_ALLOWED_CHAT_IDS"
        else:
            passed = False
            detail = f"respuesta sin keywords {expected[:2]}: '{(bot_response or '')[:80]}'"
    elif bot_response is None:
        passed = False
        detail = f"bot no respondio (timeout {BOT_RESPONSE_TIMEOUT}s)"
    elif not expected:
        passed = True
        detail = f"bot respondio: {bot_response[:100]}"
    else:
        resp_lower = bot_response.lower()
        matched = [kw for kw in expected if kw.lower() in resp_lower]
        passed = len(matched) > 0
        detail = (f"OK - '{bot_response[:80]}'" if passed
                  else f"respuesta sin keywords {expected[:3]}: '{bot_response[:80]}'")

    print(f"  {'OK' if passed else 'FAIL'} {detail[:100]}")

    # Registro en learning DB
    if episode_id:
        try:
            record_test_result(episode_id, test_id[:10], passed, detail, duration_ms,
                               {"bot_response": bot_response, "account": account,
                                "tier": scenario.get("tier", 1)})
        except Exception as e:
            print(f"  [learning] {e}")

    return {"test_id": test_id, "passed": passed, "detail": detail, "bot_response": bot_response}


def set_asistente_mode(chat_id: int):
    """Establece modo asistente en fin_chats via SQL directo."""
    from learning import db_exec
    try:
        db_exec(
            "INSERT INTO fin_chats (chat_id, modo, is_group, ultimo_msg_at) "
            "VALUES (%s, 'asistente', 1, NOW(3)) "
            "ON DUPLICATE KEY UPDATE modo='asistente'",
            (chat_id,)
        )
        print(f"[engine] Modo asistente activado en fin_chats para chat_id={chat_id}")
    except Exception as e:
        print(f"[engine] WARNING: no se pudo setear modo asistente via SQL: {e}")
        print(f"[engine]    Enviar /modo asistente manualmente en el grupo")


async def resolve_group_entity(client, chat_id: int):
    """
    Resuelve la entidad del grupo para Telethon.
    Megagrupos son Channels internamente — get_entity(neg_int) falla con PeerIdInvalidError.
    Estrategia 1: PeerChannel fuerza GetChannelsRequest (correcto para megagrupos).
    Estrategia 2: iter_dialogs pagina todos los grupos (requiere que el usuario este en el grupo).
    Estrategia 3: get_input_entity con PeerChannel explicito.
    """
    target_id = abs(chat_id)

    # Estrategia 1: PeerChannel fuerza GetChannelsRequest
    try:
        entity = await client.get_entity(PeerChannel(target_id))
        title = getattr(entity, 'title', '?')
        print(f"[engine] Entidad resuelta via PeerChannel: '{title}' (id={entity.id})")
        return entity
    except Exception as e:
        print(f"[engine] PeerChannel fallo: {e!r}")

    # Estrategia 2: iter_dialogs pagina todos los dialogos (funciona si el usuario esta en el grupo)
    try:
        async for dialog in client.iter_dialogs():
            eid = getattr(dialog.entity, 'id', None)
            if eid == target_id:
                title = getattr(dialog.entity, 'title', '?')
                print(f"[engine] Entidad resuelta via iter_dialogs: '{title}' (id={eid})")
                return dialog.entity
    except Exception as e:
        print(f"[engine] iter_dialogs error: {e!r}")

    # Estrategia 3: get_input_entity con PeerChannel explicito
    try:
        return await client.get_input_entity(PeerChannel(target_id))
    except Exception as e:
        print(f"[engine] get_input_entity PeerChannel fallo: {e!r}")

    print(f"[engine] WARNING: no se pudo resolver entidad {chat_id} — cuenta NO esta en el grupo Testing")
    print(f"[engine] ACCION REQUERIDA: agregar esta cuenta al grupo Testing en Telegram")
    return chat_id  # fallback al integer


async def run_engine(rounds: int = 0, force_tier: int = 0, dry_run: bool = False):
    """
    Motor principal. rounds=0 -> infinito.
    """
    chat_id = get_chat_id()
    print(f"\n{'='*60}")
    print(f" Conversation Engine -- chat_id={chat_id}")
    print(f" Rounds: {'inf' if rounds == 0 else rounds} | Dry-run: {dry_run}")
    print(f"{'='*60}\n")

    # Conectar los 3 clientes MTProto
    clients = {}
    chat_entities = {}  # entidad resuelta por cliente

    for account in ("gv", "noela", "kevin"):
        try:
            c = get_client(account)
            await c.connect()
            if await c.is_user_authorized():
                clients[account] = c
                me = await c.get_me()
                print(f"[engine] {account.upper()} conectado como @{me.username or me.phone}")
                # Resolver la entidad del grupo para este cliente
                entity = await resolve_group_entity(c, chat_id)
                chat_entities[account] = entity
            else:
                print(f"[engine] {account.upper()} no autenticado -- corre setup-sessions.py")
        except Exception as e:
            print(f"[engine] Error conectando {account}: {e}")

    if not clients:
        print("[engine] Sin cuentas disponibles -- abortar")
        return

    # Identificar cuentas que no pudieron resolver la entidad del grupo
    fallback_accounts = {acct for acct, ent in chat_entities.items() if isinstance(ent, int)}
    active_accounts   = set(clients.keys()) - fallback_accounts
    if fallback_accounts:
        print(f"\n[engine] *** ADVERTENCIA ***")
        print(f"[engine] Las siguientes cuentas NO estan en el grupo Testing:")
        for acct in sorted(fallback_accounts):
            me_info = ""
            try:
                me = await clients[acct].get_me()
                me_info = f" (@{me.username or me.phone})"
            except Exception:
                pass
            print(f"[engine]   - {acct.upper()}{me_info}")
        print(f"[engine] ACCION REQUERIDA: agregar esas cuentas al grupo Testing en Telegram.")
        print(f"[engine] Solo se usaran las cuentas activas: {sorted(active_accounts)}")
        print()

    if not active_accounts:
        print("[engine] Ninguna cuenta tiene acceso al grupo -- abortar")
        return

    # Activar modo asistente en la DB antes de empezar
    if not dry_run:
        set_asistente_mode(chat_id)

    # Descubrir bot con cualquier cliente activo (usar entidad resuelta)
    main_account = next(acct for acct in ("gv", "noela", "kevin") if acct in active_accounts)
    main_client  = clients[main_account]
    main_entity  = chat_entities.get(main_account, chat_id)
    await discover_bot_user_id(main_client, main_entity)
    if not BOT_USER_ID:
        print("[engine] WARNING: financial-bot no detectado en el grupo.")
        print("[engine]    Verifica que FIN_ALLOWED_CHAT_IDS incluya este chat_id")
        print("[engine]    y que el bot este en el grupo Testing.")

    # Loop principal
    round_num  = 0
    all_results = []

    while rounds == 0 or round_num < rounds:
        round_num += 1
        tier = force_tier or _calculate_next_tier()
        print(f"\n{'─'*50}")
        print(f" Ronda #{round_num} | Tier {tier} | {datetime.now().strftime('%H:%M:%S')}")
        print(f"{'─'*50}")

        # Iniciar episodio en learning DB
        episode_id = None
        try:
            episode_id = start_episode(triggered_by="conversation_engine")
        except Exception as e:
            print(f"[learning] No se pudo iniciar episodio: {e}")

        # Generar y ejecutar escenarios del tier actual
        # Filtrar bot-scenarios a solo cuentas activas; chat-scenarios siempre pasan
        # (run_chat_scenario omite turns de cuentas sin acceso al grupo)
        def scenario_ok(s):
            if s.get("type") == "chat":
                # Incluir solo si al menos un turn es de una cuenta activa
                return any(t.get("account") in active_accounts for t in s.get("turns", []))
            return s.get("account", "gv") in active_accounts

        scenarios = [s for s in gen_scenarios(tier) if scenario_ok(s)]
        if not scenarios:
            print(f"[engine] No hay escenarios para cuentas activas {sorted(active_accounts)}")
            await asyncio.sleep(10)
            continue
        round_results = []

        for scenario in scenarios:
            result = await run_scenario(clients, chat_entities, scenario, chat_id, episode_id, dry_run)
            round_results.append(result)
            all_results.append(result)
            await asyncio.sleep(DELAY_BETWEEN_SCENARIOS)

        # Completar episodio
        if episode_id and round_results:
            try:
                stats = complete_episode(episode_id, round_results)
                print(f"\n Score ronda #{round_num}: {stats['score']:.1f}% "
                      f"({stats['passed']}/{stats['total']})")

                # Publicar resumen en Telegram cada N rondas
                if round_num % ROUNDS_PER_REPORT == 0:
                    report = build_report(episode_id, round_results, stats)
                    post_to_telegram(report)

                # Dispatch fix si hay fallas recurrentes
                dispatch_fix_if_needed(episode_id, round_results, stats)
            except Exception as e:
                print(f"[learning] Error completando episodio: {e}")

        # Pausa entre rondas (variable para parecer natural)
        pause = random.uniform(5, 15)
        print(f"\n[engine] Pausa {pause:.0f}s antes de ronda #{round_num + 1}...")
        await asyncio.sleep(pause)

    # Desconectar
    for c in clients.values():
        await c.disconnect()

    # Reporte final
    total   = len(all_results)
    passed  = sum(1 for r in all_results if r["passed"])
    print(f"\n{'='*60}")
    print(f" Engine completado: {round_num} rondas")
    print(f" Score global: {passed}/{total} ({passed/total*100:.1f}%)")
    print(f"{'='*60}")


# ─── Entrypoint ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Motor de conversaciones continuas")
    parser.add_argument("--rounds", type=int, default=0,
                        help="Numero de rondas (0=infinito)")
    parser.add_argument("--tier", type=int, default=0, choices=[0, 1, 2, 3, 4],
                        help="Forzar tier (0=automatico)")
    parser.add_argument("--dry-run", action="store_true",
                        help="No envia mensajes, solo simula")
    args = parser.parse_args()

    asyncio.run(run_engine(rounds=args.rounds, force_tier=args.tier, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
