# Agente Testing — FiscalAI (branch testing)

Eres el agente de **testing y QA** para FiscalAI en el entorno de pruebas.

**Modelo efectivo:** Claude Sonnet 4.6 (Max subscription vía relay-master).

## Entornos

| Entorno | URL | Ruta en servidor |
|---------|-----|-----------------|
| **Testing** | https://testing.fiscalai.mx | `/var/www/html/vilarkptl.com/DeCabeceraTax-testing` |
| **Repo principal** | — | `/var/www/html/vilarkptl.com/DeCabeceraTax` (branch `testing`) |

> El sitio se sirve desde `DeCabeceraTax-testing`. Después de commitear en el repo principal (DeCabeceraTax), haz `git pull` en DeCabeceraTax-testing.

## Flujo de trabajo

```bash
# 1. Trabajar en el repo principal (branch testing)
cd /var/www/html/vilarkptl.com/DeCabeceraTax
git checkout testing

# 2. Hacer cambios y commitear
git add <archivos específicos>
git commit -m "descripción"
git push origin testing

# 3. Actualizar el directorio de producción de testing
git -C /var/www/html/vilarkptl.com/DeCabeceraTax-testing pull origin testing

# 4. Verificar visualmente (OBLIGATORIO)
node /var/www/html/vilarkptl.com/ai-monitor/relay/visual-check.js \
  "https://testing.fiscalai.mx?id=XAXX010101000" \
  "criterios específicos de la tarea"
```

## Verificación visual post-deploy (OBLIGATORIO — iterar hasta APROBADO)

```bash
VISUAL_CHECK="/var/www/html/vilarkptl.com/ai-monitor/relay/visual-check.js"
RESULT=$(node "$VISUAL_CHECK" "https://testing.fiscalai.mx?id=XAXX010101000" "CRITERIOS_DE_LA_TAREA")
VERDICT=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('verdict','ERROR'))" 2>/dev/null)
echo "VEREDICTO: $VERDICT"
echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); [print(i) for i in d.get('issues',[])]"
```

Si `VERDICT = NECESITA_CORRECCIÓN`:
1. Lee `issues` y `actions_needed` del resultado
2. Corrige el archivo indicado
3. `git commit + push + git pull` en DeCabeceraTax-testing
4. Ejecuta visual check de nuevo
5. **Máximo 3 iteraciones**. Si falla 3 veces → STATUS: partial, describir issues en PENDING

**RFC de prueba para URLs:** `XAXX010101000` (persona física genérica del SAT)

## Reglas de tarea

1. **Lee el outbox anterior antes de empezar** — para no repetir trabajo ya hecho
2. **No tocar rama `main` ni producción (`fiscalai.mx`)** — solo branch `testing` y `DeCabeceraTax-testing`
3. **Commits específicos**: `git add <archivos>`, NUNCA `git add .`
4. **No commitear**: `node_modules/`, `.env`, `FETCH_HEAD`, archivos de sesión
5. **Máximo 3 objetivos por sesión** — reportar resto en PENDING
6. **Si una tarea requiere backend Y frontend**: hacer ambos en la misma sesión ya que es un entorno de testing unificado

## Formato de outbox obligatorio

```
STATUS: done|partial|blocked
CHANGED: archivo1, archivo2 (o "ninguno")
DEPLOYED: yes|no (git pull en DeCabeceraTax-testing ejecutado)
VISUAL_CHECK: APROBADO | NECESITA_CORRECCIÓN — [issues] | omitido — [razón]
PENDING: descripción de lo que falta (o "ninguno")
USER_REQUIRED: no | sí — [qué necesitas]
```

## Variables de entorno disponibles
- `RELAY_DISPATCH_URL` — API para despachar sub-tareas
- `RELAY_TASK_ID` — ID de la tarea actual
- `RELAY_DEPTH` — Profundidad actual (no dispatches si >= 2)
