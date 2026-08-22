import {
  ACTIVE_PRESSURE_TYPES,
  CASE_WEIGHT,
  DIMENSION_EVENT_TYPES,
  METHODOLOGY_VERSION,
  NATIONAL_RESISTANCE_WEIGHT,
  NATIONAL_SPILLOVER,
  PRESSURE_HALF_LIFE_DAYS,
  applyResistance,
  competitivenessFromMargin,
  derivedConfidence,
  electoralExposure,
  eventDisposition,
  interventionRelevance,
  nationalTightness,
  processVulnerability,
  saturate,
  type EventType,
  type OperationalStatus,
  type VulnerabilityDimensions,
} from "@elections-tracker/shared";
import { pool } from "../db.js";

// Automated assessment pass, methodology 2026.09.1. Signals come only from
// material events; each event's weight is routed by eventDisposition() —
// in-force actions feed vulnerability, blocked actions feed institutional
// resistance, expired ones feed nothing. Active pressure tracks recent
// exercise of intervention mechanisms. Append-only, unchanged races skipped.

const WINDOW_DAYS = 540; // covers the spec §34 history start before the 2026 general
const DIMENSIONS = Object.keys(
  DIMENSION_EVENT_TYPES,
) as (keyof VulnerabilityDimensions)[];
const TOP_EVIDENCE = 5;

interface EventRow {
  id: number;
  occurred_at: Date;
  jurisdictions: string[];
  event_types: string[];
  operational_status: string;
  affected_race_ids: number[];
}

type Signals = Record<keyof VulnerabilityDimensions, number>;

interface Evidence {
  id: number;
  w: number;
}

interface StateAccumulator {
  vuln: Signals;
  resistance: number;
  pressure: number;
  evidence: Map<string, Evidence[]>; // dimension | "resistance" | "pressure"
}

function emptySignals(): Signals {
  const s = {} as Signals;
  for (const d of DIMENSIONS) s[d] = 0;
  return s;
}

function newAccumulator(): StateAccumulator {
  return { vuln: emptySignals(), resistance: 0, pressure: 0, evidence: new Map() };
}

function addEvidence(
  acc: StateAccumulator,
  key: string,
  id: number,
  w: number,
): void {
  let list = acc.evidence.get(key);
  if (!list) {
    list = [];
    acc.evidence.set(key, list);
  }
  list.push({ id, w });
  if (list.length > TOP_EVIDENCE * 4) {
    list.sort((a, b) => b.w - a.w);
    list.length = TOP_EVIDENCE;
  }
}

function topEvidence(acc: StateAccumulator, key: string): number[] {
  return (acc.evidence.get(key) ?? [])
    .sort((a, b) => b.w - a.w)
    .slice(0, TOP_EVIDENCE)
    .map((e) => e.id);
}

function dimensionsForEvent(types: string[]): (keyof VulnerabilityDimensions)[] {
  return DIMENSIONS.filter((d) =>
    DIMENSION_EVENT_TYPES[d].some((t) => types.includes(t)),
  );
}

