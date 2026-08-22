import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { AssessmentChange } from "@elections-tracker/shared";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { fetchChanges } from "../api.js";

// "What changed" (methodology doc §23/§38): the auditable change ledger.
// Risk-up in the red arm's color, risk-down in the blue arm's — matching the
// map's diverging palette semantics of warm = concerning.
const UP_COLOR = "#da654c";
const DOWN_COLOR = "#5590d2";
const MIN_DELTA = 0.005;

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function dimLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .trim();
}

function pct(value: number): string {
  return `${value > 0 ? "+" : ""}${Math.round(value * 100)}`;
}

export function ChangesPage() {
  const [changes, setChanges] = useState<AssessmentChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchChanges({ minDelta: MIN_DELTA }, controller.signal)
      .then(setChanges)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "failed to load");
        }
      });
    return () => controller.abort();
  }, []);

  const byDay = useMemo(() => {
    const groups = new Map<string, AssessmentChange[]>();
    for (const change of changes ?? []) {
      // First-ever assessments are baselines, not news.
      if (change.firstAssessment) continue;
      const key = change.changedAt.slice(0, 10);
      const group = groups.get(key);
      if (group) group.push(change);
      else groups.set(key, [change]);
    }
    return [...groups.entries()];
  }, [changes]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!changes) return <CircularProgress />;
  if (byDay.length === 0) {
    return (
      <Typography color="text.secondary">
        No material risk changes on record yet. The ledger fills as daily
        ingestion observes movement.
      </Typography>
    );
  }

  return (
    <Box sx={{ maxWidth: 860 }}>
      <Typography variant="h5" sx={{ fontWeight: 300, mb: 1 }}>
        What changed
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Every entry is a movement in a race&apos;s risk index with the events
        that drove it. Indices are ordinal, not probabilities.
      </Typography>
      {byDay.map(([day, dayChanges]) => (
        <Box key={day} sx={{ mb: 2 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: "block", mb: 1 }}
          >
            {DAY_FORMAT.format(new Date(`${day}T00:00:00Z`))}
          </Typography>
          {dayChanges.map((change, i) => {
            const up = change.deltaRisk > 0;
            return (
              <Paper key={i} variant="outlined" sx={{ p: 2, mb: 1 }}>
                <Stack direction="row" spacing={1.5} alignItems="baseline">
                  <Typography
                    variant="h6"
                    sx={{ color: up ? UP_COLOR : DOWN_COLOR, minWidth: 44 }}
                  >
                    {up ? "▲" : "▼"} {pct(change.deltaRisk)}
                  </Typography>
                  <Link
                    component={RouterLink}
                    to={`/races/${change.districtId}`}
                    variant="subtitle1"
                  >
                    {change.districtId}
                  </Link>
                  <Typography variant="body2" color="text.secondary">
                    {change.displayName} · risk index now{" "}
                    {Math.round(change.currentRisk * 100)}
                  </Typography>
                </Stack>
                {change.dimensionDeltas &&
                  Object.keys(change.dimensionDeltas).length > 0 && (
                    <Stack
                      direction="row"
                      spacing={1}
                      flexWrap="wrap"
                      useFlexGap
                      sx={{ mt: 1 }}
                    >
                      {Object.entries(change.dimensionDeltas)
                        .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                        .slice(0, 4)
                        .map(([dim, delta]) => (
                          <Chip
                            key={dim}
                            size="small"
                            variant="outlined"
                            label={`${dimLabel(dim)} ${pct(delta)}`}
                          />
                        ))}
                      {change.deltaResistance != null &&
                        change.deltaResistance !== 0 && (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={`resistance ${pct(change.deltaResistance)}`}
                          />
                        )}
                    </Stack>
                  )}
                {change.newEvents.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    {change.newEvents.slice(0, 4).map((event) => (
                      <Typography
                        key={event.id}
                        variant="body2"
                        color="text.secondary"
                      >
                        ↳ {event.title}
                      </Typography>
                    ))}
                  </Box>
                )}
              </Paper>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
