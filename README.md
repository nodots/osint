# Nodots OSINT Platform

Open-source intelligence trackers as verticals of one platform, served from a single
domain with path-based routing:

| Path | Vertical | Status |
|---|---|---|
| `osint.nodots.com/ukraine` | Ukraine conflict tracker — strikes, frontline movement, thermal anomalies | live vertical (imported from `nodots/ukraine-conflict-tracker`) |
| `osint.nodots.com/elections` | Election Integrity Monitor — evidence-backed election-process risk for the 2026 U.S. House | in development |
| `osint.nodots.com/naval` | Naval vessel tracker — AIS + OSINT vessel positions | planned (lives at `nodots/naval-vessel-tracker` until imported) |

## Layout

```text
apps/
  gateway            Caddy reverse proxy + landing page (path routing for the whole platform)
  ukraine-web        React + Vite + MapLibre SPA          (served at /ukraine)
  ukraine-api        Express + Drizzle + PostGIS           (served at /api/ukraine)
  ukraine-worker     Ingestion (GDELT, WarSpotting, DeepState, FIRMS, UCDP, ACLED)
  elections-web      React + Vite SPA                      (served at /elections)
  elections-api      Express + Drizzle + PostGIS           (served at /api/elections)
packages/
  ukraine-shared     @ukraine-tracker/shared — domain types + severity heuristic
  elections-shared   @elections-tracker/shared — domain types + risk model
docs/
  specs/             Product specs (election-subversion.md, ...)
  ukraine/           Ukraine tracker docs
```

One Postgres 17 + PostGIS 3.5 instance backs all verticals; each vertical owns its
own tables and Drizzle migration journal.

## Ports

Each vertical gets a contiguous block:

```text
gateway         6720
ukraine-web     6731   ukraine-api    6732
elections-web   6751   elections-api  6752
naval-web       6741   naval-api      6742   (reserved)
```

## Development

Requires Node >= 22.13 and pnpm 11 (via `corepack enable`).

```bash
pnpm install
pnpm dev            # all apps in parallel
pnpm typecheck
```

## Deployment

`docker compose up -d --build` — see `deploy.env.example` for required configuration.
The gateway terminates TLS for `osint.nodots.com` and routes by path.
