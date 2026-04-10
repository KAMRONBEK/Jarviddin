# Jarviddin orchestrator

Node.js service that connects **Telegram** to **Cursor Cloud / Background Agents** (`/v0/agents`), with optional **Trello** and **GitHub** fallbacks and an optional **NullClaw** webhook hook.

## Quick start

1. Copy `.env.dev.example` or `.env.prd.example` to `.env` (see [`.env.example`](.env.example)), fill values, **or** use Doppler/Infisical — see [docs/secrets.md](docs/secrets.md).
2. `npm install && npm run build`
3. Run `npm start` (or `npm run dev` for development).
4. Put the app behind **HTTPS** (e.g. Caddy) and register the Telegram webhook (see **Telegram webhook**).

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | yes | From @BotFather |
| `TELEGRAM_ALLOWED_USER_IDS` | yes | Comma-separated numeric user IDs |
| `TELEGRAM_WEBHOOK_SECRET` | yes | Same value you pass to Telegram `secret_token` (min 8 chars) |
| `CURSOR_API_KEY` | yes | Cursor Dashboard → Integrations |
| `DEFAULT_GITHUB_REPO` | yes | e.g. `https://github.com/org/repo` |
| `DEFAULT_GIT_REF` | no | default `main` |
| `PUBLIC_BASE_URL` | recommended | `https://your-domain.com` (no trailing slash) |
| `SQLITE_PATH` | no | default `./data/orchestrator.db` |
| `CURSOR_MAX_CONCURRENT_AGENTS` | no | default `2` |
| `CURSOR_POLL_INTERVAL_MS` | no | default `15000` |
| `TRELLO_*` / `GITHUB_*` | no | Optional REST fallbacks (see `.env.dev.example` / `.env.prd.example`) |
| `NULLCLAW_WEBHOOK_URL` | no | Optional HTTP POST target |

State is stored in **SQLite** (file under `data/`). For high availability, you can extend the store to Postgres/Redis later.

## Telegram webhook

After HTTPS is available:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://your-domain.com/webhook/telegram" \
  -d "secret_token=<same as TELEGRAM_WEBHOOK_SECRET>"
```

Telegram will send `X-Telegram-Bot-Api-Secret-Token` on each request; the server rejects mismatches.

## VPS hardening (checklist)

- Firewall: allow **22** (SSH), **80**/**443** (HTTP/TLS) only as needed.
- TLS: reverse proxy (see `deploy/Caddyfile.example`) terminating HTTPS to Node on `localhost:3000`.
- Secrets: keep `.env` out of git; use `chmod 600 .env` on the server.
- Systemd: see `deploy/jarviddin.service.example`.

## Commands (Telegram)

- `/agent <instructions>` — launch a Cursor Cloud Agent on the default (or `/repo`) GitHub URL.
- `/repo <https://github.com/owner/repo> [ref]` — per-user default repo/ref.
- `/status <job-uuid>` — show a stored job row.
- `/trello <title>` — create a Trello card (if Trello env vars are set).
- `/mergepr <number>` — merge a PR on `GITHUB_DEFAULT_OWNER` / `GITHUB_DEFAULT_REPO` (requires `GITHUB_TOKEN` and inline confirm).
- `/nullclaw_ping` — POST a test payload to `NULLCLAW_WEBHOOK_URL` if set.

**Trello via Cursor MCP** is configured in the Cursor dashboard for Cloud Agents on your repo; this app’s Trello command is a **direct REST fallback** only.

## Optional Docker

Docker is **not** required. If you prefer it, use a multi-stage build from `node:20-alpine`, copy `dist/`, set `WORKDIR`, run `node dist/index.js`, mount a volume for `./data`.

## License

MIT (match your project policy).
