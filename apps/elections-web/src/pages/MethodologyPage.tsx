import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  CASE_WEIGHT,
  HALF_LIFE_DAYS,
  METHODOLOGY_VERSION,
  NATIONAL_SPILLOVER,
  RATINGS_VERSION,
  SATURATION_K,
  VULNERABILITY_WEIGHTS,
} from "@elections-tracker/shared";

export function MethodologyPage() {
  return (
    <Stack spacing={2} sx={{ maxWidth: 700 }}>
      <Typography variant="h5" sx={{ fontWeight: 300 }}>
        Methodology {METHODOLOGY_VERSION}
      </Typography>
      <Typography variant="body1">
        Facts, claims, and assessments are different objects. Nothing here is
        hand-entered: events are ingested from public sources, every risk
        dimension is computed from those events by the published formula below,
        and every score change traces to the specific events that moved it.
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

      <Typography variant="h6" sx={{ fontWeight: 300 }}>
        Dimension derivation
      </Typography>
      <Typography variant="body1">
        Each dimension is a saturating function of the evidence behind it. An
        event&apos;s weight decays with a {HALF_LIFE_DAYS}-day half-life; a
        dimension&apos;s signal is the sum of weights over its mapped event
        types (litigation also counts {CASE_WEIGHT} per active voting-rights
        case in the state); the published value is 1 − e^(−signal/
        {SATURATION_K}). Nationwide events contribute at full weight to
        federal leverage and at {NATIONAL_SPILLOVER} to a state&apos;s other
        dimensions. Pivotality is competitiveness scaled by how tight the
        projected House majority is. Confidence grows with the weighted
        evidence and is capped at 0.8 — this is a signal model, not ground
        truth.
      </Typography>
      <Typography variant="body1">
        Events currently flow from the Federal Register (rules, notices, and
        presidential documents matching election phrases in title or abstract)
        and from CourtListener RECAP dockets with nature of suit 441, the
        federal civil cover sheet&apos;s &quot;Civil Rights: Voting&quot;
        category. Every ingestion run is audited; source and external id are
        stored on each event.
      </Typography>

      <Typography variant="h6" sx={{ fontWeight: 300 }}>
        Derived race ratings {RATINGS_VERSION}
      </Typography>
      <Typography variant="body1">
        Ratings are computed, not licensed. The blended margin is 0.7 × the
        2024 two-party margin + 0.3 × the 2022 margin (one missing cycle falls
        back to the other). Open seats — no incumbent among the cycle&apos;s
        statutory FEC filings — shrink the margin toward zero by 3 points, a
        conventional estimate of House incumbency advantage. Bands on the
        absolute adjusted margin: Toss-up under 3, Lean under 8, Likely under
        15, Solid at 15 and above. The same margin feeds the risk model&apos;s
        competitiveness factor, falling linearly from 1 at a tied race to 0 at
        30 points.
      </Typography>
      <Typography variant="body1">
        The baseline House projection allocates every seat by the sign of its
        blended margin — including toss-ups, which is why it is a baseline and
        not a forecast. &quot;Seats to alter control&quot; is the projected
        majority&apos;s cushion beyond 217. Third-party forecasts, when
        recorded, are kept as separate per-source snapshots; disagreement
        between sources is preserved, never averaged away.
      </Typography>

      <Typography variant="h6" sx={{ fontWeight: 300 }}>
        Data sources
      </Typography>
      <Typography component="div" variant="body2">
        <ul>
          <li>
            District boundaries:{" "}
            <Link href="https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html">
              U.S. Census Bureau cartographic boundary files
            </Link>{" "}
            for the 119th Congress (public domain).
          </li>
          <li>
            Candidates and incumbency:{" "}
            <Link href="https://www.fec.gov/data/browse-data/?tab=bulk-data">
              FEC bulk candidate master and financial summaries
            </Link>{" "}
            (public domain). Where a party has several statutory filers in a
            district, the leading fundraiser is shown — a deterministic
            heuristic, not a primary-outcome claim.
          </li>
          <li>
            Sitting members:{" "}
            <Link href="https://github.com/unitedstates/congress-legislators">
              @unitedstates congress-legislators
            </Link>{" "}
            (CC0).
          </li>
          <li>
            Historical election returns: MIT Election Data + Science Lab,{" "}
            <Link href="https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/IG0UN2">
              U.S. House 1976–2024
            </Link>{" "}
            (CC0).
          </li>
        </ul>
      </Typography>

      <Typography variant="h6" sx={{ fontWeight: 300 }}>
        Known limitations
      </Typography>
      <Typography component="div" variant="body2">
        <ul>
          <li>
            Historical margins attach to 119th-Congress district lines; where a
            state redraws districts for 2026, the derived rating inherits that
            mismatch until new boundaries and results are loaded.
          </li>
          <li>
            The rating uses no presidential-lean input (no openly licensed
            presidential-results-by-district dataset) and no polling.
          </li>
          <li>
            Candidate names reflect FEC filings and fundraising at ingest time,
            not certified primary outcomes.
          </li>
        </ul>
      </Typography>
    </Stack>
  );
}
