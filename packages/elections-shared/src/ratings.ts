// Derived race ratings (spec §17 forecast inputs, FOSS-only variant). We do
// not license proprietary ratings (Cook/Sabato/Inside); instead we compute a
// deterministic rating from public-domain election returns and publish the
// arithmetic. Third-party ratings can still be recorded per race through the
// admin surface as their own forecast_snapshots source.
//
// Any change to the blend, the open-seat adjustment, or the band cutoffs must
// bump RATINGS_VERSION so stored ratings remain reproducible.

export const RATINGS_VERSION = "2026.08.1";

export type RaceRating =
  | "SOLID_D"
  | "LIKELY_D"
  | "LEAN_D"
  | "TOSS_UP"
  | "LEAN_R"
  | "LIKELY_R"
  | "SOLID_R";

// Margins are two-party margins in percentage points of total votes cast,
// signed positive toward the Democratic candidate.
export interface RatingInputs {
  margin2024: number | null;
  margin2022: number | null;
  incumbentRunning: boolean;
}

export interface DerivedRating {
  rating: RaceRating;
  // The adjusted margin the band was read from, same sign convention.
  blendedMargin: number;
  // Competitiveness input for the risk model, in [0,1].
  competitiveness: number;
}

// Weight the most recent result heaviest; one missing cycle falls back to the
// other alone. Open seats lose the incumbency cushion, so the margin is
// shrunk toward zero by a flat 3 points (a conventional estimate of House
// incumbency advantage).
const RECENT_WEIGHT = 0.7;
const PRIOR_WEIGHT = 0.3;
const OPEN_SEAT_SHRINK_PTS = 3;

// Band cutoffs on |adjusted margin|, in points.
const TOSS_UP_MAX = 3;
const LEAN_MAX = 8;
const LIKELY_MAX = 15;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

// Linear falloff: a 0-point race scores 1, a 30-point race (or worse) scores
// 0. Feeds the competitiveness factor of the intervention-relevance index.
export function competitivenessFromMargin(marginPts: number): number {
  return clamp01(1 - Math.abs(marginPts) / 30);
}

export function deriveRating(inputs: RatingInputs): DerivedRating | null {
  const { margin2024, margin2022, incumbentRunning } = inputs;
  if (margin2024 === null && margin2022 === null) return null;

  let blended: number;
  if (margin2024 !== null && margin2022 !== null) {
    blended = RECENT_WEIGHT * margin2024 + PRIOR_WEIGHT * margin2022;
  } else {
    blended = (margin2024 ?? margin2022) as number; // one side is non-null here by the guard above
  }

  if (!incumbentRunning) {
    const shrunk = Math.abs(blended) - OPEN_SEAT_SHRINK_PTS;
    blended = Math.sign(blended) * Math.max(0, shrunk);
  }

  const abs = Math.abs(blended);
  let band: "TOSS_UP" | "LEAN" | "LIKELY" | "SOLID";
  if (abs < TOSS_UP_MAX) band = "TOSS_UP";
  else if (abs < LEAN_MAX) band = "LEAN";
  else if (abs < LIKELY_MAX) band = "LIKELY";
  else band = "SOLID";

  const rating: RaceRating =
    band === "TOSS_UP" ? "TOSS_UP" : `${band}_${blended > 0 ? "D" : "R"}`;

  return {
    rating,
    blendedMargin: blended,
    competitiveness: competitivenessFromMargin(blended),
  };
}
