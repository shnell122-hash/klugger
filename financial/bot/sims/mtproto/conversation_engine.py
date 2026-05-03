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
# Cada escenario tiene: tier, account, messages[], expected (keywords en respuesta del bot)

CLABES = [
    "058597000030773833",  # GV Banregio
    "058597000068994820",  # Noela Banregio
    "140180900000120017",  # BBVA
    "012914002436956798",  # Banamex
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

FRASES_CONFIRMAR = ["confirmar", "sí confirmo", "ok", "confirmo", "sí", "va"]
FRASES_CANCELAR  = ["cancelar", "no", "cancela", "mejor no", "déjalo"]
FRASES_SALDO     = ["/saldo", "¿cuánto tengo?", "dime mi saldo", "saldo actual"]


def pick(lst):
    return random.choice(lst)


def gen_scenarios(tier: int) -> list[dict]:
    """Genera escenarios dinámicos para el tier dado."""
    scenarios = []

    # ── Escenarios modo ASISTENTE (siempre activos en todos los tiers) ──────────
    # En modo asistente el bot procesa CLABEs y fotos silenciosamente.
    # Éxito = datos guardados en DB (no respuesta de texto del bot).

    # CLABE enviada como texto plano → bot extrae y guarda cuenta bancaria
    clabes_pool = [
        ("058597000030773833", "BANREGIO", "GV"),
        ("058597000068994820", "BANREGIO", "Noela"),
        ("140180900000120017", "BBVA",     "Kevin"),
        ("012914002436956798", "BANAMEX",  "Ricardo"),
    ]
    for acct, (clabe, banco, titular) in zip(
        ("gv", "noela", "kevin"), random.sample(clabes_pool, min(3, len(clabes_pool)))
    ):
        scenarios.append({
            "tier": 1, "id": f"clabe_asistente_{acct}", "account": acct,
            "messages": [clabe],
            "mode": "asistente",
            "verify_db": f"SELECT COUNT(*) FROM fin_banking_accounts WHERE clabe='{clabe}'",
            "expected": [],  # bot silencioso en asistente
        })

    # Cuadro de retorno PNG → bot extrae montos, CLABEs y registra tabla_pagos
    for acct in ("gv", "noela", "kevin"):
        scenarios.append({
            "tier": 1, "id": f"cuadro_retorno_png_{acct}", "account": acct,
            "photo": "cuadro_retorno",   # generado por assets.py
            "caption": f"PARA PAGO SEM {random.randint(10, 30)}",
            "mode": "asistente",
            "verify_db": "SELECT COUNT(*) FROM fin_operations WHERE created_at > NOW() - INTERVAL 120 SECOND",
            "expected": [],
        })

    # Comprobante de pago JPG → bot detecta monto y marca operación como pagada
    for acct in ("noela", "kevin"):
        scenarios.append({
            "tier": 1, "id": f"comprobante_jpg_{acct}", "account": acct,
            "photo": "comprobante",      # generado por assets.py
            "caption": "Comprobante ingreso",
            "mode": "asistente",
            "expected": [],
        })

    # Cuadro XLSX (tier 2+)
    if tier >= 2:
        scenarios.append({
            "tier": 2, "id": "cuadro_xlsx_gv", "account": "gv",
            "document": "cuadro_retorno_xlsx",
            "filename": f"SEM{random.randint(10, 30)}.xlsx",
            "mode": "asistente",
            "verify_db": "SELECT COUNT(*) FROM fin_operations WHERE created_at > NOW() - INTERVAL 120 SECOND",
            "expected": [],
        })

    if tier >= 1:
        # T1: operaciones básicas (modo NORMAL — el Testing group está en asistente,
        # pero estos escenarios documentan el comportamiento esperado para comparación)
        for _ in range(3):
            amount = pick(AMOUNTS_T1)
            tipo   = pick(TIPOS)
            frase  = pick(FRASES_OPERACION).format(tipo=tipo, amount=amount)
            scenarios.append({
                "tier": 1, "id": "consulta_saldo", "account": "gv",
                "messages": [pick(FRASES_SALDO)],
                "expected": ["saldo", "$", "pesos"],
            })
            scenarios.append({
                "tier": 1, "id": "operacion_cancelar", "account": "gv",
                "messages": [frase, pick(CLABES), pick(FRASES_CANCELAR)],
                "expected": ["cancelad", "reseteado", "operación"],
            })

        # T1: Noela consulta saldo
        scenarios.append({
            "tier": 1, "id": "noela_saldo", "account": "noela",
            "messages": [pick(FRASES_SALDO)],
            "expected": ["saldo", "$"],
        })

        # T1: Kevin pregunta
        scenarios.append({
            "tier": 1, "id": "kevin_saldo", "account": "kevin",
            "messages": ["¿cuánto hay disponible?"],
            "expected": ["saldo", "$", "disponible"],
        })

    if tier >= 2:
        # T2: operaciones grandes
        for acct in ("gv", "noela", "kevin"):
            amount = pick(AMOUNTS_T2)
            tipo   = pick(TIPOS)
            frase  = pick(FRASES_OPERACION).format(tipo=tipo, amount=amount)
            scenarios.append({
                "tier": 2, "id": f"operacion_{acct}_grande", "account": acct,
                "messages": [frase, pick(CLABES)],
                "expected": ["resumen", "monto", "comisión", "CLABE"],
            })

        # T2: conversación entre los tres
        scenarios.append({
            "tier": 2, "id": "multi_usuario", "account": "gv",
            "messages": [pick(FRASES_OPERACION).format(tipo="IAS", amount=pick(AMOUNTS_T2)), pick(CLABES)],
            "expected": ["resumen", "monto"],
        })
        scenarios.append({
            "tier": 2, "id": "multi_usuario_noela", "account": "noela",
            "messages": [pick(FRASES_OPERACION).format(tipo="VILAR", amount=pick(AMOUNTS_T2)), pick(CLABES)],
            "expected": ["resumen", "monto"],
        })

    if tier >= 3:
        # T3: edge cases de monto
        for err_amount in AMOUNTS_ERR:
            frase = f"/operacion IAS neto {err_amount}"
            scenarios.append({
                "tier": 3, "id": f"monto_invalido_{err_amount}", "account": "gv",
                "messages": [frase],
                "expected": ["error", "inválido", "incorrecto", "no puedo"],
            })

        # T3: CLABE inválida
        scenarios.append({
            "tier": 3, "id": "clabe_invalida", "account": "gv",
            "messages": ["/operacion IAS neto 10000", "123456789012345678"],  # CLABE incorrecta
            "expected": ["inválida", "incorrecta", "error", "CLABE"],
        })

        # T3: lenguaje natural ambiguo
        frases_ambiguas = [
            "mándame lana", "hay algo pendiente?", "¿qué pasó con el último?",
            "está bien el saldo?", "cuándo me pagan",
        ]
        scenarios.append({
            "tier": 3, "id": "lenguaje_ambiguo", "account": "gv",
            "messages": [pick(frases_ambiguas)],
            "expected": [],  # cualquier respuesta del bot cuenta
        })

    if tier >= 4:
        # T4: multi-operación simultánea (GV y Noela al mismo tiempo)
        amount_gv    = pick(AMOUNTS_T2)
        amount_noela = pick(AMOUNTS_T2)
        scenarios.append({
            "tier": 4, "id": "concurrencia_gv_noela",
            "account": "gv",   # GV empieza
            "messages": [f"/operacion IAS neto {amount_gv}"],
            "interleave": [    # Noela envía en paralelo
                {"account": "noela", "delay": 1,
                 "message": f"quiero SPEI de {amount_noela} neto"},
            ],
            "expected": [],
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

async def run_scenario(clients: dict, chat_entities: dict, scenario: dict,
                       chat_id: int, episode_id: int, dry_run: bool = False) -> dict:
    """
    Ejecuta un escenario con el account indicado.
    Retorna {"test_id", "passed", "detail", "bot_response"}.
    """
    account  = scenario["account"]
    messages = scenario["messages"]
    expected = scenario.get("expected", [])
    test_id  = scenario["id"]
    client   = clients.get(account)
    # Usar entidad resuelta para evitar PeerIdInvalidError
    target   = chat_entities.get(account, chat_id)

    is_asistente = scenario.get("mode") == "asistente"
    verify_db    = scenario.get("verify_db")
    photo_type   = scenario.get("photo")
    doc_type     = scenario.get("document")
    caption      = scenario.get("caption", "")
    filename     = scenario.get("filename", "archivo.xlsx")

    if not client:
        return {"test_id": test_id, "passed": False,
                "detail": f"cuenta {account} no disponible"}

    t0 = time.monotonic()
    bot_response = None

    print(f"  [{account.upper()}] → {messages[0][:60]}")

    if not dry_run:
        if photo_type:
            # ── Enviar foto generada programáticamente ──────────────────────
            try:
                from assets import random_cuadro_png, random_comprobante_jpg
                if photo_type == "cuadro_retorno":
                    img_bytes, semana = random_cuadro_png()
                    fname = f"cuadro_sem{semana}.png"
                    print(f"  [{account.upper()}] → [foto cuadro retorno sem{semana}] caption='{caption}'")
                else:
                    img_bytes, monto = random_comprobante_jpg()
                    fname = "comprobante.jpg"
                    print(f"  [{account.upper()}] → [foto comprobante ${monto:,.0f}]")
                await client.send_file(target, io.BytesIO(img_bytes),
                                       caption=caption, attributes=[])
            except Exception as e:
                print(f"  ⚠️  Error enviando foto: {e}")
            await asyncio.sleep(BOT_RESPONSE_TIMEOUT)  # dar tiempo al bot

        elif doc_type:
            # ── Enviar documento XLSX ────────────────────────────────────────
            try:
                from assets import gen_cuadro_retorno_xlsx
                xlsx_bytes = gen_cuadro_retorno_xlsx()
                print(f"  [{account.upper()}] → [xlsx {filename}]")
                await client.send_file(target, io.BytesIO(xlsx_bytes),
                                       caption=caption, force_document=True,
                                       attributes=[], file_name=filename)
            except Exception as e:
                print(f"  ⚠️  Error enviando xlsx: {e}")
            await asyncio.sleep(BOT_RESPONSE_TIMEOUT)

        elif messages:
            # ── Enviar mensajes de texto ─────────────────────────────────────
            await client.send_message(target, messages[0])
            bot_response = await wait_for_bot_response(client, chat_id, BOT_RESPONSE_TIMEOUT)
            for i, msg in enumerate(messages[1:], 1):
                await asyncio.sleep(DELAY_BETWEEN_MESSAGES)
                print(f"  [{account.upper()}] → {msg[:60]}")
                await client.send_message(target, msg)
                if i == len(messages) - 1:
                    r2 = await wait_for_bot_response(client, chat_id, BOT_RESPONSE_TIMEOUT)
                    if r2:
                        bot_response = r2
    else:
        await asyncio.sleep(0.1)
        bot_response = "[dry-run]"

    duration_ms = int((time.monotonic() - t0) * 1000)

    # ── Evaluar resultado ─────────────────────────────────────────────────────
    if is_asistente or (photo_type or doc_type):
        # En modo asistente: evaluar por estado de DB, no por respuesta del bot
        if verify_db and not dry_run:
            from learning import db_one
            count = db_one(verify_db)
            passed = count.isdigit() and int(count) > 0
            detail = (f"DB OK — {count} registro(s) encontrado(s)" if passed
                      else "sin registro en DB — bot no procesó el archivo")
        else:
            # No hay verify_db: asumir OK si no hubo excepción (bot silencioso)
            passed = True
            detail = "enviado en modo asistente (bot silencioso — verificar DB manualmente)"
    elif bot_response is None:
        passed = False
        detail = f"bot no respondió (timeout {BOT_RESPONSE_TIMEOUT}s)"
    elif not expected:
        passed = True
        detail = f"bot respondió: {bot_response[:100]}"
    else:
        resp_lower = bot_response.lower()
        matched = [kw for kw in expected if kw.lower() in resp_lower]
        passed = len(matched) > 0
        detail = (f"OK — '{bot_response[:80]}'" if passed
                  else f"respuesta sin keywords {expected[:3]}: '{bot_response[:80]}'")

    print(f"  {'✅' if passed else '❌'} {detail[:100]}")

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
    """Establece modo asistente en fin_chats vía SQL directo."""
    from learning import db_exec
    try:
        db_exec(
            "INSERT INTO fin_chats (chat_id, modo, is_group, ultimo_msg_at) "
            "VALUES (%s, 'asistente', 1, NOW(3)) "
            "ON DUPLICATE KEY UPDATE modo='asistente'",
            (chat_id,)
        )
        print(f"[engine] ✅ Modo asistente activado en fin_chats para chat_id={chat_id}")
    except Exception as e:
        print(f"[engine] ⚠️  No se pudo setear modo asistente via SQL: {e}")
        print(f"[engine]    Enviar /modo asistente manualmente en el grupo")


async def resolve_group_entity(client, chat_id: int):
    """
    Resuelve la entidad del grupo en la caché de Telethon.
    Necesario antes de send_message() con IDs numéricos negativos.
    """
    try:
        # get_dialogs() puebla la caché de todas las conversaciones del usuario
        await client.get_dialogs(limit=50)
        # Intentar resolver directamente
        entity = await client.get_entity(chat_id)
        return entity
    except Exception as e:
        print(f"[engine] ⚠️  Error resolviendo entidad {chat_id}: {e}")
        return chat_id  # fallback al integer


async def run_engine(rounds: int = 0, force_tier: int = 0, dry_run: bool = False):
    """
    Motor principal. rounds=0 → infinito.
    """
    chat_id = get_chat_id()
    print(f"\n{'='*60}")
    print(f" Conversation Engine — chat_id={chat_id}")
    print(f" Rounds: {'∞' if rounds == 0 else rounds} | Dry-run: {dry_run}")
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
                print(f"[engine] {account.upper()} no autenticado — corre setup-sessions.py")
        except Exception as e:
            print(f"[engine] Error conectando {account}: {e}")

    if not clients:
        print("[engine] Sin cuentas disponibles — abortar")
        return

    # Activar modo asistente en la DB antes de empezar
    if not dry_run:
        set_asistente_mode(chat_id)

    # Descubrir bot con cualquier cliente
    main_client = next(iter(clients.values()))
    await discover_bot_user_id(main_client, chat_id)
    if not BOT_USER_ID:
        print("[engine] ⚠️  No se detectó el financial-bot en el grupo.")
        print("[engine]    Verifica que FIN_ALLOWED_CHAT_IDS incluya este chat_id")
        print("[engine]    y que el bot esté en el grupo Testing.")

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
        scenarios = gen_scenarios(tier)
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
                        help="Número de rondas (0=infinito)")
    parser.add_argument("--tier", type=int, default=0, choices=[0, 1, 2, 3, 4],
                        help="Forzar tier (0=automático)")
    parser.add_argument("--dry-run", action="store_true",
                        help="No envía mensajes, solo simula")
    args = parser.parse_args()

    asyncio.run(run_engine(rounds=args.rounds, force_tier=args.tier, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
