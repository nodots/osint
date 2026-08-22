import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/client.js";

export const changesRouter = Router();

const listQuery = z.object({
  since: z.iso.datetime({ offset: true }).optional(),
  // Minimum |delta_risk| to include; 0 returns every ledger row.
  minDelta: z.coerce.number().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(2000).default(500),
});

// GET /api/elections/changes — the change ledger (methodology doc §23/§38):
// per-race assessment deltas with the events that drove them, newest first.
// Feeds the "What changed" page and the email digest.
changesRouter.get("/", async (req, res, next) => {
  try {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { since, minDelta, limit } = parsed.data;
    const params: unknown[] = [minDelta];
    let sinceClause = "";
    if (since) {
      params.push(since);
      sinceClause = `AND c.changed_at >= $${params.length}`;
    }
    params.push(limit);

    const result = await pool.query(
      `SELECT c.changed_at, c.delta_risk, c.delta_vulnerability,
              c.delta_resistance, c.delta_pressure, c.delta_competitiveness,
              c.delta_pivotality, c.dimension_deltas, c.previous_assessment_id,
              r.district_id, d.display_name, d.state,
              a.subversion_risk, a.methodology_version,
              COALESCE(ev.events, '[]'::json) AS new_events
         FROM assessment_changes c
         JOIN races r ON r.id = c.race_id
         JOIN districts d ON d.id = r.district_id
         JOIN race_risk_assessments a ON a.id = c.assessment_id
         LEFT JOIN LATERAL (
           SELECT json_agg(json_build_object(
                    'id', e.id, 'title', e.title,
                    'occurredAt', e.occurred_at,
                    'sourceUrl', COALESCE(evd.url, e.raw_data->>'url'))
                  ORDER BY e.occurred_at DESC) AS events
             FROM events e
             LEFT JOIN LATERAL (
               SELECT url FROM evidence
                WHERE event_id = e.id
                ORDER BY primary_source DESC, id
                LIMIT 1
             ) evd ON true
            WHERE e.id = ANY(c.new_event_ids)
         ) ev ON true
        WHERE abs(c.delta_risk) >= $1 ${sinceClause}
        ORDER BY c.changed_at DESC, abs(c.delta_risk) DESC
        LIMIT $${params.length}`,
      params,
    );
    res.json(
      result.rows.map((c) => ({
        changedAt: c.changed_at.toISOString(),
        districtId: c.district_id,
        displayName: c.display_name,
        state: c.state,
        currentRisk: Number(c.subversion_risk),
        firstAssessment: c.previous_assessment_id == null,
        deltaRisk: c.delta_risk,
        deltaVulnerability: c.delta_vulnerability,
        deltaResistance: c.delta_resistance,
        deltaPressure: c.delta_pressure,
        deltaCompetitiveness: c.delta_competitiveness,
        deltaPivotality: c.delta_pivotality,
        dimensionDeltas: c.dimension_deltas,
        methodologyVersion: c.methodology_version,
        newEvents: c.new_events,
      })),
    );
  } catch (err) {
    next(err);
  }
});
