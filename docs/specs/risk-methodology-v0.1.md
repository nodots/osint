# Election Process Risk Assessment Methodology
## Technical Specification — v0.1

### 1. Objective

The system estimates the risk that **improper partisan use of governmental or quasi-governmental processes could materially affect the outcome of a U.S. congressional election or control of the House of Representatives**.

It does **not** estimate whether election fraud will occur.

It separately evaluates:

1. **Electoral exposure** — how close and consequential a race is.
2. **Institutional vulnerability** — what mechanisms exist through which an outcome could be affected.
3. **Operational activity** — whether those mechanisms are actually being exercised.
4. **Institutional resistance** — courts, officials, statutes, procedures, and other barriers to successful intervention.
5. **Intent evidence** — evidence that actors are attempting to use governmental authority for partisan electoral advantage.
6. **Control consequence** — whether changing the result could change control of the House.

These dimensions MUST remain independently visible.

---

# 2. Fundamental Data Rule

The system maintains four epistemically distinct object types:

```text
OBSERVATION
CLAIM
ASSESSMENT
FORECAST
```

They MUST NOT be conflated.

### Observation

An independently verifiable occurrence.

Example:

```text
DOJ filed a complaint seeking Pennsylvania voter-registration records.
```

### Claim

An assertion made by an actor or source.

Example:

```text
DOJ states that federal law requires Pennsylvania to provide those records.
```

A claim is not automatically treated as fact merely because a government agency made it.

### Assessment

An analytical conclusion derived from observations.

Example:

```text
The litigation increases potential federal voter-roll leverage in Pennsylvania.
```

### Forecast

A probabilistic or categorical estimate concerning an election.

Example:

```text
Cook Political Report rates PA-07 Toss-up.
```

Every displayed analytical conclusion MUST ultimately be traceable to observations and sources.

---

# 3. Unit of Analysis

The principal unit is:

```text
Election × Congressional District
```

Example:

```text
2026 General Election × TX-34
```

Supporting assessments also exist at:

```text
Federal
State
County
House-control
```

State and federal conditions propagate to affected races.

---

# 4. Overall Model

Do NOT generate one monolithic score directly.

Calculate three principal components:

```text
E = Electoral Exposure
V = Process Vulnerability
A = Active Intervention Pressure
```

Then calculate:

```text
Race Intervention Relevance (RIR)
```

using those components.

Separately calculate:

```text
House Control Risk (HCR)
```

from the collection of race-level assessments.

---

# 5. Electoral Exposure (E)

Electoral Exposure answers:

> If something changed the legitimate outcome of this race, how important would that be?

It contains two components:

```text
C = Competitiveness
P = House-control pivotality
```

Both normalized to:

```text
0.00 – 1.00
```

---

# 6. Competitiveness (C)

Competitiveness estimates the probability that the legitimate race margin is sufficiently small for administrative/legal intervention to matter.

Inputs may include:

- Cook Political Report
- Sabato's Crystal Ball
- Inside Elections
- district polling
- polling aggregates
- historical district performance
- special-election performance
- generic ballot environment
- incumbent status

Do NOT silently average categorical forecasts.

Preserve each source independently.

Example:

```text
TX-34

Cook:       Toss-up
Sabato:     Lean D
Inside:     Toss-up
Polling:    D +1.2
```

A consensus model can then derive `C`.

### Initial categorical defaults

Until a probabilistic model exists:

```text
Solid       0.05
Likely      0.20
Lean        0.50
Tilt        0.70
Toss-up     0.90
```

These values are methodological parameters and MUST be versioned.

Polling can adjust the categorical baseline.

---

# 7. House-Control Pivotality (P)

Pivotality measures:

> How frequently would changing this district's result change which party controls the House?

Preferred implementation: Monte Carlo.

For each simulation:

```text
1. Sample winner of every House race.
2. Determine House majority.
3. Reverse target district result.
4. Determine House majority again.
5. If majority changes, mark district pivotal.
```

Then:

```text
P = pivotal simulations / total simulations
```

Example:

```text
TX-34 pivotal in 17,482 of 100,000 simulations

P = 0.17482
```

This is much more useful than simply asking whether a race is close.

A Toss-up is irrelevant to chamber control if one party is projected to win 245 seats.

---

# 8. Process Vulnerability (V)

