import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  METHODOLOGY_VERSION,
  VULNERABILITY_WEIGHTS,
} from "@elections-tracker/shared";

export function MethodologyPage() {
  return (
    <Stack spacing={2} sx={{ maxWidth: 700 }}>
      <Typography variant="h5" sx={{ fontWeight: 300 }}>
        Methodology {METHODOLOGY_VERSION}
      </Typography>
      <Typography variant="body1">
        Facts, claims, and assessments are different objects. Every published
        risk score is computed deterministically from analyst-maintained
        dimensions; every score change traces to specific events, and every
        event traces to its sources.
      </Typography>
      <Typography variant="body1">
        Process vulnerability is a weighted mean of nine dimensions, each
        normalized to 0–1. Race subversion risk is the product of process
        vulnerability, competitiveness, and House-control pivotality: a
        vulnerable safe seat does not matter, and a robust toss-up is hard to
        manipulate — the concern is the vulnerable 50/50 district that decides
        seat 218.
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 300 }}>
        Dimension weights
      </Typography>
      <Typography component="pre" variant="body2" sx={{ fontFamily: "monospace" }}>
        {Object.entries(VULNERABILITY_WEIGHTS)
          .map(([key, weight]) => `${key.padEnd(30)} ${weight}`)
          .join("\n")}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Assessments store the methodology version they were computed under, so
        historical scores remain reproducible when weights change.
      </Typography>
    </Stack>
  );
}
