import type {
  AssessmentChange,
  ElectionEventSummary,
  HouseControlSummary,
  RaceDetail,
  RaceSummary,
  ThreatHistoryPoint,
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

export function fetchChanges(
  params: { since?: string; minDelta?: number } = {},
  signal?: AbortSignal,
) {
  const query = new URLSearchParams();
  if (params.since) query.set("since", params.since);
  if (params.minDelta !== undefined) {
    query.set("minDelta", String(params.minDelta));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return request<AssessmentChange[]>(`/changes${suffix}`, signal);
}

export function fetchThreatHistory(signal?: AbortSignal) {
  return request<ThreatHistoryPoint[]>("/house-control/history", signal);
}

export function fetchRaceDetail(districtId: string, signal?: AbortSignal) {
  return request<RaceDetail>(
    `/races/${encodeURIComponent(districtId)}`,
    signal,
  );
}

export interface DistrictFeatureProperties {
  id: string;
  displayName: string;
  state: string;
  districtNumber: number;
  currentMember: string | null;
  incumbentParty: string | null;
  raceId: number | null;
  rating: string | null;
  projectedMargin: number | null;
  democraticCandidate: string | null;
  republicanCandidate: string | null;
  interventionRelevance: number | null;
  centroid: [number, number];
}

export function fetchDistrictsGeoJSON(signal?: AbortSignal) {
  return request<GeoJSON.FeatureCollection>("/districts/geojson", signal);
}

export function fetchEvents(signal?: AbortSignal) {
  return request<ElectionEventSummary[]>("/events", signal);
}
