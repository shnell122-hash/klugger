#!/usr/bin/env bash
# PostToolUse hook — fires after each tool call completes
# Claude Code passes JSON via stdin:
# { "session_id": "...", "tool_name": "...", "tool_input": {...}, "tool_response": "..." }

MONITOR_URL="${CLAUDE_MONITOR_URL:-http://127.0.0.1:3010}"

# Read stdin JSON
INPUT=$(cat)

# Process and POST (fire-and-forget)
PAYLOAD=$(echo "$INPUT" | python3 -c "
import sys, json, os
from datetime import datetime, timezone

data = json.load(sys.stdin)
data['event_type'] = 'post_tool'
data['timestamp'] = datetime.now(timezone.utc).isoformat()
data['working_dir'] = os.environ.get('PWD', '')
data['agent_user'] = os.environ.get('USER', '')
data['chat_source'] = os.environ.get('CLAUDE_CHAT_SOURCE', 'claude-code-cli')

# Summarize tool_input
if 'tool_input' in data and isinstance(data['tool_input'], dict):
    inp_str = json.dumps(data['tool_input'])
    data['tool_input_summary'] = inp_str[:500]
    del data['tool_input']

# Summarize tool_response
if 'tool_response' in data:
    resp = data['tool_response']
    if isinstance(resp, dict):
        resp = json.dumps(resp)
    elif not isinstance(resp, str):
        resp = str(resp)
    data['tool_response_summary'] = resp[:500]
    del data['tool_response']

print(json.dumps(data))
" 2>/dev/null)

if [ -n "$PAYLOAD" ]; then
  curl -s -o /dev/null -X POST \
    -H "Content-Type: application/json" \
    -d "$PAYLOAD" \
    "$MONITOR_URL/api/events" &
fi

exit 0
