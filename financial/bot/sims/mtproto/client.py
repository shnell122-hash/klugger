"""
client.py — Helper para obtener clientes Telethon autenticados.
Todos los sims importan desde aquí para evitar duplicación.
"""

import os
import re
import subprocess
from pathlib import Path

try:
    from telethon import TelegramClient
except ImportError as exc:
    raise ImportError("Telethon no instalado. Corre: ./setup-venv.sh") from exc

SESSIONS_DIR = Path(__file__).parent / "sessions"
_ENV_CACHE: dict = {}


def _load_env() -> dict:
    global _ENV_CACHE
    if _ENV_CACHE:
        return _ENV_CACHE

    candidates = [
        Path(__file__).parent.parent.parent.parent / ".env",
        Path("/var/www/html/vilarkptl.com/ai-monitor/financial/.env"),
    ]
    for path in candidates:
        if path.exists():
            with open(path) as f:
                for line in f:
                    line = line.strip()
                    if "=" in line and not line.startswith("#"):
                        k, v = line.split("=", 1)
                        _ENV_CACHE[k.strip()] = v.strip()
            return _ENV_CACHE

    raise FileNotFoundError("No se encontró financial/.env")


def env(key: str, default: str = "") -> str:
    return _load_env().get(key, default)


def read_backend_env(key: str) -> str:
    """Lee una variable del backend/.env (separado del financial/.env)."""
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


def get_client(account: str) -> TelegramClient:
    """
    account: 'gv' | 'noela' | 'kevin'
    """
    api_id = int(env("MTPROTO_API_ID"))
    api_hash = env("MTPROTO_API_HASH")
    session_file = str(SESSIONS_DIR / account)
    return TelegramClient(session_file, api_id, api_hash)


def chat_id() -> int:
    val = env("SIM_CHAT_ID")
    if not val:
        raise ValueError("SIM_CHAT_ID no encontrado en .env")
    return int(val)