Process Vulnerability answers:

> Assuming an actor wanted to improperly affect this election, how exposed is the race to mechanisms capable of doing so?

It is composed of independent dimensions.

Initial dimensions:

```text
F = Federal leverage
S = State cooperation
R = Voter-registration/roll exposure
B = Ballot-access/counting exposure
L = Litigation exposure
C = Certification exposure
Q = Recount/audit exposure
H = Congressional-contest exposure
```

Each:

```text
0.00 – 1.00
```

Do not hide these behind the aggregate score.

---

# 9. Federal Leverage (F)

Measures the degree to which federal institutions currently possess actionable mechanisms affecting election administration.

Possible indicators:

```text
DOJ voter-data access
DHS/SAVE access
USPS ballot-related authority
federal investigations
federal directives
federal funding leverage
active federal litigation
federal law-enforcement involvement
```

Scoring must reflect **current operational authority**, not merely requested authority.

Example:

```text
DOJ requests records           + exposure
State refuses                  no operational access
District court blocks DOJ      exposure decreases
Appeal pending                 residual exposure remains
SCOTUS permits access          major increase
```

---

# 10. State Cooperation (S)

Measures willingness and institutional ability of state government to implement relevant federal initiatives or partisan election-administration actions.

Evidence may include:

- executed data-sharing agreements
- voluntary compliance with federal requests
- implementation of citizenship checks
- state litigation seeking federal authority
- executive directives
- election-board actions
- statutory changes

Party control alone MUST NOT determine this score.

For example:

```text
Republican trifecta ≠ automatically high cooperation
```

Actual behavior controls the assessment.

---

# 11. Voter-Roll Exposure (R)

Relevant mechanisms:

- voter-file transfers
- mass citizenship matching
- voter challenges
- systematic removals
- database matching
- SAVE queries
- registration deadlines
- list-maintenance actions

Important distinction:

```text
potential database match
≠
confirmed ineligible voter
```

Systems MUST preserve this distinction.

Risk increases when:

- actions occur close to Election Day
- matching produces known false positives
- cure procedures are weak
- affected population is large relative to expected margin
- actions disproportionately affect the competitive district

---

# 12. Ballot Exposure (B)

Includes:

```text
mail ballot rules
ballot receipt deadlines
signature matching
ID requirements
ballot cure
provisional ballots
early voting
drop boxes
USPS handling
ballot rejection standards
counting procedures
```

Magnitude matters.

An administrative rule potentially affecting 40 ballots in a race expected to have a 30,000-vote margin should have negligible consequence.

The same rule potentially affecting 8,000 ballots in a race expected to have a 1,000-vote margin is material.

---

# 13. Litigation Exposure (L)

Evaluate:

```text
number of relevant active cases
procedural stage
jurisdiction
precedent
requested remedy
scope
likelihood of resolution before election
potential number of affected voters/ballots
```

Do NOT count lawsuits equally.

A dismissed district-court complaint contributes almost nothing.

An emergency application pending before SCOTUS seeking relief applicable to millions of ballots contributes substantially more.

---

# 14. Certification Exposure (C)

Evaluate whether officials possess practical or asserted ability to delay/refuse certification.

Inputs:

- statutory certification duties
- discretionary authority
- history of refusal
- current officeholders
- judicial precedent
- enforcement mechanisms
- deadlines
- state-level certification procedures

Important:

A historical certification dispute increases evidence of potential friction but does not necessarily imply current legal authority to refuse certification.

---

# 15. Recount/Audit Exposure (Q)

Relevant factors:

```text
automatic recount threshold
candidate-requested recount availability
audit procedures
who controls recount administration
historical disputes
chain-of-custody protections
judicial oversight
```

Recounts themselves are normal democratic processes.

The risk variable concerns **opportunity for improper intervention**, not the existence of a recount.

---

# 16. Congressional Contest Exposure (H)

Article I, Section 5 gives each chamber authority to judge the elections and returns of its members.

Relevant inputs:

```text
expected House composition
Federal Contested Elections Act procedures
candidate willingness to contest
state certification status
margin
available factual predicate
House organizational circumstances
```

This dimension should remain low before an actual close result exists.

It becomes important after Election Day.

---

# 17. Institutional Resistance (D)

This is a critical negative component.

Earlier versions of the methodology understated it.

Evaluate:

```text
adverse court rulings
mandatory statutory duties
independent election officials
state refusal
bipartisan election boards
judicial review
procedural safeguards
federalism
administrative incapacity
time remaining
```

Normalize:

```text
D = 0.00 – 1.00
```

where:

```text
0 = little meaningful resistance
1 = extremely strong resistance
```

Process Vulnerability therefore should resemble:

```text
RawV =
    wF*F +
    wS*S +
    wR*R +
    wB*B +
    wL*L +
    wC*C +
    wQ*Q +
    wH*H
```

followed by:

```text
V = RawV × (1 - kD*D)
```

where `kD` controls how strongly institutional resistance suppresses vulnerability.

Do not permanently hard-code weights.

Store them in a methodology version.

---

# 18. Active Intervention Pressure (A)

This dimension distinguishes:

> A mechanism exists

from:

> Someone is actively trying to use it.

Inputs include documented:

```text
lawsuits
directives
data requests
regulatory actions
administrative rules
investigations
official threats
funding threats
requests to election officials
state implementation actions
```

Score based on:

### Scope

How many voters/races could be affected?

### Immediacy

Is implementation possible before the election?

### Authority

Does the actor actually possess the relevant power?

### Persistence

Is the action being pursued after judicial/administrative resistance?

### Specificity

Is it general policy or directed toward election administration?

---

# 19. Intent Evidence

Intent MUST be displayed separately from vulnerability.

Suggested classification:

```text
NONE
WEAK
MODERATE
STRONG
EXPLICIT
```

Examples:

### Weak

Partisan official supports a generally advantageous election rule.

### Moderate

Officials repeatedly pursue mechanisms whose predictable electoral effects favor their party.

### Strong

Internal documents or repeated public statements connect governmental action to partisan electoral objectives.

### Explicit

An authoritative actor explicitly states that governmental action is intended to alter partisan electoral outcomes.

Do not infer intent solely from effect.

This field is especially important for credibility.

---

# 20. Evidence Confidence

Every event and assessment receives confidence:

```text
0.00 – 1.00
```

Suggested display:

```text
0.90–1.00   Very High
0.75–0.89   High
0.50–0.74   Medium
0.25–0.49   Low
0.00–0.24   Very Low
```

Confidence considers:

```text
primary documentation
number of independent sources
source reliability
factual dispute
recency
specificity
corroboration
```

Confidence MUST NOT mean probability that an intervention succeeds.

It means confidence in the underlying assessment.

---

# 21. Race Intervention Relevance

An initial formulation:

```text
E = f(C, P)

RIR = V × A × E
```

However, avoid making `A = 0` completely erase structural vulnerability.

A better implementation may be:

```text
RIR =
  E × V × (0.35 + 0.65A)
```

This means a highly vulnerable pivotal race retains some baseline concern even before an active intervention appears.

Exact coefficients require calibration.

The application MUST expose:

```text
Competitiveness
Pivotality
Vulnerability
Active pressure
Resistance
Intent evidence
Confidence
```

alongside the aggregate.

---

# 22. Do Not Confuse Score With Probability

If:

```text
TX-34 Risk = 78/100
```

that MUST NOT mean:

> There is a 78% probability TX-34 will be improperly altered.

It means:

> TX-34 ranks very highly on the defined election-process risk indicators.

Use terminology such as:

```text
Risk Index
Vulnerability Index
Intervention Relevance
```

Never:

```text
Probability of theft
Chance of rigging
```

unless a genuinely calibrated probabilistic model eventually exists.

---

# 23. Event Impact

Every material event should generate explicit proposed changes.

Example:

```text
EVENT:
Federal court blocks DOJ voter-file demand.

Affected:
Pennsylvania

Modifiers:

Federal leverage       -0.12
Voter-roll exposure    -0.08
Institutional resistance +0.15
```

Affected races inherit the state change:

```text
PA-07
PA-08
PA-10
```

Before committing the new assessment, store:

```text
previous_score
new_score
delta
event_id
methodology_version
```

This makes the historical risk graph fully auditable.

---

# 24. Materiality

Not every election story should become an event.

An event is **material** when it changes at least one of:

```text
legal authority
administrative capability
number of affected voters
timing
institutional resistance
race competitiveness
House pivotality
credible evidence of intent
```

Examples of non-material events:

