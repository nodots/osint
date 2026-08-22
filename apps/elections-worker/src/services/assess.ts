import {
  CASE_WEIGHT,
  DIMENSION_EVENT_TYPES,
  METHODOLOGY_VERSION,
  NATIONAL_SPILLOVER,
  competitivenessFromMargin,
  decayWeight,
  derivedConfidence,
  nationalTightness,
  processVulnerability,
  saturate,
  subversionRisk,
  type VulnerabilityDimensions,
} from "@elections-tracker/shared";
import { pool } from "../db.js";

// Fully automated assessment pass (methodology 2026.08.2): derive per-state
// vulnerability signals from ingested events and litigation, combine with
// derived competitiveness and pivotality, and append per-race assessment rows.
// Append-only; a race whose numbers didn't move since its latest row is
// skipped, so history rows mean something changed.

const WINDOW_DAYS = 365;
const DIMENSIONS = Object.keys(
  DIMENSION_EVENT_TYPES,
) as (keyof VulnerabilityDimensions)[];

interface EventRow {
  id: number;
  occurred_at: Date;
  jurisdictions: string[];
  event_types: string[];
  affected_race_ids: number[];
}

type Signals = Record<keyof VulnerabilityDimensions, number>;

function emptySignals(): Signals {
  const s = {} as Signals;
  for (const d of DIMENSIONS) s[d] = 0;
  return s;
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
      `SELECT id, occurred_at, jurisdictions, event_types, affected_race_ids
         FROM events WHERE occurred_at >= $1`,
      [since],
    ),
    pool.query<{ jurisdiction: string | null }>(
      `SELECT jurisdiction FROM cases WHERE status = 'ACTIVE'`,
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

  // Per-state signal accumulation.
  const stateSignals = new Map<string, Signals>();
  const stateEventIds = new Map<string, number[]>();
  const raceExtra = new Map<number, { signals: Signals; eventIds: number[] }>();
  const signalsFor = (state: string): Signals => {
    let s = stateSignals.get(state);
    if (!s) {
      s = emptySignals();
      stateSignals.set(state, s);
    }
    return s;
  };

  const allStates = new Set(races.rows.map((r) => r.state));
  for (const state of allStates) signalsFor(state);

  for (const event of events.rows) {
    const ageDays =
      (now.getTime() - event.occurred_at.getTime()) / 86400000;
    const weight = decayWeight(ageDays);
    const dims = dimensionsForEvent(event.event_types);
    if (dims.length === 0) continue;
    const states = event.jurisdictions.filter((j) => allStates.has(j));
    const national = event.jurisdictions.includes("US") || states.length === 0;

    for (const dim of dims) {
      if (national) {
        // National events drive federal leverage everywhere; other dimensions
        // only get spillover.
        const spill = dim === "federalLeverage" ? 1 : NATIONAL_SPILLOVER;
        for (const state of allStates) {
          signalsFor(state)[dim] += weight * spill;
        }
      } else {
        for (const state of states) signalsFor(state)[dim] += weight;
      }
    }
    const touched = national ? [...allStates] : states;
    for (const state of touched) {
      let ids = stateEventIds.get(state);
      if (!ids) {
        ids = [];
        stateEventIds.set(state, ids);
      }
      ids.push(event.id);
    }
    // District-linked events additionally hit their races directly.
    for (const raceId of event.affected_race_ids) {
      let extra = raceExtra.get(raceId);
      if (!extra) {
        extra = { signals: emptySignals(), eventIds: [] };
        raceExtra.set(raceId, extra);
      }
      for (const dim of dims) extra.signals[dim] += weight;
      extra.eventIds.push(event.id);
    }
  }

  for (const c of cases.rows) {
    if (c.jurisdiction && allStates.has(c.jurisdiction)) {
      signalsFor(c.jurisdiction).litigationExposure += CASE_WEIGHT;
    }
  }

  // Publish state profiles.
  for (const [state, signals] of stateSignals) {
    const dims = {} as VulnerabilityDimensions;
    for (const d of DIMENSIONS) dims[d] = saturate(signals[d]);
    await pool.query(
      `INSERT INTO state_profiles (state, process_vulnerability, dimensions, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (state) DO UPDATE SET
         process_vulnerability = EXCLUDED.process_vulnerability,
         dimensions = EXCLUDED.dimensions,
         updated_at = now()`,
      [state, processVulnerability(dims), JSON.stringify(dims)],
    );
  }

  const { dem, rep } = projection.rows[0] ?? { dem: 0, rep: 0 };
  const tightness =
    dem + rep === 435 ? nationalTightness(Math.max(dem, rep)) : 0.5;

  // Latest assessment per race, to skip unchanged rows.
  const latest = await pool.query<{
    race_id: number;
    process_vulnerability: string;
    competitiveness: string;
    pivotality: string;
    subversion_risk: string;
  }>(
    `SELECT DISTINCT ON (race_id) race_id, process_vulnerability,
            competitiveness, pivotality, subversion_risk
       FROM race_risk_assessments
      ORDER BY race_id, assessed_at DESC`,
  );
  const latestByRace = new Map(latest.rows.map((r) => [r.race_id, r]));

  let inserted = 0;
  let skipped = 0;
  const round = (n: number) => Math.round(n * 10000) / 10000;

  for (const race of races.rows) {
    const stateSig = signalsFor(race.state);
    const extra = raceExtra.get(race.id);
    const dims = {} as VulnerabilityDimensions;
    let totalSignal = 0;
    for (const d of DIMENSIONS) {
      const signal = stateSig[d] + (extra?.signals[d] ?? 0);
      dims[d] = round(saturate(signal));
      totalSignal += signal;
    }
    const vulnerability = round(processVulnerability(dims));
    const competitiveness =
      race.projected_margin == null
        ? 0
        : round(competitivenessFromMargin(race.projected_margin));
    const pivotality = round(competitiveness * tightness);
    const risk = round(subversionRisk(vulnerability, competitiveness, pivotality));

    const prev = latestByRace.get(race.id);
    if (
      prev &&
      round(Number(prev.process_vulnerability)) === vulnerability &&
      round(Number(prev.competitiveness)) === competitiveness &&
      round(Number(prev.pivotality)) === pivotality &&
      round(Number(prev.subversion_risk)) === risk
    ) {
      skipped++;
      continue;
    }

    const triggering = [
      ...(stateEventIds.get(race.state) ?? []),
      ...(extra?.eventIds ?? []),
    ].slice(0, 50);

    await pool.query(
      `INSERT INTO race_risk_assessments
         (race_id, competitiveness, pivotality, federal_leverage,
          state_cooperation, administrative_exposure, voter_roll_exposure,
          ballot_exposure, litigation_exposure, certification_exposure,
          recount_exposure, congressional_contest_exposure,
          process_vulnerability, subversion_risk, confidence, explanations,
          triggering_event_ids, methodology_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
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
        risk,
        round(derivedConfidence(totalSignal)),
        JSON.stringify({
          derivation: "event-signal",
          state: race.state,
          nationalTightness: round(tightness),
          stateEventCount: stateEventIds.get(race.state)?.length ?? 0,
          districtEventCount: extra?.eventIds.length ?? 0,
        }),
        [...new Set(triggering)],
        METHODOLOGY_VERSION,
      ],
    );
    inserted++;
  }

  return { seen: races.rows.length, inserted, skipped };
}
