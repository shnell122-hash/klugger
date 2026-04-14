#!/usr/bin/env bash
# Stop hook — fires when Claude Code session ends
# Claude Code passes JSON via stdin:
# { "session_id": "...", "stop_hook_active": true }
# May also include usage stats if available

MONITOR_URL="${CLAUDE_MONITOR_URL:-http://localhost:3010}"

INPUT=$(cat)

PAYLOAD=$(echo "$INPUT" | python3 -c "
import sys, json, os
from datetime import datetime, timezone

data = json.load(sys.stdin)
data['event_type'] = 'stop'
data['timestamp'] = datetime.now(timezone.utc).isoformat()
data['working_dir'] = os.environ.get('PWD', '')
data['agent_user'] = os.environ.get('USER', '')

print(json.dumps(data))
" 2>/dev/null)

if [ -n "$PAYLOAD" ]; then
  # Stop hook: POST synchronously (session is ending, small delay OK)
  curl -s -o /dev/null -X POST \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$MONITOR_URL/api/sessions/end"
fi

exit 0
