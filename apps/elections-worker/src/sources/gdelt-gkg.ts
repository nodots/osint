import { unzipSync } from "fflate";
import type { EventType } from "@elections-tracker/shared";
import type { SourceEvent } from "../services/ingest.js";

// GDELT Global Knowledge Graph daily files (free, no key) as the DISCOVERY
// TIER (staged plan / methodology doc §35 tiers 2–4): news-reported election
// administration activity that never touches the Federal Register or a
// docket — county certification fights, purge announcements, raids.
//
// Discovery events are deliberately weak objects: one clustered event per
// (state, mechanism, day), REPORTED / confidence 0.3 / material=false, so
// they inform the timeline but move no risk signal until a Tier-1 source (or
// the future triage layer) corroborates. A cluster needs articles from at
// least MIN_DOMAINS distinct outlets to exist at all.
//
// Forward-looking only: the daily run scans yesterday's file; backfill skips
// this source (580 × 30MB is not a backfill medium).

const BASE = process.env.GDELT_GKG_BASE ?? "https://data.gdeltproject.org/gkg";
const MIN_DOMAINS = 2;

// Mechanism extraction from URL slugs. The GKG row already carries election
// themes; these narrow to a mechanism our taxonomy can hold.
const MECHANISMS: {
  key: string;
  re: RegExp;
  requireElectionTerm?: boolean;
  type: EventType;
  label: string;
}[] =
  [
    { key: "certification", re: /certif/i, type: "CERTIFICATION", label: "certification" },
    { key: "purge", re: /purge|voter-roll|voter_roll|list-maintenance/i, type: "VOTER_ROLL_PURGE", label: "voter-roll" },
    { key: "registration", re: /voter-registration|voter_registration/i, type: "VOTER_REGISTRATION", label: "voter registration" },
    { key: "voter-data", re: /voter-data|voter-file|voter_data|voter_file/i, type: "VOTER_ROLL_ACCESS", label: "voter data access" },
    { key: "mail", re: /mail-in|mail_ballot|mail-ballot|absentee|drop-box|dropbox/i, type: "MAIL_BALLOT_RULE", label: "mail voting" },
    { key: "recount", re: /recount/i, type: "RECOUNT", label: "recount" },
    { key: "audit", re: /election-audit|ballot-audit|election_audit/i, type: "AUDIT", label: "election audit" },
    // Investigation terms are everywhere in political news; require an
    // election term in the same URL so a generic scandal never clusters.
    {
      key: "investigation",
      re: /raid|subpoena|indict|investigat/i,
      requireElectionTerm: true,
      type: "FEDERAL_INVESTIGATION",
      label: "investigation",
    },
  ];
const ELECTION_TERM_RE = /elect|voter|voting|ballot/i;

const STATE_NAMES: Record<string, string> = {
  US01: "AL", US02: "AK", US04: "AZ", US05: "AR", US06: "CA", US08: "CO",
  US09: "CT", US10: "DE", US12: "FL", US13: "GA", US15: "HI", US16: "ID",
  US17: "IL", US18: "IN", US19: "IA", US20: "KS", US21: "KY", US22: "LA",
  US23: "ME", US24: "MD", US25: "MA", US26: "MI", US27: "MN", US28: "MS",
  US29: "MO", US30: "MT", US31: "NE", US32: "NV", US33: "NH", US34: "NJ",
  US35: "NM", US36: "NY", US37: "NC", US38: "ND", US39: "OH", US40: "OK",
  US41: "OR", US42: "PA", US44: "RI", US45: "SC", US46: "SD", US47: "TN",
  US48: "TX", US49: "UT", US50: "VT", US51: "VA", US53: "WA", US54: "WV",
  US55: "WI", US56: "WY",
};
// GKG ADM1 codes are postal-based (USTX), FIPS-based in older rows (US48);
// accept both.
const POSTAL = new Set(Object.values(STATE_NAMES));

