import { Router } from "express";
import { pool } from "../db/client.js";

export const districtsRouter = Router();

// GET /api/elections/districts — all districts for the active cycle (metadata
// only; boundary GeoJSON will get its own endpoint with the map).
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
