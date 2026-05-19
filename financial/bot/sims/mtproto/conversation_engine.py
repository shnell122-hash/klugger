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
DELAY_BETWEEN_SCENARIOS = 15    # segundos entre escenarios distintos
BOT_RESPONSE_TIMEOUT   = 18    # segundos esperando respuesta del bot (aumentado de 12)
ROUNDS_PER_REPORT       = 5    # cuántos rounds antes de publicar resumen en Telegram

# ID de Flujos AI (financial-bot) — se auto-descubre al iniciar
BOT_USER_ID: Optional[int] = None

# ─── CLABEs y montos de prueba ────────────────────────────────────────────────

# CLABEs internas (empresa) — usadas como cuentas de pago en operaciones
CLABES_EMPRESA = [
    ("058597000030773833", "BANREGIO"),
    ("058597000068994820", "BANREGIO"),
]

# CLABEs de clientes/externos — usadas para probar registro silencioso en asistente
# Son ajenas (no en fin_empresa_cuentas) así que filtrarCuentasAjenas las acepta
CLABES_CLIENTE = [
    ("140180900000120017", "BBVA"),
    ("012914002436956798", "BANAMEX"),
    ("032180000118359719", "IXE"),
    ("706180000800012345", "HSBC"),
    ("014580000500123456", "SANTANDER"),
]

CLABES_POOL = CLABES_EMPRESA + CLABES_CLIENTE
CLABES = [c for c, _ in CLABES_POOL]
# Usadas en operaciones (pago salida) — incluyen tanto empresa como cliente
CLABES_OP = [c for c, _ in CLABES_POOL]
# Usadas solo para probar registro de cuenta en asistente mode
CLABES_TEST = [c for c, _ in CLABES_CLIENTE]

AMOUNTS_T1 = [5_000, 8_000, 10_000, 15_000, 20_000]
AMOUNTS_T2 = [50_000, 75_000, 100_000, 150_000, 200_000]
AMOUNTS_T3 = [300_000, 500_000, 800_000, 1_200_000]
AMOUNTS_ERR = [0, -1000, 0.01]

# ─── Frases por tipo de operación ─────────────────────────────────────────────
# Lenguaje natural real, no plantillas genéricas.

FRASES_IAS = [
    ("Oye, necesito procesar un IAS de {amount} neto esta semana, ya tengo las cuentas",
     "encontrados", "correcto"),
    ("GV, ¿puedes hacer un IAS por {amount} neto? Te mando la CLABE ahorita",
     "encontrados", "correcto"),
    ("Quiero hacer una dispersión IAS de {amount} neto, ¿puedes?",
     "encontrados", "correcto"),
    ("Manda {amount} neto de IAS, acá la cuenta:",
     "encontrados", "correcto"),
    ("{amount} IAS neto por favor, es para esta semana",
     "encontrados", "correcto"),
]

FRASES_SPEI = [
    ("Necesito un SPEI de {amount} neto a la cuenta de Ricardo",
     "encontrados", "correcto"),
    ("¿Me puedes mandar {amount} neto por SPEI? Es para el proveedor",
     "encontrados", "correcto"),
    ("SPEI {amount} neto para hoy si puedes, es urgente",
     "encontrados", "correcto"),
    ("Oye GV manda {amount} por SPEI neto, acá la CLABE:",
     "encontrados", "correcto"),
    ("Hay que hacer un SPEI de {amount} neto, te paso los datos",
     "encontrados", "correcto"),
]

FRASES_SINDICATO = [
    ("Te mando un sindicato de {amount} bruto, acá los datos",
     "encontrados", "correcto"),
    ("Sindicato de {amount} bruto esta semana",
     "encontrados", "correcto"),
    ("Voy a hacer el sindicato de {amount}, ¿me confirmas?",
     "encontrados", "correcto"),
    ("El sindicato de {amount} bruto que quedamos, ¿lo puedo registrar ya?",
     "encontrados", "correcto"),
]

FRASES_EFECTIVO = [
    ("Necesito {amount} en efectivo para mañana, es para el pago de proveedores",
     "efectivo", "entrega"),
    ("¿Puedes mandar {amount} en efectivo? Lo necesito hoy",
     "efectivo", "entrega"),
    ("Voy a necesitar {amount} en efectivo para esta tarde",
     "efectivo", "entrega"),
    ("Mándame {amount} pesos en efectivo, es para cerrar el pago",
     "efectivo", "entrega"),
]

FRASES_TARJETAS = [
    ("Mándame tarjetas por {amount} para el viernes",
     "encontrados", "correcto"),
    ("Necesito {amount} en tarjetas prepago esta semana",
     "encontrados", "correcto"),
    ("¿Me puedes surtir {amount} en tarjetas?",
     "encontrados", "correcto"),
    ("TARJETAS {amount} neto para el cliente, te paso la CLABE",
     "encontrados", "correcto"),
]

FRASES_SALDO = [
    "cuánto tengo?",
    "dime mi saldo",
    "saldo actual",
    "cuánto hay?",
    "¿cuánto tengo disponible?",
    "¿cuánto queda en el saldo?",
    "¿cómo vamos con el saldo?",
    "a cuánto estamos?",
]

FRASES_CONFIRMAR = ["confirmar", "sí confirmo", "ok dale", "sí", "confirmo", "va"]
FRASES_CANCELAR  = ["cancelar", "no, mejor no", "cancela", "no lo hagas"]

# ─── Conversaciones ambientales ────────────────────────────────────────────────

