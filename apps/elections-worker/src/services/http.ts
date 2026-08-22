// fetch with backoff for rate-limited hosts (CourtListener's anonymous tier
// in particular): 429 and transient 5xx wait and retry instead of failing the
// whole source run.

const MAX_ATTEMPTS = 4;
const RETRY_STATUS = new Set([429, 502, 503, 504]);

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, init);
    if (!RETRY_STATUS.has(res.status)) return res;
    lastStatus = res.status;
    if (attempt === MAX_ATTEMPTS) break;
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 45000 * attempt;
    console.log(
      `fetch ${res.status}, waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS})`,
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new Error(`rate-limited after ${MAX_ATTEMPTS} attempts (${lastStatus})`);
}
