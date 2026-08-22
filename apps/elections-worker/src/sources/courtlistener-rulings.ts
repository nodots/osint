import type { EventType } from "@elections-tracker/shared";
import { fetchWithRetry } from "../services/http.js";
import type { SourceCase, SourceEvent } from "../services/ingest.js";
import { stateFromCourtId, usDate } from "./courtlistener.js";

// CourtListener RECAP docket entries: injunction/TRO orders in voting cases
// (nature of suit 441). This is the ruling-direction source the resistance
// component needs — a granted injunction against a government election action
// is institutional resistance; a denial leaves the exposure standing.
//
// Direction is classified deterministically from the docket-entry text with a
// tight window (grant/deny within a few words of the injunction term), and
// entries that don't classify cleanly are skipped rather than guessed.

const API = "https://www.courtlistener.com/api/rest/v4/search/";
const USER_AGENT = "nodots-osint-elections (kenr@nodots.com)";
const QUERY =
  'suitNature:"voting" AND description:("granting" OR "granted" OR "denying" OR "denied" OR "enjoin" OR "enjoined") AND description:("injunction" OR "restraining order" OR "TRO")';

interface ClRulingDocket {
  docket_id: number;
  caseName: string;
  court: string;
  court_id: string;
  docketNumber: string | null;
  dateFiled: string | null;
  dateTerminated: string | null;
  docket_absolute_url: string;
  party: string[] | null;
  recap_documents:
    | {
        id: number;
        entry_date_filed: string | null;
        description: string | null;
        absolute_url: string;
      }[]
    | null;
}

const INJUNCTION_TERM = "(?:preliminary |permanent |temporary )?(?:injunction|restraining order|tro\\b)";
// Tight windows so "granting Motion for Leave to File ... in Support of
// Motion for Preliminary Injunction" does not classify.
const GRANT_RE = new RegExp(
  `grant(?:ing|ed|s)?[^.]{0,45}${INJUNCTION_TERM}|${INJUNCTION_TERM}[^.]{0,25}(?:is |are )?granted|\\benjoin(?:s|ed|ing)\\b`,
  "i",
);
const DENY_RE = new RegExp(
  `den(?:y|ying|ied|ies)[^.]{0,45}${INJUNCTION_TERM}|${INJUNCTION_TERM}[^.]{0,25}(?:is |are )?denied`,
  "i",
);
// Orders about filing mechanics never classify, whatever else they match.
const MECHANICS_RE =
  /motion (?:for|to) (?:leave|permission|extension|extend|seal|withdraw|substitute)|reply brief|amicus|scheduling|pro hac vice/i;

export type RulingDirection = "BLOCKS" | "DENIES";

// Nationwide-scope detection (2026.09.3): a block reads as national
// resistance when the order says so, or when the enjoined party is the
// federal government — a federal defendant's conduct isn't confined to the
// issuing court's state.
const NATIONWIDE_RE = /nationwide|universal (?:injunction|relief)|applies? to all states/i;
const FEDERAL_PARTY_RE =
  /\bunited states\b|\bu\.s\.\b|donald j\.? trump|homeland security|citizenship and immigration|postal service|social security administration|united states attorney general|election assistance commission|department of justice|department of defense/i;

export function rulingScope(
  description: string,
  caseName: string,
  parties: string[],
): "US" | "STATE" {
  if (NATIONWIDE_RE.test(description)) return "US";
  const partyText = `${caseName} ${parties.join(" ")}`;
  return FEDERAL_PARTY_RE.test(partyText) ? "US" : "STATE";
}

export function classifyRuling(description: string): RulingDirection | null {
  const text = description.replace(/\s+/g, " ");
  if (MECHANICS_RE.test(text)) return null;
  const grants = GRANT_RE.test(text);
  const denies = DENY_RE.test(text);
  if (grants === denies) return null; // neither, or contradictory — skip
  return grants ? "BLOCKS" : "DENIES";
}

