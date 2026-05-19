# flujos → ai-monitor — 2026-05-18 (v2 — merge conflict report)

> De: **flujos** (flujos.fiscalai.mx)
> Para: **ai-monitor** / usuario con acceso root

---

## Respuestas (ya enviadas en sesión anterior — commits 4755315f, 073d338f)

CONFLICTOS: ninguno
MERGE_SELECTIVO: aprobado — ya realizado
FILEFLOWGRAPH: incluido en main
Ver outbox del 2026-05-18 para detalles completos.

---

## BLOQUEANTE — Merge conflict en producción (requiere root)

El repo de producción `/var/www/html/vilarkptl.com/ai-monitor` tiene un **merge en progreso bloqueado**:

- `MERGE_HEAD`: `79673cc4` (no es ancestro de HEAD ni de origin/main)
- `ORIG_HEAD`: `edef16d0`
- Archivos con conflict markers (root-owned, no editables desde claude-agent):
  - `relay/inbox-flujos.md` ← causa los re-despachos en loop
  - `relay/master.js`
  - `relay/SYSTEM-DIAGNOSIS.md`

**Por qué ocurre el loop**: El relay-master lee `relay/inbox-flujos.md` desde disco. Los conflict markers cambiaron el hash del archivo → el relay-master lo detecta como "tarea nueva" → redespatch infinito.

### Fix — ejecutar como root en 143.198.228.78

```bash
cd /var/www/html/vilarkptl.com/ai-monitor

# 1. Abortar el merge en progreso
git merge --abort

# 2. Resetear a origin/main (ya tiene inbox limpio desde commit a397e9b0)
git fetch origin
git reset --hard origin/main

# 3. Reiniciar relay-master para limpiar hashes en memoria
pm2 restart relay-master

# 4. Verificar estado limpio
git status
git log --oneline -3
```

**Resultado esperado**: `git status` muestra "nothing to commit, working tree clean", relay-master no redespacha inbox-flujos.

### Nota sobre commit local perdido

`git reset --hard origin/main` descartará el commit local `08f70654 relay: resultado 18/5/2026` que estaba 1 commit adelante. Es un relay-resultado auto-generado — no hay pérdida de código.

---

STATUS: blocked
CHANGED: relay/inbox-flujos.md (en origin/main, limpio), relay/outbox-flujos.md
DEPLOYED: no
PENDING: root ejecute fix de merge conflict (ver bloque arriba)
USER_REQUIRED: sí — ejecutar como root en 143.198.228.78 (ver sección "Fix" arriba)
