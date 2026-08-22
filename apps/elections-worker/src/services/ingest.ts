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
  rawData: Record<string, unknown>;
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
  let inserted = 0;
  for (const event of events) {
    if (known.has(event.externalId)) continue;
    known.add(event.externalId);
    await pool.query(
      `INSERT INTO events (occurred_at, jurisdiction_type, jurisdictions,
                           event_types, title, summary, factual_status,
                           operational_status, confidence, material,
                           related_case_id, raw_data, entered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
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
        JSON.stringify({
          source: event.source,
          externalId: event.externalId,
          ...event.rawData,
        }),
        `worker:${event.source}`,
      ],
    );
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
      `UPDATE cases SET status = $3, name = $4
        WHERE docket_number = $1 AND court = $2
        RETURNING id`,
      [c.docketNumber, c.court, status, c.name],
    );
    let id: number;
    if (updated.rowCount === 0) {
      const insertedRow = await pool.query(
        `INSERT INTO cases (name, docket_number, court, jurisdiction, filed_at,
                            status, affected_states)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [
          c.name,
          c.docketNumber,
          c.court,
          c.jurisdiction,
          c.filedAt,
          status,
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

// Lifecycle refresh (§25): when a source reports an event's operational
// status changed (e.g. a docket terminated), update the existing row rather
// than inserting a duplicate.
export async function refreshOperationalStatus(
  source: string,
  statusByExternalId: Map<string, string>,
): Promise<number> {
  let updated = 0;
  for (const [externalId, status] of statusByExternalId) {
    const result = await pool.query(
      `UPDATE events SET operational_status = $3, updated_at = now(),
              last_modified_by = $4
        WHERE raw_data->>'source' = $1 AND raw_data->>'externalId' = $2
          AND operational_status <> $3`,
      [source, externalId, status, `worker:${source}`],
    );
    updated += result.rowCount ?? 0;
  }
  return updated;
}
