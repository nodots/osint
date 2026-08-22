import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { HouseControlSummary } from "@elections-tracker/shared";
import { useEffect, useState } from "react";
import { fetchHouseControl } from "../api.js";

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="overline" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h4">{value}</Typography>
      </CardContent>
    </Card>
  );
}

export function OverviewPage() {
  const [summary, setSummary] = useState<HouseControlSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchHouseControl(controller.signal)
      .then(setSummary)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "failed to load");
        }
      });
    return () => controller.abort();
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!summary) return <CircularProgress />;

  const projection = summary.baselineProjection;

  return (
    <Stack spacing={3} sx={{ maxWidth: 900 }}>
      <Typography variant="h5" sx={{ fontWeight: 300 }}>
        {summary.cycle} House Election Process Risk
      </Typography>

      {projection && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Baseline projection
            </Typography>
            <Stack direction="row" justifyContent="space-between">
              <Typography variant="h5" sx={{ color: "#5590d2" }}>
                D {projection.dem}
              </Typography>
              <Typography variant="h5" sx={{ color: "#da654c" }}>
                R {projection.rep}
              </Typography>
            </Stack>
            {/* Seat bar with the 218-majority marker. */}
            <Box sx={{ position: "relative", mt: 1 }}>
              <Stack direction="row" spacing="2px">
                <Box
                  sx={{
                    height: 12,
                    borderRadius: "4px 0 0 4px",
                    bgcolor: "#2a6ab8",
                    width: `${(projection.dem / 435) * 100}%`,
                  }}
                />
                <Box
                  sx={{
                    height: 12,
                    borderRadius: "0 4px 4px 0",
                    bgcolor: "#c23b2b",
                    flex: 1,
                  }}
                />
              </Stack>
              <Box
                sx={{
                  position: "absolute",
                  left: `${(218 / 435) * 100}%`,
                  top: -4,
                  bottom: -4,
                  width: "2px",
                  bgcolor: "text.secondary",
                }}
              />
            </Box>
            <Typography variant="caption" color="text.secondary">
              218 for control · seats projected by sign of the derived margin —
              this is a baseline, not a forecast
            </Typography>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Metric
            label="Seats to alter control"
            value={
              summary.seatsToFlipControl == null
                ? "—"
                : String(summary.seatsToFlipControl)
            }
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Metric label="Control threat" value={summary.controlThreat} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Metric
            label="Competitive races"
            value={String(summary.competitiveRaces)}
          />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Metric label="High-risk races" value={String(summary.highRiskRaces)} />
        </Grid>
        <Grid size={{ xs: 6, sm: 3 }}>
          <Metric
            label="High-risk + pivotal"
            value={String(summary.highRiskPivotalRaces)}
          />
        </Grid>
      </Grid>
      <Typography variant="body2" color="text.secondary">
        Confidence: {summary.confidence.replace("_", " ")} · Methodology{" "}
        {summary.methodologyVersion}
      </Typography>
    </Stack>
  );
}
