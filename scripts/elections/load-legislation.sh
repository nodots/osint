#!/usr/bin/env bash
# After legislation:fetch completes: load historical bills into each
# baseline, replay its 100 days, then refresh comparison + calibration.
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"
PGURL="postgresql://osint:osint@127.0.0.1:6432"
cd /home/kenr/Code/osint

declare -A EDAY=( [2016]=2016-11-08 [2018]=2018-11-06 [2020]=2020-11-03 [2022]=2022-11-08 [2024]=2024-11-05 )
declare -A FROM=( [2016]=2015-01-20 [2018]=2017-01-20 [2020]=2019-01-20 [2022]=2021-01-20 [2024]=2023-01-20 )

for c in 2016 2018 2020 2022 2024; do
  DATABASE_URL="$PGURL/elections_baseline_$c" \
  INGEST_FROM="${FROM[$c]}" ELECTION_DATE="${EDAY[$c]}" \
    pnpm --filter @elections-tracker/worker legislation:load
  DATABASE_URL="$PGURL/elections_baseline_$c" ELECTION_CYCLE=$c \
    pnpm --filter @elections-tracker/worker assess:backfill --days 100 --wipe --until "${EDAY[$c]}" \
    | tail -1
  echo "== $c loaded+replayed"
done
# The live tracker gets the same full-recall load (its daily source only
# ever saw top-relevance pages), then its history replays and the
# sensitivity DB rebuilds from it.
DATABASE_URL="$PGURL/elections_tracker" \
INGEST_FROM=2025-01-20 ELECTION_DATE=2026-08-22 \
  pnpm --filter @elections-tracker/worker legislation:load
DATABASE_URL="$PGURL/elections_tracker" \
  pnpm --filter @elections-tracker/worker assess:backfill --days 30 --wipe | tail -1
sudo -n docker exec elections-dev psql -U osint -d postgres \
  -c "DROP DATABASE IF EXISTS elections_sens_2026" \
  -c "CREATE DATABASE elections_sens_2026 TEMPLATE elections_tracker"
sudo -n docker exec elections-dev psql -U osint -d elections_sens_2026 \
  -c "UPDATE events SET material = false WHERE raw_data->>'source' IN ('openstates','gdelt_gkg')"
DATABASE_URL="$PGURL/elections_sens_2026" \
  pnpm --filter @elections-tracker/worker assess:backfill --days 2 --wipe | tail -1

pnpm --filter @elections-tracker/worker baseline:compare | grep -v SERIES
pnpm --filter @elections-tracker/worker baseline:export
echo "== legislation load complete"
