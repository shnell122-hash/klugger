# Docker Sandbox — Guía para Agentes Claude Code

> Cualquier agente que opere en este repositorio **DEBE** correr dentro del sandbox Docker
> descrito aquí. Nunca correr `claude` directamente en el host sin el sandbox.

---

## Arquitectura de seguridad

```
┌─────────────────────────────────────────────────────────────┐
│  Staging server (178.104.135.160 / VPN 10.8.0.13)          │
│  Usuario: klugger                                           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Docker container (klugger-agent)                    │  │
│  │                                                      │  │
│  │  • Claude Code CLI (usuario: agent, no-root)         │  │
│  │  • GITHUB_TOKEN → solo vilarkptl-lang/klugger        │  │
│  │  • INFISICAL → secretos de proyecto (no Cloudflare)  │  │
│  │  • ~/.claude montado :ro  → auth Claude              │  │
│  │  • Sin acceso a red prod, sin tokens de Cloudflare   │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  GitHub Actions (separado, corre en la nube)               │
│  • CLOUDFLARE_API_TOKEN → solo vive aquí (GitHub Secrets)  │
│  • Dispara: push a branch testing → deploy a Pages         │
└─────────────────────────────────────────────────────────────┘
```

**Reglas absolutas:**
- El token de Cloudflare **nunca** entra al sandbox ni al repo
- El sandbox solo tiene PAT scoped a `vilarkptl-lang/klugger` (Contents R/W)
- Secretos de negocio (DB, APIs de terceros) → vía Infisical, no hardcodeados
- El agente hace push al repo → GitHub Actions hace el deploy a Cloudflare Pages

---

## Conexión al servidor

### Opción A — Mosh (recomendado, sobrevive cortes de VPN)

```
Host:    10.8.0.13  (VPN interna)  ó  178.104.135.160  (IP pública)
Usuario: klugger
Auth:    llave SSH  german_vilar_id_ed25519
Método:  Mosh (UDP 60000-61000)
```

En Termius: activar toggle **Use Mosh** en el host.

### Opción B — SSH directo

```bash
ssh klugger@10.8.0.13
# ó
ssh klugger@178.104.135.160
```

### Opción C — desde otro agente Claude Code (web/CLI)

```bash
# El sandbox web bloquea SSH directo; usar exec-lite si está disponible
# Para este servidor (vilar-dev-2) no hay exec-lite — usar SSH con sshpass si el puerto está abierto
sshpass -p '<password>' ssh -o StrictHostKeyChecking=no klugger@178.104.135.160 "comando"
```

---

## Setup inicial (una sola vez por servidor)

```bash
# 1. Conectarse como root
ssh root@178.104.135.160

# 2. Crear usuario klugger y agregar al grupo docker
id klugger &>/dev/null || useradd -m -s /bin/bash klugger
usermod -aG docker klugger

# 3. Clonar el sandbox (con PAT de GitHub)
GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
git clone https://x-access-token:${GITHUB_TOKEN}@github.com/vilarkptl-lang/klugger.git \
    --branch testing --depth 1 /opt/klugger-sandbox

# 4. Instalar dependencias y construir imagen
bash /opt/klugger-sandbox/docker-sandbox/setup.sh

# 5. Instalar mosh (para conexiones estables desde Termius)
apt-get install -y mosh
ufw allow 60000:61000/udp

# 6. Cambiar a klugger y autenticar Claude Code
su - klugger
claude auth login    # abre URL en browser → pegar código de vuelta
chmod 644 ~/.claude.json
chmod -R o+rX ~/.claude/
exit
```

---

## Ejecutar el agente

```bash
su - klugger

export GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# Con secretos de Infisical (recomendado)
export INFISICAL_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export INFISICAL_CLIENT_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Sin Infisical (solo para tareas que no necesitan secretos de negocio)
bash /opt/klugger-sandbox/docker-sandbox/run-agent.sh "Descripción de la tarea"

# Ver el agente en vivo
tmux attach -t klugger-agent
# Detach sin matar: Ctrl+B, D
```

---

## Secretos y autenticación

### Claude Code (auth del agente)

Se monta `~/.claude` y `~/.claude.json` del usuario `klugger` como read-only.
El agente hereda el OAuth/proxy configurado en el servidor.
**No se necesita `ANTHROPIC_API_KEY`.**

```bash
# Verificar que la auth está activa en el host
claude auth status

# Renovar si expiró
claude auth login
chmod 644 ~/.claude.json
```

### GitHub PAT (acceso al repo)

- Tipo: **fine-grained PAT**
- Scoped a: `vilarkptl-lang/klugger` únicamente
- Permisos: `Contents: Read/Write` + `Metadata: Read`
- Nunca dar acceso a otros repos ni a org-level

```bash
export GITHUB_TOKEN="ghp_..."
```

