import type { VulnerabilityDimensions } from "./risk.js";
import type { EventType, OperationalStatus } from "./types.js";

// Automated derivation, methodology 2026.09.1 (after the v0.1 methodology
// spec). Still no hand-entered value anywhere; the changes over 2026.08.2:
//
// 1. Institutional resistance (D) is a first-class negative component:
//    blocked/enjoined/overturned actions and terminated cases stop feeding
//    vulnerability and feed resistance instead, and
//        V = RawV × (1 − K_D·D).
// 2. Active intervention pressure (A) is separated from structural
//    vulnerability and scales relevance:
//        RIR = E × V × (0.35 + 0.65·A).
// 3. Electoral exposure is additive: E = 0.5·C + 0.5·P.
// 4. Decay is per event class, not uniform: rule-like events in force do not
//    decay; proposals and pressure events decay exponentially.
//
// The weight of one event:
//   status in force (ACTIVE for a rule-like type)      → 1
//   status PROPOSED, or a pressure-class type          → 0.5^(age/half-life)
//   status BLOCKED/ENJOINED/OVERTURNED/SUPERSEDED      → 0 to vulnerability,
//                                                        full weight to D
//   material = false                                   → 0 everywhere
// Signals saturate as value = 1 − e^(−signal/K).

export const SATURATION_K = 3;
export const NATIONAL_SPILLOVER = 0.2;
// A nationwide block (e.g. a federal rule enjoined) counts toward every
// state's resistance at half weight; a state-level block counts fully there.
export const NATIONAL_RESISTANCE_WEIGHT = 0.5;
export const CASE_WEIGHT = 0.3;
export const RESISTANCE_SUPPRESSION = 0.6; // K_D
export const PRESSURE_FLOOR = 0.35; // RIR = E·V·(floor + (1−floor)·A)
export const PROPOSAL_HALF_LIFE_DAYS = 120;
export const PRESSURE_HALF_LIFE_DAYS = 90;
export const TIGHTNESS_SCALE = 25;

export const DIMENSION_EVENT_TYPES: Record<
  keyof VulnerabilityDimensions,
  EventType[]
> = {
  federalLeverage: [
    "FEDERAL_DIRECTIVE",
    "FEDERAL_DATA_REQUEST",
    "FEDERAL_INVESTIGATION",
    "PUBLIC_DIRECTIVE",
    "LAW_ENFORCEMENT_ACTION",
  ],
  stateCooperation: ["STATE_DIRECTIVE", "CERTIFICATION_REFUSAL", "PUBLIC_THREAT"],
  administrativeExposure: [
    "ELECTION_ADMINISTRATION",
    "COUNTY_ACTION",
    "EARLY_VOTING_RULE",
    "PROVISIONAL_BALLOT_RULE",
  ],
  voterRollExposure: [
    "VOTER_REGISTRATION",
    "VOTER_ROLL_ACCESS",
    "VOTER_ROLL_PURGE",
    "CITIZENSHIP_VERIFICATION",
  ],
  ballotExposure: [
    "BALLOT_ACCESS",
    "MAIL_BALLOT_RULE",
    "BALLOT_CURE_RULE",
    "BALLOT_REJECTION",
  ],
  litigationExposure: [
    "LITIGATION_FILED",
    "COURT_RULING",
    "APPEAL",
    "INJUNCTION",
    "SCOTUS_ACTION",
  ],
  certificationExposure: ["CERTIFICATION", "CERTIFICATION_REFUSAL", "AUDIT"],
  recountExposure: ["RECOUNT"],
  congressionalContestExposure: [
    "HOUSE_ELECTION_CONTEST",
    "SEATING_DISPUTE",
    "CANDIDATE_CONTEST",
  ],
};

// Rule-like events stay at full weight while in force (§26: an injunction or
// implemented rule does not decay); everything else decays.
const RULE_LIKE: ReadonlySet<EventType> = new Set<EventType>([
  "FEDERAL_DIRECTIVE",
  "STATE_DIRECTIVE",
  "ELECTION_ADMINISTRATION",
  "COUNTY_ACTION",
  "EARLY_VOTING_RULE",
  "PROVISIONAL_BALLOT_RULE",
  "MAIL_BALLOT_RULE",
  "BALLOT_CURE_RULE",
  "BALLOT_ACCESS",
  "CITIZENSHIP_VERIFICATION",
  "INJUNCTION",
]);

