# Handoff / Skill — Agente de **klugger**: conexión a nivel de patrón

> **Principio rector (validado con el auditor):** este skill documenta **el procedimiento**,
> nunca direcciones ni credenciales. Todo destino y secreto se resuelve **en runtime** desde
> Infisical / step-ca por **nombre lógico**. Si una IP cambia o migras un servidor, el skill
> sigue válido; si se filtra, no revela tu topología.
>
> La regla: el skill contiene **referencias que se resuelven en runtime** (nombres lógicos
> como "el bastión", "staging", "el vault", "tu sandbox"). La resolución real —IP, cert,
> secreto— la hace Infisical/step-ca en el momento, no este archivo. El skill dice *qué hacer*,
> nunca *con qué credencial*.

---

## Alcance de acceso (operador, 2026-07-14)

| Destino | Acceso | Cómo |
|---------|--------|------|
| **staging** (dev-2, `sbx-klugger`) | **shell completo** | vía el **bastión turazive** (jump-only) |
| **prod** (prod-htz) | **solo deploy por CI/OIDC** — **sin SSH** | GitHub Actions → Infisical por OIDC |

> No hay shell SSH a prod. Cambios a prod solo por el **pipeline OIDC** (sección CI/CD abajo).

## Qué necesitas (nunca vive en el repo)

- Tu **machine identity de Infisical** (`INFISICAL_CLIENT_ID` / `INFISICAL_CLIENT_SECRET`) —
  te la entrega el operador por canal seguro; la exportas como variable de entorno.
- El `INFISICAL_WORKSPACE_ID` del proyecto (no es secreto, pero tampoco se hardcodea aquí:
  se pasa por env).
- Estar en la **red permitida** según el patrón (VPN / bastión).

## Procedimiento de conexión (nombres lógicos)

1. **Autentícate ante Infisical** con tu machine identity (desde env, nunca hardcodeada).
2. **Resuelve el destino por nombre lógico** — "staging", "tu sandbox klugger" — leyéndolo de
   Infisical en runtime. Nunca escribas una IP literal.
3. **Obtén tu credencial efímera** (llave SSH de Infisical o certificado corto de step-ca) en
   el momento; úsala y no la persistas en disco.
4. **Conéctate por el bastión / VPN** al destino resuelto.
5. **Trabaja solo en tu sandbox** (klugger). Sal con *detach*, nunca cierres la sesión ajena.

## Cómo se ejecuta (reusa los scripts que ya resuelven todo en runtime)

Los scripts de `deploy/accesos/` ya implementan este patrón (cero literales; todo por nombre):

```bash
export INFISICAL_CLIENT_ID='<tu-client-id>'          # de Infisical, por canal seguro
export INFISICAL_CLIENT_SECRET='<tu-client-secret>'
export INFISICAL_WORKSPACE_ID='<workspace-id>'

# Ruta recomendada — staging vía el bastión turazive (todo resuelto de Infisical, cero IPs):
bash deploy/accesos/connect-jumphost.sh klugger
# → baja tu llave (temp, shred) → salto por el bastión → docker exec sbx-klugger → tmux dev
# salir SIN cerrar: Ctrl-b b d · NUNCA 'exit'

# Alterna — VPN directa si tienes el túnel WireGuard arriba:
NAME=<tu-usuario> bash deploy/accesos/connect-sandbox.sh klugger
```

> `connect-sandbox.sh` resuelve `STAGING_SSH_HOST`, `SANDBOX_PREFIX` (→ `sbx-klugger`) y la
> sesión tmux desde Infisical en runtime. Ninguna IP ni llave vive en el skill.

## CI/CD sin secretos: GitHub Actions → Infisical por **OIDC**

**No** guardes la llave de Infisical en *GitHub Actions Secrets*. Eso invierte el modelo:
pondrías tu bóveda detrás de otra bóveda que no controlas, creando un "secret zero" de larga
vida en el sitio que históricamente más se te ha filtrado (tokens de GitHub, ya pasó).

El patrón correcto (ya recomendado por Infisical): **GitHub Actions se autentica *ante*
Infisical por OIDC** y recibe un token **efímero** scoped a este repo/branch. Cero secretos de
larga vida almacenados.

- El workflow presenta su token OIDC (firmado por GitHub).
- Infisical verifica issuer + subject (`repo:<org>/klugger:*`) y devuelve un token de vida corta.
- Los secretos se inyectan como env del job y **mueren con el job**.

Plantilla lista para copiar al repo de klugger: **`deploy/ci/klugger-secrets-oidc.yml`**
→ va en `klugger/.github/workflows/`. El `identity-id` y el `domain` NO son secretos (son
referencias públicas); lo que autentica es la firma OIDC, no un valor almacenado.

## Agente interactivo — sandbox `sbx-klugger` (dos caminos)

El agente de dev trabaja en el sandbox **`sbx-klugger`** en staging (dev-2). Se conecta con
su **machine identity de Infisical** (Universal Auth, scoped a `/klugger`); host y sesión se
resuelven en runtime. Hay dos rutas — elige según desde dónde estés:

**Setup común (una vez):**
```bash
git clone --filter=blob:none --sparse -b sandbox-fidelity git@github.com:vilarkptl-lang/agentic-repo.git
cd agentic-repo && git sparse-checkout set deploy/accesos .claude/commands && chmod +x deploy/accesos/*.sh
export INFISICAL_CLIENT_ID=⟨tu-client-id de klugger-agent⟩
export INFISICAL_CLIENT_SECRET=⟨German te lo pasa⟩
export INFISICAL_WORKSPACE_ID=a9fa59c9-26a9-4417-a035-ac8d857c7e50
export SECRET_PATH=/klugger        # tu identity solo ve este subpath
```

### Camino A — VPN directa (tienes el túnel WireGuard del sistema arriba)
```bash
NAME=⟨tu-usuario⟩ bash deploy/accesos/connect-sandbox.sh klugger
# → ssh a staging (resuelto de Infisical) → docker exec sbx-klugger → tmux attach dev
# salir sin cerrar: Ctrl-b b d  · nunca 'exit'
```

### Camino B — vía **turazive** como jump host ✅ (provisionado y verificado 2026-07-08)
turazive es un **bastión jump-only** (sin shell; `permitopen` **solo a staging:22**). No
necesitas VPN propia — basta con estar en la LAN del bastión. **Todo se resuelve de Infisical
en runtime** (tu llave, el bastión, staging): el script no tiene ni una IP.
```bash
export INFISICAL_CLIENT_ID=⟨tu-client-id de klugger-agent⟩
export INFISICAL_CLIENT_SECRET=⟨German te lo pasa⟩
bash deploy/accesos/connect-jumphost.sh klugger
# → baja tu llave de Infisical (temp, shred) → salto por el bastión → docker exec sbx-klugger → tmux dev
# salir sin cerrar: Ctrl-b b d · nunca 'exit'
```
> El bastión (`command=/bin/false`, `restrict`, `permitopen="staging:22"`) no da shell ni rutas
> extra — solo reenvía a staging. En staging entras como usuario `klugger` (grupo docker), no root.
> Tu llave privada vive en Infisical (`KLUGGER_SSH_PRIVATE_KEY`), nunca en disco.

**Prerrequisitos del sandbox (operador, pendientes):**
- **Clonar el repo klugger** dentro del workspace (`/opt/klugger-sandbox`) con `GITHUB_TOKEN`
  (vive en Infisical) — hoy el workspace está vacío; el agente puede clonarlo adentro.
- **`claude setup-token`** → `CLAUDE_CODE_OAUTH_TOKEN` en Infisical: hasta entonces el Claude
  *dentro* del sandbox no autentica por suscripción (afecta a todos los sandboxes, no solo klugger).

## Estado 2026-07-07 — OIDC configurado en Infisical

Setup de una sola vez ya aplicado del lado de Infisical (el `identity-id` **no es secreto**
—es una referencia pública, como un `client_id`—; lo que autentica es la firma OIDC):

| Elemento | Valor |
|----------|-------|
| Machine identity | `klugger-ci` — id `5e318b14-d7cb-426d-80ba-68555eefc122` |
| Auth | **OIDC**, issuer `token.actions.githubusercontent.com`, bound a `repo:vilarkptl-lang/klugger:ref:refs/heads/main`, TTL 600s |
| Alcance en el proyecto | `no-access` + privilegio de **lectura solo en `env=prod, path=/klugger`** (mínimo privilegio, fail-closed) |

**Pendiente del operador (una vez):**
1. En el repo `klugger` → *Settings → Secrets and variables → Actions → Variables* (NO secrets):
   `INFISICAL_IDENTITY_ID` = `5e318b14-d7cb-426d-80ba-68555eefc122` · `INFISICAL_DOMAIN` = `https://sha.vilarkptl.com`
2. Copiar `deploy/ci/klugger-secrets-oidc.yml` → `klugger/.github/workflows/`.
3. Cargar los secretos de klugger en Infisical bajo `env prod, path /klugger`.
4. `workflow_dispatch` → valida el round-trip OIDC.

> ⚠️ Único punto sin verificar E2E (no hay runner aquí): `boundAudiences` = `https://github.com/vilarkptl-lang`
> (default de GitHub). Si el primer run falla por *audience mismatch*, el `aud` real está en el log del
> Action y el ajuste es una línea.

## 🚫 NO HACER

- ❌ **No hardcodear** IPs, hosts, llaves ni tokens en este skill ni en ningún archivo del repo.
- ❌ **No** guardar `INFISICAL_CLIENT_SECRET` (ni ninguna llave de Infisical) en GitHub Secrets
  como llave maestra — usa OIDC.
- ❌ No `wg-quick down/up` en máquinas con túnel compartido; reúsa el existente.
- ❌ Solo tu proyecto (`sbx-klugger`); nada destructivo fuera de tu scope; no toques producción directo.
- ❌ No `ANTHROPIC_API_KEY` — Claude solo por CLI proxy / suscripción.

## Resumen en una línea

**Resuelve destino y credencial en runtime desde Infisical/step-ca por nombre lógico; en CI,
que GitHub se autentique ante Infisical por OIDC en vez de guardar la llave de tu bóveda.**
