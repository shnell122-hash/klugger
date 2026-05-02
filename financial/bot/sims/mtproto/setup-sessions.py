#!/usr/bin/env python3
"""
setup-sessions.py — Autenticación MTProto para las 3 cuentas simuladoras.

Ejecutar UNA SOLA VEZ por cuenta. Guarda archivos de sesión .session
en el mismo directorio. Después, suite.py puede correr sin intervención.

Requisitos:
  - Obtener api_id y api_hash en https://my.telegram.org (cualquier cuenta)
  - Tener acceso físico a los 3 teléfonos para recibir el OTP de Telegram

Uso:
  python3 setup-sessions.py
"""

import asyncio
import os
import sys
from pathlib import Path

try:
    from telethon.sync import TelegramClient
    from telethon.errors import SessionPasswordNeededError
except ImportError:
    print("ERROR: Telethon no instalado. Corre primero: ./setup-venv.sh")
    sys.exit(1)

SESSIONS_DIR = Path(__file__).parent / "sessions"
SESSIONS_DIR.mkdir(exist_ok=True)

ACCOUNTS = [
    {"name": "gv",         "label": "GV (German Vilar)"},
    {"name": "noela",      "label": "Noela"},
    {"name": "kevin",      "label": "Kevin"},
]


def read_env(key: str) -> str:
    """Lee variable del financial/.env (dos niveles arriba de mtproto/)"""
    env_path = Path(__file__).parent.parent.parent.parent / ".env"
    if not env_path.exists():
        env_path = Path("/var/www/html/vilarkptl.com/ai-monitor/financial/.env")
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith(f"{key}="):
                return line.split("=", 1)[1].strip()
    return ""


def auth_account(api_id: int, api_hash: str, name: str, label: str):
    session_file = str(SESSIONS_DIR / name)
    client = TelegramClient(session_file, api_id, api_hash)
    client.connect()

    if client.is_user_authorized():
        me = client.get_me()
        print(f"  ✅ {label} ya autenticado como @{me.username or me.phone}")
        client.disconnect()
        return

    phone = input(f"\n  Número de teléfono para {label} (formato +521...): ").strip()
    client.send_code_request(phone)
    code = input(f"  Código OTP recibido en el teléfono de {label}: ").strip()

    try:
        client.sign_in(phone, code)
    except SessionPasswordNeededError:
        password = input(f"  Contraseña 2FA para {label}: ").strip()
        client.sign_in(password=password)

    me = client.get_me()
    print(f"  ✅ {label} autenticado como @{me.username or me.phone}")
    client.disconnect()


def main():
    print("=" * 60)
    print(" setup-sessions.py — Autenticación MTProto")
    print("=" * 60)
    print()

    api_id_str = read_env("MTPROTO_API_ID")
    api_hash = read_env("MTPROTO_API_HASH")

    if not api_id_str or not api_hash:
        print("AVISO: MTPROTO_API_ID o MTPROTO_API_HASH no encontrados en .env")
        print("Obtén estos valores en https://my.telegram.org")
        print()
        api_id_str = input("  MTPROTO_API_ID: ").strip()
        api_hash = input("  MTPROTO_API_HASH: ").strip()
        print()
        print(f"Agrega estas líneas a financial/.env para no pedirlos de nuevo:")
        print(f"  MTPROTO_API_ID={api_id_str}")
        print(f"  MTPROTO_API_HASH={api_hash}")
        print()

    api_id = int(api_id_str)

    print(f"Directorio de sesiones: {SESSIONS_DIR}")
    print()

    for acc in ACCOUNTS:
        print(f"── Autenticando {acc['label']} ──")
        try:
            auth_account(api_id, api_hash, acc["name"], acc["label"])
        except KeyboardInterrupt:
            print(f"\n  Saltando {acc['label']}")
            continue
        except Exception as e:
            print(f"  ❌ Error en {acc['label']}: {e}")
            continue

    print()
    print("=" * 60)
    print(" Sesiones guardadas en:", SESSIONS_DIR)
    print(" Ahora puedes correr: python3 suite.py")
    print("=" * 60)


if __name__ == "__main__":
    main()
