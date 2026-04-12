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
- Logs (when the unit is named `jarviddin`): follow live output with:

```bash
journalctl -u jarviddin -f
```

## CI/CD (GitHub Actions)

Pushing to **`main`** runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): it **builds** on GitHub, then **SSH**s into the VPS, **`git pull`**s in `/opt/jarviddin`, **`npm ci`**, **`npm run build`**, and **`systemctl restart jarviddin`**. You can also run the workflow manually (**Actions** → **Deploy** → **Run workflow**).

### Repository secrets (Settings → Secrets and variables → Actions)

| Secret | Description |
|--------|-------------|
| `VPS_HOST` | Hostname or IP of the server (e.g. `185.217.131.248`) |
| `VPS_USER` | SSH user (e.g. `root` or your deploy user) |
| `VPS_SSH_KEY` | **Private** SSH key (full PEM, including `BEGIN` / `END` lines) whose **public** key is in `~/.ssh/authorized_keys` on the server |

Do **not** paste the `.pub` file here — GitHub Actions needs the **private** key only.

Use a **dedicated deploy key** or a machine key only for this repo — not your personal daily-use key.

### Server prerequisites

- Repo already cloned at **`/opt/jarviddin`** with **`origin`** pointing at this GitHub repository.
- **`git pull`** must work on the server (for a **private** repo, configure a [deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys/deploy-keys) or HTTPS with credentials on the VPS).
- Systemd unit **`jarviddin`** and the same **`doppler`/`HOME`** setup you use today (secrets are **not** copied by CI — they stay on the server via Doppler).

## SSH (VPS)

Generate a key (on your machine):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/jarviddin_vps
```

First connection: accept the host key (avoids `Host key verification failed` with `ssh-copy-id`):

```bash
ssh root@185.217.131.248
# type "yes" when asked, then log in; exit when done
```

Install your public key:

```bash
ssh-copy-id -i ~/.ssh/jarviddin_vps.pub root@185.217.131.248
```

Connect **without the root password** (after `ssh-copy-id` succeeded): SSH checks your **private** key against the line `ssh-copy-id` added under `/root/.ssh/authorized_keys` on the server. You are not logging in with the root account password anymore.

```bash
ssh -i ~/.ssh/jarviddin_vps root@185.217.131.248
```

If `ssh-keygen` asked you for a **key passphrase**, your Mac may prompt for that passphrase once per session (or use Keychain) — that is your **key** passphrase, not the VPS root password.

Recommended: add `~/.ssh/config` so you do not need `-i` every time; then run `ssh jarviddin-vps`:

```text
Host jarviddin-vps
  HostName 185.217.131.248
  User root
  IdentityFile ~/.ssh/jarviddin_vps
```

If you still get a **root password** prompt, the client is not offering the right key (wrong `IdentityFile`, or `ssh-copy-id` did not complete). Fix with `ssh -v -i ~/.ssh/jarviddin_vps root@185.217.131.248` and ensure the public key is on the server.

For production, prefer a non-root deploy user and key-only SSH; see [docs/ubuntu-vps-deploy-plan.md](docs/ubuntu-vps-deploy-plan.md).

## Commands (Telegram)

Plain text that does not start with `/` is handled conversationally: explicit repo work orders may start the same flow as `/agent`, while general or factual questions are answered inline.

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
