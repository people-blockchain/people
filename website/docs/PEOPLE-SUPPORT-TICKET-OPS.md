# PEOPLE Support ticket ops (HTTP API)

OpenMausBot / PEOPLE Support can list open tickets, reply to reporters, and change status on
@PeopleVerifyBot **without** the Mac Telegram Helper UI or an owner DM session. Access is
Bearer-protected via `TELEGRAM_SUPPORT_OPS_SECRET`.

Base URL (production):

`https://www.peopleblockchain.network/api/telegram/support-ops`

## Environment

| Variable | Where | Purpose |
|----------|--------|---------|
| `TELEGRAM_SUPPORT_OPS_SECRET` | Vercel (website project, Sensitive) | Bearer token for this API |
| `PEOPLE_SUPPORT_OPS_URL` | OpenMausBot / local CLI | Override API URL (optional) |
| `TELEGRAM_SUPPORT_OPS_SECRET` | OpenMausBot / local CLI | Same secret as Vercel (never log it) |

### One-time production setup (Alex)

1. Generate a long random secret (e.g. `openssl rand -hex 32`).
2. In the **website** Vercel project → Settings → Environment Variables, add
   `TELEGRAM_SUPPORT_OPS_SECRET` (Sensitive) for Production (and Preview if needed).
3. Redeploy the website.
4. Configure the same value in OpenMausBot’s env (not in git).

## List open tickets

Only `new` and `accepted` tickets are returned. Response is a JSON array (no phone, chat id, or username).

```bash
curl -sS -H "Authorization: Bearer $TELEGRAM_SUPPORT_OPS_SECRET" \
  "https://www.peopleblockchain.network/api/telegram/support-ops"
```

## Reply to a ticket

Sends the same DM as the owner “Reply” button and appends `[reply ISO8601] …` to `adminNote`.

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $TELEGRAM_SUPPORT_OPS_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"reply","id":"<full-uuid>","text":"Your answer here"}' \
  "https://www.peopleblockchain.network/api/telegram/support-ops"
```

## Change status

Accepts bot-style aliases (`accept`, `duplicate`, `fixed`, `reject`) or raw statuses
(`accepted`, `duplicate`, `fixed`, `rejected`, `new`). Default season-0 points apply on
`accept` / `fixed` like Telegram triage buttons.

```bash
curl -sS -X POST \
  -H "Authorization: Bearer $TELEGRAM_SUPPORT_OPS_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action":"status","id":"<full-uuid>","status":"accept"}' \
  "https://www.peopleblockchain.network/api/telegram/support-ops"
```

## CLI (website repo)

From `website/`, with env vars set:

```bash
node scripts/support-tickets-ops.mjs list
node scripts/support-tickets-ops.mjs reply <uuid> "message"
node scripts/support-tickets-ops.mjs status <uuid> accept
```

## Errors

| HTTP | `error` | Meaning |
|------|---------|---------|
| 401 | `not_configured` | `TELEGRAM_SUPPORT_OPS_SECRET` unset on server |
| 401 | `unauthorized` | Missing or wrong Bearer token |
| 400 | `invalid_action` / `invalid_status` / `empty_text` | Bad request body |
| 404 | `not_found` | Unknown ticket id |
