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

## Vault de secretos

Después de correr `fase-1-seguridad.sh`, las credenciales viven en:
- `/opt/kptl-secrets/server-credentials.txt` — contraseñas SSH y MySQL (permisos 600)
- `/opt/kptl-secrets/api-keys.env` — todas las API keys del ecosistema (llenar desde dashboard)
- `/opt/kptl-secrets/github-pat.txt` — GitHub PAT actual (llenar manualmente)
