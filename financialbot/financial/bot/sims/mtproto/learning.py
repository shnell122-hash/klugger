"""
learning.py — Curriculum Learning + Case-Based Reasoning engine.

Registra cada suite run como un "episodio" en la base de datos de aprendizaje.
Detecta patrones de falla recurrentes (CBR) y determina el siguiente tier de complejidad.

Modelo:
  Episodio  ≈ época de entrenamiento (epoch)
  Score     ≈ accuracy del episodio
  Tier      ≈ nivel de dificultad del curriculum
  Patrón    ≈ caso en Case-Based Reasoning
  Fix       ≈ resolución/label para el caso
"""

import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional
from client import env, read_backend_env

# ── DB helper ────────────────────────────────────────────────────────────────

def _db_pass() -> str:
    p = env("DB_PASS", "")
    if p:
        return p
    return read_backend_env("DB_PASS")


def db_query(query: str, values: tuple = ()) -> list[dict]:
    """Ejecuta query con parámetros posicionales (%s → valor)."""
    for v in values:
        query = query.replace("%s", f"'{v}'", 1)
    r = subprocess.run(
        ["mysql", "-u", "root", f"-p{_db_pass()}", "ai_monitoring",
         "-sN", "--default-character-set=utf8mb4", "-e", query],
        capture_output=True, text=True
    )
    rows = []
    for line in r.stdout.strip().splitlines():
        if line:
            rows.append(line.split("\t"))
    return rows


def db_one(query: str, values: tuple = ()) -> str:
    rows = db_query(query, values)
    return rows[0][0] if rows and rows[0] else ""


def db_exec(query: str, values: tuple = ()) -> None:
    for v in values:
        query = query.replace("%s", f"'{str(v).replace(chr(39), chr(39)*2)}'", 1)
    subprocess.run(
        ["mysql", "-u", "root", f"-p{_db_pass()}", "ai_monitoring",
         "--default-character-set=utf8mb4", "-e", query],
        capture_output=True, text=True
    )


# ── Git ───────────────────────────────────────────────────────────────────────

def current_git_sha() -> str:
    r = subprocess.run(
        ["git", "-C", "/var/www/html/vilarkptl.com/ai-monitor", "rev-parse", "--short", "HEAD"],
        capture_output=True, text=True
    )
    return r.stdout.strip() or "unknown"


# ── Episode management ────────────────────────────────────────────────────────

def next_episode_num() -> int:
    n = db_one("SELECT COALESCE(MAX(episode_num), 0) + 1 FROM learning_episodes")
    return int(n) if n.isdigit() else 1


def current_tier() -> int:
    """Determina el tier activo según el historial de episodios."""
    n = db_one("SELECT complexity_tier FROM learning_episodes ORDER BY id DESC LIMIT 1")
    return int(n) if n.isdigit() else 1


def start_episode(triggered_by: str = "manual") -> int:
    """Inserta un nuevo episodio y retorna su ID."""
    num = next_episode_num()
    tier = _calculate_next_tier()
    sha = current_git_sha()
    db_exec(
        "INSERT INTO learning_episodes (episode_num, started_at, complexity_tier, git_sha, triggered_by) "
        "VALUES (%s, NOW(3), %s, %s, %s)",
        (num, tier, sha, triggered_by)
    )
    # LAST_INSERT_ID() no funciona entre subprocesos — usar MAX(id) con episode_num
    episode_id = db_one(f"SELECT id FROM learning_episodes WHERE episode_num={num} ORDER BY id DESC LIMIT 1")
    return int(episode_id) if episode_id.isdigit() else num


def record_test_result(episode_id: int, test_id: str, passed: bool,
                       detail: str, duration_ms: int = 0, db_snapshot: dict = None):
    snap = json.dumps(db_snapshot or {})
    db_exec(
        "INSERT INTO learning_test_results "
        "(episode_id, test_id, passed, detail, duration_ms, db_snapshot) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (episode_id, test_id, 1 if passed else 0, detail, duration_ms, snap)
    )


def complete_episode(episode_id: int, results: list[dict]):
    """Cierra el episodio, calcula score y detecta patrones."""
    total   = len([r for r in results if r["test_id"] not in ("T05", "T06", "T07")])
    passed  = sum(1 for r in results if r["passed"] and r["test_id"] not in ("T05", "T06", "T07"))
    skipped = len([r for r in results if r["test_id"] in ("T05", "T06", "T07")])
    score   = round(passed / total * 100, 2) if total else 0

    db_exec(
        "UPDATE learning_episodes SET completed_at=NOW(3), total_tests=%s, passed_tests=%s, "
        "skipped_tests=%s, score_pct=%s WHERE id=%s",
        (total, passed, skipped, score, episode_id)
    )

    # Detectar patrones
    for r in results:
        if not r["passed"]:
            _update_pattern(episode_id, r["test_id"], r["detail"])
        else:
            _resolve_pattern(episode_id, r["test_id"])

    return {"score": score, "passed": passed, "total": total, "skipped": skipped}