AMBIENT_CHATS = [
    # Inicio de semana
    {
        "id": "buenos_dias",
        "turns": [
            {"account": "gv",    "message": "Buenos días"},
            {"account": "noela", "delay": 6,  "message": "Buenos días German!"},
            {"account": "kevin", "delay": 4,  "message": "Que tal, buenos días"},
        ]
    },
    # Coordinación de pagos
    {
        "id": "coordinacion_pagos",
        "turns": [
            {"account": "gv",    "message": "Vianey, ¿ya está listo el cuadro de esta semana?"},
            {"account": "noela", "delay": 8,  "message": "Sí, ya casi lo termino, ahorita lo subo"},
            {"account": "kevin", "delay": 5,  "message": "Yo también estoy esperando el mío"},
            {"account": "noela", "delay": 12, "message": "Listo, ya lo mandé"},
            {"account": "gv",    "delay": 4,  "message": "Perfecto, gracias Vianey"},
        ]
    },
    # Confirmación de depósito
    {
        "id": "deposito_confirmado",
        "turns": [
            {"account": "noela", "message": "Ya cayó el depósito en mi cuenta"},
            {"account": "gv",    "delay": 5,  "message": "Bien, yo también lo veo reflejado"},
            {"account": "kevin", "delay": 7,  "message": "El mío también. Gracias German"},
            {"account": "gv",    "delay": 3,  "message": "Con gusto"},
        ]
    },
    # Solicitud de CLABE
    {
        "id": "solicitud_clabe",
        "turns": [
            {"account": "gv",    "message": "Christian, mándame tu CLABE actualizada por favor"},
            {"account": "kevin", "delay": 12, "message": "Claro, es 058597000030773833 Banregio"},
            {"account": "gv",    "delay": 4,  "message": "Anotado, gracias"},
        ]
    },
    # Recordatorio de corte semanal
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
            {"account": "noela", "message": "Ya subí el comprobante del pago"},
            {"account": "gv",    "delay": 5,  "message": "Lo vi, gracias Vianey"},
            {"account": "kevin", "delay": 3,  "message": "Ok visto"},
        ]
    },
    # Revisión de operación pendiente
    {
        "id": "op_pendiente",
        "turns": [
            {"account": "kevin", "message": "German, ¿hay algo pendiente de mi parte?"},
            {"account": "gv",    "delay": 7,  "message": "No, todo en orden. El saldo está cuadrado"},
            {"account": "kevin", "delay": 3,  "message": "Perfecto, gracias"},
        ]
    },
    # Revisión de saldo
    {
        "id": "revision_saldo",
        "turns": [
            {"account": "noela", "message": "German, ¿cuánto queda después del último pago?"},
            {"account": "gv",    "delay": 5,  "message": "Ahorita lo reviso"},
            {"account": "gv",    "delay": 8,  "message": "Ya lo cheqé, todo correcto"},
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
    # Dispersión completada
    {
        "id": "dispersion_ok",
        "turns": [
            {"account": "gv",    "message": "Ya hice la dispersión de esta semana"},
            {"account": "noela", "delay": 6,  "message": "Lo vi en el bot, gracias German"},
            {"account": "kevin", "delay": 4,  "message": "Recibido, muchas gracias"},
        ]
    },
    # Pregunta rápida sobre pagos
    {
        "id": "pregunta_rapida",
        "turns": [
            {"account": "kevin", "message": "¿Todo bien con los pagos de esta semana?"},
            {"account": "gv",    "delay": 6,  "message": "Sí, todo en orden. Mandé los comprobantes ayer"},
            {"account": "noela", "delay": 4,  "message": "Correcto, ya los vi"},
        ]
    },
    # Comentario post-bot
    {
        "id": "post_bot_comentario",
        "turns": [
            {"account": "noela", "message": "Vieron la respuesta del bot? Todo correcto"},
            {"account": "gv",    "delay": 5,  "message": "Sí, ya lo vi. Perfecto"},
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
    # Actualización de cuenta bancaria
    {
        "id": "update_cuenta",
        "turns": [
            {"account": "noela", "message": "Cambié mi cuenta, ya no es BBVA sino Banregio"},
            {"account": "gv",    "delay": 5,  "message": "Ok Vianey, mándame la CLABE nueva"},
            {"account": "noela", "delay": 6,  "message": "058597000068994820"},
            {"account": "gv",    "delay": 3,  "message": "Listo, ya la actualicé"},
        ]
    },
    # Negociación de rate
    {
        "id": "negociacion_rate",
        "turns": [
            {"account": "kevin", "message": "German, ¿el rate sigue siendo 5.5%?"},
            {"account": "gv",    "delay": 7,  "message": "Sí, por ahora sí"},
            {"account": "kevin", "delay": 4,  "message": "Perfecto, ok"},
            {"account": "noela", "delay": 6,  "message": "El mío también es 5.5?"},
            {"account": "gv",    "delay": 4,  "message": "Sí Vianey, igual para todos"},
        ]
    },
    # Coordinación de SPEI urgente
    {
        "id": "spei_urgente",
        "turns": [
            {"account": "kevin", "message": "German, necesito un SPEI urgente, ¿puedes?"},
            {"account": "gv",    "delay": 5,  "message": "Sí claro, dime monto y cuenta"},
            {"account": "kevin", "delay": 4,  "message": "Son 45 mil neto a la cuenta de siempre"},
            {"account": "gv",    "delay": 6,  "message": "Va, ahorita lo proceso en el sistema"},
        ]
    },
    # Discusión sobre cierre de mes
    {
        "id": "cierre_mes_chat",
        "turns": [
            {"account": "kevin", "message": "Ya estamos al final del mes, ¿cómo vamos?"},
            {"account": "gv",    "delay": 6,  "message": "Ya casi terminamos, faltan dos días para el cierre"},
            {"account": "noela", "delay": 5,  "message": "¿Ya mandaron las facturas del grupo?"},
            {"account": "gv",    "delay": 8,  "message": "Esta semana las mando, saldo se reintegra con eso"},
            {"account": "kevin", "delay": 4,  "message": "Ah ok, entendido"},
        ]
    },
    # Kevin propone financiar operaciones
    {
        "id": "kevin_financia",
        "turns": [
            {"account": "kevin", "message": "German, el saldo está bajo. ¿Quieres que anticipe yo las últimas operaciones?"},
            {"account": "gv",    "delay": 8,  "message": "Sí Christian, son dos días para el cierre. Adelanta las últimas dos y ya"},
            {"account": "kevin", "delay": 5,  "message": "Perfecto, sin problema. Ya los proceso"},
            {"account": "noela", "delay": 4,  "message": "Yo también puedo apoyar si necesitan"},
            {"account": "gv",    "delay": 3,  "message": "Por ahora con Christian está bien, gracias Vianey"},
        ]
    },
    # Reintegro de saldo por facturas
    {
        "id": "reintegro_facturas",
        "turns": [
            {"account": "gv",    "message": "Ya mandé las facturas del grupo, van a reintegrar el saldo"},
            {"account": "kevin", "delay": 7,  "message": "¿Cuánto cae?"},
            {"account": "gv",    "delay": 5,  "message": "Como 800 mil entre todas las facturas RE"},
            {"account": "noela", "delay": 4,  "message": "Perfecto, ya podemos seguir con los SPEI"},
            {"account": "kevin", "delay": 3,  "message": "Excelente"},
        ]
    },
    # Post dispersión de efectivo
    {
        "id": "post_efectivo",
        "turns": [
            {"account": "noela", "message": "Christian, ya está listo el efectivo para hoy"},
            {"account": "kevin", "delay": 6,  "message": "Perfecto, paso por él en la tarde"},
            {"account": "gv",    "delay": 4,  "message": "Queda registrado en el sistema"},
        ]
    },
    # Tarjetas de nómina
    {
        "id": "tarjetas_nomina",
        "turns": [
            {"account": "kevin", "message": "German, ya llegaron las tarjetas del proveedor"},
            {"account": "gv",    "delay": 5,  "message": "Perfecto, ¿cuánto cargaron en total?"},
            {"account": "kevin", "delay": 4,  "message": "350 mil entre todas"},
            {"account": "gv",    "delay": 6,  "message": "Ok lo verifico con el resumen"},
        ]
    },
]

# Plantillas de contexto pre/post operación
CHAT_PRE_OP = [
    [
        {"account": "gv",    "message": "Vianey, voy a hacer una operación ahorita"},
        {"account": "noela", "delay": 5, "message": "Ok, yo la veo"},
    ],
    [
        {"account": "kevin", "message": "German, ¿ya puedo hacer el pago?"},
        {"account": "gv",    "delay": 4, "message": "Sí, adelante Christian"},
    ],
    [
        {"account": "noela", "message": "Voy a mandar el cuadro de esta semana"},
        {"account": "gv",    "delay": 5, "message": "Ok Vianey, ya lo espero"},
    ],
    [
        {"account": "kevin", "message": "¿Puedo procesar el SPEI de hoy?"},
        {"account": "gv",    "delay": 4, "message": "Sí dale, ya está habilitado"},
    ],
]

CHAT_POST_OP = [
    [
        {"account": "noela", "delay": 4, "message": "Listo, ya quedó registrado"},
        {"account": "kevin", "delay": 3, "message": "Gracias"},
    ],
    [
        {"account": "gv",    "delay": 5, "message": "Listo. Ya está registrado en el sistema"},
        {"account": "kevin", "delay": 3, "message": "Perfecto, gracias German"},
    ],
    [
        {"account": "noela", "delay": 4, "message": "Ok ya lo veo en el bot"},
        {"account": "gv",    "delay": 3, "message": "Correcto"},
    ],
    [
        {"account": "kevin", "delay": 5, "message": "Confirmado de mi parte"},
        {"account": "noela", "delay": 3, "message": "Visto"},
    ],
]


def pick(lst):
    return random.choice(lst)


def gen_op_scenario(acct: str, tipo: str, amount: int, tier: int) -> dict:
    """
    Genera un escenario completo de operación para el tipo dado.
    Retorna un escenario type='bot' listo para ejecutar.
    """
    clabe = pick(CLABES_OP)

    # "selecciona" / "tipo" son fallback válidos: el bot pidió tipo porque el parser
    # no extrajo todo del texto natural — la conversación sigue, no es fallo total.
    FALLBACK_EXPECTED = ["selecciona", "tipo", "operación", "monto"]

    if tipo == "IAS":
        frase_tmpl, kw1, kw2 = pick(FRASES_IAS)
        frase = frase_tmpl.format(amount=f"{amount:,}")
        messages = [frase, clabe]
        expected = [kw1, kw2] + FALLBACK_EXPECTED

    elif tipo == "SPEI":
        frase_tmpl, kw1, kw2 = pick(FRASES_SPEI)
        frase = frase_tmpl.format(amount=f"{amount:,}")
        messages = [frase, clabe]
        expected = [kw1, kw2] + FALLBACK_EXPECTED

    elif tipo == "SINDICATO":
        frase_tmpl, kw1, kw2 = pick(FRASES_SINDICATO)
        frase = frase_tmpl.format(amount=f"{amount:,}")
        messages = [frase, clabe]
        expected = [kw1, kw2] + FALLBACK_EXPECTED

    elif tipo == "EFECTIVO":
        frase_tmpl, kw1, kw2 = pick(FRASES_EFECTIVO)
        frase = frase_tmpl.format(amount=f"{amount:,}")
        messages = [frase]
        expected = [kw1, kw2] + FALLBACK_EXPECTED

    elif tipo == "TARJETAS":
        frase_tmpl, kw1, kw2 = pick(FRASES_TARJETAS)
        frase = frase_tmpl.format(amount=f"{amount:,}")
        messages = [frase, clabe]
        expected = [kw1, kw2] + FALLBACK_EXPECTED

    else:
        frase = f"operacion {tipo} {amount:,} neto"
        messages = [frase, clabe]
        expected = ["encontrados", "correcto"] + FALLBACK_EXPECTED

    return {
        "type":     "bot",
        "tier":     tier,
        "id":       f"{tipo.lower()}_{acct}_{amount}",
        "account":  acct,
        "messages": messages,
        "expected": expected,
    }


def gen_scenarios_fin_mes(tier: int, active_accounts: set) -> list[dict]:
    """
    Genera el ciclo de fin de mes:
    1. Varias operaciones SPEI/IAS que consumen saldo
    2. Saldo bajo → Christian propone financiar
    3. GV acepta: "faltan 2 días para el cierre"
    4. 2 operaciones más
    5. Facturas / comprobante reintegran saldo
    6. IAS mensual único + SPEIs post-cierre
    """
    scenarios = []
    amounts_drain  = [random.choice([50_000, 75_000, 100_000]) for _ in range(3)]
    amounts_post   = [random.choice([80_000, 120_000, 150_000]) for _ in range(2)]

    # Fase 1: operaciones que drenan el saldo
    for amount in amounts_drain:
        acct = pick(sorted(active_accounts))
        tipo = pick(["SPEI", "IAS"])
        scenarios.append(gen_op_scenario(acct, tipo, amount, tier))
        scenarios.append({
            "type": "chat", "tier": tier,
            "id": f"post_drain_{amount}",
            "turns": pick(CHAT_POST_OP),
        })

    # Saldo query mostrando bajo
    scenarios.append({
        "type": "bot", "tier": tier,
        "id": "saldo_bajo_query",
        "account": pick(sorted(active_accounts)),
        "messages": [pick(["¿Cómo vamos con el saldo?", "¿Cuánto queda?", "a cuánto estamos?"])],
        "expected": ["saldo", "$"],
    })

    # Fase 2: Christian propone financiar
    scenarios.append({
        "type": "chat", "tier": tier,
        "id": "kevin_propone_financiar",
        "turns": [
            {"account": "kevin", "message": "German, el saldo está muy bajo. ¿Quieres que anticipe yo las últimas?"},
            {"account": "gv",    "delay": 7,
             "message": "Sí Christian, son dos días para el cierre del mes. Adelanta las dos últimas y ya"},
            {"account": "kevin", "delay": 4, "message": "Perfecto, sin problema. Ya las proceso"},
        ],
    })

    # Fase 3: 2 operaciones más financiadas por Kevin
    for amount in amounts_post:
        acct = "kevin" if "kevin" in active_accounts else pick(sorted(active_accounts))
        tipo = pick(["SPEI", "IAS"])
        scenarios.append(gen_op_scenario(acct, tipo, amount, tier))

    # Fase 4: cierre de mes — facturas reintegran saldo (comprobante)
    scenarios.append({
        "type": "chat", "tier": tier,
        "id": "cierre_mes_aviso",
        "turns": [
            {"account": "gv", "message": "Ya es cierre de mes, esta semana van las facturas del grupo"},
            {"account": "kevin", "delay": 5, "message": "¿Cuánto reintegran?"},
            {"account": "gv",    "delay": 4, "message": "Como 800 mil entre todas las facturas RE"},
            {"account": "noela", "delay": 6, "message": "Perfecto, ya podemos seguir trabajando"},
        ],
    })

    # Comprobante / factura (asset) que reintegra saldo
    reintegro_sender = "gv" if "gv" in active_accounts else pick(sorted(active_accounts))
    scenarios.append({
        "type": "bot", "tier": tier,
        "id": "reintegro_factura",
        "account": reintegro_sender,
        "asset": ("comprobante", tier),
        "mode": "asistente",
        "expected": ["Saldo", "$"],
    })

    # Fase 5: IAS mensual único
    ias_amount = random.choice([400_000, 600_000, 800_000])
    acct = pick(sorted(active_accounts))
    scenarios.append(gen_op_scenario(acct, "IAS", ias_amount, tier))

    # SPEIs post-cierre normales
    for amount in [random.choice([50_000, 75_000]) for _ in range(2)]:
        acct = pick(sorted(active_accounts))
        scenarios.append(gen_op_scenario(acct, "SPEI", amount, tier))
        scenarios.append({
            "type": "chat", "tier": tier,
            "id": f"post_cierre_{amount}",
            "turns": pick(CHAT_POST_OP),
        })

    return scenarios


def gen_scenarios(tier: int, active_accounts: set = None) -> list[dict]:
    """
    Genera escenarios para el tier dado.
    Mezcla conversaciones ambientales (type='chat') con interacciones al bot (type='bot').
    Ratio aprox 55% chat / 45% bot para que el grupo se vea natural.
    """
    if active_accounts is None:
        active_accounts = {"gv", "noela", "kevin"}

    scenarios = []

    # ── Conversaciones ambientales ─────────────────────────────────────────────
    n_ambient = random.randint(3, min(5, len(AMBIENT_CHATS)))
    for chat in random.sample(AMBIENT_CHATS, n_ambient):
        # Solo incluir si al menos un turn es de cuenta activa
        if any(t.get("account") in active_accounts for t in chat["turns"]):
            scenarios.append({
                "type": "chat",
                "tier": 1,
                "id": f"ambient_{chat['id']}",
                "turns": chat["turns"],
            })

    # ── Cuadro retorno PNG ────────────────────────────────────────────────────
    sender = pick(sorted(active_accounts))
    pre    = pick(CHAT_PRE_OP) if random.random() > 0.4 else []
    post   = pick(CHAT_POST_OP) if random.random() > 0.4 else []
    if pre:
        scenarios.append({"type": "chat", "tier": tier, "id": "pre_cuadro_png", "turns": pre})
    scenarios.append({
        "type": "bot", "tier": tier,
        "id": f"cuadro_png_{sender}", "account": sender,
        "asset": ("cuadro_png", tier),
        "mode": "asistente",
        "verify_db": "SELECT COUNT(*) FROM fin_operations WHERE created_at > NOW() - INTERVAL 180 SECOND",
        "expected": ["Saldo", "comision", "$"],
    })
    if post:
        scenarios.append({"type": "chat", "tier": tier, "id": "post_cuadro_png", "turns": post})

    # ── CLABE como texto plano (solo CLABEs externas — las internas se filtran como propias) ──
    clabe, banco = pick(CLABES_CLIENTE)
    clabe_sender = pick(sorted(active_accounts))
    scenarios.append({
        "type": "bot", "tier": tier,
        "id": f"clabe_{clabe_sender}", "account": clabe_sender,
        "messages": [clabe],
        "mode": "asistente",
        "verify_db": f"SELECT COUNT(*) FROM fin_banking_accounts WHERE clabe='{clabe}'",
        "expected": ["guardad", "cuenta", "selecciona", "opci", "Guardado"],
    })

    # ── Comprobante JPG ────────────────────────────────────────────────────────
    comp_sender = pick([a for a in ("noela", "kevin", "gv") if a in active_accounts])
    scenarios.append({
        "type": "bot", "tier": tier,
        "id": f"comprobante_{comp_sender}", "account": comp_sender,
        "asset": ("comprobante", tier),
        "mode": "asistente",
        "expected": ["Saldo", "$"],
    })

    # ── Consultas de saldo ─────────────────────────────────────────────────────
    for acct in sorted(active_accounts):
        frase = pick(FRASES_SALDO)
        scenarios.append({
            "type": "bot", "tier": tier,
            "id": f"saldo_{acct}", "account": acct,
            "messages": [frase],
            "expected": ["saldo", "$"],
        })

    # ── Tier 1: IAS básicos ────────────────────────────────────────────────────
    for acct in sorted(active_accounts):
        amount = pick(AMOUNTS_T1)
        scenarios.append(gen_op_scenario(acct, "IAS", amount, tier))

    # ── Tier 2+: Variedad de tipos + montos más grandes + XLSX ─────────────────
    if tier >= 2:
        # Cuadro XLSX
        xlsx_sender = pick([a for a in ("gv", "kevin") if a in active_accounts])
        scenarios.append({
            "type": "bot", "tier": tier,
            "id": f"cuadro_xlsx_{xlsx_sender}", "account": xlsx_sender,
            "asset": ("cuadro_xlsx", tier),
            "mode": "asistente",
            "verify_db": "SELECT COUNT(*) FROM fin_operations WHERE created_at > NOW() - INTERVAL 180 SECOND",
            "expected": ["Saldo", "$"],
        })

        # SPEI: salida a cuenta de tercero
        for acct in sorted(active_accounts):
            amount = pick(AMOUNTS_T2)
            pre = pick(CHAT_PRE_OP) if random.random() > 0.5 else []
            if pre:
                scenarios.append({"type": "chat", "tier": tier, "id": f"pre_spei_{acct}", "turns": pre})
            scenarios.append(gen_op_scenario(acct, "SPEI", amount, tier))

        # SINDICATO (entrada): el cliente paga
        sindicato_sender = pick(sorted(active_accounts))
        amount = pick(AMOUNTS_T2)
        scenarios.append(gen_op_scenario(sindicato_sender, "SINDICATO", amount, tier))

        # Ambient de contexto entre operaciones
        scenarios.append({
            "type": "chat", "tier": tier,
            "id": "ambient_t2_mid",
            "turns": pick(AMBIENT_CHATS)["turns"],
        })

    # ── Tier 3+: EFECTIVO, TARJETAS, edge cases ────────────────────────────────
    if tier >= 3:
        # EFECTIVO: salida física, no requiere CLABE
        efectivo_sender = pick([a for a in ("gv", "kevin") if a in active_accounts])
        amount = pick([15_000, 20_000, 30_000, 50_000])
        scenarios.append(gen_op_scenario(efectivo_sender, "EFECTIVO", amount, tier))

        # TARJETAS prepago
        tarjetas_sender = pick(sorted(active_accounts))
        amount = pick([25_000, 40_000, 60_000, 80_000])
        scenarios.append(gen_op_scenario(tarjetas_sender, "TARJETAS", amount, tier))

        # Edge cases de monto
        for err_amount in random.sample(AMOUNTS_ERR, 2):
            scenarios.append({
                "type": "bot", "tier": tier,
                "id": f"monto_invalido_{err_amount}", "account": "gv" if "gv" in active_accounts else pick(sorted(active_accounts)),
                "messages": [f"manda {err_amount} a IAS neto"],
                "expected": ["error", "inválido", "incorrecto", "monto"],
            })

        # CLABE inválida
        if "gv" in active_accounts or "kevin" in active_accounts:
            acct = "gv" if "gv" in active_accounts else "kevin"
            scenarios.append({
                "type": "bot", "tier": tier,
                "id": "clabe_invalida", "account": acct,
                "messages": ["necesito 10000 para IAS neto", "123456789012345678"],
                "expected": ["inválida", "incorrecta", "error", "CLABE"],
            })

        # Conversación sobre tarjetas después de la operación
        scenarios.append({
            "type": "chat", "tier": tier,
            "id": "post_tarjetas",
            "turns": [
                {"account": "kevin", "message": "Ya llegaron las tarjetas, ¿están registradas en el sistema?"},
                {"account": "gv",    "delay": 5, "message": "Sí, ya aparecen. Solo falta la entrega física"},
                {"account": "kevin", "delay": 4, "message": "Perfecto, las entrego mañana"},
            ],
        })

    # ── Tier 4+: Ciclo de fin de mes ────────────────────────────────────────────
    if tier >= 4:
        scenarios.extend(gen_scenarios_fin_mes(tier, active_accounts))

    random.shuffle(scenarios)
    return scenarios


# ─── Conexión robusta ────────────────────────────────────────────────────────

async def ensure_connected(client, account: str, force: bool = False) -> bool:
    """Reconnect Telethon client. force=True disconnects first even if appears connected."""
    if not force and client.is_connected():
        return True
    if force and client.is_connected():
        try:
            await client.disconnect()
            await asyncio.sleep(0.3)
        except Exception:
            pass
    label = "force-reconnecting" if force else "disconnected — reconnecting"
    print(f"  [{account.upper()}] {label}...")
    try:
        await client.connect()
        await asyncio.sleep(0.5)
        ok = client.is_connected()
        if ok:
            print(f"  [{account.upper()}] reconnected OK")
        return ok
    except Exception as e:
        print(f"  [{account.upper()}] reconnect failed: {e!r}")
        return False


# ─── Detección de respuesta del bot ───────────────────────────────────────────

class BotResponseCollector:
    """
    Registra el handler ANTES del send para no perder respuestas rápidas.

    Usa un cursor interno para saber qué mensajes ya fueron "consumidos",
    de modo que cada llamada a wait() espera por un mensaje NUEVO (posterior
    al send más reciente) en lugar de devolver respuestas cacheadas de rondas
    anteriores del mismo escenario.

    Uso:
        async with BotResponseCollector(client, target) as col:
            await client.send_message(target, msg1)
            r1 = await col.wait(18)           # espera respuesta a msg1
            col.mark_consumed()               # avanzar cursor antes del siguiente send
            await client.send_message(target, msg2)
            r2 = await col.wait(18, drain=2)  # espera respuesta a msg2 + drain 2s
    """
    def __init__(self, client, chat_entity):
        self._client   = client
        self._chat     = chat_entity
        self._received: list[str] = []
        self._cursor: int = 0  # índice del primer mensaje NO consumido

    async def __aenter__(self):
        async def _handler(event):
            msg = event.message
            if msg.sender_id and BOT_USER_ID and msg.sender_id == BOT_USER_ID:
                self._received.append(msg.text or "")
        self._handler_fn = _handler
        self._client.add_event_handler(_handler, events.NewMessage(chats=self._chat))
        return self

    async def __aexit__(self, *_):
        self._client.remove_event_handler(self._handler_fn)

    def mark_consumed(self):
        """Avanzar cursor: los mensajes hasta aquí ya fueron procesados."""
        self._cursor = len(self._received)

    async def wait(self, timeout: int, drain: float = 0.0) -> Optional[str]:
        """
        Espera el próximo mensaje NUEVO (después del cursor actual).
        drain: segundos extra de espera después del primer mensaje,
               para capturar mensajes rápidos adicionales del bot (e.g. resumen + teclado).
        """
        cursor = self._cursor
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline and len(self._received) <= cursor:
            await asyncio.sleep(0.4)
        if len(self._received) <= cursor:
            self._cursor = len(self._received)
            return None
        if drain > 0:
            await asyncio.sleep(drain)
        self._cursor = len(self._received)
        return self._received[-1] if self._received else None

    def latest(self) -> Optional[str]:
        return self._received[-1] if self._received else None


async def wait_for_bot_response(client, chat_entity, timeout: int) -> Optional[str]:
    """Compat wrapper — registra handler, espera, retorna respuesta o None."""
    async with BotResponseCollector(client, chat_entity) as col:
        return await col.wait(timeout)


async def discover_bot_user_id(client, chat_id: int) -> Optional[int]:
    """Encuentra el user_id del financial-bot buscando en los participantes del grupo."""
    global BOT_USER_ID
    if BOT_USER_ID:
        return BOT_USER_ID
    try:
        async for member in client.iter_participants(chat_id):
            if getattr(member, 'bot', False):
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
                continue

            await asyncio.sleep(delay)
            try:
                await ensure_connected(client, acct)
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
    if scenario.get("type") == "chat":
        return await run_chat_scenario(clients, chat_entities, scenario, chat_id, dry_run)

    account  = scenario.get("account", "gv")
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
                "detail": f"cuenta {account} no disponible"}

    t0 = time.monotonic()
    bot_response = None

    if messages:
        print(f"  [{account.upper()}] -> {messages[0][:60]}")

    if not dry_run:
        # Registrar handler ANTES del send — no perdemos respuestas rápidas del bot
        async with BotResponseCollector(client, target) as col:
            if asset_spec or photo_type or doc_type:
                # ── Enviar asset generado por assets.py ─────────────────────
                try:
                    from assets import gen_for_tier
                    if asset_spec:
                        a_type, a_tier = asset_spec
                        data, meta = gen_for_tier(a_type, a_tier)
                        cap   = meta.get("caption", caption)
                        fname = meta.get("filename", "asset.bin")
                        is_doc = a_type == "cuadro_xlsx"
                        label = (f"[xlsx {fname}]"      if is_doc else
                                 f"[png cuadro sem{meta.get('semana','?')} "
                                 f"{meta.get('clientes','?')} clientes"
                                 + (f" +{meta['negativos']} neg" if meta.get('negativos') else "")
                                 + "]"                  if "cuadro" in a_type else
                                 f"[comprobante ${meta.get('monto', 0):,.0f}]")
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
                    try:
                        await ensure_connected(client, account)
                        buf = io.BytesIO(data)
                        buf.name = fname
                        await client.send_file(
                            target, buf,
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

                # drain=1s para assets — el bot puede mandar mensaje + teclado rápido
                bot_response = await col.wait(BOT_RESPONSE_TIMEOUT + 5, drain=1.0)

            elif messages:
                # ── Enviar mensajes de texto ─────────────────────────────────
                try:
                    await ensure_connected(client, account)
                    await client.send_message(target, messages[0])
                except Exception as send_err:
                    err_str = str(send_err).lower()
                    if 'cannot send request' in err_str or 'not connected' in err_str:
                        # Sesión Telethon stale — force reconnect + retry una vez
                        print(f"  [{account.upper()}] stale connection — force reconnect + retry")
                        reconnected = await ensure_connected(client, account, force=True)
                        if reconnected:
                            try:
                                await client.send_message(target, messages[0])
                            except Exception as retry_err:
                                return {"test_id": test_id, "passed": False,
                                        "detail": f"retry failed: {retry_err}", "bot_response": None}
                        else:
                            return {"test_id": test_id, "passed": False,
                                    "detail": "force reconnect failed", "bot_response": None}
                    else:
                        print(f"  WARNING: send_message failed ({account}): {send_err!r}")
                        if isinstance(target, int):
                            print(f"  WARNING: {account.upper()} not in group — add manually in Telegram")
                        return {"test_id": test_id, "passed": False,
                                "detail": f"send_message failed: {send_err}", "bot_response": None}
                # Primer mensaje: wait() estándar — avanzar cursor antes del siguiente send
                bot_response = await col.wait(BOT_RESPONSE_TIMEOUT)
                for i, msg in enumerate(messages[1:], 1):
                    await asyncio.sleep(DELAY_BETWEEN_MESSAGES)
                    print(f"  [{account.upper()}] -> {msg[:60]}")
                    # Avanzar cursor: las respuestas al mensaje anterior ya fueron procesadas
                    col.mark_consumed()
                    try:
                        await ensure_connected(client, account)
                        await client.send_message(target, msg)
                    except Exception as send_err:
                        print(f"  WARNING: send_message[{i}] failed ({account}): {send_err!r}")
                        break
                    if i == len(messages) - 1:
                        # Último mensaje: drain=2s para capturar secuencias rápidas del bot
                        # (e.g. "✅ Guardado" seguido de "📋 Resumen operación...")
                        r2 = await col.wait(BOT_RESPONSE_TIMEOUT, drain=2.0)
                        if r2:
                            bot_response = r2
    else:
        await asyncio.sleep(0.1)
        bot_response = "[dry-run]"

    duration_ms = int((time.monotonic() - t0) * 1000)

    # ── Evaluar resultado ─────────────────────────────────────────────────────
    if is_asistente or asset_spec or photo_type or doc_type:
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
            detail = f"DB actualizada: {bot_response[:60] if bot_response else 'sin resp'}"
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


async def resolve_group_entity(client, chat_id: int):
    """
    Resuelve la entidad del grupo para Telethon.
    Megagrupos son Channels internamente — get_entity(neg_int) falla con PeerIdInvalidError.
    """
    target_id = abs(chat_id)

    try:
        entity = await client.get_entity(PeerChannel(target_id))
        title = getattr(entity, 'title', '?')
        print(f"[engine] Entidad resuelta via PeerChannel: '{title}' (id={entity.id})")
        return entity
    except Exception as e:
        print(f"[engine] PeerChannel fallo: {e!r}")

    try:
        async for dialog in client.iter_dialogs():
            eid = getattr(dialog.entity, 'id', None)
            if eid == target_id:
                title = getattr(dialog.entity, 'title', '?')
                print(f"[engine] Entidad resuelta via iter_dialogs: '{title}' (id={eid})")
                return dialog.entity
    except Exception as e:
        print(f"[engine] iter_dialogs error: {e!r}")

    try:
        return await client.get_input_entity(PeerChannel(target_id))
    except Exception as e:
        print(f"[engine] get_input_entity PeerChannel fallo: {e!r}")

    print(f"[engine] WARNING: no se pudo resolver entidad {chat_id} — cuenta NO esta en el grupo")
    return chat_id


# ─── Relay: push de episodios para lectura en tiempo real ─────────────────────

def _push_episode_to_relay(episode_id: int, results: list, stats: dict, round_num: int):
    """
    Append episode result to relay/episode-results.jsonl and push to GitHub.
    Only runs every ROUNDS_PER_REPORT rounds to reduce git contention.
    Non-blocking: any failure is silently ignored.
    """
    import subprocess
    if round_num % ROUNDS_PER_REPORT != 0:
        return

    REPO_ROOT = Path(__file__).resolve().parents[4]
    results_file = REPO_ROOT / 'relay' / 'episode-results.jsonl'

    entry = {
        "episode_id": episode_id,
        "round_num": round_num,
        "ts": datetime.utcnow().isoformat() + 'Z',
        "score": round(stats.get('score', 0), 1),
        "passed": stats.get('passed', 0),
        "total": stats.get('total', 0),
        "results": [
            {
                "id": r.get("test_id", "?"),
                "passed": r.get("passed", False),
                "detail": (r.get("detail") or "")[:120],
            }
            for r in results
        ],
    }

    try:
        results_file.parent.mkdir(parents=True, exist_ok=True)
        with open(results_file, 'a') as f:
            f.write(json.dumps(entry, ensure_ascii=False) + '\n')

        branch = 'claude/financial-multiagent-system-YwtYQ'
        subprocess.run(['git', 'add', 'relay/episode-results.jsonl'],
                       cwd=REPO_ROOT, capture_output=True, timeout=10)
        subprocess.run(['git', 'commit', '--no-gpg-sign', '-m',
                        f'ep#{episode_id} r{round_num} {stats.get("score",0):.1f}%'],
                       cwd=REPO_ROOT, capture_output=True, timeout=15)
        subprocess.run(['git', 'push', 'origin', branch],
                       cwd=REPO_ROOT, capture_output=True, timeout=30)
        print(f"  [relay] ep#{episode_id} → episode-results.jsonl pushed")
    except Exception as e:
        print(f"  [relay] push skipped: {e}")


async def run_engine(rounds: int = 0, force_tier: int = 0, dry_run: bool = False):
    """
    Motor principal. rounds=0 -> infinito.
    """
    chat_id = get_chat_id()
    print(f"\n{'='*60}")
    print(f" Conversation Engine -- chat_id={chat_id}")
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
                print(f"[engine] {account.upper()} conectado como @{me.username or me.phone}")
                entity = await resolve_group_entity(c, chat_id)
                chat_entities[account] = entity
            else:
                print(f"[engine] {account.upper()} no autenticado -- corre setup-sessions.py")
        except Exception as e:
            print(f"[engine] Error conectando {account}: {e}")

    if not clients:
        print("[engine] Sin cuentas disponibles -- abortar")
        return

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
        print(f"[engine] Solo se usaran: {sorted(active_accounts)}\n")

    if not active_accounts:
        print("[engine] Ninguna cuenta tiene acceso al grupo -- abortar")
        return

    if not dry_run:
        set_asistente_mode(chat_id)

    main_account = next(acct for acct in ("gv", "noela", "kevin") if acct in active_accounts)
    main_client  = clients[main_account]
    main_entity  = chat_entities.get(main_account, chat_id)
    await discover_bot_user_id(main_client, main_entity)
    if not BOT_USER_ID:
        print("[engine] WARNING: financial-bot no detectado en el grupo.")
        print("[engine]    Verifica FIN_ALLOWED_CHAT_IDS y que el bot esté en el grupo.")

    round_num   = 0
    all_results = []

    while rounds == 0 or round_num < rounds:
        round_num += 1

        for acct in list(active_accounts):
            await ensure_connected(clients[acct], acct)

        tier = force_tier or _calculate_next_tier()
        print(f"\n{'─'*50}")
        print(f" Ronda #{round_num} | Tier {tier} | {datetime.now().strftime('%H:%M:%S')}")
        print(f"{'─'*50}")

        episode_id = None
        try:
            episode_id = start_episode(triggered_by="conversation_engine")
        except Exception as e:
            print(f"[learning] No se pudo iniciar episodio: {e}")

        def scenario_ok(s):
            if s.get("type") == "chat":
                return any(t.get("account") in active_accounts for t in s.get("turns", []))
            return s.get("account", "gv") in active_accounts

        scenarios = [s for s in gen_scenarios(tier, active_accounts) if scenario_ok(s)]
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

        if episode_id and round_results:
            try:
                stats = complete_episode(episode_id, round_results)
                print(f"\n Score ronda #{round_num}: {stats['score']:.1f}% "
                      f"({stats['passed']}/{stats['total']})")

                if round_num % ROUNDS_PER_REPORT == 0:
                    report = build_report(episode_id, round_results, stats)
                    post_to_telegram(report)

                dispatch_fix_if_needed(episode_id, round_results, stats)
                _push_episode_to_relay(episode_id, round_results, stats, round_num)
            except Exception as e:
                print(f"[learning] Error completando episodio: {e}")

        pause = random.uniform(5, 15)
        print(f"\n[engine] Pausa {pause:.0f}s antes de ronda #{round_num + 1}...")
        await asyncio.sleep(pause)

    for c in clients.values():
        await c.disconnect()

    total  = len(all_results)
    passed = sum(1 for r in all_results if r["passed"])
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