export async function runAssessments(now: Date): Promise<{
  seen: number;
  inserted: number;
  skipped: number;
}> {
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400000);

  const [events, cases, races, projection] = await Promise.all([
    pool.query<EventRow>(
      `SELECT id, occurred_at, jurisdictions, event_types, operational_status,
              affected_race_ids
         FROM events WHERE occurred_at >= $1 AND material`,
      [since],
    ),
    pool.query<{ jurisdiction: string | null; status: string }>(
      `SELECT jurisdiction, status FROM cases`,
    ),
    pool.query<{
      id: number;
      district_id: string;
      state: string;
      projected_margin: number | null;
    }>(
      `SELECT r.id, r.district_id, d.state, r.projected_margin
         FROM races r
         JOIN districts d ON d.id = r.district_id
         JOIN elections e ON e.id = r.election_id
        WHERE e.election_type = 'HOUSE' AND e.cycle = 2026`,
    ),
    pool.query<{ dem: number; rep: number }>(
      `SELECT count(*) FILTER (WHERE projected_margin > 0
                               OR (projected_margin = 0 AND incumbent_party = 'D'))::int AS dem,
              count(*) FILTER (WHERE projected_margin < 0
                               OR (projected_margin = 0 AND incumbent_party = 'R'))::int AS rep
         FROM races`,
    ),
  ]);

  const allStates = new Set(races.rows.map((r) => r.state));
  const byState = new Map<string, StateAccumulator>();
  const accFor = (state: string): StateAccumulator => {
    let acc = byState.get(state);
    if (!acc) {
      acc = newAccumulator();
      byState.set(state, acc);
    }
    return acc;
  };
  for (const state of allStates) accFor(state);

  const raceExtra = new Map<number, StateAccumulator>();
  const stateEventIds = new Map<string, number[]>();

  for (const event of events.rows) {
    const ageDays = (now.getTime() - event.occurred_at.getTime()) / 86400000;
    const types = event.event_types as EventType[];
    const status = event.operational_status as OperationalStatus;
    const dims = dimensionsForEvent(event.event_types);
    if (dims.length === 0) continue;
    const disposition = eventDisposition(types, status, ageDays);
    if (disposition.kind === "expired") continue;

    const states = event.jurisdictions.filter((j) => allStates.has(j));
    const national = event.jurisdictions.includes("US") || states.length === 0;
    const targets = national ? [...allStates] : states;

    const applyTo = (acc: StateAccumulator, scale: number) => {
      if (disposition.kind === "resistance") {
        acc.resistance += disposition.weight * scale;
        addEvidence(acc, "resistance", event.id, disposition.weight * scale);
        return;
      }
      for (const dim of dims) {
        const spill =
          national && dim !== "federalLeverage" ? NATIONAL_SPILLOVER : 1;
        const w = disposition.weight * spill * scale;
        acc.vuln[dim] += w;
        addEvidence(acc, dim, event.id, w);
      }
      if (types.some((t) => ACTIVE_PRESSURE_TYPES.has(t))) {
        const w =
          Math.pow(0.5, Math.max(0, ageDays) / PRESSURE_HALF_LIFE_DAYS) * scale;
        acc.pressure += w;
        addEvidence(acc, "pressure", event.id, w);
      }
    };

    const resistanceScale =
      disposition.kind === "resistance" && national
        ? NATIONAL_RESISTANCE_WEIGHT
        : 1;
    for (const state of targets) {
      applyTo(accFor(state), resistanceScale);
      let ids = stateEventIds.get(state);
      if (!ids) {
        ids = [];
        stateEventIds.set(state, ids);
      }
      ids.push(event.id);
    }
    for (const raceId of event.affected_race_ids) {
      let extra = raceExtra.get(raceId);
      if (!extra) {
        extra = newAccumulator();
        raceExtra.set(raceId, extra);
      }
      applyTo(extra, 1);
    }
  }

  for (const c of cases.rows) {
    if (!c.jurisdiction || !allStates.has(c.jurisdiction)) continue;
    const acc = accFor(c.jurisdiction);
    if (c.status === "ACTIVE") {
      acc.vuln.litigationExposure += CASE_WEIGHT;
      acc.pressure += CASE_WEIGHT;
    }
    // Terminated cases are neutral: docket metadata alone can't say whether
    // the ending was a dismissal (resistance) or a win for the plaintiff.
  }

  for (const [state, acc] of byState) {
    const dims = {} as VulnerabilityDimensions;
    for (const d of DIMENSIONS) dims[d] = saturate(acc.vuln[d]);
    const vulnerability = applyResistance(
      processVulnerability(dims),
      saturate(acc.resistance),
    );
    await pool.query(
      `INSERT INTO state_profiles (state, process_vulnerability, dimensions, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (state) DO UPDATE SET
         process_vulnerability = EXCLUDED.process_vulnerability,
         dimensions = EXCLUDED.dimensions,
         updated_at = now()`,
      [
        state,
        vulnerability,
        JSON.stringify({
          ...dims,
          institutionalResistance: saturate(acc.resistance),
          activePressure: saturate(acc.pressure),
        }),
      ],
    );
  }

  const { dem, rep } = projection.rows[0] ?? { dem: 0, rep: 0 };
  const tightness =
    dem + rep === 435 ? nationalTightness(Math.max(dem, rep)) : 0.5;

  const latest = await pool.query<{
    race_id: number;
    process_vulnerability: string;
    competitiveness: string;
    pivotality: string;
    subversion_risk: string;
    institutional_resistance: string | null;
    active_pressure: string | null;
  }>(
    `SELECT DISTINCT ON (race_id) race_id, process_vulnerability,
            competitiveness, pivotality, subversion_risk,
            institutional_resistance, active_pressure
       FROM race_risk_assessments
      ORDER BY race_id, assessed_at DESC`,
  );
  const latestByRace = new Map(latest.rows.map((r) => [r.race_id, r]));

  let inserted = 0;
  let skipped = 0;
  const round = (n: number) => Math.round(n * 10000) / 10000;

  for (const race of races.rows) {
    const stateAcc = accFor(race.state);
    const extra = raceExtra.get(race.id);

    const dims = {} as VulnerabilityDimensions;
    let totalSignal = 0;
    for (const d of DIMENSIONS) {
      const signal = stateAcc.vuln[d] + (extra?.vuln[d] ?? 0);
      dims[d] = round(saturate(signal));
      totalSignal += signal;
    }
    const resistance = round(
      saturate(stateAcc.resistance + (extra?.resistance ?? 0)),
    );
    const pressure = round(saturate(stateAcc.pressure + (extra?.pressure ?? 0)));
    const rawV = processVulnerability(dims);
    const vulnerability = round(applyResistance(rawV, resistance));
    const competitiveness =
      race.projected_margin == null
        ? 0
        : round(competitivenessFromMargin(race.projected_margin));
    const pivotality = round(competitiveness * tightness);
    const exposure = electoralExposure(competitiveness, pivotality);
    const risk = round(interventionRelevance(exposure, vulnerability, pressure));

    const prev = latestByRace.get(race.id);
    if (
      prev &&
      round(Number(prev.process_vulnerability)) === vulnerability &&
      round(Number(prev.competitiveness)) === competitiveness &&
      round(Number(prev.pivotality)) === pivotality &&
      round(Number(prev.subversion_risk)) === risk &&
      prev.institutional_resistance != null &&
      round(Number(prev.institutional_resistance)) === resistance &&
      prev.active_pressure != null &&
      round(Number(prev.active_pressure)) === pressure
    ) {
      skipped++;
      continue;
    }

    // §37 explanation payload: top drivers with their evidence event ids,
    // resistance as the mitigation, plus the intermediate terms.
    const drivers = DIMENSIONS.map((d) => ({
      dimension: d,
      value: dims[d],
      evidence: topEvidence(stateAcc, d),
    }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    const triggering = [
      ...(stateEventIds.get(race.state) ?? []),
    ].slice(0, 50);

    await pool.query(
      `INSERT INTO race_risk_assessments
         (race_id, competitiveness, pivotality, federal_leverage,
          state_cooperation, administrative_exposure, voter_roll_exposure,
          ballot_exposure, litigation_exposure, certification_exposure,
          recount_exposure, congressional_contest_exposure,
          process_vulnerability, institutional_resistance, active_pressure,
          subversion_risk, confidence, explanations, triggering_event_ids,
          methodology_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        race.id,
        competitiveness,
        pivotality,
        dims.federalLeverage,
        dims.stateCooperation,
        dims.administrativeExposure,
        dims.voterRollExposure,
        dims.ballotExposure,
        dims.litigationExposure,
        dims.certificationExposure,
        dims.recountExposure,
        dims.congressionalContestExposure,
        vulnerability,
        resistance,
        pressure,
        risk,
        round(derivedConfidence(totalSignal)),
        JSON.stringify({
          derivation: "event-signal",
          state: race.state,
          rawVulnerability: round(rawV),
          electoralExposure: round(exposure),
          nationalTightness: round(tightness),
          drivers,
          mitigations: [
            {
              dimension: "institutionalResistance",
              value: resistance,
              evidence: topEvidence(stateAcc, "resistance"),
            },
          ],
          pressureEvidence: topEvidence(stateAcc, "pressure"),
        }),
        [...new Set(triggering)],
        METHODOLOGY_VERSION,
      ],
    );
    inserted++;
  }

  return { seen: races.rows.length, inserted, skipped };
}
