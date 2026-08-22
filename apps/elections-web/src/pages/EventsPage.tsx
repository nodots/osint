import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Paper from "@mui/material/Paper";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  EVENT_TYPES,
  confidenceLabel,
  type ElectionEventSummary,
  type RaceSummary,
} from "@elections-tracker/shared";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { fetchEvents, fetchRaces } from "../api.js";

const MONTH_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function typeLabel(eventType: string): string {
  return eventType.toLowerCase().replace(/_/g, " ");
}

// Discovered-vs-occurred matters analytically (spec §5), but the public
// timeline is ordered by occurrence; grouping is by UTC month.
function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function EventsPage() {
  const [events, setEvents] = useState<ElectionEventSummary[] | null>(null);
  const [races, setRaces] = useState<RaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [stateFilter, setStateFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchEvents(controller.signal),
      fetchRaces(controller.signal),
    ])
      .then(([eventList, raceList]) => {
        setEvents(eventList);
        setRaces(raceList);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "failed to load");
        }
      });
    return () => controller.abort();
  }, []);

  const districtByRaceId = useMemo(() => {
    const map = new Map<number, string>();
    for (const race of races ?? []) map.set(race.id, race.districtId);
    return map;
  }, [races]);

  const states = useMemo(() => {
    const set = new Set<string>();
    for (const event of events ?? []) {
      for (const j of event.jurisdictions) {
        if (j.length === 2) set.add(j);
      }
    }
    return [...set].sort();
  }, [events]);

  const filtered = useMemo(
    () =>
      (events ?? []).filter(
        (event) =>
          (typeFilter === "ALL" ||
            event.eventTypes.includes(
              typeFilter as (typeof EVENT_TYPES)[number], // Select value round-trips one of the EVENT_TYPES options
            )) &&
          (stateFilter === "ALL" ||
            event.jurisdictions.includes(stateFilter)) &&
          (statusFilter === "ALL" || event.factualStatus === statusFilter),
      ),
    [events, typeFilter, stateFilter, statusFilter],
  );

  const byMonth = useMemo(() => {
    const groups = new Map<string, ElectionEventSummary[]>();
    for (const event of filtered) {
      const key = monthKey(event.occurredAt);
      const group = groups.get(key);
      if (group) group.push(event);
      else groups.set(key, [event]);
    }
    return [...groups.entries()]; // insertion order — API returns newest first
  }, [filtered]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!events || !races) return <CircularProgress />;

  return (
    <Box sx={{ maxWidth: 860 }}>
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Event type</InputLabel>
          <Select
            value={typeFilter}
            label="Event type"
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <MenuItem value="ALL">All types</MenuItem>
            {EVENT_TYPES.map((t) => (
              <MenuItem key={t} value={t}>
                {typeLabel(t)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>State</InputLabel>
          <Select
            value={stateFilter}
            label="State"
            onChange={(e) => setStateFilter(e.target.value)}
          >
            <MenuItem value="ALL">All states</MenuItem>
            {states.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Factual status</InputLabel>
          <Select
            value={statusFilter}
            label="Factual status"
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <MenuItem value="ALL">All statuses</MenuItem>
            {["CONFIRMED", "REPORTED", "ALLEGED", "DISPUTED", "RETRACTED"].map(
              (s) => (
                <MenuItem key={s} value={s}>
                  {s.toLowerCase()}
                </MenuItem>
              ),
            )}
          </Select>
        </FormControl>
      </Stack>

      {filtered.length === 0 && (
        <Typography color="text.secondary">
          {events.length === 0
            ? "No material events published yet."
            : "No events match the current filters."}
        </Typography>
      )}

      {byMonth.map(([key, monthEvents]) => (
        <Box key={key} sx={{ mb: 1 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: "block", mb: 1 }}
          >
            {MONTH_FORMAT.format(new Date(`${key}-01T00:00:00Z`))}
          </Typography>
          {/* Timeline rail: date gutter, dot on a vertical line, card. */}
          {monthEvents.map((event) => (
            <Stack key={event.id} direction="row" spacing={0}>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ width: 64, flexShrink: 0, pt: 2, textAlign: "right" }}
              >
                {DAY_FORMAT.format(new Date(event.occurredAt))}
              </Typography>
              <Box
                sx={{
                  width: 33,
                  flexShrink: 0,
                  position: "relative",
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    left: 15,
                    top: 0,
                    bottom: 0,
                    width: "2px",
                    bgcolor: "divider",
                  },
                }}
              >
                <Box
                  sx={{
                    position: "absolute",
                    left: 11,
                    top: 20,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    bgcolor: "primary.main",
                  }}
                />
              </Box>
              <Paper variant="outlined" sx={{ p: 2, mb: 1.5, flex: 1 }}>
                <Stack
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  flexWrap="wrap"
                  useFlexGap
                  sx={{ mb: 0.75 }}
                >
                  {event.eventTypes.map((t) => (
                    <Chip key={t} size="small" label={typeLabel(t)} />
                  ))}
                  <Chip
                    size="small"
                    variant="outlined"
                    label={event.factualStatus.toLowerCase()}
                  />
                  <Chip
                    size="small"
                    variant="outlined"
                    label={event.operationalStatus.toLowerCase()}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {event.jurisdictionType.toLowerCase()}
                    {event.jurisdictions.length > 0 &&
                      ` · ${event.jurisdictions.join(", ")}`}
                    {` · confidence ${confidenceLabel(event.confidence)
                      .toLowerCase()
                      .replace("_", " ")}`}
                  </Typography>
                </Stack>
                <Typography variant="subtitle1">{event.title}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {event.summary}
                </Typography>
                {event.affectedRaceIds.length > 0 && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    {event.affectedRaceIds.map((raceId) => {
                      const districtId = districtByRaceId.get(raceId);
                      if (!districtId) return null;
                      return (
                        <Chip
                          key={raceId}
                          size="small"
                          label={districtId}
                          component={RouterLink}
                          to={`/races/${districtId}`}
                          clickable
                          color="primary"
                          variant="outlined"
                        />
                      );
                    })}
                  </Stack>
                )}
              </Paper>
            </Stack>
          ))}
        </Box>
      ))}
    </Box>
  );
}
