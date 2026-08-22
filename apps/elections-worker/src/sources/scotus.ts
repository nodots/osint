import type { EventType } from "@elections-tracker/shared";
import { fetchWithRetry } from "../services/http.js";
import { usDate } from "./courtlistener.js";
import type { SourceEvent } from "../services/ingest.js";

const RULING_TYPES: EventType[] = ["SCOTUS_ACTION", "COURT_RULING"];

// SCOTUS election-law opinions via CourtListener (no RECAP coverage for the
// Court, but opinions are indexed). Rulings land as SCOTUS_ACTION +
// COURT_RULING, national scope. Direction (does the ruling free or block a
// government action?) is NOT classified — an opinion has no docket-entry
// sentence to parse deterministically, and guessing violates the
// don't-fabricate rule; the triage layer (Stage 3) is the upgrade path.

const API = "https://www.courtlistener.com/api/rest/v4/search/";
const USER_AGENT = "nodots-osint-elections (kenr@nodots.com)";
const QUERY = 'election OR voter OR ballot OR "voting rights"';

interface ScotusResult {
  cluster_id: number;
  caseName: string;
  dateFiled: string | null;
  absolute_url: string;
  status: string;
  syllabus: string | null;
}

export async function fetchScotusOpinions(from: Date): Promise<SourceEvent[]> {
  const after = `${String(from.getUTCMonth() + 1).padStart(2, "0")}/${String(
    from.getUTCDate(),
  ).padStart(2, "0")}/${from.getUTCFullYear()}`;
  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (process.env.COURTLISTENER_TOKEN) {
    headers.Authorization = `Token ${process.env.COURTLISTENER_TOKEN}`;
  }

  const results: ScotusResult[] = [];
  const until = process.env.INGEST_UNTIL
    ? `&filed_before=${encodeURIComponent(usDate(new Date(`${process.env.INGEST_UNTIL}T00:00:00Z`)))}`
    : "";
  let url: string | null =
    `${API}?type=o&court=scotus&q=${encodeURIComponent(QUERY)}` +
    `&filed_after=${encodeURIComponent(after)}${until}&order_by=${encodeURIComponent("dateFiled desc")}`;
  for (let page = 0; url && page < 5; page++) {
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) {
      throw new Error(`courtlistener scotus: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as {
      results?: ScotusResult[];
      next?: string | null;
    };
    results.push(...(body.results ?? []));
    url = body.next ?? null;
  }

  // The query matches full opinion text, which sweeps in any case that
  // mentions elections in passing; require an election term in the case name
  // or syllabus. Revised opinions ("... Revisions: 7/01/26") duplicate their
  // original cluster — keep the first per normalized name.
  const seen = new Set<string>();
  const relevant = results.filter((r) => {
    if (!r.dateFiled) return false;
    const name = r.caseName.replace(/\s*Revisions:.*$/i, "").trim();
    if (seen.has(name)) return false;
    // Election terms, or election-institution parties — syllabus is often
    // null on fresh opinions, so party names carry recall.
    if (
      !/election|voter|voting|ballot|redistrict|apportion|republican national committee|democratic national committee|secretary of state|board of elections/i.test(
        `${name} ${r.syllabus ?? ""}`,
      )
    ) {
      return false;
    }
    seen.add(name);
    return true;
  });

  return relevant.map((r) => ({
      source: "scotus_opinions",
      externalId: String(r.cluster_id),
      occurredAt: `${r.dateFiled}T00:00:00Z`,
      jurisdictionType: "FEDERAL" as const,
      jurisdictions: ["US"],
      eventTypes: RULING_TYPES,
      title: `SCOTUS: ${r.caseName}`,
      summary:
        r.syllabus?.replace(/\s+/g, " ").slice(0, 1000) ??
        `Supreme Court opinion in ${r.caseName} (${r.status}).`,
      factualStatus: "CONFIRMED" as const,
      operationalStatus: "ACTIVE" as const,
      confidence: 0.85,
      material: true,
      rawData: {
        url: `https://www.courtlistener.com${r.absolute_url}`,
        court: "scotus",
      },
    }));
}
