# Elections vertical — deploy notes

The elections services ride the shared stack (`docker-compose.yml`, one VPS,
Caddy gateway on `osint.nodots.com`); see `docs/ukraine/deploy-vps.md` for the
base VPS/DNS/TLS procedure. This file covers only what the elections vertical
adds.

## Environment

In `.env` (from `deploy.env.example`): `ELECTIONS_DB_NAME`,
`COURTLISTENER_TOKEN` (optional), `ELECTIONS_INGEST_TIME_UTC`, and the digest
block (`SMTP_URL`, `DIGEST_FROM`, `DIGEST_TO`, `DIGEST_RISK_DELTA`). Unset
`SMTP_URL` simply disables the digest.

## First-time seeding (order matters)

Migrations run automatically (`elections-migrate`). Then, one time, from the
repo on the box:

```sh
# 1. District geometries (Census CD119, ~7MB download)
docker compose run --rm elections-api pnpm --filter @elections-tracker/api seed:districts

# 2. Election + races + members (congress-legislators)
docker compose run --rm elections-api pnpm --filter @elections-tracker/api seed:races

# 3. Candidates (FEC bulk files)
docker compose run --rm elections-api pnpm --filter @elections-tracker/api seed:candidates

# 4. Derived ratings — needs the MEDSL returns file (CC0, manual download
#    behind the Dataverse guestbook: doi:10.7910/DVN/IG0UN2). Copy it to the
#    box first, then mount it into the run:
docker compose run --rm -v /path/to/1976-2024-house.tab:/data/house.tab \
  elections-api pnpm --filter @elections-tracker/api seed:ratings /data/house.tab
```

## Backfill

The worker container ingests on start (daily window). Run the historical
backfill (events since 2025-01-20) once:

```sh
docker compose run --rm -e INGEST_MODE=backfill \
  elections-worker pnpm --filter @elections-tracker/worker ingest
```

Re-runs are idempotent; the assessment pass appends only when values move.

## Checks

- `https://osint.nodots.com/api/elections/health`
- `ingestion_runs` has success rows for `events:federal_register`,
  `events:courtlistener`, `events:courtlistener_rulings`, `assess:derived`
  after the next daily run.
- `/elections/changes` shows the ledger; the digest arrives when material
  (quiet days send nothing — that is correct behavior, not a failure).
