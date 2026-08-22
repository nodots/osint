import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid2";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import type {
  AssessmentChange,
  HouseControlSummary,
  RaceSummary,
  ThreatHistoryPoint,
} from "@elections-tracker/shared";
import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  fetchChanges,
  fetchHouseControl,
  fetchRaces,
  fetchThreatHistory,
} from "../api.js";
import { groupChanges } from "../changes.js";
import { PageHeader } from "../components/PageHeader.js";
import {
  TimeSeriesChart,
  type SeriesAnnotation,
} from "../components/TimeSeriesChart.js";
import { NO_RATING_COLOR, RATING_COLORS, ratingLabel } from "../format.js";

const UP_COLOR = "#da654c";
const DOWN_COLOR = "#5590d2";

const THREAT_COLORS: Record<string, string> = {
  LOW: "#5590d2",
  MODERATE: "#ec9d86",
  HIGH: "#da654c",
  UNKNOWN: "rgba(255,255,255,0.5)",
};

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

// Overview shows the top of the event-centric ledger (see ../changes.ts).
function topLedger(changes: AssessmentChange[]) {
  return groupChanges(changes)
    .filter((g) => g.eventTitle !== null || Math.abs(g.delta) >= 0.01)
    .slice(0, 5);
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <Typography variant="caption" color="text.secondary">
      <Box component="span" sx={{ color: "text.primary", fontSize: 15 }}>
        {value}
      </Box>{" "}
      {label}
    </Typography>
  );
}