```text
campaign rhetoric with no governmental action
ordinary endorsements
generic allegations without evidence
routine election administration
poll movement within noise
```

These may be stored as intelligence but should not trigger risk changes.

---

# 25. Event Lifecycle

Events may change status.

Example:

```text
Aug 01
DOJ files suit
ACTIVE

Aug 08
District court dismisses
BLOCKED

Aug 12
DOJ appeals
ACTIVE_APPEAL

Aug 20
Circuit court affirms
BLOCKED

Sep 02
SCOTUS emergency application
PENDING_SCOTUS
```

Do NOT create unrelated events that lose this causal history.

Maintain relationships:

```text
parent_event_id
supersedes_event_id
related_case_id
```

---

# 26. Temporal Decay

Some events should lose relevance over time.

For example:

A January proposal that was never implemented should contribute less in October.

An injunction currently controlling election procedures should not decay.

Each modifier therefore needs:

```text
decay_type:
  NONE
  LINEAR
  EXPONENTIAL
  UNTIL_EVENT
  UNTIL_DATE
```

Examples:

```text
Court injunction:
NONE until overturned

Public threat:
EXPONENTIAL

Proposed regulation:
LINEAR unless advanced

Implemented rule:
NONE while effective
```

---

# 27. Geographic Propagation

Events apply at different geographic levels.

Example:

```text
USPS rule
    ↓
all states
    ↓
all districts
```

But magnitude varies by local conditions:

```text
national modifier
×
state mail-voting dependence
×
district competitiveness
```

Likewise:

```text
Texas voter-roll action
    ↓
Texas
    ↓
TX districts
```

A county-level action should affect only districts overlapping that county.

PostGIS can resolve overlap.

---

# 28. Population-at-Risk Scaling

Whenever possible estimate:

```text
Affected Voters / Expected Margin
```

Define:

```text
Impact Ratio =
estimated potentially affected ballots
/
expected absolute vote margin
```

Example:

```text
Potentially affected ballots: 5,000
Expected margin:               1,200

Impact Ratio = 4.17
```

This should substantially increase materiality.

Contrast:

```text
Potentially affected ballots: 500
Expected margin:              40,000

Impact Ratio = 0.0125
```

Minimal electoral consequence.

Use ranges when precise numbers aren't available.

---

# 29. Pre-Election vs Post-Election Modes

The methodology changes after voting.

## Pre-election

Weight heavily:

```text
registration
ballot access
administrative rules
federal/state authority
competitiveness
pivotality
```

## Voting/counting period

Increase weight on:

```text
ballot rejection
provisional ballots
mail ballots
counting procedures
law enforcement
emergency litigation
```

## Post-election

Weight heavily:

```text
actual margin
uncounted ballots
rejected ballots
recount
litigation
certification
congressional contests
```

At this point polling becomes nearly irrelevant.

---

# 30. Actual-Margin Model

Once sufficient votes are counted, replace forecast competitiveness with:

```text
M = Actual Margin Exposure
```

Potential formulation:

```text
M = min(
  1,
  unresolved_or_disputed_ballots
  /
  absolute_current_margin
)
```

with appropriate handling for incomplete counts.

The exact implementation should model uncertainty rather than blindly use this ratio.

---

# 31. House Control Risk

Race scores alone don't answer the strategic question.

Calculate:

```text
HCR = probability-weighted concentration
      of high-risk pivotal races
```

A first deterministic implementation can classify:

### LOW

Expected majority exceeds plausible number of materially exposed races.

### MODERATE

Several exposed races could substantially reduce the expected majority.

### HIGH

Control plausibly depends on exposed races.

### CRITICAL

Current/provisional House control depends directly upon one or more races experiencing material intervention.

This should eventually become simulation-based.

---

# 32. Counterfactual House Simulation

For each simulation:

```text
1. Generate legitimate House result.

2. Identify races with material intervention exposure.

3. Generate counterfactual outcomes in which exposed races change.

4. Determine whether House control changes.
```

Output:

```text
Baseline Democratic House probability: 76%

House probability after modeled
process-risk scenarios: 69%

Difference: -7 percentage points
```

This should NOT be implemented until intervention-effect assumptions can be responsibly calibrated.

Until then, use pivotality rather than pretending to know the probability that intervention succeeds.

---

# 33. Analyst Overrides

