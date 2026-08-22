import { pool } from "../db/client.js";

// Create the 2026 House general election and one race per imported district,
// and fill current-member/incumbent-party columns from the @unitedstates
// congress-legislators dataset (CC0). Spec §36 step 3 (races); ratings and
// candidates come from their own seeds.
//
// Usage:
//   pnpm --filter @elections-tracker/api seed:races [path-to-legislators-current.json]

const LEGISLATORS_URL =
  process.env.LEGISLATORS_URL ??
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/legislators-current.json";

const CYCLE = 2026;
const ELECTION_DATE = "2026-11-03";

interface LegislatorTerm {
  type: string;
  state: string;
  district?: number;
  party: string;
  end: string;
}

interface Legislator {
  name: { official_full: string };
  terms: LegislatorTerm[];
}

const PARTY_CODES: Record<string, string> = {
  Democrat: "D",
  Republican: "R",
  Independent: "I",
};

function districtIdFor(state: string, district: number): string {
  return district === 0
    ? `${state}-AL`
    : `${state}-${String(district).padStart(2, "0")}`;
}

async function loadLegislators(): Promise<Legislator[]> {
  const localPath = process.argv[2];
  if (localPath) {
    const { readFile } = await import("node:fs/promises");
    return JSON.parse(await readFile(localPath, "utf8"));
  }
  console.log(`Downloading ${LEGISLATORS_URL}`);
  const res = await fetch(LEGISLATORS_URL);
  if (!res.ok) {
    throw new Error(
      `legislators download failed: ${res.status} ${res.statusText}`,
    );
  }
  return (await res.json()) as Legislator[]; // congress-legislators publishes a top-level array; shape is validated field-by-field below
}

async function main() {
  const legislators = await loadLegislators();
  const members = new Map<string, { name: string; party: string }>();
  for (const leg of legislators) {
    const term = leg.terms.at(-1);
    if (!term || term.type !== "rep" || term.district === undefined) continue;
    members.set(districtIdFor(term.state, term.district), {
      name: leg.name.official_full,
      party: PARTY_CODES[term.party] ?? term.party,
    });
  }
  console.log(`Members mapped: ${members.size} (incl. delegates).`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query(
      `SELECT id FROM elections WHERE election_type = 'HOUSE' AND cycle = $1`,
      [CYCLE],
    );
    let electionId: number;
    if (existing.rows.length > 0) {
      electionId = existing.rows[0].id;
    } else {
      const inserted = await client.query(
        `INSERT INTO elections (election_type, cycle, election_date, status)
         VALUES ('HOUSE', $1, $2, 'UPCOMING') RETURNING id`,
        [CYCLE, ELECTION_DATE],
      );
      electionId = inserted.rows[0].id;
    }

    const districts = await client.query(
      `SELECT id FROM districts ORDER BY id`,
    );
    if (districts.rows.length === 0) {
      throw new Error("no districts found — run seed:districts first");
    }

    let races = 0;
    let membersSet = 0;
    let vacant = 0;
    for (const row of districts.rows) {
      const member = members.get(row.id);
      if (member) membersSet++;
      else vacant++;

      await client.query(
        `UPDATE districts SET current_member = $2, incumbent_party = $3 WHERE id = $1`,
        [row.id, member?.name ?? null, member?.party ?? null],
      );
      await client.query(
        `INSERT INTO races (election_id, district_id, incumbent_party)
         VALUES ($1, $2, $3)
         ON CONFLICT ON CONSTRAINT races_election_district
         DO UPDATE SET incumbent_party = EXCLUDED.incumbent_party`,
        [electionId, row.id, member?.party ?? null],
      );
      races++;
    }

    await client.query("COMMIT");
    console.log(
      `Election ${electionId} (HOUSE ${CYCLE}): ${races} races upserted, ` +
        `${membersSet} seats with a sitting member, ${vacant} vacant.`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
