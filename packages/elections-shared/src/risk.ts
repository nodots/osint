// Deterministic risk model (spec §8–9). Scoring is pure arithmetic so every
// published number is reproducible; narrative explanation happens elsewhere,
// after the calculation, never instead of it. Any change to dimensions or
// weights must bump METHODOLOGY_VERSION so historical assessments remain
// reproducible against the version they were computed with.

// 2026.08.2: vulnerability dimensions become derived signals (see
// derivation.ts) instead of analyst-entered values; weights unchanged.
// 2026.09.1: institutional resistance suppresses vulnerability, active
// pressure scales relevance, electoral exposure goes additive, decay is
// per event class, and a materiality gate keeps routine paperwork out of
// the signals (after the v0.1 methodology spec).
// 2026.09.2: court rulings ingest with direction — INJUNCTION events are
// resistance-side (full weight while in force, nothing once dissolved).
// 2026.09.3: nationwide-scope injunction detection; active pressure blends
// separately saturated state and national signals; cases weigh less into
// pressure than into litigation exposure.
// 2026-08-22 language revision (no model change): public vocabulary unified —
// the index is "intervention relevance", the aggregate is "threat to
// legitimate House control"; "subversion" retired from all public surfaces
// (the append-only subversion_risk column name is retained and documented).
export const METHODOLOGY_VERSION = "2026.09.3";

// All dimensions are normalized to [0,1].
export interface VulnerabilityDimensions {
  federalLeverage: number;
  stateCooperation: number;
  administrativeExposure: number;
  voterRollExposure: number;
  ballotExposure: number;
  litigationExposure: number;
  certificationExposure: number;
  recountExposure: number;
  congressionalContestExposure: number;
}

// Weights group the nine stored dimensions into the spec's five vulnerability
// components: federal leverage, state cooperation, administrative exposure
// (admin + voter roll + ballot), legal exposure, and post-election exposure
// (certification + recount + congressional contest).
export const VULNERABILITY_WEIGHTS: Record<
  keyof VulnerabilityDimensions,
  number
> = {
  federalLeverage: 0.2,
  stateCooperation: 0.2,
  administrativeExposure: 0.1,
  voterRollExposure: 0.1,
  ballotExposure: 0.1,
  litigationExposure: 0.15,
  certificationExposure: 0.06,
  recountExposure: 0.05,
  congressionalContestExposure: 0.04,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// Weighted mean of the dimensions, in [0,1].
export function processVulnerability(dims: VulnerabilityDimensions): number {
  let total = 0;
  for (const key of Object.keys(
    VULNERABILITY_WEIGHTS,
  ) as (keyof VulnerabilityDimensions)[]) {
    total += clamp01(dims[key]) * VULNERABILITY_WEIGHTS[key];
  }
  return clamp01(total);
}

// Pre-2026.09 multiplicative index (spec §9): Vulnerability ×
// Competitiveness × Pivotality. Retained only for the legacy admin entry
// route; the live model is interventionRelevance() in derivation.ts. The
// multiplicative intuition still holds: a deeply vulnerable safe seat does
// not matter, and a robust toss-up is hard to affect — the concern is the
// vulnerable 50/50 district that decides seat 218.
export function multiplicativeRisk(
  vulnerability: number,
  competitiveness: number,
  pivotality: number,
): number {
  return clamp01(clamp01(vulnerability) * clamp01(competitiveness) * clamp01(pivotality));
}
