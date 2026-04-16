#!/bin/bash
# Aplica 3 cambios a relay/master.js sin reemplazar el archivo completo
set -e
F=/home/user/agentic-repo/relay/master.js

# 1. Agregar AI_MONITOR_INBOX justo despues de la linea DISPATCH_FILE
if ! grep -q 'AI_MONITOR_INBOX' "$F"; then
  python3 - <<'PY'
import re, sys
content = open('/home/user/agentic-repo/relay/master.js').read()
patch = (
  "const AI_MONITOR_INBOX = process.env.AI_MONITOR_INBOX ||\n"
  "  `/var/www/html/vilarkptl.com/ai-monitor/relay/inbox.md`;\n"
)
old = "const HASHES_FILE"
new = patch + "const HASHES_FILE"
open('/home/user/agentic-repo/relay/master.js', 'w').write(content.replace(old, new, 1))
print('patch 1 OK: AI_MONITOR_INBOX agregado')
PY
else
  echo 'patch 1 ya aplicado'
fi

# 2. Fix auto-loop: usar AI_MONITOR_INBOX en lugar de BUZON_SRC.replace
python3 - <<'PY'
import sys
content = open('/home/user/agentic-repo/relay/master.js').read()
old = "fs.writeFileSync(BUZON_SRC.replace('buzon-ia.md', 'inbox.md'), autoTask);"
new = (
  "try { require('fs').mkdirSync(require('path').dirname(AI_MONITOR_INBOX), { recursive: true }); } catch (_) {}\n"
  "        fs.writeFileSync(AI_MONITOR_INBOX, autoTask);"
)
if old in content:
  open('/home/user/agentic-repo/relay/master.js', 'w').write(content.replace(old, new, 1))
  print('patch 2 OK: auto-loop usa AI_MONITOR_INBOX')
else:
  print('patch 2 ya aplicado o no encontrado')
PY

# 3. Auto-mkdir para /var/lib/ai-monitor/ en main()
python3 - <<'PY'
content = open('/home/user/agentic-repo/relay/master.js').read()
old = "  let projects = [];\n  try {\n    projects = JSON.parse(fs.readFileSync(PROJECTS_FILE"
block = (
  "  // Ensure dispatch dir exists\n"
  "  try {\n"
  "    fs.mkdirSync(require('path').dirname(process.env.DISPATCH_FILE || '/var/lib/ai-monitor/x'), { recursive: true });\n"
  "    const df = process.env.DISPATCH_FILE || '/var/lib/ai-monitor/pending-dispatches.json';\n"
  "    if (!require('fs').existsSync(df)) require('fs').writeFileSync(df, '[\\n]');\n"
  "  } catch (e) { console.log('[master] WARN dispatch dir: ' + e.message); }\n\n"
)
if block.strip().split('\n')[0].strip() not in content:
  open('/home/user/agentic-repo/relay/master.js', 'w').write(content.replace(old, block + old, 1))
  print('patch 3 OK: auto-mkdir en main()')
else:
  print('patch 3 ya aplicado')
PY

echo '--- patch completo ---'
head -55 "$F" | grep -n 'AI_MONITOR_INBOX\|DISPATCH_FILE\|dispatch dir'
