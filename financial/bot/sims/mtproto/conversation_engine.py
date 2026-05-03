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

    # ── Escenarios modo ASISTENTE ────────────────────────────────────────────────
    # El bot SÍ responde en asistente: publica comisiones y saldo actualizado.
    # "expected" contiene keywords del resumen financiero que el bot manda.
    # Complejidad progresiva: más clientes, saldos negativos, montos disputados.

    CLABES_POOL = [
        ("058597000030773833", "BANREGIO"),
        ("058597000068994820", "BANREGIO"),
        ("140180900000120017", "BBVA"),
        ("012914002436956798", "BANAMEX"),
    ]

    # CLABEs como texto plano → bot extrae y guarda cuenta bancaria
    for acct, (clabe, banco) in zip(
        ("gv", "noela", "kevin"),
        random.sample(CLABES_POOL, min(3, len(CLABES_POOL)))
    ):
        scenarios.append({
            "tier": 1, "id": f"clabe_texto_{acct}", "account": acct,
            "messages": [clabe],
            "mode": "asistente",
            "verify_db": f"SELECT COUNT(*) FROM fin_banking_accounts WHERE clabe='{clabe}'",
            "expected": ["guardad", "cuenta", "✅"],   # bot confirma CLABE guardada
        })

    # Cuadro de retorno PNG — complejidad crece con el tier
    for acct in ("gv", "noela", "kevin"):
        scenarios.append({
            "tier": tier, "id": f"cuadro_png_{acct}", "account": acct,
            "asset": ("cuadro_png", tier),             # genera asset con tier actual
            "mode": "asistente",
            "verify_db": "SELECT COUNT(*) FROM fin_operations WHERE created_at > NOW() - INTERVAL 180 SECOND",
            # Bot responde con resumen: Saldo, comisión, →
            "expected": ["Saldo", "→", "comisión", "$"],
        })

    # Comprobante JPG — pago recibido
    for acct in ("noela", "kevin"):
        scenarios.append({
            "tier": tier, "id": f"comprobante_{acct}", "account": acct,
            "asset": ("comprobante", tier),
            "mode": "asistente",
            # Bot responde con saldo actualizado tras registrar pago
            "expected": ["Saldo", "→", "$", "comisión"],
        })

    # Cuadro XLSX (tier 2+) — más filas, más detalle
    if tier >= 2:
        for acct in ("gv", "kevin"):
            scenarios.append({
                "tier": tier, "id": f"cuadro_xlsx_{acct}", "account": acct,
                "asset": ("cuadro_xlsx", tier),
                "mode": "asistente",
                "verify_db": "SELECT COUNT(*) FROM fin_operations WHERE created_at > NOW() - INTERVAL 180 SECOND",
                "expected": ["Saldo", "→", "$"],
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
        print(f"  [{account.upper()}] → {messages[0][:60]}")

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
                             + (f" ⚠️{meta['negativos']} neg" if meta.get('negativos') else "")
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

                print(f"  [{account.upper()}] → {label} | caption='{cap[:40]}'")
                await client.send_file(
                    target, io.BytesIO(data),
                    caption=cap,
                    force_document=is_doc,
                    **({"file_name": fname} if is_doc else {})
                )
            except Exception as e:
                print(f"  ⚠️  Error enviando asset: {e}")

            # En asistente el bot SÍ responde con comisiones/saldo — esperar respuesta
            bot_response = await wait_for_bot_response(client, target, BOT_RESPONSE_TIMEOUT + 5)

        elif messages:
            # ── Enviar mensajes de texto ─────────────────────────────────────
            await client.send_message(target, messages[0])
            bot_response = await wait_for_bot_response(client, target, BOT_RESPONSE_TIMEOUT)
            for i, msg in enumerate(messages[1:], 1):
                await asyncio.sleep(DELAY_BETWEEN_MESSAGES)
                print(f"  [{account.upper()}] → {msg[:60]}")
                await client.send_message(target, msg)
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
        # Evaluación combinada: respuesta del bot + estado de DB
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
            detail = f"bot respondió con comisión/saldo: {bot_response[:120]}"
        elif db_ok:
            passed = True
            detail = f"DB actualizada (bot procesó en silencio): {bot_response[:60] if bot_response else 'sin resp'}"
        elif bot_response and not expected:
            passed = True
            detail = f"bot respondió: {bot_response[:100]}"
        elif bot_response is None:
            passed = False
            detail = "bot no respondió (timeout) — ¿FIN_ALLOWED_CHAT_IDS configurado?"
        else:
            passed = False
            detail = f"respuesta sin keywords {expected[:2]}: '{(bot_response or '')[:80]}'"
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
    Resuelve la entidad del grupo para Telethon.
    Megagrupos son Channels internamente — get_entity(int_neg) falla con PeerIdInvalidError.
    Solución: poblar caché con get_dialogs(limit=None) y buscar por ID positivo.
    """
    target_id = abs(chat_id)

    # Poblar caché completa — sin límite para asegurar que el grupo aparezca
    try:
        dialogs = await client.get_dialogs(limit=None)
        for dialog in dialogs:
            eid = getattr(dialog.entity, 'id', None)
            if eid == target_id:
                title = getattr(dialog.entity, 'title', '?')
                print(f"[engine] Entidad resuelta desde diálogos: '{title}' (id={eid})")
                return dialog.entity
    except Exception as e:
        print(f"[engine] get_dialogs error: {e}")

    # Segunda oportunidad: get_input_entity usa la caché interna (más permisivo que get_entity)
    try:
        return await client.get_input_entity(chat_id)
    except Exception:
        pass

    # Último recurso: get_entity después de poblar caché
    try:
        return await client.get_entity(chat_id)
    except Exception as e:
        print(f"[engine] ⚠️  No se pudo resolver entidad {chat_id}: {e}")
        return chat_id  # último fallback al integer


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

    # Descubrir bot con cualquier cliente (usar entidad resuelta)
    main_account = next(iter(clients.keys()))
    main_client  = clients[main_account]
    main_entity  = chat_entities.get(main_account, chat_id)
    await discover_bot_user_id(main_client, main_entity)
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
