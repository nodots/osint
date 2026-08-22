import { RATINGS_VERSION, deriveRating } from "@elections-tracker/shared";
import { pool } from "../db/client.js";
import {
  FEC_CN_URL,
  fecDistrictId,
  loadZipEntry,
  parseHouseCandidates,
} from "./fec.js";

// Derive race ratings from MEDSL district-level House returns (CC0) plus the
// FEC candidate master (incumbent-running signal). Writes races.rating /
// projected_margin and a "derived" forecast_snapshots row per race.
//
// The MEDSL file must be downloaded manually — the Harvard Dataverse dataset
// ("U.S. House 1976–2024", doi:10.7910/DVN/IG0UN2) sits behind a guestbook
// form that scripts should not bypass. The data itself is CC0.
//
// Usage:
//   pnpm --filter @elections-tracker/api seed:ratings <medsl-house-returns.(csv|tab)> [cn26.zip]
//
// RATING_YEARS overrides the "recent,prior" cycles (default "2024,2022") —
// mainly for tests against older MEDSL releases.

const [RECENT_YEAR = 2024, PRIOR_YEAR = 2022] = (
  process.env.RATING_YEARS ?? "2024,2022"
)
  .split(",")
  .map(Number);

// Quote-aware delimited-line parser (MEDSL ships quoted CSV; the Dataverse
// .tab variant is tab-delimited with the same columns).
function parseLine(line: string, delim: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      fields.push(cur);
      cur = "";
    } else cur += ch;
  }
  fields.push(cur);
  return fields;
}

interface DistrictResult {
  margin: number; // two-party margin, points of total votes, + = D
}

// Aggregate candidate votes across party lines (fusion states list one
// candidate on several rows), then take each major party's strongest
// candidate. Handles top-two same-party generals (margin ±100) and
// uncontested seats.
function marginsForYear(
  rows: Record<string, string>[],
  year: number,
): Map<string, DistrictResult> {
  interface Tally {
    total: number;
    candidates: Map<string, { votes: number; dem: boolean; rep: boolean }>;
  }
  const byDistrict = new Map<string, Tally>();
  for (const r of rows) {
    if (Number(r.year) !== year) continue;
    if (!/^us house$/i.test(r.office ?? "")) continue;
    if (!/^gen$/i.test(r.stage ?? "")) continue;
    if (/^true$/i.test(r.special ?? "")) continue;
    const candidate = r.candidate?.trim();
    if (!candidate) continue;
    const state = r.state_po ?? "";
    const district = Number(r.district);
    const id =
      district === 0
        ? `${state}-AL`
        : `${state}-${String(district).padStart(2, "0")}`;
    let tally = byDistrict.get(id);
    if (!tally) {
      tally = { total: 0, candidates: new Map() };
      byDistrict.set(id, tally);
    }
    tally.total = Math.max(tally.total, Number(r.totalvotes) || 0);
    let cand = tally.candidates.get(candidate);
    if (!cand) {
      cand = { votes: 0, dem: false, rep: false };
      tally.candidates.set(candidate, cand);
    }
    cand.votes += Number(r.candidatevotes) || 0;
    const party = (r.party ?? "").toLowerCase();
    if (party.startsWith("democrat")) cand.dem = true;
    if (party.startsWith("republican")) cand.rep = true;
  }

  const out = new Map<string, DistrictResult>();
  for (const [id, tally] of byDistrict) {
    if (tally.total <= 0) continue;
    let demBest = 0;
    let repBest = 0;
    for (const c of tally.candidates.values()) {
      if (c.dem) demBest = Math.max(demBest, c.votes);
      if (c.rep) repBest = Math.max(repBest, c.votes);
    }
    if (demBest === 0 && repBest === 0) continue;
    out.set(id, { margin: ((demBest - repBest) / tally.total) * 100 });
  }
  return out;
}

async function main() {
  const returnsPath = process.argv[2];
  if (!returnsPath) {
    console.error(
      "Usage: seed:ratings <medsl-house-returns.(csv|tab)> [cn26.zip]\n" +
        "Download the returns file (CC0) via the guestbook at\n" +
        "https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/IG0UN2",
    );
    process.exit(1);
  }
  const { readFile } = await import("node:fs/promises");
  const raw = await readFile(returnsPath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const headerLine = lines[0];
  if (!headerLine) throw new Error(`empty returns file: ${returnsPath}`);
  const delim = headerLine.includes("\t") ? "\t" : ",";
  const header = parseLine(headerLine, delim);
  const rows = lines.slice(1).map((l) => {
    const f = parseLine(l, delim);
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = f[i] ?? ""));
    return obj;
  });
  console.log(`Returns rows: ${rows.length} (${delim === "\t" ? "tab" : "csv"}).`);

  const recent = marginsForYear(rows, RECENT_YEAR);
  const prior = marginsForYear(rows, PRIOR_YEAR);
  console.log(
    `Districts with results: ${recent.size} (${RECENT_YEAR}), ${prior.size} (${PRIOR_YEAR}).`,
  );

  const cnTxt = await loadZipEntry(process.argv[3], FEC_CN_URL, ".txt");
  const incumbentRunning = new Set<string>();
  for (const c of parseHouseCandidates(cnTxt)) {
    if (c.incumbentChallengerOpen === "I") {
      incumbentRunning.add(fecDistrictId(c.state, c.district));
    }
  }
  console.log(`Districts with an incumbent filed: ${incumbentRunning.size}.`);

  const client = await pool.connect();
  const distribution = new Map<string, number>();
  let noHistory = 0;
  try {
    await client.query("BEGIN");
    const races = await client.query(
      `SELECT r.id, r.district_id FROM races r
        JOIN elections e ON e.id = r.election_id
       WHERE e.election_type = 'HOUSE' AND e.cycle = 2026`,
    );
    if (races.rows.length === 0) {
      throw new Error("no 2026 House races — run seed:races first");
    }
    for (const row of races.rows) {
      const derived = deriveRating({
        margin2024: recent.get(row.district_id)?.margin ?? null,
        margin2022: prior.get(row.district_id)?.margin ?? null,
        incumbentRunning: incumbentRunning.has(row.district_id),
      });
      if (!derived) {
        noHistory++;
        continue;
      }
      distribution.set(
        derived.rating,
        (distribution.get(derived.rating) ?? 0) + 1,
      );
      await client.query(
        `UPDATE races SET rating = $2, rating_source = $3,
                rating_updated_at = now(), projected_margin = $4
          WHERE id = $1`,
        [row.id, derived.rating, `derived ${RATINGS_VERSION}`, derived.blendedMargin],
      );
      await client.query(
        `INSERT INTO forecast_snapshots (race_id, source, snapshot_date, rating, margin)
         VALUES ($1, 'derived', CURRENT_DATE, $2, $3)
         ON CONFLICT ON CONSTRAINT forecast_race_source_date
         DO UPDATE SET rating = EXCLUDED.rating, margin = EXCLUDED.margin`,
        [row.id, derived.rating, derived.blendedMargin],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const summary = [...distribution.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  console.log(`Ratings (${RATINGS_VERSION}): ${summary}; no history: ${noHistory}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
