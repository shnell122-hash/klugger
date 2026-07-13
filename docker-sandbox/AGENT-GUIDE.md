# Docker Sandbox — Guía para Agentes Claude Code

> Cualquier agente que opere en un repositorio con este sandbox **DEBE** correr dentro
> del contenedor Docker descrito aquí. Nunca ejecutar `claude` directamente en el host.

---

## Arquitectura de seguridad

```
┌─────────────────────────────────────────────────────────────────┐
│  Servidor de staging                                            │
│  IP pública: <SERVER_IP>  |  IP VPN: <VPN_IP>                  │
│  Usuario del agente: <AGENT_USER>                               │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Docker container (imagen: <IMAGE_NAME>)               │    │
│  │                                                        │    │
│  │  • Claude Code CLI (usuario no-root dentro)            │    │
│  │  • GITHUB_TOKEN → scoped solo al repo del proyecto     │    │
│  │  • INFISICAL → secretos de negocio (no tokens de prod) │    │
│  │  • ~/.claude montado :ro → auth de Claude heredada     │    │
│  │  • Sin tokens de Cloudflare, AWS, ni infra de prod     │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
│  GitHub Actions (corre en la nube, separado del servidor)      │
│  • CLOUDFLARE_API_TOKEN / credenciales de deploy               │
│  • Solo se activa por push al repo — el agente nunca lo ve     │
└─────────────────────────────────────────────────────────────────┘
```

**Reglas absolutas:**
- Tokens de deploy (Cloudflare, AWS, etc.) **nunca** entran al sandbox
- El sandbox solo tiene un PAT de GitHub scoped al repo del proyecto
- Secretos de negocio → vía Infisical, nunca hardcodeados
- El agente hace push → CI/CD hace el deploy automáticamente

---

## Conexión al servidor

### Opción A — Mosh (recomendado para conexiones VPN/móviles)

Mosh sobrevive cortes de red, cambios de IP y suspensión del dispositivo.

```
Host:    <VPN_IP>  ó  <SERVER_IP>
Usuario: <AGENT_USER>
Auth:    llave SSH
Método:  Mosh (requiere UDP 60000-61000 abierto en el firewall)
```

En **Termius**: Edit Host → SSH/MOSH → activar toggle **Use Mosh**.

Instalar mosh en el servidor (una sola vez):
```bash
apt-get install -y mosh
ufw allow 60000:61000/udp
```

### Opción B — SSH directo

```bash
ssh <AGENT_USER>@<VPN_IP>
# ó por IP pública si no hay VPN:
ssh <AGENT_USER>@<SERVER_IP>
```

### Opción C — desde otro agente Claude Code

```bash
sshpass -p '<PASSWORD>' ssh -o StrictHostKeyChecking=no \
    <AGENT_USER>@<SERVER_IP> "comando"
```

---

## Setup inicial (una sola vez por servidor)

```bash
# ── Como root ─────────────────────────────────────────────────────────────────

# 1. Crear usuario del agente y agregarlo al grupo docker
id <AGENT_USER> &>/dev/null || useradd -m -s /bin/bash <AGENT_USER>
usermod -aG docker <AGENT_USER>

# 2. Configurar SSH keepalive para evitar desconexiones
grep -q "^ClientAliveInterval" /etc/ssh/sshd_config || {
  echo "ClientAliveInterval 30" >> /etc/ssh/sshd_config
  echo "ClientAliveCountMax 10" >> /etc/ssh/sshd_config
  systemctl reload sshd
}

# 3. Clonar el sandbox desde el repo
GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
git clone https://x-access-token:${GITHUB_TOKEN}@github.com/<ORG>/<REPO>.git \
    --branch <BRANCH> --depth 1 /opt/<REPO>-sandbox

# 4. Instalar dependencias y construir imagen Docker
bash /opt/<REPO>-sandbox/docker-sandbox/setup.sh

# ── Como <AGENT_USER> ─────────────────────────────────────────────────────────
su - <AGENT_USER>

# 5. Autenticar Claude Code (genera ~/.claude y ~/.claude.json)
claude auth login
# → Abre URL en el browser, autoriza, pega el código de vuelta

# 6. Dar permisos de lectura para el contenedor (UID diferente al del host)
chmod 644 ~/.claude.json
chmod -R o+rX ~/.claude/
```

---

## Ejecutar el agente

```bash
su - <AGENT_USER>

# Variables requeridas
export GITHUB_TOKEN="ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

# Variables opcionales (solo si la tarea necesita secretos de negocio)
export INFISICAL_CLIENT_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
export INFISICAL_CLIENT_SECRET="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# Lanzar
bash /opt/<REPO>-sandbox/docker-sandbox/run-agent.sh "Descripción de la tarea"

# Ver en vivo
tmux attach -t <REPO>-agent
# Detach sin matar el agente: Ctrl+B, D
```

---

## Secretos y autenticación

### Claude Code — auth del agente

Se montan `~/.claude/` y `~/.claude.json` del `<AGENT_USER>` del host como `:ro`.
El contenedor hereda el OAuth o proxy configurado. **No se necesita `ANTHROPIC_API_KEY`.**

```bash
# Verificar que la auth está activa
claude auth status

# Renovar si expiró
claude auth login
chmod 644 ~/.claude.json
```

### GitHub PAT — acceso al repo

