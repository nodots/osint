import type {
  EventType,
  FactualStatus,
  JurisdictionType,
  OperationalStatus,
} from "@elections-tracker/shared";
import { pool } from "../db.js";

// Insert helpers shared by every source. Events carry a
// raw_data {source, externalId, ...} envelope; (source, externalId) is the
// dedupe key, checked worker-side against one indexed-scan query per run.

export interface SourceEvent {
  source: string;
  externalId: string;
  occurredAt: string; // ISO
  jurisdictionType: JurisdictionType;
  jurisdictions: string[];
  eventTypes: EventType[];
  title: string;
  summary: string;
  factualStatus: FactualStatus;
  operationalStatus: OperationalStatus;
  confidence: number;
  // Materiality gate (§24): immaterial events are stored but never move risk.
  material: boolean;
  relatedCaseId?: number;
  // Point-in-time lifecycle (§43): when the event left force (docket
  // terminated, rule superseded) and the status it held while in force, so a
  // historical replay can resolve status as of the replay day.
  expiredAt?: string | null; // ISO date
  inForceStatus?: OperationalStatus;
  rawData: Record<string, unknown>;
}

// Source registry rows (spec §7): every worker source is registered once and
// each ingested event gets an evidence row pointing back to the fetched
// document, completing the score → event → evidence → source chain.
const SOURCE_REGISTRY: Record<
  string,
  { name: string; organization: string; url: string; sourceType: string }
> = {
  federal_register: {
    name: "Federal Register",
    organization: "Office of the Federal Register / GPO",
    url: "https://www.federalregister.gov",
    sourceType: "PRIMARY_GOVERNMENT",
  },
  courtlistener: {
    name: "CourtListener RECAP dockets",
    organization: "Free Law Project",
    url: "https://www.courtlistener.com",
    sourceType: "COURT_DOCUMENT",
  },
  courtlistener_rulings: {
    name: "CourtListener RECAP docket entries",
    organization: "Free Law Project",
    url: "https://www.courtlistener.com",
    sourceType: "COURT_DOCUMENT",
  },
};

const sourceIdCache = new Map<string, number>();

async function ensureSourceId(source: string): Promise<number | null> {
  const cached = sourceIdCache.get(source);
  if (cached !== undefined) return cached;
  const meta = SOURCE_REGISTRY[source];
  if (!meta) return null;
  const existing = await pool.query(
    `SELECT id FROM sources WHERE name = $1`,
    [meta.name],
  );
  let id: number;
  if (existing.rows.length > 0) {
    id = existing.rows[0].id;
  } else {
    const inserted = await pool.query(
      `INSERT INTO sources (name, organization, url, source_type, reliability_baseline)
       VALUES ($1, $2, $3, $4, 0.9) RETURNING id`,
      [meta.name, meta.organization, meta.url, meta.sourceType],
    );
    id = inserted.rows[0].id;
  }
  sourceIdCache.set(source, id);
  return id;
}

export async function existingExternalIds(source: string): Promise<Set<string>> {
  const { rows } = await pool.query(
    `SELECT raw_data->>'externalId' AS ext FROM events WHERE raw_data->>'source' = $1`,
    [source],
  );
  return new Set(rows.map((r) => r.ext as string));
}

