// Deterministic risk model (spec §8–9). Scoring is pure arithmetic so every
// published number is reproducible; narrative explanation happens elsewhere,
// after the calculation, never instead of it. Any change to dimensions or
// weights must bump METHODOLOGY_VERSION so historical assessments remain
// reproducible against the version they were computed with.

// 2026.08.2: vulnerability dimensions become derived signals (see
// derivation.ts) instead of analyst-entered values; weights unchanged.
export const METHODOLOGY_VERSION = "2026.08.2";

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

// Race Subversion Risk = Process Vulnerability × Competitiveness × Pivotality
// (spec §9). The multiplicative structure is the point: a deeply vulnerable
// safe seat does not matter, and a robust toss-up is hard to manipulate — the
// problem is the vulnerable 50/50 district that decides seat 218.
export function subversionRisk(
  vulnerability: number,
  competitiveness: number,
  pivotality: number,
): number {
  return clamp01(clamp01(vulnerability) * clamp01(competitiveness) * clamp01(pivotality));
}

export type SubversionRelevance = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";

export function subversionRelevance(risk: number): SubversionRelevance {
  if (risk < 0.05) return "LOW";
  if (risk < 0.12) return "MEDIUM";
  if (risk < 0.25) return "HIGH";
  return "VERY_HIGH";
}
