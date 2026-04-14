#!/usr/bin/env bash
# PreToolUse hook — fires before each tool call
# Claude Code passes JSON via stdin:
# { "session_id": "...", "tool_name": "...", "tool_input": {...} }

MONITOR_URL="${CLAUDE_MONITOR_URL:-http://localhost:3010}"

# Read stdin JSON
INPUT=$(cat)

# Add event_type and timestamp, then POST (fire-and-forget)
PAYLOAD=$(echo "$INPUT" | python3 -c "
import sys, json, os
from datetime import datetime, timezone

data = json.load(sys.stdin)
data['event_type'] = 'pre_tool'
data['timestamp'] = datetime.now(timezone.utc).isoformat()
data['working_dir'] = os.environ.get('PWD', '')
data['agent_user'] = os.environ.get('USER', '')

# Truncate large fields to avoid bloating the DB
if 'tool_input' in data and isinstance(data['tool_input'], dict):
    inp_str = json.dumps(data['tool_input'])
    data['tool_input_summary'] = inp_str[:500]
    del data['tool_input']

print(json.dumps(data))
" 2>/dev/null)

# POST in background — do NOT block Claude Code
if [ -n "$PAYLOAD" ]; then
  curl -s -o /dev/null -X POST \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$MONITOR_URL/api/events" &
fi

exit 0
