import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { TERM_QUERIES, type OsBill } from "./sources/openstates.js";

// One-time historical sweep of state election legislation for the §43
// baselines. The OpenStates v3 API's full-text search has no date floor —
// only the live source's updated_since filtering is bound to the present —
// so quoted-phrase queries sorted by first action (newest first) walk back
// through the decade and stop at the cutoff. Bills land in a JSONL cache
// (one line per bill, with action histories) that legislation:load reads
// per baseline. Resumable: completed terms are marked in the cache and
// skipped on re-run.
//
//   OPENSTATES_API_KEY=... pnpm --filter @elections-tracker/worker legislation:fetch

const API = "https://v3.openstates.org/bills";
const CUTOFF = process.env.LEGISLATION_CUTOFF ?? "2015-01-01";
const CACHE =
  process.env.LEGISLATION_CACHE ?? "../../data/openstates-history.jsonl";
const DELAY_MS = 6500; // free tier is ~6 requests/minute
const MAX_PAGES_PER_TERM = 800;

interface CachedBill extends OsBill {
  actions?: { date: string; description: string; classification: string[] }[];
  matchedQuery: string;
}

const apiKey = process.env.OPENSTATES_API_KEY;
if (!apiKey) throw new Error("OPENSTATES_API_KEY required");

const seen = new Set<string>();
const doneTerms = new Set<string>();
if (existsSync(CACHE)) {
  for (const line of readFileSync(CACHE, "utf8").split("\n")) {
    if (!line) continue;
    const row = JSON.parse(line) as { id?: string; termComplete?: string };
    if (row.termComplete) doneTerms.add(row.termComplete);
    else if (row.id) seen.add(row.id);
  }
  console.log(
    `resuming: ${seen.size} bills cached, terms done: ${[...doneTerms].join(", ") || "none"}`,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const term of TERM_QUERIES) {
  if (doneTerms.has(term)) continue;
  let kept = 0;
  for (let page = 1; page <= MAX_PAGES_PER_TERM; page++) {
    const params = new URLSearchParams({
      q: `"${term}"`,
      sort: "first_action_desc",
      per_page: "20",
      page: String(page),
      include: "actions",
    });
    interface Page {
      results?: CachedBill[];
      pagination?: { max_page?: number };
    }
    let body: Page | null = null;
    let attempt = 0;
    while (!body && attempt < 6) {
      try {
        const res = await fetch(`${API}?${params}`, {
          headers: { "X-API-KEY": apiKey },
        });
        if (res.ok) {
          body = (await res.json()) as Page;
        } else if (res.status === 429) {
          const detail = await res.text();
          if (/exceeded limit.*day/i.test(detail)) {
            // Daily quota (free tier: 250/day). Not an error — wait it out
            // in hourly probes; the sweep resumes where it stood. Does not
            // count as an attempt.
            console.log(`  daily quota exhausted (${detail.slice(0, 60)}), sleeping 1h`);
            await sleep(3600_000);
          } else {
            attempt++;
            console.log(`  429, waiting ${attempt * 30}s`);
            await sleep(attempt * 30000);
          }
        } else if (res.status >= 500) {
          attempt++;
          console.log(`  ${res.status}, waiting ${attempt * 30}s`);
          await sleep(attempt * 30000);
        } else {
          throw new Error(`openstates: ${res.status} ${res.statusText}`);
        }
      } catch (err) {
        // Network-level failures (timeouts, resets) retry like a 5xx.
        if (err instanceof Error && err.message.startsWith("openstates:")) throw err;
        attempt++;
        console.log(`  fetch failed (${err instanceof Error ? err.message : err}), waiting ${attempt * 30}s`);
        await sleep(attempt * 30000);
      }
    }
    if (!body) throw new Error("openstates: retries exhausted");

    const results = body.results ?? [];
    let pageAllOld = results.length > 0;
    for (const bill of results) {
      if (!bill.first_action_date) continue;
      if (bill.first_action_date.slice(0, 10) < CUTOFF) continue;
      pageAllOld = false;
      if (seen.has(bill.id)) continue;
      seen.add(bill.id);
      kept++;
      appendFileSync(
        CACHE,
        JSON.stringify({ ...bill, matchedQuery: term }) + "\n",
      );
    }
    if (page % 25 === 0 || pageAllOld) {
      console.log(
        `"${term}" page ${page}/${body.pagination?.max_page ?? "?"}: +${kept} kept, ${seen.size} total`,
      );
    }
    // Newest-first: a page entirely below the cutoff means the rest is older.
    if (pageAllOld || page >= (body.pagination?.max_page ?? 1)) break;
    await sleep(DELAY_MS);
  }
  appendFileSync(CACHE, JSON.stringify({ termComplete: term }) + "\n");
  console.log(`term done: "${term}" (+${kept})`);
}
console.log(`sweep complete: ${seen.size} bills in ${CACHE}`);
