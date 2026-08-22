import type { SourceCase, SourceEvent } from "../services/ingest.js";

// CourtListener (Free Law Project) RECAP search — federal dockets with
// nature-of-suit 441 "Civil Rights: Voting", the civil cover sheet's own
// voting-rights category. Anonymous access works and is rate-limited;
// COURTLISTENER_TOKEN raises the limits when provided. Data is public court
// records.

const API = "https://www.courtlistener.com/api/rest/v4/search/";
const USER_AGENT = "nodots-osint-elections (kenr@nodots.com)";

interface ClResult {
  docket_id: number;
  caseName: string;
  court: string;
  court_id: string;
  docketNumber: string | null;
  dateFiled: string | null;
  dateTerminated: string | null;
  suitNature: string;
  docket_absolute_url: string;
  party: string[] | null;
}

// District-court ids embed the state postal code: "ord" → OR, "cand" → CA,
// "txsd" → TX. Appellate/circuit ids don't parse and map to null.
export function stateFromCourtId(courtId: string): string | null {
  const match = /^([a-z]{2})(?:[nsewmc]{1,2})?d$/.exec(courtId);
  return match ? match[1]!.toUpperCase() : null;
}

export async function fetchVotingDockets(
  from: Date,
  maxPages = 10,
): Promise<{ events: SourceEvent[]; cases: SourceCase[] }> {
  const filedAfter = `${String(from.getUTCMonth() + 1).padStart(2, "0")}/${String(
    from.getUTCDate(),
  ).padStart(2, "0")}/${from.getUTCFullYear()}`;
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (process.env.COURTLISTENER_TOKEN) {
    headers.Authorization = `Token ${process.env.COURTLISTENER_TOKEN}`;
  }

  const results: ClResult[] = [];
  let url: string | null =
    `${API}?type=r&q=${encodeURIComponent('suitNature:"voting"')}` +
    `&filed_after=${encodeURIComponent(filedAfter)}&order_by=${encodeURIComponent("dateFiled desc")}`;
  // Cursor pagination; the page cap bounds a runaway window (backfill passes
  // a higher cap than the daily run).
  for (let page = 0; url && page < maxPages; page++) {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`courtlistener: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as {
      results?: ClResult[];
      next?: string | null;
    };
    results.push(...(body.results ?? []));
    url = body.next ?? null;
  }

  const events: SourceEvent[] = [];
  const cases: SourceCase[] = [];
  for (const r of results) {
    if (!r.docketNumber) continue;
    const state = stateFromCourtId(r.court_id);
    const parties = (r.party ?? []).slice(0, 6).join(", ");
    cases.push({
      name: r.caseName,
      docketNumber: r.docketNumber,
      court: r.court,
      jurisdiction: state,
      filedAt: r.dateFiled,
      terminated: r.dateTerminated != null,
      affectedStates: state ? [state] : [],
    });
    events.push({
      source: "courtlistener",
      externalId: String(r.docket_id),
      occurredAt: `${r.dateFiled ?? from.toISOString().slice(0, 10)}T00:00:00Z`,
      jurisdictionType: state ? "STATE" : "FEDERAL",
      jurisdictions: state ? [state] : ["US"],
      eventTypes: ["LITIGATION_FILED"],
      title: `${r.caseName} (${r.court})`,
      summary:
        `Voting-rights suit (nature of suit: ${r.suitNature}) filed in ${r.court}, ` +
        `docket ${r.docketNumber}.${parties ? ` Parties: ${parties}.` : ""}`,
      factualStatus: "CONFIRMED",
      operationalStatus: r.dateTerminated ? "EXPIRED" : "ACTIVE",
      confidence: 0.9,
      rawData: {
        url: `https://www.courtlistener.com${r.docket_absolute_url}`,
        courtId: r.court_id,
        docketNumber: r.docketNumber,
        suitNature: r.suitNature,
      },
    });
  }
  return { events, cases };
}
