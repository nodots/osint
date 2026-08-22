import type { EventType, OperationalStatus } from "@elections-tracker/shared";
import type { SourceEvent } from "../services/ingest.js";

// Federal Register API (https://www.federalregister.gov/developers) — the
// official journal of federal rules, notices, and presidential documents.
// U.S. government work, public domain, no auth, no key.
//
// The term search matches full document text, which is noisy (a Medicare rule
// mentioning "voter registration" once matches). Precision comes from a
// client-side gate: a document is kept only when one of the query phrases
// appears in its title or abstract.

const API = "https://www.federalregister.gov/api/v1/documents.json";
// Documents on file at the OFR ahead of official publication — this is when
// the press reports a rule, typically days before publication_date.
const PUBLIC_INSPECTION_API =
  "https://www.federalregister.gov/api/v1/public-inspection-documents/current.json";

// Phrase queries run without an agency restriction; the broad "election" term
// only within election-relevant agencies.
const PHRASE_QUERIES = [
  "voter registration",
  "election administration",
  "voting rights",
  "absentee ballot",
  "vote by mail",
  "election security",
  "voter roll",
];
const AGENCY_QUERY = {
  term: "election",
  agencies: [
    "election-assistance-commission",
    "justice-department",
    "homeland-security-department",
    "postal-service",
  ],
};

interface FrDocument {
  document_number: string;
  title: string;
  type: string;
  abstract: string | null;
  publication_date: string;
  html_url: string;
  agencies: { name?: string; raw_name?: string }[];
}

const TYPE_MAP: Record<string, { types: EventType[]; op: OperationalStatus }> =
  {
    Rule: { types: ["FEDERAL_DIRECTIVE"], op: "ACTIVE" },
    "Proposed Rule": { types: ["FEDERAL_DIRECTIVE"], op: "PROPOSED" },
    Notice: { types: ["ELECTION_ADMINISTRATION"], op: "ACTIVE" },
    "Presidential Document": { types: ["PUBLIC_DIRECTIVE"], op: "ACTIVE" },
  };

// Content-based mechanism tags so a document also feeds the dimension it
// actually touches (a USPS mail-ballot rule is ballot exposure, not just
// federal leverage).
const MECHANISM_TAGS: [RegExp, EventType][] = [
  [/ballot.{0,20}mail|mail.{0,20}ballot|absentee|vote by mail/i, "MAIL_BALLOT_RULE"],
  [/voter registration|voter roll|list maintenance/i, "VOTER_REGISTRATION"],
  [/citizenship/i, "CITIZENSHIP_VERIFICATION"],
  [/early voting/i, "EARLY_VOTING_RULE"],
  [/provisional ballot/i, "PROVISIONAL_BALLOT_RULE"],
  [/certification/i, "CERTIFICATION"],
];

function mechanismTags(doc: FrDocument): EventType[] {
  const haystack = `${doc.title} ${doc.abstract ?? ""}`;
  return MECHANISM_TAGS.filter(([re]) => re.test(haystack)).map(([, t]) => t);
}

async function fetchQuery(
  params: URLSearchParams,
  from: Date,
): Promise<FrDocument[]> {
  params.set("per_page", "100");
  params.set("order", "newest");
  params.set(
    "conditions[publication_date][gte]",
    from.toISOString().slice(0, 10),
  );
  if (process.env.INGEST_UNTIL) {
    params.set("conditions[publication_date][lte]", process.env.INGEST_UNTIL);
  }
  for (const field of [
    "document_number",
    "title",
    "type",
    "abstract",
    "publication_date",
    "html_url",
    "agencies",
  ]) {
    params.append("fields[]", field);
  }
  const docs: FrDocument[] = [];
  let url: string | null = `${API}?${params.toString()}`;
  // The window queries are small; 5 pages (500 docs) is a hard safety cap.
  for (let page = 0; url && page < 5; page++) {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`federal register: ${res.status} ${res.statusText}`);
    }
    const body = (await res.json()) as {
      results?: FrDocument[];
      next_page_url?: string | null;
    };
    docs.push(...(body.results ?? []));
    url = body.next_page_url ?? null;
  }
  return docs;
}

function relevant(doc: FrDocument): boolean {
  const haystack = `${doc.title} ${doc.abstract ?? ""}`.toLowerCase();
  return (
    PHRASE_QUERIES.some((phrase) => haystack.includes(phrase)) ||
    haystack.includes("election") ||
    haystack.includes("ballot")
  );
}

