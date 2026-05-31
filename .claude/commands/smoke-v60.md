# Smoke Test — v60 Testing

Run a quick smoke test against the v60 testing deployment. Report pass/fail for every endpoint.

## Connection

Use the exec server to run Node.js scripts on the remote server:

```
EXEC_URL: https://ia.vilarkptl.com/api/exec
EXEC_TOKEN: cb5871c0aa6ccd67997237c5238017753c0b35bdd7167b56e226aff25bcbf67a
BASE: http://127.0.0.1:5008
```

## Test Users

- `test-orgadmin@vilar.test` / `romanos12:2` — org admin, is_org_admin=true
- `test-submaster@vilar.test` / `romanos12:2` — sub master, is_sub_master=true

## Endpoints to Test

Run all of these in a single Node.js script via exec_server. Use a 10s timeout per request.

| # | Method | Path | Expected | Notes |
|---|--------|------|----------|-------|
| 1 | GET | `/api/health` | 200, version=v60-testing | |
| 2 | POST | `/api/auth/login-password` | 200, ok=true | body: `{email, password}` for orgadmin |
| 3 | GET | `/api/auth/me` | 200, is_org_admin=true | requires cookie from step 2 |
| 4 | GET | `/api/cases` | 200 | |
| 5 | POST | `/api/cases` | 201, case_id present | body: `{case_name, description}` |
| 6 | GET | `/api/artifacts/<case_id>` | 200, artifacts=[] | use case_id from step 5 |
| 7 | GET | `/api/dashboard/costs` | 200, totals present | |
| 8 | GET | `/api/admin/stats` | 200 | |
| 9 | GET | `/api/admin/my-org` | 200 | |
| 10 | POST | `/api/auth/login-password` | 200, ok=true | submaster user |
| 11 | GET | `/api/auth/me` | 200, is_sub_master=true | submaster session |
| 12 | POST | `/api/chat` | 200, response present | body: `{message:"Di: CHAT_OK", case_id, artifact_type:"summary", selected_ids:[]}` — takes 5–30s |

## Output Format

Present results as:

```
=== SMOKE TEST v60 testing — <timestamp> ===
✅ health: HTTP 200 | v60-testing
✅ login orgadmin: HTTP 200 | ok=true
...
❌ chat: HTTP 500 | <error>
=== PASSED: 11/12 ===
```

Then provide a one-line summary of any failures and whether the deployment is ready.

## Notes for Future Agents

- The chat test (step 12) calls Claude proxy — it takes 5–30 seconds, use timeout 60000ms
- `artifact_type:"summary"` uses max_tokens=4096 (faster than analysis=64000)
- If chat returns 500 with "streaming required": the `timeout=600` fix is missing from `_run_agentic_loop`
- If login works but /me returns 401: session cookie is not being sent correctly
- PM2 process name: `vilar-legal-os-v60-testing` (id 36)
- Flask port: 5008, Next.js: 3060, Claude proxy: 5001
