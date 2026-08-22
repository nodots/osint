import { pool } from "../db/client.js";
import {
  FEC_CN_URL,
  displayName,
  fecDistrictId,
  loadZipEntry,
  parseHouseCandidates,
} from "./fec.js";

// Fill race D/R candidate names from FEC bulk data (public domain). Where a
// party has several statutory candidates in a district (pre- or multi-way
// primaries), the leading fundraiser per the FEC financial summary is chosen —
// a documented deterministic heuristic, not a primary-outcome claim.
//
// Usage:
//   pnpm --filter @elections-tracker/api seed:candidates [cn26.zip] [weball26.zip]

import { ELECTION_CYCLE } from "./fec.js";

const FEC_WEBALL_URL =
  process.env.FEC_WEBALL_URL ??
  `https://www.fec.gov/files/bulk-downloads/${ELECTION_CYCLE}/weball${String(ELECTION_CYCLE % 100).padStart(2, "0")}.zip`;

function parseReceipts(weballTxt: Uint8Array): Map<string, number> {
  const receipts = new Map<string, number>();
  for (const line of new TextDecoder().decode(weballTxt).split("\n")) {
    if (!line.trim()) continue;
    const f = line.split("|");
    // CAND_ID|CAND_NAME|CAND_ICI|PTY_CD|CAND_PTY_AFFILIATION|TTL_RECEIPTS|...
    receipts.set(f[0] ?? "", Number(f[5]) || 0);
  }
  return receipts;
}

async function main() {
  const cnTxt = await loadZipEntry(process.argv[2], FEC_CN_URL, ".txt");
  const weballTxt = await loadZipEntry(
    process.argv[3],
    FEC_WEBALL_URL,
    ".txt",
  );

  const candidates = parseHouseCandidates(cnTxt).filter(
    (c) => c.party === "DEM" || c.party === "REP",
  );
  const receipts = parseReceipts(weballTxt);

  // (districtId, party) -> best-funded candidate; candId tiebreak for determinism.
  const chosen = new Map<string, { name: string; receipts: number; candId: string }>();
  for (const c of candidates) {
    const key = `${fecDistrictId(c.state, c.district)}|${c.party}`;
    const amount = receipts.get(c.candId) ?? 0;
    const cur = chosen.get(key);
    if (
      !cur ||
      amount > cur.receipts ||
      (amount === cur.receipts && c.candId < cur.candId)
    ) {
      chosen.set(key, { name: displayName(c.name), receipts: amount, candId: c.candId });
    }
  }

  const client = await pool.connect();
  let updated = 0;
  let unmatched = 0;
  try {
    await client.query("BEGIN");
    const races = await client.query(
      `SELECT r.id, r.district_id FROM races r
        JOIN elections e ON e.id = r.election_id
       WHERE e.election_type = 'HOUSE' AND e.cycle = ${ELECTION_CYCLE}`,
    );
    if (races.rows.length === 0) {
      throw new Error(`no ${ELECTION_CYCLE} House races — run seed:races first`);
    }
    const raceDistricts = new Set(races.rows.map((r) => r.district_id));
    for (const key of chosen.keys()) {
      if (!raceDistricts.has(key.split("|")[0])) unmatched++;
    }

    for (const row of races.rows) {
      const dem = chosen.get(`${row.district_id}|DEM`);
      const rep = chosen.get(`${row.district_id}|REP`);
      if (!dem && !rep) continue;
      await client.query(
        `UPDATE races SET
           democratic_candidate = COALESCE($2, democratic_candidate),
           republican_candidate = COALESCE($3, republican_candidate)
         WHERE id = $1`,
        [row.id, dem?.name ?? null, rep?.name ?? null],
      );
      updated++;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  console.log(
    `Candidates: ${candidates.length} statutory D/R filings, ` +
      `${updated} races updated, ${unmatched} FEC district/party slots with no matching race.`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
