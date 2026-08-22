// Domain vocabulary for the election-integrity vertical. See
// docs/specs/election-subversion.md — the governing principle is that facts,
// claims, and assessments are different objects and must stay independently
// inspectable.

export type ElectionType = "HOUSE" | "SENATE" | "PRESIDENTIAL";

export type RaceStatus =
  | "PRE_PRIMARY"
  | "GENERAL"
  | "VOTING"
  | "COUNTING"
  | "RECOUNT"
  | "CONTESTED"
  | "CERTIFIED"
  | "SEATED";

export type JurisdictionType = "FEDERAL" | "STATE" | "COUNTY" | "DISTRICT";

export type FactualStatus =
  | "CONFIRMED"
  | "REPORTED"
  | "ALLEGED"
  | "DISPUTED"
  | "RETRACTED";

export type OperationalStatus =
  | "PROPOSED"
  | "ACTIVE"
  | "BLOCKED"
  | "ENJOINED"
  | "OVERTURNED"
  | "SUPERSEDED"
  | "EXPIRED";

export type SourceType =
  | "PRIMARY_GOVERNMENT"
  | "COURT_DOCUMENT"
  | "CAMPAIGN"
  | "ACADEMIC"
  | "NEWS"
  | "NGO"
  | "ANALYST"
  | "SOCIAL"
  | "OTHER";

export type ActorType =
  | "FEDERAL_AGENCY"
  | "STATE_AGENCY"
  | "COURT"
  | "OFFICIAL"
  | "CAMPAIGN"
  | "PARTY"
  | "NGO"
  | "OTHER";

export type CourtActionType =
  | "FILING"
  | "ORDER"
  | "OPINION"
  | "INJUNCTION"
  | "STAY"
  | "APPEAL"
  | "CERT_GRANTED"
  | "CERT_DENIED";

// Multi-tag event taxonomy (spec §6) — one event can carry several tags.
export const EVENT_TYPES = [
  "VOTER_REGISTRATION",
  "VOTER_ROLL_ACCESS",
  "VOTER_ROLL_PURGE",
  "CITIZENSHIP_VERIFICATION",
  "BALLOT_ACCESS",
  "MAIL_BALLOT_RULE",
  "EARLY_VOTING_RULE",
  "PROVISIONAL_BALLOT_RULE",
  "BALLOT_CURE_RULE",
  "BALLOT_REJECTION",
  "ELECTION_ADMINISTRATION",
  "FEDERAL_DATA_REQUEST",
  "FEDERAL_DIRECTIVE",
  "STATE_DIRECTIVE",
  "COUNTY_ACTION",
  "REDISTRICTING",
  "LITIGATION_FILED",
  "COURT_RULING",
  "APPEAL",
  "INJUNCTION",
  "SCOTUS_ACTION",
  "RECOUNT",
  "AUDIT",
  "CERTIFICATION",
  "CERTIFICATION_REFUSAL",
  "CANDIDATE_CONTEST",
  "HOUSE_ELECTION_CONTEST",
  "SEATING_DISPUTE",
  "LAW_ENFORCEMENT_ACTION",
  "FEDERAL_INVESTIGATION",
  "PUBLIC_THREAT",
  "PUBLIC_DIRECTIVE",
  "POLITICAL_PRESSURE",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

// Curated display labels (spec §24): internal taxonomy identifiers are never
// shown raw — a term like PUBLIC_THREAT must read as a description of a
// documented act, not an assertion about an actor.
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  VOTER_REGISTRATION: "voter registration",
  VOTER_ROLL_ACCESS: "voter-roll access",
  VOTER_ROLL_PURGE: "voter-roll purge",
  CITIZENSHIP_VERIFICATION: "citizenship verification",
  BALLOT_ACCESS: "ballot access",
  MAIL_BALLOT_RULE: "mail-ballot rule",
  EARLY_VOTING_RULE: "early-voting rule",
  PROVISIONAL_BALLOT_RULE: "provisional-ballot rule",
  BALLOT_CURE_RULE: "ballot-cure rule",
  BALLOT_REJECTION: "ballot rejection",
  ELECTION_ADMINISTRATION: "election administration",
  FEDERAL_DATA_REQUEST: "federal data request",
  FEDERAL_DIRECTIVE: "federal directive",
  STATE_DIRECTIVE: "state directive",
  COUNTY_ACTION: "county action",
  REDISTRICTING: "redistricting",
  LITIGATION_FILED: "litigation filed",
  COURT_RULING: "court ruling",
  APPEAL: "appeal",
  INJUNCTION: "injunction",
  SCOTUS_ACTION: "SCOTUS action",
  RECOUNT: "recount",
  AUDIT: "audit",
  CERTIFICATION: "certification",
  CERTIFICATION_REFUSAL: "certification refusal",
  CANDIDATE_CONTEST: "candidate contest",
  HOUSE_ELECTION_CONTEST: "House election contest",
  SEATING_DISPUTE: "seating dispute",
  LAW_ENFORCEMENT_ACTION: "law-enforcement action",
  FEDERAL_INVESTIGATION: "federal investigation",
  PUBLIC_THREAT: "threatening public statement",
  PUBLIC_DIRECTIVE: "public directive",
  POLITICAL_PRESSURE: "political pressure on officials",
};

