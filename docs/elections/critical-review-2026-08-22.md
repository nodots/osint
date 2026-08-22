# Critical review — Election Integrity Monitor

2026-08-22, against `docs/elections/REVIEW-HANDOFF.md`. Attacks were run
empirically where possible: a threshold sweep over all six databases, a
matched days-to-election comparison, a status-maturity counterfactual
(database `elections_review_2020`, kept on the dev postgres at 6432 for
inspection), and caption-level inspection of the 2020 injunction set. The
worker test suite passes (18/18).

## Verdicts on the handoff's claims

### 1. "2026 is anomalous" — NOT SUPPORTED as published

Two results, one for the claim and one against it.

**The threshold sweep alone does not break the claim.** At matched
days-to-election (~73 days out, the 2026 vantage), the as-built baselines
read below 2026 at every cutoff, not just 0.12:

| high-risk cutoff | 2016 | 2018 | 2020 | 2022 | 2024 | 2026 matched |
|---|---|---|---|---|---|---|
| 0.06 | 0 | 0 | 11–14 | 18–19 | 26–29 | 87 |
| 0.08 | 0 | 0 | 1 | 1 | 0 | 40 |
| 0.10 | 0 | 0 | 0 | 0 | 0 | 15 |
| 0.12 | 0 | 0 | 0 | 0 | 0 | 4 |

**But the backtest has look-ahead bias that produces exactly this pattern.**
The replay uses each event's *current* lifecycle status for every historical
day (admitted at `apps/elections-worker/src/services/assess.ts:120-122`), and
the cases query (`assess.ts:128-130, 240-249`) has no as-of filter in either
direction. Status maturity therefore differs categorically between a
baseline and the live cycle:

- 2020 baseline: 58% of material events EXPIRED, 93% of cases terminated —
  judged by election-day-or-later status, applied to every replay date. A
  docket that was live in August 2020 but terminated in December contributes
  nothing on any replay day.
- 2026 live: 26% expired, 66% of cases still ACTIVE — because nothing has
  had time to die yet.

**Counterfactual:** cloning the 2020 baseline, restoring live-like statuses
(EXPIRED→ACTIVE, terminated cases→ACTIVE — an upper bound, since some had
genuinely lapsed by August), and replaying the 73-days-out window gives:

| cutoff | 2020 counterfactual | 2026 matched |
|---|---|---|
| 0.06 | 98 | 87 |
| 0.08 | 41 | 40 |
| 0.10 | 17 | 15 |
| 0.12 | 0 | 4 |

Indistinguishable except exactly at 0.12, where the split rests on a peak
of 0.119 (CA-48) vs 0.121–0.131 (CO-08, CA-13, CA-27, CA-45) — about 0.01
of index at an invented constant. The true live-2020 reading lies somewhere
between the as-built baseline and this upper bound; the published data
cannot locate it. The honest statement is: **the backtest cannot
distinguish 2026 from 2020 without point-in-time statuses.** The 2016/2018
zeros are additionally confounded by RECAP coverage growth (near-zero event
volume those cycles).

Fix: store status-transition dates (CourtListener exposes `dateTerminated`;
ruling dates are already events) and make the replay resolve each event's
status as of the replay day. Until then, `backtest-2016-2024.md` needs this
caveat attached to its headline and "anomalous" removed from cross-cycle
claims against 2020–2024.

### Pivotality gate is a no-op

Sweeping the pivotal cutoff across 0.05/0.10/0.15 changes no count in any
of the six databases. Structural: pivotality = competitiveness × tightness
already sits inside the risk index via exposure, so any race clearing the
risk cutoff clears the pivotality cutoff automatically. "High-risk pivotal"
is just "high-risk"; either drop the second condition or document it as
definitional rather than a filter.

### 3. Injunction classifier — handoff concerns CONFIRMED, plus new ones

Caption-level inspection of the 25 FEDERAL-scope blocks in the 2020
baseline (101 injunction events total) finds:

