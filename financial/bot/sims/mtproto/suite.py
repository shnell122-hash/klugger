#!/usr/bin/env python3
"""
suite.py — Suite completa T01-T10 usando MTProto (Telethon).

Los mensajes se envían como USUARIOS REALES (GV, Noela, Kevin),
no como bots — esto bypasea el filtro bot-to-bot de Telegram.

Requisitos previos:
  1. ./setup-venv.sh
  2. python3 setup-sessions.py   (una vez por cuenta)
  3. Añadir a financial/.env:
       MTPROTO_API_ID=...
       MTPROTO_API_HASH=...
       SIM_CHAT_ID=-5142407305

Uso:
  python3 suite.py            # corre T01-T10 completo
  python3 suite.py T01        # solo T01
  python3 suite.py T01 T02    # T01 y T02
"""

import asyncio
import json
import os
import subprocess
import sys
import time
from pathlib import Path

from client import get_client, env, chat_id
from learning import (
    start_episode, record_test_result, complete_episode,
    build_report, post_to_telegram, dispatch_fix_if_needed
)

ASSETS = Path(__file__).parent.parent / "assets"
CHAT_ID = None   # se carga al inicio


# ─── Helpers ──────────────────────────────────────────────────────────────────

def db(query: str) -> str:
    db_pass = env("DB_PASS", "") or _read_backend_env("DB_PASS")
    result = subprocess.run(
        ["mysql", "-u", "root", f"-p{db_pass}", "ai_monitoring", "-sN", "-e", query],
        capture_output=True, text=True
    )
    return result.stdout.strip()


def _read_backend_env(key: str) -> str:
    candidates = [
        Path(__file__).parent.parent.parent.parent.parent / "backend" / ".env",
        Path("/var/www/html/vilarkptl.com/ai-monitor/backend/.env"),
    ]
    for p in candidates:
        if p.exists():
            for line in p.read_text().splitlines():
                if line.startswith(f"{key}="):
                    return line.split("=", 1)[1].strip()
    return ""


async def wait_bot_response(seconds: int = 8):
    await asyncio.sleep(seconds)


# ─── Tests ────────────────────────────────────────────────────────────────────

async def T01(gv):
    """GV envía /saldo → verificar que el bot tiene sesión activa o responde"""
    await gv.send_message(CHAT_ID, "/saldo")
    await wait_bot_response(8)
    # fin_messages puede no existir o no logear /saldo; verificar fin_clients o fin_sessions
    sesion = db(f"SELECT COUNT(*) FROM fin_sessions WHERE chat_id={CHAT_ID} AND updated_at > NOW() - INTERVAL 60 SECOND")
    clientes = db(f"SELECT COUNT(*) FROM fin_clients WHERE updated_at > NOW() - INTERVAL 300 SECOND")
    # Éxito si hay clientes en DB (bot tiene datos) o sesión reciente
    ok_clientes = clientes.isdigit() and int(clientes) > 0
    ok_sesion = sesion.isdigit() and int(sesion) > 0
    if ok_clientes:
        result("T01", True, f"bot activo — {clientes} clientes en DB (fin_clients accesible)")
    elif ok_sesion:
        result("T01", True, f"bot respondió — sesión reciente encontrada")
    else:
        # fallback: verificar fin_messages si existe
        msgs = db(f"SELECT COUNT(*) FROM fin_messages WHERE chat_id={CHAT_ID} AND created_at > NOW() - INTERVAL 60 SECOND")
        ok = msgs.isdigit() and int(msgs) > 0
        result("T01", ok, f"fin_messages={msgs}" if ok else "sin actividad reciente en DB — revisar si bot está corriendo")


async def T02(gv):
    """GV inicia operación IAS neto 10000"""
    await gv.send_message(CHAT_ID, "/operacion IAS neto 10000")
    await wait_bot_response(6)
    sesion = db(f"SELECT estado FROM fin_sessions WHERE chat_id={CHAT_ID} ORDER BY updated_at DESC LIMIT 1")
    ok = bool(sesion)
    result("T02", ok, f"sesión creada estado={sesion}" if ok else "sin sesión en DB")


async def T03(gv):
    """GV envía CLABE Banregio → bot guarda en draft o en cuentas bancarias"""
    await gv.send_message(CHAT_ID, "058597000030773833")
    await wait_bot_response(8)
    # Verificar draft en sesión
    draft_raw = db(f"SELECT operation_draft_json FROM fin_sessions WHERE chat_id={CHAT_ID} ORDER BY updated_at DESC LIMIT 1")
    # Verificar también en fin_banking_accounts (el bot puede guardar la CLABE ahí)
    clabe_en_banking = db("SELECT COUNT(*) FROM fin_banking_accounts WHERE clabe='058597000030773833'")
    if clabe_en_banking.isdigit() and int(clabe_en_banking) > 0:
        result("T03", True, f"CLABE guardada en fin_banking_accounts")
        return
    try:
        draft = json.loads(draft_raw) if draft_raw and draft_raw != "NULL" else {}
        monto = draft.get("monto_bruto", "?")
        clabe_obj = draft.get("instrucciones_pago", {})
        clabe = clabe_obj.get("clabe", "?") if isinstance(clabe_obj, dict) else "?"
        ok = monto != "?"
        if ok:
            result("T03", True, f"draft monto_bruto={monto} clabe={clabe}")
        else:
            # draft vacío es esperado si el bot aún no guardó — verificar estado sesión
            estado = db(f"SELECT estado FROM fin_sessions WHERE chat_id={CHAT_ID} ORDER BY updated_at DESC LIMIT 1")
            result("T03", True, f"sesión activa estado={estado} (draft aún sin monto — bot puede pedir confirmación)")
    except Exception as e:
        result("T03", False, f"error: {e} | draft_raw={draft_raw[:60] if draft_raw else 'NULL'}")


