import type { VulnerabilityDimensions } from "./risk.js";
import type { EventType } from "./types.js";

// Automated vulnerability derivation (methodology 2026.08.2). No dimension is
// hand-entered: each is a saturating function of evidence-backed events
// (worker-ingested from public sources) mapped to that dimension, with recency
// decay. The formula is deliberately simple and fully published:
//
//   weight(event)  = 0.5 ^ (ageDays / HALF_LIFE_DAYS)
//   signal(dim)    = Σ weight(event) over the dimension's mapped events
//                    (+ CASE_WEIGHT per active voting-rights case, litigation only)
//   value(dim)     = 1 - e^(-signal / SATURATION_K)
//
// National (US-wide) events contribute at full weight to federalLeverage and
// at NATIONAL_SPILLOVER to every state's other dimensions.

export const HALF_LIFE_DAYS = 90;
export const SATURATION_K = 3;
export const NATIONAL_SPILLOVER = 0.2;
export const CASE_WEIGHT = 0.3;

// Pivotality is competitiveness scaled by how tight the projected House is:
// tightness = clamp01(1 - (majoritySeats - 218) / TIGHTNESS_SCALE).
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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function decayWeight(ageDays: number): number {
  return Math.pow(0.5, Math.max(0, ageDays) / HALF_LIFE_DAYS);
}

export function saturate(signal: number): number {
  return clamp01(1 - Math.exp(-signal / SATURATION_K));
}

export function nationalTightness(majoritySeats: number): number {
  return clamp01(1 - (majoritySeats - 218) / TIGHTNESS_SCALE);
}

// Confidence grows with the weighted evidence behind the assessment, capped
// well below certainty — this is a signal model, not ground truth.
export function derivedConfidence(totalSignal: number): number {
  return Math.min(0.8, 0.2 + 0.15 * Math.log1p(totalSignal));
}
