import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { ElectionEventSummary } from "@elections-tracker/shared";
import { useEffect, useState } from "react";
import { fetchEvents } from "../api.js";

export function EventsPage() {
  const [events, setEvents] = useState<ElectionEventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchEvents(controller.signal)
      .then(setEvents)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "failed to load");
        }
      });
    return () => controller.abort();
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!events) return <CircularProgress />;
  if (events.length === 0) {
    return (
      <Typography color="text.secondary">
        No material events published yet.
      </Typography>
    );
  }

  return (
    <Stack spacing={2} sx={{ maxWidth: 800 }}>
      {events.map((event) => (
        <Paper key={event.id} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="caption" color="text.secondary">
              {new Date(event.occurredAt).toLocaleDateString()}
            </Typography>
            <Chip size="small" label={event.factualStatus} />
            <Chip size="small" variant="outlined" label={event.operationalStatus} />
          </Stack>
          <Typography variant="subtitle1">{event.title}</Typography>
          <Typography variant="body2" color="text.secondary">
            {event.summary}
          </Typography>
        </Paper>
      ))}
    </Stack>
  );
}
