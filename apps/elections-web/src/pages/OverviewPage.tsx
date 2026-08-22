import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid2";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import type {
  AssessmentChange,
  HouseControlSummary,
  ThreatHistoryPoint,
} from "@elections-tracker/shared";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { fetchChanges, fetchHouseControl, fetchThreatHistory } from "../api.js";

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

// §35 threat time series: mean risk index over time. A single point renders
// as a dot with its value; the line earns its place as history accumulates.
function ThreatChart({ points }: { points: ThreatHistoryPoint[] }) {
  const width = 640;
  const height = 110;
  const pad = 10;
  const max = Math.max(...points.map((p) => p.overallIndex), 10);
  const x = (i: number) =>
    points.length === 1
      ? width / 2
      : pad + (i / (points.length - 1)) * (width - 2 * pad);
  const y = (v: number) => height - pad - (v / max) * (height - 2 * pad);
  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.overallIndex).toFixed(1)}`)
    .join(" ");
  const last = points[points.length - 1]!;
  return (
    <Box sx={{ overflowX: "auto" }}>
      <svg width={width} height={height} role="img" aria-label="House control threat over time">
        {points.length > 1 && (
          <path d={path} fill="none" stroke="#da654c" strokeWidth={2} />
        )}
        <circle cx={x(points.length - 1)} cy={y(last.overallIndex)} r={4} fill="#da654c" />
        <text
          x={x(points.length - 1) - 8}
          y={y(last.overallIndex) - 8}
          fill="#ddd"
          fontSize={12}
          textAnchor="end"
        >
          {last.overallIndex}
        </text>
      </svg>
    </Box>
  );
}

export function OverviewPage() {
  const [summary, setSummary] = useState<HouseControlSummary | null>(null);
  const [history, setHistory] = useState<ThreatHistoryPoint[] | null>(null);
  const [recentChanges, setRecentChanges] = useState<AssessmentChange[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchHouseControl(controller.signal),
      fetchThreatHistory(controller.signal),
      fetchChanges({ minDelta: 0.01 }, controller.signal),
    ])
      .then(([control, historyPoints, changes]) => {
        setSummary(control);
        setHistory(historyPoints);
        setRecentChanges(
          changes.filter((c) => !c.firstAssessment).slice(0, 5),
        );
      })
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
      {history && history.length > 0 && (
        <Card variant="outlined">
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              House control threat over time
            </Typography>
            <ThreatChart points={history} />
            {recentChanges.length > 0 && (
              <>
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ display: "block", mt: 1 }}
                >
                  Why did risk change?
                </Typography>
                {recentChanges.map((change, i) => (
                  <Stack key={i} direction="row" spacing={1} sx={{ py: 0.25 }}>
                    <Typography
                      variant="body2"
                      sx={{
                        color: change.deltaRisk > 0 ? "#da654c" : "#5590d2",
                        minWidth: 32,
                      }}
                    >
                      {change.deltaRisk > 0 ? "+" : ""}
                      {Math.round(change.deltaRisk * 100)}
                    </Typography>
                    <Link
                      component={RouterLink}
                      to={`/races/${change.districtId}`}
                      variant="body2"
                    >
                      {change.districtId}
                    </Link>
                    <Typography variant="body2" color="text.secondary" noWrap>
                      {change.newEvents[0]?.title ??
                        Object.entries(change.dimensionDeltas ?? {})
                          .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                          .slice(0, 1)
                          .map(([k]) => k)
                          .join("")}
                    </Typography>
                  </Stack>
                ))}
                <Link component={RouterLink} to="/changes" variant="body2">
                  Full change ledger →
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Typography variant="body2" color="text.secondary">
        Confidence: {summary.confidence.replace("_", " ")} · Methodology{" "}
        {summary.methodologyVersion}
      </Typography>
    </Stack>
  );
}
