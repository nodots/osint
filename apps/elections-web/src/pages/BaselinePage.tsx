import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import Grid from "@mui/material/Grid2";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { RaceSummary, ThreatHistoryPoint } from "@elections-tracker/shared";
import { useEffect, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { fetchRaces, fetchThreatHistory } from "../api.js";
import { PageHeader } from "../components/PageHeader.js";
import baselines from "../data/baselines.json";

// The §43 backtest page: is 2026 normal? Baselines are immutable
// retrodictions shipped as a generated snapshot (see baseline-export in the
// worker); the 2026 series is live.

const ELECTION_DAY_2026 = new Date("2026-11-03T00:00:00Z").getTime();
const C2022 = "rgba(255,255,255,0.35)";
const C2024 = "#5590d2";
const C2026 = "#da654c";

interface Pt {
  dte: number;
  hrp: number;
}

function BaselineChart({
  live,
  matched,
}: {
  live: Pt[];
  matched: number | null;
}) {
  const width = 880;
  const height = 300;
  const padLeft = 50;
  const plotW = 810;
  const padTop = 30;
  const plotBottom = 240;
  const plotH = plotBottom - padTop;
  const maxDte = 105;
  const s2022 = baselines.cycles["2022"].series as Pt[];
  const s2024 = baselines.cycles["2024"].series as Pt[];
  const maxY =
    Math.max(10, ...live.map((p) => p.hrp), ...s2024.map((p) => p.hrp)) + 3;

  const x = (dte: number) => padLeft + ((maxDte - dte) / maxDte) * plotW;
  const y = (v: number) => plotBottom - (v / maxY) * plotH;
  const path = (pts: Pt[]) =>
    pts
      .filter((p) => p.dte <= maxDte)
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.dte).toFixed(1)},${y(p.hrp).toFixed(1)}`)
      .join(" ");

  const last = live[live.length - 1];
  const gridValues = [0, Math.round(maxY / 2 / 5) * 5, Math.round(maxY / 5) * 5 - 5].filter(
    (v, i, arr) => arr.indexOf(v) === i,
  );

  return (
    <Box sx={{ overflowX: "auto" }}>
      <svg width={width} height={height} role="img" aria-label="Three cycles compared by days until election day">
        {gridValues.map((v) => (
          <g key={v}>
            <line x1={padLeft} y1={y(v)} x2={padLeft + plotW} y2={y(v)}
              stroke={v === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.08)"} strokeWidth={1} />
            <text x={padLeft - 8} y={y(v) + 4} fill="rgba(255,255,255,0.45)" fontSize={11} textAnchor="end">{v}</text>
          </g>
        ))}
        <path d={path(s2022)} fill="none" stroke={C2022} strokeWidth={2} />
        <path d={path(s2024)} fill="none" stroke={C2024} strokeWidth={2} />
        <path d={path(live)} fill="none" stroke={C2026} strokeWidth={2.5} />
        {last && (
          <g>
            <circle cx={x(last.dte)} cy={y(last.hrp)} r={4} fill="#0a0a0a" stroke={C2026} strokeWidth={2} />
            <text x={x(last.dte) + 11} y={y(last.hrp) - 4} fill={C2026} fontSize={13}>
              2026 · {last.hrp} today, {last.dte} days out
            </text>
            {matched != null && (
              <g>
                <line x1={x(last.dte)} y1={y(last.hrp) + 8} x2={x(last.dte)} y2={y(matched) - 8}
                  stroke="rgba(218,101,76,0.3)" strokeWidth={1} strokeDasharray="3 3" />
                <circle cx={x(last.dte)} cy={y(matched)} r={4} fill="#0a0a0a" stroke={C2026} strokeWidth={2} strokeDasharray="2 2" />
                <text x={x(last.dte) + 11} y={y(matched) + 4} fill="rgba(255,255,255,0.65)" fontSize={12}>
                  {matched} · 2026 on matched sources
                </text>
              </g>
            )}
          </g>
        )}
        <text x={x(80)} y={y(0) - 12} fill="rgba(255,255,255,0.55)" fontSize={12}>
          2022 · zero the entire 100 days
        </text>
        <text x={x(22)} y={y(3) - 10} fill={C2024} fontSize={12}>
          2024 · 3, final 48 hours only
        </text>
        <text x={padLeft} y={height - 8} fill="rgba(255,255,255,0.45)" fontSize={11}>105 days out</text>
        <text x={x(50)} y={height - 8} fill="rgba(255,255,255,0.45)" fontSize={11} textAnchor="middle">50 days out</text>
        <text x={padLeft + plotW} y={height - 8} fill="rgba(255,255,255,0.45)" fontSize={11} textAnchor="end">election day</text>
        <g transform={`translate(${padLeft + plotW - 290},${padTop - 12})`}>
          <line x1={0} y1={0} x2={22} y2={0} stroke={C2022} strokeWidth={2} />
          <text x={28} y={4} fill="rgba(255,255,255,0.65)" fontSize={12}>2022</text>
          <line x1={70} y1={0} x2={92} y2={0} stroke={C2024} strokeWidth={2} />
          <text x={98} y={4} fill="rgba(255,255,255,0.65)" fontSize={12}>2024</text>
          <line x1={140} y1={0} x2={162} y2={0} stroke={C2026} strokeWidth={2.5} />
          <text x={168} y={4} fill="rgba(255,255,255,0.65)" fontSize={12}>2026</text>
        </g>
      </svg>
    </Box>
  );
}

function CompositionRow({
  label,
  values,
}: {
  label: string;
  values: [number, number, number];
}) {
  const colors = [C2022, C2024, C2026];
  return (
    <Stack direction="row" spacing={1.75} alignItems="center">
      <Typography variant="body2" color="text.secondary" sx={{ width: 180, flexShrink: 0 }}>
        {label}
      </Typography>
      <Stack spacing="3px" sx={{ flex: 1 }}>
        {values.map((v, i) => (
          <Stack key={i} direction="row" spacing={1} alignItems="center">
            <Box sx={{ height: 8, borderRadius: 1, bgcolor: colors[i], width: `${v}%` }} />
            <Typography variant="caption" color={i === 2 ? "text.primary" : "text.secondary"}>
              {v}
            </Typography>
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}

export function BaselinePage() {
  const [history, setHistory] = useState<ThreatHistoryPoint[] | null>(null);
  const [races, setRaces] = useState<RaceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetchThreatHistory(controller.signal), fetchRaces(controller.signal)])
      .then(([h, r]) => {
        setHistory(h);
        setRaces(r);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "failed to load");
        }
      });
    return () => controller.abort();
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!history) return <CircularProgress />;

  const live: Pt[] = history.map((p) => ({
    dte: Math.round((ELECTION_DAY_2026 - new Date(`${p.date}T00:00:00Z`).getTime()) / 86400000),
    hrp: p.highRiskPivotalRaces,
  }));
  const last = live[live.length - 1];
  const matched = baselines.matchedSources2026;

  const mean = (pick: (r: RaceSummary) => number | null) => {
    const vals = races.map(pick).filter((v): v is number => v != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) : 0;
  };
  const comp = (cycle: "2022" | "2024", key: string) =>
    (baselines.cycles[cycle].composition as Record<string, number>)[key] ?? 0;

  return (
    <Box sx={{ maxWidth: 1400 }}>
      <PageHeader
        title="Is 2026 normal? The backtest"
        meta={`identical pipeline replayed against 2022 and 2024 · baselines generated ${baselines.generatedAt} · methodology ${baselines.methodologyVersion} · indices are ordinal, not probabilities`}
      />

      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
            <Typography variant="overline" color="text.secondary">
              High-risk pivotal races by days until election day
            </Typography>
            <BaselineChart live={live} matched={matched} />
            <Typography variant="caption" color="text.secondary">
              the count the threat level is defined on (intervention relevance ≥ 12 and
              pivotality ≥ 10) · 2022/2024 are 100-day replays ending on their election
              days; 2026 is the live series so far
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Stack spacing={2.5} sx={{ height: "100%" }}>
            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Stack spacing={1.25}>
                <Typography variant="overline" color="text.secondary">
                  The finding
                </Typography>
                <Typography variant="body1" sx={{ lineHeight: 1.55 }}>
                  Run against ordinary cycles, this model stays quiet. At the same
                  distance from election day, on identical sources, no prior cycle had
                  reached the state 2026 is in now.
                </Typography>
                <Stack direction="row" spacing={3}>
                  <Stack>
                    <Typography variant="h4" sx={{ fontWeight: 300, color: C2022 }}>0</Typography>
                    <Typography variant="caption" color="text.secondary">2022</Typography>
                  </Stack>
                  <Stack>
                    <Typography variant="h4" sx={{ fontWeight: 300, color: C2024 }}>0</Typography>
                    <Typography variant="caption" color="text.secondary">2024</Typography>
                  </Stack>
                  <Stack>
                    <Typography variant="h4" sx={{ fontWeight: 300, color: C2026 }}>
                      {matched ?? "—"}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">2026 · matched sources</Typography>
                  </Stack>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                  The full 2026 model reads {last?.hrp ?? "—"}. The difference is the
                  state-legislation source, which has no historical counterpart — so
                  cross-cycle claims use the matched number.
                </Typography>
              </Stack>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2.5 }}>
              <Typography variant="overline" color="text.secondary">
                Not a volume artifact
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.55 }}>
                Past cycles produced{" "}
                <Box component="span" sx={{ color: "text.primary" }}>more</Box>{" "}
                voting litigation in absolute terms —{" "}
                {baselines.cycles["2022"].volumes.dockets} dockets and{" "}
                {baselines.cycles["2022"].volumes.blockingInjunctions} blocking
                injunctions in 2022. The 2026 elevation is compositional, not source
                growth.
              </Typography>
            </Paper>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 8 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
            <Typography variant="overline" color="text.secondary">
              What is different — mean signal, end of each series
            </Typography>
            <Stack spacing={1.75} sx={{ mt: 1.5 }}>
              <CompositionRow
                label="Litigation exposure"
                values={[comp("2022", "litigationExposure"), comp("2024", "litigationExposure"), mean((r) => r.litigationExposure)]}
              />
              <CompositionRow
                label="Active pressure"
                values={[comp("2022", "activePressure"), comp("2024", "activePressure"), mean((r) => r.activePressure)]}
              />
              <CompositionRow
                label="Institutional resistance"
                values={[comp("2022", "institutionalResistance"), comp("2024", "institutionalResistance"), mean((r) => r.institutionalResistance)]}
              />
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
              2026 carries more litigation exposure and more active exercise of
              mechanisms, with less judicial-resistance headroom, than either baseline
              reached by its election day. Rows: 2022 (gray), 2024 (blue), 2026 (warm,
              live).
            </Typography>
          </Paper>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Paper variant="outlined" sx={{ p: 2.5, height: "100%" }}>
            <Typography variant="overline" color="text.secondary">
              Read this honestly
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, lineHeight: 1.6 }}>
              Baselines are retrodictions: history recomputed under today&apos;s
              methodology from event occurrence dates, with current case status
              standing in for the status of record. State legislation cannot be
              replayed and is excluded from comparisons. State-court and county
              incidents are under-covered in every cycle.
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1.5 }}>
              <Link component={RouterLink} to="/methodology" variant="body2">
                Methodology and backtest summary →
              </Link>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
