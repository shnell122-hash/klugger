# Coordinador — Despachar diagnóstico Omisiones SAT / Ekatena

## Sistema
Lee `/var/www/html/vilarkptl.com/ai-monitor/relay/COORDINATOR.md` para entender tu rol y las herramientas disponibles.

## Tarea: Diagnóstico Omisiones SAT en FiscalAI (Ekatena)

El usuario reportó: "en la implementación de las declaraciones de Ekatena, como fallback a SAT API, hay un problema en la carga de datos de Omisiones SAT."

### Acción requerida

1. Verifica que el API de dispatch responde: `curl -s http://localhost:3010/api/health`

2. Despacha al agente **fiscalai** (backend) la siguiente tarea:

```
## Diagnóstico — Carga de Omisiones SAT (Ekatena / fallback SAT API)

El usuario reporta que al mostrar declaraciones de Ekatena, hay un problema
al cargar datos de Omisiones SAT (el fallback a SAT API no funciona correctamente).

### Pasos de diagnóstico

1. Busca en el repo los archivos relevantes:
   grep -ri "omision" /var/www/html/vilarkptl.com/DeCabeceraTax --include="*.js" -l
   grep -ri "ekatena" /var/www/html/vilarkptl.com/DeCabeceraTax --include="*.js" -l

2. Lee el código que carga omisiones SAT e identifica el fallback a SAT API

3. Revisa logs recientes:
   sudo -u german pm2 logs sat-api --lines 300 2>&1 | grep -i "omision\|ekatena\|error\|fallback" | tail -50

4. Si hay un bug claro (null/undefined, error de URL, auth fallo, respuesta vacía):
   - Corrige el código
   - Haz commit y push
   - Confirma con curl o log que el fix funciona

5. Si el problema requiere intervención externa (credenciales SAT, cert FIEL):
   - Documenta exactamente qué falta
   - NO hagas loops reintentando

### Criterios de aceptación
- [ ] Causa identificada (error exacto, línea, archivo)
- [ ] Fix aplicado o issue documentado con pasos de resolución
- [ ] Sin loops ni reintentos infinitos
```

3. Reporta en coordinator-outbox.md:
   - ID de tarea despachada
   - Estado del sistema
