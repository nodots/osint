import { pool } from "./db.js";
import { runAssessments } from "./services/assess.js";

// Replay assessment history: recompute each day's assessments as of that day
// under the CURRENT methodology, using event occurrence dates. This is
// retrodiction, not a record of what the system said live — every row is
// stamped retrodiction:true in its explanations — and it is destructive by
// design: existing assessment history is wiped so the replayed series is
// internally consistent (a chronological ledger needs each day compared to
// the day before, not to whatever was appended most recently).
//
// Usage:
//   pnpm --filter @elections-tracker/worker assess:backfill -- --days 30 --wipe

const args = process.argv.slice(2);
const days = Number(args[args.indexOf("--days") + 1] || 30);
const wipe = args.includes("--wipe");

async function main() {
  if (!wipe) {
    console.error(
      "assess:backfill replaces ALL assessment history; re-run with --wipe to confirm.",
    );
    process.exit(1);
  }
  if (!Number.isFinite(days) || days < 1 || days > 600) {
    throw new Error(`--days must be 1–600, got ${days}`);
  }

  await pool.query("DELETE FROM assessment_changes");
  await pool.query("DELETE FROM race_risk_assessments");
  console.log(`history wiped; replaying ${days} days`);

  for (let back = days; back >= 0; back--) {
    // Noon UTC keeps every stamp unambiguously inside its calendar day.
    const asOf = new Date(
      `${new Date(Date.now() - back * 86400000).toISOString().slice(0, 10)}T12:00:00Z`,
    );
    const counts = await runAssessments(asOf, back > 0);
    console.log(
      `${asOf.toISOString().slice(0, 10)}: appended=${counts.inserted} unchanged=${counts.skipped}`,
    );
  }

  await pool.end();
  console.log("assessment backfill complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
