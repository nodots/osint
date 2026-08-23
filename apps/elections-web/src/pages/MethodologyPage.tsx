import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { PageHeader } from "../components/PageHeader.js";
import {
  CASE_WEIGHT,
  METHODOLOGY_VERSION,
  NATIONAL_RESISTANCE_WEIGHT,
  NATIONAL_SPILLOVER,
  PRESSURE_FLOOR,
  PRESSURE_HALF_LIFE_DAYS,
  PROPOSAL_HALF_LIFE_DAYS,
  RATINGS_VERSION,
  RESISTANCE_SUPPRESSION,
  SATURATION_K,
  THREAT_CALIBRATION,
  VULNERABILITY_WEIGHTS,
} from "@elections-tracker/shared";

export function MethodologyPage() {
  return (
    <Stack spacing={2} sx={{ maxWidth: 700 }}>
      <PageHeader
        title={`Methodology ${METHODOLOGY_VERSION}`}
        meta="every parameter below is published; ratings are derived under a separately versioned model"
      />
      <Typography variant="h6" sx={{ fontWeight: 300 }}>
        What this measures — and what it does not
      </Typography>
      <Typography variant="body1">
        The protected value is <em>legitimate control</em>: control of the
        House as determined by voters under law and norms. The monitor
        assesses the risk that control is instead determined by improper use
        of governmental process — whichever party that use would favor. It
        does not assess who will win, whether fraud will occur, or any
        actor&apos;s intent: effects are never labeled as intent, and intent
        is not an assessed dimension. The model also does not adjudicate
        legality — the ingested court rulings do, and they enter the model as
        institutional resistance.
      </Typography>
      <Typography variant="body1">
        Three registers are kept separate, per the language discipline this
        project publishes and holds itself to. Documented: &quot;DOJ requested
        voter records.&quot; Assessed: &quot;this increases voter-roll
        exposure.&quot; Not established, and never stated: &quot;DOJ requested
        the records in order to alter a race.&quot; All indices are ordinal
        rankings on defined evidence signals, never probabilities.
      </Typography>
      <Typography variant="body1">
        Facts, claims, and assessments are different objects. Nothing here is
        hand-entered: events are ingested from public sources, every risk
        dimension is computed from those events by the published formula below,
        and every score change traces to the specific events that moved it.
      </Typography>
      <Typography variant="body1">
        Process vulnerability is a weighted mean of nine dimensions, each
        normalized to 0–1. A race&apos;s intervention relevance combines
        vulnerability (suppressed by institutional resistance), electoral
        exposure, and active pressure: a vulnerable safe seat does not matter,
        and a robust toss-up is hard to affect — the concern is the vulnerable
        50/50 district that decides seat 218.
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
        Each dimension is a saturating function of the evidence behind it: the
        signal is the sum of event weights over the dimension&apos;s mapped
        event types (litigation also counts {CASE_WEIGHT} per active
        voting-rights case in the state), and the published value is 1 −
        e^(−signal/{SATURATION_K}). An event&apos;s weight depends on its
        status and class, not a single clock: rules and injunctions in force
        hold full weight until they change status, proposals decay with a{" "}
        {PROPOSAL_HALF_LIFE_DAYS}-day half-life, and pressure-class events
        (directives, data requests, investigations, filings) decay with a{" "}
        {PRESSURE_HALF_LIFE_DAYS}-day half-life. Nationwide events contribute
        at full weight to federal leverage and at {NATIONAL_SPILLOVER} to a
        state&apos;s other dimensions. Status is resolved as of the assessment
        day from recorded transition dates — a docket&apos;s termination, a
        rule&apos;s supersession — so an injunction expires with its case and
        a historical replay sees each day&apos;s status of record, not
        today&apos;s. Where no transition date is recorded, the current status
        stands and the residual is reported with the backtest.
      </Typography>
      <Typography variant="body1">
        Blocked, enjoined, or overturned actions stop feeding vulnerability
        and feed institutional resistance instead (nationwide blocks at{" "}
        {NATIONAL_RESISTANCE_WEIGHT} weight per state), and vulnerability is
        suppressed by V = RawV × (1 − {RESISTANCE_SUPPRESSION}·D). Active
        intervention pressure — whether mechanisms are actually being
        exercised — is a separate saturating signal, and the published risk is
        Intervention Relevance = E × V × ({PRESSURE_FLOOR} + {1 -
        PRESSURE_FLOOR}·A), where electoral exposure E is the mean of
        competitiveness and pivotality. Pivotality is competitiveness scaled
        by how tight the projected House majority is. Routine agency
        paperwork fails a materiality test and never moves the signals.
        Confidence grows with the weighted evidence and is capped at 0.8 —
        this is a signal model, not ground truth, and the index is an ordinal
        ranking, never a probability that an election will be altered.
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
        Scales and glossary
      </Typography>
      <Typography variant="body1">
        The race-level index, <strong>intervention relevance</strong> (0–100),
        reads MINIMAL under 20, LOW under 40, MODERATE under 60, HIGH under
        75, VERY HIGH at 75 and above. The aggregate,{" "}
        <strong>threat to legitimate House control</strong>, is calibrated to
        the corrected historical baselines: the current count of high-risk
        pivotal races is placed in the pooled distribution of every
        baseline cycle-day ({THREAT_CALIBRATION.observations} observations,
        {" "}{THREAT_CALIBRATION.cycles.join("/")}). LOW is below the
        historical median ({THREAT_CALIBRATION.p50}), MODERATE is in the
        upper half of the range, HIGH is above the 90th percentile
        ({THREAT_CALIBRATION.p90}) — beyond nearly every cycle-day any
        baseline recorded — and UNKNOWN means no assessed races. The
        cutpoints regenerate with the baselines, so the scale is a position
        in observed history, not an invented constant. The baselines carry
        the same sources as the live model, including the historical
        state-legislation record loaded from the OpenStates bulk archive,
        so the comparison is like-for-like.
      </Typography>
      <Typography variant="body1">
        For reproducibility against the raw data: the public term
        &quot;intervention relevance&quot; is the API field{" "}
        <code>interventionRelevance</code> and the stored column{" "}
        <code>subversion_risk</code> — the column name predates this language
        standard and is retained because assessment history is append-only and
        never rewritten. &quot;Threat to legitimate House control&quot; is the
        API field <code>controlThreat</code>. The nine dimension fields and{" "}
        <code>institutional_resistance</code>/<code>active_pressure</code>{" "}
        carry their public names.
      </Typography>

      <Typography variant="h6" sx={{ fontWeight: 300 }}>
        Backtesting
      </Typography>
      <Typography variant="body1">
        The identical pipeline was replayed against every cycle 2016–2024
        (that cycle&apos;s districts, candidates, derived ratings, and the
        era&apos;s events from the same sources — including that era&apos;s
        state legislation, loaded from the OpenStates bulk archive with
        status resolved as of each replay day; 100-day assessment replays
        ending on each election day). An earlier run of this backtest read
        all baselines at zero; that was look-ahead bias — replays judged
        cases by their current status — and was corrected in methodology
        2026.09.4. Corrected: 2016 and 2018 read zero (blowout-projected
        majorities zero the pivotality term; the pre-2017 legislative
        record is also far thinner), while 2020, 2022, and 2024 read
        roughly 91–150 across their final 100 days. At the same distance
        from election day, 2026 reads level with 2024 — the top of the
        recent range, not outside it — and the ordering holds with the
        state-legislation layer removed. Full tables, the correction
        history, and limitations are published in the repository&apos;s
        backtest report.
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
