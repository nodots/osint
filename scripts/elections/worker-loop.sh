#!/usr/bin/env sh

# Daily elections ingest at a fixed UTC wall-clock time; same clock-anchored
# loop as scripts/ukraine/worker-loop.sh so restarts don't drift the schedule.

TARGET_UTC="${INGEST_TIME_UTC:-08:00}"
h="${TARGET_UTC%%:*}"
m="${TARGET_UTC##*:}"
h="${h#0}"; h="${h:-0}"
m="${m#0}"; m="${m:-0}"
target=$(( h * 3600 + m * 60 ))

run() { pnpm --filter @elections-tracker/worker ingest || true; }

# Ingest once on start so a fresh deploy populates without waiting a full day.
run

while true; do
  now=$(date -u +%s)
  into_day=$(( now % 86400 ))
  if [ "$into_day" -lt "$target" ]; then
    wait=$(( target - into_day ))
  else
    wait=$(( 86400 - into_day + target ))
  fi
  echo "elections-worker: next ingest at ${TARGET_UTC} UTC (in ${wait}s)"
  sleep "$wait"
  run
done
