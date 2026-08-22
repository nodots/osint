import type { AssessmentChange } from "@elections-tracker/shared";

// The event-centric ledger view: one analytical unit per (day, driving
// event, direction). A single federal rule or injunction moving many —
// or all — districts is one story, not four hundred rows.

export interface LedgerGroup {
  day: string; // "YYYY-MM-DD"
  eventId: number | null;
  eventTitle: string | null;
  sourceUrl: string | null;
  // Largest-magnitude race delta in the group (the headline number).
  delta: number;
  national: boolean;
  // Sorted by |delta| desc.
  districts: { id: string; delta: number }[];
  // From the largest-magnitude row — which dimensions the event moved.
  dimensionDeltas: Record<string, number> | null;
}

const NATIONAL_THRESHOLD = 30;

export function groupChanges(changes: AssessmentChange[]): LedgerGroup[] {
  const groups = new Map<string, LedgerGroup>();
  for (const change of changes) {
    if (change.firstAssessment) continue;
    const day = change.changedAt.slice(0, 10);
    const event = change.newEvents[0] ?? null;
    const key = `${day}|${event?.id ?? "drift"}|${change.deltaRisk > 0 ? "+" : "-"}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        day,
        eventId: event?.id ?? null,
        eventTitle: event?.title ?? null,
        sourceUrl: event?.sourceUrl ?? null,
        delta: change.deltaRisk,
        national: false,
        districts: [],
        dimensionDeltas: change.dimensionDeltas,
      };
      groups.set(key, group);
    }
    group.districts.push({ id: change.districtId, delta: change.deltaRisk });
    if (Math.abs(change.deltaRisk) > Math.abs(group.delta)) {
      group.delta = change.deltaRisk;
      group.dimensionDeltas = change.dimensionDeltas;
    }
    if (group.districts.length > NATIONAL_THRESHOLD) group.national = true;
  }
  for (const group of groups.values()) {
    group.districts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.day.localeCompare(a.day) || Math.abs(b.delta) - Math.abs(a.delta),
  );
}