// "Someone is actively exercising a mechanism" — the pressure component's
// event set (§18).
export const ACTIVE_PRESSURE_TYPES: ReadonlySet<EventType> = new Set<EventType>([
  "FEDERAL_DIRECTIVE",
  "FEDERAL_DATA_REQUEST",
  "FEDERAL_INVESTIGATION",
  "STATE_DIRECTIVE",
  "LAW_ENFORCEMENT_ACTION",
  "LITIGATION_FILED",
  "VOTER_ROLL_PURGE",
  "VOTER_ROLL_ACCESS",
  "CERTIFICATION_REFUSAL",
  "PUBLIC_DIRECTIVE",
]);

const BLOCKED_STATUSES: ReadonlySet<OperationalStatus> = new Set<OperationalStatus>([
  "BLOCKED",
  "ENJOINED",
  "OVERTURNED",
  "SUPERSEDED",
]);

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export type EventDisposition =
  | { kind: "vulnerability"; weight: number }
  | { kind: "resistance"; weight: number }
  | { kind: "expired" };

// Where one event's weight goes under §17/§26. EXPIRED rule-like events (a
// terminated case, a lapsed rule) count for nothing on either side.
export function eventDisposition(
  types: EventType[],
  status: OperationalStatus,
  ageDays: number,
): EventDisposition {
  const ruleLike = types.some((t) => RULE_LIKE.has(t));
  if (BLOCKED_STATUSES.has(status)) {
    // The action was stopped by an institution — that is resistance working,
    // decayed so ancient rulings don't dominate.
    return {
      kind: "resistance",
      weight: Math.pow(0.5, Math.max(0, ageDays) / PRESSURE_HALF_LIFE_DAYS),
    };
  }
  if (status === "EXPIRED") return { kind: "expired" };
  if (status === "PROPOSED") {
    return {
      kind: "vulnerability",
      weight: Math.pow(0.5, Math.max(0, ageDays) / PROPOSAL_HALF_LIFE_DAYS),
    };
  }
  // ACTIVE (and any future in-force status): rules hold full weight,
  // pressure-class events decay.
  return {
    kind: "vulnerability",
    weight: ruleLike
      ? 1
      : Math.pow(0.5, Math.max(0, ageDays) / PRESSURE_HALF_LIFE_DAYS),
  };
}

export function saturate(signal: number): number {
  return clamp01(1 - Math.exp(-signal / SATURATION_K));
}

export function applyResistance(rawV: number, resistance: number): number {
  return clamp01(rawV * (1 - RESISTANCE_SUPPRESSION * clamp01(resistance)));
}

export function electoralExposure(
  competitiveness: number,
  pivotality: number,
): number {
  return clamp01(0.5 * competitiveness + 0.5 * pivotality);
}

export function interventionRelevance(
  exposure: number,
  vulnerability: number,
  activePressure: number,
): number {
  return clamp01(
    exposure *
      vulnerability *
      (PRESSURE_FLOOR + (1 - PRESSURE_FLOOR) * clamp01(activePressure)),
  );
}

export function nationalTightness(majoritySeats: number): number {
  return clamp01(1 - (majoritySeats - 218) / TIGHTNESS_SCALE);
}

// Confidence grows with the weighted evidence behind the assessment, capped
// well below certainty — this is a signal model, not ground truth.
export function derivedConfidence(totalSignal: number): number {
  return Math.min(0.8, 0.2 + 0.15 * Math.log1p(totalSignal));
}

// §39 display scale: ordinal categories over index = round(RIR × 100).
export type RiskLevel = "MINIMAL" | "LOW" | "MODERATE" | "HIGH" | "VERY_HIGH";

export function riskLevel(riskIndex0to100: number): RiskLevel {
  if (riskIndex0to100 < 20) return "MINIMAL";
  if (riskIndex0to100 < 40) return "LOW";
  if (riskIndex0to100 < 60) return "MODERATE";
  if (riskIndex0to100 < 75) return "HIGH";
  return "VERY_HIGH";
}