function statesFromLocations(locations: string): Set<string> {
  const out = new Set<string>();
  for (const loc of locations.split(";")) {
    const parts = loc.split("#");
    if (parts[0] !== "2") continue; // type 2 = US state
    const adm1 = parts[3] ?? "";
    const mapped = STATE_NAMES[adm1];
    if (mapped) out.add(mapped);
    else if (adm1.startsWith("US") && POSTAL.has(adm1.slice(2))) {
      out.add(adm1.slice(2));
    }
  }
  return out;
}

function domainOf(url: string): string {
  const match = /^https?:\/\/(?:www\.)?([^/]+)/i.exec(url);
  return match?.[1]?.toLowerCase() ?? "unknown";
}

export interface GkgCluster {
  state: string;
  mechanismKey: string;
  type: EventType;
  label: string;
  urls: string[];
  domains: Set<string>;
}

// Exported for tests: cluster one day's GKG rows.
export function clusterGkg(csv: string): Map<string, GkgCluster> {
  const clusters = new Map<string, GkgCluster>();
  for (const line of csv.split("\n")) {
    const fields = line.split("\t");
    const themes = fields[3] ?? "";
    if (!themes.includes("ELECTION")) continue;
    const locations = fields[4] ?? "";
    const states = statesFromLocations(locations);
    if (states.size === 0 || states.size > 3) continue; // >3 states = national wire story
    const urls = (fields[10] ?? "").split("<UDIV>").filter(Boolean);
    for (const url of urls.slice(0, 10)) {
      for (const mechanism of MECHANISMS) {
        if (!mechanism.re.test(url)) continue;
        if (mechanism.requireElectionTerm && !ELECTION_TERM_RE.test(url)) {
          continue;
        }
        for (const state of states) {
          const key = `${state}|${mechanism.key}`;
          let cluster = clusters.get(key);
          if (!cluster) {
            cluster = {
              state,
              mechanismKey: mechanism.key,
              type: mechanism.type,
              label: mechanism.label,
              urls: [],
              domains: new Set(),
            };
            clusters.set(key, cluster);
          }
          const domain = domainOf(url);
          if (!cluster.domains.has(domain) && cluster.urls.length < 5) {
            cluster.urls.push(url);
          }
          cluster.domains.add(domain);
        }
      }
    }
  }
  return clusters;
}

export async function fetchGkgDiscovery(day: Date): Promise<SourceEvent[]> {
  const stamp = day.toISOString().slice(0, 10).replace(/-/g, "");
  const url = `${BASE}/${stamp}.gkg.csv.zip`;
  const res = await fetch(url);
  if (res.status === 404) {
    // The daily file lands early the next morning; a 404 just means "not
    // published yet" and the next run catches it.
    console.log(`gkg ${stamp} not published yet`);
    return [];
  }
  if (!res.ok) throw new Error(`gdelt gkg: ${res.status} ${res.statusText}`);
  const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const entry = Object.values(zip)[0];
  if (!entry) throw new Error("gdelt gkg: empty zip");
  const csv = new TextDecoder().decode(entry);

  const events: SourceEvent[] = [];
  for (const cluster of clusterGkg(csv).values()) {
    if (cluster.domains.size < MIN_DOMAINS) continue;
    events.push({
      source: "gdelt_gkg",
      externalId: `${stamp}:${cluster.state}:${cluster.mechanismKey}`,
      occurredAt: `${day.toISOString().slice(0, 10)}T00:00:00Z`,
      jurisdictionType: "STATE",
      jurisdictions: [cluster.state],
      eventTypes: [cluster.type],
      title: `News reports: ${cluster.label} activity in ${cluster.state} (${cluster.domains.size} outlets)`,
      summary:
        `${cluster.domains.size} outlets reported ${cluster.label}-related election ` +
        `activity in ${cluster.state}. Discovery-tier signal (uncorroborated news ` +
        `clustering); does not move risk scores.`,
      factualStatus: "REPORTED",
      operationalStatus: "ACTIVE",
      confidence: 0.3,
      material: false,
      rawData: {
        url: cluster.urls[0] ?? "",
        urls: cluster.urls,
        outletCount: cluster.domains.size,
        tier: "discovery",
      },
    });
  }
  return events;
}
