import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { DIMENSION_LABELS, type AssessmentChange } from "@elections-tracker/shared";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { fetchChanges } from "../api.js";
import { groupChanges, type LedgerGroup } from "../changes.js";
import { PageHeader } from "../components/PageHeader.js";

// Event-centric ledger: each entry is one driving event and everything it
// moved. Warm = risk up, cool = risk down, matching the map palette.
const UP_COLOR = "#da654c";
const DOWN_COLOR = "#5590d2";
const MIN_DELTA = 0.005;
const TOP_DISTRICTS = 8;

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

function dimLabel(key: string): string {
  return DIMENSION_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").toLowerCase().trim();
}

function pct(value: number): string {
  return `${value > 0 ? "+" : ""}${Math.round(value * 100)}`;
}

function GroupCard({ group }: { group: LedgerGroup }) {
  const up = group.delta > 0;
  const shown = group.districts.slice(0, TOP_DISTRICTS);
  const rest = group.districts.length - shown.length;
  return (
    <Paper variant="outlined" sx={{ p: 2, mb: 1.5 }}>
      <Stack direction="row" spacing={1.5} alignItems="baseline">
        <Typography variant="h6" sx={{ color: up ? UP_COLOR : DOWN_COLOR, minWidth: 48 }}>
          {up ? "▲" : "▼"} {pct(group.delta)}
        </Typography>
        <Stack spacing={0.25} sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" sx={{ lineHeight: 1.4 }}>
            {group.eventTitle ?? "Signal decay and data refresh"}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {group.national
              ? `nationwide effect · ${group.districts.length} races moved above threshold`
              : `moved ${group.districts.length} race${group.districts.length === 1 ? "" : "s"}`}
            {group.sourceUrl && (
              <>
                {" · "}
                <Link href={group.sourceUrl} target="_blank" rel="noopener">
                  source ↗
                </Link>
              </>
            )}
          </Typography>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
        {shown.map((district) => (
          <Chip
            key={district.id}
            size="small"
            variant="outlined"
            clickable
            component={RouterLink}
            to={`/races/${district.id}`}
            label={`${district.id} ${pct(district.delta)}`}
            sx={{
              color: district.delta > 0 ? UP_COLOR : DOWN_COLOR,
              borderColor: "rgba(255,255,255,0.23)",
            }}
          />
        ))}
        {rest > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
            and {rest} more
          </Typography>
        )}
      </Stack>

      {group.dimensionDeltas && Object.keys(group.dimensionDeltas).length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
          {Object.entries(group.dimensionDeltas)
            .filter(([, delta]) => Math.round(delta * 100) !== 0)
            .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
            .slice(0, 4)
            .map(([dim, delta]) => (
              <Chip
                key={dim}
                size="small"
                variant="outlined"
                label={`${dimLabel(dim)} ${pct(delta)}`}
                sx={{ color: "text.secondary" }}
              />
            ))}
        </Stack>
      )}
    </Paper>
  );
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
    const days = new Map<string, LedgerGroup[]>();
    for (const group of groupChanges(changes ?? [])) {
      const list = days.get(group.day);
      if (list) list.push(group);
      else days.set(group.day, [group]);
    }
    return [...days.entries()];
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
      <PageHeader
        title="What changed"
        meta="one entry per driving event with every race it moved · indices are ordinal, not probabilities"
      />
      {byDay.map(([day, groups]) => (
        <Box key={day} sx={{ mb: 2.5 }}>
          <Typography
            variant="overline"
            color="text.secondary"
            sx={{ display: "block", mb: 1 }}
          >
            {DAY_FORMAT.format(new Date(`${day}T00:00:00Z`))}
          </Typography>
          {groups.map((group, i) => (
            <GroupCard key={i} group={group} />
          ))}
        </Box>
      ))}
    </Box>
  );
}
