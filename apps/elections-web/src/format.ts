// Rating presentation shared by the map, legend, and tables.
//
// The seven bands are a diverging scale: blue arm (D), neutral gray toss-up
// midpoint, red arm (R). Steps were validated against the app's dark surface
// (#0a0a0a/#141414): every step ≥3:1 contrast, cross-arm pairs CVD-separable
// (worst ΔE 9.4 protan/deutan), midpoint lightness-separated from both arms.
// Within-arm neighbors are ordered steps of one hue and lean on the legend,
// tooltip, and races table for exact identity.
export const RATING_COLORS: Record<string, string> = {
  SOLID_D: "#2a6ab8",
  LIKELY_D: "#5590d2",
  LEAN_D: "#88b6ea",
  TOSS_UP: "#63686f",
  LEAN_R: "#ec9d86",
  LIKELY_R: "#da654c",
  SOLID_R: "#c23b2b",
};

export const NO_RATING_COLOR = "#2a2a2a";

export const RATING_LABELS: Record<string, string> = {
  SOLID_D: "Solid D",
  LIKELY_D: "Likely D",
  LEAN_D: "Lean D",
  TOSS_UP: "Toss-up",
  LEAN_R: "Lean R",
  LIKELY_R: "Likely R",
  SOLID_R: "Solid R",
};

// Legend/scale order, D arm to R arm.
export const RATING_ORDER = [
  "SOLID_D",
  "LIKELY_D",
  "LEAN_D",
  "TOSS_UP",
  "LEAN_R",
  "LIKELY_R",
  "SOLID_R",
] as const;

export function ratingLabel(rating: string | null): string {
  return rating ? (RATING_LABELS[rating] ?? rating) : "No rating";
}

// Intervention-relevance ramp (map spotlights and legend): single warm hue
// anchored on the platform accent #da654c, dark-surface-first. Index is
// 0–1 in the data, 0–100 in display.
export const RELEVANCE_RAMP: [number, string][] = [
  [0, "#1f1f1f"],
  [0.15, "#4a2e27"],
  [0.25, "#7c4335"],
  [0.35, "#ac5340"],
  [0.45, "#da654c"],
  [0.55, "#ff8a66"],
];

export const RELEVANCE_RAMP_CSS = `linear-gradient(90deg, ${RELEVANCE_RAMP.map(
  ([, c]) => c,
).join(", ")})`;
