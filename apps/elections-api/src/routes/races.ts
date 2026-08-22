import type { RaceStatus, RaceSummary } from "@elections-tracker/shared";
import { Router } from "express";
import { pool } from "../db/client.js";

export const racesRouter = Router();

// Latest assessment per race, joined onto the race + district row.
const RACE_SUMMARY_SQL = `
  SELECT r.id, r.district_id, d.display_name, d.state, r.incumbent_party,
         r.rating, r.rating_source, r.status,
         a.process_vulnerability, a.pivotality, a.subversion_risk, a.assessed_at
    FROM races r
    JOIN districts d ON d.id = r.district_id
    LEFT JOIN LATERAL (
      SELECT process_vulnerability, pivotality, subversion_risk, assessed_at
        FROM race_risk_assessments
       WHERE race_id = r.id
       ORDER BY assessed_at DESC
       LIMIT 1
    ) a ON true
`;

interface RaceSummaryRow {
  id: number;
  district_id: string;
  display_name: string;
  state: string;
  incumbent_party: string | null;
  rating: string | null;
  rating_source: string | null;
  status: RaceStatus;
  process_vulnerability: string | null; // numeric comes back as string from pg
  pivotality: string | null;
  subversion_risk: string | null;
  assessed_at: Date | null;
}

function toSummary(r: RaceSummaryRow): RaceSummary {
  return {
    id: r.id,
    districtId: r.district_id,
    displayName: r.display_name,
    state: r.state,
    incumbentParty: r.incumbent_party,
    rating: r.rating,
    ratingSource: r.rating_source,
    status: r.status,
    processVulnerability:
      r.process_vulnerability == null ? null : Number(r.process_vulnerability),
    pivotality: r.pivotality == null ? null : Number(r.pivotality),
    subversionRisk: r.subversion_risk == null ? null : Number(r.subversion_risk),
    assessedAt: r.assessed_at?.toISOString() ?? null,
  };
}

// GET /api/elections/races — every tracked race with its latest assessment,
// riskiest first.
racesRouter.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query<RaceSummaryRow>(
      `${RACE_SUMMARY_SQL} ORDER BY a.subversion_risk DESC NULLS LAST, d.state, d.district_number`,
    );
    res.json(result.rows.map(toSummary));
  } catch (err) {
    next(err);
  }
});

// GET /api/elections/races/:districtId — race intelligence for one district
// ("TX-34"): summary, full assessment history, and related events.
racesRouter.get("/:districtId", async (req, res, next) => {
  try {
    const raceResult = await pool.query<RaceSummaryRow>(
      `${RACE_SUMMARY_SQL} WHERE r.district_id = $1`,
      [req.params.districtId],
    );
    const race = raceResult.rows[0];
    if (!race) {
      res.status(404).json({ error: "race not found" });
      return;
    }
    const [historyResult, eventsResult] = await Promise.all([
      pool.query(
        `SELECT * FROM race_risk_assessments
          WHERE race_id = $1 ORDER BY assessed_at DESC`,
        [race.id],
      ),
      pool.query(
        `SELECT id, occurred_at, title, summary, event_types,
                jurisdiction_type, jurisdictions, factual_status,
                operational_status, confidence, affected_race_ids
           FROM events
          WHERE $1 = ANY(affected_race_ids)
          ORDER BY occurred_at DESC`,
        [race.id],
      ),
    ]);
    res.json({
      race: toSummary(race),
      assessments: historyResult.rows,
      events: eventsResult.rows,
    });
  } catch (err) {
    next(err);
  }
});