export async function insertEvents(
  events: SourceEvent[],
): Promise<{ seen: number; inserted: number; skipped: number }> {
  if (events.length === 0) return { seen: 0, inserted: 0, skipped: 0 };
  const known = await existingExternalIds(events[0]!.source);
  const sourceId = await ensureSourceId(events[0]!.source);
  let inserted = 0;
  for (const event of events) {
    if (known.has(event.externalId)) continue;
    known.add(event.externalId);
    const insertedEvent = await pool.query(
      `INSERT INTO events (occurred_at, jurisdiction_type, jurisdictions,
                           event_types, title, summary, factual_status,
                           operational_status, confidence, material,
                           related_case_id, expired_at, in_force_status,
                           raw_data, entered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        event.occurredAt,
        event.jurisdictionType,
        event.jurisdictions,
        event.eventTypes,
        event.title,
        event.summary,
        event.factualStatus,
        event.operationalStatus,
        event.confidence,
        event.material,
        event.relatedCaseId ?? null,
        event.expiredAt ?? null,
        event.inForceStatus ?? null,
        JSON.stringify({
          source: event.source,
          externalId: event.externalId,
          ...event.rawData,
        }),
        `worker:${event.source}`,
      ],
    );
    if (sourceId !== null && typeof event.rawData.url === "string") {
      await pool.query(
        `INSERT INTO evidence (source_id, event_id, url, title, primary_source)
         VALUES ($1, $2, $3, $4, true)`,
        [sourceId, insertedEvent.rows[0].id, event.rawData.url, event.title],
      );
    }
    inserted++;
  }
  return {
    seen: events.length,
    inserted,
    skipped: events.length - inserted,
  };
}

export interface SourceCase {
  name: string;
  docketNumber: string;
  court: string;
  jurisdiction: string | null;
  filedAt: string | null; // "YYYY-MM-DD"
  terminated: boolean;
  terminatedAt: string | null; // "YYYY-MM-DD" when the source reports one
  affectedStates: string[];
}

// Upsert litigation on (docket_number, court) — there's no DB constraint, so
// the match is an explicit update-then-insert. Returns each case's row id
// keyed by "docketNumber|court" so events can link via related_case_id.
export async function upsertCases(
  cases: SourceCase[],
): Promise<{
  seen: number;
  inserted: number;
  skipped: number;
  ids: Map<string, number>;
}> {
  let inserted = 0;
  const ids = new Map<string, number>();
  for (const c of cases) {
    const status = c.terminated ? "CLOSED" : "ACTIVE";
    const updated = await pool.query(
      `UPDATE cases SET status = $3, name = $4, terminated_at = $5
        WHERE docket_number = $1 AND court = $2
        RETURNING id`,
      [c.docketNumber, c.court, status, c.name, c.terminatedAt],
    );
    let id: number;
    if (updated.rowCount === 0) {
      const insertedRow = await pool.query(
        `INSERT INTO cases (name, docket_number, court, jurisdiction, filed_at,
                            status, terminated_at, affected_states)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          c.name,
          c.docketNumber,
          c.court,
          c.jurisdiction,
          c.filedAt,
          status,
          c.terminatedAt,
          c.affectedStates,
        ],
      );
      id = insertedRow.rows[0].id;
      inserted++;
    } else {
      id = updated.rows[0].id;
    }
    ids.set(`${c.docketNumber}|${c.court}`, id);
  }
  return { seen: cases.length, inserted, skipped: cases.length - inserted, ids };
}

// Lifecycle link (§25): a published final rule supersedes its proposed rule.
// Match on normalized title within the same source; the proposal is expired
// (neutral — its weight moves to the final rule, this is not resistance) and
// the final rule records what it supersedes.
export async function linkFinalRules(source: string): Promise<number> {
  const linked = await pool.query(
    `UPDATE events final SET
        supersedes_event_id = proposal.id,
        parent_event_id = COALESCE(final.parent_event_id, proposal.id)
       FROM events proposal
      WHERE final.raw_data->>'source' = $1
        AND proposal.raw_data->>'source' = $1
        AND final.supersedes_event_id IS NULL
        AND final.raw_data->>'documentType' = 'Rule'
        AND proposal.raw_data->>'documentType' = 'Proposed Rule'
        AND lower(trim(final.title)) = lower(trim(proposal.title))
        AND proposal.occurred_at < final.occurred_at
      RETURNING final.id, final.occurred_at AS final_at, proposal.id AS proposal_id`,
    [source],
  );
  for (const row of linked.rows) {
    await pool.query(
      `UPDATE events SET operational_status = 'EXPIRED', updated_at = now(),
              expired_at = $3, in_force_status = 'PROPOSED',
              last_modified_by = $2
        WHERE id = $1 AND operational_status = 'PROPOSED'`,
      [row.proposal_id, `worker:${source}`, row.final_at],
    );
  }
  return linked.rowCount ?? 0;
}

// Lifecycle refresh (§25): when a source reports an event's operational
// status changed (e.g. a docket terminated), update the existing row rather
// than inserting a duplicate.
export interface StatusUpdate {
  status: string;
  expiredAt?: string | null; // ISO date when the status left force is known
}

export async function refreshOperationalStatus(
  source: string,
  statusByExternalId: Map<string, StatusUpdate>,
): Promise<number> {
  let updated = 0;
  for (const [externalId, next] of statusByExternalId) {
    // in_force_status captures the status the row held before its first
    // transition to a terminal state; expired_at records when — both feed
    // the point-in-time replay (§43).
    const result = await pool.query(
      `UPDATE events SET operational_status = $3, updated_at = now(),
              expired_at = COALESCE($5, expired_at),
              in_force_status = CASE
                WHEN $3 IN ('EXPIRED','SUPERSEDED','BLOCKED','ENJOINED','OVERTURNED')
                     AND in_force_status IS NULL
                -- A row that is already terminal can't tell us what it was
                -- before; ACTIVE is the in-force status for every source
                -- that reaches this path already expired (court dockets).
                THEN CASE
                  WHEN operational_status IN ('EXPIRED','SUPERSEDED','BLOCKED','ENJOINED','OVERTURNED')
                  THEN 'ACTIVE' ELSE operational_status END
                ELSE in_force_status END,
              last_modified_by = $4
        WHERE raw_data->>'source' = $1 AND raw_data->>'externalId' = $2
          AND (operational_status <> $3
               OR ($5::timestamptz IS NOT NULL AND expired_at IS DISTINCT FROM $5::timestamptz))`,
      [source, externalId, next.status, `worker:${source}`, next.expiredAt ?? null],
    );
    updated += result.rowCount ?? 0;
  }
  return updated;
}
