import { pool } from "./db.js";
import {
  classifyRuling,
  rulingDedupKey,
  rulingScope,
} from "./sources/courtlistener-rulings.js";
import { stateFromCourtId } from "./sources/courtlistener.js";

// Maintenance pass (2026.09.4): re-run the ruling classifier over stored
// courtlistener_rulings events so classifier fixes reach rows ingested under
// older versions. Nothing is deleted — rows that no longer classify (stays,
// filing mechanics) or that duplicate an identical order on another docket
// are marked immaterial with the reason in raw_data, keeping the evidence
// chain intact. Also copies case termination dates onto linked court events
// whose expiry is not yet recorded. Idempotent; run once per database after
// migrating:
//
//   DATABASE_URL=... pnpm --filter @elections-tracker/worker reclassify:rulings

interface RulingRow {
  id: number;
  title: string;
  summary: string;
  occurred_at: Date;
  material: boolean;
  event_types: string[];
  jurisdiction_type: string;
  court_id: string | null;
}

const { rows } = await pool.query<RulingRow>(
  `SELECT id, title, summary, occurred_at, material, event_types,
          jurisdiction_type, raw_data->>'courtId' AS court_id
     FROM events WHERE raw_data->>'source' = 'courtlistener_rulings'
    ORDER BY id`,
);

let unclassified = 0;
let flipped = 0;
let rescoped = 0;
let deduped = 0;
const seen = new Map<string, number>();

for (const row of rows) {
  const direction = classifyRuling(row.summary);
  if (direction === null) {
    if (row.material) {
      await pool.query(
        `UPDATE events SET material = false, updated_at = now(),
                raw_data = raw_data || '{"reclassified":"unclassifiable"}',
                last_modified_by = 'worker:reclassify-rulings'
          WHERE id = $1`,
        [row.id],
      );
      unclassified++;
    }
    continue;
  }

  const key = rulingDedupKey(
    row.summary,
    row.occurred_at.toISOString().slice(0, 10),
  );
  const first = seen.get(key);
  if (first !== undefined) {
    if (row.material) {
      await pool.query(
        `UPDATE events SET material = false, updated_at = now(),
                raw_data = raw_data || jsonb_build_object('duplicateOf', $2::int),
                last_modified_by = 'worker:reclassify-rulings'
          WHERE id = $1`,
        [row.id, first],
      );
      deduped++;
    }
    continue;
  }
  seen.set(key, row.id);

  // Caption from the stored title: "<label> — <caseName> (<court>)".
  const caption = / — (.+) \([^)]+\)$/.exec(row.title)?.[1] ?? "";
  const state = row.court_id ? stateFromCourtId(row.court_id) : null;
  const blocks = direction === "BLOCKS";
  const national =
    !state || (blocks && rulingScope(row.summary, caption, []) === "US");
  const types = blocks
    ? [...new Set(["COURT_RULING", "INJUNCTION"])]
    : ["COURT_RULING"];
  const title = `${blocks ? "Injunctive relief granted" : "Injunctive relief denied"} — ${caption || row.title}`;

  const typesChanged =
    types.length !== row.event_types.length ||
    types.some((t) => !row.event_types.includes(t));
  const scopeChanged =
    row.jurisdiction_type !== (national ? "FEDERAL" : "STATE");
  if (!typesChanged && !scopeChanged && row.material) continue;

  await pool.query(
    `UPDATE events SET event_types = $2, title = $3, material = true,
            jurisdiction_type = $4, jurisdictions = $5, updated_at = now(),
            raw_data = raw_data || jsonb_build_object('direction', $6::text),
            last_modified_by = 'worker:reclassify-rulings'
      WHERE id = $1`,
    [
      row.id,
      types,
      title,
      national ? "FEDERAL" : "STATE",
      !national && state ? [state] : ["US"],
      direction,
    ],
  );
  if (typesChanged) flipped++;
  else rescoped++;
}

// Court events whose docket has a recorded termination expire with it; the
// ingest refresh covers dockets the search still returns, this covers the
// rest via the case link.
const expiry = await pool.query(
  `UPDATE events e SET
      expired_at = (c.terminated_at::text || 'T00:00:00Z')::timestamptz,
      in_force_status = COALESCE(e.in_force_status, 'ACTIVE'),
      operational_status = CASE WHEN c.terminated_at <= now()::date
        THEN 'EXPIRED' ELSE e.operational_status END,
      updated_at = now(), last_modified_by = 'worker:reclassify-rulings'
     FROM cases c
    WHERE e.related_case_id = c.id AND c.terminated_at IS NOT NULL
      AND e.raw_data->>'source' IN ('courtlistener', 'courtlistener_rulings')
      AND e.expired_at IS DISTINCT FROM (c.terminated_at::text || 'T00:00:00Z')::timestamptz`,
);

console.log(
  `reclassify[courtlistener_rulings] rows=${rows.length} ` +
    `unclassifiable=${unclassified} deduped=${deduped} flipped=${flipped} ` +
    `rescoped=${rescoped} expiry-linked=${expiry.rowCount}`,
);
await pool.end();
