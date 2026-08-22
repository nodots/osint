import { Router } from "express";
import { pool } from "../db/client.js";

export const districtsRouter = Router();

// GET /api/elections/districts/geojson — all district boundaries as one
// FeatureCollection, joined with the 2026 race so the map can color by rating
// without a second fetch. Geometries are simplified server-side
// (ST_SimplifyPreserveTopology 0.005° ≈ 500m, 4-decimal coordinates), which
// takes the payload from 13MB raw to ~1.6MB — national-choropleth resolution.
districtsRouter.get("/geojson", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', jsonb_agg(feature ORDER BY id)
              ) AS fc
         FROM (
           SELECT d.id,
                  jsonb_build_object(
                    'type', 'Feature',
                    'geometry', ST_AsGeoJSON(
                      ST_SimplifyPreserveTopology(d.geom::geometry, 0.005), 4
                    )::jsonb,
                    'properties', jsonb_build_object(
                      'id', d.id,
                      'displayName', d.display_name,
                      'state', d.state,
                      'districtNumber', d.district_number,
                      'currentMember', d.current_member,
                      'incumbentParty', d.incumbent_party,
                      'raceId', r.id,
                      'rating', r.rating,
                      'projectedMargin', r.projected_margin,
                      'democraticCandidate', r.democratic_candidate,
                      'republicanCandidate', r.republican_candidate
                    )
                  ) AS feature
             FROM districts d
             LEFT JOIN races r
               ON r.district_id = d.id
              AND r.election_id = (
                    SELECT id FROM elections
                     WHERE election_type = 'HOUSE' AND cycle = 2026
                     LIMIT 1
                  )
            WHERE d.geom IS NOT NULL
         ) features`,
    );
    // Boundaries change on re-import, not on analyst publish — allow an hour
    // of browser caching despite the API-wide no-store.
    res.set("Cache-Control", "public, max-age=3600");
    res.json(result.rows[0].fc);
  } catch (err) {
    next(err);
  }
});

// GET /api/elections/districts — all districts for the active cycle (metadata
// only; boundaries come from /districts/geojson).
districtsRouter.get("/", async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, state, district_number, display_name, cycle,
              current_member, incumbent_party, cook_pvi
         FROM districts
        ORDER BY state, district_number`,
    );
    res.json(
      result.rows.map((r) => ({
        id: r.id,
        state: r.state,
        districtNumber: r.district_number,
        displayName: r.display_name,
        cycle: r.cycle,
        currentMember: r.current_member,
        incumbentParty: r.incumbent_party,
        cookPvi: r.cook_pvi,
      })),
    );
  } catch (err) {
    next(err);
  }
});
