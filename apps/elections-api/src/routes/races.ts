import type { RaceStatus, RaceSummary } from "@elections-tracker/shared";
import { Router } from "express";
import { pool } from "../db/client.js";

export const racesRouter = Router();

// Latest assessment per race, joined onto the race + district row.
const RACE_SUMMARY_SQL = `
  SELECT r.id, r.district_id, d.display_name, d.state, r.incumbent_party,
         r.rating, r.rating_source, r.status,
         a.process_vulnerability, a.institutional_resistance, a.active_pressure,
         a.pivotality, a.subversion_risk, a.assessed_at
    FROM races r
    JOIN districts d ON d.id = r.district_id
    LEFT JOIN LATERAL (
      SELECT process_vulnerability, institutional_resistance, active_pressure,
             pivotality, subversion_risk, assessed_at
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
  institutional_resistance: string | null;
  active_pressure: string | null;
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
    institutionalResistance:
      r.institutional_resistance == null
        ? null
        : Number(r.institutional_resistance),
    activePressure:
      r.active_pressure == null ? null : Number(r.active_pressure),
    pivotality: r.pivotality == null ? null : Number(r.pivotality),
    interventionRelevance:
      r.subversion_risk == null ? null : Number(r.subversion_risk),
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
// ("TX-34"): summary, candidates, forecast snapshots, full assessment
// history, related events, and active litigation (spec §22).
racesRouter.get("/:districtId", async (req, res, next) => {
  try {
    const raceResult = await pool.query<
      RaceSummaryRow & {
        current_member: string | null;
        cook_pvi: string | null;
        democratic_candidate: string | null;
        republican_candidate: string | null;
        projected_margin: number | null;
        rating_updated_at: Date | null;
      }
    >(
      `${RACE_SUMMARY_SQL.replace(
        "SELECT ",
        `SELECT d.current_member, d.cook_pvi, r.democratic_candidate,
                r.republican_candidate, r.projected_margin, r.rating_updated_at, `,
      )} WHERE r.district_id = $1`,
      [req.params.districtId],
    );
    const race = raceResult.rows[0];
    if (!race) {
      res.status(404).json({ error: "race not found" });
      return;
    }
    const [forecastResult, historyResult, eventsResult, casesResult] =
      await Promise.all([
        pool.query(
          `SELECT source, snapshot_date, rating, margin
             FROM forecast_snapshots
            WHERE race_id = $1
            ORDER BY snapshot_date DESC, source`,
          [race.id],
        ),
        pool.query(
          `SELECT * FROM race_risk_assessments
            WHERE race_id = $1 ORDER BY assessed_at DESC`,
          [race.id],
        ),
        pool.query(
          `SELECT e.id, e.occurred_at, e.title, e.summary, e.event_types,
                  e.jurisdiction_type, e.jurisdictions, e.factual_status,
                  e.operational_status, e.confidence, e.affected_race_ids,
                  COALESCE(ev.url, e.raw_data->>'url') AS source_url,
                  ev.source_name
             FROM events e
             LEFT JOIN LATERAL (
               SELECT ev.url, s.name AS source_name
                 FROM evidence ev
                 LEFT JOIN sources s ON s.id = ev.source_id
                WHERE ev.event_id = e.id
                ORDER BY ev.primary_source DESC, ev.id
                LIMIT 1
             ) ev ON true
            WHERE $1 = ANY(e.affected_race_ids)
            ORDER BY e.occurred_at DESC`,
          [race.id],
        ),
        pool.query(
          `SELECT id, name, docket_number, court, jurisdiction, filed_at,
                  status, affected_mechanisms
             FROM cases
            WHERE $1 = ANY(affected_race_ids)
            ORDER BY filed_at DESC NULLS LAST`,
          [race.id],
        ),
      ]);
    res.json({
      race: toSummary(race),
      currentMember: race.current_member,
      cookPvi: race.cook_pvi,
      democraticCandidate: race.democratic_candidate,
      republicanCandidate: race.republican_candidate,
      projectedMargin: race.projected_margin,
      ratingUpdatedAt: race.rating_updated_at?.toISOString() ?? null,
      forecasts: forecastResult.rows.map((f) => ({
        source: f.source,
        snapshotDate: f.snapshot_date,
        rating: f.rating,
        margin: f.margin,
      })),
      assessments: historyResult.rows.map((a) => ({
        id: a.id,
        assessedAt: a.assessed_at.toISOString(),
        competitiveness: Number(a.competitiveness),
        pivotality: Number(a.pivotality),
        federalLeverage: Number(a.federal_leverage),
        stateCooperation: Number(a.state_cooperation),
        administrativeExposure: Number(a.administrative_exposure),
        voterRollExposure: Number(a.voter_roll_exposure),
        ballotExposure: Number(a.ballot_exposure),
        litigationExposure: Number(a.litigation_exposure),
        certificationExposure: Number(a.certification_exposure),
        recountExposure: Number(a.recount_exposure),
        congressionalContestExposure: Number(a.congressional_contest_exposure),
        processVulnerability: Number(a.process_vulnerability),
        institutionalResistance:
          a.institutional_resistance == null
            ? null
            : Number(a.institutional_resistance),
        activePressure:
          a.active_pressure == null ? null : Number(a.active_pressure),
        interventionRelevance: Number(a.subversion_risk),
        confidence: Number(a.confidence),
        explanations: a.explanations,
        triggeringEventIds: a.triggering_event_ids,
        methodologyVersion: a.methodology_version,
      })),
      events: eventsResult.rows.map((e) => ({
        id: e.id,
        occurredAt: e.occurred_at.toISOString(),
        title: e.title,
        summary: e.summary,
        eventTypes: e.event_types,
        jurisdictionType: e.jurisdiction_type,
        jurisdictions: e.jurisdictions,
        factualStatus: e.factual_status,
        operationalStatus: e.operational_status,
        confidence: Number(e.confidence),
        affectedRaceIds: e.affected_race_ids,
        sourceName: e.source_name,
        sourceUrl: e.source_url,
      })),
      cases: casesResult.rows.map((c) => ({
        id: c.id,
        name: c.name,
        docketNumber: c.docket_number,
        court: c.court,
        jurisdiction: c.jurisdiction,
        filedAt: c.filed_at,
        status: c.status,
        affectedMechanisms: c.affected_mechanisms,
      })),
    });
  } catch (err) {
    next(err);
  }
});
