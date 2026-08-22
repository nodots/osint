# Election Integrity / Subversion Tracker
## Extension Spec for the Nodots OSINT Platform

### 1. Purpose

Add a U.S. election-integrity vertical to the existing Nodots OSINT family, modeled primarily on the **Ukraine war tracker’s intelligence-analysis workflow** and secondarily on the naval tracker’s known technical architecture.

The product should answer one question unusually well:

> **Can documented government actions, litigation, administrative changes, or post-election processes plausibly change which party controls the U.S. House?**

This is not primarily an election-forecasting product and should not become another polling dashboard. Election forecasts are an input.

The core product is an **evidence-backed threat assessment of the election process**, operating at district, state, federal, and House-control levels.

---

## 2. Product Positioning

Working public name:

**Election Integrity Monitor**

Internal/domain terminology can be more explicit:

**Election Subversion Risk**

Recommended host:

`elections.osint.nodots.com`

Alternative:

`osint.nodots.com/elections`

### Recommendation

Use a **separate host backed by the same application/platform**.

That gives the election tracker its own identity and URL surface while preserving:

- common deployment
- common auth/admin
- common source registry
- common ingestion infrastructure
- common provenance system
- common map components
- common event/timeline primitives
- shared database infrastructure where useful

Conceptually:

```text
osint.nodots.com
    Ukraine tracker

naval.osint.nodots.com
    Naval tracker

elections.osint.nodots.com
    Election Integrity Monitor
```

These should increasingly be understood as **verticals of one OSINT platform**, not three unrelated applications.

---

# 3. Governing Principle

The most important architectural rule:

> **Facts, claims, and assessments are different objects.**

The system must never collapse these together.

Example:

### Fact

DOJ filed suit against Pennsylvania seeking voter-registration records on August 4.

### Claim

DOJ alleges that federal law entitles it to those records.

### Assessment

The lawsuit increases federal administrative leverage over PA-07 by 3 points.

Those are three different things and must remain independently inspectable.

A user should always be able to answer:

- What happened?
- Who says it happened?
- What is the primary evidence?
- How confident are we?
- Why does it matter?
- Which risk score changed because of it?
- Who or what produced that assessment?

---

# 4. Domain Model

The election vertical should introduce these major entities.

## Election

Represents an electoral event.

```ts
Election {
  id
  type: "HOUSE" | "SENATE" | "PRESIDENTIAL"
  cycle: 2026
  electionDate
  status
}
```

MVP supports House only, but don't encode that assumption deeply.

---

## District

```ts
District {
  id
  state
  districtNumber
  displayName        // "TX-34"
  geometry           // PostGIS polygon
  currentMember
  incumbentParty
  cookPvi?
  population?
}
```

Congressional district geometries should come from an authoritative public dataset and be versioned by cycle/map.

---

## Race

A contest within an election/district.

```ts
Race {
  id
  electionId
  districtId

  democraticCandidate
  republicanCandidate

  incumbentParty

  rating
  ratingSource
  ratingUpdatedAt

  projectedMargin?
  pollingMargin?
  actualMargin?

  status:
    "PRE_PRIMARY"
    | "GENERAL"
    | "VOTING"
    | "COUNTING"
    | "RECOUNT"
    | "CONTESTED"
    | "CERTIFIED"
    | "SEATED"
}
```

---

# 5. Event Model

This is the central intelligence object.

```ts
ElectionEvent {
  id

  occurredAt
  discoveredAt
  updatedAt

  jurisdictionType:
    "FEDERAL"
    | "STATE"
    | "COUNTY"
    | "DISTRICT"

  jurisdictionIds[]

  eventType

  actorIds[]
  targetIds[]

  title
  summary

  factualStatus:
    "CONFIRMED"
    | "REPORTED"
    | "ALLEGED"
    | "DISPUTED"
    | "RETRACTED"

  operationalStatus:
    "PROPOSED"
    | "ACTIVE"
    | "BLOCKED"
    | "ENJOINED"
    | "OVERTURNED"
    | "SUPERSEDED"
    | "EXPIRED"

  confidence

  sourceIds[]

  affectedRaceIds[]
  affectedMechanisms[]

  rawData JSONB
}
```