# ── Tier calculation (Curriculum Learning) ────────────────────────────────────

ADVANCE_THRESHOLD = 80.0   # % para avanzar de tier
ADVANCE_STREAK    = 2      # episodios consecutivos sobre threshold para avanzar
MAX_TIER          = 4


def _calculate_next_tier() -> int:
    """
    Curriculum Learning: avanza de tier si los últimos ADVANCE_STREAK episodios
    tienen score >= ADVANCE_THRESHOLD.
    """
    rows = db_query(
        f"SELECT score_pct, complexity_tier FROM learning_episodes "
        f"ORDER BY episode_num DESC LIMIT {ADVANCE_STREAK}"
    )
    if len(rows) < ADVANCE_STREAK:
        return 1

    scores   = [float(r[0]) for r in rows if r[0] and r[0] != "NULL"]
    cur_tier = int(rows[0][1]) if rows[0][1].isdigit() else 1

    if len(scores) >= ADVANCE_STREAK and all(s >= ADVANCE_THRESHOLD for s in scores[:ADVANCE_STREAK]):
        return min(cur_tier + 1, MAX_TIER)
    return cur_tier


# ── Pattern detection (Case-Based Reasoning) ─────────────────────────────────

def _pattern_key(test_id: str, detail: str) -> str:
    """Genera una clave de patrón a partir del test y el mensaje de error."""
    detail_norm = detail.lower()
    if "null" in detail_norm or "none" in detail_norm:
        return f"{test_id}_null_value"
    if "404" in detail_norm or "not found" in detail_norm:
        return f"{test_id}_http_404"
    if "timeout" in detail_norm:
        return f"{test_id}_timeout"
    if "sin actividad" in detail_norm or "sin sesión" in detail_norm:
        return f"{test_id}_no_db_activity"
    if "estado" in detail_norm and "idle" in detail_norm:
        return f"{test_id}_idle_state"
    # fallback: primeras palabras del detalle
    words = "".join(c if c.isalnum() else "_" for c in detail_norm[:40]).strip("_")
    return f"{test_id}_{words}"


def _update_pattern(episode_id: int, test_id: str, detail: str):
    key = _pattern_key(test_id, detail)
    existing = db_one(f"SELECT id FROM learning_patterns WHERE pattern_key='{key}'")
    if existing:
        db_exec(
            "UPDATE learning_patterns SET "
            "occurrence_count = occurrence_count + 1, "
            "consecutive_count = consecutive_count + 1, "
            "last_seen_episode = %s, "
            "status = 'active', "
            "updated_at = NOW(3) "
            "WHERE id = %s",
            (episode_id, existing)
        )
    else:
        db_exec(
            "INSERT INTO learning_patterns "
            "(pattern_key, test_id, description, first_seen_episode, last_seen_episode, status) "
            "VALUES (%s, %s, %s, %s, %s, 'active')",
            (key, test_id, detail[:500], episode_id, episode_id)
        )


def _resolve_pattern(episode_id: int, test_id: str):
    """Marca como resueltos los patrones de este test que estaban activos."""
    db_exec(
        "UPDATE learning_patterns SET status='resolved', resolved_episode=%s, "
        "consecutive_count=0, updated_at=NOW(3) "
        "WHERE test_id=%s AND status='active'",
        (episode_id, test_id)
    )


# ── CBR: recuperar fix previo para un patrón ─────────────────────────────────

def recall_fix(test_id: str, detail: str) -> Optional[str]:
    """
    Case-Based Reasoning: recupera el fix más efectivo para el patrón dado.
    Retorna el commit_message del fix, o None si no hay precedente.
    """
    key = _pattern_key(test_id, detail)
    rows = db_query(
        f"SELECT f.commit_message, f.effectiveness "
        f"FROM learning_fixes f "
        f"JOIN learning_patterns p ON p.id = f.pattern_id "
        f"WHERE p.pattern_key = '{key}' "
        f"ORDER BY f.effectiveness DESC LIMIT 1"
    )
    if rows and rows[0]:
        return rows[0][0]
    return None


# ── Report generation ─────────────────────────────────────────────────────────

