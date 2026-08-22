import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { geographyMultiPolygon } from "./types.js";

// Domain model per docs/specs/election-subversion.md. Facts (events + evidence),
// claims (factual status), and assessments (risk rows) are separate objects and
// stay independently inspectable.

// Registered information sources (spec §7). Discovery sources (advocacy feeds)
// and canonical evidence (court filings) are both registered here; the
// hierarchy preference lives in the methodology, not the table.
export const sources = pgTable("sources", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  organization: text("organization"),
  url: text("url"),
  sourceType: text("source_type").notNull(),
  reliabilityBaseline: numeric("reliability_baseline"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// Institutional actors (spec §15): agencies, courts, officials, parties.
export const actors = pgTable("actors", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorType: text("actor_type").notNull(),
  name: text("name").notNull(),
  jurisdiction: text("jurisdiction"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// Congressional districts, keyed by display code ("TX-34") and versioned by
// cycle so a mid-decade re-map coexists with the old boundaries.
export const districts = pgTable(
  "districts",
  {
    id: text("id").primaryKey(), // "TX-34"
    state: text("state").notNull(), // "TX"
    districtNumber: integer("district_number").notNull(),
    displayName: text("display_name").notNull(),
    cycle: integer("cycle").notNull(),
    geom: geographyMultiPolygon("geom"),
    currentMember: text("current_member"),
    incumbentParty: text("incumbent_party"),
    cookPvi: text("cook_pvi"),
    population: integer("population"),
  },
  (table) => [
    index("idx_districts_geom").using("gist", table.geom),
    index("idx_districts_state").on(table.state),
  ],
);

// Electoral events (spec §4). MVP is House-only but the type is not baked in.
export const elections = pgTable("elections", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  electionType: text("election_type").notNull(), // ElectionType
  cycle: integer("cycle").notNull(),
  electionDate: date("election_date").notNull(),
  status: text("status").notNull().default("UPCOMING"),
});

// A contest within an election/district (spec §4).
export const races = pgTable(
  "races",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    electionId: integer("election_id")
      .notNull()
      .references(() => elections.id),
    districtId: text("district_id")
      .notNull()
      .references(() => districts.id),
    democraticCandidate: text("democratic_candidate"),
    republicanCandidate: text("republican_candidate"),
    incumbentParty: text("incumbent_party"),
    rating: text("rating"),
    ratingSource: text("rating_source"),
    ratingUpdatedAt: timestamp("rating_updated_at", { withTimezone: true }),
    projectedMargin: doublePrecision("projected_margin"),
    pollingMargin: doublePrecision("polling_margin"),
    actualMargin: doublePrecision("actual_margin"),
    status: text("status").notNull().default("GENERAL"), // RaceStatus
  },
  (table) => [
    unique("races_election_district").on(table.electionId, table.districtId),
    index("idx_races_district").on(table.districtId),
  ],
);

// The central intelligence object (spec §5). occurred/discovered are distinct
// on purpose: risk history is explained by when we learned things, not only by
// when they happened. Array columns (jurisdictions, actor/race ids, mechanism
// tags) are deliberate MVP denormalization; promote to junction tables when a
// query actually needs the join.
export const events = pgTable(
  "events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    jurisdictionType: text("jurisdiction_type").notNull(), // JurisdictionType
    jurisdictions: text("jurisdictions").array().notNull().default([]),
    eventTypes: text("event_types").array().notNull().default([]), // EventType[]
    actorIds: integer("actor_ids").array().notNull().default([]),
    targetIds: integer("target_ids").array().notNull().default([]),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    factualStatus: text("factual_status").notNull(), // FactualStatus
    operationalStatus: text("operational_status").notNull(), // OperationalStatus
    confidence: numeric("confidence").notNull().default("0.5"),
    affectedRaceIds: integer("affected_race_ids").array().notNull().default([]),
    affectedMechanisms: text("affected_mechanisms").array().notNull().default([]),
    // Causal lifecycle (methodology doc §25): filed → dismissed → appealed is
    // one chain, not unrelated events.
    parentEventId: integer("parent_event_id"),
    supersedesEventId: integer("supersedes_event_id"),
    relatedCaseId: integer("related_case_id"),
    // Materiality gate (§24): immaterial events are stored intelligence but
    // never move risk signals.
    material: boolean("material").notNull().default(true),
    rawData: jsonb("raw_data"),
    // Editorial trail (spec §32): no silent edits.
    enteredBy: text("entered_by"),
    reviewedBy: text("reviewed_by"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastModifiedBy: text("last_modified_by"),
  },
  (table) => [
    index("idx_events_occurred").on(table.occurredAt),
    check(
      "events_confidence_range",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 1`,
    ),
  ],
);

// Individual evidence items backing an event (spec §7).
export const evidence = pgTable(
  "evidence",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: integer("source_id")
      .notNull()
      .references(() => sources.id),
    eventId: integer("event_id")
      .notNull()
      .references(() => events.id),
    url: text("url"),
    title: text("title"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    excerpt: text("excerpt"),
    archiveUrl: text("archive_url"),
    documentHash: text("document_hash"),
    primarySource: boolean("primary_source").notNull().default(false),
    analystNotes: text("analyst_notes"),
  },
  (table) => [index("idx_evidence_event").on(table.eventId)],
);

// Litigation gets first-class treatment (spec §16).
export const cases = pgTable("cases", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  name: text("name").notNull(),
  docketNumber: text("docket_number"),
  court: text("court"),
  jurisdiction: text("jurisdiction"),
  filedAt: date("filed_at"),
  status: text("status").notNull().default("ACTIVE"),
  plaintiffs: text("plaintiffs").array().notNull().default([]),
  defendants: text("defendants").array().notNull().default([]),
  affectedMechanisms: text("affected_mechanisms").array().notNull().default([]),
  affectedStates: text("affected_states").array().notNull().default([]),
  affectedRaceIds: integer("affected_race_ids").array().notNull().default([]),
});

export const courtActions = pgTable(
  "court_actions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    caseId: integer("case_id")
      .notNull()
      .references(() => cases.id),
    date: date("date").notNull(),
    actionType: text("action_type").notNull(), // CourtActionType
    outcome: text("outcome"),
    sourceId: integer("source_id").references(() => sources.id),
  },
  (table) => [index("idx_court_actions_case").on(table.caseId)],
);

// Point-in-time risk assessment per race (spec §8). Append-only: a new row per
// assessment gives the auditable risk history (spec §12). All dimensions and
// derived scores are normalized to [0,1] and computed by
// @elections-tracker/shared risk.ts under methodology_version.
export const raceRiskAssessments = pgTable(
  "race_risk_assessments",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    raceId: integer("race_id")
      .notNull()
      .references(() => races.id),
    assessedAt: timestamp("assessed_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    competitiveness: numeric("competitiveness").notNull(),
    pivotality: numeric("pivotality").notNull(),
    federalLeverage: numeric("federal_leverage").notNull(),
    stateCooperation: numeric("state_cooperation").notNull(),
    administrativeExposure: numeric("administrative_exposure").notNull(),
    voterRollExposure: numeric("voter_roll_exposure").notNull(),
    ballotExposure: numeric("ballot_exposure").notNull(),
    litigationExposure: numeric("litigation_exposure").notNull(),
    certificationExposure: numeric("certification_exposure").notNull(),
    recountExposure: numeric("recount_exposure").notNull(),
    congressionalContestExposure: numeric(
      "congressional_contest_exposure",
    ).notNull(),
    processVulnerability: numeric("process_vulnerability").notNull(),
    // 2026.09.1 components (nullable so pre-2026.09 rows stay reproducible):
    // resistance suppresses vulnerability, active pressure scales relevance.
    institutionalResistance: numeric("institutional_resistance"),
    activePressure: numeric("active_pressure"),
    subversionRisk: numeric("subversion_risk").notNull(),
    confidence: numeric("confidence").notNull().default("0.5"),
    explanations: jsonb("explanations"),
    triggeringEventIds: integer("triggering_event_ids")
      .array()
      .notNull()
      .default([]),
    methodologyVersion: text("methodology_version").notNull(),
  },
  (table) => [
    index("idx_assessments_race_time").on(table.raceId, table.assessedAt),
  ],
);

// Statewide conditions that propagate into district assessments (spec §14).
export const stateProfiles = pgTable("state_profiles", {
  state: text("state").primaryKey(), // "TX"
  administrationControl: text("administration_control"),
  processVulnerability: numeric("process_vulnerability"),
  dimensions: jsonb("dimensions"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// Forecast inputs preserved per-source — disagreement is kept, not averaged
// away (spec §17).
export const forecastSnapshots = pgTable(
  "forecast_snapshots",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    raceId: integer("race_id")
      .notNull()
      .references(() => races.id),
    source: text("source").notNull(), // "cook" | "sabato" | "inside" | "polling"
    snapshotDate: date("snapshot_date").notNull(),
    rating: text("rating"),
    margin: doublePrecision("margin"),
  },
  (table) => [
    unique("forecast_race_source_date").on(
      table.raceId,
      table.source,
      table.snapshotDate,
    ),
  ],
);

// Ingestion audit log — same shape as the ukraine tracker's, for the
// feed-assisted discovery workers to come.
export const ingestionRuns = pgTable("ingestion_runs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  source: text("source").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  message: text("message"),
  recordsSeen: integer("records_seen").notNull().default(0),
  recordsInserted: integer("records_inserted").notNull().default(0),
  recordsSkipped: integer("records_skipped").notNull().default(0),
});
