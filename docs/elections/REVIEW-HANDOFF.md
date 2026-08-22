# Critical review handoff — Election Integrity Monitor

2026-08-22. One session built the elections vertical end to end on branch
`platform-bootstrap` (all pushed; ~30 commits from `bbaf9fc` to `c1c93bc`).
This document is written for a hostile-but-fair reviewer: it says what is
claimed, where the bodies are buried, and what most deserves attack.

## What exists

- **Product**: osint.nodots.com platform (gateway + ukraine tracker +
  elections monitor), deployed locally via `docker compose` (localhost:80).
  Elections pages: Overview, Map, Races (+detail), Events, Changes,
  Baseline, Methodology. VPS deploy not yet done (`docs/elections/deploy.md`).
- **Pipeline**: fully automated, no hand-entered data (owner's hard rule).
  Sources: Federal Register (incl. public inspection), CourtListener NOS-441
  dockets + docket-entry rulings, SCOTUS opinions, OpenStates legislation,
  GDELT GKG discovery tier (material=false). Daily worker at 08:00 UTC;
  `ingestion_runs` audits everything; every event carries an evidence row.
- **Model** (methodology 2026.09.3, `packages/elections-shared/src/{risk,derivation,ratings}.ts`):
  event-signal dimensions with per-class decay → vulnerability, suppressed by
  institutional resistance (V = RawV(1−0.6D)), scaled by electoral exposure
  and active pressure (RIR = E·V·(0.35+0.65A)). Derived ratings from MEDSL
  margins + FEC incumbency. Append-only assessments; change ledger; email
  digest; 18 unit tests.
- **Backtest** (`backtest-2016-2024.md`): five historical cycles rebuilt via
  `scripts/elections/build-baseline.sh`. 2016–2022 read zero high-risk
  pivotal races throughout; 2024 briefly 3; 2026 reads 4 on matched sources
  (17–21 with OpenStates, which cannot be replayed historically).

## The claims a reviewer should try to break

1. **"2026 is anomalous."** Rests on the matched-source sensitivity run
   (`elections_sens_2026`, snapshot in `baselines.json`). Attack surfaces:
   the sensitivity was run once (2026-08-22), not continuously; RECAP
   coverage grows over time (we argue volume parity — 2020/2022 had MORE
   events — but composition-level coverage bias is unquantified); the
   high-risk (≥0.12) and pivotal (≥0.1) cutoffs are invented constants and
   the 0-vs-4 gap could be threshold-sensitive. Nobody has swept the
   thresholds.
2. **Every derivation constant is an engineering guess**: half-lives (90/120d),
   saturation K=3, resistance suppression 0.6, pressure floor 0.35, national
   spillover 0.2, case weights 0.3/0.1, tightness scale 25. Documented and
   versioned, never calibrated. The methodology doc (§43/§47) says
   calibrate; only the binary backtest has been done.
3. **Injunction handling** (`courtlistener-rulings.ts`): regex classifier for
   grant/deny (unit-tested on 7 cases only); "block ⇒ resistance" assumes
   NOS-441 injunctions run against the government actor — direction-blind,
   provably murky in 2020; nationwide-scope detection is a party-name regex
   (a federal *plaintiff* would wrongly nationalize a block — check
   `United States v. Griswold`-style cases where the US sues state officials:
   blocks in those cut the OTHER way).
4. **Pivotality is a proxy** (competitiveness × projected-House tightness),
   not the Monte Carlo the methodology doc calls for. The baseline
   projection allocates toss-ups by margin sign — defensible, crude.
5. **Ratings**: 0.7/0.3 margin blend, 3-pt open-seat shrink, no presidential
   lean, no polling; FEC leading-fundraiser candidate heuristic; 2024
   margins on CD119 lines vs mid-decade redistricting (TX/CA/etc. redrew for
   2026 — the geometry and margins are stale for those states and nothing
   flags it per-district).
6. **Language discipline** (owner-driven, commit `1fd2e52`): "threat to
   legitimate control", ordinal-not-probability everywhere, no intent
   claims. Grep-gated, but review new copy against
   `docs/specs/election-subversion.md` §24 and the methodology page's
   "What this measures" section.
7. **Coverage holes**: state courts and county actions (Cochise-class
   events) largely invisible; OpenStates is update-time-filtered (no
   history, and daily pulls only see recently-updated bills); GDELT tier is
   keyword clustering with a 2-outlet floor; digest/email path never tested
   against a real SMTP server.

## Known-untested / fragile spots

- `admin.ts` manual-entry route still exists (uses the legacy
  `multiplicativeRisk`) — contradicts the no-manual-entry stance; dormant
  (ADMIN_TOKEN unset). Decide: delete or keep.
- Weekly Sunday ratings refresh (`worker-loop.sh`) needs `RATINGS_FILE`
  mounted — never exercised in compose.
- `elections_sens_2026` DB and the five baseline DBs live only on the local
  dev postgres (port 6432 container `elections-dev`), not in the compose
  stack; `baseline:export` depends on them.
- OpenStates API key sits in gitignored `apps/elections-worker/.env` and in
  the local `.env`; must be added to the VPS env at deploy.
- assessment_changes grows ~435 rows/day (decay drift defeats the
  skip-if-unchanged check); harmless now, worth a materiality floor later.

## Where things are

Spec: `docs/specs/election-subversion.md` + `docs/specs/risk-methodology-v0.1.md`
(the owner's methodology doc; §§17–19, 28, 32, 38, 43–45 are partly or not
implemented — resistance/pressure/lifecycle/materiality/backtest are in).
Plan: `~/.claude/plans/let-s-take-a-step-fuzzy-kahan.md` (stages 3–4 remain:
Monte Carlo pivotality, event impact, scenario engine, AI triage; post-election
mode before November). Deploy: `docs/elections/deploy.md`. Roadmap state and
standing rules (no manual data entry; the language standard) are in the
project memory files.
