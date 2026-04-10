# Pulling secrets on your laptop and on the VPS

Use **one** cloud vault with **two configs** (e.g. `dev` and `prd`). Same CLI on both machines; only the **token / project / config** differs.

## Doppler (simple)

Templates: import [`.env.dev.example`](../.env.dev.example) into Doppler **`dev`**, and [`.env.prd.example`](../.env.prd.example) into **`prd`** (see also [`doppler.env.example`](../doppler.env.example)). Replace placeholders with real secrets per environment.

1. Create a [Doppler](https://www.doppler.com/) project, add two configs: `dev` and `prd` (names are yours).
2. Put values in each (e.g. fake Telegram bot for dev, real token only in `prd`).
3. **Laptop:** install CLI, `doppler login`, `doppler setup` → pick project + **`dev`**.
4. **VPS:** install CLI, `doppler login` (service token recommended for servers), `doppler setup` → same project + **`prd`**.

`npm run dev` and `npm start` already wrap **`doppler run -c dev`** and **`doppler run -c prd`**, so you get the right config without relying on the last `doppler setup` choice. Your Doppler project must define configs named **`dev`** and **`prd`** (or edit `package.json` scripts to match your names).

```bash
# Local development (loads Doppler `dev`)
npm run dev

# Production after build (loads Doppler `prd`)
npm run build && npm start
```

Docker (pick config explicitly if the container does not use `npm start`):

```bash
doppler run -c prd -- docker compose up -d
```

Use a Compose file that does **not** bake secrets into the image; only `doppler run` supplies env at start.

## Infisical (open source + cloud)

Same idea: [Infisical](https://infisical.com/) project, **environments** `dev` and `prod`, CLI `infisical run -- …` after `infisical login` / service token on the VPS.

## Git

- Commit **no** real `.env`.
- Keep [`.env.dev.example`](../.env.dev.example) / [`.env.prd.example`](../.env.prd.example) (or [`.env.example`](../.env.example) index) in git; never commit real `.env`.
- Optional: commit Doppler/Infisical **config metadata** only if your team allows (often you only document “use Doppler” in README).

## Mental model

| Where        | What you use                    |
|-------------|----------------------------------|
| Your machine | Doppler/Infisical **`dev`**     |
| VPS          | Doppler/Infisical **`prd`**     |
| Git          | No secrets — example file only  |

This gives “pull env here and there” without copying `.env` over SSH by hand.
