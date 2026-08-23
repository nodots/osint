import { existsSync, readFileSync } from "node:fs";
import type { EventType } from "@elections-tracker/shared";
import { insertEvents, type SourceEvent } from "./services/ingest.js";
import { pool } from "./db.js";
import {
  billStatus,
  ELECTION_TITLE_RE,
  MECHANISM_TAGS,
  STATE_BY_NAME,
  type OsBill,
} from "./sources/openstates.js";

// Load the historical state-legislation cache (legislation:fetch) into one
// baseline database: bills introduced inside the cycle window become the
// same events the live openstates source produces, with status derived
// only from actions on or before the window end (no post-election
// knowledge) and terminal transitions dated for the point-in-time replay.
//
//   DATABASE_URL=... INGEST_FROM=2019-01-20 ELECTION_DATE=2020-11-03 \
//     pnpm --filter @elections-tracker/worker legislation:load

interface CachedBill extends OsBill {
  actions?: { date: string; description: string; classification: string[] }[];
  matchedQuery: string;
}

const CACHE =
  process.env.LEGISLATION_CACHE ?? "../../data/openstates-history.jsonl";
const FROM = process.env.INGEST_FROM;
const UNTIL = process.env.ELECTION_DATE ?? process.env.INGEST_UNTIL;
if (!FROM || !UNTIL) throw new Error("set INGEST_FROM and ELECTION_DATE");
if (!existsSync(CACHE)) throw new Error(`cache not found: ${CACHE}`);

const events: SourceEvent[] = [];
let seenLines = 0;
const seenIds = new Set<string>();
for (const line of readFileSync(CACHE, "utf8").split("\n")) {
  if (!line) continue;
  const bill = JSON.parse(line) as CachedBill & { termComplete?: string };
  if (bill.termComplete) continue;
  seenLines++;
  if (seenIds.has(bill.id)) continue;
  seenIds.add(bill.id);

  const state = STATE_BY_NAME[bill.jurisdiction?.name ?? ""];
  if (!state) continue;
  if (!ELECTION_TITLE_RE.test(bill.title)) continue;
  const introduced = bill.first_action_date?.slice(0, 10);
  if (!introduced || introduced < FROM || introduced > UNTIL) continue;

  // Point-in-time: the bill's status of record on the window end is the
  // latest action on or before it. Later actions do not exist yet.
  const inWindow = (bill.actions ?? [])
    .filter((a) => a.date && a.date.slice(0, 10) <= UNTIL)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = inWindow[inWindow.length - 1];
  const status = billStatus(latest?.description ?? null);
  const tags = MECHANISM_TAGS.filter(([re]) => re.test(bill.title)).map(
    ([, t]) => t,
  );

  events.push({
    source: "openstates",
    externalId: bill.id,
    occurredAt: `${introduced}T00:00:00Z`,
    jurisdictionType: "STATE",
    jurisdictions: [state],
    eventTypes: [...new Set<EventType>(["STATE_DIRECTIVE", ...tags])],
    title: `${state} ${bill.identifier}: ${bill.title.slice(0, 400)}`,
    summary:
      `${bill.jurisdiction.name} ${bill.session} — latest action: ` +
      `${latest?.description ?? "introduced"} (${latest?.date?.slice(0, 10) ?? introduced}).`,
    factualStatus: "CONFIRMED",
    operationalStatus: status,
    confidence: 0.85,
    material: true,
    expiredAt:
      status === "EXPIRED" && latest?.date
        ? `${latest.date.slice(0, 10)}T00:00:00Z`
        : null,
    inForceStatus: status === "EXPIRED" ? "PROPOSED" : undefined,
    rawData: {
      url: bill.openstates_url,
      matchedQuery: bill.matchedQuery,
      session: bill.session,
      historicalLoad: true,
    },
  });
}

const counts = await insertEvents(events);
const enacted = events.filter((e) => e.operationalStatus === "ACTIVE").length;
console.log(
  `legislation[${FROM}..${UNTIL}] cache=${seenLines} window=${events.length} ` +
    `inserted=${counts.inserted} skipped=${counts.skipped} enacted=${enacted}`,
);
await pool.end();