interface PiDocument {
  document_number: string;
  title: string;
  type: string;
  filed_at: string;
  publication_date: string;
  html_url: string;
  agencies: { name?: string; raw_name?: string }[];
}

// Public-inspection docs have no abstract, so relevance runs on title +
// agency names alone; the phrase gate stays the same.
async function fetchPublicInspection(): Promise<FrDocument[]> {
  const res = await fetch(PUBLIC_INSPECTION_API);
  if (!res.ok) {
    throw new Error(
      `federal register public inspection: ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as { results?: PiDocument[] };
  return (body.results ?? [])
    .filter((doc) => {
      const haystack = `${doc.title} ${doc.agencies
        .map((a) => a.name ?? a.raw_name)
        .join(" ")}`.toLowerCase();
      return (
        PHRASE_QUERIES.some((phrase) => haystack.includes(phrase)) ||
        /\belection|\bballot|\bvoter/.test(haystack)
      );
    })
    .map((doc) => ({
      document_number: doc.document_number,
      title: doc.title.trim(),
      type: doc.type,
      abstract: null,
      // The filing is the observable occurrence; publication follows later.
      publication_date: doc.filed_at.slice(0, 10),
      html_url: doc.html_url,
      agencies: doc.agencies,
    }));
}

export async function fetchFederalRegisterEvents(
  from: Date,
): Promise<{ events: SourceEvent[]; lowRelevance: number }> {
  const byNumber = new Map<string, { doc: FrDocument; matched: string }>();

  for (const phrase of PHRASE_QUERIES) {
    const params = new URLSearchParams({ "conditions[term]": `"${phrase}"` });
    for (const doc of await fetchQuery(params, from)) {
      if (!byNumber.has(doc.document_number)) {
        byNumber.set(doc.document_number, { doc, matched: phrase });
      }
    }
  }
  const agencyParams = new URLSearchParams({
    "conditions[term]": AGENCY_QUERY.term,
  });
  for (const slug of AGENCY_QUERY.agencies) {
    agencyParams.append("conditions[agencies][]", slug);
  }
  for (const doc of await fetchQuery(agencyParams, from)) {
    if (!byNumber.has(doc.document_number)) {
      byNumber.set(doc.document_number, { doc, matched: "agency:election" });
    }
  }
  // Same-day coverage: whatever is on public inspection right now — a
  // now-surface, so historical builds (INGEST_UNTIL set) skip it. The
  // document number is identical once it publishes, so the dedupe absorbs
  // the eventual documents.json copy.
  if (!process.env.INGEST_UNTIL) {
    for (const doc of await fetchPublicInspection()) {
      if (!byNumber.has(doc.document_number)) {
        byNumber.set(doc.document_number, { doc, matched: "public-inspection" });
      }
    }
  }

  const events: SourceEvent[] = [];
  let lowRelevance = 0;
  for (const { doc, matched } of byNumber.values()) {
    if (!relevant(doc)) {
      lowRelevance++;
      continue;
    }
    const mapping = TYPE_MAP[doc.type] ?? {
      types: ["ELECTION_ADMINISTRATION"] as EventType[],
      op: "ACTIVE" as OperationalStatus,
    };
    // Materiality (§24): routine agency paperwork is stored intelligence, not
    // a risk-moving event.
    const material = !/sunshine act|information collection|privacy act|meetings?\b|agenda/i.test(
      doc.title,
    );
    events.push({
      material,
      source: "federal_register",
      externalId: doc.document_number,
      occurredAt: `${doc.publication_date}T00:00:00Z`,
      jurisdictionType: "FEDERAL",
      jurisdictions: ["US"],
      eventTypes: [...new Set([...mapping.types, ...mechanismTags(doc)])],
      title: doc.title.slice(0, 500),
      summary:
        doc.abstract?.slice(0, 2000) ??
        `${doc.type} published in the Federal Register.`,
      factualStatus: "CONFIRMED",
      operationalStatus: mapping.op,
      confidence: 0.9,
      rawData: {
        url: doc.html_url,
        documentType: doc.type,
        agencies: doc.agencies.map((a) => a.name ?? a.raw_name).filter(Boolean),
        matchedQuery: matched,
      },
    });
  }
  return { events, lowRelevance };
}