def build_report(episode_id: int, results: list[dict], stats: dict) -> str:
    """Genera el reporte de Telegram para el episodio."""
    tier_labels = {1: "Básico", 2: "Intermedio", 3: "Avanzado", 4: "Edge Cases"}
    episode_num = db_one(f"SELECT episode_num FROM learning_episodes WHERE id={episode_id}")
    tier        = db_one(f"SELECT complexity_tier FROM learning_episodes WHERE id={episode_id}")
    tier_label  = tier_labels.get(int(tier) if tier.isdigit() else 1, "?")

    lines = [
        f"📊 *Episodio #{episode_num}* — Tier {tier}: {tier_label}",
        f"Score: {stats['score']:.1f}% ({stats['passed']}/{stats['total']} tests)",
        ""
    ]

    for r in results:
        icon = "✅" if r["passed"] else ("⏭" if r.get("skipped") else "❌")
        lines.append(f"{icon} {r['test_id']}: {r['detail'][:80]}")

    # Patrones activos
    patterns = db_query(
        "SELECT pattern_key, consecutive_count FROM learning_patterns "
        "WHERE status='active' ORDER BY consecutive_count DESC LIMIT 3"
    )
    if patterns:
        lines.append("")
        lines.append("🔍 *Patrones activos:*")
        for p in patterns:
            lines.append(f"  • {p[0]} (×{p[1]} episodios)")

    # Siguiente tier
    next_tier = _calculate_next_tier()
    if int(tier or 1) < next_tier:
        lines.append(f"\n🎓 *Avanzando a Tier {next_tier}: {tier_labels.get(next_tier, '?')}*")

    return "\n".join(lines)


def post_to_telegram(text: str, chat_id: str = None):
    """Publica reporte en Telegram vía bot financiero."""
    import urllib.request, urllib.parse
    token = env("RELAY_BOT_TOKEN") or env("TELEGRAM_BOT_TOKEN") or env("FIN_TELEGRAM_BOT_TOKEN")
    target = chat_id or env("FINBOT_TEST_REPORT_CHAT_ID") or env("SIM_CHAT_ID")
    if not token or not target:
        print("[learning] No token o CHAT_ID — reporte solo en consola")
        return
    body = urllib.parse.urlencode({
        "chat_id": target,
        "text": text,
        "parse_mode": "Markdown"
    }).encode()
    try:
        urllib.request.urlopen(
            f"https://api.telegram.org/bot{token}/sendMessage", body, timeout=10
        )
    except Exception as e:
        print(f"[learning] Error enviando reporte Telegram: {e}")


# ── Dispatch fix (verifier + claude-code) ─────────────────────────────────────

def dispatch_fix_if_needed(episode_id: int, results: list[dict], stats: dict):
    """
    Si hay patrones con consecutive_count >= 2 Y score < 85%:
      - Escribe tarea en relay/inbox-finbot-coordinator.md (fix de código, cooldown 20 min)
    finbot-coordinator usa rama claude/financial-multiagent-system-YwtYQ + api/exec deploy.
    """
    if stats["score"] >= 85.0:
        return

    critical = db_query(
        "SELECT pattern_key, test_id, description, consecutive_count "
        "FROM learning_patterns WHERE status='active' AND consecutive_count >= 2 "
        "ORDER BY consecutive_count DESC LIMIT 5"
    )
    if not critical:
        return

    episode_num = db_one(f"SELECT episode_num FROM learning_episodes WHERE id={episode_id}")
    _dispatch_to_claude_code(episode_num, critical, results, stats)


