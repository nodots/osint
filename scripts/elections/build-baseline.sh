#!/usr/bin/env bash
# Build a historical baseline database for a past House cycle (§43
# backtesting): seed that cycle's districts/races/ratings, ingest that era's
# events from the same sources, and replay assessments over the run-up to
# election day. Run from the repo root with DATABASE_URL_BASE pointing at a
# postgres superuser-ish connection, e.g.
#
#   PGURL=postgresql://osint:osint@127.0.0.1:6432 \
#     scripts/elections/build-baseline.sh 2022
#
# Cycle configs are defined below; the MEDSL returns file path is required
# via RATINGS_FILE (the on-disk 1976-2024 file covers every cycle).
set -euo pipefail

CYCLE="${1:?usage: build-baseline.sh <2022|2024>}"
PGURL="${PGURL:?set PGURL, e.g. postgresql://osint:osint@127.0.0.1:6432}"
RATINGS_FILE="${RATINGS_FILE:?set RATINGS_FILE to the MEDSL house returns file}"

case "$CYCLE" in
  2022)
    ELECTION_DATE="2022-11-08"
    RATING_YEARS="2020,2018"
    CENSUS_CD_ZIP_URL="https://www2.census.gov/geo/tiger/GENZ2022/shp/cb_2022_us_cd118_500k.zip"
    INGEST_FROM="2021-01-20"
    ;;
  2024)
    ELECTION_DATE="2024-11-05"
    RATING_YEARS="2022,2020"
    CENSUS_CD_ZIP_URL="https://www2.census.gov/geo/tiger/GENZ2023/shp/cb_2023_us_cd118_500k.zip"
    INGEST_FROM="2023-01-20"
    ;;
  *) echo "unsupported cycle: $CYCLE" >&2; exit 1 ;;
esac

DB="elections_baseline_${CYCLE}"
DATABASE_URL="${PGURL}/${DB}"
export ELECTION_CYCLE="$CYCLE" ELECTION_DATE RATING_YEARS CENSUS_CD_ZIP_URL \
       INGEST_FROM INGEST_UNTIL="$ELECTION_DATE" DATABASE_URL
# The baseline replays history; the now-surfaces and alerting stay off.
unset SMTP_URL OPENSTATES_API_KEY 2>/dev/null || true

echo "== baseline $CYCLE -> $DB"
# SKIP_DB_CREATE=1 when the database was created out-of-band (e.g. via
# docker exec on a container whose psql can't see the host URL).
if [ -z "${SKIP_DB_CREATE:-}" ]; then
  psql "${PGURL}/postgres" -tAc "SELECT 1 FROM pg_database WHERE datname='${DB}'" | grep -q 1 \
    || psql "${PGURL}/postgres" -c "CREATE DATABASE \"${DB}\""
  psql "$DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS postgis" >/dev/null
fi

pnpm --filter @elections-tracker/api db:migrate
pnpm --filter @elections-tracker/api seed:districts
pnpm --filter @elections-tracker/api seed:races
pnpm --filter @elections-tracker/api seed:candidates
pnpm --filter @elections-tracker/api seed:ratings "$RATINGS_FILE"

# Source failures are audited in ingestion_runs and retried once — the
# CourtListener anonymous tier can 429 on a long historical pull.
INGEST_MODE=backfill pnpm --filter @elections-tracker/worker ingest \
  || { echo "== retrying failed sources"; sleep 60; \
       INGEST_MODE=backfill pnpm --filter @elections-tracker/worker ingest || true; }

# Replay the final 100 days before election day.
pnpm --filter @elections-tracker/worker assess:backfill --days 100 --wipe --until "$ELECTION_DATE"

echo "== baseline $CYCLE complete"
