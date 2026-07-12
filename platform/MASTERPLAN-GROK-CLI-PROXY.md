# /masterplan — Grok vía CLI proxy (progrok, OAuth SuperGrok) en dev-2

> Orden: SEGURIDAD → CALIDAD → COSTO. Orquestador: Opus 4.8.
> Motiva: german quiere **Grok conectado sin pasar `XAI_API_KEY`**, usando el **OAuth de su suscripción SuperGrok / X Premium+**. Así los agentes/pipelines/LiteLLM consumen Grok con su cuota, sin manejar keys.
> Base: memoria `grok-cli-proxy-progrok`. **No da acceso gratis** más allá de la suscripción; **no** reemplaza costo, evita el manejo de API keys.

## Enfoque elegido

**`progrok`** — proxy local **OpenAI-compatible** con login OAuth una sola vez:
- `npm install -g progrok`
- `progrok login --device-code`  (flujo headless: da código + URL; german autoriza en su navegador — igual que el device-code de Gemini que ya hicimos)
- `progrok proxy`  → levanta `http://127.0.0.1:18645/v1` (el proxy inyecta el token OAuth; los clientes usan `api_key="anything"`)

Cualquier cliente OpenAI-compatible (SDK OpenAI, LiteLLM, nuestros agentes) apunta ahí. Alternativa oficial para uso interactivo/TUI: **xAI Grok CLI** (`curl -fsSL https://x.ai/cli/install.sh | bash`).

## Tabla de tareas

| # | Tarea → Subtareas | Owner/Modelo | Ola | Deps | Verificación |
|---|-------------------|--------------|-----|------|--------------|
| 1 | **Instalar `progrok`** (npm global) en dev-2 + verificar CLI | **TÚ** | 1 | node ✅ | `progrok --version` OK |
| 2 | **OAuth device-code** (`progrok login --device-code`): capturo código+URL en tmux, **german autoriza** con su cuenta SuperGrok, inyecto/confirmo | **TÚ** (setup) + **OPERADOR** (autoriza) | 2 | 1, SuperGrok activo | `~/.progrok/auth.json` creado; sesión válida |
| 3 | **Proxy como servicio persistente** (systemd unit `progrok-proxy`, bind `127.0.0.1:18645`, restart on-failure) — no exponer a la red | **TÚ** (infra) | 3 | 2 | `systemctl is-active progrok-proxy` = active; escucha solo en loopback |
| 4 | **Smoke test del endpoint** (curl `/v1/chat/completions` con un modelo grok → respuesta; `/v1/models` lista modelos) | **TÚ** | 3 | 3 | 200 + respuesta de Grok |
| 5 | **Integrar con LiteLLM** (agregar Grok vía el proxy como `model` en la config de LiteLLM `localhost:4000`) — para que los agentes lo consuman por el router existente | **TÚ** + Sonnet | 4 | 4 | LiteLLM enruta a Grok por el proxy; llamada de prueba OK |
| 6 | **(Opcional) xAI Grok CLI oficial** para uso interactivo/TUI (`grok`) | **TÚ** | 4 ∥ | — | `grok -p "hola"` responde |

## Reglas de paralelización
- Secuencial 1→2→3→4 (dependen). LiteLLM (5) y CLI oficial (6) tras el proxy. Todo lo de OAuth/tokens/infra = orquestador; la **autorización OAuth la hace el operador**.

## Seguridad (gate duro)
- Token OAuth en `~/.progrok/auth.json` → **credencial sensible**; permisos `600`; **nunca** a repo/log/chat.
- Proxy **solo en loopback** (`127.0.0.1:18645`); si algún agente en contenedor lo necesita, exponer vía red interna controlada, no al mundo.
- **No** usar proxies de dudosa procedencia (Docker de repos random = riesgo/ToS). Solo `progrok` (open-source, `lidge-jun/progrok`) o el CLI oficial de xAI.
- Fallback `XAI_API_KEY` documentado pero **no** es el objetivo (el objetivo es OAuth sin key).

## Gate de smoke tests
1. `progrok --version` OK.
2. Login OAuth completo; `~/.progrok/auth.json` presente (600).
3. `progrok-proxy` activo como systemd; escucha solo en `127.0.0.1:18645`.
4. `curl 127.0.0.1:18645/v1/chat/completions` con modelo grok → 200 + respuesta.
5. (Si Ola 5) LiteLLM enruta a Grok por el proxy.

## Pendientes del operador
- **Suscripción SuperGrok / X Premium+ activa** (requisito del flujo OAuth).
- **Autorizar el device-code** (paso 2) — como el OAuth de Gemini: abres URL, metes el código, autorizas con tu cuenta X/SuperGrok.
- Decidir si se **integra a LiteLLM** (recomendado: los agentes ya usan ese router) o se consume el endpoint directo.
- Verificación en vivo: `progrok` y el nombre exacto del modelo (`grok-4.x`) se confirman al instalar; si el paquete/flujo cambió, se ajusta.
