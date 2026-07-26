# Deploying Slinga (family beta)

One workflow dispatch takes the app live: **Actions → `deploy-staging` → Run workflow**.
Everything is built and verified in CI first (web bundle, route-api image on GHCR,
Sweden graph, the exact docker-compose stack booted inside the runner with Basic Auth);
the ship step runs only when the secrets below exist. Without them the run is a full
dry-run — nothing to babysit.

## VPS prerequisites (one-time, manual)

- Ubuntu-class VPS with **Docker + the compose plugin** installed, ports 80/443 open.
  Sizing: see "Graph serving memory" in the latest `deploy-staging` run summary /
  STATUS.md before ordering (8 vs 16 GB decision).
- A DNS **A record** for your chosen domain pointing at the VPS (Caddy then issues
  TLS automatically).
- An SSH keypair whose public key is in `~/.ssh/authorized_keys` for the deploy user
  (the user must be able to run `docker compose`).

## Repository secrets (Settings → Secrets and variables → Actions)

| Secret            | Value                                                                |
| ----------------- | -------------------------------------------------------------------- |
| `DOMAIN`          | e.g. `slinga.example.com` (no scheme)                                |
| `SSH_HOST`        | VPS IP or hostname                                                   |
| `SSH_USER`        | deploy user                                                          |
| `SSH_KEY`         | the **private** key (PEM, full contents)                             |
| `BASIC_AUTH_USER` | shared family username, e.g. `familj`                                |
| `BASIC_AUTH_HASH` | bcrypt hash of the shared password — generate with the command below |

Generate the hash locally (never store the plaintext anywhere):

```bash
docker run --rm -it caddy:2 caddy hash-password
# paste the password twice, copy the $2a$... output into the secret as-is
```

The workflow escapes `$` for compose interpolation itself — paste the raw hash.

## What a deploy does

1. Builds web + API, pushes `ghcr.io/mikdac/slinga-route-api:<sha>`.
2. Builds (or restores from cache) the Sweden GraphHopper graph and measures its
   actual serving RSS with a small heap (recorded in the run summary → STATUS.md).
3. Boots the full compose stack **inside the runner** and smoke-tests
   health/generate/web through Caddy with Basic Auth.
4. If secrets exist: tars the bundle (compose.yml, Caddyfile, error page, web dist,
   graph, GraphHopper JAR+config, .env) → `scp` to `/opt/slinga` → `docker compose
pull && up -d` → asserts the TLS auth wall answers.

Re-dispatching is idempotent: same paths, compose reconciles, the graph is replaced
atomically by the tar extract. To refresh OSM data, bump `EXTRACT_PIN` in the
workflow and re-dispatch (this is the manual version of the weekly refresh runbook).

## Rotating the family password

Generate a new hash (command above), update `BASIC_AUTH_HASH`, re-dispatch.
Browsers will prompt again on next visit.

## Distribution

Send the family the URL (`https://<DOMAIN>`) and the shared username/password.
That is the entire beta program (STATUS.md, "Family beta" milestone).
