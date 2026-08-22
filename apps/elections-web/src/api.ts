import type {
  ElectionEventSummary,
  HouseControlSummary,
  RaceSummary,
} from "@elections-tracker/shared";

const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:6752/api/elections";

export class ApiError extends Error {}

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, { signal });
  if (!resp.ok) {
    let detail = `${resp.status} ${resp.statusText}`;
    try {
      const body: { error?: string } = await resp.json();
      if (body.error) detail = body.error;
    } catch {
      // ignore parse failure; keep status text
    }
    throw new ApiError(detail);
  }
  return (await resp.json()) as T; // response shape is the endpoint's contract
}

export function fetchHouseControl(signal?: AbortSignal) {
  return request<HouseControlSummary>("/house-control", signal);
}

export function fetchRaces(signal?: AbortSignal) {
  return request<RaceSummary[]>("/races", signal);
}

export function fetchEvents(signal?: AbortSignal) {
  return request<ElectionEventSummary[]>("/events", signal);
}
