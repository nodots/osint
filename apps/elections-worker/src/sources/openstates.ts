import type { EventType, OperationalStatus } from "@elections-tracker/shared";
import type { SourceEvent } from "../services/ingest.js";

// State election legislation via the OpenStates v3 API (FOSS project, free
// key from https://open.pluralpolicy.com/accounts/profile/). Key-gated like
// COURTLISTENER_TOKEN — unset simply skips the source. This is the biggest
// state-level coverage gap: most election administration changes are bills.
//
// Bills matching election-mechanism subjects/title terms become
// STATE_DIRECTIVE events with the §25 lifecycle: introduced -> PROPOSED,
// passed/signed -> ACTIVE, dead -> EXPIRED. The external id is the OpenStates
// bill id, so status changes update the same event via
// refreshOperationalStatus rather than duplicating.

const API = "https://v3.openstates.org/bills";

const TERM_QUERIES = [
  "voter registration",
  "election administration",
  "absentee ballot",
  "mail ballot",
  "election certification",
  "voter roll",
];

const MECHANISM_TAGS: [RegExp, EventType][] = [
  [/absentee|mail.{0,10}ballot|vote by mail/i, "MAIL_BALLOT_RULE"],
  [/registration|voter roll|list maintenance/i, "VOTER_REGISTRATION"],
  [/citizenship/i, "CITIZENSHIP_VERIFICATION"],
  [/early voting/i, "EARLY_VOTING_RULE"],
  [/provisional/i, "PROVISIONAL_BALLOT_RULE"],
  [/certification|certify/i, "CERTIFICATION"],
];

interface OsBill {
  id: string;
  identifier: string;
  title: string;
  jurisdiction: { name: string };
  session: string;
  latest_action_date: string | null;
  latest_action_description: string | null;
  first_action_date: string | null;
  openstates_url: string;
}

const STATE_BY_NAME: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR",
  California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL",
  Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY", Louisiana: "LA",
  Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI",
  Minnesota: "MN", Mississippi: "MS", Missouri: "MO", Montana: "MT",
  Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
  "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC",
  "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV",
  Wisconsin: "WI", Wyoming: "WY",
};

// Deterministic status mapping from the latest action text.
export function billStatus(action: string | null): OperationalStatus {
  const text = (action ?? "").toLowerCase();
  if (/signed|became law|enacted|chaptered/.test(text)) return "ACTIVE";
  if (/vetoed|died|failed|withdrawn|indefinitely postponed/.test(text)) {
    return "EXPIRED";
  }
  return "PROPOSED";
}

export async function fetchElectionBills(from: Date): Promise<SourceEvent[]> {
  const apiKey = process.env.OPENSTATES_API_KEY;
  if (!apiKey) {
    console.log("openstates skipped — OPENSTATES_API_KEY not set");
    return [];
  }

  const byId = new Map<string, { bill: OsBill; matched: string }>();
  for (const term of TERM_QUERIES) {
    const params = new URLSearchParams({
      q: term,
      sort: "updated_desc",
      updated_since: from.toISOString().slice(0, 10),
      per_page: "20",
      page: "1",
    });
    const res = await fetch(`${API}?${params}`, {
      headers: { "X-API-KEY": apiKey },
    });
    if (!res.ok) {
      throw new Error(`openstates: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as { results?: OsBill[] };
    for (const bill of body.results ?? []) {
      if (!byId.has(bill.id)) byId.set(bill.id, { bill, matched: term });
    }
    // Free tier is rate-limited; be polite between term queries.
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  const events: SourceEvent[] = [];
  for (const { bill, matched } of byId.values()) {
    const state = STATE_BY_NAME[bill.jurisdiction.name];
    if (!state) continue; // municipal/territorial jurisdictions
    const tags = MECHANISM_TAGS.filter(([re]) => re.test(bill.title)).map(
      ([, t]) => t,
    );
    events.push({
      source: "openstates",
      externalId: bill.id,
      occurredAt: `${bill.first_action_date ?? bill.latest_action_date ?? from.toISOString().slice(0, 10)}T00:00:00Z`,
      jurisdictionType: "STATE",
      jurisdictions: [state],
      eventTypes: [...new Set<EventType>(["STATE_DIRECTIVE", ...tags])],
      title: `${state} ${bill.identifier}: ${bill.title.slice(0, 400)}`,
      summary:
        `${bill.jurisdiction.name} ${bill.session} — latest action: ` +
        `${bill.latest_action_description ?? "introduced"} (${bill.latest_action_date ?? "n/a"}).`,
      factualStatus: "CONFIRMED",
      operationalStatus: billStatus(bill.latest_action_description),
      confidence: 0.85,
      material: true,
      rawData: {
        url: bill.openstates_url,
        matchedQuery: matched,
        session: bill.session,
      },
    });
  }
  return events;
}
