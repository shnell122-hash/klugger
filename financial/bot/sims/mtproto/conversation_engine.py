#!/usr/bin/env python3
"""
conversation_engine.py - Motor de conversaciones continuas multi-agente.

Simula cientos de intercambios reales entre GV, Noela y Kevin con el financial-bot,
usando MTProto (Telethon) para bypassear el filtro bot-to-bot de Telegram.

Cada intercambio = 1 episodio en learning_episodes.
El motor avanza de tier automaticamente segun el score acumulado (Curriculum Learning).
Las fallas recurrentes disparan fix tasks via inbox-finbot-verifier (CBR).

Uso:
  ./venv/bin/python conversation_engine.py                  # infinito
  ./venv/bin/python conversation_engine.py --rounds 50      # 50 rondas
  ./venv/bin/python conversation_engine.py --tier 2         # forzar tier 2
  ./venv/bin/python conversation_engine.py --dry-run        # solo imprime, no envia
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

# Configuration

DELAY_BETWEEN_MESSAGES = 3
DELAY_BETWEEN_SCENARIOS = 8
BOT_RESPONSE_TIMEOUT   = 12
ROUNDS_PER_REPORT       = 10

BOT_USER_ID: Optional[int] = None

# Scenario library

CLABES = [
    "058597000030773833",
    "058597000068994820",
    "140180900000120017",
    "012914002436956798",
]

AMOUNTS_T1 = [5000, 8000, 10000, 15000, 20000]
AMOUNTS_T2 = [50000, 75000, 100000, 150000, 200000]
AMOUNTS_T3 = [500000, 1000000, 250000]
AMOUNTS_ERR = [0, -1000, 0.01]

TIPOS = ["IAS", "SPEI", "VILAR", "NOELA"]

FRASES_OPERACION = [
    "/operacion {tipo} neto {amount}",
    "quiero hacer un {tipo} de {amount} neto",
    "necesito mandar {amount} a {tipo}",
    "haz un {tipo} por {amount}",
    "{amount} para {tipo} neto",
]

FRASES_CONFIRMAR = ["confirmar", "si confirmo", "ok", "confirmo", "si", "va"]
FRASES_CANCELAR  = ["cancelar", "no", "cancela", "mejor no", "dejalo"]
FRASES_SALDO     = ["/saldo", "dime mi saldo", "saldo actual", "cuanto tengo"]


def pick(lst):
    return random.choice(lst)


def gen_scenarios(tier: int) -> list[dict]:
    scenarios = []

    CLABES_POOL = [
        ("058597000030773833", "BANREGIO"),
        ("058597000068994820", "BANREGIO"),
        ("140180900000120017", "BBVA"),
        ("012914002436956798", "BANAMEX"),
    ]

    for acct, (clabe, banco) in zip(
        ("gv", "noela", "kevin"),
        random.sample(CLABES_POOL, min(3, len(CLABES_POOL)))
    ):
        scenarios.append({
            "tier": 1, "id": f"clabe_texto_{acct}", "account": acct,
            "messages": [clabe],
            "mode": "asistente",
            "verify_db": f"SELECT COUNT(*) FROM fin_banking_accounts WHERE clabe='{clabe}'",
            "expected": ["guardad", "cuenta"],
        })

    for acct in ("gv", "noela", "kevin"):
        scenarios.append({
            "tier": tier, "id": f"cuadro_png_{acct}", "account": acct,
            "asset": ("cuadro_png", tier),
            "mode": "asistente",
            "verify_db": "SELECT COUNT(*) FROM fin_operations WHERE created_at > NOW() - INTERVAL 180 SECOND",
            "expected": ["Saldo", "comision", "$"],
        })

    for acct in ("noela", "kevin"):
        scenarios.append({
            "tier": tier, "id": f"comprobante_{acct}", "account": acct,
            "asset": ("comprobante", tier),
            "mode": "asistente",
            "expected": ["Saldo", "$"],
        })

    if tier >= 2:
        for acct in ("gv", "kevin"):
            scenarios.append({
                "tier": tier, "id": f"cuadro_xlsx_{acct}", "account": acct,
                "asset": ("cuadro_xlsx", tier),
                "mode": "asistente",
                "verify_db": "SELECT COUNT(*) FROM fin_operations WHERE created_at > NOW() - INTERVAL 180 SECOND",
                "expected": ["Saldo", "$"],
            })

    if tier >= 1:
        for _ in range(3):
            amount = pick(AMOUNTS_T1)
            tipo   = pick(TIPOS)
            frase  = pick(FRASES_OPERACION).format(tipo=tipo, amount=amount)
            scenarios.append({
                "tier": 1, "id": "consulta_saldo", "account": "gv",
                "messages": [pick(FRASES_SALDO)],
                "expected": ["saldo", "$"],
            })
            scenarios.append({
                "tier": 1, "id": "operacion_cancelar", "account": "gv",
                "messages": [frase, pick(CLABES), pick(FRASES_CANCELAR)],
                "expected": ["cancelad", "operacion"],
            })

        scenarios.append({
            "tier": 1, "id": "noela_saldo", "account": "noela",
            "messages": [pick(FRASES_SALDO)],
            "expected": ["saldo", "$"],
        })

        scenarios.append({
            "tier": 1, "id": "kevin_saldo", "account": "kevin",
            "messages": ["/saldo"],
            "expected": ["saldo", "$"],
        })

    if tier >= 2:
        for acct in ("gv", "noela", "kevin"):
            amount = pick(AMOUNTS_T2)
            tipo   = pick(TIPOS)
            frase  = pick(FRASES_OPERACION).format(tipo=tipo, amount=amount)
            scenarios.append({
                "tier": 2, "id": f"operacion_{acct}_grande", "account": acct,
                "messages": [frase, pick(CLABES)],
                "expected": ["resumen", "monto", "CLABE"],
            })

    if tier >= 3:
        for err_amount in AMOUNTS_ERR:
            frase = f"/operacion IAS neto {err_amount}"
            scenarios.append({
                "tier": 3, "id": f"monto_invalido_{err_amount}", "account": "gv",
                "messages": [frase],
                "expected": ["error", "invalido", "incorrecto"],
            })

        scenarios.append({
            "tier": 3, "id": "clabe_invalida", "account": "gv",
            "messages": ["/operacion IAS neto 10000", "123456789012345678"],
            "expected": ["invalida", "incorrecta", "error", "CLABE"],
        })

    if tier >= 4:
        amount_gv    = pick(AMOUNTS_T2)
        amount_noela = pick(AMOUNTS_T2)
        scenarios.append({
            "tier": 4, "id": "concurrencia_gv_noela",
            "account": "gv",
            "messages": [f"/operacion IAS neto {amount_gv}"],
            "expected": [],
        })

    random.shuffle(scenarios)
    return scenarios


# Bot response detection

async def wait_for_bot_response(client, entity, timeout: int) -> Optional[str]:
    global BOT_USER_ID
    received = []

    async def handler(event):
        msg = event.message
        if msg.sender_id and BOT_USER_ID and msg.sender_id == BOT_USER_ID:
            received.append(msg.text or "")

    client.add_event_handler(handler, events.NewMessage(chats=entity))
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline and not received:
        await asyncio.sleep(0.5)
    client.remove_event_handler(handler)
    return received[-1] if received else None


async def discover_bot_user_id(client, entity) -> Optional[int]:
    global BOT_USER_ID
    if BOT_USER_ID:
        return BOT_USER_ID
    try:
        async for member in client.iter_participants(entity):
            if getattr(member, 'bot', False):
                name = getattr(member, 'first_name', '') or ''
                if any(k in name.lower() for k in ('flujos', 'financi', 'vilar')):
                    BOT_USER_ID = member.id
                    print(f"[engine] Bot found: {name} (id={member.id})")
                    return member.id
        async for member in client.iter_participants(entity):
            if getattr(member, 'bot', False):
                BOT_USER_ID = member.id
                print(f"[engine] Bot found (generic, id={member.id})")
                return member.id
    except Exception as e:
        print(f"[engine] Error finding bot: {e}")
    return None


async def resolve_group_entity(client, chat_id: int):
    """
    Resolves the Testing group entity for Telethon.

    The Testing group is a megagroup = Channel internally in Telegram.
    get_entity(-5142407305) fails because Telethon uses GetChatsRequest
    (for regular groups) but megagroups require GetChannelsRequest.

    Fix: use PeerChannel(abs(chat_id)) which forces the correct API call.
    """
    target_id = abs(chat_id)

    # Strategy 1: PeerChannel tells Telethon to use GetChannelsRequest
    # Works even without prior session cache - makes a live network call
    try:
        entity = await client.get_entity(PeerChannel(target_id))
        title = getattr(entity, 'title', '?')
        print(f"[engine] Entity resolved via PeerChannel: '{title}' (id={entity.id})")
        return entity
    except Exception:
        pass

    # Strategy 2: iter_dialogs() handles pagination correctly (unlike get_dialogs)
    try:
        async for dialog in client.iter_dialogs():
            eid = getattr(dialog.entity, 'id', None)
            if eid == target_id:
                title = getattr(dialog.entity, 'title', '?')
                print(f"[engine] Entity resolved via iter_dialogs: '{title}' (id={eid})")
                return dialog.entity
    except Exception as e:
        print(f"[engine] iter_dialogs error: {e}")

    # Strategy 3: get_input_entity with explicit PeerChannel type
    try:
        return await client.get_input_entity(PeerChannel(target_id))
    except Exception:
        pass

    print(f"[engine] WARNING: could not resolve entity {chat_id}, using integer fallback")
    return chat_id


# Main engine

async def run_scenario(clients: dict, chat_entities: dict, scenario: dict,
                       chat_id: int, episode_id: int, dry_run: bool = False) -> dict:
    account  = scenario["account"]
    messages = scenario.get("messages", [])
    expected = scenario.get("expected", [])
    test_id  = scenario["id"]
    client   = clients.get(account)
    target   = chat_entities.get(account, chat_id)

    is_asistente = scenario.get("mode") == "asistente"
    verify_db    = scenario.get("verify_db")
    asset_spec   = scenario.get("asset")
    caption      = scenario.get("caption", "")
    filename     = scenario.get("filename", "archivo.xlsx")
    photo_type   = scenario.get("photo")
    doc_type     = scenario.get("document")

    if not client:
        return {"test_id": test_id, "passed": False,
                "detail": f"account {account} not available"}

    t0 = time.monotonic()
    bot_response = None

    if messages:
        print(f"  [{account.upper()}] -> {messages[0][:60]}")

    if not dry_run:
        if asset_spec or photo_type or doc_type:
            try:
                from assets import gen_for_tier
                if asset_spec:
                    a_type, a_tier = asset_spec
                    data, meta = gen_for_tier(a_type, a_tier)
                    cap   = meta.get("caption", caption)
                    fname = meta.get("filename", "asset.bin")
                    is_doc = a_type == "cuadro_xlsx"
                    if is_doc:
                        label = f"[xlsx {fname}]"
                    elif "cuadro" in a_type:
                        neg = meta.get('negativos', 0)
                        label = f"[png cuadro sem{meta.get('semana','?')} {meta.get('clientes','?')} clients{' +' + str(neg) + ' neg' if neg else ''}]"
                    else:
                        label = f"[comprobante ${meta.get('monto', 0):,.0f}]"
                else:
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
                await client.send_file(
                    target, io.BytesIO(data),
                    caption=cap,
                    force_document=is_doc,
                    **({"file_name": fname} if is_doc else {})
                )
            except Exception as e:
                print(f"  WARNING: error sending asset: {e}")

            bot_response = await wait_for_bot_response(client, target, BOT_RESPONSE_TIMEOUT + 5)

        elif messages:
            await client.send_message(target, messages[0])
            bot_response = await wait_for_bot_response(client, target, BOT_RESPONSE_TIMEOUT)
            for i, msg in enumerate(messages[1:], 1):
                await asyncio.sleep(DELAY_BETWEEN_MESSAGES)
                print(f"  [{account.upper()}] -> {msg[:60]}")
                await client.send_message(target, msg)
                if i == len(messages) - 1:
                    r2 = await wait_for_bot_response(client, target, BOT_RESPONSE_TIMEOUT)
                    if r2:
                        bot_response = r2
    else:
        await asyncio.sleep(0.1)
        bot_response = "[dry-run]"

    duration_ms = int((time.monotonic() - t0) * 1000)

    if is_asistente or asset_spec or photo_type or doc_type:
        resp_ok = False
        db_ok   = False

        if bot_response and expected:
            resp_lower = bot_response.lower()
            matched = [kw for kw in expected if kw.lower() in resp_lower or kw in bot_response]
            resp_ok = len(matched) > 0

        if verify_db and not dry_run:
            count = db_one(verify_db)
            db_ok = count.isdigit() and int(count) > 0

        if bot_response and resp_ok:
            passed = True
            detail = f"bot replied with commission/balance: {bot_response[:120]}"
        elif db_ok:
            passed = True
            detail = f"DB updated (bot processed silently): {bot_response[:60] if bot_response else 'no reply'}"
        elif bot_response and not expected:
            passed = True
            detail = f"bot replied: {bot_response[:100]}"
        elif bot_response is None:
            passed = False
            detail = "bot did not reply (timeout) - check FIN_ALLOWED_CHAT_IDS"
        else:
            passed = False
            detail = f"reply missing keywords {expected[:2]}: '{(bot_response or '')[:80]}'"
    elif bot_response is None:
        passed = False
        detail = f"bot did not reply (timeout {BOT_RESPONSE_TIMEOUT}s)"
    elif not expected:
        passed = True
        detail = f"bot replied: {bot_response[:100]}"
    else:
        resp_lower = bot_response.lower()
        matched = [kw for kw in expected if kw.lower() in resp_lower]
        passed = len(matched) > 0
        detail = (f"OK - '{bot_response[:80]}'" if passed
                  else f"reply missing keywords {expected[:3]}: '{bot_response[:80]}'")

    print(f"  {'OK' if passed else 'FAIL'} {detail[:100]}")

    if episode_id:
        try:
            record_test_result(episode_id, test_id[:10], passed, detail, duration_ms,
                               {"bot_response": bot_response, "account": account,
                                "tier": scenario.get("tier", 1)})
        except Exception as e:
            print(f"  [learning] {e}")

    return {"test_id": test_id, "passed": passed, "detail": detail, "bot_response": bot_response}


def set_asistente_mode(chat_id: int):
    try:
        db_exec(
            "INSERT INTO fin_chats (chat_id, modo, is_group, ultimo_msg_at) "
            "VALUES (%s, 'asistente', 1, NOW(3)) "
            "ON DUPLICATE KEY UPDATE modo='asistente'",
            (chat_id,)
        )
        print(f"[engine] Asistente mode set for chat_id={chat_id}")
    except Exception as e:
        print(f"[engine] WARNING: could not set asistente mode via SQL: {e}")
        print(f"[engine]    Send /modo asistente manually in the group")


async def run_engine(rounds: int = 0, force_tier: int = 0, dry_run: bool = False):
    chat_id = get_chat_id()
    print(f"\n{'='*60}")
    print(f" Conversation Engine - chat_id={chat_id}")
    print(f" Rounds: {'inf' if rounds == 0 else rounds} | Dry-run: {dry_run}")
    print(f"{'='*60}\n")

    clients = {}
    chat_entities = {}

    for account in ("gv", "noela", "kevin"):
        try:
            c = get_client(account)
            await c.connect()
            if await c.is_user_authorized():
                clients[account] = c
                me = await c.get_me()
                print(f"[engine] {account.upper()} connected as @{me.username or me.phone}")
                entity = await resolve_group_entity(c, chat_id)
                chat_entities[account] = entity
            else:
                print(f"[engine] {account.upper()} not authenticated - run setup-sessions.py")
        except Exception as e:
            print(f"[engine] Error connecting {account}: {e}")

    if not clients:
        print("[engine] No accounts available - aborting")
        return

    if not dry_run:
        set_asistente_mode(chat_id)

    main_account = next(iter(clients.keys()))
    main_client  = clients[main_account]
    main_entity  = chat_entities.get(main_account, chat_id)
    await discover_bot_user_id(main_client, main_entity)
    if not BOT_USER_ID:
        print("[engine] WARNING: financial-bot not found in group.")
        print("[engine]    Check that FIN_ALLOWED_CHAT_IDS includes this chat_id")
        print("[engine]    and that the bot is a member of the Testing group.")

    round_num   = 0
    all_results = []

    while rounds == 0 or round_num < rounds:
        round_num += 1
        tier = force_tier or _calculate_next_tier()
        print(f"\n{'─'*50}")
        print(f" Round #{round_num} | Tier {tier} | {datetime.now().strftime('%H:%M:%S')}")
        print(f"{'─'*50}")

        episode_id = None
        try:
            episode_id = start_episode(triggered_by="conversation_engine")
        except Exception as e:
            print(f"[learning] Could not start episode: {e}")

        scenarios     = gen_scenarios(tier)
        round_results = []

        for scenario in scenarios:
            result = await run_scenario(clients, chat_entities, scenario, chat_id, episode_id, dry_run)
            round_results.append(result)
            all_results.append(result)
            await asyncio.sleep(DELAY_BETWEEN_SCENARIOS)

        if episode_id and round_results:
            try:
                stats = complete_episode(episode_id, round_results)
                print(f"\n Score round #{round_num}: {stats['score']:.1f}% "
                      f"({stats['passed']}/{stats['total']})")

                if round_num % ROUNDS_PER_REPORT == 0:
                    report = build_report(episode_id, round_results, stats)
                    post_to_telegram(report)

                dispatch_fix_if_needed(episode_id, round_results, stats)
            except Exception as e:
                print(f"[learning] Error completing episode: {e}")

        pause = random.uniform(5, 15)
        print(f"\n[engine] Pausing {pause:.0f}s before round #{round_num + 1}...")
        await asyncio.sleep(pause)

    for c in clients.values():
        await c.disconnect()

    total  = len(all_results)
    passed = sum(1 for r in all_results if r["passed"])
    print(f"\n{'='*60}")
    print(f" Engine done: {round_num} rounds")
    print(f" Global score: {passed}/{total} ({passed/total*100:.1f}%)")
    print(f"{'='*60}")


def main():
    parser = argparse.ArgumentParser(description="Continuous conversation engine")
    parser.add_argument("--rounds", type=int, default=0,
                        help="Number of rounds (0=infinite)")
    parser.add_argument("--tier", type=int, default=0, choices=[0, 1, 2, 3, 4],
                        help="Force tier (0=auto)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Simulate only, do not send messages")
    args = parser.parse_args()

    asyncio.run(run_engine(rounds=args.rounds, force_tier=args.tier, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
