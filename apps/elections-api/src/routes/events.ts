import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/client.js";

export const eventsRouter = Router();

const listQuery = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  state: z.string().length(2).optional(),
  raceId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

// GET /api/elections/events — material events, newest first.
eventsRouter.get("/", async (req, res, next) => {
  try {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { from, to, state, raceId, limit } = parsed.data;

    const where: string[] = [];
    const params: unknown[] = [];
    if (from) {
      params.push(from);
      where.push(`occurred_at >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      where.push(`occurred_at <= $${params.length}`);
    }
    if (state) {
      params.push(state);
      where.push(`$${params.length} = ANY(jurisdictions)`);
    }
    if (raceId) {
      params.push(raceId);
      where.push(`$${params.length} = ANY(affected_race_ids)`);
    }
    params.push(limit);

    const result = await pool.query(
      `SELECT id, occurred_at, discovered_at, title, summary, event_types,
              jurisdiction_type, jurisdictions, factual_status,
              operational_status, confidence, affected_race_ids
         FROM events
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY occurred_at DESC
        LIMIT $${params.length}`,
      params,
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/elections/events/:id — one event with its evidence chain.
eventsRouter.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "invalid event id" });
      return;
    }
    const eventResult = await pool.query(
      `SELECT * FROM events WHERE id = $1`,
      [id],
    );
    const event = eventResult.rows[0];
    if (!event) {
      res.status(404).json({ error: "event not found" });
      return;
    }
    const evidenceResult = await pool.query(
      `SELECT e.*, s.name AS source_name, s.source_type
         FROM evidence e
         JOIN sources s ON s.id = e.source_id
        WHERE e.event_id = $1
        ORDER BY e.primary_source DESC, e.published_at`,
      [id],
    );
    res.json({ event, evidence: evidenceResult.rows });
  } catch (err) {
    next(err);
  }
});
