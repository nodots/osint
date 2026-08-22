import { pool } from "./db.js";
import {
  insertEvents,
  refreshOperationalStatus,
  upsertCases,
} from "./services/ingest.js";
import { runAssessments } from "./services/assess.js";
import { finishRun, startRun } from "./services/runs.js";
import { fetchVotingDockets } from "./sources/courtlistener.js";
import { fetchFederalRegisterEvents } from "./sources/federal-register.js";

// Elections ingest worker. Mirrors the ukraine worker: one audited run per
// source, INGEST_MODE daily (trailing window) or backfill
// (BACKFILL_MONTHS, default since 2025-01-20 — the spec §34 history start),
// then a derived assessment pass over whatever the sources produced.

async function runFederalRegister(from: Date): Promise<void> {
  const runId = await startRun("events:federal_register");
  try {
    const { events, lowRelevance } = await fetchFederalRegisterEvents(from);
    const counts = await insertEvents(events);
    await finishRun(runId, {
      status: "success",
      recordsSeen: counts.seen + lowRelevance,
      recordsInserted: counts.inserted,
      recordsSkipped: counts.skipped + lowRelevance,
    });
    console.log(
      `events[federal_register] seen=${counts.seen + lowRelevance} inserted=${counts.inserted} ` +
        `low-relevance=${lowRelevance}`,
    );
  } catch (err) {
    await finishRun(runId, {
      status: "failure",
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function runCourtListener(from: Date, mode: string): Promise<void> {
  const runId = await startRun("events:courtlistener");
  try {
    const { events, cases, statusByExternalId } = await fetchVotingDockets(
      from,
      mode === "daily" ? 10 : 60,
    );
    // Cases first so events can carry related_case_id (§25 lifecycle links);
    // then refresh operational status on rows we already had, so a docket
    // terminating flips its event out of the vulnerability signals.
    const caseCounts = await upsertCases(cases);
    const eventCounts = await insertEvents(
      events.map(({ caseKey, ...event }) => ({
        ...event,
        relatedCaseId: caseCounts.ids.get(caseKey),
      })),
    );
    const refreshed = await refreshOperationalStatus(
      "courtlistener",
      statusByExternalId,
    );
    await finishRun(runId, {
      status: "success",
      recordsSeen: eventCounts.seen,
      recordsInserted: eventCounts.inserted,
      recordsSkipped: eventCounts.skipped,
    });
    console.log(
      `events[courtlistener] seen=${eventCounts.seen} inserted=${eventCounts.inserted} ` +
        `cases-new=${caseCounts.inserted} status-refreshed=${refreshed}`,
    );
  } catch (err) {
    await finishRun(runId, {
      status: "failure",
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function runAssess(now: Date): Promise<void> {
  const runId = await startRun("assess:derived");
  try {
    const counts = await runAssessments(now);
    await finishRun(runId, {
      status: "success",
      recordsSeen: counts.seen,
      recordsInserted: counts.inserted,
      recordsSkipped: counts.skipped,
    });
    console.log(
      `assess[derived] races=${counts.seen} appended=${counts.inserted} unchanged=${counts.skipped}`,
    );
  } catch (err) {
    await finishRun(runId, {
      status: "failure",
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function main() {
  const mode = process.env.INGEST_MODE ?? "backfill";
  const now = new Date();
  const from =
    mode === "daily"
      ? new Date(now.getTime() - 3 * 86400000) // overlap absorbs publish lag
      : process.env.BACKFILL_MONTHS
        ? new Date(
            new Date(now).setMonth(now.getMonth() - Number(process.env.BACKFILL_MONTHS)),
          )
        : new Date("2025-01-20T00:00:00Z"); // spec §34 history start

  console.log(
    `ingest mode=${mode} from=${from.toISOString().slice(0, 10)} to=${now
      .toISOString()
      .slice(0, 10)}`,
  );

  // Sources are independent; one failing must not starve the others or the
  // assessment pass.
  const failures: string[] = [];
  for (const [name, run] of [
    ["federal_register", () => runFederalRegister(from)],
    ["courtlistener", () => runCourtListener(from, mode)],
  ] as const) {
    try {
      await run();
    } catch (err) {
      failures.push(name);
      console.error(`${name} failed:`, err instanceof Error ? err.message : err);
    }
  }

  await runAssess(now);

  await pool.end();
  if (failures.length > 0) {
    console.error(`ingest finished with failed sources: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.log("ingest complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