- **Stay-of-injunction inverts direction**: "granting Motion to stay
  injunction pending appeal" (Middleton v. Andino, 4th Cir.) classified
  BLOCKS → resistance. A stay suspends the injunction; `GRANT_RE` matches
  "granting … injunction" through the intervening "stay". Same family: the
  DNC v. RNC SCOTUS order (19A1016) — which *reversed* a ballot-deadline
  extension — counts as resistance though it cut the other way. This is the
  handoff's direction-blindness, with concrete instances.
- **Mechanics leak past `MECHANICS_RE`**: "granting Defendants' Unopposed
  Motion by Defendants for Leave to Submit Br…" and a "NOTICE of
  Supplemental Authorities" (both State of Colorado v. DeJoy) are counted
  as injunctions. The regex requires "motion for leave" adjacency;
  intervening words defeat it.
- **The predicted Griswold pattern exists**: United States v. Cruz
  (S.D.N.Y.) and United States v. ARPI-Orellana (W.D. Tex.) — captions
  that look criminal/immigration, not voting — were nationalized by
  `FEDERAL_PARTY_RE` because "United States" appears as *plaintiff*
  (2 of 101 injunctions, both wrongly FEDERAL scope). `rulingScope`
  (`courtlistener-rulings.ts:62-73`) needs defendant-side matching, which
  requires party roles from the API, not the flat party list.
- **Duplicates**: the same ruling appears on transferred/consolidated
  dockets (Wise v. NC Board ×2, TX Alliance for Retired Americans ×2,
  DNC v. Wisconsin Legislature / DNC v. RNC overlap). Saturation caps the
  damage on exposure but resistance double-counts too.
- **Partial grants** ("granting in part") take full weight.

Net direction of these errors in 2020: they *inflate* resistance, which
*suppresses* the 2020 baseline further — compounding finding 1. The 7-case
unit fixture is too small; the misclassifications above are ready-made
fixtures.

### Other confirmations

- **Dead code path**: no event in any database carries a
  BLOCKED/ENJOINED/OVERTURNED/SUPERSEDED status (only
  ACTIVE/EXPIRED/PROPOSED occur). The `BLOCKED_STATUSES` resistance branch
  in `eventDisposition` is unexercised in practice; resistance flows
  entirely through INJUNCTION events. The §17 status-routing story in the
  methodology overstates what the pipeline does.
- **`admin.ts`**: still mounted (`elections-api/src/index.ts:37`), still on
  the legacy `multiplicativeRisk`, disabled only by unset ADMIN_TOKEN.
  Recommend deletion — it contradicts the no-manual-entry rule and is a
  standing inconsistency with the published methodology.
- **Latent cycle bug**: the House-projection query in `assess.ts:143-149`
  has no cycle filter while the races query does; any database holding two
  cycles' races would corrupt national tightness. Harmless today, cheap to
  fix.
- **Structural blind spot**: races with `projected_margin` null get
  competitiveness 0 and are invisible to the index regardless of events.
- Minor: `triggering` slices to 50 before dedup (`assess.ts:374-376`);
  `addEvidence` top-k trim can discard mid-weight candidates that would
  later rank; `assessment_changes` decay-drift growth (already in the
  handoff).

## What survived

The pipeline's engineering claims held up under inspection: append-only
assessments, evidence chains, ingestion auditing, deterministic scoring,
idempotent replay, and the language standard in the surfaces sampled. The
threshold constants, contra the handoff's worry, are not what the headline
hangs on — the status-maturity confound is.

## Priority order

1. Point-in-time statuses in the replay (breaks the headline claim until fixed).
2. Reword `backtest-2016-2024.md` and the Baseline page now — before the fix, not after.
3. Classifier: stay handling, mechanics tightening, defendant-role scope; grow fixtures from the 2020 misclassifications.
4. Delete `admin.ts`.
5. Docket dedup for consolidated/transferred cases.