export async function fetchVotingRulings(
  from: Date,
  maxPages = 10,
): Promise<{ events: (SourceEvent & { caseKey: string })[]; cases: SourceCase[] }> {
  const after = `${String(from.getUTCMonth() + 1).padStart(2, "0")}/${String(
    from.getUTCDate(),
  ).padStart(2, "0")}/${from.getUTCFullYear()}`;
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (process.env.COURTLISTENER_TOKEN) {
    headers.Authorization = `Token ${process.env.COURTLISTENER_TOKEN}`;
  }

  const dockets: ClRulingDocket[] = [];
  const until = process.env.INGEST_UNTIL
    ? `&entry_date_filed_before=${encodeURIComponent(usDate(new Date(`${process.env.INGEST_UNTIL}T00:00:00Z`)))}`
    : "";
  let url: string | null =
    `${API}?type=r&q=${encodeURIComponent(QUERY)}` +
    `&entry_date_filed_after=${encodeURIComponent(after)}${until}` +
    `&order_by=${encodeURIComponent("dateFiled desc")}`;
  for (let page = 0; url && page < maxPages; page++) {
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) {
      throw new Error(`courtlistener rulings: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as {
      results?: ClRulingDocket[];
      next?: string | null;
    };
    dockets.push(...(body.results ?? []));
    url = body.next ?? null;
  }

  const events: (SourceEvent & { caseKey: string })[] = [];
  const cases: SourceCase[] = [];
  for (const docket of dockets) {
    if (!docket.docketNumber) continue;
    const state = stateFromCourtId(docket.court_id);
    const caseKey = `${docket.docketNumber}|${docket.court}`;
    let docketHasRuling = false;

    for (const doc of docket.recap_documents ?? []) {
      if (!doc.description || !doc.entry_date_filed) continue;
      const direction = classifyRuling(doc.description);
      if (!direction) continue;
      // Entries can predate/postdate the window on backfilled dockets; the
      // search filter is docket-level, so window the entries ourselves.
      if (new Date(`${doc.entry_date_filed}T00:00:00Z`) < from) continue;
      if (
        process.env.INGEST_UNTIL &&
        doc.entry_date_filed > process.env.INGEST_UNTIL
      ) {
        continue;
      }
      docketHasRuling = true;
      const blocks = direction === "BLOCKS";
      const types: EventType[] = blocks
        ? ["COURT_RULING", "INJUNCTION"]
        : ["COURT_RULING"];
      // A block against a federal defendant (or an expressly nationwide
      // order) is national resistance, wherever the court sits.
      const national =
        !state ||
        (blocks &&
          rulingScope(doc.description, docket.caseName, docket.party ?? []) ===
            "US");
      events.push({
        caseKey,
        material: true,
        source: "courtlistener_rulings",
        externalId: `rd:${doc.id}`,
        occurredAt: `${doc.entry_date_filed}T00:00:00Z`,
        jurisdictionType: national ? "FEDERAL" : "STATE",
        jurisdictions: !national && state ? [state] : ["US"],
        eventTypes: types,
        title: `${blocks ? "Injunctive relief granted" : "Injunctive relief denied"} — ${docket.caseName} (${docket.court})`,
        summary: doc.description.replace(/\s+/g, " ").slice(0, 1000),
        factualStatus: "CONFIRMED",
        operationalStatus: "ACTIVE",
        confidence: 0.85,
        rawData: {
          url: `https://www.courtlistener.com${doc.absolute_url}`,
          courtId: docket.court_id,
          docketNumber: docket.docketNumber,
          direction,
        },
      });
    }

    if (docketHasRuling) {
      cases.push({
        name: docket.caseName,
        docketNumber: docket.docketNumber,
        court: docket.court,
        jurisdiction: state,
        filedAt: docket.dateFiled,
        terminated: docket.dateTerminated != null,
        affectedStates: state ? [state] : [],
      });
    }
  }
  return { events, cases };
}