Automated scoring should permit analyst overrides, but never silently.

```ts
AnalystOverride {
  assessmentId
  dimension
  computedValue
  overrideValue
  rationale
  analystId
  createdAt
}
```

UI:

```text
Litigation Exposure

Computed: 0.71
Analyst:  0.55

Reason:
Injunction requested would not affect ballots in this district.

[View evidence]
```

---

# 34. Methodology Versioning

Every assessment records:

```text
methodology_version
```

Example:

```text
2026.08.1
```

Methodology table:

```ts
Methodology {
  version
  effectiveAt

  weights JSONB
  categoricalMappings JSONB
  decayParameters JSONB

  description
  changelog
}
```

Historical scores MUST remain reproducible under the methodology that generated them.

Do not rewrite historical scores when methodology changes.

---

# 35. Source Hierarchy

Preferred evidentiary hierarchy:

### Tier 1

```text
court opinions/orders
statutes
regulations
official election data
government contracts/agreements
official correspondence
```

### Tier 2

```text
Reuters
Associated Press
other high-quality original reporting
```

### Tier 3

Specialist organizations with transparent sourcing:

```text
Brennan Center
Democracy Docket
Voting Rights Lab
Protect Democracy
state/local election specialists
```

These organizations may have viewpoints. Their factual work can nevertheless be excellent.

### Tier 4

```text
national/local media
academic analysis
recognized election experts
```

### Tier 5

```text
campaign statements
partisan organizations
social media
anonymous claims
```

Lower-tier sources can generate discovery events.

They should rarely establish high-confidence facts without corroboration.

---

# 36. Forecast Sources

Current preferred baseline:

```text
Cook Political Report
Sabato's Crystal Ball
Inside Elections
credible district polling
special-election performance
generic-ballot aggregates
```

Store individual forecasts.

Do not create an artificial consensus by averaging labels without methodology.

Do not treat any individual forecaster as authoritative.

---

# 37. Required Explanation

Every risk assessment exposed through the API should support:

```ts
GET /race/TX-34/risk/explanation
```

returning conceptually:

```json
{
  "overall": 0.78,
  "level": "HIGH",
  "drivers": [
    {
      "dimension": "stateCooperation",
      "value": 0.91,
      "evidence": ["event-123", "event-141"]
    },
    {
      "dimension": "voterRollExposure",
      "value": 0.84,
      "evidence": ["event-155"]
    }
  ],
  "mitigations": [
    {
      "dimension": "institutionalResistance",
      "value": 0.42,
      "evidence": ["case-81"]
    }
  ],
  "confidence": 0.82,
  "methodologyVersion": "2026.08.1"
}
```

No unexplained score should appear in the public product.

---

# 38. Change Detection

The system should calculate:

```text
Δ Risk
Δ Pivotality
Δ Competitiveness
Δ Resistance
Δ Active Pressure
```

between snapshots.

A notification is generated only when:

```text
abs(Δ overall) >= threshold
```

OR:

```text
new major government action
new major court ruling
race rating crosses threshold
House pivotality crosses threshold
intent evidence changes classification
```

This implements the principle:

> Notify only when something meaningful changes.

---

# 39. Risk Levels

Suggested initial display thresholds:

```text
0–19     MINIMAL
20–39    LOW
40–59    MODERATE
60–74    HIGH
75–100   VERY HIGH
```

These are ordinal categories, **not probabilities**.

Avoid alarmist colors/language where possible.

---

# 40. Audit Trail

Every intelligence object should preserve:

```text
created_at
created_by
updated_at
updated_by
source
previous_version
```

Never silently delete material events.

Use:

```text
RETRACTED
SUPERSEDED
CORRECTED
```

and preserve the original.

---

# 41. AI Role

AI is useful for:

```text
source discovery
document classification
entity extraction
event extraction
deduplication
case linking
jurisdiction extraction
summarization
candidate materiality detection
suggested risk modifiers
contradiction detection
```

AI MUST NOT autonomously publish:

```text
intent determinations
high-impact risk changes
claims of illegal conduct
claims that an election was manipulated
```

Those require deterministic rules and/or analyst approval.

The two DGX Sparks would be ideal for this ingestion/triage layer.

---

# 42. AI Extraction Pipeline

Suggested:

```text
SOURCE
   │
   ▼
fetch/archive
   │
   ▼
text extraction
   │
   ▼
dedupe
   │
   ▼
document classifier
   │
   ▼
entity extraction
   │
   ▼
candidate event
   │
   ▼
source corroboration search
   │
   ▼
candidate modifiers
   │
   ▼
ANALYST REVIEW
   │
   ▼
publish
   │
   ▼
risk recalculation
```

Store the model name/version and extraction prompt with every AI-generated candidate.

---

# 43. Validation / Backtesting

Before trusting weights, backtest against prior elections.

Useful cases:

```text
2020 presidential certification disputes
2022 Cochise County certification dispute
2022 close House races
2024 North Carolina Supreme Court election dispute
historical House election contests
```

Ask:

> Would the system have identified vulnerability *before* the dispute became obvious?

Also test false positives:

> Did it rate ordinary close elections as dangerously vulnerable when nothing unusual occurred?

Both matter.

---

# 44. Anti-Bias Test

Periodically run the model with partisan identities hidden.

Analyst sees:

```text
Party A
Party B
State X
Agency Y
```

and evaluates evidence.

Compare with normal assessment.

Large systematic differences indicate methodological contamination.

Also test mirrored hypotheticals:

> Would the exact same governmental action receive the same vulnerability modifier if undertaken by a Democratic administration?

The answer should be yes.

---

# 45. Public Methodology Requirement

Publish enough information that a hostile but competent critic can reproduce the score.

That means publishing:

```text
dimensions
definitions
weights
major modifiers
source hierarchy
confidence methodology
version history
known limitations
```

The project gains credibility from being attackable.

---

# 46. Core Product Output

The application should ultimately answer four questions:

### 1. What happened?

Evidence-backed event timeline.

### 2. What mechanisms does it affect?

Voter rolls, ballots, litigation, certification, etc.

### 3. Which races does that matter to?

Geographic + electoral propagation.

### 4. Could those races change control of the House?

Pivotality.

The fourth question is the differentiator.

---

# 47. Current Conceptual Formula

For implementation purposes, begin with:

```text
C = competitiveness
P = pivotality

F = federal leverage
S = state cooperation
R = voter-roll exposure
B = ballot exposure
L = litigation exposure
T = certification exposure
Q = recount exposure
H = congressional-contest exposure

D = institutional resistance
A = active intervention pressure
```

Then:

```text
RawV =
  wF F +
  wS S +
  wR R +
  wB B +
  wL L +
  wT T +
  wQ Q +
  wH H
```

```text
V = RawV × (1 - kD D)
```

Electoral exposure:

```text
E = f(C, P)
```

Initial candidate:

```text
E = 0.5C + 0.5P'
```

where `P'` is appropriately normalized because raw pivotality probabilities may be numerically small.

Then:

```text
RIR = E × V × (0.35 + 0.65A)
```

Normalize to:

```text
0–100
```

### Important

Those coefficients are **initial engineering hypotheses**, not empirically validated constants.

They belong in configuration.

---

# 48. What the Model Should Say Today

A race might produce:

```text
TX-34

Intervention Relevance       78 / VERY HIGH
Confidence                   HIGH

Electoral
Competitiveness              91
House pivotality             76

Institutional
Federal leverage             82
State cooperation            91
Voter-roll exposure          84
Ballot exposure              57
Litigation exposure          63
Certification exposure       31
Recount exposure             44
House-contest exposure       22

Active intervention pressure 76

Institutional resistance     39

Intent evidence              STRONG
```

Then immediately below:

```text
WHY?

↑ Texas supplied voter data to DOJ
↑ State uses federal citizenship-verification systems
↑ Race currently rated Toss-up
↑ District increasingly pivotal to House control

↓ Courts have constrained several federal voter-data theories
↓ Certification authority is relatively constrained

Last material change:
August 22, 2026
```

That explanatory block is more important than `78`.

---

# 49. Design Principle

The application should make it difficult for **us** to bullshit ourselves.

Every alarming conclusion should invite the question:

> Show me the evidence.

Every score should answer:

> Why?

Every change should answer:

> What changed?

Every prediction should answer:

> How uncertain?

Every allegation should answer:

> Who alleges it?

And every district should answer the strategic question:

> **Even if this intervention succeeded, could it actually change control of the House?**

That is the methodology.