---

# 6. Event Taxonomy

Initial taxonomy:

```text
VOTER_REGISTRATION
VOTER_ROLL_ACCESS
VOTER_ROLL_PURGE
CITIZENSHIP_VERIFICATION

BALLOT_ACCESS
MAIL_BALLOT_RULE
EARLY_VOTING_RULE
PROVISIONAL_BALLOT_RULE
BALLOT_CURE_RULE
BALLOT_REJECTION

ELECTION_ADMINISTRATION
FEDERAL_DATA_REQUEST
FEDERAL_DIRECTIVE
STATE_DIRECTIVE
COUNTY_ACTION

REDISTRICTING

LITIGATION_FILED
COURT_RULING
APPEAL
INJUNCTION
SCOTUS_ACTION

RECOUNT
AUDIT
CERTIFICATION
CERTIFICATION_REFUSAL

CANDIDATE_CONTEST
HOUSE_ELECTION_CONTEST
SEATING_DISPUTE

LAW_ENFORCEMENT_ACTION
FEDERAL_INVESTIGATION

PUBLIC_THREAT
PUBLIC_DIRECTIVE
POLITICAL_PRESSURE
```

The taxonomy must support multiple tags because a single event can belong to several categories.

---

# 7. Sources and Provenance

This should probably become a **platform-level abstraction shared with the Ukraine tracker**.

```ts
Source {
  id
  name
  organization
  url
  type:
    "PRIMARY_GOVERNMENT"
    | "COURT_DOCUMENT"
    | "CAMPAIGN"
    | "ACADEMIC"
    | "NEWS"
    | "NGO"
    | "ANALYST"
    | "SOCIAL"
    | "OTHER"

  reliabilityBaseline?
}
```

Individual evidence objects:

```ts
Evidence {
  id
  sourceId
  eventId

  url
  title
  publishedAt
  retrievedAt

  excerpt?
  archiveUrl?
  documentHash?

  primarySource: boolean

  analystNotes?
}
```

### Source preference

For legal/government actions:

1. actual court opinion/order
2. docket
3. DOJ/state election office/USPS/etc.
4. Reuters/AP
5. specialist election-law reporting
6. advocacy groups
7. commentary/social media

Advocacy groups can be excellent discovery sources but shouldn't automatically become the canonical evidence when the underlying filing exists.

---

# 8. Risk Model

Do **not** begin with one opaque 0–100 AI-generated score.

Store independent dimensions.

Each competitive race gets:

```ts
RaceRiskAssessment {
  raceId
  assessedAt

  competitiveness
  pivotality

  federalLeverage
  stateCooperation
  administrativeExposure
  voterRollExposure
  ballotExposure
  litigationExposure
  certificationExposure
  recountExposure
  congressionalContestExposure

  overallRisk

  confidence

  explanations[]
  triggeringEventIds[]

  methodologyVersion
}
```

Each dimension should initially be normalized to `0–1` or `0–100`.

---

# 9. Core Risk Formula

The central conceptual distinction is:

### Vulnerability

How susceptible is this race to intervention?

versus

### Consequence

Could changing this race alter House control?

A useful first model:

```text
Process Vulnerability =
    federal leverage
  + state cooperation
  + administrative exposure
  + legal exposure
  + post-election exposure
```

weighted appropriately.

Then:

```text
Race Subversion Risk =
    Process Vulnerability
  × Competitiveness
  × Pivotality
```

This multiplicative structure matters.

A deeply vulnerable district that Republicans will win by 25 points doesn't matter.

A 50/50 race in an institutionally robust state may be electorally pivotal but relatively hard to manipulate.

A vulnerable 50/50 district that determines seat 218 is the problem.

---

# 10. Pivotality

This may become the product's most distinctive feature.

For every simulation or forecast snapshot, calculate:

> How often does control of the House depend upon this district?

Example:

```text
PA-07

Competitive probability:     54%
Dem win probability:          52%
House-control pivotality:     18%
Process vulnerability:        61/100

Subversion relevance:         HIGH
```

Pivotality should increase dramatically as the House battlefield narrows.

By late October, this becomes far more valuable than generic race ratings.

---

# 11. House-Level Assessment

Primary dashboard card:

```text
HOUSE CONTROL

Baseline projection:
D 224 — R 211

Seats required to alter control:
7

High-risk contests:
4

High-risk contests capable of changing control:
1

Election-process threat to House control:
LOW

Confidence:
MEDIUM
```

Contrast with:

```text
HOUSE CONTROL

Baseline projection:
D 220 — R 215

Seats required to alter control:
3

High-risk contests:
6

High-risk contests capable of changing control:
5

Election-process threat to House control:
HIGH

Confidence:
MEDIUM-HIGH
```

That is the product.

---

# 12. Timeline / Risk History

Borrow heavily from the Ukraine tracker conceptually.

Every race should have a historical risk line:

```text
TX-34

Aug 02   61
Aug 07   66
Aug 11   59
Aug 19   68
Aug 22   74
```

Clicking any change shows:

```text
+7

Texas voter-file agreement implemented.

Affected dimensions:
Federal leverage       +3
State cooperation      +2
Voter-roll exposure    +2

Sources:
[DOJ agreement]
[Texas SOS]
[Reuters]
```

Every score change must be explainable.

---

# 13. Map

PostGIS makes the election vertical a natural fit.

Default view:

**U.S. congressional district map**

District fill should support switchable layers:

- race competitiveness
- process vulnerability
- subversion relevance
- pivotality
- incumbent party
- control probability

Click district:

```text
TX-34
TOSS-UP

Baseline:
D +0.8

Process Vulnerability:
78 / HIGH

Pivotality:
22%

Subversion Relevance:
VERY HIGH

Last material event:
Texas voter-registration data action
Aug 19

[View race intelligence]
```

---

# 14. State-Level Intelligence

State pages matter because many intervention mechanisms operate statewide.

Example:

```text
TEXAS

Election administration:
Republican controlled

DOJ voter-data status:
COMPLIANT

SAVE:
ACTIVE

Relevant litigation:
4 active
2 resolved

Mail-voting exposure:
MEDIUM

Certification exposure:
LOW

Competitive House races:
TX-15
TX-28
TX-34

Overall process vulnerability:
HIGH
```

State conditions propagate into district risk assessments.

---

# 15. Actor Model

Useful shared OSINT abstraction:

```ts
Actor {
  id
  type:
    "FEDERAL_AGENCY"
    | "STATE_AGENCY"
    | "COURT"
    | "OFFICIAL"
    | "CAMPAIGN"
    | "PARTY"
    | "NGO"
    | "OTHER"

  name
  jurisdiction?
}
```

Examples:

```text
Department of Justice
Department of Homeland Security
USPS
Texas Secretary of State
Maricopa County Board of Supervisors
U.S. Supreme Court
Republican National Committee
Democratic National Committee
```

---

# 16. Litigation Model

Litigation needs first-class treatment.

```ts
Case {
  id
  name
  docketNumber
  court
  jurisdiction

  filedAt
  status

  plaintiffs[]
  defendants[]

  affectedMechanisms[]
  affectedStates[]
  affectedRaceIds[]

  latestRulingId?
}
```

```ts
CourtAction {
  id
  caseId

  date
  type:
    "FILING"
    | "ORDER"
    | "OPINION"
    | "INJUNCTION"
    | "STAY"
    | "APPEAL"
    | "CERT_GRANTED"
    | "CERT_DENIED"

  outcome

  sourceId
}
```

This will become especially important from September onward.

---

# 17. Forecast Data

Forecasting is an **input layer**, not the product.

Support adapters for:

```text
Cook Political Report
Sabato's Crystal Ball
Inside Elections

Polling averages where reliable
Individual district polls
Special-election results
Generic ballot aggregates
```

And explicitly:

**Do not privilege Nate Silver / FLIPR as a canonical source.**

Forecast source disagreement should be preserved rather than averaged away blindly.

Example:

```text
PA-07

Cook:        Toss-up
Sabato:      Toss-up
Inside:      Tilt R
Polling avg: D +0.3

Consensus competitiveness:
0.93
```

---

# 18. OSINT Ingestion

Three levels.

### Level 1 — manual analyst entry

Absolutely acceptable for MVP.

Admin UI:

```text
Add event
Attach source
Select actors
Select jurisdictions
Select affected mechanisms
Select affected races
Set factual status
Set confidence
Preview risk impact
Publish
```

This could support the project surprisingly far.

### Level 2 — feed-assisted discovery

Workers ingest candidate items from:

- DOJ press releases
- federal court feeds/dockets where available
- state election offices
- state attorneys general
- USPS
- DHS
- Reuters/AP
- Brennan Center
- Democracy Docket
- Voting Rights Lab
- election-law feeds

Items enter an **analyst review queue**.

### Level 3 — AI-assisted extraction

LLM extracts proposed structured event:

```json
{
  "actor": "Department of Justice",
  "eventType": "VOTER_ROLL_ACCESS",
  "jurisdiction": ["Pennsylvania"],
  "status": "ACTIVE",
  "summary": "...",
  "affectedMechanisms": ["VOTER_REGISTRATION"],
  "confidence": 0.94
}
```

Human approves before publication.

Do not permit autonomous intelligence conclusions in the initial version.

---

# 19. Assessment Engine

Keep deterministic scoring separate from narrative analysis.

```text
event
   ↓
mechanism modifiers
   ↓
state vulnerability
   ↓
district vulnerability
   ↓
race competitiveness
   ↓
House pivotality
   ↓
overall assessment
```

LLMs can generate explanations **after** the calculation.

Not the other way around.

---

# 20. Confidence

Every major object should carry confidence.

Suggested labels:

```text
VERY LOW
LOW
MEDIUM
HIGH
VERY HIGH
```

But expose why.

Example:

```text
Confidence: HIGH

Primary court order available
Two independent reports
No material factual dispute
```

versus:

```text
Confidence: LOW

Single anonymous-source report
No primary documentation located
Government denies allegation
```

---

# 21. UI

Top nav:

```text
Overview
Map
Races
States
Events
Litigation
Actors
Methodology
Sources
```

Homepage should lead with **analysis, not feeds**.

Top:

```text
2026 HOUSE ELECTION PROCESS RISK

Expected House:
D 223–226

Control threat:
MODERATE

High-relevance districts:
5

Last meaningful change:
TX-34 ↑
2 hours ago
```

Then:

```text
[US Map]

High Priority
TX-34      81
IA-01      76
IA-03      74
OH-09      73
OH-07      70
```

Then:

```text
Latest Material Events
```

Not every news item.

Only things that alter the threat model.

---

# 22. Race Detail Page

Example:

```text
TX-34

Election
--------
Cook              Toss-up
Polling            D +0.7
Incumbent          Democrat

Threat
------
Process vulnerability        81 HIGH
House pivotality              19%
Subversion relevance          VERY HIGH

Drivers
-------
State cooperation             HIGH
Federal leverage              HIGH
Voter-roll exposure           HIGH
Mail ballot exposure          MEDIUM
Litigation exposure           MEDIUM
Certification exposure        LOW

Risk history
[chart]

Relevant events
[timeline]

Active cases
[list]

Sources
[list]
```

---

# 23. Transparency / Methodology Page

This is mandatory.

Publish:

- all scoring dimensions
- weights
- source hierarchy
- definitions
- current methodology version
- change log
- known limitations

Every assessment stores:

```text
methodology_version = "2026.08.1"
```

If weights change, historical assessments remain reproducible.

---

# 24. Language Discipline