### Infisical (secretos de negocio dentro del sandbox)

El contenedor recibe las credenciales de máquina de Infisical y puede
fetchear secretos del proyecto en runtime. Nunca hardcodear en el repo.

```bash
export INFISICAL_CLIENT_ID="..."
export INFISICAL_CLIENT_SECRET="..."
# El run-agent.sh pasa estas vars al contenedor automáticamente si están definidas
```

Dentro del sandbox, el agente puede usar:
```bash
# Fetchear un secreto específico
infisical secrets get DATABASE_URL --env=staging

# Exportar todos los secretos al entorno
eval $(infisical export --env=staging --format=dotenv)
```

### Cloudflare (deploy a Pages)

**El token de Cloudflare NUNCA entra al sandbox.** El flujo es:

```
Agente → push a branch testing → GitHub Actions → wrangler deploy → Cloudflare Pages
```

El `CLOUDFLARE_API_TOKEN` vive solo en:
`github.com/vilarkptl-lang/klugger → Settings → Secrets → CLOUDFLARE_API_TOKEN`

---

## Patrones Docker para agentes

### Patrón 1 — Tarea de desarrollo estándar

```bash
# El agente edita código, hace commits y push
# GitHub Actions detecta el push y hace el deploy
bash /opt/klugger-sandbox/docker-sandbox/run-agent.sh \
  "Agrega la pestaña X al dashboard en dashboard-financial/"
```

### Patrón 2 — Tarea con secretos de negocio

```bash
export GITHUB_TOKEN="ghp_..."
export INFISICAL_CLIENT_ID="..."
export INFISICAL_CLIENT_SECRET="..."
bash /opt/klugger-sandbox/docker-sandbox/run-agent.sh \
  "Actualiza la integración con la API de pagos usando las credenciales de staging"
```

### Patrón 3 — Verificar qué está corriendo

```bash
# Ver sesiones activas
tmux ls

# Adjuntarse a la sesión del agente
tmux attach -t klugger-agent

# Ver logs del contenedor Docker
docker logs klugger-agent

# Ver si el contenedor está corriendo
docker ps --filter "name=klugger-agent"
```

### Patrón 4 — Matar y relanzar

```bash
# Matar sesión actual
tmux kill-session -t klugger-agent
docker stop klugger-agent 2>/dev/null || true

# Relanzar
bash /opt/klugger-sandbox/docker-sandbox/run-agent.sh "Nueva tarea"
```

### Patrón 5 — Reconstruir la imagen (después de cambios en Dockerfile)

```bash
# Como root
git -C /opt/klugger-sandbox pull
docker build -t klugger-agent /opt/klugger-sandbox/docker-sandbox/
```

---

## Límites del contenedor

| Recurso | Límite |
|---------|--------|
| RAM | 1 GB |
| CPU | 1.5 cores |
| Red | host (acceso a internet, no a red interna privada) |
| Turns máximos | 40 |
| Filesystem | Solo el repo clonado en `/home/agent/project` |

---

## Qué puede y no puede hacer el agente

| Permitido | Prohibido |
|-----------|-----------|
| Editar archivos del repo clonado | Escribir fuera de `/home/agent/project` |
| `git commit` y `git push` al repo klugger | Pushear a otros repos |
| Leer secretos de Infisical (proyecto klugger) | Acceder a secretos de otros proyectos |
| Hacer requests HTTP a internet | Acceder a servicios internos de red privada |
| Leer `~/.claude` (read-only) | Modificar credenciales del host |
| Usar `--max-turns 40` | Correr indefinidamente |

---

## Actualizar el sandbox

Cuando haya cambios en `docker-sandbox/` en el repo:

```bash
# Como root en el servidor
git config --global --add safe.directory /opt/klugger-sandbox
git -C /opt/klugger-sandbox pull

# Si cambió el Dockerfile, reconstruir imagen
docker build -t klugger-agent /opt/klugger-sandbox/docker-sandbox/
```

---

## Troubleshooting

| Síntoma | Causa | Fix |
|---------|-------|-----|
| `Not logged in` | `.claude.json` no legible por el contenedor | `chmod 644 ~/.claude.json && chmod -R o+rX ~/.claude/` |
| `[exited]` inmediato en tmux | Auth falla o error de inicio | `docker run --rm -it klugger-agent claude auth status` |
| `Permission denied` en git pull de `/opt/klugger-sandbox` | Repo es de root, klugger no puede | Hacer pull como root |
| Contenedor no encuentra imagen | Imagen no construida | `docker build -t klugger-agent /opt/klugger-sandbox/docker-sandbox/` |
| `no sessions` en tmux | Sesión ya terminó | Ver output: el agente termina y espera Enter; revisar task completada |
| SSH desconecta | VPN timeout | Usar Mosh en Termius + `ClientAliveInterval 30` en sshd_config |