// Display labels for the assessment dimensions and components, shared by the
// web pages and the email digest.
export const DIMENSION_LABELS: Record<string, string> = {
  federalLeverage: "federal leverage",
  stateCooperation: "state cooperation",
  administrativeExposure: "administrative exposure",
  voterRollExposure: "voter-roll exposure",
  ballotExposure: "ballot exposure",
  litigationExposure: "litigation exposure",
  certificationExposure: "certification exposure",
  recountExposure: "recount exposure",
  congressionalContestExposure: "congressional-contest exposure",
  institutionalResistance: "institutional resistance",
  activePressure: "active pressure",
};

export type ConfidenceLabel =
  | "VERY_LOW"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "VERY_HIGH";

// Map a numeric confidence in [0,1] to the label vocabulary used in the UI.
export function confidenceLabel(value: number): ConfidenceLabel {
  if (value < 0.2) return "VERY_LOW";
  if (value < 0.4) return "LOW";
  if (value < 0.6) return "MEDIUM";
  if (value < 0.8) return "HIGH";
  return "VERY_HIGH";
}

// API response shapes shared between web and api.

export interface RaceSummary {
  id: number;
  districtId: string;
  displayName: string;
  state: string;
  incumbentParty: string | null;
  rating: string | null;
  ratingSource: string | null;
  status: RaceStatus;
  processVulnerability: number | null;
  institutionalResistance: number | null;
  activePressure: number | null;
  litigationExposure: number | null;
  pivotality: number | null;
  // Public name for the stored subversion_risk column (see the methodology
  // glossary): the intervention-relevance index in [0,1].
  interventionRelevance: number | null;
  assessedAt: string | null;
}

export interface HouseControlSummary {
  cycle: number;
  baselineProjection: { dem: number; rep: number } | null;
  seatsToFlipControl: number | null;
  competitiveRaces: number;
  highRiskRaces: number;
  highRiskPivotalRaces: number;
  controlThreat: "LOW" | "MODERATE" | "HIGH" | "UNKNOWN";
  confidence: ConfidenceLabel;
  methodologyVersion: string;
}

export interface ElectionEventSummary {
  id: number;
  occurredAt: string;
  title: string;
  summary: string;
  eventTypes: EventType[];
  jurisdictionType: JurisdictionType;
  jurisdictions: string[];
  factualStatus: FactualStatus;
  operationalStatus: OperationalStatus;
  confidence: number;
  affectedRaceIds: number[];
  // Primary evidence link (spec §7): the registered source's name and the
  // fetched document's URL.
  sourceName: string | null;
  sourceUrl: string | null;
}

export interface ForecastSnapshot {
  source: string;
  snapshotDate: string; // "YYYY-MM-DD"
  rating: string | null;
  margin: number | null;
}

// One row of the append-only risk history, normalized to numbers.
export interface RiskAssessment {
  id: number;
  assessedAt: string;
  competitiveness: number;
  pivotality: number;
  federalLeverage: number;
  stateCooperation: number;
  administrativeExposure: number;
  voterRollExposure: number;
  ballotExposure: number;
  litigationExposure: number;
  certificationExposure: number;
  recountExposure: number;
  congressionalContestExposure: number;
  processVulnerability: number;
  // 2026.09.1 components; null on rows computed under earlier versions.
  institutionalResistance: number | null;
  activePressure: number | null;
  interventionRelevance: number;
  confidence: number;
  explanations: unknown;
  triggeringEventIds: number[];
  methodologyVersion: string;
}

export interface CaseSummary {
  id: number;
  name: string;
  docketNumber: string | null;
  court: string | null;
  jurisdiction: string | null;
  filedAt: string | null;
  status: string;
  affectedMechanisms: string[];
}

// GET /changes — one change-ledger entry (methodology doc §23/§38).
export interface AssessmentChange {
  changedAt: string;
  districtId: string;
  displayName: string;
  state: string;
  currentRisk: number;
  firstAssessment: boolean;
  deltaRisk: number;
  deltaVulnerability: number;
  deltaResistance: number | null;
  deltaPressure: number | null;
  deltaCompetitiveness: number;
  deltaPivotality: number;
  dimensionDeltas: Record<string, number> | null;
  methodologyVersion: string;
  newEvents: {
    id: number;
    title: string;
    occurredAt: string;
    sourceUrl: string | null;
  }[];
}

// GET /house-control/history — one point of the §35 threat time series.
export interface ThreatHistoryPoint {
  date: string; // "YYYY-MM-DD"
  overallIndex: number; // mean risk index across races, 0–100
  highRiskRaces: number;
  highRiskPivotalRaces: number;
}

// GET /races/:districtId — everything the race detail page renders (spec §22).
export interface RaceDetail {
  race: RaceSummary;
  currentMember: string | null;
  cookPvi: string | null;
  democraticCandidate: string | null;
  republicanCandidate: string | null;
  projectedMargin: number | null;
  ratingUpdatedAt: string | null;
  forecasts: ForecastSnapshot[];
  assessments: RiskAssessment[];
  events: ElectionEventSummary[];
  cases: CaseSummary[];
}