The product must be exceptionally disciplined.

Avoid assertions such as:

> Trump is trying to steal TX-34.

Unless directly supported by evidence.

Prefer:

> Federal and Texas state actions have increased the number of administrative mechanisms capable of affecting a close TX-34 result.

Likewise:

**Documented**
> DOJ requested voter records.

**Assessment**
> This increases voter-roll intervention exposure.

**Not established**
> DOJ requested the records in order to alter TX-34.

This distinction will determine whether the site is credible.

---

# 25. Existing Nodots Architecture

Known technical baseline from the naval project:

```text
pnpm monorepo

apps/
  web       React + Vite
  api       Express + TypeScript
  worker

packages/
  shared

Postgres
PostGIS
```

That is perfectly adequate.

Recommended evolution:

```text
apps/
  web
  api
  worker

packages/
  osint-core
  election-domain
  naval-domain
  ukraine-domain
  shared-ui
```

`osint-core` owns:

```text
sources
evidence
actors
provenance
confidence
event metadata
ingestion primitives
audit trail
```

Vertical packages own their domain semantics.

Do not prematurely rewrite the Ukraine tracker around this abstraction. Extract common code only where duplication actually appears.

---

# 26. Database Strategy

Same Postgres instance is reasonable initially.

Schemas would be elegant:

```text
core.*
ukraine.*
naval.*
elections.*
```

For example:

```text
core.sources
core.evidence
core.actors

elections.districts
elections.races
elections.events
elections.cases
elections.assessments
elections.forecast_snapshots
```

PostGIS remains available across schemas.

---

# 27. Hosting

Recommended routing:

```text
osint.nodots.com
        → Ukraine

naval.osint.nodots.com
        → naval domain

elections.osint.nodots.com
        → election domain
```

All can hit:

```text
api.osint.nodots.com
```

or share one backend with domain-specific API routes:

```text
/api/ukraine/*
/api/naval/*
/api/elections/*
```

There is no architectural reason to deploy three independent stacks unless traffic/security requirements eventually demand it.

---

# 28. MVP

I would aggressively constrain v1.

### Include

- all 435 House districts
- district geometries
- race ratings
- ~30 competitive races
- state profiles
- event ingestion
- source/evidence tracking
- litigation tracking
- manually maintained risk dimensions
- deterministic aggregate score
- map
- race pages
- event timeline
- House-control dashboard
- methodology page
- risk-history snapshots

### Exclude initially

- Senate
- presidential elections
- sophisticated polling model
- autonomous ingestion
- automated legal-document interpretation
- social-media monitoring
- county-by-county election administration
- probabilistic Monte Carlo model
- prediction market data

The first useful product can be mostly analyst-maintained.

---

# 29. MVP Success Criterion

The site succeeds if somebody can open it and answer, within sixty seconds:

> **Which House races could plausibly determine control, what government actions could affect those races, and what evidence supports that judgment?**

That is the job.

Not:

> Who is ahead?

Plenty of people answer that.

---

# 30. Phase Two

Once the basic intelligence graph works:

### Automated pivotality

Monte Carlo simulation over district win probabilities.

For each simulation:

1. generate House result
2. flip target district
3. test whether chamber control changes
4. calculate district control pivotality

This gives an empirical:

```text
P(control depends on TX-34)
```

That number could be fantastic.

### Event impact engine

Each event produces explicit deltas:

```text
TX-34
voterRollExposure +8
federalLeverage +4

PA-07
voterRollExposure +8
federalLeverage +2

House control threat +1.7
```

### Scenario engine

User can ask:

```text
What happens if SCOTUS permits the USPS rule?
```

System recalculates affected dimensions and identifies races whose threat level changes.

That begins to look like an actual intelligence-analysis tool rather than a website.

---

# 31. Phase Three: Post-Election Mode

On election night, the application changes character.

Pre-election inputs decline in importance.

New priority:

```text
reported margin
uncounted ballot estimate
provisional ballots
mail-ballot rejection
recount threshold
active litigation
certification deadline
certification status
candidate contest
House contest
```

