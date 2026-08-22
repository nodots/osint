import { writeFileSync } from "node:fs";
import pg from "pg";

// Export the historical-baseline series and summary stats to a static JSON
// consumed by the web app's Baseline page. Baselines are immutable
// retrodictions, so a checked-in snapshot is the honest transport; the 2026
// series stays live from the API. Re-run after rebuilding baselines:
//
//   PGURL=postgresql://osint:osint@127.0.0.1:6432 \
//     pnpm --filter @elections-tracker/worker baseline:export

const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (v) => v);

const PGURL = process.env.PGURL ?? "postgresql://osint:osint@127.0.0.1:6432";
const HIGH_RISK = 0.12;
const PIVOTAL = 0.1;
const OUT = new URL(
  "../../elections-web/src/data/baselines.json",
  import.meta.url,
).pathname;

interface CycleExport {
  electionDay: string;
  series: { dte: number; hrp: number }[];
  composition: Record<string, number>;
  volumes: Record<string, number>;
}

async function exportCycle(
  db: string,
  electionDay: string,
): Promise<CycleExport> {
  const pool = new pg.Pool({ connectionString: `${PGURL}/${db}` });
  const series = await pool.query<{ d: string; hrp: string }>(
    `WITH days AS (SELECT DISTINCT assessed_at::date AS d FROM race_risk_assessments)
     SELECT days.d,
            count(*) FILTER (WHERE latest.subversion_risk >= $1 AND latest.pivotality >= $2) AS hrp
       FROM days
       JOIN LATERAL (
         SELECT DISTINCT ON (race_id) subversion_risk::float8, pivotality::float8
           FROM race_risk_assessments WHERE assessed_at::date <= days.d
          ORDER BY race_id, assessed_at DESC) latest ON true
      GROUP BY days.d ORDER BY days.d`,
    [HIGH_RISK, PIVOTAL],
  );
  const composition = await pool.query(
    `WITH latest AS (SELECT DISTINCT ON (race_id) * FROM race_risk_assessments
                     ORDER BY race_id, assessed_at DESC)
     SELECT round(avg(litigation_exposure::numeric)*100) AS "litigationExposure",
            round(avg(active_pressure::numeric)*100) AS "activePressure",
            round(avg(institutional_resistance::numeric)*100) AS "institutionalResistance"
       FROM latest`,
  );
  const volumes = await pool.query(
    `SELECT count(*) FILTER (WHERE raw_data->>'source'='courtlistener' AND material)::int AS dockets,
            count(*) FILTER (WHERE raw_data->>'source'='courtlistener_rulings' AND material)::int AS rulings,
            count(*) FILTER (WHERE 'INJUNCTION' = ANY(event_types))::int AS "blockingInjunctions"
       FROM events`,
  );
  await pool.end();
  const eday = new Date(`${electionDay}T00:00:00Z`).getTime();
  return {
    electionDay,
    series: series.rows.map((r) => ({
      dte: Math.round((eday - new Date(`${r.d}T00:00:00Z`).getTime()) / 86400000),
      hrp: Number(r.hrp),
    })),
    composition: Object.fromEntries(
      Object.entries(composition.rows[0]).map(([k, v]) => [k, Number(v)]),
    ),
    volumes: Object.fromEntries(
      Object.entries(volumes.rows[0]).map(([k, v]) => [k, Number(v)]),
    ),
  };
}

async function sensitivity(): Promise<number | null> {
  const pool = new pg.Pool({
    connectionString: `${PGURL}/elections_sens_2026`,
  });
  try {
    const r = await pool.query(
      `WITH latest AS (SELECT DISTINCT ON (race_id) * FROM race_risk_assessments
                       ORDER BY race_id, assessed_at DESC)
       SELECT count(*) FILTER (WHERE subversion_risk::float8 >= $1 AND pivotality::float8 >= $2)::int AS hrp
         FROM latest`,
      [HIGH_RISK, PIVOTAL],
    );
    return Number(r.rows[0].hrp);
  } catch {
    return null;
  } finally {
    await pool.end();
  }
}

const CYCLE_DAYS: Record<string, string> = {
  "2016": "2016-11-08",
  "2018": "2018-11-06",
  "2020": "2020-11-03",
  "2022": "2022-11-08",
  "2024": "2024-11-05",
};

const cycles: Record<string, CycleExport> = {};
for (const [cycle, day] of Object.entries(CYCLE_DAYS)) {
  cycles[cycle] = await exportCycle(`elections_baseline_${cycle}`, day);
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  methodologyVersion: "2026.09.3",
  // 2026 recomputed without the state-legislation source (which cannot be
  // replayed historically) — the matched-sources number for cross-cycle claims.
  matchedSources2026: await sensitivity(),
  cycles,
};
writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(
  `wrote ${OUT}: cycles ${Object.keys(cycles).join(",")}, matched-sources ${out.matchedSources2026}`,
);
