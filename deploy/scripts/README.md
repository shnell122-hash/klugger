# deploy/scripts/

Scripts de mantenimiento del servidor KPTL.

## Uso

Todos los scripts se ejecutan desde la raíz del repo como root:

```bash
bash deploy/scripts/fase-1-seguridad.sh
```

## Scripts disponibles

| Script | Qué hace | Cuándo correrlo |
|--------|----------|-----------------|
| `fase-1-seguridad.sh` | Crea vault, rota contraseñas SSH/MySQL, actualiza PAT de GitHub | Una vez, al setup inicial de seguridad |
| `fase-2-mantenimiento.sh` | Limpia duplicados en relay/.env, git prune/gc, reinicia relay-master | Cuando haya entradas duplicadas en .env o se quiera limpiar el repo |
| `fase-3-litellm.sh` | Instala LiteLLM proxy con fallback Claude→DeepSeek→OpenAI→Groq | Una vez, al configurar el AI Gateway |
| `fase-a-diagnostico.sh` | Diagnóstico read-only: PM2 status, logs, memoria | Cuando relay-master tenga restarts inesperados |
| `fase-b-fix-restarts.sh` | Crea `/var/lib/ai-monitor/`, ajusta max_memory, reinicia PM2 | Si fase-a confirma bug de directorio faltante |
| `llm-0-diagnostico.sh` | Diagnóstico read-only: vhosts Apache, DNS, certbot, módulos | Antes de exponer llm.vilarkptl.com |
| `llm-1-apache.sh` | Crea vhost Apache para llm.vilarkptl.com (requiere DNS propagado) | Después de crear registro A en DNS |
| `llm-2-certbot.sh` | Obtiene certificado TLS Let's Encrypt para llm.vilarkptl.com | Después de llm-1-apache.sh |
| `llm-3-verificacion.sh` | Verifica HTTPS, health, modelos, cert TLS de llm.vilarkptl.com | Después de llm-2-certbot.sh |
| `migracion-litellm.sh` | Migra apps al proxy LiteLLM, llena vault, instala deps ai-monitor | Después de llm.vilarkptl.com operativo |

## Vault de secretos

Después de correr `fase-1-seguridad.sh`, las credenciales viven en:
- `/opt/kptl-secrets/server-credentials.txt` — contraseñas SSH y MySQL (permisos 600)
- `/opt/kptl-secrets/api-keys.env` — todas las API keys del ecosistema (llenar desde dashboard)
- `/opt/kptl-secrets/github-pat.txt` — GitHub PAT actual (llenar manualmente)
