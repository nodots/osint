import {
  EVENT_TYPES,
  METHODOLOGY_VERSION,
  processVulnerability,
  multiplicativeRisk,
} from "@elections-tracker/shared";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { pool } from "../db/client.js";

export const adminRouter = Router();

// Analyst write surface. Unlike the ukraine tracker (which relies on an
// external access layer), admin routes here require a bearer token; with no
// ADMIN_TOKEN configured the whole surface is disabled rather than open.
const requireAdmin: RequestHandler = (req, res, next) => {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    res.status(503).json({ error: "admin surface disabled (no ADMIN_TOKEN configured)" });
    return;
  }
  if (req.headers.authorization !== `Bearer ${token}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
};

adminRouter.use(requireAdmin);

const eventBody = z.object({
  occurredAt: z.iso.datetime({ offset: true }),
  jurisdictionType: z.enum(["FEDERAL", "STATE", "COUNTY", "DISTRICT"]),
  jurisdictions: z.array(z.string()).default([]),
  eventTypes: z.array(z.enum(EVENT_TYPES)).min(1),
  actorIds: z.array(z.number().int().positive()).default([]),
  targetIds: z.array(z.number().int().positive()).default([]),
  title: z.string().min(1),
  summary: z.string().min(1),
  factualStatus: z.enum(["CONFIRMED", "REPORTED", "ALLEGED", "DISPUTED", "RETRACTED"]),
  operationalStatus: z.enum([
    "PROPOSED",
    "ACTIVE",
    "BLOCKED",
    "ENJOINED",
    "OVERTURNED",
    "SUPERSEDED",
    "EXPIRED",
  ]),
  confidence: z.number().min(0).max(1).default(0.5),
  affectedRaceIds: z.array(z.number().int().positive()).default([]),
  affectedMechanisms: z.array(z.string()).default([]),
  enteredBy: z.string().min(1),
});

// POST /api/elections/admin/events — manual analyst entry (spec §18 level 1).
adminRouter.post("/events", async (req, res, next) => {
  try {
    const parsed = eventBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const e = parsed.data;
    const result = await pool.query(
      `INSERT INTO events
         (occurred_at, jurisdiction_type, jurisdictions, event_types,
          actor_ids, target_ids, title, summary, factual_status,
          operational_status, confidence, affected_race_ids,
          affected_mechanisms, entered_by, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
       RETURNING id`,
      [
        e.occurredAt,
        e.jurisdictionType,
        e.jurisdictions,
        e.eventTypes,
        e.actorIds,
        e.targetIds,
        e.title,
        e.summary,
        e.factualStatus,
        e.operationalStatus,
        e.confidence,
        e.affectedRaceIds,
        e.affectedMechanisms,
        e.enteredBy,
      ],
    );
    res.status(201).json({ id: result.rows[0]?.id });
  } catch (err) {
    next(err);
  }
});

const dimension = z.number().min(0).max(1);

const assessmentBody = z.object({
  raceId: z.number().int().positive(),
  competitiveness: dimension,
  pivotality: dimension,
  federalLeverage: dimension,
  stateCooperation: dimension,
  administrativeExposure: dimension,
  voterRollExposure: dimension,
  ballotExposure: dimension,
  litigationExposure: dimension,
  certificationExposure: dimension,
  recountExposure: dimension,
  congressionalContestExposure: dimension,
  confidence: dimension.default(0.5),
  explanations: z.array(z.string()).default([]),
  triggeringEventIds: z.array(z.number().int().positive()).default([]),
});

// POST /api/elections/admin/assessments — analyst supplies the dimensions;
// vulnerability and subversion risk are computed here, deterministically, under
// the current methodology version. Assessments are append-only (spec §12).
adminRouter.post("/assessments", async (req, res, next) => {
  try {
    const parsed = assessmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const a = parsed.data;
    const vulnerability = processVulnerability(a);
    const risk = multiplicativeRisk(vulnerability, a.competitiveness, a.pivotality);
    const result = await pool.query(
      `INSERT INTO race_risk_assessments
         (race_id, competitiveness, pivotality, federal_leverage,
          state_cooperation, administrative_exposure, voter_roll_exposure,
          ballot_exposure, litigation_exposure, certification_exposure,
          recount_exposure, congressional_contest_exposure,
          process_vulnerability, subversion_risk, confidence, explanations,
          triggering_event_ids, methodology_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id, process_vulnerability, subversion_risk`,
      [
        a.raceId,
        a.competitiveness,
        a.pivotality,
        a.federalLeverage,
        a.stateCooperation,
        a.administrativeExposure,
        a.voterRollExposure,
        a.ballotExposure,
        a.litigationExposure,
        a.certificationExposure,
        a.recountExposure,
        a.congressionalContestExposure,
        vulnerability,
        risk,
        a.confidence,
        JSON.stringify(a.explanations),
        a.triggeringEventIds,
        METHODOLOGY_VERSION,
      ],
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});
