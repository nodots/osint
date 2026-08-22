import pg from "pg";

// Cross-cycle §43 comparison: aligned high-risk-pivotal series and source
// volumes for the historical baselines vs the live cycle. Read
// docs/elections/backtest-2022-2024.md for interpretation and caveats.
const DATE_OID = 1082;
pg.types.setTypeParser(DATE_OID, (v) => v);

const HIGH_RISK = 0.12;
const PIVOTAL = 0.1;
const CONFIGS = [
  { label: "2016", db: "elections_baseline_2016", electionDay: "2016-11-08" },
  { label: "2018", db: "elections_baseline_2018", electionDay: "2018-11-06" },
  { label: "2020", db: "elections_baseline_2020", electionDay: "2020-11-03" },
  { label: "2022", db: "elections_baseline_2022", electionDay: "2022-11-08" },
  { label: "2024", db: "elections_baseline_2024", electionDay: "2024-11-05" },
  { label: "2026", db: "elections_tracker", electionDay: "2026-11-03" },
  { label: "2026-matched", db: "elections_sens_2026", electionDay: "2026-11-03" },
];

for (const cfg of CONFIGS) {
  const pool = new pg.Pool({
    connectionString: `postgresql://osint:osint@127.0.0.1:6432/${cfg.db}`,
  });
  const series = await pool.query(
    `WITH days AS (SELECT DISTINCT assessed_at::date AS d FROM race_risk_assessments)
     SELECT days.d,
            count(*) FILTER (WHERE latest.subversion_risk >= $1 AND latest.pivotality >= $2) AS hrp,
            round((avg(latest.subversion_risk)*100)::numeric, 1) AS mean_idx
       FROM days
       JOIN LATERAL (
         SELECT DISTINCT ON (race_id) subversion_risk::float8, pivotality::float8
           FROM race_risk_assessments WHERE assessed_at::date <= days.d
          ORDER BY race_id, assessed_at DESC) latest ON true
      GROUP BY days.d ORDER BY days.d`,
    [HIGH_RISK, PIVOTAL],
  );
  const sources = await pool.query(
    `SELECT raw_data->>'source' AS s, count(*) FILTER (WHERE material) AS material, count(*) AS total
       FROM events GROUP BY 1 ORDER BY 2 DESC`,
  );
  const blocks = await pool.query(
    `SELECT count(*) FILTER (WHERE 'INJUNCTION' = ANY(event_types)) AS blocks,
            count(*) FILTER (WHERE jurisdiction_type='FEDERAL' AND material) AS federal
       FROM events`,
  );
  const eday = new Date(`${cfg.electionDay}T00:00:00Z`).getTime();
  const rows = series.rows.map((r) => ({
    dte: Math.round((eday - new Date(`${r.d}T00:00:00Z`).getTime()) / 86400000),
    hrp: Number(r.hrp),
    mean: Number(r.mean_idx),
  }));
  console.log(`== ${cfg.label} (election ${cfg.electionDay})`);
  console.log(
    "  days-to-election range:", rows[0]?.dte, "→", rows[rows.length - 1]?.dte,
    "| high-risk-pivotal min/max/final:",
    Math.min(...rows.map((r) => r.hrp)), "/",
    Math.max(...rows.map((r) => r.hrp)), "/",
    rows[rows.length - 1]?.hrp,
    "| mean idx final:", rows[rows.length - 1]?.mean,
  );
  console.log("  events:", sources.rows.map((s) => `${s.s}:${s.material}`).join(" "),
    "| blocking injunctions:", blocks.rows[0].blocks,
    "| material federal events:", blocks.rows[0].federal);
  console.log("  SERIES " + cfg.label + " " + JSON.stringify(rows));
  await pool.end();
}