Risk formula becomes roughly:

```text
Post-Election Control Risk =
    actual closeness
  × unresolved ballot volume
  × litigation exposure
  × certification exposure
  × pivotality
```

District cards become operational:

```text
PA-07

D +842

Ballots unresolved:
3,410

Automatic recount:
YES

Certification:
Nov 23

Active litigation:
2

House-control pivotality:
EXTREME
```

This may ultimately be the site's highest-value period.

---

# 32. Editorial Model

Every event should have:

```text
entered_by
reviewed_by
published_at
last_modified_by
```

Assessment changes should be logged.

No silent edits.

For controversial factual corrections:

```text
CORRECTED Aug 24:
Previous version stated X.
Primary court filing establishes Y.
Risk score changed 71 → 67.
```

Very OSINT.

Very defensible.

---

# 33. API

Useful endpoints:

```text
GET /api/elections/2026/house
GET /api/elections/2026/house/races
GET /api/elections/2026/house/races/TX-34

GET /api/elections/events
GET /api/elections/events/:id

GET /api/elections/states/TX

GET /api/elections/cases
GET /api/elections/cases/:id

GET /api/elections/assessments/current
GET /api/elections/assessments/history

GET /api/elections/house-control
```

Eventually make read endpoints public.

The data itself could become a useful resource for journalists/researchers.

---

# 34. First Seed Dataset

I would initialize with the exact cases we've already been watching:

```text
TX-34
IA-01
IA-03
OH-07
OH-09
PA-07
PA-08
PA-10
AZ-01
AZ-06
CO-08
WA-03
CA-22
FL-25
MO-05
```

Then ingest historical events beginning approximately:

**January 20, 2025**

That gives enough history to explain how the current risk environment emerged.

No need initially to backfill every election-law event in America.

---

# 35. The Feature That Makes It Special

The killer visualization is not the map.

It is this:

```text
           HOUSE CONTROL THREAT

             Aug 1   Aug 8   Aug 15   Aug 22
Baseline       31      34       29       33
Legal          44      39       32       36
Admin          55      58       51       60
Post-election  48      48       48       48

Overall        45      44       38       43
```

Below it:

```text
Why did risk change?

+ USPS final rule             +6
- Federal injunction          -8
+ OH-7 → Toss-up              +3
+ Texas ruling                +4
```

That is **OSINT intelligence**, not punditry.

It gives the reader an auditable answer to:

> **Has the risk of election ratfucking increased or decreased?**

Which, conveniently, is the question that led us here.

---

# 36. Recommended Build Order

1. Add `elections` domain/schema.
2. Import district geometries and metadata.
3. Add races + forecast snapshots.
4. Generalize source/evidence primitives from whichever existing tracker has the better implementation.
5. Implement election events.
6. Implement state vulnerability inputs.
7. Implement race risk assessments.
8. Build U.S. district map.
9. Build race detail page.
10. Build event timeline.
11. Build House-control summary.
12. Publish methodology.
13. Seed the current ~15 highest-interest districts.
14. Backfill 2025–2026 material federal/state actions.
15. Add automated feed discovery.
16. Add Monte Carlo pivotality once the factual layer is stable.

---

# 37. Bottom Line

**Do not build another bespoke election website.**

Build a third Nodots OSINT vertical.

The Ukraine tracker supplies the product philosophy: events, evidence, changing state, uncertainty, intelligence assessment.

The naval tracker supplies a known technical starting point: React/Vite + TypeScript + Express + worker + Postgres/PostGIS.

The election vertical adds one new concept that could make the whole platform more sophisticated:

> **Explicit separation between observed events, modeled vulnerability, and strategic consequence.**

If that abstraction works well here, it may actually be worth propagating *back* into the Ukraine and naval applications later.

The immediate product should be:

**`elections.osint.nodots.com`**

A district-level, evidence-backed, historically auditable tracker of whether observable government actions could plausibly affect control of the 2026 U.S. House.