| Campo | Valor |
|-------|-------|
| Tipo | Fine-grained PAT |
| Scope | Solo el repo del proyecto |
| Permisos | `Contents: Read/Write` + `Metadata: Read` |
| Vigencia | 90 días máximo, renovar antes de expirar |

```bash
export GITHUB_TOKEN="ghp_..."
```

### Infisical — secretos de negocio

El contenedor recibe las credenciales de máquina de Infisical y puede
fetchear secretos del proyecto sin que el agente los vea en texto plano.

```bash
export INFISICAL_CLIENT_ID="..."
export INFISICAL_CLIENT_SECRET="..."
```

El `run-agent.sh` pasa estas variables al contenedor automáticamente si están definidas.

Dentro del sandbox, el agente puede usar:
```bash
# Fetchear un secreto
infisical secrets get DATABASE_URL --env=staging

# Exportar todos al entorno
eval $(infisical export --env=staging --format=dotenv)
```

### Tokens de deploy (Cloudflare, AWS, etc.)

**Nunca entran al sandbox.** El flujo correcto:

```
Agente → git push → GitHub Actions → deploy con token de prod
```

Los tokens viven solo en:
`GitHub → Settings → Secrets and variables → Actions`

---

## Patrones Docker

### Patrón 1 — Tarea de desarrollo estándar

```bash
export GITHUB_TOKEN="ghp_..."
bash /opt/<REPO>-sandbox/docker-sandbox/run-agent.sh \
  "Agrega la feature X al módulo Y"
```

### Patrón 2 — Tarea con secretos de negocio

```bash
export GITHUB_TOKEN="ghp_..."
export INFISICAL_CLIENT_ID="..."
export INFISICAL_CLIENT_SECRET="..."
bash /opt/<REPO>-sandbox/docker-sandbox/run-agent.sh \
  "Actualiza la integración con la API de pagos usando credenciales de staging"
```

### Patrón 3 — Verificar estado

```bash
tmux ls                              # sesiones activas
tmux attach -t <REPO>-agent          # adjuntarse
docker ps --filter "name=<REPO>-agent"   # contenedor corriendo
docker logs <REPO>-agent             # logs del contenedor
```

### Patrón 4 — Matar y relanzar

```bash
tmux kill-session -t <REPO>-agent
docker stop <REPO>-agent 2>/dev/null || true
bash /opt/<REPO>-sandbox/docker-sandbox/run-agent.sh "Nueva tarea"
```

### Patrón 5 — Reconstruir imagen (tras cambios en Dockerfile)

```bash
# Como root
git -C /opt/<REPO>-sandbox pull
docker build -t <IMAGE_NAME> /opt/<REPO>-sandbox/docker-sandbox/
```

### Patrón 6 — Debug interactivo

```bash
docker run --rm -it \
  -v /home/<AGENT_USER>/.claude:/home/agent/.claude:ro \
  -v /home/<AGENT_USER>/.claude.json:/home/agent/.claude.json:ro \
  <IMAGE_NAME> \
  claude auth status
```

---

## Límites del contenedor

| Recurso | Valor por defecto | Configurable en |
|---------|-------------------|-----------------|
| RAM | 1 GB | `run-agent.sh` → `--memory` |
| CPU | 1.5 cores | `run-agent.sh` → `--cpus` |
| Red | Host networking | `run-agent.sh` → `--network` |
| Turns máximos | 40 | `run-agent.sh` → `--max-turns` |
| Filesystem | Solo el repo clonado | Volúmenes Docker |

---

## Qué puede y no puede hacer el agente

| Permitido | Prohibido |
|-----------|-----------|
| Editar archivos del repo clonado | Escribir fuera de `/home/agent/project` |
| `git commit` y `git push` al repo scoped | Acceder a otros repos |
| Leer secretos via Infisical (proyecto específico) | Tokens de deploy de producción |
| Requests HTTP a internet | Modificar credenciales del host |
| Leer `~/.claude` (read-only) | Correr como root dentro del contenedor |

---

## Actualizar el sandbox en el servidor

```bash
# Como root
git config --global --add safe.directory /opt/<REPO>-sandbox
git -C /opt/<REPO>-sandbox pull

# Si cambió el Dockerfile
docker build -t <IMAGE_NAME> /opt/<REPO>-sandbox/docker-sandbox/
```

---

## Troubleshooting

| Síntoma | Causa | Fix |
|---------|-------|-----|
| `Not logged in` | `.claude.json` no legible por el contenedor | `chmod 644 ~/.claude.json && chmod -R o+rX ~/.claude/` |
| `[exited]` inmediato en tmux | Auth falla o crash en inicio | `docker run --rm -it <IMAGE> claude auth status` |
| `Permission denied` en git pull | Repo clonado por otro usuario | Usar `sudo git pull` o clonar con el usuario correcto |
| Imagen no encontrada | No se construyó | `docker build -t <IMAGE_NAME> /opt/<REPO>-sandbox/docker-sandbox/` |
| `no sessions` en tmux | Agente ya terminó | El agente termina solo — revisar output de la tarea |
| SSH se desconecta | Timeout de VPN | Usar Mosh + `ClientAliveInterval 30` en `/etc/ssh/sshd_config` |
| `claude auth login` no funciona | Node.js no instalado en host | `npm install -g @anthropic-ai/claude-code` |