export function OverviewPage() {
  const [summary, setSummary] = useState<HouseControlSummary | null>(null);
  const [history, setHistory] = useState<ThreatHistoryPoint[] | null>(null);
  const [changes, setChanges] = useState<AssessmentChange[]>([]);
  const [races, setRaces] = useState<RaceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchHouseControl(controller.signal),
      fetchThreatHistory(controller.signal),
      fetchChanges({ minDelta: 0.005 }, controller.signal),
      fetchRaces(controller.signal),
    ])
      .then(([control, historyPoints, changeList, raceList]) => {
        setSummary(control);
        setHistory(historyPoints);
        setChanges(changeList);
        setRaces(raceList);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "failed to load");
        }
      });
    return () => controller.abort();
  }, []);

  const ledger = useMemo(() => topLedger(changes), [changes]);

  const annotations = useMemo<SeriesAnnotation[]>(() => {
    if (!history || history.length < 2) return [];
    // Mark the largest rise and the largest fall, labeled by that day's
    // leading ledger event.
    let rise: { date: string; d: number } | null = null;
    let fall: { date: string; d: number } | null = null;
    for (let i = 1; i < history.length; i++) {
      const d = history[i]!.overallIndex - history[i - 1]!.overallIndex;
      if (d > 0 && (!rise || d > rise.d)) rise = { date: history[i]!.date, d };
      if (d < 0 && (!fall || d < fall.d)) fall = { date: history[i]!.date, d };
    }
    const label = (date: string) => {
      const group = ledger.find((g) => g.day === date && g.eventTitle);
      const title = group?.eventTitle ?? "";
      const short = title.length > 44 ? `${title.slice(0, 42)}…` : title;
      return `${DAY_FORMAT.format(new Date(`${date}T00:00:00Z`))}${short ? ` · ${short}` : ""}`;
    };
    const out: SeriesAnnotation[] = [];
    if (fall) out.push({ date: fall.date, label: label(fall.date), color: DOWN_COLOR, below: true });
    if (rise) out.push({ date: rise.date, label: label(rise.date), color: UP_COLOR });
    return out;
  }, [history, ledger]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!summary || !history) return <CircularProgress />;

  const projection = summary.baselineProjection;
  const tossUps = races.filter((r) => r.rating === "TOSS_UP").length;
  const updated = races.reduce<string | null>(
    (latest, r) =>
      r.assessedAt && (!latest || r.assessedAt > latest) ? r.assessedAt : latest,
    null,
  );
  const topRaces = races
    .filter((r) => r.interventionRelevance != null)
    .slice(0, 5);
  const threatColor = THREAT_COLORS[summary.controlThreat] ?? UP_COLOR;

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <PageHeader
        title="2026 House Election Process Risk"
        meta={`${updated ? `Updated ${updated.slice(0, 10)} · ` : ""}Methodology ${summary.methodologyVersion} · Confidence ${summary.confidence.replace("_", " ")} · indices are ordinal, not probabilities`}
      />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
            <Stack spacing={1}>
              <Typography variant="overline" color="text.secondary">
                Threat to legitimate House control
              </Typography>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Typography variant="h3" sx={{ fontWeight: 300, color: threatColor }}>
                  {summary.controlThreat}
                </Typography>
                {summary.controlThreat === "HIGH" && (
                  <WarningAmberIcon sx={{ color: threatColor }} />
                )}
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {summary.controlThreat === "UNKNOWN"
                  ? "No assessed races yet — no basis for a threat call."
                  : `Risk that control is determined by improper use of governmental process rather than by voters: ${summary.highRiskPivotalRaces} high-risk pivotal race${summary.highRiskPivotalRaces === 1 ? "" : "s"} against a ${summary.seatsToFlipControl ?? "—"}-seat cushion.`}
              </Typography>
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
            <Stack spacing={1.25}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                <Typography variant="overline" color="text.secondary">
                  Baseline projection
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  by derived margins — a baseline, not a forecast
                </Typography>
              </Stack>
              {projection ? (
                <>
                  <Stack direction="row" justifyContent="space-between" alignItems="baseline">
                    <Typography variant="h4" sx={{ fontWeight: 300, color: DOWN_COLOR }}>
                      D {projection.dem}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      <Box component="span" sx={{ color: "text.primary", fontSize: 18 }}>
                        {summary.seatsToFlipControl} seats
                      </Box>{" "}
                      would alter control
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 300, color: UP_COLOR }}>
                      R {projection.rep}
                    </Typography>
                  </Stack>
                  <Box sx={{ position: "relative", height: 22 }}>
                    <Stack direction="row" spacing="2px" sx={{ position: "absolute", left: 0, right: 0, top: 5 }}>
                      <Box sx={{ height: 12, borderRadius: "4px 0 0 4px", bgcolor: "#2a6ab8", width: `${(projection.dem / 435) * 100}%` }} />
                      <Box sx={{ height: 12, borderRadius: "0 4px 4px 0", bgcolor: "#c23b2b", flex: 1 }} />
                    </Stack>
                    <Box sx={{ position: "absolute", left: `${(218 / 435) * 100}%`, top: 0, bottom: 0, width: "2px", bgcolor: "rgba(255,255,255,0.6)" }} />
                    <Typography variant="caption" color="text.secondary" sx={{ position: "absolute", left: `${(218 / 435) * 100}%`, top: -16, transform: "translateX(-50%)", fontSize: 10 }}>
                      218
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={3.5} flexWrap="wrap" useFlexGap>
                    <Row value={summary.competitiveRaces} label="competitive races" />
                    <Row value={summary.highRiskRaces} label="high-risk" />
                    <Row value={summary.highRiskPivotalRaces} label="high-risk and pivotal" />
                    <Row value={tossUps} label="toss-ups" />
                  </Stack>
                </>
              ) : (
                <Typography color="text.secondary" variant="body2">
                  Projection appears once every race carries a derived rating.
                </Typography>
              )}
            </Stack>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.5 }}>
              <Typography variant="overline" color="text.secondary">
                Threat to legitimate control over time
              </Typography>
              <Typography variant="caption" color="text.secondary">
                mean risk index, all 435 races · last {history.length} days
              </Typography>
            </Stack>
            {history.length > 1 ? (
              <TimeSeriesChart
                points={history.map((p) => ({ date: p.date, value: p.overallIndex }))}
                annotations={annotations}
              />
            ) : (
              <Typography color="text.secondary" variant="body2">
                History accumulates as daily runs observe movement.
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: "100%", display: "flex", flexDirection: "column" }}>
            <Typography variant="overline" color="text.secondary" sx={{ mb: 1 }}>
              Why did risk change?
            </Typography>
            <Stack spacing={1.75} sx={{ flex: 1 }}>
              {ledger.length === 0 && (
                <Typography color="text.secondary" variant="body2">
                  No material movement on record yet.
                </Typography>
              )}
              {ledger.map((group, i) => (
                <Stack key={i} direction="row" spacing={1.25}>
                  <Typography
                    variant="body2"
                    sx={{ minWidth: 34, color: group.delta > 0 ? UP_COLOR : DOWN_COLOR }}
                  >
                    {group.delta > 0 ? "+" : "−"}
                    {Math.abs(Math.round(group.delta * 100))}
                  </Typography>
                  <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ lineHeight: 1.4 }}>
                      {group.national ? (
                        "All races · nationwide"
                      ) : (
                        <>
                          {group.districts.slice(0, 3).map((d, j) => (
                            <Box component="span" key={d.id}>
                              {j > 0 && ", "}
                              <Link component={RouterLink} to={`/races/${d.id}`}>
                                {d.id}
                              </Link>
                            </Box>
                          ))}
                          {group.districts.length > 3 &&
                            ` and ${group.districts.length - 3} more`}
                        </>
                      )}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {DAY_FORMAT.format(new Date(`${group.day}T00:00:00Z`))}
                      {group.eventTitle ? ` · ${group.eventTitle}` : " · signal decay and data refresh"}
                    </Typography>
                  </Stack>
                </Stack>
              ))}
            </Stack>
            <Link component={RouterLink} to="/changes" variant="body2" sx={{ mt: 1.5 }}>
              Full change ledger →
            </Link>
          </Paper>
        </Grid>

        <Grid size={12}>
          <Paper variant="outlined" sx={{ p: 2.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.5 }}>
              <Typography variant="overline" color="text.secondary">
                Highest intervention relevance
              </Typography>
              <Link component={RouterLink} to="/races" variant="body2">
                All 435 races →
              </Link>
            </Stack>
            <Grid container spacing={2}>
              {topRaces.map((race) => (
                <Grid key={race.id} size={{ xs: 12, sm: 6, md: 2.4 }}>
                  <Paper variant="outlined" sx={{ p: 1.75 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                      <Link component={RouterLink} to={`/races/${race.districtId}`} sx={{ fontSize: 15 }}>
                        {race.districtId}
                      </Link>
                      <Chip
                        size="small"
                        label={ratingLabel(race.rating)}
                        sx={{
                          bgcolor: race.rating ? RATING_COLORS[race.rating] : NO_RATING_COLOR,
                          color: "#0a0a0a",
                          fontWeight: 600,
                          fontSize: 11,
                        }}
                      />
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      relevance {Math.round((race.interventionRelevance ?? 0) * 100)}
                      {race.institutionalResistance != null &&
                        ` · resistance ${Math.round(race.institutionalResistance * 100)}`}
                      {race.activePressure != null &&
                        ` · pressure ${Math.round(race.activePressure * 100)}`}
                    </Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