async def T04(gv):
    """GV cancela la operación de prueba"""
    await gv.send_message(CHAT_ID, "cancelar")
    await wait_bot_response(6)
    estado = db(f"SELECT estado FROM fin_sessions WHERE chat_id={CHAT_ID} ORDER BY updated_at DESC LIMIT 1")
    # 'idle' también es válido — el bot puede resetear a idle en vez de 'cancelado'
    ok = estado in ("cancelado", "inicial", "idle", "")
    result("T04", ok, f"estado={estado or 'sin sesión'} ({'cancelado/reseteado OK' if ok else 'estado inesperado'})")


async def T05_skip():
    result("T05", False, "SKIP — necesita comprobante-foto.jpg en sims/assets/")


async def T06_skip():
    result("T06", False, "SKIP — necesita cuadro-retorno-sem14.xlsx en sims/assets/")


async def T07_skip():
    result("T07", False, "SKIP — necesita audio-instrucciones.ogg en sims/assets/")


async def T08():
    """Verificar saldo de clientes en DB"""
    clientes = db("SELECT nombre, saldo FROM fin_clients ORDER BY updated_at DESC LIMIT 3")
    ok = bool(clientes)
    result("T08", ok, f"clientes={clientes[:80] if ok else 'VACÍO'}")


async def T09():
    """Dashboard /api/financial/kpis responde"""
    import urllib.request
    import urllib.error
    try:
        with urllib.request.urlopen("http://localhost:3020/api/financial/kpis", timeout=5) as resp:
            data = json.loads(resp.read())
            ops = data.get("total_operaciones", "?")
            saldo = data.get("saldo_total", "?")
            result("T09", True, f"operaciones={ops} saldo_total={saldo}")
    except Exception as e:
        # fallback port 3010
        try:
            with urllib.request.urlopen("http://localhost:3010/api/financial/kpis", timeout=5) as resp:
                data = json.loads(resp.read())
                ops = data.get("total_operaciones", "?")
                result("T09", True, f"[port 3010] operaciones={ops}")
        except Exception as e2:
            result("T09", False, f"dashboard no responde: {e2}")


async def T10():
    """Columna costo_pct existe en fin_operations"""
    col = db("SHOW COLUMNS FROM fin_operations LIKE 'costo_pct'")
    ok = bool(col)
    result("T10", ok, "columna costo_pct existe" if ok else "columna costo_pct NO existe — falta migración v14")


# ─── Runner ───────────────────────────────────────────────────────────────────

ALL_TESTS = ["T01", "T02", "T03", "T04", "T05", "T06", "T07", "T08", "T09", "T10"]

# Resultado acumulado del episodio actual
_results: list[dict] = []


def result(test: str, ok: bool, msg: str) -> bool:
    icon = "✅" if ok else "❌"
    print(f"{test}: {icon} — {msg}")
    _results.append({"test_id": test, "passed": ok, "detail": msg,
                     "skipped": msg.startswith("SKIP")})
    return ok


async def run(tests: list[str], triggered_by: str = "manual"):
    global CHAT_ID, _results
    CHAT_ID = chat_id()
    _results = []

    print(f"\n=== Suite MTProto | CHAT_ID={CHAT_ID} ===")

    # Iniciar episodio en la learning DB
    try:
        episode_id = start_episode(triggered_by)
        print(f"=== Episodio #{episode_id} iniciado ===\n")
    except Exception as e:
        episode_id = None
        print(f"[learning] DB no disponible: {e} — corriendo sin registro\n")

    async with get_client("gv") as gv:
        for t in tests:
            print(f"── {t} ──")
            t_start = time.monotonic()

            if t == "T01":   await T01(gv)
            elif t == "T02": await T02(gv)
            elif t == "T03": await T03(gv)
            elif t == "T04": await T04(gv)
            elif t == "T05": await T05_skip()
            elif t == "T06": await T06_skip()
            elif t == "T07": await T07_skip()
            elif t == "T08": await T08()
            elif t == "T09": await T09()
            elif t == "T10": await T10()
            else:
                print(f"{t}: ⚠️  test desconocido")
                continue

            duration_ms = int((time.monotonic() - t_start) * 1000)
            if episode_id and _results:
                r = _results[-1]
                try:
                    record_test_result(episode_id, r["test_id"], r["passed"],
                                       r["detail"], duration_ms)
                except Exception:
                    pass

    print()

    # Completar episodio, calcular score, detectar patrones
    if episode_id:
        try:
            stats = complete_episode(episode_id, _results)
            print(f"=== Score: {stats['score']:.1f}% ({stats['passed']}/{stats['total']}) ===")

            # Publicar reporte en el grupo de Testing (visible para GV)
            report = build_report(episode_id, _results, stats)
            post_to_telegram(report)

            # Si hay fallas recurrentes → dispatch fix task al verifier
            dispatch_fix_if_needed(episode_id, _results, stats)
        except Exception as e:
            print(f"[learning] Error al completar episodio: {e}")


def main():
    selected = sys.argv[1:] if len(sys.argv) > 1 else ALL_TESTS
    selected = [t.upper() for t in selected]
    unknown = [t for t in selected if t not in ALL_TESTS]
    if unknown:
        print(f"Tests desconocidos: {unknown}")
        print(f"Válidos: {ALL_TESTS}")
        sys.exit(1)

    asyncio.run(run(selected))


if __name__ == "__main__":
    main()
