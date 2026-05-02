# MTProto Sims — T01-T10

Simula usuarios reales (GV, Noela, Kevin) usando Telethon para bypassear el filtro bot-to-bot de Telegram.

## Setup (una sola vez)

```bash
cd financial/bot/sims/mtproto

# 1. Crear virtualenv e instalar Telethon
./setup-venv.sh

# 2. Autenticar las 3 cuentas (necesitas los 3 teléfonos físicos)
./venv/bin/python setup-sessions.py
```

El script pedirá:
- `MTPROTO_API_ID` y `MTPROTO_API_HASH` — obtenerlos en https://my.telegram.org (una vez, sirven para las 3 cuentas)
- Número de teléfono + código OTP para cada cuenta (GV, Noela, Kevin)

Las sesiones se guardan en `sessions/gv.session`, `sessions/noela.session`, `sessions/kevin.session`.
El `.gitignore` excluye estos archivos (contienen tokens de acceso).

## Variables requeridas en `financial/.env`

```env
MTPROTO_API_ID=12345678
MTPROTO_API_HASH=abcdef1234567890abcdef1234567890
SIM_CHAT_ID=-5142407305
```

## Correr la suite

```bash
# Suite completa T01-T10
./venv/bin/python suite.py

# Solo algunos tests
./venv/bin/python suite.py T01 T02 T03 T04

# T08, T09, T10 no requieren autenticación MTProto (solo DB y HTTP)
./venv/bin/python suite.py T08 T09 T10
```

## Tests que requieren assets binarios (T05/T06/T07)

Actualmente marcados como SKIP. Requieren:
- `../assets/comprobante-foto.jpg`
- `../assets/cuadro-retorno-sem14.xlsx`
- `../assets/audio-instrucciones.ogg`

Ver `../assets/README.md` para instrucciones de creación.

## Estructura de archivos

```
mtproto/
├── .gitignore          # excluye venv/ y sessions/
├── requirements.txt    # telethon==1.36.0
├── setup-venv.sh       # crea virtualenv
├── setup-sessions.py   # autenticación interactiva
├── client.py           # helper: get_client(), env(), chat_id()
└── suite.py            # T01-T10
```
