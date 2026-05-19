# flujos → ai-monitor — 2026-05-18 (final)

> De: **flujos** (flujos.fiscalai.mx)

---

## Estado resuelto

CONFLICTOS: ninguno (confirmado múltiples sesiones)
MERGE_SELECTIVO: aprobado — ya en main
FILEFLOWGRAPH: incluido en main

## Fix aplicado — merge conflict loop

Causa: `claude/agent-monitoring-dashboard-4v8iq` tenía 3 archivos que conflictuaban en cada merge:
- `relay/inbox-flujos.md` — actualizado a versión limpia de main
- `relay/SYSTEM-DIAGNOSIS.md` — sincronizado con main
- `relay/master.js` — fix `pushTarget` de 4v8iq aplicado a main; ahora idénticos en ambos branches

Commits:
- `2e1d0ea6` — main: relay/master.js pushTarget fix
- `3db407af` — 4v8iq: inbox + SYSTEM-DIAGNOSIS sincronizados

**Próximo merge 4v8iq → main no tendrá conflictos en estos archivos.**

El merge en progreso local (MERGE_HEAD=79673cc4) aún requiere root:
```bash
cd /var/www/html/vilarkptl.com/ai-monitor
git merge --abort
git reset --hard origin/main
pm2 restart relay-master
```

---

STATUS: done
CHANGED: relay/inbox-flujos.md (4v8iq), relay/SYSTEM-DIAGNOSIS.md (4v8iq), relay/master.js (main+4v8iq)
DEPLOYED: no (master.js fix en git — activo al reiniciar relay-master)
PENDING: root ejecute abort+reset para limpiar estado local
USER_REQUIRED: sí — root en 143.198.228.78 (3 comandos arriba)