def _dispatch_to_claude_code(episode_num, patterns, results: list[dict], stats: dict):
    """
    Escribe en relay/inbox-finbot-coordinator.md para que relay-master despache
    Claude Code CLI (proyecto finbot-coordinator, rama claude/financial-multiagent-system-YwtYQ).

    El agente recibe contexto completo + instrucción de deploy vía /api/exec.
    Cooldown de 20 min para no re-disparar en cada episodio.
    """
    import time

    COOLDOWN_SECS = 20 * 60
    REPO_ROOT = Path(__file__).resolve().parents[4]
    inbox_path    = REPO_ROOT / "relay" / "inbox-finbot-coordinator.md"
    cooldown_file = REPO_ROOT / "relay" / ".coordinator-dispatch-ts"

    if cooldown_file.exists():
        try:
            last_ts = float(cooldown_file.read_text().strip() or "0")
            if time.time() - last_ts < COOLDOWN_SECS:
                print(f"[learning] finbot-coordinator dispatch cooldown activo — omitiendo")
                return
        except Exception:
            pass

    failed  = [r for r in results if not r.get("passed") and not r.get("skipped")]
    skipped = [r for r in results if r.get("skipped")]

    task_lines = [
        f"## Fix automático — Episodio #{episode_num}",
        f"Score: {stats['score']:.1f}% ({stats['passed']}/{stats['total']}) — bajo umbral 85%",
        "",
        "### Patrones de falla recurrentes (ordered by consecutive_count):",
    ]
    for p in patterns:
        key, test_id, desc, count = p[0], p[1], p[2], p[3]
        prev_fix = recall_fix(test_id, desc)
        task_lines.append(f"- **{key}** (×{count} ep): {desc[:200]}")
        if prev_fix:
            task_lines.append(f"  Fix previo efectivo: `{prev_fix[:150]}`")

    if failed:
        task_lines += ["", "### Tests fallando (este episodio):"]
        for r in failed[:8]:
            detail = (r.get("detail") or "")[:150]
            resp   = (r.get("bot_response") or "")[:100]
            task_lines.append(f"- `{r['test_id']}`: {detail}")
            if resp:
                task_lines.append(f"  Bot respondió: `{resp}`")

    if skipped:
        task_lines += ["", f"### Tests skipped: {len(skipped)} (no cuentan en score)"]

    task_lines += [
        "",
        "### Diagnóstico — ejecutar en orden:",
        "```bash",
        "pm2 logs financial-bot --nostream --lines 60",
        "pm2 logs conversation-engine --nostream --lines 20",
        "```",
        "",
        "### Archivos relevantes:",
        "- `financial/bot/financial-bot.js` — lógica principal del bot (estados de sesión)",
        "- `financial/bot/sims/mtproto/conversation_engine.py` — motor de pruebas",
        "- `financial/bot/agents/TransactionOrchestrator.js` — routing de intenciones",
        "",
        "### Contexto crítico del sistema:",
        "- Estados de sesión: idle → esperando_tipo → esperando_monto → esperando_entrega",
        "- Estado extra: esperando_datos_bancarios (solo para SPEI con CLABE)",
        "- Modo asistente: fin_chats.modo='asistente' → el bot guarda CLABEs silenciosamente",
        "- Verificar que fin_chats tenga modo='normal' para el chat_id de prueba",
        "- DeepSeek usa tool_choice='required' — no 'auto' — en TransactionOrchestrator",
        "",
        "### Instrucciones (ejecutar en este orden):",
        "1. Leer logs del bot para identificar causa raíz",
        "2. Hacer el fix mínimo necesario en el/los archivos relevantes",
        "3. `git add <archivos-específicos> && git commit -m 'fix: <descripción>'`",
        "4. `git push -u origin claude/financial-multiagent-system-YwtYQ`",
        "5. Deploy vía `/api/exec` (token en `/var/www/html/vilarkptl.com/ai-monitor/relay/.exec-token`):",
        "   ```bash",
        "   EXEC_TOKEN=$(cat /var/www/html/vilarkptl.com/ai-monitor/relay/.exec-token)",
        "   curl -s -X POST https://ia.vilarkptl.com/api/exec \\",
        "     -H 'Content-Type: application/json' \\",
        "     -d \"{\\\"token\\\":\\\"$EXEC_TOKEN\\\",\\\"cmd\\\":\\\"git fetch origin claude/financial-multiagent-system-YwtYQ\\\",\\\"cwd\\\":\\\"/var/www/html/vilarkptl.com/ai-monitor\\\"}\"",
        "   curl -s -X POST https://ia.vilarkptl.com/api/exec \\",
        "     -H 'Content-Type: application/json' \\",
        "     -d \"{\\\"token\\\":\\\"$EXEC_TOKEN\\\",\\\"cmd\\\":\\\"git checkout origin/claude/financial-multiagent-system-YwtYQ -- financial/bot/financial-bot.js financial/bot/sims/mtproto/conversation_engine.py\\\",\\\"cwd\\\":\\\"/var/www/html/vilarkptl.com/ai-monitor\\\"}\"",
        "   curl -s -X POST https://ia.vilarkptl.com/api/exec \\",
        "     -H 'Content-Type: application/json' \\",
        "     -d \"{\\\"token\\\":\\\"$EXEC_TOKEN\\\",\\\"cmd\\\":\\\"pm2 restart financial-bot\\\"}\"",
        "   ```",
        "6. Verificar que pm2 restart mostró '↺ N' con N incrementado",
        "7. Escribir resultado en `relay/outbox-finbot-coordinator.md`:",
        "   ```",
        "   STATUS: done | partial | failed",
        "   CHANGED: archivos modificados",
        "   DEPLOYED: yes | no",
        "   ROOT_CAUSE: descripción de 1 línea",
        "   PENDING: lo que falta",
        "   ```",
    ]

    try:
        inbox_path.write_text("\n".join(task_lines) + "\n")
        cooldown_file.write_text(str(time.time()))
        print(f"[learning] finbot-coordinator dispatch → inbox-finbot-coordinator.md (ep#{episode_num})")
    except Exception as e:
        print(f"[learning] coordinator dispatch falló: {e}")
