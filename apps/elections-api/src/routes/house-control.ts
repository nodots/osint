import {
  METHODOLOGY_VERSION,
  type HouseControlSummary,
  type ThreatHistoryPoint,
} from "@elections-tracker/shared";
import { Router } from "express";
import { pool } from "../db/client.js";

export const houseControlRouter = Router();

// Latest-assessment risk thresholds; see subversionRelevance in
// @elections-tracker/shared — HIGH starts at 0.12.
const HIGH_RISK = 0.12;
const PIVOTAL = 0.1;

interface ControlRow {
  cycle: number | null;
  competitive: string; // count(*) comes back as string from pg
  assessed: string;
  high_risk: string;
  high_risk_pivotal: string;
  rated: string;
  dem_seats: string;
  rep_seats: string;
}

// GET /api/elections/house-control/history — the §35 threat time series: for
// each day the ledger recorded movement, the mean risk index over every
// race's latest assessment as of that day. Assessments are append-only, so
// this is reproducible history, not a recomputation.
houseControlRouter.get("/history", async (_req, res, next) => {
  try {
    const result = await pool.query<{
      d: string;
      overall: string;
      high_risk: string;
      high_risk_pivotal: string;
    }>(
      `WITH days AS (
         SELECT DISTINCT changed_at::date AS d FROM assessment_changes
       )
       SELECT days.d,
              round((avg(latest.subversion_risk) * 100)::numeric, 1) AS overall,
              count(*) FILTER (WHERE latest.subversion_risk >= $1) AS high_risk,
              count(*) FILTER (WHERE latest.subversion_risk >= $1
                               AND latest.pivotality >= $2) AS high_risk_pivotal
         FROM days
         JOIN LATERAL (
           SELECT DISTINCT ON (race_id) subversion_risk::float8, pivotality::float8
             FROM race_risk_assessments
            WHERE assessed_at::date <= days.d
            ORDER BY race_id, assessed_at DESC
         ) latest ON true
        GROUP BY days.d
        ORDER BY days.d`,
      [HIGH_RISK, PIVOTAL],
    );
    const points: ThreatHistoryPoint[] = result.rows.map((r) => ({
      date: r.d,
      overallIndex: Number(r.overall),
      highRiskRaces: Number(r.high_risk),
      highRiskPivotalRaces: Number(r.high_risk_pivotal),
    }));
    res.json(points);
  } catch (err) {
    next(err);
  }
});

// GET /api/elections/house-control — the primary dashboard card (spec §11).
// Baseline seat projection stays null until the forecast layer lands; the
// threat call is driven by high-risk races capable of changing control.
houseControlRouter.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query<ControlRow>(
      `SELECT max(e.cycle) AS cycle,
              count(*) FILTER (WHERE r.rating ILIKE '%toss%' OR r.rating ILIKE '%lean%'
                               OR r.rating ILIKE '%tilt%') AS competitive,
              count(a.subversion_risk) AS assessed,
              count(*) FILTER (WHERE a.subversion_risk >= $1) AS high_risk,
              count(*) FILTER (WHERE a.subversion_risk >= $1
                               AND a.pivotality >= $2) AS high_risk_pivotal,
              count(r.rating) AS rated,
              -- Baseline projection allocates every rated seat by the sign of
              -- the blended margin (toss-ups included); a dead-even margin
              -- falls back to the incumbent party.
              count(*) FILTER (WHERE r.projected_margin > 0
                               OR (r.projected_margin = 0 AND r.incumbent_party = 'D'))
                AS dem_seats,
              count(*) FILTER (WHERE r.projected_margin < 0
                               OR (r.projected_margin = 0 AND r.incumbent_party = 'R'))
                AS rep_seats
         FROM races r
         JOIN elections e ON e.id = r.election_id
         LEFT JOIN LATERAL (
           SELECT subversion_risk::float8, pivotality::float8
             FROM race_risk_assessments
            WHERE race_id = r.id
            ORDER BY assessed_at DESC
            LIMIT 1
         ) a ON true`,
      [HIGH_RISK, PIVOTAL],
    );
    const row = result.rows[0];
    const highRiskPivotal = row ? Number(row.high_risk_pivotal) : 0;
    // With no assessed races there is no basis for a threat call.
    const anyAssessments = row != null && Number(row.assessed) > 0;

    // A projection is only published once every seat is allocated — a partial
    // seat count reads as a real margin.
    const dem = row ? Number(row.dem_seats) : 0;
    const rep = row ? Number(row.rep_seats) : 0;
    const fullProjection = dem + rep === 435;

    const summary: HouseControlSummary = {
      cycle: row?.cycle ?? 2026,
      baselineProjection: fullProjection ? { dem, rep } : null,
      // Seats the projected majority holds beyond 217 — how many flips would
      // alter control (spec §11).
      seatsToFlipControl: fullProjection ? Math.max(dem, rep) - 217 : null,
      competitiveRaces: row ? Number(row.competitive) : 0,
      highRiskRaces: row ? Number(row.high_risk) : 0,
      highRiskPivotalRaces: highRiskPivotal,
      controlThreat: !anyAssessments
        ? "UNKNOWN"
        : highRiskPivotal >= 3
          ? "HIGH"
          : highRiskPivotal >= 1
            ? "MODERATE"
            : "LOW",
      confidence: "LOW",
      methodologyVersion: METHODOLOGY_VERSION,
    };
    res.json(summary);
  } catch (err) {
    next(err);
  }
});
